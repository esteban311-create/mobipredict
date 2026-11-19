# MobiPredict — Problema, usuarios y valor

> **En una frase:** MobiPredict le dice al centro de control de movilidad de Medellín **qué vía va a colapsar en la próxima hora**, para que actúe *antes* del trancón y no después.

Este documento responde tres preguntas: **qué problema hay, a quién le duele y qué gana con MobiPredict**. Cada cifra sale de los datos reales del proyecto (`GET /valor`, `docs/model_decision.md` y las particiones de `data/processed/`, todo con las cámaras ARS 2019-2026) o de una fuente pública citada al final.

---

## 1. El problema

### 1.1 La congestión en Medellín se gestiona tarde

Hoy el Sistema Inteligente de Movilidad de Medellín (SIMM) ve el tráfico **en tiempo real**: cámaras, sensores y tiempos de viaje. Eso dice *dónde está el trancón ahora*, pero no *dónde va a estar en una hora*. Cuando el operador ve una vía en rojo, el colapso **ya ocurrió**: los carros ya están atrapados, el bus ya va tarde y la moto ya está zigzagueando entre carriles.

**La gestión es reactiva.** Ajustar semáforos, enviar agentes de tránsito o avisar a los ciudadanos llega cuando el daño está hecho.

### 1.2 El dato que lo demuestra

En el periodo de prueba (todo 2025: 365 días, 22 tramos viales medidos por las cámaras ARS del SIMM):

- Hubo **13.312 horas-tramo en colapso** (velocidad por debajo de la mitad de lo normal).
- **3.916 de ellas (29 %) empezaron en una vía que una hora antes circulaba bien.**

> **Casi 3 de cada 10 colapsos son invisibles para quien solo mira el tráfico actual.** El operador no tenía ninguna señal de alarma. Ese es el hueco que llena MobiPredict.

### 1.3 Por qué importa (impacto)

| Hecho | Cifra | Qué significa |
| --- | --- | --- |
| Viajes en un día hábil en el Valle de Aburrá | **6.490.299** | Cualquier mejora, por pequeña que sea, se multiplica por millones de viajes |
| Tiempo promedio de un viaje | **39,3 min** | Una parte de ese tiempo es congestión evitable |
| Horas laborables en colapso (22 tramos, 2025) | **14,9 %** | En promedio, cada vía pasa 1 de cada 7 horas laborables colapsada |
| Tramo más crítico en 2025: Autopista Sur (norte-sur) | **57 % de sus horas laborables** | Más de la mitad del tiempo, esa vía está colapsada |
| Tasa de colapso por año (todas las horas, 6-20 h) | **6,7 % (sep-dic 2019) → 12,0 % (2025) → 14,0 % (ene-sep 2026)** | La congestión casi se duplicó en seis años; con la pandemia bajó a 3,7 % (2020) y luego volvió a subir |
| Colapso en hora pico laborable **sin lluvia** frente a **con lluvia fuerte** (> 3 mm/h), 2019-2026 | **10,7 % → 20,5 %** | La lluvia, tan común en Medellín, casi duplica el riesgo; es predecible y hoy no se usa para anticipar |
| Motos por cada 1.000 habitantes | **120,5** (frente a 67,1 autos) | Crecieron **+48 %** entre 2017 y 2025 y el transporte público cayó **−14 %**: hay más vehículos en las mismas vías |
| Muertes en vías de Medellín en 2025 | **276** (162 motociclistas, 100 peatones) | La congestión y la siniestralidad se cruzan: **las 17 h es a la vez la hora con más colapsos (27 % de las horas-tramo laborables en 2025) y la hora con más incidentes** (2008-2025) |

**Resumen del impacto:** millones de personas pierden tiempo todos los días en colapsos que, en buena parte, empiezan sin aviso. La tendencia empeora: la tasa de colapso casi se duplicó entre 2019 y 2026, con más motos y menos transporte público. Las herramientas actuales solo describen el presente.

---

## 2. Los usuarios

