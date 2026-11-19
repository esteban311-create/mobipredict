"""Rutas sugeridas con el riesgo de colapso de MobiPredict.

1. Google Routes (computeRoutes, TRAFFIC_AWARE, con rutas alternativas) da hasta 3 caminos entre el origen y el
   destino con el tráfico de este momento.
2. Cada ruta se cruza con los tramos que vigila MobiPredict: un tramo cuenta si la ruta pasa cerca de su punto
   de consulta (150 m) y en su mismo sentido de circulación.
3. Se recomienda la ruta que pase por menos tramos con riesgo de colapso en la próxima hora; si empatan, la más
   rápida. Para no proponer rodeos absurdos solo se comparan rutas que tarden como mucho 1,6 veces la más rápida.

Limitación: cada tramo se representa con un solo punto (no con su trazado completo), así que la coincidencia es
aproximada, y solo se conoce el riesgo de los 22 tramos del SIMM, no el de todas las calles.
"""
from __future__ import annotations

import math
import os
import re
import time

import httpx

from . import envivo

URL_RUTAS = envivo.URL_GOOGLE
DISTANCIA_MAX_M = 150.0          # distancia de la ruta al punto del tramo para considerar que pasa por él
FACTOR_RODEO = 1.6               # solo se comparan rutas que tarden <= 1,6 x la más rápida
REINTENTOS_CONEXION = 4          # el DNS de algunas redes rechaza consultas de forma intermitente
PROVEEDOR_CUOTA = "google_rutas"
MUNICIPIOS = ("medell", "envigado", "itag", "bello", "sabaneta", "estrella", "caldas", "copacabana",
              "girardota", "barbosa")
_COORD = re.compile(r"^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$")


class ErrorRuta(Exception):
    def __init__(self, mensaje: str, codigo: int = 400):
        super().__init__(mensaje)
        self.codigo = codigo


def cupo() -> int:
    return int(os.getenv("MOBIPREDICT_CUPO_RUTAS", "100"))


def decodificar(polilinea: str) -> list[tuple[float, float]]:
    """Polilínea codificada de Google (precisión 1e-5) -> lista de (lat, lon)."""
    pts, i, lat, lon = [], 0, 0, 0
    while i < len(polilinea):
        valores = []
        for _ in range(2):
            res, sh = 0, 0
            while True:
                b = ord(polilinea[i]) - 63
                i += 1
                res |= (b & 0x1F) << sh
                sh += 5
                if b < 0x20:
                    break
            valores.append(~(res >> 1) if res & 1 else res >> 1)
        lat, lon = lat + valores[0], lon + valores[1]
        pts.append((lat / 1e5, lon / 1e5))
    return pts


def _punto(texto: str) -> dict:
    """Coordenadas 'lat,lon' o una dirección/lugar. Se le añade Medellín si no dice el municipio y Antioquia,
    Colombia si no los dice: con un texto suelto como "parque de bello" Google no encuentra el lugar."""
    m = _COORD.match(texto)
    if m:
        return {"location": {"latLng": {"latitude": float(m[1]), "longitude": float(m[2])}}}
    t = " ".join(texto.split())
    bajo = t.lower()
    if not any(x in bajo for x in (*MUNICIPIOS, "antioquia", "colombia")):
        t += ", Medellín"
    if "antioquia" not in bajo and "colombia" not in bajo:
        t += ", Antioquia, Colombia"
    return {"address": t}


def consultar(cliente: httpx.Client, origen: str, destino: str, clave: str) -> list[dict]:
    r = cliente.post(URL_RUTAS, json={
        "origin": _punto(origen), "destination": _punto(destino), "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE", "computeAlternativeRoutes": True,
        "languageCode": "es", "regionCode": "co", "units": "METRIC"},
        headers={"X-Goog-Api-Key": clave,
                 "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.distanceMeters,"
                                     "routes.polyline.encodedPolyline,routes.description,routes.routeLabels"})
    try:
        envivo._revisar(r, clave)
    except envivo.ErrorCuota as e:
        raise ErrorRuta(f"Google Maps rechazó la consulta: {e}", 503) from e
    if r.status_code == 400:
        raise ErrorRuta("Google Maps no reconoció el origen o el destino. Escribe la dirección más completa "
                        "(por ejemplo «Calle 10 # 43-20» o «Parque Lleras»).")
    if r.status_code != 200:
        raise ErrorRuta(f"Google Maps respondió HTTP {r.status_code}.", 502)
    rutas = []
    for i, x in enumerate(r.json().get("routes") or []):
        pts = decodificar((x.get("polyline") or {}).get("encodedPolyline") or "")
        dur, est = envivo._segundos(x.get("duration")), envivo._segundos(x.get("staticDuration"))
        if len(pts) < 2 or not dur:
            continue
        rutas.append({"indice": i, "descripcion": x.get("description") or f"Ruta {i + 1}",
                      "distancia_km": round((x.get("distanceMeters") or 0) / 1000, 1),
                      "duracion_min": round(dur / 60, 1),
                      "duracion_sin_trafico_min": round((est or dur) / 60, 1),
                      "puntos": [[round(a, 5), round(b, 5)] for a, b in pts]})
    return rutas


