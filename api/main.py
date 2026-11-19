"""API de predicción de MobiPredict (FastAPI).

Endpoints:
  GET  /                  redirige al frontend web (/app/)
  GET  /health            estado del servicio y de los modelos cargados
  GET  /tramos            catálogo de corredores disponibles (con coordenadas)
  GET  /dias              días reales disponibles para repetir (prueba y holdout) con su resumen
  GET  /replay/{fecha}    el modelo predice hora a hora un día real y se compara con lo medido
  GET  /valor             cifras de valor en todo el periodo de prueba (colapsos anticipados, etc.)
  GET  /escenarios        momentos reales del periodo de prueba (para el frontend)
  GET  /escenarios/{id}   lecturas de todos los tramos en ese momento + lo que pasó en la hora siguiente
  GET  /modelos           modelos ganadores y comparación de todos los candidatos
  GET  /reentrenamiento   antes/después del salto a sensores ARS (2019–2026)
  POST /predict           velocidad a 1 hora + probabilidad y alerta de colapso para un tramo
  POST /predict/batch     varias peticiones en una sola llamada
  GET  /envivo            riesgo de colapso en la próxima hora con tráfico en tiempo real (TomTom, HERE, Google)
  POST /envivo/recolectar consulta ya a los proveedores en vivo (respeta cupos diarios)
  POST /envivo/ruta       rutas de origen a destino (Google Maps) con el riesgo de colapso de cada una

Arranque local:  uvicorn api.main:app --reload --port 8000
Frontend:        http://localhost:8000/
Documentación interactiva: http://localhost:8000/docs
"""
from __future__ import annotations

import json
import os
import sys
import time
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from mobipredict import config, envivo, rutas  # noqa: E402
from mobipredict.features import features_inferencia  # noqa: E402

from . import replay  # noqa: E402
from .schemas import (HealthResponse, PredictBatchRequest, PredictBatchResponse,  # noqa: E402
                      PredictRequest, PredictResponse)

ESTADO: dict = {"cargado": False}


def cargar_modelos() -> None:
    """Carga el modelo ganador de cada tarea, el feature store y la metadata."""
    faltan = [p for p in [config.MODEL_SPEED_FILE, config.MODEL_COLLAPSE_FILE,
                          config.FEATURE_STORE_FILE, config.METADATA_FILE] if not p.exists()]
    if faltan:
        ESTADO.update(cargado=False, error=f"Faltan artefactos: {[p.name for p in faltan]}. "
                                           "Ejecute `python run_pipeline.py` primero.")
        return
    ESTADO.update(
        cargado=True, error=None,
        modelo_velocidad=joblib.load(config.MODEL_SPEED_FILE),
        modelo_colapso=joblib.load(config.MODEL_COLLAPSE_FILE),
        store=joblib.load(config.FEATURE_STORE_FILE),
        meta=json.loads(config.METADATA_FILE.read_text(encoding="utf-8")),
        escenarios=(json.loads(config.ESCENARIOS_FILE.read_text(encoding="utf-8"))
                    if config.ESCENARIOS_FILE.exists() else []),
        comparacion=(pd.read_csv(config.COMPARISON_FILE) if config.COMPARISON_FILE.exists() else None),
        cargado_en=time.strftime("%Y-%m-%dT%H:%M:%S"),
    )
    ESTADO["replay"] = replay.cargar(ESTADO["meta"])
    ESTADO["cache_replay"] = {}
    ESTADO["valor"] = None
    ESTADO["dias"] = replay.catalogo(ESTADO["replay"]) if ESTADO["replay"] is not None else []
    ESTADO["store_envivo"] = {}


def _tramos_envivo() -> list[dict]:
    t = ESTADO["store"]["tramos"].dropna(subset=["lat", "lon"])
    return envivo.aplicar_puntos(t[["tramo_id", "corredor", "sentido", "lat", "lon"]].to_dict(orient="records"))


def _recolector_automatico() -> bool:
    """MOBIPREDICT_ENVIVO_AUTO: 1 = siempre, 0 = nunca, auto (por defecto) = si hay al menos una clave."""
    modo = os.getenv("MOBIPREDICT_ENVIVO_AUTO", "auto").lower()
    return modo in ("1", "true", "si") or (modo == "auto" and envivo.hay_claves())


@asynccontextmanager
async def lifespan(_: FastAPI):
    cargar_modelos()
    rec = None
    if ESTADO.get("cargado") and _recolector_automatico():
        rec = envivo.Recolector(_tramos_envivo)
        rec.iniciar()
    ESTADO["recolector"] = rec
    yield
    if rec:
        rec.detener()


