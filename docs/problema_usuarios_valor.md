# MobiPredict — Problema, usuarios y valor

> **En una frase:** MobiPredict le dice al centro de control de movilidad de Medellín **qué vía va a colapsar en la próxima hora**, para que actúe *antes* del trancón y no después.

Este documento responde tres preguntas: **qué problema hay, a quién le duele y qué gana con MobiPredict**. Cada cifra sale de los datos reales del proyecto (`eda/reports/eda_summary.json`, `docs/model_decision.md`) o de una fuente pública citada al final.

---

## 1. El problema

### 1.1 La congestión en Medellín se gestiona tarde

Hoy el Sistema Inteligente de Movilidad de Medellín (SIMM) ve el tráfico **en tiempo real**: cámaras, sensores y tiempos de viaje. Eso dice *dónde está el trancón ahora*, pero no *dónde va a estar en una hora*. Cuando el operador ve una vía en rojo, el colapso **ya ocurrió**: los carros ya están atrapados, el bus ya va tarde y la moto ya está zigzagueando entre carriles.

**La gestión es reactiva.** Ajustar semáforos, enviar agentes de tránsito o avisar a los ciudadanos llega cuando el daño está hecho.

### 1.2 El dato que lo demuestra

En el periodo de prueba (dic-2019 a mar-2020, 108 días, 22 tramos viales):

- Hubo **2.480 horas-tramo en colapso** (velocidad por debajo de la mitad de lo normal).
- **1.195 de ellas (48 %) empezaron en una vía que una hora antes circulaba bien.**

> **Casi la mitad de los colapsos son invisibles para quien solo mira el tráfico actual.** El operador no tenía ninguna señal de alarma. Ese es el hueco que llena MobiPredict.

### 1.3 Por qué importa (impacto)

| Hecho | Cifra | Qué significa |
| --- | --- | --- |
| Viajes en un día hábil en el Valle de Aburrá | **6.490.299** | Cualquier mejora, por pequeña que sea, se multiplica por millones de viajes |
| Tiempo promedio de un viaje | **39,3 min** | Una parte de ese tiempo es congestión evitable |
| Horas laborables en colapso (22 tramos, antes de la pandemia) | **13 %** | En promedio, cada vía pasa 1 de cada 8 horas laborables colapsada |
| Tramo más crítico: Av. Ferrocarril (sur-norte) | **33 % de sus horas** | 1 de cada 3 horas, esa vía está colapsada |
| Colapso en hora pico **sin lluvia** frente a **con lluvia fuerte** (> 3 mm/h) | **15 % → 34 %** | La lluvia, tan común en Medellín, duplica el riesgo; es predecible y hoy no se usa para anticipar |
| Motos por cada 1.000 habitantes | **120,5** (frente a 67,1 autos) | Crecieron **+48 %** entre 2017 y 2025 y el transporte público cayó **−14 %**: hay más vehículos en las mismas vías |
| Muertes en vías de Medellín en 2025 | **276** (162 motociclistas, 100 peatones) | La congestión y la siniestralidad se cruzan: **las 17 h es a la vez la hora pico de tráfico y la hora con más incidentes** (2008-2025) |

**Resumen del impacto:** millones de personas pierden tiempo todos los días en colapsos que, en buena parte, empiezan sin aviso. La tendencia empeora: más motos y menos transporte público. Las herramientas actuales solo describen el presente.

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
| 1 | **Ve colapsos que hoy son invisibles.** Avisa con **1 hora de anticipación** en vías que todavía circulan bien | Operador | De los 1.195 colapsos que empezaron "sin aviso", MobiPredict anticipó **407 (34 %)**. El monitoreo en tiempo real anticipa **0** |
| 2 | **Detecta más colapsos y con menos ruido** que la regla actual ("si está lento ahora, estará lento después") | Operador | Detecta el **62 %** de los colapsos (frente a 52 %) y acierta en el **59 %** de sus alertas (frente a 52 %) |
| 3 | **Prioriza recursos.** Ordena las 22 vías por riesgo de colapso para la próxima hora | Operador | Unas **24 alertas al día** en toda la red: un volumen que un operador puede revisar |
| 4 | **Tiempo de viaje confiable** para la próxima hora | Ciudadano | Error medio de **0,86 min** en viajes de ~9 min por tramo, un **30 % más preciso** que el promedio histórico de esa hora (1,23 min) |
| 5 | **Anticipa el efecto de la lluvia** | Operador y ciudadano | Usa la lluvia actual y la de las últimas 3 h; la lluvia fuerte duplica el riesgo de colapso en hora pico |
| 6 | **Explica la congestión** con datos oficiales | Planeador | Tramos críticos, horas de colapso, demanda por macrozona (EOD 2025), siniestralidad 2008-2025 |
| 7 | **Costo bajo** | Secretaría | Usa datos abiertos que la Alcaldía ya publica y software libre; no requiere sensores nuevos |

