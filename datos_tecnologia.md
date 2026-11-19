# MobiPredict: datos para las diapositivas de tecnología, viabilidad y escalabilidad

Generado el 2026-11-14 en la rama `pruebas`; las secciones de viabilidad (tiempos, tamaños), drift, reentrenamiento y valor se actualizaron el 2026-11-19 con los modelos entrenados con las cámaras ARS (2019-2026). Cada dato sale del código, de los archivos de dependencias o de comandos ejecutados en este equipo; al lado se indica de dónde. Las cifras van redondeadas para diapositivas. Lo que no se pudo saber dice **no disponible** y por qué.

Equipo donde se midió: Windows 11 Home (10.0.26200), Intel de 12 núcleos lógicos, 15,7 GB de RAM y GPU NVIDIA RTX 3050 Laptop (el código no la usa).

---

## 1. Stack

### Lenguaje

| Dato | Valor | Fuente |
|---|---|---|
| Lenguaje | Python | todo el repo |
| Versión con la que se ejecutó todo aquí | Python 3.13.0 | `.venv/Scripts/python --version` |
| Versión declarada como probada | Python 3.12 (Windows y Linux) | comentario de `requirements.txt` y `requirements-lock.txt` |
| Versión de la imagen Docker | `python:3.12-slim` (Linux) | `Dockerfile` |

### Librerías principales

Las versiones instaladas salen de `pip list` en `.venv`. El lock es `requirements-lock.txt` (Python 3.12, 2026-10-27).

| Uso | Librería | Instalada | En el lock | Rango en `requirements.txt` |
|---|---|---|---|---|
| Datos | pandas | 3.1.1 | 3.1.0 | >=2.2,<4 |
| Datos | numpy | 2.5.4 | 2.5.4 | >=1.26,<3 |
| Datos | pyarrow (parquet) | 25.0.1 | 25.0.1 | >=15,<26 |
| Datos | scipy | 1.18.1 | 1.18.1 | >=1.12,<2 |
| Modelos | scikit-learn | 1.9.1 | 1.9.1 | >=1.5,<2 |
| Modelos | LightGBM | 4.7.0 | 4.7.0 | >=4.3,<5 |
| Búsqueda de hiperparámetros | Optuna | 5.0.0 | 5.0.0 | >=3.6,<6 |
| Guardado de modelos | joblib | 1.6.0 | 1.6.0 | >=1.3,<2 |
| Gráficas del EDA | matplotlib | 3.11.2 | 3.11.2 | >=3.8,<4 |
| Experimentos y registro | MLflow | 3.18.0 | 3.17.2 | >=2.16,<4 |
| Orquestación | Prefect | 3.9.2 | 3.9.0 | >=3.0,<4 |
| API | FastAPI | 0.150.0 | 0.150.0 | >=0.110,<1 |
| Servidor | Uvicorn | 0.54.0 | 0.54.0 | >=0.29,<1 |
| Validación | Pydantic | 2.14.3 | 2.14.1 | >=2.6,<3 |
| HTTP (APIs en vivo y descarga) | httpx | 0.28.1 | 0.28.1 | >=0.27,<1 |
| Festivos de Colombia | holidays | 0.108 | 0.107 | >=0.50,<1 |
| Leer Excel (siniestros) | openpyxl | 3.1.5 | 3.1.5 | >=3.1,<4 |
| Pruebas | pytest | 9.2.0 | no está en el lock | >=8 (`requirements-dev.txt`) |

El proyecto no tiene `pyproject.toml`.

### API

- **Framework:** FastAPI 1.0.0 con Uvicorn (`api/main.py`).
- **Esquemas:** Pydantic (`api/schemas.py`).
- **Documentación automática:** en `/docs`.
- **Frontend:** la misma API lo sirve como archivos estáticos en `/app` y las figuras del EDA en `/figuras`. No hace falta un servidor aparte.

### Frontend

- **Tecnología:** HTML, CSS y JavaScript puro, sin React ni ningún framework y sin paso de compilación (`frontend/index.html`, `app.js` de 1023 líneas, `styles.css`).
- **Mapas:** Leaflet 1.9.4, incluido en `frontend/vendor/leaflet/`, así que funciona sin CDN.
- **Mapa base:** Esri World Dark Gray (`server.arcgisonline.com`, sin clave de API según el comentario en `app.js`).
- **Fuentes tipográficas:** Google Fonts (Barlow).