app = FastAPI(
    title="MobiPredict API",
    description="Pronóstico de velocidad por corredor y alertas tempranas de colapso en Medellín "
                "(modelos entrenados con datos abiertos del SIMM, la EOD 2025 y Open-Meteo).",
    version="1.0.0",
    lifespan=lifespan,
)

# Frontend web y figuras del EDA (archivos estáticos servidos por la misma API)
if config.FRONTEND_DIR.exists():
    app.mount("/app", StaticFiles(directory=config.FRONTEND_DIR, html=True), name="frontend")
config.EDA_FIGURES.mkdir(parents=True, exist_ok=True)
app.mount("/figuras", StaticFiles(directory=config.EDA_FIGURES), name="figuras")


@app.get("/", include_in_schema=False)
def inicio() -> RedirectResponse:
    return RedirectResponse(url="/app/" if config.FRONTEND_DIR.exists() else "/docs")


def _requiere_modelos() -> None:
    if not ESTADO.get("cargado"):
        raise HTTPException(status_code=503, detail=ESTADO.get("error", "Modelos no cargados"))


def _nivel(prob: float, umbral: float) -> str:
    if prob >= umbral:
        return "colapso"
    if prob >= umbral * 0.6:
        return "precaucion"
    return "normal"


def _predecir(req: PredictRequest, store: dict | None = None) -> PredictResponse:
    store, meta = store or ESTADO["store"], ESTADO["meta"]
    obs = [o.model_dump() for o in sorted(req.observaciones, key=lambda o: o.timestamp)]
    try:
        X = features_inferencia(req.tramo_id, obs, store)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    vel = max(float(ESTADO["modelo_velocidad"].predict(X)[0]), 1.0)
    prob = float(ESTADO["modelo_colapso"].predict_proba(X)[:, 1][0])
    umbral = float(meta["modelo_colapso"]["umbral_decision"])
    tramo = store["tramos"].set_index("tramo_id").loc[req.tramo_id]
    t_pred = pd.Timestamp(obs[-1]["timestamp"]).floor("h") + pd.Timedelta(minutes=meta["horizonte_min"])
    return PredictResponse(
        tramo_id=req.tramo_id,
        corredor=str(tramo["corredor"]),
        sentido=str(tramo["sentido"]),
        timestamp_prediccion=t_pred.to_pydatetime(),
        horizonte_min=meta["horizonte_min"],
        velocidad_predicha_kmh=round(vel, 2),
        tiempo_viaje_predicho_min=round(float(tramo["longitud_km"]) / vel * 60, 2),
        velocidad_referencia_kmh=round(float(tramo["vel_referencia_kmh"]), 1),
        probabilidad_colapso=round(prob, 4),
        alerta_colapso=prob >= umbral,
        nivel=_nivel(prob, umbral),
        umbral_decision=umbral,
        modelo_velocidad=meta["modelo_velocidad"]["nombre"],
        modelo_colapso=meta["modelo_colapso"]["nombre"],
    )


@app.get("/health", response_model=HealthResponse, tags=["estado"])
def health() -> HealthResponse:
    meta = ESTADO.get("meta", {})
    return HealthResponse(
        status="ok" if ESTADO.get("cargado") else "degradado",
        modelos_cargados=bool(ESTADO.get("cargado")),
        modelo_velocidad=meta.get("modelo_velocidad", {}).get("nombre"),
        modelo_colapso=meta.get("modelo_colapso", {}).get("nombre"),
        horizonte_min=meta.get("horizonte_min"),
        entrenado_utc=meta.get("generado_utc"),
        detalle=ESTADO.get("error"),
    )


@app.get("/tramos", tags=["catalogo"])
def tramos() -> list[dict]:
    _requiere_modelos()
    cols = ["tramo_id", "corredor", "sentido", "inicio", "fin", "longitud_km", "flujo_tipo", "macrozona",
            "vel_referencia_kmh", "lat", "lon"]
    t = ESTADO["store"]["tramos"][cols].copy()
    return t.astype(object).where(t.notna(), None).to_dict(orient="records")


@app.post("/predict", response_model=PredictResponse, tags=["prediccion"])
def predict(req: PredictRequest) -> PredictResponse:
    _requiere_modelos()
    return _predecir(req)


