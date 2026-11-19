"""Pruebas de las rutas sugeridas (respuestas simuladas de Google: no consultan internet ni gastan cuota)."""
import json

import httpx
import pytest

from mobipredict import config, envivo, rutas

# Dos tramos de la misma vía en sentidos opuestos, sobre la longitud -75.568
NORTE = {"tramo_id": "VIA_SN", "corredor": "Avenida Prueba", "sentido": "SN", "lat": 6.250, "lon": -75.568}
SUR = {"tramo_id": "VIA_NS", "corredor": "Avenida Prueba", "sentido": "NS", "lat": 6.250, "lon": -75.568}
OTRA = {"tramo_id": "OTRA_SN", "corredor": "Avenida Lejana", "sentido": "SN", "lat": 6.250, "lon": -75.600}


def codificar(pts):
    """Inverso de rutas.decodificar (algoritmo de polilíneas de Google)."""
    out, plat, plon = [], 0, 0
    for lat, lon in pts:
        for v in (round(lat * 1e5) - plat, round(lon * 1e5) - plon):
            v = ~(v << 1) if v < 0 else v << 1
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1F)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        plat, plon = round(lat * 1e5), round(lon * 1e5)
    return "".join(out)


@pytest.fixture(autouse=True)
def entorno(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "ENVIVO_DB", tmp_path / "envivo.sqlite")
    monkeypatch.setattr(config, "ENV_FILE", tmp_path / "no-existe.env")
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "clave-google")
    monkeypatch.delenv("MOBIPREDICT_CUPO_RUTAS", raising=False)


def test_decodificar_ejemplo_de_google():
    pts = rutas.decodificar("_p~iF~ps|U_ulLnnqC_mqNvxq`@")
    assert pts == [(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)]


def test_tramos_en_ruta_respeta_el_sentido():
    hacia_norte = [[6.240, -75.5681], [6.260, -75.5681]]
    assert rutas.tramos_en_ruta(hacia_norte, [NORTE, SUR, OTRA]) == ["VIA_SN"]
    assert rutas.tramos_en_ruta(hacia_norte[::-1], [NORTE, SUR, OTRA]) == ["VIA_NS"]
    # Una calle que cruza la vía de oriente a occidente no cuenta
    assert rutas.tramos_en_ruta([[6.250, -75.560], [6.250, -75.580]], [NORTE, SUR]) == []


def test_completa_el_lugar_con_municipio_y_departamento():
    assert rutas._punto("Parque Lleras") == {"address": "Parque Lleras, Medellín, Antioquia, Colombia"}
    assert rutas._punto("parque de  bello") == {"address": "parque de bello, Antioquia, Colombia"}
    assert rutas._punto("Calle 10, Envigado, Antioquia") == {"address": "Calle 10, Envigado, Antioquia"}
    assert rutas._punto("6.2752,-75.5835") == {"location": {"latLng": {"latitude": 6.2752, "longitude": -75.5835}}}


def _google(rutas_simuladas):
    def manejar(req: httpx.Request):
        assert req.headers["X-Goog-Api-Key"] == "clave-google"
        cuerpo = json.loads(req.content)
        assert cuerpo["computeAlternativeRoutes"] is True
        assert cuerpo["destination"]["address"].endswith("Medellín, Antioquia, Colombia")
        return httpx.Response(200, json={"routes": rutas_simuladas})
    return httpx.Client(transport=httpx.MockTransport(manejar))


def _ruta(desc, minutos, pts):
    return {"description": desc, "duration": f"{minutos * 60}s", "staticDuration": f"{minutos * 50}s",
            "distanceMeters": 5000, "polyline": {"encodedPolyline": codificar(pts)}}


RAPIDA = _ruta("por Av. Prueba", 15, [(6.240, -75.5681), (6.260, -75.5681)])
DESVIO = _ruta("por Av. Lejana", 19, [(6.240, -75.6001), (6.260, -75.6001)])