| Usuario | Quién es | Qué le duele hoy | Qué necesita |
| --- | --- | --- | --- |
| **1. Operador del centro de control** *(usuario principal)* | Personal del SIMM / Secretaría de Movilidad de Medellín que vigila la red vial | Se entera del colapso cuando ya pasó; tiene muchas vías y pocos recursos (agentes, grúas, planes semafóricos) | Saber **qué vías priorizar en la próxima hora** y con qué nivel de riesgo |
| **2. Ciudadano que se desplaza** | Conductores, motociclistas y usuarios de bus que pasan por los corredores principales | Sale sin saber si su ruta va a estar colapsada; el tiempo de viaje es impredecible | Un **tiempo de viaje confiable** para la próxima hora y una alerta si su vía se va a trancar |
| **3. Planeador de movilidad** | Analistas de la Secretaría de Movilidad y del Área Metropolitana (AMVA) | Las decisiones (obras, carriles, horarios) se toman con reportes estáticos | Ver **qué tramos colapsan más, cuándo y por qué** (hora, lluvia, demanda), cruzado con la Encuesta Origen-Destino 2025 |

---

## 3. El valor que entrega MobiPredict

### 3.1 Beneficios clave, medidos en datos reales

Medidos en el **periodo de prueba**, datos que el modelo nunca vio durante el entrenamiento:

| # | Beneficio | Usuario | Evidencia |
| --- | --- | --- | --- |
| 1 | **Ve colapsos que hoy son invisibles.** Avisa con **1 hora de anticipación** en vías que todavía circulan bien | Operador | De los 3.916 colapsos que empezaron "sin aviso", MobiPredict anticipó **1.475 (38 %)**. El monitoreo en tiempo real anticipa **0** |
| 2 | **Detecta más colapsos y con menos ruido** que la regla actual ("si está lento ahora, estará lento después") | Operador | Detecta el **79 %** de los colapsos (frente a 71 %) y acierta en el **74 %** de sus alertas (frente a 70 %) |
| 3 | **Prioriza recursos.** Ordena las 22 vías por riesgo de colapso para la próxima hora | Operador | Unas **39 alertas al día** en toda la red (unas 10 falsas): un volumen que un operador puede revisar |
| 4 | **Tiempo de viaje confiable** para la próxima hora | Ciudadano | Error medio de **0,63 min** en viajes de ~9,5 min por tramo, un **64 % más preciso** que el promedio histórico de esa hora (1,77 min) |
| 5 | **Anticipa el efecto de la lluvia** | Operador y ciudadano | Usa la lluvia actual y la de las últimas 3 h; la lluvia fuerte casi duplica el riesgo de colapso en hora pico |
| 6 | **Explica la congestión** con datos oficiales | Planeador | Tramos críticos, horas de colapso, demanda por macrozona (EOD 2025), siniestralidad 2008-2025 |
| 7 | **Costo bajo** | Secretaría | Usa las cámaras que el SIMM ya tiene, datos abiertos y software libre; no requiere sensores nuevos |

### 3.2 Antes y después

| Momento | Hoy (gestión reactiva) | Con MobiPredict (gestión anticipada) |
| --- | --- | --- |
| 16:00 | La Av. Oriental circula bien. Nadie hace nada | MobiPredict marca la **Av. Oriental en riesgo alto para las 17:00** (probabilidad 0,78, nivel `colapso`) |
| 16:10 | — | El operador ajusta el plan semafórico, ubica un agente y publica el aviso |
| 17:00 | La vía colapsa. El operador lo ve en rojo y empieza a reaccionar | La vía llega más cargada pero con medidas ya en marcha; los ciudadanos avisados toman otra ruta |

> El ejemplo de las 16:00 es ilustrativo: muestra el flujo de uso. Las cifras de la sección 3.1 sí son reales.

### 3.3 Qué hace única a la solución (diferenciación)

1. **Anticipa, no describe.** Los tableros actuales (SIMM, Observatorio de Movilidad, Google Maps) muestran el presente. MobiPredict predice la próxima hora y lo convierte en una **alerta con nivel de riesgo**.
2. **Une fuentes oficiales que hoy están separadas:** velocidades de las cámaras ARS del SIMM, lluvia, festivos y la **Encuesta Origen-Destino 2025** del AMVA (6,49 M de viajes) como señal de demanda por hora y por zona.
3. **100 % datos reales:** cámaras del SIMM (2019-2026) y fuentes abiertas, con origen y huella de cada archivo. No hay datos simulados.
4. **Probado en datos que nunca vio.** Se evaluó en ene-sep 2026, un periodo con más congestión que el de prueba (14 % de colapso frente a 12 %), y se sostuvo: PR-AUC 0,84, frente a 0,69 de la regla simple. La pandemia de 2020 quedó dentro del entrenamiento, así que el modelo ya conoce un cambio extremo de régimen.
5. **Listo para operar:** API, página web, registro de modelos y reentrenamiento con un comando.