@app.post("/predict/batch", response_model=PredictBatchResponse, tags=["prediccion"])
def predict_batch(req: PredictBatchRequest) -> PredictBatchResponse:
    _requiere_modelos()
    preds = [_predecir(r) for r in req.peticiones]
    return PredictBatchResponse(predicciones=preds, alertas=sum(p.alerta_colapso for p in preds))


@app.get("/escenarios", tags=["frontend"])
def escenarios() -> list[dict]:
    """Momentos reales del periodo de prueba (y uno del holdout) disponibles para simular."""
    _requiere_modelos()
    return [{k: e[k] for k in ["id", "nombre", "timestamp", "timestamp_prediccion", "periodo"]}
            | {"tramos": len(e["tramos"]), "colapsos_reales": sum(t["colapso_real"] for t in e["tramos"])}
            for e in ESTADO["escenarios"]]


@app.get("/escenarios/{escenario_id}", tags=["frontend"])
def escenario(escenario_id: str) -> dict:
    """Lecturas reales de cada tramo hasta la hora t y la velocidad medida en t + 1 h."""
    _requiere_modelos()
    for e in ESTADO["escenarios"]:
        if e["id"] == escenario_id:
            return e
    raise HTTPException(status_code=404, detail=f"Escenario desconocido: {escenario_id}")


def _requiere_replay() -> None:
    _requiere_modelos()
    if ESTADO.get("replay") is None:
        raise HTTPException(status_code=503, detail="Faltan data/processed/test.parquet y drift.parquet. "
                                                    "Ejecute `python run_pipeline.py` primero.")


@app.get("/dias", tags=["frontend"])
def dias(periodo: str | None = None) -> list[dict]:
    """Días reales que se pueden repetir hora a hora, con colapsos reales, colapsos sin aviso y lluvia.

    `periodo`: `test` (periodo de prueba; con ARS, el año 2025) o `drift` (holdout más reciente; con ARS,
    ene a sep-2026). Las fechas exactas están en GET /modelos (`cortes`).
    """
    _requiere_replay()
    if periodo is not None and periodo not in replay.PARTICIONES:
        raise HTTPException(status_code=422, detail=f"periodo debe ser uno de {list(replay.PARTICIONES)}")
    return [d for d in ESTADO["dias"] if periodo is None or d["periodo"] == periodo]


@app.get("/valor", tags=["frontend"])
def valor() -> dict:
    """Cifras de valor en todo el periodo de prueba: colapsos sin aviso, cuántos anticipa el modelo,
    comparación con la regla reactiva y error del tiempo de viaje. Se calcula con el modelo en la primera
    llamada y se guarda hasta el siguiente /admin/reload."""
    _requiere_replay()
    if ESTADO.get("valor") is None:
        ESTADO["valor"] = replay.valor(ESTADO["replay"], ESTADO)
    return ESTADO["valor"]


@app.get("/replay/{fecha}", tags=["frontend"])
def replay_dia(fecha: date) -> dict:
    """Repite un día real: para cada tramo y cada hora (6 a 19 h) el modelo predice la hora siguiente y se
    compara con la velocidad medida. Incluye un resumen del día frente a la regla reactiva actual y totales
    por hora (alertas, colapsos reales, colapsos anticipados)."""
    _requiere_replay()
    cache = ESTADO.setdefault("cache_replay", {})   # se vacía en cargar_modelos (tras reentrenar)
    if fecha not in cache:
        cache[fecha] = replay.repetir_dia(ESTADO["replay"], fecha, ESTADO)
    out = cache[fecha]
    if out is None:
        raise HTTPException(status_code=404, detail=f"Sin datos para {fecha}. Ver GET /dias")
    return out


@app.get("/modelos", tags=["frontend"])
def modelos() -> dict:
    """Modelos ganadores, reglas de decisión y métricas de todos los candidatos."""
    _requiere_modelos()
    meta = ESTADO["meta"]
    filas = []
    comp = ESTADO.get("comparacion")
    if comp is not None:
        cols = [c for c in comp.columns if c not in ("params", "run_id")]
        filas = json.loads(comp[cols].to_json(orient="records"))   # NaN -> null, tipos nativos
    return {"generado_utc": meta.get("generado_utc"), "horizonte_min": meta.get("horizonte_min"),
            "umbral_colapso_ratio_vel": meta.get("umbral_colapso_ratio_vel"),
            "modelo_velocidad": meta.get("modelo_velocidad"), "modelo_colapso": meta.get("modelo_colapso"),
            "n_features": len(meta.get("features", [])), "comparacion": filas,
            "filas": meta.get("filas"), "tasa_colapso": meta.get("tasa_colapso"),
            "cortes": meta.get("cortes"), "fuente_sensores": meta.get("fuente_sensores"),
            "reentrenado_utc": meta.get("reentrenado_utc"),
            "figuras": sorted(p.name for p in config.EDA_FIGURES.glob("*.png"))}


