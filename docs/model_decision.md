# Decisión de modelo — MobiPredict

Generado automáticamente el 2026-11-07T20:44:01+00:00 por `src/mobipredict/selection.py`.

## Resumen

- **Velocidad a 1 hora:** `lightgbm` — RMSE de prueba 3.61 km/h, MAE 2.35 km/h, WAPE 7.9 % (perfil histórico: WAPE 11.5 %).
- **Colapso a 1 hora:** `random_forest` — PR-AUC de prueba 0.645, recall 0.62, precisión 0.59 con umbral 0.661 (regla base: PR-AUC 0.429).

## Datos y protocolo

- Sensores: Velocidad y tiempo de viaje GT (SIMM, Secretaría de Movilidad de Medellín), 22 tramos, lecturas horarias 6:00-20:00.
- Split temporal: entrenamiento hasta 2019-09-01, validación hasta 2019-12-01, prueba hasta 2020-03-20 (antes de las restricciones por COVID-19). La hora frontera de cada partición se descarta para que el objetivo no cruce de una a otra.
- Drift: 2020-03-20 a 2020-12-31 (pandemia), solo para diagnóstico.
- Colapso = velocidad < 50% de la velocidad de referencia del tramo (percentil 95 del entrenamiento). Tasa de colapso: drift 5.2%, test 8.2%, train 10.1%, valid 10.4%.
- Hiperparámetros con validación cruzada temporal (TimeSeriesSplit, 3 cortes): RandomizedSearchCV y Optuna.
- Selección y umbral de decisión se fijan en **validación**; **prueba** solo se reporta.

## Velocidad a 1 hora

| Modelo | RMSE val | WAPE val | MAE pico val | MAE test | RMSE test | R² test | ms/1000 filas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| random_forest | 3.63 | 0.082 | 2.48 | 2.34 | 3.63 | 0.921 | 60.3 |
| **lightgbm** ✔ | 3.65 | 0.083 | 2.55 | 2.35 | 3.61 | 0.922 | 6.1 |
| mlp | 3.68 | 0.083 | 2.54 | 2.34 | 3.66 | 0.920 | 3.9 |
| ridge | 4.03 | 0.093 | 2.87 | 2.61 | 3.96 | 0.906 | 2.3 |
| perfil_historico | 4.89 | 0.115 | 3.48 | 3.42 | 5.13 | 0.843 | 0.2 |

Unidades: km/h. WAPE = error absoluto total / velocidad total.

**Razonamiento**

- lightgbm queda a menos de 1 % del RMSE de random_forest y es más rápido; se prefiere por latencia.
- lightgbm obtiene el menor RMSE de validación (3.65 km/h) y reduce el WAPE 27.8 % frente al perfil histórico.
- En prueba el ganador también es el mejor en RMSE: la decisión se sostiene fuera de muestra.

## Colapso a 1 hora

| Modelo | PR-AUC val | Recall val | Precisión val | Brier val | PR-AUC test | Recall test | Precisión test | Falsas alarmas/día (red) | ms/1000 filas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **random_forest** ✔ | 0.707 | 0.646 | 0.670 | 0.063 | 0.645 | 0.615 | 0.591 | 9.8 | 30.6 |
| lightgbm | 0.696 | 0.697 | 0.609 | 0.056 | 0.639 | 0.662 | 0.539 | 13.0 | 3.6 |
| logistica | 0.649 | 0.668 | 0.597 | 0.104 | 0.574 | 0.595 | 0.546 | 11.4 | 3.0 |
| regla_umbral | 0.429 | 0.592 | 0.455 | 0.104 | 0.429 | 0.590 | 0.453 | 16.3 | 0.3 |

**Razonamiento**

- Ningún modelo alcanza recall >= 0.7 en validación; se elige por PR-AUC entre todos.
- random_forest obtiene PR-AUC de validación 0.707 con recall 0.65 y precisión 0.67 (umbral 0.661).
- En prueba el ganador también es el mejor en PR-AUC: la decisión se sostiene fuera de muestra.
- Se prioriza recall: una alerta perdida cuesta más que una falsa alarma que un operador descarta.

## Prueba de estrés: pandemia (drift)

| Modelo | MAE test (pre-pandemia) | MAE drift (pandemia) | WAPE drift |
| --- | --- | --- | --- |
| random_forest | 2.34 | 3.32 | 0.098 |
| **lightgbm** ✔ | 2.35 | 3.51 | 0.103 |
| mlp | 2.34 | 3.00 | 0.088 |
| ridge | 2.61 | 3.96 | 0.116 |
| perfil_historico | 3.42 | 6.92 | 0.203 |

| Modelo | PR-AUC test | PR-AUC drift | Recall drift | Precisión drift | Falsas alarmas/día drift |
| --- | --- | --- | --- | --- | --- |
| **random_forest** ✔ | 0.645 | 0.669 | 0.615 | 0.654 | 5.1 |
| lightgbm | 0.639 | 0.684 | 0.711 | 0.590 | 7.7 |
| logistica | 0.574 | 0.653 | 0.603 | 0.603 | 6.2 |
| regla_umbral | 0.429 | 0.447 | 0.618 | 0.476 | 10.7 |

— = no aplica: sin colapsos reales en el periodo no se pueden medir recall ni PR-AUC.

Con las vías casi vacías la congestión casi desaparece: la tasa de colapso del periodo de drift es 5.2% frente a 8.2% en prueba. Es un cambio de régimen que el monitoreo debe detectar (drift de entrada en velocidades y de salida en la tasa de alertas) y que justifica el reentrenamiento por disparador, no solo por calendario.

## Riesgos y siguientes pasos

- Los sensores abiertos más recientes publicados por la Alcaldía llegan a dic-2020; antes de operar en 2026 hay que reentrenar con el feed actual del SIMM.
- Revisar el umbral de colapso y el de alerta con la Secretaría de Movilidad.
- Evaluar un modelo de grafos espacio-temporal como challenger con más tramos.