### Dónde se guardan los modelos y los datos

| Qué | Formato | Ruta |
|---|---|---|
| Modelos ganadores | joblib (Pipeline de scikit-learn) | `models/modelo_velocidad.joblib`, `models/modelo_colapso.joblib` |
| Todos los candidatos | joblib | `models/candidatos/*.joblib` (9 archivos) |
| Feature store (tramos, perfiles, festivos) | joblib | `models/feature_store.joblib` |
| Metadata del modelo (umbral, features, métricas) | JSON | `models/metadata.json` |
| Comparación de modelos | CSV | `models/model_comparison.csv` |
| Datos crudos | CSV, JSON y ZIP con Excel | `data/raw/` |
| Datos estandarizados | parquet y CSV | `data/interim/` |
| Particiones train, valid, test y drift | parquet | `data/processed/` |
| Experimentos y Model Registry | MLflow, backend de archivos | `mlruns/` |
| Lecturas en vivo | SQLite | `data/envivo/lecturas.sqlite` |

`.gitignore` excluye de Git los `.joblib`, `data/` y `mlruns/`.

---

## 2. Flujo de punta a punta

El pipeline es un flow de Prefect (`src/mobipredict/pipeline.py`) con seis tareas. Se lanza con `python run_pipeline.py`.

| # | Paso | Qué hace | Archivo o módulo |
|---|---|---|---|
| 1 | Adquisición | Descarga las 5 fuentes a `data/raw/` (con SHA-256 y manifest). Tiene 1 reintento. | `data_acquisition.py` (tarea `adquisicion-datos`); también `scripts/descargar_datos.py` |
| 2 | Estandarización | Pasa los sensores a una serie horaria por tramo y procesa clima, festivos, EOD, siniestros y aforos. Escribe `data/interim/`. | `fuentes.py` (tarea `estandarizacion-fuentes`) |
| 3 | EDA | Genera las figuras en `eda/figures/` y el reporte. | `eda.py` (tarea `eda`) |
| 4 | Features | Construye 35 variables y los targets a 1 h. Divide en train, valid, test y drift. Guarda el feature store y los escenarios. | `features.py` (tarea `feature-engineering`) |
| 5 | Entrenamiento | Entrena 5 regresores y 4 clasificadores con Optuna o RandomizedSearch y validación temporal. Registra cada uno en MLflow. | `training.py` (tarea `entrenamiento-optimizacion-mlflow`) |
| 6 | Selección | Elige el ganador de cada tarea, lo registra con alias `champion` y escribe `metadata.json` y `docs/model_decision.md`. | `selection.py` (tarea `seleccion-modelo`) |
| 7 | Servicio | La API carga los modelos al arrancar. `POST /admin/reload` los recarga después de reentrenar. | `api/main.py` |
| 8 | Predicción | Calcula las features de inferencia, la velocidad a 1 h, la probabilidad de colapso y el nivel: `normal` < 0,6 × umbral ≤ `precaucion` < umbral ≤ `colapso`, con umbral = 0,66. | `features.features_inferencia` + `api/main.py:_predecir`; días reales en `api/replay.py` |
| 9 | En vivo (opcional) | Un hilo consulta TomTom, HERE y Google, guarda en SQLite y predice cuando un tramo tiene 4 h seguidas de lecturas. | `envivo.py`, `rutas.py`, `scripts/recolector_envivo.py` |
| 10 | El usuario ve la alerta | El navegador llama a la API y pinta el mapa, el ranking y las alertas. | `frontend/app.js` |

### Endpoints de la API

Listados con `grep @app.` en `api/main.py`: 17 rutas, más dos montajes estáticos.

