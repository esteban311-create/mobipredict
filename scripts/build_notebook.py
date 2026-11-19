"""Genera notebooks/MobiPredict_MLOps_end_to_end.ipynb a partir del código del repositorio.

El notebook contiene TODO el proyecto: cada archivo se escribe con %%writefile y luego
se ejecuta el pipeline, se inspeccionan los artefactos y se prueba la API. Así funciona
igual abierto dentro del repo o subido solo a Colab / Jupyter.

Uso:  python scripts/build_notebook.py
"""
from __future__ import annotations

from pathlib import Path

import nbformat as nbf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "notebooks" / "MobiPredict_MLOps_end_to_end.ipynb"

md = nbf.v4.new_markdown_cell
code = nbf.v4.new_code_cell


def archivo(ruta: str, explicacion: str) -> list:
    contenido = (ROOT / ruta).read_text(encoding="utf-8").rstrip("\n")
    return [md(explicacion), code(f"%%writefile {ruta}\n{contenido}")]


celdas = [
    md("""# MobiPredict — Flujo MLOps de extremo a extremo con datos reales

**Velocidad de los corredores de Medellín a 1 hora, alertas de colapso y demanda/densidad con la EOD 2025 (AMVA).**

```
Fuentes oficiales ─► Estandarización ─► EDA ─► Features ─► Entrenamiento + Optuna ─► MLflow ─► Selección ─► API ─► Docker
```

| Fuente | Uso | Enlace |
| --- | --- | --- |
| Cámaras ARS/CCTV del SIMM (Observatorio de Movilidad) | **Serie del modelo vigente**, 22 tramos, sep-2019 a sep-2026 | Exportación de bases diarias (no es dato abierto) |
| Velocidad y tiempo de viaje GT (SIMM, MEData) | Serie del modelo anterior y del EDA, 22 tramos, 2017-2020 | https://www.datos.gov.co/d/7t5n-3b3w |
| EOD 2025 (AMVA), API del visor oficial | Demanda horaria, reparto modal, matriz OD 67 macrozonas | https://eod2025.metropol.gov.co/ |
| Siniestralidad Medellín 2008-2025 (Mendeley, CC BY 4.0) | EDA de siniestralidad | https://doi.org/10.17632/r6g5dfnpgh.1 |
| Open-Meteo (ERA5) | Lluvia horaria | https://open-meteo.com/en/docs/historical-weather-api |
| Aforos vehiculares (MEData) | Composición vehicular | https://www.datos.gov.co/d/b9s9-jw7c |

El notebook contiene **todo el proyecto**:

1. **Parte A — Código y tablas de referencia.** Cada archivo se escribe con `%%writefile`.
2. **Parte B — Datos y pipeline.** Descarga de las fuentes oficiales (~175 MB la primera vez), flujo de Prefect con la serie GT (EDA y modelo anterior), reentrenamiento con las cámaras ARS (modelo vigente) y revisión de cada etapa.
3. **Parte C — Servicio.** API FastAPI, pruebas y despliegue.

**Modelo vigente:** red neuronal MLP (velocidad) y LightGBM (colapso), entrenados con las cámaras ARS: train sep-2019 a 2023, validación 2024, prueba 2025 y holdout ene-sep 2026. Las figuras del EDA son de la serie GT 2017-2020.

**Protección de los modelos:** si `models/metadata.json` ya existe (por ejemplo, abierto dentro del repositorio), el notebook **no reentrena**: solo revisa los artefactos guardados. Para reentrenar, ponga `REENTRENAR = True` en la sección 0. El reentrenamiento ARS necesita la carpeta de exportación `Datos_camaras_ARS` (variable `MOBIPREDICT_ARS_DIR`) o el parquet `data/interim/sensores_ars_horaria.parquet`; sin ellos, el modelo queda en la versión GT.

Requiere internet en la primera ejecución. *Kernel → Restart & Run All*."""),
    md("## 0. Entorno"),
    code("""import os, sys, importlib.util
from pathlib import Path

aqui = Path.cwd()
if aqui.name == "notebooks" and (aqui.parent / "run_pipeline.py").exists():
    PROJECT_DIR = aqui.parent
elif (aqui / "run_pipeline.py").exists():
    PROJECT_DIR = aqui
else:
    PROJECT_DIR = aqui / "mobipredict"
PROJECT_DIR.mkdir(exist_ok=True)
os.chdir(PROJECT_DIR)
for d in ["src/mobipredict", "api", "tests/fixtures", "notebooks", "scripts", "data/raw", "data/interim",
          "data/processed", "data/reference/eod2025", "eda/figures", "eda/reports", "models", "docs", "mlruns"]:
    Path(d).mkdir(parents=True, exist_ok=True)
print("Proyecto en:", Path.cwd())

# Reentrenar solo si no hay modelos guardados (protege los modelos ARS del repositorio).
REENTRENAR = not Path("models/metadata.json").exists()
print("REENTRENAR =", REENTRENAR)"""),
    code("""paquetes = {"prefect": "prefect>=3.0", "mlflow": "mlflow>=2.16", "optuna": "optuna>=3.6", "lightgbm": "lightgbm>=4.3",
            "fastapi": "fastapi>=0.110", "httpx": "httpx>=0.27", "pyarrow": "pyarrow>=15", "sklearn": "scikit-learn>=1.5",
            "pytest": "pytest>=8", "holidays": "holidays>=0.50", "openpyxl": "openpyxl>=3.1"}
faltan = [spec for mod, spec in paquetes.items() if importlib.util.find_spec(mod) is None]
if faltan:
    print("Instalando:", faltan)
    %pip install -q {" ".join(faltan)}
else:
    print("Todas las dependencias están instaladas.")"""),

    md("---\n# Parte A — Código y tablas de referencia"),
    *archivo("requirements.txt", "### `requirements.txt`"),
    *archivo("data/fuentes_datos.csv", "### `data/fuentes_datos.csv` — catálogo de fuentes con URLs, licencias y cobertura"),
    *archivo("data/reference/eod2025_macrozonas.csv",
             "### Tablas de referencia oficiales\n`eod2025_macrozonas.csv`: diccionario id → municipio/macrozona de la EOD 2025 y centroides (visor oficial del AMVA)."),
    *archivo("data/reference/corredores_simm.csv", "`corredores_simm.csv`: ubicación media de las cámaras del SIMM por corredor (MEData)."),
    *archivo("data/reference/eod2025/indicadores_api.json", "`eod2025/indicadores_api.json`: los 42 indicadores agregados oficiales de la EOD 2025 (respaldo si la API no responde)."),
    *archivo("data/reference/eod2025/matriz_od_macrozonas.csv", "`eod2025/matriz_od_macrozonas.csv`: matriz origen-destino oficial, 3.126 pares, 6.490.299 viajes."),
    *archivo("src/mobipredict/__init__.py", "### Paquete `mobipredict`"),
    *archivo("src/mobipredict/config.py",
             "### 1.1 `config.py` — URLs oficiales, rutas, ventanas temporales y parámetros"),
    *archivo("src/mobipredict/data_acquisition.py",
             "### 1.2 `data_acquisition.py` — descarga automática con reintentos y manifiesto (sin datos simulados)"),
    *archivo("src/mobipredict/fuentes.py",
             "### 1.3 `fuentes.py` — validación y estandarización\nIncluye las correcciones de calidad: fecha desde `FECHA_HORA` "
             "(`DÍA`/`MES` corridos en 2020), agregación horaria de lecturas cada 30 min y promedio de duplicados."),
    *archivo("src/mobipredict/features.py",
             "### 2. `features.py` — features espaciotemporales y de la EOD, split temporal\nLas mismas funciones construyen "
             "las features en entrenamiento y en la API."),
    *archivo("src/mobipredict/eda.py", "### 3. `eda.py` — EDA reproducible con datos reales (9 figuras + reportes)"),
    *archivo("src/mobipredict/training.py",
             "### 4. `training.py` — candidatos, RandomizedSearchCV + Optuna con `TimeSeriesSplit`, registro en MLflow"),
    *archivo("src/mobipredict/selection.py",
             "### 5. `selection.py` — selección razonada, tabla comparativa, decisión y Model Registry"),
    *archivo("src/mobipredict/pipeline.py", "### 6. `pipeline.py` — `@flow` y `@task` de Prefect"),
    *archivo("src/mobipredict/envivo.py",
             "### 7. `envivo.py` — tráfico en tiempo real (TomTom, HERE, Google) calibrado a la escala del SIMM"),
    *archivo("src/mobipredict/rutas.py", "### 8. `rutas.py` — rutas sugeridas según el riesgo de colapso"),
    *archivo("data/reference/puntos_envivo.csv", "`puntos_envivo.csv`: punto de consulta en vivo de cada tramo."),
    *archivo(".env.example", "`.env.example`: plantilla de claves de tráfico en vivo (copiar como `.env`; nunca se sube a Git)."),
    *archivo("run_pipeline.py", "### `run_pipeline.py` — un solo comando"),
    *archivo("scripts/descargar_datos.py", "### `scripts/descargar_datos.py` — descarga de fuentes sin entrenar"),
    *archivo("scripts/descargar_datos.ps1", "### `scripts/descargar_datos.ps1` — descarga en Windows (PowerShell)"),
    *archivo("scripts/convertir_ars_a_sensores.py",
             "### `scripts/convertir_ars_a_sensores.py` — de los archivos diarios de cámaras ARS a la serie horaria por tramo"),
    *archivo("scripts/reentrenar_con_ars.py",
             "### `scripts/reentrenar_con_ars.py` — reentrena con la serie ARS (cortes 2019-09 / 2024 / 2025 / 2026)"),
    *archivo("scripts/recolector_envivo.py", "### `scripts/recolector_envivo.py` — recolector de lecturas en vivo"),
    *archivo("api/__init__.py", "### 9. API FastAPI"),
    *archivo("api/replay.py", "#### `api/replay.py` — repetición de días reales y cifras de valor"),
    *archivo("api/schemas.py", "#### `api/schemas.py`"),
    *archivo("api/main.py", "#### `api/main.py`"),
    *archivo("tests/conftest.py", "### 10. Pruebas"),
    *archivo("tests/fixtures/velocidad_gt_extracto.csv", "#### Extracto real de MEData (Av. 80 y Autopista Sur, 10-11 feb 2020)"),
    *archivo("tests/test_features.py", "#### `tests/test_features.py`"),
    *archivo("tests/test_api.py", "#### `tests/test_api.py`"),
    *archivo("tests/test_fuentes.py", "#### `tests/test_fuentes.py`"),
    *archivo("tests/test_envivo.py", "#### `tests/test_envivo.py` (respuestas simuladas de los proveedores, sin llamar a las APIs)"),
    *archivo("tests/test_rutas.py", "#### `tests/test_rutas.py`"),
    *archivo("frontend/index.html", "### 11. Frontend web (servido por la API en `/`)\n#### `frontend/index.html`\n"
             "Leaflet va en `frontend/vendor/` y no se copia aquí: sin él, el mapa no se dibuja, pero el resto funciona."),
    *archivo("frontend/app.js", "#### `frontend/app.js`"),
    *archivo("frontend/styles.css", "#### `frontend/styles.css`"),
    *archivo("Dockerfile", "### 12. Contenedores\n#### `Dockerfile`"),
    *archivo("docker-compose.yml", "#### `docker-compose.yml`"),
    *archivo(".dockerignore", "#### `.dockerignore`"),
    *archivo("requirements-dev.txt", "#### `requirements-dev.txt`"),
    *archivo("Makefile", "#### `Makefile`"),
    *archivo(".gitignore", "#### `.gitignore`"),
    *archivo("docs/fuentes_de_datos.md", "### Documentación de fuentes"),
    *archivo("README.md", "### `README.md`"),

    md("---\n# Parte B — Datos y pipeline"),
    md("## B.1 Descarga de las fuentes oficiales\nDescarga a `data/raw/` lo que falte (~175 MB la primera vez) y escribe `manifest.json`."),
    code("""os.environ.setdefault("MOBIPREDICT_FAST", "1")   # "0" para la búsqueda completa de hiperparámetros
sys.path[:0] = [str(Path.cwd()), str(Path.cwd() / "src")]
import logging, warnings, json
import pandas as pd
logging.basicConfig(level=logging.WARNING)
warnings.filterwarnings("ignore")
from mobipredict import config
from mobipredict.data_acquisition import adquirir_datos

if REENTRENAR:
    manifest = adquirir_datos()
    display(pd.DataFrame(manifest["fuentes"]).T[["titulo", "origen", "bytes", "ficha"]])
else:
    print("REENTRENAR = False: se usan los datos y modelos ya guardados.")"""),
    md("## B.2 Pipeline orquestado con Prefect (serie GT)\nEquivale a `python run_pipeline.py`: estandariza las fuentes, genera el EDA y "
       "entrena el modelo anterior con la serie abierta GT 2017-2020."),
    code("""if REENTRENAR:
    from mobipredict.pipeline import mobipredict_pipeline
    resultado = mobipredict_pipeline(ejecutar_eda=True)"""),
    md("## B.3 Modelo vigente: reentrenamiento con las cámaras ARS\nConvierte la exportación diaria de cámaras a la serie horaria "
       "(si hace falta) y corre `scripts/reentrenar_con_ars.py`, que fija los cortes ARS, instala la serie, entrena, "
       "selecciona y respalda la metadata GT en `models/metadata_antes_ars.json`."),
    code("""import subprocess
ars_parquet = config.DATA_INTERIM / "sensores_ars_horaria.parquet"
ars_dir = os.environ.get("MOBIPREDICT_ARS_DIR")
if not REENTRENAR:
    print("REENTRENAR = False: se conservan los modelos guardados.")
elif not ars_parquet.exists() and not (ars_dir and Path(ars_dir).exists()):
    print("No hay datos ARS (defina MOBIPREDICT_ARS_DIR con la carpeta Datos_camaras_ARS): el modelo queda en la versión GT.")
else:
    if not ars_parquet.exists():
        subprocess.run([sys.executable, "scripts/convertir_ars_a_sensores.py", "--entrada", ars_dir], check=True)
    subprocess.run([sys.executable, "scripts/reentrenar_con_ars.py"] + (["--fast"] if config.FAST else []), check=True)"""),
    md("## B.4 Tablas estandarizadas\nCon el modelo vigente, la serie de sensores es la de las cámaras ARS."),
    code("""sens = pd.read_parquet(config.SENSORES_STD)
print(f"{len(sens):,} lecturas horarias, {sens.tramo_id.nunique()} tramos, {sens.timestamp.min()} a {sens.timestamp.max()}")
pd.read_csv(config.TRAMOS_STD)[["tramo_id", "corredor", "sentido", "inicio", "fin", "longitud_km", "flujo_tipo", "macrozona"]]"""),
    code("""pd.read_csv(config.EOD_HORA_STD)[["hora", "viajes_publico", "viajes_privado", "viajes_no_motorizado", "viajes_informal", "viajes_total"]].round(0).head(24)"""),
    md("## B.5 EDA (serie GT 2017-2020)"),
    code("""from IPython.display import Image, Markdown, display
display(Markdown((config.EDA_REPORTS / "eda_report.md").read_text(encoding="utf-8")))"""),
    code("""for ruta in sorted(config.EDA_FIGURES.glob("*.png")):
    display(Markdown(f"**{ruta.name}**"))
    display(Image(filename=str(ruta), width=900))"""),
    md("## B.6 Features y split temporal"),
    code("""spec = json.loads((config.DATA_PROCESSED / "feature_spec.json").read_text(encoding="utf-8"))
print("Features:", len(spec["features"]))
print("Filas por partición:", spec["filas"])
print("Tasa de colapso:", spec["tasa_colapso"])
print("Sensores:", spec.get("fuente_sensores", "serie GT"))
print("Drift / holdout:", spec["ventana_drift"])
pd.read_parquet(config.DATA_PROCESSED / "train.parquet").head()"""),
    md("## B.7 Corridas en MLflow"),
    code("""import mlflow
mlflow.set_tracking_uri(config.MLFLOW_TRACKING_URI)
runs = mlflow.search_runs(experiment_names=[config.MLFLOW_EXPERIMENT], order_by=["start_time DESC"])
cols = ["tags.tarea", "tags.modelo", "metrics.valid_rmse", "metrics.valid_wape", "metrics.valid_pr_auc",
        "metrics.valid_recall_colapso", "metrics.test_rmse", "metrics.test_pr_auc", "tags.seleccionado"]
runs[runs["tags.tarea"].notna()][[c for c in cols if c in runs.columns]].head(12)"""),
    code("""for m in mlflow.MlflowClient().search_registered_models():
    print(m.name, dict(m.aliases or {}))"""),
    md("## B.8 Comparación y decisión"),
    code("""comp = pd.read_csv(config.COMPARISON_FILE)
display(comp[comp.tarea == "velocidad"][["modelo", "seleccionado", "valid_rmse", "valid_wape", "test_mae", "test_rmse", "drift_mae", "latencia_ms_1000"]])
display(comp[comp.tarea == "colapso"][["modelo", "seleccionado", "valid_pr_auc", "valid_recall_colapso", "test_pr_auc", "test_recall_colapso", "test_precision_colapso", "umbral"]])"""),
    code("""display(Markdown(config.DECISION_FILE.read_text(encoding="utf-8")))"""),
    code("""import matplotlib.pyplot as plt, joblib
from mobipredict.features import FEATURES_NUM
modelo = joblib.load(config.MODEL_SPEED_FILE)
test = pd.read_parquet(config.DATA_PROCESSED / "test.parquet")
t = test[test.tramo_id == "AVENIDA_80_NS"].sort_values("timestamp")
t = t[t.timestamp.dt.normalize().isin(t.timestamp.dt.normalize().drop_duplicates().iloc[5:10])]
x = t["timestamp"] + pd.Timedelta(hours=1)
fig, ax = plt.subplots(figsize=(11, 3.8))
ax.plot(x, t["y_velocidad_1h"], "o-", color="#52514e", ms=3, lw=1.2, label="Observada")
ax.plot(x, modelo.predict(t[FEATURES_NUM]), "o-", color="#2a78d6", ms=3, lw=1.6, label="Predicha a 1 h")
ax.set_title("Avenida 80 (NS): velocidad observada vs. predicha, 5 días de prueba", loc="left")
ax.set_ylabel("km/h"); ax.legend(frameon=False); ax.grid(alpha=.3)
plt.show()"""),

    md("---\n# Parte C — Servicio y despliegue"),
    code("""from fastapi.testclient import TestClient
from api.main import app
from api.schemas import EJEMPLO_OBS, EJEMPLO_TRAMO
with TestClient(app) as cliente:
    print(cliente.get("/health").json())
    display(pd.Series({k: v for k, v in cliente.get("/valor").json().items() if not isinstance(v, dict)}).to_frame("valor en prueba"))
    r = cliente.post("/predict", json={"tramo_id": EJEMPLO_TRAMO, "observaciones": EJEMPLO_OBS})
    display(pd.Series(r.json()).to_frame("respuesta"))"""),
    code("""!"{sys.executable}" -m pytest -q tests"""),
    md("""## Despliegue

```bash
python scripts/descargar_datos.py && python run_pipeline.py      # serie GT + EDA
python scripts/convertir_ars_a_sensores.py --entrada <carpeta>   # serie ARS
python scripts/reentrenar_con_ars.py                             # modelo vigente
uvicorn api.main:app --port 8000
docker compose up --build                  # trainer -> API (:8000) + MLflow UI (:5000)
```

Fuentes, licencias y tratamiento de calidad: `docs/fuentes_de_datos.md` y `data/fuentes_datos.csv`."""),
]

nb = nbf.v4.new_notebook(cells=celdas, metadata={
    "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
    "language_info": {"name": "python"},
})
OUT.parent.mkdir(exist_ok=True)
nbf.write(nb, OUT)
print(f"Notebook generado: {OUT.relative_to(ROOT)} ({len(celdas)} celdas)")
