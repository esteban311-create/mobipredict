"""Pruebas del módulo de tiempo real con respuestas simuladas (no consultan internet ni gastan cuota)."""
from datetime import datetime, timedelta

import httpx
import pytest

from mobipredict import config, envivo

TRAMO_SN = {"tramo_id": "AUTOPISTA_NORTE_SN", "sentido": "SN", "lat": 6.28897, "lon": -75.56805}
TRAMO_NS = {"tramo_id": "AUTOPISTA_NORTE_NS", "sentido": "NS", "lat": 6.28897, "lon": -75.56805}
AHORA = datetime(2026, 11, 9, 8, 20)     # lunes, 8:20 a. m.


@pytest.fixture(autouse=True)
def entorno(tmp_path, monkeypatch):
    """Base de datos temporal, sin .env real y con claves de prueba."""
    monkeypatch.setattr(config, "ENVIVO_DB", tmp_path / "envivo.sqlite")
    monkeypatch.setattr(config, "ENV_FILE", tmp_path / "no-existe.env")
    monkeypatch.setattr(config, "ENVIVO_HORA_INICIO", 5)       # horario por defecto, sin importar el .env
    monkeypatch.setattr(config, "ENVIVO_HORA_FIN", 21)
    for p in envivo.PROVEEDORES:
        monkeypatch.delenv(p.clave_env, raising=False)
        monkeypatch.delenv(f"MOBIPREDICT_CUPO_{p.nombre.upper()}", raising=False)
    return tmp_path


def _tomtom(req: httpx.Request, vel=30.0, libre=60.0, norte=True):
    lat0, lat1 = (6.28, 6.29) if norte else (6.29, 6.28)
    return httpx.Response(200, json={"flowSegmentData": {
        "frc": "FRC1", "currentSpeed": vel, "freeFlowSpeed": libre, "currentTravelTime": 120,
        "freeFlowTravelTime": 60, "confidence": 0.9, "roadClosure": False,
        "coordinates": {"coordinate": [{"latitude": lat0, "longitude": -75.568},
                                       {"latitude": lat1, "longitude": -75.568}]}}})


def _here(req: httpx.Request):
    def seg(v, vl, lat0, lat1, via):
        return {"location": {"description": via, "length": 300,
                             "shape": {"links": [{"points": [{"lat": lat0, "lng": -75.568},
                                                             {"lat": lat1, "lng": -75.568}]}]}},
                "currentFlow": {"speed": v, "freeFlow": vl, "jamFactor": 4.0, "confidence": 0.8}}
    # Un segmento hacia el norte (10 m/s de 20) y otro hacia el sur (19 de 20): solo cuenta el del sentido SN
    return httpx.Response(200, json={"results": [seg(10.0, 20.0, 6.28, 6.29, "Autopista Norte"),
                                                 seg(19.0, 20.0, 6.29, 6.28, "Autopista Norte")]})


def _google(req: httpx.Request):
    assert req.headers["X-Goog-Api-Key"] == "clave-google"
    return httpx.Response(200, json={"routes": [{"distanceMeters": 1000, "duration": "120s",
                                                 "staticDuration": "60s"}]})


def _meteo(req: httpx.Request):
    horas = [f"2026-11-09T{h:02d}:00" for h in range(24)]
    return httpx.Response(200, json={"hourly": {"time": horas, "precipitation": [0.0] * 8 + [2.5] + [0.0] * 15}})


def _cliente(manejadores: dict) -> httpx.Client:
    def enrutar(req: httpx.Request):
        for dominio, fn in manejadores.items():
            if dominio in req.url.host:
                return fn(req)
        return httpx.Response(404)
    return httpx.Client(transport=httpx.MockTransport(enrutar))


def test_geometria():
    assert envivo.dif_angulo(350, 10) == 20
    assert abs(envivo.rumbo(6.0, -75.0, 6.1, -75.0)) < 1e-6                    # hacia el norte = 0°
    lat, lon = envivo.punto_carril(TRAMO_SN)                                   # a la derecha de ir al norte = este
    assert lon > TRAMO_SN["lon"] and abs(lat - TRAMO_SN["lat"]) < 1e-9


def test_tomtom_verifica_sentido():
    with _cliente({"tomtom": _tomtom}) as c:
        a = envivo.consultar_tomtom(c, TRAMO_SN, "k")
        b = envivo.consultar_tomtom(c, TRAMO_NS, "k")
    assert a.velocidad_kmh == 30 and a.velocidad_libre_kmh == 60 and a.coincide_sentido is True
    assert b.coincide_sentido is False                       # el segmento va al norte, el tramo al sur