| Método | Ruta | Qué devuelve |
|---|---|---|
| GET | `/` | Redirige al frontend `/app/` |
| GET | `/health` | Estado del servicio, modelos cargados, horizonte y fecha de entrenamiento |
| GET | `/tramos` | Catálogo de los 22 tramos: corredor, sentido, longitud, velocidad de referencia, macrozona y lat/lon |
| POST | `/predict` | Para un tramo con sus lecturas recientes: velocidad y tiempo de viaje a 1 h, probabilidad de colapso, alerta y nivel |
| POST | `/predict/batch` | Lo mismo para varias peticiones, más el total de alertas |
| GET | `/escenarios` | Lista de momentos reales del periodo de prueba |
| GET | `/escenarios/{id}` | Lecturas de todos los tramos en ese momento y lo que pasó en la hora siguiente |
| GET | `/dias` | Días reales que se pueden repetir (test o drift), con colapsos, colapsos sin aviso y lluvia |
| GET | `/replay/{fecha}` | El modelo predice hora a hora un día real y lo compara con lo medido |
| GET | `/valor` | Cifras de valor de todo el periodo de prueba: alertas, aciertos, colapsos anticipados, regla reactiva y error del tiempo de viaje |
| GET | `/modelos` | Modelos ganadores, umbrales, comparación de candidatos y lista de figuras |
| GET | `/envivo` | Riesgo de colapso en la próxima hora para cada tramo con tráfico en tiempo real, más el estado de los proveedores y la lluvia |
| POST | `/envivo/recolectar` | Consulta ya a los proveedores (respeta cupos y pausas) |
| POST | `/envivo/ruta` | Hasta 3 rutas de Google entre origen y destino con el riesgo de los tramos por los que pasa cada una, y la recomendada |
| POST | `/admin/reload` | Recarga los modelos desde disco |
| (estático) | `/app/*` | Frontend |
| (estático) | `/figuras/*` | Figuras PNG del EDA |

FastAPI también expone `/docs` y `/openapi.json`.

### Vistas de la app

Las pestañas están en `frontend/index.html`, líneas 25–29:

1. **Centro de control:** mapa con los 22 tramos, KPIs del día y ranking «Dónde actuar primero» al repetir un día real (`/replay/{fecha}`).
2. **Mi viaje:** tiempo de viaje previsto y «¿y si llueve?» (`/predict`).
3. **Navegar:** rutas con riesgo de colapso (`/envivo/ruta`).
4. **En vivo:** riesgo con tráfico en tiempo real (`/envivo`, se refresca cada 60 s).
5. **Evidencia:** valor del periodo de prueba y comparación de modelos (`/valor`, `/modelos`).

---

## 3. Datos en vivo (pestaña En vivo)

Fuentes: `src/mobipredict/envivo.py`, `src/mobipredict/rutas.py`, `src/mobipredict/config.py`, `.env.example` y la base `data/envivo/lecturas.sqlite`, leída en modo de solo lectura.

### Proveedores y frecuencia

| Proveedor | API | ¿Llave? | Variable | Intervalo por defecto | Cupo diario por defecto |
|---|---|---|---|---|---|
| TomTom | Traffic Flow, Flow Segment Data v4 | Sí | `TOMTOM_API_KEY` | cada 15 min | 2400 consultas |
| HERE | Traffic API v7 `/flow` | Sí | `HERE_API_KEY` | cada 30 min | 1000 consultas |
| Google | Routes API `computeRoutes` (TRAFFIC_AWARE) | Sí | `GOOGLE_MAPS_API_KEY` | cada 120 min | 160 consultas |
| Google (Navegar) | Routes API, rutas alternativas | Sí, la misma | `GOOGLE_MAPS_API_KEY` | solo cuando el usuario busca | 100 búsquedas (`MOBIPREDICT_CUPO_RUTAS`) |
| Open-Meteo | Forecast, lluvia horaria | **No** | — | cada 30 min | sin cupo en el código |

- Cada ronda hace 22 consultas por proveedor, una por tramo.
- El recolector revisa cada 5 min (`MOBIPREDICT_ENVIVO_CICLO_MIN`) qué proveedor ya debe consultar.
- Por defecto recolecta de 5 a 21 h. El `.env` de este equipo lo cambia a 0–24 h.
- El recolector arranca solo con la API si hay al menos una llave (`MOBIPREDICT_ENVIVO_AUTO=auto`).
- Basta con una llave; con varias, el sistema combina las fuentes.
- Las tres llaves están configuradas en el `.env` de este equipo. Solo se revisó que tienen valor; no se leyeron las llaves.

