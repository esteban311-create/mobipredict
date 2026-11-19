"""Repetición de días reales: el modelo predice hora a hora un día completo del periodo de prueba
(o del holdout más reciente) y se compara con lo que de verdad se midió una hora después.

Usa las particiones que deja el pipeline en data/processed/ (test y drift). Sus features salen del mismo
código que el entrenamiento (`features.construir_features`), así que la predicción es idéntica a la de
/predict con las mismas lecturas. Los modelos se ejecutan en cada petición; nada se precalcula.
"""
from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from mobipredict import config

log = logging.getLogger(__name__)

PARTICIONES = ("test", "drift")
DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def cargar(meta: dict) -> pd.DataFrame | None:
    """Lee las particiones test y drift con las columnas necesarias. None si no existen."""
    cols = list(dict.fromkeys(["timestamp", "tramo_id", "particion", "velocidad_kmh", "ratio_vel", "lluvia_mm",
                               "es_festivo", "perfil_velocidad", "longitud_km", "y_velocidad_1h",
                               "y_colapso_1h", *meta["features"]]))
    partes = []
    for p in PARTICIONES:
        f = config.DATA_PROCESSED / f"{p}.parquet"
        if f.exists():
            partes.append(pd.read_parquet(f, columns=cols))
    if not partes:
        log.warning("Sin particiones en %s: /dias y /replay no estarán disponibles", config.DATA_PROCESSED)
        return None
    d = pd.concat(partes, ignore_index=True)
    d["fecha"] = d["timestamp"].dt.date
    d["colapso_actual"] = d["ratio_vel"] < float(meta["umbral_colapso_ratio_vel"])
    d["y_colapso_1h"] = d["y_colapso_1h"].astype(bool)
    d["colapso_sin_aviso"] = d["y_colapso_1h"] & ~d["colapso_actual"]
    return d.sort_values(["timestamp", "tramo_id"]).reset_index(drop=True)


def catalogo(d: pd.DataFrame) -> list[dict]:
    """Un registro por día con datos reales (sin ejecutar el modelo): sirve para elegir qué día repetir."""
    lluvia_dia = d.drop_duplicates("timestamp").groupby("fecha")["lluvia_mm"].sum()
    g = d.groupby("fecha").agg(periodo=("particion", "first"), tramos=("tramo_id", "nunique"),
                               horas=("timestamp", "nunique"), festivo=("es_festivo", "max"),
                               colapsos_reales=("y_colapso_1h", "sum"),
                               colapsos_sin_aviso=("colapso_sin_aviso", "sum"))
    g["lluvia_mm"] = lluvia_dia
    return [{"fecha": f.isoformat(), "periodo": r.periodo, "dia_semana": DIAS_SEMANA[f.weekday()],
             "festivo": bool(r.festivo), "tramos": int(r.tramos), "horas": int(r.horas),
             "colapsos_reales": int(r.colapsos_reales), "colapsos_sin_aviso": int(r.colapsos_sin_aviso),
             "lluvia_mm": round(float(r.lluvia_mm), 1)}
            for f, r in g.iterrows()]


def _nivel(prob: np.ndarray, umbral: float) -> np.ndarray:
    return np.where(prob >= umbral, "colapso", np.where(prob >= umbral * 0.6, "precaucion", "normal"))


def _r(x: float, nd: int = 2) -> float | None:
    return None if pd.isna(x) else round(float(x), nd)


def _predecir_filas(filas: pd.DataFrame, estado: dict) -> pd.DataFrame:
    """Ejecuta los dos modelos sobre las filas y agrega predicción, alerta, tiempos de viaje y aciertos."""
    meta = estado["meta"]
    umbral = float(meta["modelo_colapso"]["umbral_decision"])
    X = filas[meta["features"]]
    vel = np.maximum(estado["modelo_velocidad"].predict(X), 1.0)
    prob = estado["modelo_colapso"].predict_proba(X)[:, 1]
    f = filas.assign(vel_pred=vel, prob=prob, alerta=prob >= umbral, nivel=_nivel(prob, umbral))
    return f.assign(tt_pred=f["longitud_km"] / f["vel_pred"] * 60,
                    tt_real=f["longitud_km"] / f["y_velocidad_1h"] * 60,
                    tt_perfil=f["longitud_km"] / f["perfil_velocidad"] * 60,
                    acierto=f["alerta"] & f["y_colapso_1h"],
                    anticipado=f["alerta"] & f["colapso_sin_aviso"])


def valor(d: pd.DataFrame, estado: dict) -> dict:
    """Cifras de valor sobre todo el periodo de prueba (datos que el modelo no vio al entrenar)."""
    t = _predecir_filas(d[d["particion"] == "test"], estado)
    res = _resumen(t)
    return {"periodo": "test", "desde": t["timestamp"].min().isoformat(), "hasta": t["timestamp"].max().isoformat(),
            "dias": int(t["fecha"].nunique()), "horizonte_min": int(estado["meta"]["horizonte_min"]),
            "pct_colapsos_sin_aviso": round(res["colapsos_sin_aviso"] / res["colapsos_reales"], 4)
            if res["colapsos_reales"] else None,
            "alertas_por_dia": round(res["alertas"] / t["fecha"].nunique(), 1), **res}


