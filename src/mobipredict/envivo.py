"""Tráfico en tiempo real para MobiPredict.

Fuentes (todas opcionales: se usan las que tengan clave en el entorno o en el archivo .env):
  - TomTom Traffic Flow (Flow Segment Data): velocidad actual y de flujo libre en un punto de la vía.
  - HERE Traffic API v7 (flow): velocidad actual y de flujo libre de los segmentos alrededor de un punto.
  - Google Routes API (computeRoutes con TRAFFIC_AWARE): tiempo de viaje con y sin tráfico en un trayecto
    corto de ~1 km centrado en el tramo y en su sentido de circulación.
  - Open-Meteo Forecast (sin clave): lluvia horaria en el centro de Medellín.

Calibración. El modelo se entrenó con las velocidades de los sensores del SIMM, y cada proveedor mide distinto
(GPS de vehículos y celulares). Por eso no se usa la velocidad del proveedor tal cual: se usa su índice de
congestión (velocidad actual / velocidad de flujo libre del mismo proveedor) y se multiplica por la velocidad de
referencia del SIMM del tramo (percentil 95 del entrenamiento). Así el modelo recibe lecturas en su propia escala.
Es una aproximación: el modelo nunca vio datos de estos proveedores.

Cuotas. Cada proveedor tiene un cupo diario de consultas (configurable con variables de entorno) y un intervalo
entre rondas. Si la API responde que la cuota se agotó o que la clave no sirve, ese proveedor se pausa (15 min
ante un 429, el resto del día ante un 401/403) y los demás siguen funcionando.

Almacenamiento: SQLite en data/envivo/lecturas.sqlite. Las horas se guardan en hora local de Medellín (UTC-5,
sin horario de verano), igual que los datos de entrenamiento.
"""
from __future__ import annotations

import contextlib
import json
import logging
import math
import os
import sqlite3
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Iterator

import httpx
import pandas as pd

from . import config

log = logging.getLogger("mobipredict.envivo")

TZ_MEDELLIN = timezone(timedelta(hours=-5))      # Colombia no tiene horario de verano
FMT = "%Y-%m-%dT%H:%M:%S"
PASO = timedelta(hours=1)
USER_AGENT = "MobiPredict/1.0 (proyecto academico)"

URL_TOMTOM = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
URL_HERE = "https://data.traffic.hereapi.com/v7/flow"
URL_GOOGLE = "https://routes.googleapis.com/directions/v2:computeRoutes"
URL_OPEN_METEO = "https://api.open-meteo.com/v1/forecast"

RUMBO = {"SN": 0.0, "WE": 90.0, "NS": 180.0, "EW": 270.0}    # rumbo de circulación de cada sentido
TOLERANCIA_RUMBO = 60.0                                      # grados para aceptar que un segmento va en el sentido


# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #
def cargar_env(ruta: Path | None = None) -> None:
    """Lee KEY=VALOR del archivo .env (sin sobrescribir variables ya definidas en el entorno)."""
    ruta = Path(ruta or config.ENV_FILE)
    if not ruta.exists():
        return
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        k, v = linea.split("=", 1)
        k = k.strip().removeprefix("export ").strip()
        v = v.strip().strip('"').strip("'")
        if k and v:
            os.environ.setdefault(k, v)


def ahora_local() -> datetime:
    return datetime.now(TZ_MEDELLIN).replace(tzinfo=None, microsecond=0)


def _iso(d: datetime) -> str:
    return d.strftime(FMT)


def _leer(s: str | None) -> datetime | None:
    return datetime.strptime(s, FMT) if s else None


def _hora(d: datetime) -> datetime:
    return d.replace(minute=0, second=0, microsecond=0)


def desplazar(lat: float, lon: float, rumbo_deg: float, metros: float) -> tuple[float, float]:
    r = math.radians(rumbo_deg)
    dlat = metros * math.cos(r) / 111_320
    dlon = metros * math.sin(r) / (111_320 * math.cos(math.radians(lat)))
    return lat + dlat, lon + dlon