---

## 4. Cómo crece (escalabilidad)

- **Más vías:** agregar un tramo es agregar sus lecturas al CSV; el modelo es uno solo para toda la red.
- **Datos actuales:** con una nueva exportación de las cámaras ARS se reentrena con `python scripts/convertir_ars_a_sensores.py` y `python scripts/reentrenar_con_ars.py`, y se recarga la API sin apagarla (`POST /admin/reload`). El mismo camino sirve para el feed en línea del SIMM.
- **Otras ciudades del Valle de Aburrá:** la EOD 2025 ya cubre los 10 municipios.
- **Siguientes versiones:** horizontes de 15 y 30 minutos, lluvia por estación del SIATA, un modelo de grafos que aprenda cómo se contagia el trancón de una vía a otra, y alertas push a ciudadanos.

---

## 5. Limitaciones (dichas con honestidad)

| Limitación | Respuesta |
| --- | --- |
| La serie de las cámaras ARS es una exportación (hasta el 3-sep-2026), no un feed en línea, y no se descarga sola como las fuentes abiertas | El sistema queda **listo para conectarse** al feed del SIMM; mientras tanto, el modo en vivo usa TomTom, HERE y Google calibrados a la escala del SIMM |
| Las cámaras ARS miden la velocidad en un punto, no el tiempo de viaje del corredor | El tiempo de viaje se estima con la longitud del tramo. Por eso las métricas no se comparan 1 a 1 con el modelo anterior (sensores GT 2017-2020) |
| Una de cada cuatro alertas es falsa (unas 10 al día en la red) | El operador las descarta en segundos. El umbral se puede mover para detectar más o alertar menos, según lo que decida el operador |
| No predice flujo vehicular (número de carros) | No hay conteos abiertos y continuos; la velocidad describe mejor la congestión que el flujo |

---

## 6. Cómo se calcularon las cifras de valor

- **Periodo de prueba:** 1-ene-2025 a 31-dic-2025 (365 días, 111.484 tramo-horas, 22 tramos), fuera del entrenamiento (2019-2023) y de la validación (2024). Son las cifras que devuelve `GET /valor`.
- **Colapso:** velocidad menor al 50 % de la velocidad de referencia del tramo (percentil 95 del entrenamiento).
- **Colapso "sin aviso":** colapso en t+1 h en un tramo con velocidad ≥ 50 % de su referencia en t.
- **Regla actual (reactiva):** "habrá colapso en t+1 h si hay colapso en t".
- **Tiempo de viaje:** longitud del tramo / velocidad. Se compara con la velocidad real medida en t+1 h.
- Modelos: `models/modelo_velocidad.joblib` (red neuronal MLP) y `models/modelo_colapso.joblib` (LightGBM, umbral 0,348), sobre `data/processed/test.parquet`.
- Las cifras de tendencia anual, tramo crítico y lluvia se calculan sobre las particiones de `data/processed/` (sep-2019 a sep-2026, solo 6-20 h).

## Fuentes

- Datos del modelo: cámaras ARS/CCTV del SIMM (Observatorio de Movilidad de Medellín), exportación diaria sep-2019 a sep-2026. Datos del EDA y demás fuentes: ver [`docs/fuentes_de_datos.md`](fuentes_de_datos.md) y [`data/fuentes_datos.csv`](../data/fuentes_datos.csv).
- 276 muertes viales en 2025: Observatorio de Movilidad de Medellín, vía [El Colombiano](https://www.elcolombiano.com/medellin/balance-de-accidentalidad-en-medellin-el-ano-pasado-PF32374139).
- +48 % motos y −14 % transporte público 2017-2025: resultados EOD 2025 (AMVA), vía [El Colombiano](https://www.elcolombiano.com/medellin/movilidad-habitantes-medellin-aburra-disminucion-teletrabajo-DD36063145).
