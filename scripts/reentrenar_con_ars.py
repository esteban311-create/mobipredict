"""Reentrena MobiPredict con la serie horaria derivada de las cámaras ARS/CCTV.

Pasos:
  1. Respalda models/metadata.json actual (si existe).
  2. Descarga clima Open-Meteo para cubrir el periodo ARS.
  3. Instala sensores_ars_horaria.parquet como serie de sensores del pipeline.
  4. Regenera festivos hasta 2027.
  5. Arma features + entrena + selecciona (sin volver a bajar la serie GT).

Uso (desde la raíz del proyecto):
    python scripts/reentrenar_con_ars.py
    python scripts/reentrenar_con_ars.py --fast
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

# Cortes para ARS (ago-2019 → sep-2026). Se fijan ANTES de importar config.
os.environ.setdefault("MOBIPREDICT_FECHA_INICIO", "2019-09-01")
os.environ.setdefault("MOBIPREDICT_CORTE_VALID", "2024-01-01")
os.environ.setdefault("MOBIPREDICT_CORTE_TEST", "2025-01-01")
os.environ.setdefault("MOBIPREDICT_FIN_TEST", "2026-01-01")
os.environ.setdefault("MOBIPREDICT_FIN_DRIFT", "2026-09-04")

import pandas as pd  # noqa: E402

from mobipredict import config, data_acquisition, features, fuentes, selection, training  # noqa: E402

log = logging.getLogger("reentrenar_ars")

ARS_PARQUET = config.DATA_INTERIM / "sensores_ars_horaria.parquet"
BACKUP_META = config.MODELS_DIR / "metadata_antes_ars.json"


def _descargar_clima_ars() -> Path:
    """Open-Meteo por tramos anuales (el API tolera mejor rangos cortos)."""
    destino = config.DATA_RAW / config.FUENTES["clima"]["archivo"]
    anios = list(range(2019, 2027))
    partes = []
    for a in anios:
        inicio, fin = f"{a}-01-01", f"{a}-12-31"
        if a == 2026:
            fin = "2026-09-03"
        log.info("Clima Open-Meteo %s → %s", inicio, fin)
        data = data_acquisition._get_json(
            config.FUENTES["clima"]["url"],
            latitude=config.CLIMA_LAT, longitude=config.CLIMA_LON,
            start_date=inicio, end_date=fin,
            hourly="precipitation,temperature_2m", timezone="America/Bogota",
        )
        h = data["hourly"]
        partes.append(pd.DataFrame({
            "timestamp": h["time"], "lluvia_mm": h["precipitation"], "temperatura_c": h["temperature_2m"],
        }))
    clima = pd.concat(partes, ignore_index=True)
    clima["timestamp"] = pd.to_datetime(clima["timestamp"])
    clima = clima.drop_duplicates("timestamp").sort_values("timestamp")
    destino.parent.mkdir(parents=True, exist_ok=True)
    clima.to_csv(destino, index=False)
    clima.to_parquet(config.CLIMA_STD, index=False)
    log.info("Clima: %s horas (%s → %s)", f"{len(clima):,}", clima["timestamp"].min(), clima["timestamp"].max())
    return destino


def _instalar_sensores_ars() -> pd.DataFrame:
    if not ARS_PARQUET.exists():
        raise SystemExit(
            f"No está {ARS_PARQUET}. Primero: python scripts/convertir_ars_a_sensores.py")
    ars = pd.read_parquet(ARS_PARQUET)
    sens = ars[["tramo_id", "timestamp", "velocidad_kmh", "tiempo_viaje_min"]].copy()
    sens["timestamp"] = pd.to_datetime(sens["timestamp"])
    # Respaldo de la serie GT si aún no existe
    bak = config.DATA_INTERIM / "sensores_velocidad_horaria_gt_backup.parquet"
    if config.SENSORES_STD.exists() and not bak.exists():
        shutil.copy2(config.SENSORES_STD, bak)
        log.info("Respaldo GT → %s", bak.name)
    sens.to_parquet(config.SENSORES_STD, index=False)
    log.info("Sensores ARS instalados: %s filas, %s → %s",
             f"{len(sens):,}", sens["timestamp"].min(), sens["timestamp"].max())
    return sens


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--fast", action="store_true", help="menos trials de búsqueda")
    p.add_argument("--sin-clima", action="store_true", help="no volver a bajar el clima (usa el CSV actual)")
    args = p.parse_args()
    if args.fast:
        os.environ["MOBIPREDICT_FAST"] = "1"
        # config ya importado: forzar flags usados por training
        config.FAST = True
        config.N_TRIALS_OPTUNA = 8
        config.N_ITER_RANDOM = 4
        config.SEARCH_SAMPLE = 25_000
        config.FIT_MAX_ROWS = 80_000

    config.ensure_dirs()
    t0 = time.time()

    if config.METADATA_FILE.exists():
        shutil.copy2(config.METADATA_FILE, BACKUP_META)
        log.info("Metadata previa respaldada en %s", BACKUP_META.name)

    if not args.sin_clima:
        _descargar_clima_ars()
    else:
        fuentes.estandarizar_clima()

    _instalar_sensores_ars()
    fuentes.estandarizar_festivos(anios=range(2019, 2028))
    # EOD / aforos / siniestros / tramos: se reusan los interim ya existentes
    if not config.TRAMOS_STD.exists():
        raise SystemExit(f"Falta {config.TRAMOS_STD}. Genérelo una vez con el pipeline GT.")

    log.info("Features…")
    spec = features.preparar_dataset()
    spec["fuente_sensores"] = (
        "Cámaras ARS/CCTV SIMM (Observatorio de Movilidad de Medellín), serie horaria derivada "
        f"({config.FECHA_INICIO} → 2026-09-03)"
    )
    (config.DATA_PROCESSED / "feature_spec.json").write_text(
        json.dumps(spec, indent=2, ensure_ascii=False), encoding="utf-8")

    log.info("Entrenamiento…")
    tabla = training.entrenar_y_registrar(features.cargar_particiones(), spec)
    log.info("Selección…")
    meta = selection.seleccionar(tabla, spec)
    meta["reentrenado_utc"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    meta["fuente_sensores"] = spec["fuente_sensores"]
    meta["cortes"] = {
        "fecha_inicio": config.FECHA_INICIO,
        "corte_validacion": config.CORTE_VALIDACION,
        "corte_test": config.CORTE_TEST,
        "fin_test": config.FIN_TEST,
        "fin_drift": config.FIN_DRIFT,
    }
    config.METADATA_FILE.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n=== Reentrenamiento ARS listo ===")
    print(f"Tiempo: {time.time() - t0:.0f} s")
    print(json.dumps({
        "filas": spec.get("filas"),
        "tasa_colapso": spec.get("tasa_colapso"),
        "cortes": meta["cortes"],
        "modelo_velocidad": meta["modelo_velocidad"],
        "modelo_colapso": meta["modelo_colapso"],
    }, indent=2, ensure_ascii=False))
    print(f"\nDetalle: {config.COMPARISON_FILE}")
    print(f"Decisión: {config.DECISION_FILE}")
    if BACKUP_META.exists():
        print(f"Anterior: {BACKUP_META}")


if __name__ == "__main__":
    main()