### 3.2 Antes y después

| Momento | Hoy (gestión reactiva) | Con MobiPredict (gestión anticipada) |
| --- | --- | --- |
| 16:00 | La Av. Oriental circula bien. Nadie hace nada | MobiPredict marca la **Av. Oriental en riesgo alto para las 17:00** (probabilidad 0,78, nivel `colapso`) |
| 16:10 | — | El operador ajusta el plan semafórico, ubica un agente y publica el aviso |
| 17:00 | La vía colapsa. El operador lo ve en rojo y empieza a reaccionar | La vía llega más cargada pero con medidas ya en marcha; los ciudadanos avisados toman otra ruta |

> El ejemplo de las 16:00 es ilustrativo: muestra el flujo de uso. Las cifras de la sección 3.1 sí son reales.

### 3.3 Qué hace única a la solución (diferenciación)

1. **Anticipa, no describe.** Los tableros actuales (SIMM, Observatorio de Movilidad, Google Maps) muestran el presente. MobiPredict predice la próxima hora y lo convierte en una **alerta con nivel de riesgo**.
2. **Une fuentes oficiales que hoy están separadas:** velocidades del SIMM, lluvia, festivos y la **Encuesta Origen-Destino 2025** del AMVA (6,49 M de viajes) como señal de demanda por hora y por zona.
3. **100 % datos reales y abiertos**, con origen y huella de cada archivo. No hay datos simulados.
4. **Probado contra un cambio extremo.** Se evaluó en la pandemia de 2020 (un "terremoto" en el tráfico) y siguió funcionando: detectó colapsos con PR-AUC 0,67, frente a 0,45 de la regla simple.
5. **Listo para operar:** API, página web, registro de modelos y reentrenamiento con un comando.

---

## 4. Cómo crece (escalabilidad)

- **Más vías:** agregar un tramo es agregar sus lecturas al CSV; el modelo es uno solo para toda la red.
- **Datos actuales:** al conectar el feed vigente del SIMM (o un CSV con las mismas columnas) se reentrena con `python run_pipeline.py --descargar` y se recarga la API sin apagarla (`POST /admin/reload`).
- **Otras ciudades del Valle de Aburrá:** la EOD 2025 ya cubre los 10 municipios.
- **Siguientes versiones:** horizontes de 15 y 30 minutos, lluvia por estación del SIATA, un modelo de grafos que aprenda cómo se contagia el trancón de una vía a otra, y alertas push a ciudadanos.

---

## 5. Limitaciones (dichas con honestidad)

| Limitación | Respuesta |
| --- | --- |
| La serie abierta de velocidades termina en dic-2020 | Es la más reciente que publica la Alcaldía (verificado en MEData y datos.gov.co, nov-2026). El sistema queda **listo para conectarse** al feed actual |
| Detecta el 62 % de los colapsos, por debajo de la meta interna del 70 % | Supera a la regla actual en detección y en precisión. El umbral se puede bajar para detectar más a cambio de más falsas alarmas, según lo que decida el operador |
| No predice flujo vehicular (número de carros) | No hay conteos abiertos y continuos; la velocidad describe mejor la congestión que el flujo |

---

## 6. Cómo se calcularon las cifras de valor

- **Periodo de prueba:** 1-dic-2019 a 19-mar-2020 (108 días, 30.060 tramo-horas), fuera del entrenamiento.
- **Colapso:** velocidad menor al 50 % de la velocidad de referencia del tramo (percentil 95 del entrenamiento).
- **Colapso "sin aviso":** colapso en t+1 h en un tramo con velocidad ≥ 50 % de su referencia en t.
- **Regla actual (reactiva):** "habrá colapso en t+1 h si hay colapso en t".
- **Tiempo de viaje:** longitud del tramo / velocidad. Se compara con la velocidad real medida en t+1 h.
- Modelos: `models/modelo_velocidad.joblib` (LightGBM) y `models/modelo_colapso.joblib` (Random Forest, umbral 0,661), sobre `data/processed/test.parquet`.

## Fuentes

- Datos del modelo y del EDA: ver [`docs/fuentes_de_datos.md`](fuentes_de_datos.md) y [`data/fuentes_datos.csv`](../data/fuentes_datos.csv).
- 276 muertes viales en 2025: Observatorio de Movilidad de Medellín, vía [El Colombiano](https://www.elcolombiano.com/medellin/balance-de-accidentalidad-en-medellin-el-ano-pasado-PF32374139).
- +48 % motos y −14 % transporte público 2017-2025: resultados EOD 2025 (AMVA), vía [El Colombiano](https://www.elcolombiano.com/medellin/movilidad-habitantes-medellin-aburra-disminucion-teletrabajo-DD36063145).
