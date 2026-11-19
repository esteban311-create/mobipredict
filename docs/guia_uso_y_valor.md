# MobiPredict — Guía de uso, valor y posicionamiento

> **En una frase:** Waze y Google Maps te dicen dónde está el trancón **ahora**. MobiPredict te dice qué vía de Medellín **va a colapsar dentro de una hora**, aunque en este momento fluya bien.

Este documento tiene cuatro partes:

1. [Cómo navegar la aplicación](#1-cómo-navegar-la-aplicación), pantalla por pantalla.
2. [Cómo genera valor el proyecto](#2-cómo-genera-valor).
3. [Fortalezas y debilidades](#3-fortalezas-y-debilidades), dichas con honestidad.
4. [En qué se distingue de Waze y Google Maps](#4-en-qué-se-distingue-de-waze-y-google-maps).

Las cifras salen del periodo de prueba (todo 2025: 1-ene a 31-dic, 365 días), que el modelo nunca vio al entrenar. El modelo se entrenó con las cámaras ARS/CCTV del SIMM (sep-2019 a dic-2023) y se validó en 2024. El detalle está en [problema_usuarios_valor.md](problema_usuarios_valor.md) y [model_decision.md](model_decision.md).

---



## 1. Cómo navegar la aplicación



### 1.1 Encenderla

En la carpeta del proyecto, con el entorno virtual activo:

```powershell
uvicorn api.main:app --port 8000
```

Abre **[http://localhost:8000](http://localhost:8000)**. Arriba a la derecha, un punto verde con el nombre de los modelos (`Red neuronal (MLP) + LightGBM`) indica que todo cargó bien.

Si aparece "Aún no hay modelos entrenados", ejecuta antes `python run_pipeline.py --fast`.

### 1.2 Lo que siempre está en pantalla

- **Barra superior:** las cinco pestañas (Centro de control, Mi viaje, Navegar, En vivo y Evidencia) y el botón **▶ Historia**.
- **Mapa de Medellín:** cada flecha es uno de los 22 tramos vigilados (11 corredores, en sus dos sentidos). La flecha apunta en el sentido de circulación.
- **Colores, en toda la aplicación:**


| Color                                  | Significa                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| Verde                                  | Normal: no se espera colapso en la próxima hora                                       |
| Ámbar                                  | Precaución: la probabilidad se acerca al umbral (≥ 40 %)                              |
| Rojo                                   | Alerta: probabilidad de colapso ≥ 66 % en la próxima hora                             |
| Turquesa / etiqueta **AVISO TEMPRANO** | La vía fluye **ahora**, pero va a colapsar en una hora. Es lo que solo MobiPredict ve |
| Gris                                   | Sin lecturas a esa hora                                                               |


"Colapso" significa que la velocidad cae por debajo de la **mitad de lo normal** para esa vía.

### 1.3 ▶ Historia (empieza aquí)

Se abre sola la primera vez. Son cuatro pantallas que cuentan el problema y la solución:

1. **El problema:** 6,49 millones de viajes al día y vías colapsadas 1 de cada 8 horas laborables.
2. **El punto ciego:** el 29 % de los colapsos empiezan en una vía que una hora antes circulaba bien.
3. **La solución:**lapsos anticipó Mo cuántos de esos cobiPredict, frente a 0 del monitoreo actual.
4. **Míralo funcionar:** el botón **Ver el día →** carga el día con más colapsos sin aviso y lo reproduce.

Se avanza con **→** o **Enter**, se retrocede con **←** y se cierra con **Esc**.

### 1.4 Centro de control — para el operador de tráfico

Responde: **¿dónde actúo primero en la próxima hora?** Funciona sobre días reales de 2025 (prueba) y de ene-sep 2026 (holdout), repetidos hora a hora como si el sistema hubiera estado operando.

**Línea de tiempo (abajo)**

- **Día real:** abre un calendario con todos los días disponibles. Más intenso es el cuadro, más colapsos sin aviso tuvo ese día. Arriba hay atajos: "Más colapsos sin aviso", "Día de lluvia", "Día hábil típico" y "Holdout 2026".
- **▶** reproduce el día hora a hora, una hora cada 1,8 segundos. También puedes arrastrar el control o usar las flechas **← →** del teclado. **Espacio** pausa o reanuda.
- Las barras sobre la línea muestran las alertas de cada hora. La parte turquesa son colapsos anticipados. Un punto azul indica lluvia.
- **Revelar lo que pasó:** si está marcado, muestra lo que de verdad ocurrió una hora después (✓ acierto, ✗ colapso no anticipado, "falsa alarma"). Desmárcalo para ver solo lo que el operador habría sabido en ese momento.

**Indicadores (arriba)**

Se acumulan a medida que avanza el día:

- **Colapsos anticipados con 1 h de ventaja**, de los que empezaron sin aviso. El monitoreo actual vio 0.
- **Colapsos detectados** y **alertas que acertaron**, comparados con la regla de hoy ("si está lento ahora, estará lento después").
- **Error en el tiempo de viaje**, en minutos, frente al promedio histórico.

**Ranking (izquierda): "Dónde actuar primero"**

Las 22 vías ordenadas por probabilidad de colapso en la próxima hora. Cada fila trae la velocidad ahora → la predicha. El filtro **Avisos tempranos** deja solo las vías que hoy fluyen y van a colapsar.

**Detalle de una vía (derecha)**

Haz clic en una vía del ranking o del mapa:

- **Veredicto:** "Aviso temprano", "El colapso continúa", "Vigilar" o "Sin riesgo", con la explicación.
- **Tres cifras:** velocidad ahora, predicha para dentro de una hora, y la real (o la normal, si no revelas).
- **Gráfico del día:** blanco es lo medido, turquesa lo que el modelo predijo una hora antes, la franja roja es la zona de colapso. Abajo, la probabilidad de colapso de cada hora.
- **¿Y si empieza a llover?:** mueve el control de lluvia (0 a 20 mm) y el modelo vuelve a predecir en ese instante. Muestra cuánto sube el riesgo y si se activaría la alerta.



### 1.5 Mi viaje — para el ciudadano

Responde: **¿salgo ahora o espero una hora?**

1. Elige tu recorrido en la lista (corredor, tramo y sentido).
2. Lee el consejo: **"Sal ahora"**, **"Si puedes, espera"**, **"Evita esta vía si puedes"** o **"Sal cuando quieras"**.
3. Compara los minutos si sales a esta hora y si sales en una hora.

Usa la misma hora y el mismo día de la línea de tiempo, así que puedes moverte en el día y ver cómo cambia el consejo.

### 1.6 Navegar — rutas reales con el riesgo de la próxima hora

Requiere internet y la clave `GOOGLE_MAPS_API_KEY` en el archivo `.env`.

1. Escribe **Desde** (o pulsa **◎** para usar tu ubicación) y **Hasta**. Sirven direcciones, lugares ("Parque Lleras") o coordenadas `lat,lon`. Si no escribes el municipio, se asume Medellín. **↕** intercambia origen y destino.
2. Pulsa **Ver rutas**. Google entrega hasta tres caminos con el tráfico de este momento.
3. La ruta elegida se pinta por partes: **blanco** es calle sin sensor; **verde, ámbar y rojo** es el riesgo de colapso dentro de una hora en las vías vigiladas. El rojo punteado y en movimiento es un colapso previsto.
4. Abajo, la barra explica la decisión. Si la ruta más rápida de ahora pasa por una vía que va a colapsar, dice cuál evita el colapso y cuántos minutos más cuesta.
5. Las tarjetas muestran cada ruta: minutos, kilómetros, demora por el tráfico actual y las vías vigiladas por las que pasa. Etiquetas: **EVITA EL COLAPSO** y **AHORA MÁS RÁPIDA**. Haz clic en una tarjeta o en una línea del mapa para cambiar de ruta.

Hay un cupo diario de búsquedas (100 por defecto). Si la conexión con Google falla, la aplicación reintenta sola tres veces antes de mostrar el error.

### 1.7 En vivo — Medellín hoy

Las 22 vías con el riesgo de colapso para la próxima hora, calculado con tráfico actual.

- **Fuentes:** chips de TomTom, HERE, Google y Open-Meteo (lluvia). Verde es que leyó bien, ámbar que espera su turno, rojo que está pausado (cuota agotada o clave rechazada), gris que no tiene clave. Pasa el mouse para ver el detalle.
- **↻ Consultar ahora:** fuerza una lectura de todos los proveedores.
- El modelo necesita **4 horas seguidas** de lecturas por vía. Mientras tanto, la vía aparece como "Recolectando: n de 4 h".
- El recolector automático lee de 5:00 a 21:00 mientras la API esté encendida.
- **Buscar una ruta en el mapa →** lleva a Navegar.

La pantalla se actualiza sola cada minuto.

### 1.8 Evidencia — la prueba de que funciona

- **Cuatro tarjetas de valor:** colapsos sin aviso, cuántos se anticiparon, detección frente a la regla actual y error del tiempo de viaje.
- **Cómo se eligió el modelo:** los ganadores y sus razones, y las tablas con todos los candidatos, incluida su prueba en el holdout 2026 y la comparación con el modelo anterior (sensores GT 2017-2020).
- **Lo que muestran los datos:** los nueve gráficos del análisis exploratorio. Haz clic para ampliarlos.
- El enlace **API** abre `/docs`, donde se puede probar cada servicio con botones.



### 1.9 Guion de demostración (5 minutos)

1. **Historia** completa y **Ver el día →** (1 min).
2. En **Centro de control**, pausa cuando aparezca un **AVISO TEMPRANO**. Abre la vía y muestra que ahora fluye, pero el modelo espera la caída. Avanza una hora con **→** y muestra el ✓ (1 min).
3. En esa vía, sube la lluvia en **¿Y si empieza a llover?** (30 s).
4. **Mi viaje** con la misma vía: "¿salgo ahora o espero?" (30 s).
5. **Navegar** con un origen y destino reales, y lee la barra de decisión (1 min).
6. **Evidencia**: las cuatro tarjetas y la tabla de modelos (1 min).

---



## 2. Cómo genera valor



### 2.1 El problema que resuelve

La congestión en Medellín se gestiona **tarde**. El Sistema Inteligente de Movilidad (SIMM) ve el tráfico en tiempo real, pero cuando una vía aparece en rojo el colapso ya ocurrió.

En el periodo de prueba (2025) hubo 13.312 horas-tramo en colapso. **3.916 (29 %) empezaron en una vía que una hora antes circulaba bien.** Para quien solo mira el presente, esos colapsos llegan sin aviso.

### 2.2 Lo que entrega, medido en datos reales


| Para quién                         | Qué gana                                                                                                         | Evidencia                                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Operador del centro de control** | Ve colapsos que hoy son invisibles, con una hora para actuar: ajustar semáforos, ubicar agentes, publicar avisos | Anticipó **1.475** de los 3.916 colapsos sin aviso (38 %). El monitoreo actual anticipa 0 |
| Operador | Detecta más colapsos y con menos ruido que la regla actual | Detecta el **79 %** (frente a 71 %) y acierta en el **74 %** de sus alertas (frente a 70 %) |
| Operador | Prioriza recursos escasos | Unas **39 alertas al día** en toda la red (unas 10 falsas): un volumen que una persona puede revisar |
| **Ciudadano** | Tiempo de viaje confiable y la decisión de salir ahora o esperar | Error medio de **0,63 min** por tramo, **64 % más preciso** que el promedio histórico de esa hora (1,77 min) |
| Ciudadano                          | Una ruta que evita el colapso antes de que se forme                                                              | Pestaña Navegar, sobre rutas reales de Google                                                                                  |
| Operador y ciudadano               | Anticipa el efecto de la lluvia                                                                                  | Con lluvia fuerte, el colapso en hora pico pasa de **15 % a 34 %**. El modelo usa la lluvia actual y la de las últimas 3 horas |
| **Planeador de movilidad**         | Entiende qué tramos colapsan, cuándo y por qué                                                                   | Tramos críticos, horas pico, lluvia, demanda de la Encuesta Origen-Destino 2025 y siniestralidad 2008-2025                     |
| **Secretaría de Movilidad**        | Costo bajo                                                                                                       | Usa datos que la Alcaldía ya publica y software libre. No necesita sensores nuevos                                             |




### 2.3 Por qué importa

- **Escala:** 6,49 millones de viajes en un día hábil en el Valle de Aburrá. Una mejora pequeña se multiplica por millones.
- **Tendencia:** las motos crecieron 48 % entre 2017 y 2025 y el transporte público bajó 14 %. Hay más vehículos en las mismas vías.
- **Seguridad:** las 17:00 es a la vez la hora pico del tráfico y la hora con más incidentes viales (2008-2025). En 2025 hubo 276 muertes en las vías de Medellín.



### 2.4 Antes y después


| Hora  | Hoy (gestión reactiva)                            | Con MobiPredict (gestión anticipada)                                                                                     |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 16:00 | La Av. Oriental circula bien. Nadie actúa         | Aparece **AVISO TEMPRANO** en la Av. Oriental para las 17:00                                                             |
| 16:10 | —                                                 | El operador ajusta el plan semafórico, ubica un agente y publica el aviso. Los ciudadanos ven la ruta alterna en Navegar |
| 17:00 | La vía colapsa y el operador empieza a reaccionar | La vía llega más cargada, pero con las medidas en marcha                                                                 |


El ejemplo muestra el flujo de uso. Las cifras de la sección 2.2 sí son reales.

---



## 3. Fortalezas y debilidades



### 3.1 Fortalezas

1. **Anticipa, no describe.** Convierte la predicción en una alerta con nivel de riesgo y una acción sugerida.
2. **Datos 100 % reales:** cámaras ARS del SIMM (2019-2026) y fuentes abiertas, con origen y huella (hash) de cada archivo descargado. Ningún dato es simulado.
3. **Une fuentes que hoy están separadas:** velocidades del SIMM, lluvia, festivos y la Encuesta Origen-Destino 2025 como señal de demanda por hora y por zona.
4. **Evaluación honesta.** Las reglas para elegir el modelo se fijaron antes de ver resultados. Se compara siempre contra la forma actual de trabajar, no contra cero, con datos que el modelo no vio.
5. **Se sostiene en datos que nunca vio.** En el holdout ene-sep 2026, con más congestión que en la prueba (14 % de colapso frente a 12 %), mantuvo PR-AUC 0,84 frente a 0,69 de la regla simple. La pandemia de 2020 quedó dentro del entrenamiento.
6. **Ciclo MLOps completo:** descarga, limpieza, análisis, entrenamiento de 9 modelos, registro en MLflow, selección automática, API, interfaz, pruebas automáticas y Docker. Se reentrena con un comando.
7. **Se puede comprobar en pantalla.** La repetición de días reales muestra la predicción y lo que de verdad pasó, hora por hora.
8. **Explicable.** Cada alerta dice la velocidad actual, la esperada y por qué se considera colapso. El control de lluvia muestra cómo reacciona el modelo.
9. **Costo casi cero:** cámaras que el SIMM ya tiene, datos abiertos, software libre y cuotas gratuitas de los proveedores.



### 3.2 Debilidades


| Debilidad                                                      | Qué significa                                                                                                                                                              | Cómo se puede resolver                                                                                                                         |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Los datos de las cámaras son una exportación, no un feed en línea** | El modelo aprendió el tráfico de sep-2019 a dic-2023 con las cámaras ARS; los datos llegan al 3-sep-2026 y no se descargan solos | Conectar el feed del SIMM y reentrenar con `scripts/reentrenar_con_ars.py` por disparador (cuando cambie la tasa de alertas) |
| **En vivo es una aproximación**                                | TomTom, HERE y Google miden distinto que el SIMM. Su congestión se convierte a la escala del SIMM, y esa conversión no está validada contra mediciones oficiales recientes | Validarla en cuanto haya datos del SIMM actuales                                                                                               |
| **Detecta el 79 % de los colapsos** | Uno de cada cinco colapsos pasa sin alerta | Bajar el umbral (más detección a cambio de más falsas alarmas) o probar modelos espaciales |
| **Unas 10 falsas alarmas al día** | 1 de cada 4 alertas no termina en colapso | El operador las descarta en segundos. Una alerta perdida cuesta más que una falsa |
| **La cámara mide un punto, no el corredor** | Las cámaras ARS dan la velocidad en un punto; el tiempo de viaje se estima con la longitud del tramo | Cruzarlo con tiempos de viaje de corredor cuando el SIMM los entregue |
| **Solo 22 tramos de 11 corredores**                            | El resto de calles de la ciudad no tiene predicción                                                                                                                        | Agregar tramos es agregar sus lecturas. El modelo es uno solo para toda la red                                                                 |
| **Un punto por tramo**                                         | La ruta y el tramo se cruzan por cercanía a un punto (150 m), no por el trazado completo                                                                                   | Usar la geometría completa de cada corredor                                                                                                    |
| **Horizonte fijo de una hora y solo de 6:00 a 20:00**          | No hay predicción a 15 o 30 minutos ni de noche                                                                                                                            | Entrenar horizontes más cortos con lecturas más frecuentes                                                                                     |
| **Predice velocidad, no número de vehículos**                  | No hay conteos abiertos y continuos de vehículos                                                                                                                           | La velocidad describe mejor la congestión                                                                                                      |
| **En vivo necesita 4 horas de historia y claves de API**       | Recién encendido, no predice. Depende de cuotas externas y del internet del equipo                                                                                         | Dejar el recolector encendido en un servidor                                                                                                   |


---



## 4. En qué se distingue de Waze y Google Maps

MobiPredict **no compite** con Waze ni con Google Maps: los usa como insumo. La pestaña Navegar toma las rutas y el tráfico actual de Google, y les agrega lo que Google no da: el riesgo de colapso de la próxima hora en las vías principales de Medellín.


|                                | Waze                               | Google Maps                                  | MobiPredict                                                                     |
| ------------------------------ | ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| **Pregunta que responde**      | ¿Por dónde llego más rápido ahora? | ¿Por dónde llego más rápido ahora?           | ¿Qué vía va a colapsar en una hora, aunque hoy fluya?                           |
| **Usuario principal**          | Conductor                          | Cualquier viajero                            | Operador del centro de control, luego ciudadano y planeador                     |
| **Momento**                    | Presente                           | Presente, con estimaciones de hora de salida | Una hora adelante, con alerta y nivel de riesgo                                 |
| **De dónde salen los datos**   | GPS y reportes de sus usuarios     | GPS de celulares e historial propio          | Sensores oficiales del SIMM, lluvia, festivos y la Encuesta Origen-Destino 2025 |
| **Se puede auditar**           | No                                 | No                                           | Sí: datos de origen, código, métricas y cada decisión documentada                |
| **Contra qué se compara**      | No publica                         | No publica                                   | Contra la regla actual del operador, con datos que el modelo no vio             |
| **Para qué sirve a la ciudad** | Desvía conductores uno por uno     | Desvía viajeros uno por uno                  | Le da a la Alcaldía una hora para actuar sobre toda la red                      |
| **Explica el porqué**          | No                                 | No                                           | Velocidad actual, velocidad esperada, efecto de la lluvia y demanda de la zona  |
| **Cobertura**                  | Todas las calles                   | Todas las calles                             | 22 tramos de 11 corredores principales                                          |
| **Cuándo se actualiza**        | Segundos                           | Segundos                                     | Cada hora                                                                       |


**La diferencia clave:** Waze y Google Maps desvían a cada conductor cuando el trancón ya existe. Si miles de conductores reciben el mismo desvío al mismo tiempo, el trancón se traslada a la vía alterna. MobiPredict avisa **a la autoridad** una hora antes, cuando todavía puede cambiar la causa: el semáforo, el agente en la esquina o el aviso público.

**Lo que no hace:** no da indicaciones giro a giro, no cubre todas las calles y no reacciona en segundos. Para eso están Waze y Google Maps.