def _resumen_modelo(meta: dict) -> dict:
    v, c = meta.get("modelo_velocidad") or {}, meta.get("modelo_colapso") or {}
    return {
        "modelo_velocidad": v.get("nombre"),
        "modelo_colapso": c.get("nombre"),
        "mae_kmh": v.get("test_mae_kmh"),
        "wape": v.get("test_wape"),
        "pr_auc": c.get("test_pr_auc"),
        "recall": c.get("test_recall"),
        "precision": c.get("test_precision"),
        "filas": meta.get("filas"),
        "tasa_colapso": meta.get("tasa_colapso"),
        "fuente_sensores": meta.get("fuente_sensores"),
        "cortes": meta.get("cortes"),
        "reentrenado_utc": meta.get("reentrenado_utc") or meta.get("generado_utc"),
    }


@app.get("/reentrenamiento", tags=["frontend"])
def reentrenamiento() -> dict:
    """Compara el campeón anterior (GT 2017-2020) con el actual (ARS 2019-2026)."""
    _requiere_modelos()
    actual = ESTADO["meta"]
    antes_path = config.MODELS_DIR / "metadata_antes_ars.json"
    antes = json.loads(antes_path.read_text(encoding="utf-8")) if antes_path.exists() else None
    return {
        "actual": _resumen_modelo(actual),
        "antes": _resumen_modelo(antes) if antes else None,
        "narrativa": {
            "titulo": "De sensores GT a cámaras ARS",
            "antes_etiqueta": "GT / SIMM · hasta 2020",
            "actual_etiqueta": "ARS / CCTV · 2019 → 2026",
            "puntos": [
                "La serie horaria ahora sale de cámaras ARS/CCTV del Observatorio de Movilidad.",
                "El periodo de prueba cubre 2025; el holdout es 2026 (no pandemia).",
                "Los campeones actuales son red neuronal (MLP) para velocidad y LightGBM para colapso.",
            ],
        },
    }


def _store_con_festivos(anio: int) -> dict:
    """Feature store con los festivos de Colombia del año en curso (por si no estaban en los datos)."""
    cache = ESTADO.setdefault("store_envivo", {})
    if anio not in cache:
        import holidays
        fest = set(ESTADO["store"]["festivos"]) | {pd.Timestamp(d) for d in holidays.Colombia(years=anio)}
        cache[anio] = {**ESTADO["store"], "festivos": fest}
    return cache[anio]


@app.get("/envivo", tags=["tiempo real"])
def envivo_estado() -> dict:
    """Riesgo de colapso en la próxima hora con tráfico en tiempo real.

    Usa las lecturas guardadas por el recolector (TomTom, HERE, Google Routes y lluvia de Open-Meteo). Las
    velocidades de cada proveedor se pasan a la escala de los sensores del SIMM con su índice de congestión
    (velocidad actual / flujo libre). El modelo necesita 4 horas seguidas de lecturas por tramo: mientras
    tanto el tramo aparece como `recolectando`."""
    _requiere_modelos()
    return _calcular_envivo()