### Costo y límites

- **Según el código:** los cupos por defecto están «pensados para no salir de los planes gratuitos» (`envivo.py:297`). Si un proveedor responde 429, se pausa 15 min. Si responde 401 o 403, se pausa el resto del día. Al llegar al cupo, se detiene hasta el día siguiente.
- **Google:** según `.env.example`, Google exige una cuenta de facturación aunque se quede dentro del uso gratuito.
- **Límite gratuito exacto de cada proveedor:** no disponible. El código no lo dice, y el propio comentario advierte que los planes cambian.

### Cómo se convierte la lectura

El modelo no recibe la velocidad del proveedor tal cual, sino su índice de congestión (velocidad actual / flujo libre) multiplicado por la velocidad de referencia del SIMM del tramo. La API advierte que esta aproximación no se ha validado con datos medidos.

### Uso real registrado en este equipo

Del 2026-11-08 al 2026-11-14 (7 días con lecturas):

| Proveedor | Lecturas guardadas | Tramos | Máximo de consultas en un día |
|---|---|---|---|
| TomTom | 3150 | 22 | 2112 (cupo 2400) |
| HERE | 1613 | 22 | 1000 (llegó al cupo) |
| Google | 444 | 22 | 160 (llegó al cupo) |
| Google rutas | — | — | 7 búsquedas |

El máximo de TomTom coincide con 24 h × 4 rondas × 22 tramos = 2112, que corresponde al horario 0–24 h del `.env`.

---

## 4. Viabilidad

### Tiempo de predicción

Medido el 2026-11-19 con los modelos guardados (ARS: red neuronal MLP para velocidad y LightGBM para colapso) y 1000 filas reales de `data/processed/test.parquet` (2025). Cada tiempo es la mediana de 50 repeticiones (1 fila), de 10 (1000 filas en lote) o de 30 (`POST /predict`).

| Medición | Tiempo |
|---|---|
| 1 predicción, modelo de velocidad (MLP) | 1,5 ms |
| 1 predicción, modelo de colapso (LightGBM) | 2,1 ms |
| 1 predicción, los dos modelos | ~4 ms |
| **1000 predicciones en un lote, los dos modelos** | **~12 ms** (0,012 ms por predicción) |
| 1000 predicciones una por una, los dos modelos | ~6 s (estimado con 200) |
| 1 llamada a `POST /predict` (API completa con features, sin red) | ~69 ms |
| `POST /predict/batch` con los 22 tramos | ~1,4 s |
| `GET /valor` (todo el test 2025: 111.484 predicciones) | 0,7 s |
| `GET /replay/{fecha}` (un día completo) | 0,2 s |
| Cargar los dos modelos | ~1,6 s |

**Por qué en lote es más rápido:** cada llamada a un modelo tiene un costo fijo. `/valor` y `/replay` predicen en lote; `/predict/batch` recorre las peticiones una a una (`api/main.py`, `predict_batch`), por eso tarda más que un lote directo.

La comparación guardada en el entrenamiento (`latencia_ms_1000` en `models/model_comparison.csv`) da 5,0 ms por 1000 filas para la MLP y 5,2 ms para LightGBM de colapso.

Con el modelo anterior (serie GT: LightGBM + Random Forest de 100 árboles) una predicción de colapso tardaba ~37 ms y 1000 en lote ~90 ms: el cambio de campeón hizo la API más rápida.

### Tamaño en disco

Medido con `stat` (1 MB = 10⁶ bytes).

| Archivo | Tamaño |
|---|---|
| `modelo_colapso.joblib` (LightGBM) | 0,59 MB |
| `modelo_velocidad.joblib` (red neuronal MLP) | 0,32 MB |
| `feature_store.joblib` | 1,15 MB |
| `escenarios.json` | 0,09 MB |
| `metadata.json` | 3 KB |
| Candidatos no elegidos (`models/candidatos/`, 9 archivos) | 110,9 MB en total (el más grande: Random Forest de velocidad, 71,3 MB) |
| Particiones `data/processed/` (ARS, 2019-2026) | 75,4 MB |

Lo que necesita la API para servir es **menos de 1 MB** de modelos (antes, con Random Forest, ~54 MB) más los parquets de test y drift (~21 MB) para la repetición de días.

