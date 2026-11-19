"""Recolector de tráfico en tiempo real (TomTom, HERE, Google Routes y lluvia de Open-Meteo).

La API ya lo ejecuta en segundo plano cuando hay alguna clave en .env. Este script sirve para correrlo aparte
(por ejemplo en otro computador o como tarea programada) o para hacer una sola ronda de prueba.

    python scripts/recolector_envivo.py --una-vez      # una ronda ahora (ignora horario e intervalos)
    python scripts/recolector_envivo.py --estado       # cupos usados hoy y estado de cada proveedor
    python scripts/recolector_envivo.py --recalibrar   # tras editar data/reference/puntos_envivo.csv
    python scripts/recolector_envivo.py                # bucle: una revisión cada MOBIPREDICT_ENVIVO_CICLO_MIN
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import pandas as pd  # noqa: E402

from mobipredict import config, envivo  # noqa: E402


def _tramos() -> list[dict]:
    t = pd.read_csv(config.TRAMOS_STD).dropna(subset=["lat", "lon"])
    return envivo.aplicar_puntos(t[["tramo_id", "corredor", "sentido", "lat", "lon"]].to_dict(orient="records"))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--una-vez", action="store_true", help="hace una sola ronda forzada y termina")
    ap.add_argument("--estado", action="store_true", help="muestra el estado de los proveedores y termina")
    ap.add_argument("--recalibrar", action="store_true",
                    help="olvida los puntos calibrados de TomTom (úselo tras editar puntos_envivo.csv)")
    a = ap.parse_args()
    if a.recalibrar:
        print(f"Calibraciones borradas: {envivo.olvidar_calibracion()}. La próxima ronda las vuelve a buscar.")
        return
    if a.estado:
        with envivo.abrir() as con:
            print(json.dumps(envivo.estado_proveedores(con, envivo.ahora_local()), indent=2, ensure_ascii=False))
        return
    if not envivo.hay_claves():
        print("Aviso: no hay claves de tráfico en .env (ver .env.example). Solo se recolectará la lluvia.")
    tramos = _tramos()
    if a.una_vez:
        print(json.dumps(envivo.recolectar(tramos, forzar=True), indent=2, ensure_ascii=False))
        return
    print(f"Recolectando {len(tramos)} tramos cada {config.ENVIVO_CICLO_MIN:g} min (Ctrl + C para salir)")
    while True:
        r = envivo.recolectar(tramos)
        print(time.strftime("%H:%M"), json.dumps(r.get("proveedores") or r.get("omitido"), ensure_ascii=False))
        time.sleep(config.ENVIVO_CICLO_MIN * 60)


if __name__ == "__main__":
    main()