def tramos_en_ruta(pts: list[list[float]], tramos: list[dict]) -> list[str]:
    """Tramos por los que pasa la ruta (cerca de su punto y en su sentido), en el orden en que se recorren."""
    encontrados = []
    for t in tramos:
        lat0, lon0 = float(t["lat"]), float(t["lon"])
        esc = math.cos(math.radians(lat0)) * 111_320
        mejor = None
        for k in range(len(pts) - 1):
            (a1, b1), (a2, b2) = pts[k], pts[k + 1]
            # proyección local en metros con el punto del tramo como origen
            x1, y1, x2, y2 = (b1 - lon0) * esc, (a1 - lat0) * 111_320, (b2 - lon0) * esc, (a2 - lat0) * 111_320
            dx, dy = x2 - x1, y2 - y1
            L2 = dx * dx + dy * dy
            u = 0.0 if L2 == 0 else max(0.0, min(1.0, -(x1 * dx + y1 * dy) / L2))
            d = math.hypot(x1 + u * dx, y1 + u * dy)
            if d <= DISTANCIA_MAX_M and L2 > 0:
                rb = envivo.rumbo(a1, b1, a2, b2)
                if envivo.dif_angulo(rb, envivo.RUMBO[t["sentido"]]) <= envivo.TOLERANCIA_RUMBO \
                        and (mejor is None or d < mejor[1]):
                    mejor = (k, d)
        if mejor:
            encontrados.append((mejor[0], t["tramo_id"]))
    return [tid for _, tid in sorted(encontrados)]


def _riesgo(ruta: dict) -> tuple:
    niveles = [x.get("nivel") for x in ruta["tramos"]]
    return (niveles.count("colapso"), niveles.count("precaucion"), ruta["duracion_min"])


def recomendar(rutas: list[dict]) -> tuple[int, str]:
    """Índice de la ruta recomendada (en la lista) y una explicación en lenguaje sencillo."""
    rapida = min(range(len(rutas)), key=lambda i: rutas[i]["duracion_min"])
    tope = rutas[rapida]["duracion_min"] * FACTOR_RODEO
    candidatas = [i for i, r in enumerate(rutas) if r["duracion_min"] <= tope]
    rec = min(candidatas, key=lambda i: _riesgo(rutas[i]))
    r, f = rutas[rec], rutas[rapida]

    def nombres(ruta: dict, nivel: str) -> str:
        xs = [f"{x['corredor_corto']} ({round(x['probabilidad_colapso'] * 100)} %)" for x in ruta["tramos"]
              if x.get("nivel") == nivel]
        return ", ".join(xs)

    vigiladas = any(x["tramos"] for x in rutas)
    con_dato = any(t.get("estado") == "ok" for x in rutas for t in x["tramos"])
    if not vigiladas:
        return rec, ("Ninguna de las rutas pasa por las vías que vigila MobiPredict, así que se recomienda la más "
                     "rápida según el tráfico actual de Google Maps.")
    if not con_dato:
        return rec, ("Las vías de estas rutas todavía no tienen predicción (el modelo necesita 4 horas seguidas de "
                     "lecturas). Por ahora se recomienda la más rápida según el tráfico actual de Google Maps.")
    if rec != rapida:
        evita = nombres(f, "colapso") or nombres(f, "precaucion")
        extra = round(r["duracion_min"] - f["duracion_min"])
        return rec, (f"Te recomendamos «{r['descripcion']}»: " + (f"tarda unos {extra} min más que la más rápida, "
                     if extra > 0 else "") + f"pero evita {evita}, que puede colapsar en la próxima hora.")
    malas = nombres(r, "colapso")
    if malas:
        return rec, (f"Todas las rutas razonables pasan por vías con riesgo alto de colapso: {malas}. Se recomienda "
                     "la más rápida; si puedes, sal más tarde o busca otro destino.")
    cuidado = nombres(r, "precaucion")
    if cuidado:
        return rec, f"«{r['descripcion']}» es la mejor opción. Ojo con {cuidado}: riesgo moderado en la próxima hora."
    return rec, f"«{r['descripcion']}» es la más rápida y sus vías vigiladas no muestran riesgo de colapso."