### Tiempo de entrenamiento

- **Entrenamiento y optimización de los 9 candidatos:** 386 s, unos **6,4 min**.
  - Es la duración del run padre `pipeline-20261107-153713` en `mlruns/`.
  - Corrida completa, no rápida (`modo_rapido=False`): 25 trials de Optuna y 10 iteraciones de búsqueda aleatoria.
  - Fecha: 2026-11-07.
- **Pipeline completo** (descarga, estandarización, EDA, features y selección): **no disponible.** `pipeline.py` lo imprime en la consola («Pipeline completo en … s») pero no lo guarda en ningún archivo ni en MLflow.
  - `LEEME_PRIMERO.md` lo estima en 15–25 min (5–10 min con `--fast`). Es una estimación escrita, no una medición.

### Requisitos para correrlo

**Memoria medida en este equipo:**

| Momento | RAM del proceso de Python |
|---|---|
| Al iniciar | 88 MB |
| Con los modelos cargados | 225 MB |
| API completa, después de `/valor` y `/replay` | ~420 MB |

**Requisitos declarados:**
- **RAM mínima:** no disponible; el repo no declara un mínimo.
- **CPU o GPU:** solo CPU. No hay ningún parámetro de GPU en `training.py`.
- **Sistema operativo:** Windows o Linux según `requirements.txt`. Docker usa Linux (`python:3.12-slim` + `libgomp1` para LightGBM).
- **Solo Windows:** `envivo.py` pide a Windows que no suspenda el equipo mientras recolecta; en otros sistemas esa parte se omite.

### Cómo se levanta

Comandos tomados de `Makefile` y `README.md`.

```bash
pip install -r requirements-dev.txt         # make install
python scripts/descargar_datos.py           # make datos   (solo descarga)
python run_pipeline.py                      # make pipeline (--fast = make fast)
uvicorn api.main:app --reload --port 8000   # make api   -> http://localhost:8000/
pytest -q tests                             # make test
mlflow ui --backend-store-uri ./mlruns --port 5000   # make mlflow-ui
python scripts/recolector_envivo.py         # make envivo (recolector aparte)
```

| ¿Hay…? | Respuesta | Fuente |
|---|---|---|
| Docker | **Sí.** `Dockerfile` (usuario sin privilegios, healthcheck en `/health`, Uvicorn con 2 workers) y `docker-compose.yml` con 4 servicios: `trainer` (entrena si no hay modelo; `RETRAIN=1` lo fuerza), `api` (:8000), `mlflow` (:5000) y `prefect` (:4200, perfil `orquestacion`). Docker 29.1.3 está instalado aquí. | `Dockerfile`, `docker-compose.yml` |
| CI | **No.** No hay `.github/`, `.gitlab-ci.yml` ni otro archivo de CI. | `ls` en la raíz |
| Despliegue en la nube | **No.** No hay configuración de nube (Procfile, render, fly, app.yaml…). Solo local o Docker. | `ls` en la raíz |

**Salvedad de Docker:** la pestaña En vivo no tendría llaves dentro del contenedor. `docker-compose.yml` no pasa `TOMTOM_API_KEY`, `HERE_API_KEY` ni `GOOGLE_MAPS_API_KEY`, y el `.env` no se copia a la imagen.

---

## 5. MLOps

