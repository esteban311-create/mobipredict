# MobiPredict — Movilidad urbana del Valle de Aburrá con datos reales

Flujo MLOps de extremo a extremo que pronostica la **velocidad de los corredores viales de Medellín a 1 hora** (con las cámaras ARS/CCTV del SIMM, sep-2019 a sep-2026), emite **alertas tempranas de colapso** y caracteriza la **demanda y la densidad de viajes** con la **Encuesta Origen-Destino 2025 (AMVA)**. Todo con datos abiertos y reales; no hay datos simulados.

```
Fuentes oficiales ─► Estandarización ─► EDA ─► Features + split temporal ─► Entrenamiento + Optuna ─► MLflow ─► Selección ─► API + Frontend
(data/raw)          (data/interim)     (eda/)   (data/processed)             (RandomizedSearchCV)       (mlruns/)  (models/, docs/) (FastAPI, :8000)
```

> **¿Qué problema resuelve y para quién?** Ver **[docs/problema_usuarios_valor.md](docs/problema_usuarios_valor.md)**: en 2025, el 29 % de los colapsos viales empezó en una vía que circulaba bien una hora antes; MobiPredict anticipa el 38 % de ellos, y en total detecta el 79 % de los colapsos con una hora de ventaja (la regla reactiva actual, 71 %).
>
> ¿Primera vez? Empieza por **[LEEME_PRIMERO.md](LEEME_PRIMERO.md)**: guía simple con todos los pasos para ejecutarlo en Windows.
>
> Cómo usar la aplicación, cómo genera valor, fortalezas, debilidades y diferencias con Waze y Google Maps: **[docs/guia_uso_y_valor.md](docs/guia_uso_y_valor.md)**.
>
> Diapositivas (guía + proceso de datos/EDA/modelo): **[docs/MobiPredict_para_dummies.pptx](docs/MobiPredict_para_dummies.pptx)**.
>
> Informe técnico completo (cómo funciona cada etapa, cómo se construyeron los datos, decisiones y limitaciones): **[README_DETALLADO.md](README_DETALLADO.md)**.

Orquestado con **Prefect** y ejecutable con un comando:

```bash
python run_pipeline.py
```

## Fuentes de datos