def rumbo(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    f1, f2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(f2)
    x = math.cos(f1) * math.sin(f2) - math.sin(f1) * math.cos(f2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def dif_angulo(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return min(d, 360 - d)


def punto_carril(t: dict, metros: float = 40) -> tuple[float, float]:
    """Punto del tramo corrido unos metros a la derecha de su sentido (en Colombia se circula por la derecha),
    para que el proveedor encuentre la calzada correcta en vías de doble sentido."""
    return desplazar(float(t["lat"]), float(t["lon"]), RUMBO[t["sentido"]] + 90, metros)


def _coincide(rb: float | None, sentido: str) -> bool | None:
    return None if rb is None else dif_angulo(rb, RUMBO[sentido]) <= TOLERANCIA_RUMBO


def rumbo_local(pts: list[tuple[float, float]], lat: float, lon: float, vecinos: int = 3) -> float | None:
    """Rumbo de una polilínea en el tramo más cercano al punto consultado. Los proveedores devuelven segmentos
    que pueden medir varios kilómetros y curvarse, así que el rumbo entre sus extremos no sirve."""
    if len(pts) < 2:
        return None
    escala = math.cos(math.radians(lat))
    i = min(range(len(pts)), key=lambda k: (pts[k][0] - lat) ** 2 + ((pts[k][1] - lon) * escala) ** 2)
    a, b = pts[max(i - vecinos, 0)], pts[min(i + vecinos, len(pts) - 1)]
    return rumbo(a[0], a[1], b[0], b[1])


def nombre_clave(corredor: str) -> str:
    """Parte distintiva del nombre del corredor para reconocerlo en las descripciones de los proveedores:
    'Avenida El Poblado' -> 'el poblado', 'Avenida 80' -> '80', 'Autopista Norte' -> 'autopista'."""
    c = corredor.lower().strip()
    if c.startswith("autopista"):
        return "autopista"
    for pref in ("avenida ", "calle ", "carrera "):
        if c.startswith(pref):
            return c[len(pref):]
    return c


def _frc(lec: "Lectura | None") -> int:
    """Clase funcional de la vía según TomTom (FRC0 = autopista ... FRC6 = local); 9 si no se sabe."""
    f = str((lec.detalle if lec else {}).get("frc") or "")
    return int(f[3:]) if f.startswith("FRC") and f[3:].isdigit() else 9


# Distancias (m) a la derecha del sentido que se prueban para encontrar la calzada correcta (negativo = izquierda)
DESPLAZAMIENTOS = [40, 120, -40, 0, 200]


# --------------------------------------------------------------------------- #
# Proveedores
# --------------------------------------------------------------------------- #
@dataclass
class Lectura:
    tramo_id: str
    proveedor: str
    velocidad_kmh: float
    velocidad_libre_kmh: float
    confianza: float | None = None
    coincide_sentido: bool | None = None
    detalle: dict = field(default_factory=dict)


class ErrorCuota(Exception):
    """La API rechazó la consulta por cuota o clave: se pausa el proveedor (None = hasta mañana)."""

    def __init__(self, motivo: str, pausa_min: float | None = None):
        super().__init__(motivo)
        self.pausa_min = pausa_min


def _revisar(r: httpx.Response, clave: str) -> None:
    if r.status_code not in (401, 403, 429):
        return
    cuerpo = " ".join(r.text[:180].split()).replace(clave, "***") if clave else r.text[:180]
    if r.status_code == 429:
        raise ErrorCuota(f"HTTP 429, límite de uso: {cuerpo}", 15)
    if "qps" in cuerpo.lower():
        raise ErrorCuota(f"HTTP {r.status_code}, demasiadas consultas por segundo: {cuerpo}", 2)
    raise ErrorCuota(f"HTTP {r.status_code}, clave inválida, API no habilitada o cuota agotada: {cuerpo}")


def consultar_tomtom(cliente: httpx.Client, t: dict, clave: str) -> Lectura | None:
    lat, lon = punto_carril(t, t.get("metros", 40))
    r = cliente.get(URL_TOMTOM, params={"point": f"{lat:.6f},{lon:.6f}", "unit": "KMPH", "key": clave})
    _revisar(r, clave)
    if r.status_code != 200:
        return None
    f = r.json().get("flowSegmentData") or {}
    v, vl = f.get("currentSpeed"), f.get("freeFlowSpeed")
    if v is None or not vl:
        return None
    pts = [(p["latitude"], p["longitude"]) for p in (f.get("coordinates") or {}).get("coordinate") or []]
    rb = rumbo_local(pts, lat, lon)
    return Lectura(t["tramo_id"], "tomtom", max(float(v), 1.0), float(vl), f.get("confidence"),
                   _coincide(rb, t["sentido"]),
                   {"frc": f.get("frc"), "tiempo_actual_s": f.get("currentTravelTime"),
                    "tiempo_libre_s": f.get("freeFlowTravelTime"), "cierre": bool(f.get("roadClosure")),
                    "metros": t.get("metros", 40)})


def consultar_here(cliente: httpx.Client, t: dict, clave: str) -> Lectura | None:
    lat, lon = punto_carril(t)
    r = cliente.get(URL_HERE, params={"in": f"circle:{lat:.6f},{lon:.6f};r=200",
                                      "locationReferencing": "shape", "apiKey": clave})
    _revisar(r, clave)
    if r.status_code != 200:
        return None
    clave_nombre = nombre_clave(t.get("corredor", ""))
    escala = math.cos(math.radians(lat))
    candidatos = []
    for x in r.json().get("results") or []:
        cf, loc = x.get("currentFlow") or {}, x.get("location") or {}
        v, vl = cf.get("speed"), cf.get("freeFlow")        # m/s
        if v is None or not vl:
            continue
        pts = [(p["lat"], p["lng"]) for l in (loc.get("shape") or {}).get("links") or [] for p in l.get("points") or []]
        rb = rumbo_local(pts, lat, lon)
        dist = min((math.hypot(a - lat, (b - lon) * escala) * 111_320 for a, b in pts), default=999.0)
        via = loc.get("description") or ""
        candidatos.append({"v": max(float(v) * 3.6, 1.0), "vl": float(vl) * 3.6, "conf": cf.get("confidence"),
                           "ok": _coincide(rb, t["sentido"]), "peso": float(loc.get("length") or 1.0),
                           "via": via, "jam": cf.get("jamFactor"), "dist": dist,
                           "nombre": bool(clave_nombre) and clave_nombre in via.lower()})
    # El círculo de búsqueda también trae calles que cruzan o van paralelas: se prefieren, en este orden, los
    # segmentos en el sentido del tramo, con el nombre del corredor y los más cercanos al punto consultado.
    sel = [c for c in candidatos if c["ok"]] or candidatos
    sel = [c for c in sel if c["nombre"]] or sel
    if not sel:
        return None
    cerca = min(c["dist"] for c in sel)
    sel = [c for c in sel if c["dist"] <= cerca + 30]
    w = sum(c["peso"] for c in sel)
    confs = [c["conf"] for c in sel if c["conf"] is not None]
    return Lectura(t["tramo_id"], "here", sum(c["v"] * c["peso"] for c in sel) / w,
                   sum(c["vl"] * c["peso"] for c in sel) / w, (sum(confs) / len(confs)) if confs else None,
                   any(c["ok"] for c in sel) if any(c["ok"] is not None for c in sel) else None,
                   {"segmentos": len(sel), "vias": sorted({c["via"] for c in sel if c["via"]})[:3],
                    "jam_factor": max((c["jam"] or 0) for c in sel)})


def _segundos(s: str | None) -> float | None:
    if not s or not str(s).endswith("s"):
        return None
    return float(str(s)[:-1])


def consultar_google(cliente: httpx.Client, t: dict, clave: str) -> Lectura | None:
    lat, lon = punto_carril(t)
    rb = RUMBO[t["sentido"]]
    o, d = desplazar(lat, lon, rb + 180, 500), desplazar(lat, lon, rb, 500)
    punto = lambda p: {"location": {"latLng": {"latitude": round(p[0], 6), "longitude": round(p[1], 6)}}}  # noqa: E731
    r = cliente.post(URL_GOOGLE, json={"origin": punto(o), "destination": punto(d), "travelMode": "DRIVE",
                                       "routingPreference": "TRAFFIC_AWARE"},
                     headers={"X-Goog-Api-Key": clave,
                              "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.distanceMeters"})
    _revisar(r, clave)
    if r.status_code != 200:
        return None
    rutas = r.json().get("routes") or []
    if not rutas:
        return None
    dist, dur, est = rutas[0].get("distanceMeters"), _segundos(rutas[0].get("duration")), \
        _segundos(rutas[0].get("staticDuration"))
    if not dist or not dur or not est:
        return None
    # Si la ruta da un rodeo (> 1,8 km para unir dos puntos a 1 km) probablemente no siguió el corredor
    return Lectura(t["tramo_id"], "google", max(dist / dur * 3.6, 1.0), dist / est * 3.6, None, dist <= 1800,
                   {"distancia_m": dist, "duracion_s": dur, "duracion_sin_trafico_s": est})


@dataclass(frozen=True)
class Proveedor:
    nombre: str
    titulo: str
    clave_env: str
    cupo_defecto: int
    intervalo_defecto: float
    funcion: Callable[[httpx.Client, dict, str], Lectura | None]
    calibrable: bool = False          # busca y guarda el mejor punto de consulta de cada tramo

    def clave(self) -> str:
        return os.getenv(self.clave_env, "").strip()

    def cupo(self) -> int:
        return int(os.getenv(f"MOBIPREDICT_CUPO_{self.nombre.upper()}", self.cupo_defecto))

    def intervalo(self) -> float:
        return float(os.getenv(f"MOBIPREDICT_INTERVALO_{self.nombre.upper()}", self.intervalo_defecto))


# Cupos por defecto pensados para no salir de los planes gratuitos (22 tramos por ronda, 16 h al día).
# Los planes cambian: revise los límites vigentes de su cuenta y ajuste MOBIPREDICT_CUPO_<PROVEEDOR>.
PROVEEDORES = [
    Proveedor("tomtom", "TomTom", "TOMTOM_API_KEY", 2400, 15, consultar_tomtom, calibrable=True),
    Proveedor("here", "HERE", "HERE_API_KEY", 1000, 30, consultar_here),
    Proveedor("google", "Google Maps", "GOOGLE_MAPS_API_KEY", 160, 120, consultar_google),
]


# --------------------------------------------------------------------------- #
# Almacenamiento
# --------------------------------------------------------------------------- #
ESQUEMA = """
CREATE TABLE IF NOT EXISTS lecturas (
  ts TEXT NOT NULL, hora TEXT NOT NULL, tramo_id TEXT NOT NULL, proveedor TEXT NOT NULL,
  velocidad_kmh REAL NOT NULL, velocidad_libre_kmh REAL NOT NULL, confianza REAL, coincide_sentido INTEGER,
  detalle TEXT);
CREATE INDEX IF NOT EXISTS ix_lecturas_hora ON lecturas (hora, tramo_id);
CREATE TABLE IF NOT EXISTS lluvia (hora TEXT PRIMARY KEY, lluvia_mm REAL NOT NULL, actualizado TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cuota (fecha TEXT NOT NULL, proveedor TEXT NOT NULL, usadas INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (fecha, proveedor));
CREATE TABLE IF NOT EXISTS proveedor_estado (proveedor TEXT PRIMARY KEY, ultima_consulta TEXT, ultimo_ok TEXT,
  pausado_hasta TEXT, ultimo_error TEXT);
CREATE TABLE IF NOT EXISTS punto_tramo (proveedor TEXT NOT NULL, tramo_id TEXT NOT NULL, metros REAL NOT NULL,
  frc INTEGER, coincide INTEGER, calibrado TEXT NOT NULL, PRIMARY KEY (proveedor, tramo_id));
"""


@contextlib.contextmanager
def abrir(ruta: Path | None = None) -> Iterator[sqlite3.Connection]:
    ruta = Path(ruta or config.ENVIVO_DB)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(ruta, timeout=15)
    con.row_factory = sqlite3.Row
    try:
        con.execute("PRAGMA journal_mode=WAL")
        con.executescript(ESQUEMA)
        yield con
        con.commit()
    finally:
        con.close()


def guardar_lectura(con: sqlite3.Connection, lec: Lectura, cuando: datetime) -> None:
    con.execute("INSERT INTO lecturas VALUES (?,?,?,?,?,?,?,?,?)",
                (_iso(cuando), _iso(_hora(cuando)), lec.tramo_id, lec.proveedor, round(lec.velocidad_kmh, 2),
                 round(lec.velocidad_libre_kmh, 2), lec.confianza,
                 None if lec.coincide_sentido is None else int(lec.coincide_sentido),
                 json.dumps(lec.detalle, ensure_ascii=False)))


def _estado(con: sqlite3.Connection, proveedor: str) -> dict:
    fila = con.execute("SELECT * FROM proveedor_estado WHERE proveedor = ?", (proveedor,)).fetchone()
    return dict(fila) if fila else {"proveedor": proveedor, "ultima_consulta": None, "ultimo_ok": None,
                                    "pausado_hasta": None, "ultimo_error": None}


def _guardar_estado(con: sqlite3.Connection, e: dict) -> None:
    con.execute("INSERT OR REPLACE INTO proveedor_estado VALUES (?,?,?,?,?)",
                (e["proveedor"], e["ultima_consulta"], e["ultimo_ok"], e["pausado_hasta"], e["ultimo_error"]))


def _usadas(con: sqlite3.Connection, proveedor: str, fecha: str) -> int:
    fila = con.execute("SELECT usadas FROM cuota WHERE fecha = ? AND proveedor = ?", (fecha, proveedor)).fetchone()
    return int(fila["usadas"]) if fila else 0


def _sumar_uso(con: sqlite3.Connection, proveedor: str, fecha: str) -> None:
    con.execute("INSERT INTO cuota VALUES (?, ?, 1) ON CONFLICT (fecha, proveedor) DO UPDATE SET usadas = usadas + 1",
                (fecha, proveedor))


# --------------------------------------------------------------------------- #
# Recolección
# --------------------------------------------------------------------------- #
_CANDADO = threading.Lock()


def actualizar_lluvia(con: sqlite3.Connection, cliente: httpx.Client, ahora: datetime, forzar: bool = False) -> dict:
    ult = con.execute("SELECT MAX(actualizado) AS u FROM lluvia").fetchone()["u"]
    if not forzar and ult and ahora - _leer(ult) < timedelta(minutes=30):
        return {"estado": "al_dia", "actualizado": ult}
    try:
        r = cliente.get(URL_OPEN_METEO, params={"latitude": config.CLIMA_LAT, "longitude": config.CLIMA_LON,
                                                "hourly": "precipitation", "past_days": 1, "forecast_days": 2,
                                                "timezone": config.ZONA_HORARIA})
        r.raise_for_status()
        h = r.json()["hourly"]
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        return {"estado": "error", "error": type(exc).__name__}
    filas = [(f"{t}:00" if len(t) == 16 else t, float(mm or 0.0), _iso(ahora))
             for t, mm in zip(h["time"], h["precipitation"])]
    con.executemany("INSERT OR REPLACE INTO lluvia VALUES (?,?,?)", filas)
    return {"estado": "ok", "horas": len(filas)}


def _recolectar_proveedor(con: sqlite3.Connection, cliente: httpx.Client, p: Proveedor, tramos: list[dict],
                          ahora: datetime, forzar: bool) -> dict:
    clave = p.clave()
    if not clave:
        return {"estado": "sin_clave"}
    e = _estado(con, p.nombre)
    if e["pausado_hasta"] and ahora < _leer(e["pausado_hasta"]):
        return {"estado": "pausado", "hasta": e["pausado_hasta"], "error": e["ultimo_error"]}
    ult = _leer(e["ultima_consulta"])
    if not forzar and ult and ahora - ult < timedelta(minutes=p.intervalo()) - timedelta(seconds=30):
        return {"estado": "esperando", "proxima": _iso(ult + timedelta(minutes=p.intervalo()))}

    fecha, cupo = ahora.date().isoformat(), p.cupo()
    usadas = _usadas(con, p.nombre, fecha)
    ok = fallos = calibrados = 0
    error = pausa = None
    puntos = ({f["tramo_id"]: f["metros"] for f in
               con.execute("SELECT tramo_id, metros FROM punto_tramo WHERE proveedor = ?", (p.nombre,))}
              if p.calibrable else {})
    for t in tramos:
        # TomTom: la primera vez se prueban varios puntos para dar con la calzada principal en el sentido correcto
        calibrar = p.calibrable and t["tramo_id"] not in puntos
        candidatos = (DESPLAZAMIENTOS if calibrar else [puntos.get(t["tramo_id"])])
        lecturas: list[tuple[float | None, Lectura]] = []
        for m in candidatos:
            if usadas >= cupo:
                error = f"Cupo diario agotado ({cupo} consultas)"
                pausa = datetime.combine(ahora.date() + timedelta(days=1), datetime.min.time())
                break
            usadas += 1
            _sumar_uso(con, p.nombre, fecha)
            try:
                lec = p.funcion(cliente, t if m is None else {**t, "metros": m}, clave)
            except ErrorCuota as exc:
                error = str(exc)
                pausa = (ahora + timedelta(minutes=exc.pausa_min) if exc.pausa_min is not None
                         else datetime.combine(ahora.date() + timedelta(days=1), datetime.min.time()))
                break
            except (httpx.HTTPError, ValueError, KeyError, TypeError, IndexError) as exc:
                error = f"{type(exc).__name__} al consultar"   # sin el mensaje: podría incluir la URL con la clave
                continue
            if lec is not None:
                lecturas.append((m, lec))
                if lec.coincide_sentido and _frc(lec) <= 3:   # vía principal en el sentido correcto: suficiente
                    break
        if lecturas:
            m, lec = max(lecturas, key=lambda x: (x[1].coincide_sentido is True, -_frc(x[1])))
            guardar_lectura(con, lec, ahora)
            ok += 1
            if calibrar:
                con.execute("INSERT OR REPLACE INTO punto_tramo VALUES (?,?,?,?,?,?)",
                            (p.nombre, t["tramo_id"], m, _frc(lec), int(bool(lec.coincide_sentido)), _iso(ahora)))
                calibrados += 1
        else:
            fallos += 1
        if pausa:
            break
    e.update(ultima_consulta=_iso(ahora), pausado_hasta=_iso(pausa) if pausa else None, ultimo_error=error)
    if ok:
        e["ultimo_ok"] = _iso(ahora)
    _guardar_estado(con, e)
    con.commit()
    if error and pausa:
        log.warning("%s pausado hasta %s: %s", p.nombre, _iso(pausa), error)
    return {"estado": "ok" if ok else "error", "lecturas": ok, "fallos": fallos, "calibrados": calibrados,
            "usadas_hoy": usadas, "cupo": cupo, "error": error}


def olvidar_calibracion(proveedor: str = "tomtom", ruta_db: Path | None = None) -> int:
    """Borra los puntos calibrados para que la próxima ronda los vuelva a buscar."""
    with abrir(ruta_db) as con:
        return con.execute("DELETE FROM punto_tramo WHERE proveedor = ?", (proveedor,)).rowcount


def recolectar(tramos: list[dict], *, forzar: bool = False, ruta_db: Path | None = None,
               cliente: httpx.Client | None = None, ahora: datetime | None = None) -> dict:
    """Una ronda: lluvia de Open-Meteo y, de cada proveedor con clave al que le toque, una lectura por tramo.
    `forzar` ignora el horario y los intervalos (no los cupos ni las pausas por cuota)."""
    cargar_env()
    ahora = ahora or ahora_local()
    if not _CANDADO.acquire(blocking=False):
        return {"hora": _iso(ahora), "omitido": "Ya hay una consulta en curso"}
    propio = cliente is None
    cliente = cliente or httpx.Client(timeout=15, headers={"User-Agent": USER_AGENT})
    try:
        resumen: dict = {"hora": _iso(ahora), "proveedores": {}}
        if not forzar and not (config.ENVIVO_HORA_INICIO <= ahora.hour < config.ENVIVO_HORA_FIN):
            resumen["omitido"] = (f"Fuera del horario de recolección ({config.ENVIVO_HORA_INICIO} a "
                                  f"{config.ENVIVO_HORA_FIN} h)")
            return resumen
        with abrir(ruta_db) as con:
            resumen["lluvia"] = actualizar_lluvia(con, cliente, ahora, forzar)
            con.commit()
            for p in PROVEEDORES:
                resumen["proveedores"][p.nombre] = _recolectar_proveedor(con, cliente, p, tramos, ahora, forzar)
        return resumen
    finally:
        if propio:
            cliente.close()
        _CANDADO.release()


def _evitar_suspension(activar: bool) -> None:
    """En Windows pide que el equipo no entre en suspensión mientras el recolector corre (lo mismo que hace un
    reproductor de video). No cambia ninguna configuración: al terminar el hilo o la API, Windows vuelve a lo
    normal. Cerrar la tapa del portátil lo suspende igual. Se desactiva con MOBIPREDICT_ENVIVO_EVITAR_SUSPENSION=0."""
    if os.name != "nt" or os.getenv("MOBIPREDICT_ENVIVO_EVITAR_SUSPENSION", "1") == "0":
        return
    try:
        import ctypes
        ES_CONTINUOUS, ES_SYSTEM_REQUIRED = 0x80000000, 0x00000001
        ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS | (ES_SYSTEM_REQUIRED if activar else 0))
    except (AttributeError, OSError):
        log.warning("No se pudo pedir a Windows que evite la suspensión")


class Recolector:
    """Hilo en segundo plano que llama a `recolectar` cada config.ENVIVO_CICLO_MIN minutos."""

    def __init__(self, obtener_tramos: Callable[[], list[dict]]):
        self._tramos = obtener_tramos
        self._parar = threading.Event()
        self._hilo: threading.Thread | None = None
        self.ultimo: dict | None = None

    @property
    def activo(self) -> bool:
        return self._hilo is not None and self._hilo.is_alive()

    def iniciar(self) -> None:
        if self.activo:
            return
        self._parar.clear()
        self._hilo = threading.Thread(target=self._bucle, name="mobipredict-envivo", daemon=True)
        self._hilo.start()

    def detener(self) -> None:
        self._parar.set()

    def _bucle(self) -> None:
        _evitar_suspension(True)
        try:
            self._rondas()
        finally:
            _evitar_suspension(False)

    def _rondas(self) -> None:
        espera = 3.0
        while not self._parar.wait(espera):
            try:
                self.ultimo = recolectar(self._tramos())
            except Exception:   # el hilo no debe morir por un error puntual (red, disco)
                log.exception("Fallo en la ronda de recolección en vivo")
            espera = config.ENVIVO_CICLO_MIN * 60


def aplicar_puntos(tramos: list[dict], ruta: Path | None = None) -> list[dict]:
    """Usa el punto de consulta de data/reference/puntos_envivo.csv cuando existe (allí se pueden poner, a mano,
    coordenadas tomadas encima de cada vía); si no, deja el promedio de las cámaras del SIMM."""
    ruta = Path(ruta or config.PUNTOS_ENVIVO)
    if not ruta.exists():
        return tramos
    p = pd.read_csv(ruta).dropna(subset=["lat", "lon"]).set_index("tramo_id")
    return [{**t, "lat": float(p.at[t["tramo_id"], "lat"]), "lon": float(p.at[t["tramo_id"], "lon"])}
            if t["tramo_id"] in p.index else t for t in tramos]


def hay_claves() -> bool:
    cargar_env()
    return any(p.clave() for p in PROVEEDORES)


# --------------------------------------------------------------------------- #
# Lectura para el modelo
# --------------------------------------------------------------------------- #
def serie_horaria(con: sqlite3.Connection, desde: datetime) -> pd.DataFrame:
    """Una fila por tramo y hora: índice de congestión combinado de los proveedores disponibles."""
    cols = ["tramo_id", "hora", "ratio", "velocidad_proveedor_kmh", "n_lecturas", "proveedores", "sentido_verificado"]
    lec = pd.read_sql_query("SELECT hora, tramo_id, proveedor, velocidad_kmh, velocidad_libre_kmh, confianza, "
                            "coincide_sentido FROM lecturas WHERE hora >= ?", con, params=[_iso(desde)])
    if lec.empty:
        return pd.DataFrame(columns=cols)
    # Tope 1,1: el "flujo libre" de algunos proveedores es un promedio histórico (Google), así que en horas
    # tranquilas la velocidad lo supera; la velocidad de referencia del SIMM ya es un percentil 95.
    lec["ratio"] = (lec["velocidad_kmh"] / lec["velocidad_libre_kmh"]).clip(0.03, 1.1)
    lec["coincide"] = pd.to_numeric(lec["coincide_sentido"], errors="coerce").fillna(1)   # sin dato = se acepta
    # Dentro de cada tramo y hora se prefieren las lecturas que confirman el sentido de circulación
    lec = lec[lec["coincide"] >= lec.groupby(["tramo_id", "hora"])["coincide"].transform("max")].copy()
    lec["peso"] = pd.to_numeric(lec["confianza"], errors="coerce").fillna(1.0).clip(0.1, 1.0)
    lec["rp"], lec["vp"] = lec["ratio"] * lec["peso"], lec["velocidad_kmh"] * lec["peso"]
    g = lec.groupby(["tramo_id", "hora"])
    out = pd.DataFrame({
        "ratio": g["rp"].sum() / g["peso"].sum(),
        "velocidad_proveedor_kmh": g["vp"].sum() / g["peso"].sum(),
        "n_lecturas": g.size(),
        "proveedores": g["proveedor"].agg(lambda s: ",".join(sorted(set(s)))),
        "sentido_verificado": g["coincide"].max().astype(bool),
    }).reset_index()
    out["hora"] = pd.to_datetime(out["hora"])
    return out[cols]


def lluvia_por_hora(con: sqlite3.Connection, desde: datetime) -> dict[pd.Timestamp, float]:
    filas = con.execute("SELECT hora, lluvia_mm FROM lluvia WHERE hora >= ?", (_iso(desde),)).fetchall()
    return {pd.Timestamp(f["hora"]): float(f["lluvia_mm"]) for f in filas}


def historial(serie: pd.DataFrame, lluvia: dict, vref: dict[str, float], ahora: datetime) -> dict[str, dict]:
    """Por tramo: las lecturas horarias consecutivas que terminan en la última hora con datos, ya en la escala
    del SIMM (índice de congestión × velocidad de referencia), listas para /predict."""
    hora_actual = pd.Timestamp(_hora(ahora))
    res: dict[str, dict] = {}
    for tid, g in serie.groupby("tramo_id"):
        ref = vref.get(tid)
        if not ref or not math.isfinite(ref):
            continue
        g = g.sort_values("hora").reset_index(drop=True)
        ini = len(g) - 1
        while ini > 0 and g.loc[ini, "hora"] - g.loc[ini - 1, "hora"] == PASO:
            ini -= 1
        bloque = g.iloc[ini:]
        ult = bloque.iloc[-1]
        obs = [{"timestamp": h.isoformat(), "velocidad_kmh": round(min(max(r * ref, 1.0), 130.0), 2),
                "lluvia_mm": lluvia.get(h, 0.0)} for h, r in zip(bloque["hora"], bloque["ratio"])]
        res[tid] = {"observaciones": obs[-6:], "horas": len(obs), "ultima_hora": ult["hora"],
                    "fresco": ult["hora"] >= hora_actual - PASO, "ratio_actual": float(ult["ratio"]),
                    "velocidad_proveedor_kmh": float(ult["velocidad_proveedor_kmh"]),
                    "proveedores": ult["proveedores"].split(","), "n_lecturas": int(ult["n_lecturas"]),
                    "sentido_verificado": bool(ult["sentido_verificado"])}
    return res


def estado_proveedores(con: sqlite3.Connection, ahora: datetime) -> list[dict]:
    cargar_env()
    fecha = ahora.date().isoformat()
    out = []
    for p in PROVEEDORES:
        e = _estado(con, p.nombre)
        pausado = e["pausado_hasta"] if e["pausado_hasta"] and ahora < _leer(e["pausado_hasta"]) else None
        out.append({"nombre": p.nombre, "titulo": p.titulo, "clave_configurada": bool(p.clave()),
                    "variable": p.clave_env, "usadas_hoy": _usadas(con, p.nombre, fecha), "cupo_diario": p.cupo(),
                    "intervalo_min": p.intervalo(), "ultima_consulta": e["ultima_consulta"],
                    "ultimo_ok": e["ultimo_ok"], "pausado_hasta": pausado,
                    "ultimo_error": e["ultimo_error"]})
    ult = con.execute("SELECT MAX(actualizado) AS u FROM lluvia").fetchone()["u"]
    out.append({"nombre": "open_meteo", "titulo": "Open-Meteo (lluvia)", "clave_configurada": True,
                "variable": None, "usadas_hoy": None, "cupo_diario": None, "intervalo_min": 30,
                "ultima_consulta": ult, "ultimo_ok": ult, "pausado_hasta": None, "ultimo_error": None})
    return out
