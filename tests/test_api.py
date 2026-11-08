"""Pruebas de la API. Requieren haber corrido el pipeline (models/ con artefactos)."""
import pytest
from fastapi.testclient import TestClient

from mobipredict import config

pytestmark = pytest.mark.skipif(not config.MODEL_SPEED_FILE.exists(), reason="ejecute run_pipeline.py primero")

from api.main import app  # noqa: E402
from api.schemas import EJEMPLO_OBS, EJEMPLO_TRAMO  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["modelos_cargados"] is True


def test_tramos(client):
    r = client.get("/tramos")
    assert r.status_code == 200
    assert any(t["tramo_id"] == EJEMPLO_TRAMO for t in r.json())


def test_predict(client):
    r = client.post("/predict", json={"tramo_id": EJEMPLO_TRAMO, "observaciones": EJEMPLO_OBS})
    assert r.status_code == 200, r.text
    b = r.json()
    assert 1 <= b["velocidad_predicha_kmh"] <= 130
    assert b["tiempo_viaje_predicho_min"] > 0
    assert 0 <= b["probabilidad_colapso"] <= 1


def test_predict_tramo_invalido(client):
    r = client.post("/predict", json={"tramo_id": "XX", "observaciones": EJEMPLO_OBS})
    assert r.status_code == 422


def test_predict_batch(client):
    ids = [t["tramo_id"] for t in client.get("/tramos").json()][:3]
    r = client.post("/predict/batch", json={"peticiones": [{"tramo_id": t, "observaciones": EJEMPLO_OBS} for t in ids]})
    assert r.status_code == 200
    assert len(r.json()["predicciones"]) == len(ids)


def test_frontend_y_raiz(client):
    r = client.get("/", follow_redirects=False)
    assert r.status_code in (302, 307) and r.headers["location"].endswith("/app/")
    r = client.get("/app/")
    assert r.status_code == 200 and "MobiPredict" in r.text
    for archivo in ["app.js", "styles.css"]:
        assert client.get(f"/app/{archivo}").status_code == 200


def test_modelos(client):
    r = client.get("/modelos")
    assert r.status_code == 200
    b = r.json()
    assert b["modelo_velocidad"]["nombre"] and b["modelo_colapso"]["nombre"]
    tareas = {f["tarea"] for f in b["comparacion"]}
    assert tareas == {"velocidad", "colapso"}
    assert sum(f["seleccionado"] for f in b["comparacion"]) == 2


def test_escenarios_predicen(client):
    lista = client.get("/escenarios").json()
    if not lista:
        pytest.skip("sin escenarios (models/escenarios.json)")
    e = client.get(f"/escenarios/{lista[0]['id']}").json()
    assert e["tramos"] and all(len(t["observaciones"]) >= 4 for t in e["tramos"])
    pet = [{"tramo_id": t["tramo_id"], "observaciones": t["observaciones"]} for t in e["tramos"]]
    r = client.post("/predict/batch", json={"peticiones": pet})
    assert r.status_code == 200, r.text
    assert len(r.json()["predicciones"]) == len(pet)
    assert client.get("/escenarios/no-existe").status_code == 404


def test_tramos_con_coordenadas(client):
    for t in client.get("/tramos").json():
        assert 6.0 < t["lat"] < 6.5 and -75.8 < t["lon"] < -75.4, t["tramo_id"]


def test_dias(client):
    r = client.get("/dias")
    assert r.status_code == 200
    dias = r.json()
    assert dias and {d["periodo"] for d in dias} <= {"test", "drift"}
    assert all(d["colapsos_sin_aviso"] <= d["colapsos_reales"] for d in dias)
    assert all(d["periodo"] == "test" for d in client.get("/dias?periodo=test").json())
    assert client.get("/dias?periodo=xx").status_code == 422


def test_replay_dia(client):
    dia = max((d for d in client.get("/dias?periodo=test").json()), key=lambda d: d["colapsos_reales"])
    r = client.get(f"/replay/{dia['fecha']}")
    assert r.status_code == 200, r.text
    b = r.json()
    res = b["resumen"]
    assert res["colapsos_reales"] == dia["colapsos_reales"]
    assert res["detectados"] <= res["alertas"] and res["anticipados"] <= res["colapsos_sin_aviso"]
    assert sum(h["anticipados"] for h in b["por_hora"]) == res["anticipados"]
    assert len(b["tramos"]) == res["tramos"]
    for t in b["tramos"]:
        for p in t["serie"]:
            assert 0 <= p["probabilidad_colapso"] <= 1 and p["velocidad_predicha_kmh"] >= 1
            assert p["nivel"] in {"normal", "precaucion", "colapso"}
            assert not p["anticipado"] or (p["alerta"] and p["colapso_real"] and not p["colapso_actual"])


def test_replay_coincide_con_predict(client):
    """La repetición del día y /predict deben dar la misma predicción con las mismas lecturas."""
    dia = client.get("/dias?periodo=test").json()[10]["fecha"]
    t = client.get(f"/replay/{dia}").json()["tramos"][0]
    serie = t["serie"]
    obs = [{"timestamp": p["timestamp"], "velocidad_kmh": p["velocidad_actual_kmh"], "lluvia_mm": p["lluvia_mm"]}
           for p in serie[:6]]
    r = client.post("/predict", json={"tramo_id": t["tramo_id"], "observaciones": obs}).json()
    assert abs(r["velocidad_predicha_kmh"] - serie[5]["velocidad_predicha_kmh"]) < 0.05
    assert abs(r["probabilidad_colapso"] - serie[5]["probabilidad_colapso"]) < 1e-3


def test_replay_fecha_sin_datos(client):
    assert client.get("/replay/2015-01-01").status_code == 404
    assert client.get("/replay/no-es-fecha").status_code == 422
