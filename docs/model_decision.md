# Decisión de modelo — MobiPredict

Generado automáticamente el 2026-11-19T01:26:22+00:00 por `src/mobipredict/selection.py`.

## Resumen

- **Velocidad a 1 hora:** `mlp` — RMSE de prueba 2.11 km/h, MAE 1.50 km/h, WAPE 5.9 % (perfil histórico: WAPE 17.6 %).
- **Colapso a 1 hora:** `lightgbm` — PR-AUC de prueba 0.841, recall 0.79, precisión 0.74 con umbral 0.348 (regla base: PR-AUC 0.669).

## Datos y protocolo

- Sensores: Cámaras ARS/CCTV SIMM (Observatorio de Movilidad de Medellín), serie horaria derivada (2019-09-01 → 2026-09-03), 22 tramos, lecturas horarias 6:00-20:00.
- Split temporal: entrenamiento hasta 2024-01-01, validación hasta 2025-01-01, prueba hasta 2026-01-01. La hora frontera de cada partición se descarta para que el objetivo no cruce de una a otra.
- Drift / holdout reciente: 2026-01-01 a 2026-09-03, solo para diagnóstico.
- Colapso = velocidad < 50% de la velocidad de referencia del tramo (percentil 95 del entrenamiento). Tasa de colapso: drift 13.9%, test 11.9%, train 7.3%, valid 11.2%.
- Hiperparámetros con validación cruzada temporal (TimeSeriesSplit, 3 cortes): RandomizedSearchCV y Optuna.
- Selección y umbral de decisión se fijan en **validación**; **prueba** solo se reporta.

## Velocidad a 1 hora

| Modelo | RMSE val | WAPE val | MAE pico val | MAE test | RMSE test | R² test | ms/1000 filas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **mlp** ✔ | 2.10 | 0.055 | 1.55 | 1.50 | 2.11 | 0.889 | 5.0 |
| lightgbm | 2.15 | 0.056 | 1.65 | 1.44 | 2.03 | 0.897 | 21.3 |
| random_forest | 2.16 | 0.057 | 1.62 | 1.46 | 2.07 | 0.893 | 64.9 |
| ridge | 2.41 | 0.062 | 1.84 | 1.65 | 2.31 | 0.867 | 2.1 |
| perfil_historico | 5.78 | 0.170 | 4.54 | 4.47 | 5.65 | 0.202 | 0.2 |

Unidades: km/h. WAPE = error absoluto total / velocidad total.

**Razonamiento**

- mlp obtiene el menor RMSE de validación (2.10 km/h) y reduce el WAPE 67.6 % frente al perfil histórico.
- En prueba, lightgbm queda ligeramente mejor en RMSE (2.029 frente a 2.106). No se cambia la elección: hacerlo usaría el conjunto de prueba para seleccionar. La diferencia se vigila en producción con el esquema champion/challenger.

## Colapso a 1 hora

| Modelo | PR-AUC val | Recall val | Precisión val | Brier val | PR-AUC test | Recall test | Precisión test | Falsas alarmas/día (red) | ms/1000 filas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **lightgbm** ✔ | 0.848 | 0.794 | 0.735 | 0.038 | 0.841 | 0.794 | 0.738 | 10.3 | 5.2 |
| random_forest | 0.837 | 0.798 | 0.721 | 0.056 | 0.839 | 0.810 | 0.722 | 11.4 | 49.2 |
| logistica | 0.807 | 0.772 | 0.708 | 0.096 | 0.803 | 0.753 | 0.722 | 10.6 | 1.8 |
| regla_umbral | 0.659 | 0.719 | 0.635 | 0.065 | 0.669 | 0.698 | 0.646 | 14.0 | 0.2 |

**Razonamiento**

- lightgbm obtiene PR-AUC de validación 0.848 con recall 0.79 y precisión 0.73 (umbral 0.348).
- En prueba el ganador también es el mejor en PR-AUC: la decisión se sostiene fuera de muestra.
- Se prioriza recall: una alerta perdida cuesta más que una falsa alarma que un operador descarta.

## Prueba de estrés: holdout reciente (drift)

| Modelo | MAE test | MAE drift | WAPE drift |
| --- | --- | --- | --- |
| **mlp** ✔ | 1.50 | 1.74 | 0.068 |
| lightgbm | 1.44 | 1.68 | 0.065 |
| random_forest | 1.46 | 1.69 | 0.066 |
| ridge | 1.65 | 1.86 | 0.072 |
| perfil_historico | 4.47 | 5.01 | 0.195 |

| Modelo | PR-AUC test | PR-AUC drift | Recall drift | Precisión drift | Falsas alarmas/día drift |
| --- | --- | --- | --- | --- | --- |
| **lightgbm** ✔ | 0.841 | 0.842 | 0.796 | 0.758 | 10.5 |
| random_forest | 0.839 | 0.843 | 0.821 | 0.745 | 11.6 |
| logistica | 0.803 | 0.803 | 0.721 | 0.759 | 9.5 |
| regla_umbral | 0.669 | 0.689 | 0.688 | 0.672 | 13.9 |

— = no aplica: sin colapsos reales en el periodo no se pueden medir recall ni PR-AUC.

La tasa de colapso del periodo de drift es 13.9% frente a 11.9% en prueba: la congestión sigue creciendo año a año. Que las métricas se sostengan en este periodo, que el modelo nunca vio, indica que generaliza a datos más recientes; aun así el monitoreo debe vigilar la tasa de alertas y disparar el reentrenamiento cuando cambie el régimen, no solo por calendario.

## Riesgos y siguientes pasos

- La serie ARS sale de una exportación de las bases diarias de cámaras ARS/CCTV del Observatorio de Movilidad, no de una descarga pública automática: para operar hay que conectar el feed del SIMM.
- Las cámaras ARS miden velocidad en un punto, no tiempo de viaje del corredor; el tiempo de viaje se estima con la longitud del tramo. Las métricas no son comparables 1 a 1 con las del modelo GT (2017-2020).
- Revisar el umbral de colapso y el de alerta con la Secretaría de Movilidad.
- Evaluar un modelo de grafos espacio-temporal como challenger con más tramos.