def test_recomienda_evitar_la_via_que_va_a_colapsar():
    estado = {"VIA_SN": {"estado": "ok", "nivel": "colapso", "probabilidad_colapso": 0.77, "alerta": True},
              "OTRA_SN": {"estado": "ok", "nivel": "normal", "probabilidad_colapso": 0.05, "alerta": False}}
    out = rutas.buscar("6.24,-75.57", "Parque Lleras", [NORTE, SUR, OTRA], estado, _google([RAPIDA, DESVIO]))
    rec = out["rutas"][0]
    assert rec["recomendada"] and rec["descripcion"] == "por Av. Lejana"
    assert out["rutas"][1]["mas_rapida"] and out["rutas"][1]["tramos"][0]["tramo_id"] == "VIA_SN"
    assert "evita Av. Prueba (77 %)" in out["mensaje"]
    assert out["busquedas_hoy"] == 1


def test_sin_riesgo_recomienda_la_mas_rapida():
    estado = {"VIA_SN": {"estado": "ok", "nivel": "normal", "probabilidad_colapso": 0.1, "alerta": False}}
    out = rutas.buscar("6.24,-75.57", "Parque Lleras", [NORTE, SUR, OTRA], estado, _google([RAPIDA, DESVIO]))
    assert out["rutas"][0]["descripcion"] == "por Av. Prueba" and out["rutas"][0]["mas_rapida"]


def test_no_propone_rodeos_muy_largos():
    lejos = _ruta("rodeo enorme", 40, [(6.240, -75.6001), (6.260, -75.6001)])
    estado = {"VIA_SN": {"estado": "ok", "nivel": "colapso", "probabilidad_colapso": 0.8, "alerta": True}}
    out = rutas.buscar("6.24,-75.57", "Parque Lleras", [NORTE, SUR, OTRA], estado, _google([RAPIDA, lejos]))
    assert out["rutas"][0]["descripcion"] == "por Av. Prueba"
    assert "Todas las rutas razonables" in out["mensaje"]


def test_reintenta_si_falla_la_conexion(monkeypatch):
    monkeypatch.setattr(rutas.time, "sleep", lambda s: None)
    llamadas = []

    def manejar(req: httpx.Request):
        llamadas.append(req)
        if len(llamadas) < 3:
            raise httpx.ConnectError("Se ha rechazado la operación DNS", request=req)
        return httpx.Response(200, json={"routes": [RAPIDA]})

    out = rutas.buscar("6.24,-75.57", "Parque Lleras", [NORTE], {}, httpx.Client(transport=httpx.MockTransport(manejar)))
    assert len(llamadas) == 3 and out["rutas"][0]["descripcion"] == "por Av. Prueba"
    assert out["busquedas_hoy"] == 1


def test_sin_conexion_no_gasta_cupo(monkeypatch):
    monkeypatch.setattr(rutas.time, "sleep", lambda s: None)

    def manejar(req: httpx.Request):
        raise httpx.ConnectError("sin red", request=req)

    with pytest.raises(rutas.ErrorRuta) as e:
        rutas.buscar("6.24,-75.57", "Parque Lleras", [NORTE], {}, httpx.Client(transport=httpx.MockTransport(manejar)))
    assert e.value.codigo == 502
    with envivo.abrir() as con:
        assert envivo._usadas(con, rutas.PROVEEDOR_CUOTA, envivo.ahora_local().date().isoformat()) == 0


def test_cupo_de_busquedas(monkeypatch):
    monkeypatch.setenv("MOBIPREDICT_CUPO_RUTAS", "1")
    rutas.buscar("6.24,-75.57", "Parque Lleras", [NORTE], {}, _google([RAPIDA]))
    with pytest.raises(rutas.ErrorRuta) as e:
        rutas.buscar("6.24,-75.57", "Parque Lleras", [NORTE], {}, _google([RAPIDA]))
    assert e.value.codigo == 429


def test_sin_clave(monkeypatch):
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY")
    with pytest.raises(rutas.ErrorRuta) as e:
        rutas.buscar("a b", "c d", [NORTE], {})
    assert e.value.codigo == 503