| Uso | Fuente | Cobertura |
| --- | --- | --- |
| **Serie del modelo actual** | Cámaras ARS/CCTV del SIMM — Observatorio de Movilidad de Medellín (exportación de bases diarias, no es descarga pública) | 22 tramos de 11 corredores, cada hora 6:00-20:00, sep-2019 a sep-2026 (744.375 filas horarias de 2.368 archivos diarios útiles) |
| Serie del modelo anterior y del EDA | [Velocidad y tiempo de viaje GT](https://www.datos.gov.co/d/7t5n-3b3w) — SIMM, Secretaría de Movilidad de Medellín (MEData) | 22 tramos de 11 corredores, cada hora 6:00-20:00, feb-2017 a dic-2020 (682.502 filas) |
| Demanda y densidad | [EOD 2025 — API del visor oficial](https://eod2025.metropol.gov.co/) (AMVA) | 6.490.299 viajes en día hábil, viajes por hora y modo, reparto modal, motorización, matriz OD de 67 macrozonas |
| Siniestralidad | [Mendeley Data doi:10.17632/r6g5dfnpgh.1](https://doi.org/10.17632/r6g5dfnpgh.1) (CC BY 4.0) | 702.540 incidentes, 2008 a ago-2025 |
| Lluvia | [Open-Meteo Historical Weather](https://open-meteo.com/en/docs/historical-weather-api) (ERA5) | Horaria 2019-2026 (modelo ARS); 2017-2020 (modelo GT) |
| Composición vehicular | [Aforos vehiculares](https://www.datos.gov.co/d/b9s9-jw7c) (MEData) | 2017-2019, ~40 % motos |
| Festivos | Paquete `holidays` (Colombia) | 2017-2026 |
| Cifras de referencia | [276 muertes viales en 2025](https://www.elcolombiano.com/medellin/balance-de-accidentalidad-en-medellin-el-ano-pasado-PF32374139); [+48 % motos, −14 % TP (2017-2025)](https://www.elcolombiano.com/medellin/movilidad-habitantes-medellin-aburra-disminucion-teletrabajo-DD36063145) | 2025 |

- Catálogo completo con URLs de descarga, licencias y tamaños: [`data/fuentes_datos.csv`](data/fuentes_datos.csv).
- Problemas de calidad encontrados y su tratamiento: [`docs/fuentes_de_datos.md`](docs/fuentes_de_datos.md).
- Ya incluidos en el repositorio: los agregados oficiales de la EOD 2025 (`data/reference/eod2025/`, incluida la matriz OD de 3.126 pares que suma 6.490.299 viajes), el diccionario y los centroides de las macrozonas, y la ubicación de las cámaras del SIMM.

## Inicio rápido

Requisitos: Python 3.11-3.13 (probado con 3.12) y conexión a internet para la primera descarga (~175 MB).

```bash
py -3.12 -m venv .venv             # Windows   (Linux/Mac: python3 -m venv .venv)
source .venv/Scripts/activate      # Git Bash  (PowerShell: .venv\Scripts\Activate.ps1 · Linux/Mac: source .venv/bin/activate)
pip install -r requirements-dev.txt

# 1) Descargar las fuentes reales a data/raw/ (cualquiera de las dos)
python scripts/descargar_datos.py
powershell -ExecutionPolicy Bypass -File scripts\descargar_datos.ps1

# 2) Pipeline completo: estandarización, EDA, features, entrenamiento, MLflow, selección
python run_pipeline.py             # completo (~15-25 min)
python run_pipeline.py --fast      # menos trials de búsqueda (~5 min)

# 3) Frontend + API y seguimiento
uvicorn api.main:app --port 8000                                                    # frontend: http://localhost:8000  ·  API: /docs
set MLFLOW_ALLOW_FILE_STORE=true && mlflow ui --backend-store-uri ./mlruns --port 5000   # http://localhost:5000
```

> **Modelo actual (cámaras ARS).** `run_pipeline.py` reproduce el modelo anterior con la serie abierta GT 2017-2020. Los modelos de `models/` están entrenados con las cámaras ARS y se reproducen así (necesita la carpeta de exportación diaria `Datos_camaras_ARS`, que no se descarga sola):
>
> ```bash
> python scripts/convertir_ars_a_sensores.py --entrada "<carpeta Datos_camaras_ARS>"   # -> data/interim/sensores_ars_horaria.parquet (~1 h)
> python scripts/reentrenar_con_ars.py                                                 # cortes 2019-09 / 2024 / 2025 / 2026, respalda la metadata GT
> ```
>
> Ojo: `run_pipeline.py` vuelve a estandarizar la serie GT y reemplaza a la ARS en `data/interim/sensores_velocidad_horaria.parquet`.

`run_pipeline.py` descarga solo lo que falte en `data/raw/`. Si la API de la EOD no responde, usa la copia oficial de `data/reference/eod2025/`. Si falta una fuente obligatoria (velocidad, clima), se detiene con un mensaje claro: nunca inventa datos.

## Estructura

```
mobipredict/
├── run_pipeline.py                 # Punto de entrada (flujo Prefect)
├── scripts/
│   ├── descargar_datos.py          # Descarga todas las fuentes (multiplataforma)
│   ├── descargar_datos.ps1         # Igual, en PowerShell (Windows)
│   └── build_notebook.py           # Regenera el notebook desde el código
├── src/mobipredict/
│   ├── config.py                   # URLs oficiales, rutas, ventanas temporales, parámetros
│   ├── data_acquisition.py         # Descarga con reintentos + manifest.json (origen, tamaño, hash)
│   ├── fuentes.py                  # Lectura, validación y estandarización de cada fuente
│   ├── eda.py                      # 9 figuras y reportes con datos reales
│   ├── features.py                 # Features espaciotemporales + EOD, split temporal
│   ├── training.py                 # Candidatos, RandomizedSearchCV/Optuna, MLflow
│   ├── selection.py                # Reglas de selección, comparación, decisión
│   └── pipeline.py                 # @flow y @task de Prefect
├── api/                            # FastAPI: /health, /tramos, /predict, /escenarios, /modelos…
├── frontend/                       # Página web (HTML/CSS/JS sin dependencias) servida en /
├── tests/                          # Pruebas con un extracto real (fixtures/)
├── notebooks/MobiPredict_MLOps_end_to_end.ipynb
├── data/
│   ├── fuentes_datos.csv           # Catálogo de fuentes y enlaces
│   ├── reference/                  # Tablas oficiales pequeñas (versionadas)
│   ├── raw/                        # Descargas (no versionadas)
│   ├── interim/                    # Tablas estandarizadas
│   └── processed/                  # train / valid / test / drift .parquet
├── eda/figures/  eda/reports/
├── models/                         # Ganadores, feature store, model_comparison.csv
├── docs/                           # model_decision.md, fuentes_de_datos.md
├── mlruns/                         # Tracking local de MLflow
└── Dockerfile  docker-compose.yml  Makefile  requirements*.txt
```

## Componentes

### 1. Adquisición (`data_acquisition.py`, `fuentes.py`)

Cada fuente se toma de `data/raw/` si ya existe; si no, se descarga de la URL oficial con reintentos. El resultado queda en `data/raw/manifest.json` con origen, URL, tamaño y hash. `fuentes.py` valida y estandariza:

- **Velocidad ARS** (`scripts/convertir_ars_a_sensores.py`): de cada archivo diario de cámaras se toman los 11 corredores del proyecto (con nombres unificados, p. ej. "Carrera 57 - Avenida Ferrocarril" → Avenida Ferrocarril), las lecturas de 2-110 km/h y las horas 6-20; se corrigen latitud/longitud invertidas y se promedia la velocidad por tramo y hora. El tiempo de viaje se estima con la longitud del tramo, porque la cámara mide velocidad en un punto. De 2.601 archivos, 233 no traían lecturas útiles.
- **Velocidad GT** (modelo anterior y EDA): la fecha sale de `FECHA_HORA`, porque las columnas `DÍA` y `MES` están corridas en parte de 2020. Las lecturas cada 30 minutos de 2020 y los 9.699 duplicados se promedian por hora. Los valores fuera de 2-110 km/h se descartan.
- **Tramos:** corredor + sentido. Cada tramo tiene longitud, tipo de flujo, ubicación (cámaras del SIMM) y macrozona EOD más cercana.
- **EOD 2025:** distribución horaria por grupo modal y matriz OD por macrozona.
- **Siniestros:** se lee el XLSX (hoja `BD`) y se guarda en parquet.

### 2. EDA (`eda.py`)

Las 9 figuras se generaron con la serie abierta GT 2017-2020 (antes del cambio a cámaras ARS) y siguen siendo el diagnóstico histórico del problema. Las cifras con ARS (2019-2026) están en [docs/problema_usuarios_valor.md](docs/problema_usuarios_valor.md).

| Figura | Hallazgo |
| --- | --- |
| `01_congestion_cronica_heatmap` | Congestión por tramo y hora en días laborables, pre-pandemia |
| `02_eod2025_viajes_por_hora` | 6,49 M de viajes; pico de salida a las 6 h |
| `03_eod2025_reparto_modal` | A pie 32,7 %; la moto (14,6 %) supera al auto (11,7 %); 120,5 motos por 1.000 hab. |
| `04_eod2025_densidad_destinos` | La Candelaria y El Poblado atraen más viajes |
| `05_siniestralidad_vial` | Incidentes fatales por año 2008-2025 y por hora; cierre 2025: 276 muertes |
| `06_horas_en_colapso_por_tramo` | % de horas con velocidad < 50 % de la referencia |
| `07_drift_pandemia` | Caída de la congestión desde el 20-mar-2020 |
| `08_lluvia_vs_colapso` | Más colapso en hora pico con lluvia fuerte |
| `09_composicion_vehicular_aforos` | ~40 % de los vehículos aforados son motos |

### 3. Features y split (`features.py`)

- **Tiempo:** hora, día y mes cíclicos; fin de semana, pico, festivo.
- **Rezagos:** velocidad y razón vel/vel-referencia en t-1, t-2, t-3 h, media de 3 h y tendencia. Los rezagos no cruzan la noche.
- **Clima:** lluvia actual y de las últimas 3 h.
- **Espacio:** longitud, tipo de flujo, ubicación y velocidad de referencia (p95 del entrenamiento) del tramo.
- **Perfil histórico:** velocidad media del tramo por tipo de día y hora objetivo, calculada solo con entrenamiento.
- **EOD 2025:** participación horaria de viajes privados, públicos y totales en la hora objetivo, y viajes generados y atraídos por la macrozona del tramo.
- **Targets:** velocidad en t+1 h (regresión) y colapso en t+1 h = velocidad < 50 % de la referencia (clasificación).
- **Split temporal (modelo actual, ARS):** 2019-09-01 ≤ entrenamiento < 2024-01-01 ≤ validación < 2025-01-01 ≤ prueba < 2026-01-01 ≤ drift / holdout reciente ≤ 2026-09-03. La pandemia (2020) queda dentro del entrenamiento. Filas: 423.483 / 84.172 / 111.484 / 70.606; tasa de colapso 7,3 % / 11,2 % / 11,9 % / 13,9 %.
- **Split temporal (modelo GT anterior):** entrenamiento < 2019-09-01 ≤ validación < 2019-12-01 ≤ prueba < 2020-03-20 ≤ drift (pandemia) < 2021. Los cortes se cambian con las variables `MOBIPREDICT_FECHA_INICIO`, `MOBIPREDICT_CORTE_VALID`, `MOBIPREDICT_CORTE_TEST`, `MOBIPREDICT_FIN_TEST` y `MOBIPREDICT_FIN_DRIFT`.

### 4-6. Entrenamiento, optimización y MLflow (`training.py`)

| Tarea | Línea base | Candidatos | Búsqueda |
| --- | --- | --- | --- |
| Velocidad a 1 h | Perfil histórico | Ridge, Random Forest, LightGBM, red neuronal MLP | RandomizedSearchCV / Optuna con `TimeSeriesSplit` |
| Colapso a 1 h | Regla de velocidad | Regresión logística, Random Forest, LightGBM | RandomizedSearchCV / Optuna (`average_precision`) |

Cada modelo es un run anidado en MLflow con parámetros, métricas `valid_*`, `test_*` y `drift_*` (MAE, RMSE, WAPE, R², precisión, recall, F1, PR-AUC, Brier, falsas alarmas por día), importancias y el modelo. Los ganadores se registran como `mobipredict-velocidad` y `mobipredict-colapso` con alias `champion`.

### 7. Selección (`selection.py`)

Reglas fijadas antes de ver resultados y aplicadas en validación:

- **Velocidad:** debe mejorar ≥ 10 % el WAPE del perfil histórico. Gana el menor RMSE; si otro queda a menos de 1 %, gana el más rápido.
- **Colapso:** solo modelos con recall ≥ 0,70. Gana la mayor PR-AUC; si empatan (< 0,005), el de menor Brier.

Salidas: `models/model_comparison.csv` y `docs/model_decision.md`. Este último incluye la prueba de estrés en el holdout reciente (ene-sep 2026).

**Ganadores actuales (ARS, prueba = 2025):**

| Tarea | Ganador | Prueba | Holdout 2026 | Referencia |
| --- | --- | --- | --- | --- |
| Velocidad a 1 h | Red neuronal MLP | MAE 1,50 km/h, RMSE 2,11, WAPE 5,9 % | MAE 1,74 km/h | Perfil histórico: WAPE 17,6 % |
| Colapso a 1 h | LightGBM (umbral 0,348) | PR-AUC 0,841, recall 0,79, precisión 0,74 | PR-AUC 0,842 | Regla de velocidad: PR-AUC 0,669 |

Con la serie GT el ganador era LightGBM (velocidad, RMSE 3,61) y Random Forest (colapso, PR-AUC 0,64); su metadata queda en `models/metadata_antes_ars.json` y se compara en `GET /reentrenamiento`. Las cifras no son comparables 1 a 1: cambian el sensor (punto frente a corredor) y el periodo.

## API

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/health` | Estado y modelos cargados |
| GET | `/tramos` | Los 22 tramos con su `tramo_id` y coordenadas (`lat`, `lon`) |
| GET | `/dias` | Días reales que se pueden repetir (`?periodo=test` o `drift`) con colapsos reales, colapsos sin aviso y lluvia |
| GET | `/replay/{fecha}` | Repite un día real hora a hora: predicción del modelo frente a lo medido en cada vía, resumen frente a la regla reactiva y totales por hora |
| POST | `/predict` | Velocidad y tiempo de viaje a 1 h, probabilidad y alerta de colapso |
| POST | `/predict/batch` | Hasta 500 peticiones |
| GET | `/escenarios` | Momentos reales del periodo de prueba (y uno del holdout 2026) |
| GET | `/escenarios/{id}` | Lecturas de cada tramo hasta la hora t y la velocidad medida en t + 1 h |
| GET | `/modelos` | Ganadores, razones de la selección y métricas de todos los candidatos |
| GET | `/figuras/{archivo}` | Figuras del EDA |
| GET | `/valor` | Cifras de valor en todo el periodo de prueba (colapsos sin aviso, anticipados, frente a la regla reactiva) |
| GET | `/reentrenamiento` | Campeón anterior (GT 2017-2020) frente al actual (ARS 2019-2026) |
| GET | `/envivo` | Riesgo de colapso en la próxima hora con tráfico en tiempo real |
| POST | `/envivo/recolectar` · `/envivo/ruta` | Ronda de lecturas en vivo · rutas sugeridas según el riesgo |
| POST | `/admin/reload` | Recarga modelos tras reentrenar |

```bash
curl -X POST http://localhost:8000/predict -H "Content-Type: application/json" -d '{
  "tramo_id": "AVENIDA_80_NS",
  "observaciones": [
    {"timestamp": "2025-02-11T14:00:00", "velocidad_kmh": 24.0, "lluvia_mm": 0.0},
    {"timestamp": "2025-02-11T15:00:00", "velocidad_kmh": 22.0, "lluvia_mm": 0.0},
    {"timestamp": "2025-02-11T16:00:00", "velocidad_kmh": 19.0, "lluvia_mm": 0.4},
    {"timestamp": "2025-02-11T17:00:00", "velocidad_kmh": 15.0, "lluvia_mm": 1.2}
  ]}'
```

La respuesta trae `velocidad_predicha_kmh`, `tiempo_viaje_predicho_min`, `probabilidad_colapso`, `alerta_colapso` y `nivel` (`normal`, `precaucion` o `colapso`).

## Frontend

Al encender la API, **http://localhost:8000** abre la aplicación web (no requiere instalar nada más):

Un **centro de anticipación vial**: mapa oscuro de Medellín con las vías coloreadas por riesgo, que repite días reales hora a hora (`/replay/{fecha}`). Todas las cifras salen de los modelos a través de la API.

- **Historia** (botón ▶ Historia): modo presentación en 4 pasos (problema → punto ciego → solución → demo), con las cifras de `/valor`.
- **Centro de control:** "dónde actuar primero" (ranking por probabilidad), filtro de **avisos tempranos** (vías que hoy fluyen y en 1 h colapsan), cifras de valor que se acumulan durante el día (colapsos anticipados, detección y precisión frente a la regla reactiva, error del tiempo de viaje) y el resultado real de cada alerta (✓/✗).
- **Detalle por vía:** el día completo (medido frente a predicho 1 h antes), la probabilidad hora a hora y **"¿y si empieza a llover?"**, que vuelve a llamar a `/predict` con otra lluvia.
- **Mi viaje:** para el ciudadano: "sal ahora", "espera" o "evita esta vía", con el tiempo de viaje ahora frente a dentro de 1 h.
- **Máquina del tiempo:** reproducir/pausar (barra espaciadora, flechas ← →), calendario de los 603 días reales (prueba 2025 y holdout ene-sep 2026) y la opción "Revelar lo que pasó".
- **Evidencia:** cifras de valor, modelos ganadores, comparación de candidatos y los 9 gráficos del EDA.

La URL guarda el día y la hora (`/app/#fecha=2025-12-18&h=16`) para abrir la demo directamente en un momento. Leaflet va incluido en `frontend/vendor/`; sin internet solo se pierde el fondo del mapa.

## Docker

```bash
python scripts/descargar_datos.py        # o el .ps1; los datos se montan como volumen
docker compose up --build                # trainer -> frontend + API (:8000) + MLflow UI (:5000)
docker compose --profile orquestacion up # + Prefect UI (:4200)
RETRAIN=1 docker compose up trainer      # reentrenar
```

## Pruebas

```bash
pytest -q tests
```

- `test_features.py` corre sobre un extracto real (Av. 80 y Autopista Sur, 10-11 feb 2020). Verifica el parser de fechas, la agregación horaria, que los rezagos no crucen la noche, que no haya fuga en los targets y que las features de la API sean idénticas a las de entrenamiento.
- `test_fuentes.py` verifica que se lea el Excel de datos de siniestralidad (y no el diccionario que viene en el mismo ZIP).
- `test_api.py` prueba los endpoints, el frontend y los escenarios una vez entrenados los modelos.

## Limitaciones

- La serie ARS es una exportación de las cámaras hasta el 3-sep-2026, no un feed en línea, y no se descarga sola: quien clone el repositorio necesita esa carpeta para reproducir el modelo actual. Para operar hay que conectar el feed del SIMM.
- Las cámaras ARS miden velocidad en un punto (cámara/carril), no tiempo de viaje del corredor; el tiempo de viaje se estima con la longitud del tramo. La serie GT anterior venía de tiempos de viaje de Google Traffic agregados por la Alcaldía.
- Las figuras del EDA siguen siendo de la serie GT 2017-2020.
- No hay conteos de flujo vehicular abiertos y continuos; por eso el modelo predice velocidad y tiempo de viaje en lugar de flujo.

## Modo en vivo (tráfico en tiempo real)

La pestaña **En vivo** predice el riesgo de colapso de la próxima hora con tráfico actual.

1. Copie `.env.example` como `.env` y pegue al menos una clave: `TOMTOM_API_KEY`, `HERE_API_KEY` o `GOOGLE_MAPS_API_KEY`.
   La lluvia sale de Open-Meteo y no necesita clave. El archivo `.env` está en `.gitignore`.
2. Arranque la API (`uvicorn api.main:app --port 8000`). Si hay alguna clave, la API recolecta sola en segundo plano
   (TomTom cada 15 min, HERE cada 30 y Google cada 120, de 5 a 21 h). También se puede correr aparte:
   `python scripts/recolector_envivo.py` (`--una-vez` para una ronda de prueba, `--estado` para ver los cupos).
3. Tras 4 horas seguidas de lecturas por vía, el modelo empieza a predecir. Endpoints: `GET /envivo`, `POST /envivo/recolectar`.

Cada proveedor tiene un cupo diario (`MOBIPREDICT_CUPO_<PROVEEDOR>`) y se pausa solo si la API responde que la cuota
se agotó o la clave no sirve; los demás siguen funcionando. Las velocidades de cada proveedor se pasan a la escala del
SIMM con su índice de congestión (velocidad actual / flujo libre × velocidad de referencia del tramo): es una
aproximación, porque el modelo se entrenó con las cámaras ARS del SIMM 2019-2026. Lecturas en `data/envivo/lecturas.sqlite`.