| Componente | ¿Existe? | Detalle |
|---|---|---|
| Seguimiento de experimentos | **Sí, MLflow** | Experimento `MobiPredict` en `mlruns/` (backend de archivos). La última corrida tiene 10 runs: 1 padre y 9 candidatos. Cada run guarda parámetros, métricas de valid, test y drift, importancias y el modelo. |
| Búsqueda de hiperparámetros | Sí | Optuna para LightGBM (25 trials) y RandomizedSearchCV para el resto (10 iteraciones), con `TimeSeriesSplit(n_splits=3)` (`training.py`). |
| Versionado de modelos | **Sí, MLflow Model Registry** | `mobipredict-velocidad` v1 y `mobipredict-colapso` v1, ambos con alias `champion` (`mlruns/models/`). Los `.joblib` de `models/` se sobrescriben en cada corrida y no se versionan en Git. |
| Orquestación | Sí, Prefect 3 | Flow `mobipredict-pipeline` con 6 tareas; la adquisición reintenta 1 vez. No hay deployment ni programación (no se encontró `.serve()`, `.deploy()` ni cron). |
| Pruebas automáticas | **Sí: 43 pruebas, las 43 pasan** | `pytest -q tests` dio «43 passed, 1 warning in 28.69s» el 2026-11-14. Detalle abajo. |
| Monitoreo de drift | **Parcial, fuera de línea** | Cada candidato se evalúa en el holdout más reciente (ene–sep 2026) como prueba de estrés. Ese periodo no se usa para elegir el modelo. No hay monitoreo de drift en producción ni alertas automáticas. |
| Reentrenamiento | **Manual** | `python run_pipeline.py` o `RETRAIN=1 docker compose up trainer`, y luego `POST /admin/reload`. No hay reentrenamiento programado ni disparado por drift. |

**Pruebas por archivo:**

| Archivo | Pruebas |
|---|---|
| `test_api.py` | 14 |
| `test_envivo.py` | 12 (con respuestas simuladas, sin llamar a las APIs reales) |
| `test_rutas.py` | 10 |
| `test_features.py` | 5 |
| `test_fuentes.py` | 2 |

**Resultado en el holdout ene–sep 2026** (`models/model_comparison.csv`):

| Modelo | Test (2025) | Holdout (ene–sep 2026) |
|---|---|---|
| Velocidad, red neuronal MLP | MAE 1,50 km/h | MAE 1,74 km/h |
| Velocidad, perfil histórico | MAE 4,47 km/h | MAE 5,01 km/h |
| Colapso, LightGBM | recall 0,79 · precisión 0,74 · PR-AUC 0,841 | recall 0,80 · precisión 0,76 · PR-AUC 0,842 |

Con la serie GT anterior este mismo cuadro se medía en la pandemia (mar–dic 2020); con ARS la pandemia queda en el entrenamiento.

---

## 6. Escalabilidad

Qué habría que cambiar en cada caso. **Config** significa que se cambia en `src/mobipredict/config.py` o con una variable de entorno. **A mano** significa que está escrito en el código.

### Agregar más tramos

- **Datos:** los tramos salen de los propios datos (corredor + sentido en `fuentes.estandarizar_sensores`). Uno nuevo en el CSV del SIMM entra solo al reentrenar. Hoy hay 22.
- **Coordenadas:** se agrega una fila en `data/reference/corredores_simm.csv`, que es un archivo editable, no código. Si falta, el tramo queda sin lat/lon y sin macrozona.
- **En vivo:** se agrega una fila en `data/reference/puntos_envivo.csv`.
- **A mano:**
  - Los sentidos válidos son solo `SN`, `NS`, `WE` y `EW` (`envivo.RUMBO`).
  - El costo diario en vivo crece linealmente: 22 consultas por ronda y proveedor, así que los cupos de `.env` se agotan antes.
- **Requiere reentrenar:** sí. La velocidad de referencia (percentil 95) y el perfil histórico se calculan con el entrenamiento.

### Usar otra ciudad

- **Config:** las URLs de las fuentes (`FUENTES`), las coordenadas del clima (`CLIMA_LAT` y `CLIMA_LON`), las fechas de corte, la zona horaria y la API de la EOD (`MOBIPREDICT_EOD_API`).
- **A mano:**
  - El lector del CSV de velocidad usa los nombres de columna del SIMM de Medellín (`fuentes.leer_velocidad_gt`).
  - Los indicadores de la EOD tienen números fijos: 15 para la matriz OD y 16–19 para los grupos por hora (`fuentes.py`).
  - Los festivos son `holidays.Colombia` (`fuentes.py:122` y `api/main.py`).
  - La hora local es UTC−5 fija (`envivo.TZ_MEDELLIN`).
  - La lista de municipios del Valle de Aburrá está en `rutas.MUNICIPIOS`.
  - El texto de la API y del frontend menciona Medellín.
- **Archivos de referencia:** hay que crear `eod2025_macrozonas.csv`, `corredores_simm.csv` y `puntos_envivo.csv` para la nueva ciudad.
- **Conclusión:** la arquitectura (pipeline, API y frontend) se reutiliza, pero la capa de ingesta es específica de Medellín.

