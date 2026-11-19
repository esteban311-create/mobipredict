"""Convierte las bases diarias de cámaras ARS/CCTV del Observatorio de Movilidad
en una serie horaria por tramo compatible con `data/interim/sensores_velocidad_horaria.parquet`.

Los ARS miden velocidad e intensidad en un punto (cámara/carril), no tiempo de viaje
de corredor como la serie GT de MEData. Aquí se:
  1. Filtran los 11 corredores / 22 tramos de MobiPredict.
  2. Promedian `velocidad_media` a la hora (hora local Bogotá).
  3. Estiman `tiempo_viaje_min` con la longitud conocida del tramo (GT).

Uso (desde la raíz del proyecto):
    python scripts/convertir_ars_a_sensores.py
    python scripts/convertir_ars_a_sensores.py --entrada "C:/Users/User/Downloads/Datos_camaras_ARS/Datos_camaras_ARS"
    python scripts/convertir_ars_a_sensores.py --limite-dias 5 --desde 2024-01-01
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mobipredict import config  # noqa: E402

log = logging.getLogger("convertir_ars")

# Nombre en ARS → nombre canónico del catálogo GT / tramos.csv
MAPA_CORREDOR = {
    "Avenida El Poblado": "Avenida El Poblado",
    "Autopista Norte": "Autopista Norte",
    "Autopista Sur": "Autopista Sur",
    "Avenida Regional": "Avenida Regional",
    "Avenida 80": "Avenida 80",
    "Avenida 33": "Avenida 33",
    "Avenida Oriental": "Avenida Oriental",
    "Avenida Guayabal": "Avenida Guayabal",
    "Avenida Las Palmas": "Avenida Las Palmas",
    "Avenida Ferrocarril": "Avenida Ferrocarril",
    "Carrera 57 - Avenida Ferrocarril": "Avenida Ferrocarril",
    "Calle 30": "Calle 30",
    "San Juan": "Avenida San Juan",
    "Avenida San Juan": "Avenida San Juan",
}

COLS = [
    "fecha_hora_local_bogota", "corredor", "sentido", "velocidad_media",
    "latitud", "longitud", "intensidad_volumen", "dispositivo",
]

VEL_MIN, VEL_MAX = 2.0, 110.0
HORA_INICIO, HORA_FIN = 6, 20   # misma ventana operativa de la serie GT


def _slug(corredor: str, sentido: str) -> str:
    return f"{corredor.upper().replace(' ', '_')}_{sentido}"


def cargar_tramos_validos() -> pd.DataFrame:
    """Catálogo de tramos del proyecto (longitud para estimar tiempo de viaje)."""
    ruta = config.TRAMOS_STD if config.TRAMOS_STD.exists() else None
    if ruta is None:
        raise SystemExit(f"No está {config.TRAMOS_STD}. Corra antes el pipeline de limpieza (GT).")
    t = pd.read_csv(ruta)
    t["tramo_id"] = t["tramo_id"].astype(str)
    return t[["tramo_id", "corredor", "sentido", "longitud_km"]].drop_duplicates("tramo_id")


def listar_archivos(entrada: Path, desde: str | None, hasta: str | None, limite: int | None) -> list[Path]:
    archivos = sorted(entrada.glob("????-??-??-*.csv.gz"))
    if desde:
        archivos = [p for p in archivos if p.name[:10] >= desde]
    if hasta:
        archivos = [p for p in archivos if p.name[:10] <= hasta]
    if limite:
        archivos = archivos[:limite]
    return archivos


def _fix_coords(df: pd.DataFrame) -> pd.DataFrame:
    """Corrige filas donde lat/lon vienen intercambiadas (lat fuera de 5–7)."""
    lat = pd.to_numeric(df["latitud"], errors="coerce")
    lon = pd.to_numeric(df["longitud"], errors="coerce")
    swap = lat.notna() & ((lat < 5) | (lat > 7)) & lon.between(5, 7)
    if swap.any():
        df.loc[swap, ["latitud", "longitud"]] = df.loc[swap, ["longitud", "latitud"]].to_numpy()
    return df


def procesar_archivo(ruta: Path, tramos_ok: set[str]) -> pd.DataFrame | None:
    try:
        raw = pd.read_csv(ruta, compression="gzip", usecols=lambda c: c in COLS, low_memory=False)
    except Exception as e:
        log.warning("No se pudo leer %s: %s", ruta.name, e)
        return None
    faltan = [c for c in ("fecha_hora_local_bogota", "corredor", "sentido", "velocidad_media") if c not in raw.columns]
    if faltan:
        log.warning("%s sin columnas %s", ruta.name, faltan)
        return None

    raw["corredor"] = raw["corredor"].astype(str).str.strip().map(MAPA_CORREDOR)
    raw = raw.dropna(subset=["corredor"])
    if raw.empty:
        return None

    raw["sentido"] = raw["sentido"].astype(str).str.strip().str.upper()
    raw = raw[raw["sentido"].isin({"NS", "SN", "EW", "WE"})]
    raw["tramo_id"] = [_slug(c, s) for c, s in zip(raw["corredor"], raw["sentido"])]
    raw = raw[raw["tramo_id"].isin(tramos_ok)]
    if raw.empty:
        return None

    raw["velocidad_kmh"] = pd.to_numeric(raw["velocidad_media"], errors="coerce")
    raw = raw[(raw["velocidad_kmh"] >= VEL_MIN) & (raw["velocidad_kmh"] <= VEL_MAX)]
    if raw.empty:
        return None

    if "latitud" in raw.columns:
        raw = _fix_coords(raw)

    ts = pd.to_datetime(raw["fecha_hora_local_bogota"], errors="coerce")
    raw = raw.assign(timestamp=ts.dt.floor("h"))
    raw = raw.dropna(subset=["timestamp"])
    raw = raw[(raw["timestamp"].dt.hour >= HORA_INICIO) & (raw["timestamp"].dt.hour <= HORA_FIN)]
    if raw.empty:
        return None

    intens = pd.to_numeric(raw.get("intensidad_volumen"), errors="coerce") if "intensidad_volumen" in raw.columns else np.nan
    raw = raw.assign(intensidad=intens)

    out = (raw.groupby(["tramo_id", "timestamp"], as_index=False)
           .agg(velocidad_kmh=("velocidad_kmh", "mean"),
                n_lecturas=("velocidad_kmh", "size"),
                intensidad_media=("intensidad", "mean")))
    return out


def convertir(entrada: Path, salida: Path, tramos: pd.DataFrame,
              desde: str | None, hasta: str | None, limite: int | None) -> dict:
    archivos = listar_archivos(entrada, desde, hasta, limite)
    if not archivos:
        raise SystemExit(f"No hay .csv.gz en {entrada}")

    tramos_ok = set(tramos["tramo_id"])
    longitudes = tramos.set_index("tramo_id")["longitud_km"]
    partes: list[pd.DataFrame] = []
    t0 = time.time()
    leidos = omitidos = 0

    log.info("Procesando %d archivos de %s …", len(archivos), entrada)
    for i, ruta in enumerate(archivos, 1):
        g = procesar_archivo(ruta, tramos_ok)
        if g is None or g.empty:
            omitidos += 1
        else:
            partes.append(g)
            leidos += 1
        if i % 50 == 0 or i == len(archivos):
            log.info("  %d/%d (%.0f s) · útiles=%d · vacíos=%d",
                     i, len(archivos), time.time() - t0, leidos, omitidos)

    if not partes:
        raise SystemExit("Ningún archivo produjo filas útiles. Revise el mapeo de corredores.")

    sens = pd.concat(partes, ignore_index=True)
    sens = (sens.groupby(["tramo_id", "timestamp"], as_index=False)
            .agg(velocidad_kmh=("velocidad_kmh", "mean"),
                 n_lecturas=("n_lecturas", "sum"),
                 intensidad_media=("intensidad_media", "mean")))
    sens["longitud_km"] = sens["tramo_id"].map(longitudes)
    sens["tiempo_viaje_min"] = sens["longitud_km"] / sens["velocidad_kmh"] * 60.0
    sens = sens.drop(columns=["longitud_km"]).sort_values(["tramo_id", "timestamp"]).reset_index(drop=True)

    # Columnas mínimas compatibles + extras útiles
    final = sens[["tramo_id", "timestamp", "velocidad_kmh", "tiempo_viaje_min", "n_lecturas", "intensidad_media"]]
    salida.parent.mkdir(parents=True, exist_ok=True)
    final.to_parquet(salida, index=False)

    resumen = {
        "entrada": str(entrada),
        "salida": str(salida),
        "archivos_vistos": len(archivos),
        "archivos_utiles": leidos,
        "archivos_vacios": omitidos,
        "filas_horarias": int(len(final)),
        "tramos": sorted(final["tramo_id"].unique().tolist()),
        "n_tramos": int(final["tramo_id"].nunique()),
        "desde": str(final["timestamp"].min()),
        "hasta": str(final["timestamp"].max()),
        "velocidad_media_kmh": round(float(final["velocidad_kmh"].mean()), 2),
        "segundos": round(time.time() - t0, 1),
        "nota": ("Serie derivada de cámaras ARS/CCTV (punto). "
                 "tiempo_viaje_min se estima con longitud_km del catálogo GT. "
                 "No reemplaza automáticamente sensores_velocidad_horaria.parquet."),
    }
    resumen_path = salida.with_suffix(".resumen.json")
    resumen_path.write_text(json.dumps(resumen, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info("Listo: %s (%s filas, %s tramos)", salida, f"{len(final):,}", resumen["n_tramos"])
    log.info("Resumen: %s", resumen_path)
    return resumen


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--entrada", type=Path,
                   default=Path.home() / "Downloads" / "Datos_camaras_ARS" / "Datos_camaras_ARS",
                   help="Carpeta con los .csv.gz diarios y _manifest.json")
    p.add_argument("--salida", type=Path,
                   default=config.DATA_INTERIM / "sensores_ars_horaria.parquet",
                   help="Parquet de salida (no pisa la serie GT por defecto)")
    p.add_argument("--desde", default=None, help="YYYY-MM-DD inclusive")
    p.add_argument("--hasta", default=None, help="YYYY-MM-DD inclusive")
    p.add_argument("--limite-dias", type=int, default=None, help="Solo los primeros N archivos (prueba)")
    args = p.parse_args()

    if not args.entrada.exists():
        raise SystemExit(f"No existe la carpeta de entrada: {args.entrada}")

    tramos = cargar_tramos_validos()
    resumen = convertir(args.entrada, args.salida, tramos, args.desde, args.hasta, args.limite_dias)
    print(json.dumps(resumen, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
