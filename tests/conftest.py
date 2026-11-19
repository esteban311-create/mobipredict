import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

import os  # noqa: E402

# Las pruebas nunca arrancan el recolector en vivo ni leen las claves reales del .env
os.environ["MOBIPREDICT_ENVIVO_AUTO"] = "0"