def _calcular_envivo() -> dict:
    ahora = envivo.ahora_local()
    hora = pd.Timestamp(ahora).floor("h")
    with envivo.abrir() as con:
        desde = (hora - pd.Timedelta(hours=12)).to_pydatetime()
        serie = envivo.serie_horaria(con, desde)
        lluvia = envivo.lluvia_por_hora(con, desde)
        proveedores = envivo.estado_proveedores(con, ahora)
    tr = ESTADO["store"]["tramos"]
    vref = dict(zip(tr["tramo_id"], tr["vel_referencia_kmh"]))
    hist = envivo.historial(serie, lluvia, vref, ahora)
    store = _store_con_festivos(ahora.year)
    umbral_ratio = float(ESTADO["meta"].get("umbral_colapso_ratio_vel", config.COLLAPSE_SPEED_RATIO))
    filas = []
    for tid in tr["tramo_id"]:
        h = hist.get(tid)
        fila: dict = {"tramo_id": tid, "estado": "sin_datos", "horas_historia": 0,
                      "horas_necesarias": config.MIN_HISTORY}
        if h:
            fila.update(horas_historia=h["horas"], ultima_hora=h["ultima_hora"].isoformat(),
                        proveedores=h["proveedores"], n_lecturas=h["n_lecturas"],
                        sentido_verificado=h["sentido_verificado"],
                        indice_congestion=round(h["ratio_actual"], 3),
                        velocidad_proveedor_kmh=round(h["velocidad_proveedor_kmh"], 1),
                        velocidad_actual_kmh=h["observaciones"][-1]["velocidad_kmh"],
                        colapso_actual=h["ratio_actual"] < umbral_ratio)
            if not h["fresco"]:
                fila["estado"] = "desactualizado"
            elif h["horas"] < config.MIN_HISTORY:
                fila["estado"] = "recolectando"
            else:
                p = _predecir(PredictRequest(tramo_id=tid, observaciones=h["observaciones"]), store)
                fila.update(estado="ok", velocidad_predicha_kmh=p.velocidad_predicha_kmh,
                            tiempo_viaje_predicho_min=p.tiempo_viaje_predicho_min,
                            probabilidad_colapso=p.probabilidad_colapso, alerta=p.alerta_colapso, nivel=p.nivel,
                            timestamp_prediccion=p.timestamp_prediccion.isoformat())
        filas.append(fila)
    listos = [f for f in filas if f["estado"] == "ok"]
    rec = ESTADO.get("recolector")
    return {
        "hora_local": ahora.isoformat(),
        "prediccion_para": (hora + pd.Timedelta(hours=1)).isoformat(),
        "en_horario": config.ENVIVO_HORA_INICIO <= ahora.hour < config.ENVIVO_HORA_FIN,
        "horario": [config.ENVIVO_HORA_INICIO, config.ENVIVO_HORA_FIN],
        "lluvia_mm": lluvia.get(hora, 0.0),
        "lluvia_proxima_hora_mm": lluvia.get(hora + pd.Timedelta(hours=1), 0.0),
        "recolector_activo": bool(rec and rec.activo),
        "proveedores": proveedores,
        "umbral_decision": float(ESTADO["meta"]["modelo_colapso"]["umbral_decision"]),
        "resumen": {"tramos": len(filas), "listos": len(listos),
                    "recolectando": sum(f["estado"] == "recolectando" for f in filas),
                    "alertas": sum(f["alerta"] for f in listos),
                    "avisos_tempranos": sum(f["alerta"] and not f["colapso_actual"] for f in listos)},
        "tramos": filas,
        "advertencia": "El modelo se entrenó con cámaras ARS/CCTV del SIMM (2019-2026). Las velocidades de "
                       "TomTom, HERE y Google se ajustan a esa escala con su índice de congestión; es una "
                       "aproximación que no se ha validado contra mediciones ARS en vivo.",
    }


@app.post("/envivo/recolectar", tags=["tiempo real"])
def envivo_recolectar() -> dict:
    """Consulta ya a todos los proveedores con clave (ignora horario e intervalos, respeta cupos y pausas)."""
    _requiere_modelos()
    return envivo.recolectar(_tramos_envivo(), forzar=True)


class RutaRequest(BaseModel):
    origen: str = Field(..., min_length=2, max_length=200, examples=["Universidad de Antioquia"])
    destino: str = Field(..., min_length=2, max_length=200, examples=["Parque Lleras"])


@app.post("/envivo/ruta", tags=["tiempo real"])
def envivo_ruta(req: RutaRequest) -> dict:
    """Hasta 3 rutas en carro (Google Maps, con el tráfico actual) y, para cada una, las vías vigiladas por las
    que pasa con su riesgo de colapso en la próxima hora. Recomienda la de menor riesgo; si empatan, la más
    rápida. El origen y el destino pueden ser direcciones, lugares o coordenadas `lat,lon`."""
    _requiere_modelos()
    vivo = _calcular_envivo()
    estado = {f["tramo_id"]: f for f in vivo["tramos"]}
    try:
        out = rutas.buscar(req.origen, req.destino, _tramos_envivo(), estado)
    except rutas.ErrorRuta as e:
        raise HTTPException(status_code=e.codigo, detail=str(e)) from e
    return out | {"hora_local": vivo["hora_local"], "prediccion_para": vivo["prediccion_para"]}


@app.post("/admin/reload", tags=["estado"])
def reload() -> dict:
    """Recarga los modelos desde disco (tras un reentrenamiento)."""
    cargar_modelos()
    return {"recargado": ESTADO.get("cargado"), "detalle": ESTADO.get("error")}