def buscar(origen: str, destino: str, tramos: list[dict], estado_tramos: dict[str, dict],
           cliente: httpx.Client | None = None) -> dict:
    """Busca rutas, les asigna el riesgo de cada tramo vigilado y elige la recomendada."""
    envivo.cargar_env()
    clave = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    if not clave:
        raise ErrorRuta("Falta GOOGLE_MAPS_API_KEY en el archivo .env para buscar rutas.", 503)
    if not origen.strip() or not destino.strip():
        raise ErrorRuta("Escribe el origen y el destino.")
    hoy = envivo.ahora_local().date().isoformat()
    with envivo.abrir() as con:
        usadas = envivo._usadas(con, PROVEEDOR_CUOTA, hoy)
        if usadas >= cupo():
            raise ErrorRuta(f"Se agotó el cupo de búsquedas de rutas de hoy ({cupo()}). Vuelve mañana o sube "
                            "MOBIPREDICT_CUPO_RUTAS en el archivo .env.", 429)
    propio = cliente is None
    cliente = cliente or httpx.Client(timeout=20, headers={"User-Agent": envivo.USER_AGENT})
    llego = True                      # solo se descuenta del cupo si la consulta llegó a Google
    try:
        for intento in range(REINTENTOS_CONEXION):
            try:
                rutas = consultar(cliente, origen, destino, clave)
                break
            except (httpx.ConnectError, httpx.ConnectTimeout):
                if intento == REINTENTOS_CONEXION - 1:
                    raise
                time.sleep(1.0 * (intento + 1))
    except httpx.HTTPError as e:
        llego = False
        raise ErrorRuta(f"No hubo conexión con Google Maps ({type(e).__name__}). Revisa el internet e "
                        "inténtalo otra vez.", 502) from e
    finally:
        if propio:
            cliente.close()
        if llego:
            with envivo.abrir() as con:
                envivo._sumar_uso(con, PROVEEDOR_CUOTA, hoy)
    if not rutas:
        raise ErrorRuta("Google Maps no encontró una ruta en carro entre esos dos lugares.", 404)

    por_id = {t["tramo_id"]: t for t in tramos}
    for r in rutas:
        r["tramos"] = []
        for tid in tramos_en_ruta(r["puntos"], tramos):
            t, e = por_id[tid], estado_tramos.get(tid, {})
            r["tramos"].append({
                "tramo_id": tid, "corredor": t.get("corredor"), "sentido": t["sentido"],
                "corredor_corto": str(t.get("corredor", "")).replace("Avenida ", "Av. "),
                "estado": e.get("estado", "sin_datos"), "nivel": e.get("nivel"),
                "probabilidad_colapso": e.get("probabilidad_colapso"), "alerta": e.get("alerta"),
                "velocidad_actual_kmh": e.get("velocidad_actual_kmh"),
                "velocidad_predicha_kmh": e.get("velocidad_predicha_kmh")})
        probs = [x["probabilidad_colapso"] for x in r["tramos"] if x["probabilidad_colapso"] is not None]
        r["riesgo_max"] = max(probs) if probs else None
    rec, mensaje = recomendar(rutas)
    rapida = min(range(len(rutas)), key=lambda i: rutas[i]["duracion_min"])
    for i, r in enumerate(rutas):
        r["recomendada"], r["mas_rapida"] = i == rec, i == rapida
    rutas.sort(key=lambda r: (not r["recomendada"], r["duracion_min"]))
    return {"origen": origen, "destino": destino, "mensaje": mensaje, "rutas": rutas,
            "busquedas_hoy": usadas + 1, "cupo_busquedas": cupo()}