def test_here_usa_solo_el_sentido_correcto():
    with _cliente({"hereapi": _here}) as c:
        lec = envivo.consultar_here(c, TRAMO_SN, "k")
    assert lec.coincide_sentido is True
    assert lec.velocidad_kmh == pytest.approx(36.0) and lec.velocidad_libre_kmh == pytest.approx(72.0)


def test_google_convierte_duraciones():
    with _cliente({"googleapis": _google}) as c:
        lec = envivo.consultar_google(c, TRAMO_SN, "clave-google")
    assert lec.velocidad_kmh == pytest.approx(30.0) and lec.velocidad_libre_kmh == pytest.approx(60.0)


def test_recolectar_guarda_lecturas_y_lluvia(monkeypatch):
    monkeypatch.setenv("TOMTOM_API_KEY", "k1")
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "clave-google")
    with _cliente({"tomtom": _tomtom, "googleapis": _google, "open-meteo": _meteo}) as c:
        r = envivo.recolectar([TRAMO_SN, TRAMO_NS], cliente=c, ahora=AHORA)
    assert r["lluvia"]["estado"] == "ok"
    assert r["proveedores"]["tomtom"]["lecturas"] == 2
    assert r["proveedores"]["google"]["lecturas"] == 2
    assert r["proveedores"]["here"]["estado"] == "sin_clave"
    with envivo.abrir() as con:
        n = con.execute("SELECT COUNT(*) FROM lecturas").fetchone()[0]
        lluvia = envivo.lluvia_por_hora(con, AHORA - timedelta(hours=1))
        prov = {p["nombre"]: p for p in envivo.estado_proveedores(con, AHORA)}
    assert n == 4
    assert max(lluvia.values()) == 2.5
    # SN acierta al primer intento; NS (el segmento simulado va al norte) prueba los 5 puntos de calibración
    assert prov["tomtom"]["usadas_hoy"] == 1 + len(envivo.DESPLAZAMIENTOS)
    assert prov["here"]["clave_configurada"] is False


def test_intervalo_y_horario(monkeypatch):
    monkeypatch.setenv("TOMTOM_API_KEY", "k1")
    with _cliente({"tomtom": _tomtom, "open-meteo": _meteo}) as c:
        envivo.recolectar([TRAMO_SN], cliente=c, ahora=AHORA)
        r2 = envivo.recolectar([TRAMO_SN], cliente=c, ahora=AHORA + timedelta(minutes=5))
        r3 = envivo.recolectar([TRAMO_SN], cliente=c, ahora=AHORA.replace(hour=23))
    assert r2["proveedores"]["tomtom"]["estado"] == "esperando"
    assert "omitido" in r3


def test_cuota_agotada_pausa_el_proveedor(monkeypatch):
    monkeypatch.setenv("TOMTOM_API_KEY", "secreta")
    monkeypatch.setenv("HERE_API_KEY", "k2")
    llamadas = {"tomtom": 0}

    def tomtom_403(req):
        llamadas["tomtom"] += 1
        return httpx.Response(403, text="Developer Over Rate secreta")
    with _cliente({"tomtom": tomtom_403, "hereapi": _here, "open-meteo": _meteo}) as c:
        r = envivo.recolectar([TRAMO_SN, TRAMO_NS], cliente=c, ahora=AHORA)
        r2 = envivo.recolectar([TRAMO_SN], cliente=c, ahora=AHORA + timedelta(hours=1), forzar=True)
    t = r["proveedores"]["tomtom"]
    assert t["estado"] == "error" and "secreta" not in t["error"]       # la clave nunca aparece en el error
    assert llamadas["tomtom"] == 1                                      # se detuvo en la primera respuesta
    assert r2["proveedores"]["tomtom"]["estado"] == "pausado"           # sigue pausado el resto del día
    assert r["proveedores"]["here"]["lecturas"] == 2                    # los demás proveedores siguen


def test_cupo_diario(monkeypatch):
    monkeypatch.setenv("TOMTOM_API_KEY", "k1")
    monkeypatch.setenv("MOBIPREDICT_CUPO_TOMTOM", "3")
    with _cliente({"tomtom": _tomtom, "open-meteo": _meteo}) as c:
        r = envivo.recolectar([TRAMO_SN] * 4, cliente=c, ahora=AHORA)
    assert r["proveedores"]["tomtom"]["lecturas"] == 3
    assert "Cupo diario agotado" in r["proveedores"]["tomtom"]["error"]