def repetir_dia(d: pd.DataFrame, fecha, estado: dict) -> dict | None:
    """Predice cada tramo-hora del día y lo compara con la medición real de la hora siguiente."""
    dia = d[d["fecha"] == fecha]
    if dia.empty:
        return None
    meta, store = estado["meta"], estado["store"]
    umbral = float(meta["modelo_colapso"]["umbral_decision"])
    horizonte = pd.Timedelta(minutes=meta["horizonte_min"])
    dia = _predecir_filas(dia, estado)

    info = store["tramos"].set_index("tramo_id")
    tramos = []
    for tid, s in dia.groupby("tramo_id", sort=True):
        t = info.loc[tid]
        tramos.append({
            "tramo_id": tid, "corredor": str(t["corredor"]), "sentido": str(t["sentido"]),
            "inicio": str(t["inicio"]), "fin": str(t["fin"]), "lat": _r(t["lat"], 5), "lon": _r(t["lon"], 5),
            "longitud_km": _r(t["longitud_km"]), "vel_referencia_kmh": _r(t["vel_referencia_kmh"], 1),
            "serie": [{
                "timestamp": r.timestamp.isoformat(), "timestamp_prediccion": (r.timestamp + horizonte).isoformat(),
                "hora": int(r.timestamp.hour), "velocidad_actual_kmh": _r(r.velocidad_kmh),
                "lluvia_mm": _r(r.lluvia_mm), "colapso_actual": bool(r.colapso_actual),
                "velocidad_predicha_kmh": _r(r.vel_pred), "tiempo_viaje_predicho_min": _r(r.tt_pred),
                "probabilidad_colapso": _r(r.prob, 4), "nivel": str(r.nivel), "alerta": bool(r.alerta),
                "velocidad_real_kmh": _r(r.y_velocidad_1h), "tiempo_viaje_real_min": _r(r.tt_real),
                "tiempo_viaje_perfil_min": _r(r.tt_perfil),
                "colapso_real": bool(r.y_colapso_1h), "colapso_sin_aviso": bool(r.colapso_sin_aviso),
                "anticipado": bool(r.anticipado),
            } for r in s.itertuples()],
        })

    por_hora = dia.groupby(dia["timestamp"].dt.hour).agg(
        alertas=("alerta", "sum"), colapsos_reales=("y_colapso_1h", "sum"), aciertos=("acierto", "sum"),
        colapsos_sin_aviso=("colapso_sin_aviso", "sum"), anticipados=("anticipado", "sum"),
        lluvia_mm=("lluvia_mm", "first"))
    return {
        "fecha": fecha.isoformat(), "periodo": str(dia["particion"].iloc[0]),
        "dia_semana": DIAS_SEMANA[fecha.weekday()], "festivo": bool(dia["es_festivo"].max()),
        "horizonte_min": int(meta["horizonte_min"]), "umbral_decision": umbral,
        "umbral_colapso_ratio_vel": float(meta["umbral_colapso_ratio_vel"]),
        "modelo_velocidad": meta["modelo_velocidad"]["nombre"], "modelo_colapso": meta["modelo_colapso"]["nombre"],
        "resumen": _resumen(dia),
        "por_hora": [{"hora": int(h), **{k: (round(float(v), 1) if k == "lluvia_mm" else int(v))
                                          for k, v in r.items()}} for h, r in por_hora.iterrows()],
        "tramos": tramos,
    }


def _resumen(dia: pd.DataFrame) -> dict:
    y, alerta, ahora = dia["y_colapso_1h"], dia["alerta"], dia["colapso_actual"]
    n_col, n_alert, n_sin = int(y.sum()), int(alerta.sum()), int(dia["colapso_sin_aviso"].sum())
    det, det_reac = int((alerta & y).sum()), int((ahora & y).sum())

    def pct(a: int, b: int) -> float | None:
        return round(a / b, 4) if b else None

    return {
        "lecturas": int(len(dia)), "tramos": int(dia["tramo_id"].nunique()),
        "colapsos_reales": n_col, "alertas": n_alert, "detectados": det, "falsas_alarmas": n_alert - det,
        "recall": pct(det, n_col), "precision": pct(det, n_alert),
        "colapsos_sin_aviso": n_sin, "anticipados": int(dia["anticipado"].sum()),
        "pct_anticipados": pct(int(dia["anticipado"].sum()), n_sin),
        # Regla reactiva (cómo se opera hoy): "habrá colapso en t+1 si hay colapso ahora"
        "regla_reactiva": {"alertas": int(ahora.sum()), "detectados": det_reac,
                           "recall": pct(det_reac, n_col), "precision": pct(det_reac, int(ahora.sum()))},
        "mae_velocidad_kmh": _r((dia["vel_pred"] - dia["y_velocidad_1h"]).abs().mean()),
        "mae_tiempo_viaje_min": _r((dia["tt_pred"] - dia["tt_real"]).abs().mean()),
        "mae_tiempo_viaje_perfil_min": _r((dia["tt_perfil"] - dia["tt_real"]).abs().mean()),
    }