### Predecir a otro horizonte (30 min o 2 h)

- **Config:** `HORIZON_STEPS` (pasos por predicción) y `FREQ_MIN` (minutos por paso) en `config.py`. El horizonte en minutos es `FREQ_MIN × HORIZON_STEPS`, y la API lo lee de `metadata.json`.
- **2 h:** `HORIZON_STEPS = 2` con datos horarios, y reentrenar. No hace falta tocar más código.
- **30 min:** exige `FREQ_MIN = 30`, y hoy la serie se agrega a 1 h en `fuentes.py`. Habría que cambiar esa agregación y revisar los rezagos (`LAGS` y `MIN_HISTORY`, que se cuentan en pasos).
- **A mano:** los nombres de los targets son `y_velocidad_1h` y `y_colapso_1h` (`features.py:30-31`, `api/replay.py`). Funcionarían con otro horizonte, pero el nombre quedaría engañoso.
- **También a mano:** las horas pico `[6, 7, 8, 17, 18, 19]` (`features.py:105`).

### Reentrenar con datos nuevos

- **Modelo actual (ARS):** con una nueva exportación de las cámaras se corre `python scripts/convertir_ars_a_sensores.py --entrada <carpeta>` y `python scripts/reentrenar_con_ars.py`; `POST /admin/reload` carga el modelo nuevo sin reiniciar la API.
- **Serie abierta GT:** `python run_pipeline.py --descargar` vuelve a bajar las fuentes y entrena la versión 2017-2020 (reemplaza los modelos ARS).
- **Config:** todas las fechas de partición se cambian con variables de entorno (`MOBIPREDICT_FECHA_INICIO`, `MOBIPREDICT_CORTE_VALID`, `MOBIPREDICT_CORTE_TEST`, `MOBIPREDICT_FIN_TEST`, `MOBIPREDICT_FIN_DRIFT`); `reentrenar_con_ars.py` fija los cortes ARS y genera festivos hasta 2027.
- **Limitación de datos:** la exportación ARS llega al 2026-09-03 y no es un feed en línea; para operar hay que conectar el feed del SIMM.

---

## 7. Valor

Calculado con el periodo de prueba (todo 2025: 365 días, 22 tramos, 111.484 tramo-horas), con los modelos ARS guardados. Es el mismo cálculo que `GET /valor` (`api/replay.py`).

| Indicador | Valor |
|---|---|
| **Alertas de colapso por día en toda la red** | **39** (14.329 en 365 días) |
| **Alertas acertadas por día** | **29** (10.575 en total; precisión 74 %) |
| Falsas alarmas por día | 10 (3.754 en total) |
| Colapsos reales en el periodo | 13.312 (recall 79 %) |
| Detección de la regla reactiva actual ("si está colapsado ahora, lo estará en 1 h") | recall 71 %, precisión 70 % |
| Colapsos que llegaron sin aviso (la vía estaba bien una hora antes) | 3.916 (29 % de los colapsos) |
| … de esos, anticipados por el modelo | **1.475 (38 %)**; la regla reactiva actual anticipa 0 |
| **Minutos de anticipación de las alertas acertadas** | **60 min** |
| **Error del tiempo de viaje a 1 h (MAE), modelo** | **0,63 min por tramo** |
| Error del tiempo de viaje, promedio histórico | 1,77 min por tramo |
| Mejora frente al promedio histórico | **64 % menos error** |
| Error de velocidad (MAE): modelo vs promedio histórico | 1,50 vs 4,47 km/h |
| Tiempo de viaje real medio por tramo | 9,5 min |

**Sobre los 60 minutos:** es el horizonte del modelo (`horizonte_min = 60`), así que cada alerta se emite una hora antes del colapso que predice. Los datos son horarios, de modo que no se puede medir una anticipación más fina que 60 min. (El conteo de horas seguidas de alerta antes de cada colapso se midió solo con el modelo GT y no se recalculó.)

**Qué es el «promedio histórico»:** el perfil de velocidad del tramo por hora y tipo de día, calculado con el entrenamiento (`perfil_velocidad`). Es la línea base `perfil_historico` del proyecto.