def test_calibracion_busca_la_calzada_correcta(monkeypatch):
    """Solo a ~120 m al occidente del punto aparece la calzada que va al sur: se guarda y se reutiliza."""
    monkeypatch.setenv("TOMTOM_API_KEY", "k1")
    pedidos = []

    def tomtom(req):
        lat, lon = map(float, req.url.params["point"].split(","))
        pedidos.append(lon)
        al_sur = lon < TRAMO_NS["lon"] - 0.0007
        return _tomtom(req, vel=20, libre=50, norte=not al_sur)
    with _cliente({"tomtom": tomtom, "open-meteo": _meteo}) as c:
        r1 = envivo.recolectar([TRAMO_NS], cliente=c, ahora=AHORA)
        n1 = len(pedidos)
        r2 = envivo.recolectar([TRAMO_NS], cliente=c, ahora=AHORA + timedelta(minutes=20))
    assert r1["proveedores"]["tomtom"]["calibrados"] == 1 and n1 == 2      # 40 m (falla) y 120 m (sirve)
    assert len(pedidos) == n1 + 1 and r2["proveedores"]["tomtom"]["calibrados"] == 0
    with envivo.abrir() as con:
        fila = con.execute("SELECT metros, coincide FROM punto_tramo").fetchone()
        sentidos = [x[0] for x in con.execute("SELECT coincide_sentido FROM lecturas")]
    assert fila["metros"] == 120 and fila["coincide"] == 1 and sentidos == [1, 1]


def test_rumbo_local_en_via_curva():
    # Una vía que va al oriente y luego gira al norte: cerca del final el rumbo es norte, no noreste
    pts = [(6.0, -75.0 + k * 0.001) for k in range(10)] + [(6.0 + k * 0.001, -74.991) for k in range(1, 10)]
    assert envivo.dif_angulo(envivo.rumbo_local(pts, 6.008, -74.991), 0) < 5
    assert envivo.dif_angulo(envivo.rumbo_local(pts, 6.0, -74.996), 90) < 5


def test_serie_horaria_e_historial():
    with envivo.abrir() as con:
        for k in range(5):     # 5 horas seguidas, 4:00 a 8:00
            cuando = AHORA.replace(minute=5) - timedelta(hours=4 - k)
            envivo.guardar_lectura(con, envivo.Lectura("AUTOPISTA_NORTE_SN", "tomtom", 30, 60, 1.0, True), cuando)
            envivo.guardar_lectura(con, envivo.Lectura("AUTOPISTA_NORTE_SN", "here", 45, 60, 1.0, True), cuando)
            # una lectura del sentido contrario no debe contar si hay otras que sí confirman el sentido
            envivo.guardar_lectura(con, envivo.Lectura("AUTOPISTA_NORTE_SN", "google", 60, 60, None, False), cuando)
        serie = envivo.serie_horaria(con, AHORA - timedelta(hours=12))
    assert len(serie) == 5
    assert serie["ratio"].iloc[-1] == pytest.approx(0.625)              # (0,5 + 0,75) / 2
    h = envivo.historial(serie, {}, {"AUTOPISTA_NORTE_SN": 80.0}, AHORA)["AUTOPISTA_NORTE_SN"]
    assert h["horas"] == 5 and h["fresco"] is True
    assert h["observaciones"][-1]["velocidad_kmh"] == pytest.approx(50.0)   # 0,625 × 80 km/h del SIMM
    assert set(h["proveedores"]) == {"tomtom", "here"}


@pytest.mark.skipif(not config.MODEL_SPEED_FILE.exists(), reason="ejecute run_pipeline.py primero")
def test_endpoint_envivo(monkeypatch):
    from fastapi.testclient import TestClient

    from api.main import app
    ahora = envivo.ahora_local().replace(minute=10, second=0)
    monkeypatch.setattr(envivo, "ahora_local", lambda: ahora)
    with envivo.abrir() as con:
        for k in range(4):
            cuando = ahora - timedelta(hours=3 - k)
            envivo.guardar_lectura(con, envivo.Lectura("AVENIDA_80_NS", "tomtom", 20 - 3 * k, 50, 1.0, True), cuando)
        envivo.guardar_lectura(con, envivo.Lectura("CALLE_30_EW", "tomtom", 30, 50, 1.0, True), ahora)
    with TestClient(app) as c:
        r = c.get("/envivo")
    assert r.status_code == 200, r.text
    b = r.json()
    filas = {f["tramo_id"]: f for f in b["tramos"]}
    ok = filas["AVENIDA_80_NS"]
    assert ok["estado"] == "ok" and 0 <= ok["probabilidad_colapso"] <= 1 and ok["velocidad_predicha_kmh"] > 0
    assert filas["CALLE_30_EW"]["estado"] == "recolectando" and filas["CALLE_30_EW"]["horas_historia"] == 1
    assert filas["AUTOPISTA_SUR_NS"]["estado"] == "sin_datos"
    assert b["resumen"]["listos"] == 1 and len(b["proveedores"]) == 4
