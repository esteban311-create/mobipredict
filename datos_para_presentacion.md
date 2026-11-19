# MobiPredict: datos para la presentación

> **Dos versiones de datos.** Las secciones 1 a 3 (fuentes, limpieza y EDA) describen la serie abierta **GT
> 2017-2020**, con la que se hizo el EDA y el primer modelo. El modelo vigente se reentrenó con las **cámaras ARS/CCTV
> del SIMM (sep-2019 a sep-2026)**: la sección 4 ya tiene sus cifras (actualizada el 2026-11-19). Las cifras del
> problema con ARS (tasa de colapso por año, tramo crítico, lluvia) están en `docs/problema_usuarios_valor.md`.
>
> | Serie ARS | Valor |
> |---|---|
> | Origen | Exportación de bases diarias `.csv.gz` de las cámaras ARS/CCTV del Observatorio de Movilidad de Medellín (no es dato abierto) |
> | Archivos | 2.601 diarios; 2.368 con lecturas útiles de los 22 tramos, 233 vacíos |
> | Resultado | 744.375 filas horarias (tramo × hora), 22 tramos, 2019-08-29 a 2026-09-03, 6-20 h |
> | Limpieza | Nombres de corredor unificados, velocidades fuera de 2-110 km/h descartadas, lat/lon invertidas corregidas, promedio horario por tramo |
> | Tiempo de viaje | Estimado: longitud del tramo (catálogo GT) / velocidad, porque la cámara mide un punto |
> | Script | `scripts/convertir_ars_a_sensores.py`; resumen en `data/interim/sensores_ars_horaria.resumen.json` |

Todo lo que sigue se calculó ejecutando código sobre los archivos del repositorio el 2026-11-11, en la rama
`pruebas`. Se usaron los datos crudos de `data/raw/`, las tablas de `data/interim/`, las particiones de
`data/processed/`, los modelos de `models/`, y las funciones de limpieza de `src/mobipredict/fuentes.py` y
`features.py`. El notebook `notebooks/MobiPredict_MLOps_end_to_end.ipynb` escribe esos mismos módulos con
`%%writefile`, así que su limpieza es la misma. Los números van sin redondear. Los porcentajes llevan al lado
sus conteos para poder verificarlos.

**Definiciones que se usan en todo el documento**

- **Velocidad de referencia de un tramo:** percentil 95 de su velocidad en el periodo de entrenamiento
  (antes de 2019-09-01). Se toma de `models/feature_store.joblib`.
- **Colapso:** velocidad menor al 50 % de la velocidad de referencia del tramo.
- **Hora-tramo:** una lectura horaria de un tramo. Es la unidad de casi todas las tablas.
- **Día hábil:** de lunes a viernes, sin festivos. **Fin de semana:** sábado y domingo.
- **Periodo del EDA:** de 2017-02-01 a 2020-03-19, es decir, antes de las restricciones de la pandemia.

---

## 1. Fuentes

El proyecto usa 5 fuentes, las de `config.FUENTES`. Además usa tres tablas auxiliares que no cuentan como
fuentes: la ubicación de las cámaras SIMM (`data/reference/corredores_simm.csv`), los centroides de las
macrozonas EOD (`data/reference/eod2025_macrozonas.csv`) y los festivos del paquete `holidays`. MB = 10^6
bytes.

| # | Fuente | Entidad que la publica | URL / archivo | Registros crudos | Columnas | Periodo (mín – máx) | Tamaño (MB) |
|---|---|---|---|---|---|---|---|
| 1 | Velocidad y tiempo de viaje GT | Secretaría de Movilidad de Medellín (SIMM), vía MEData | https://medata.app.medellin.gov.co/sites/default/files/distribution/1-023-25-000287/Velocidad_y_tiempo_de_viaje_GT.csv · `data\raw\medata_velocidad_tiempo_viaje_gt.csv` | 682502 | 20 | 2017-02-01 06:00:00 – 2020-12-15 20:00:00 | 89.832037 (89832037 bytes) |
| 2 | Open-Meteo Historical Weather (ERA5/ERA5-Land) | Open-Meteo / Copernicus | https://archive-api.open-meteo.com/v1/archive?latitude=6.2442&longitude=-75.5812&start_date=2017-01-01&end_date=2020-12-31&hourly=precipitation,temperature_2m&timezone=America%2FBogota · `data\raw\open_meteo_medellin_horario.csv` | 35064 | 3 | 2017-01-01 00:00:00 – 2020-12-31 23:00:00 | 0.946804 (946804 bytes) |
| 3 | Encuesta Origen-Destino 2025 (API del visor) | Área Metropolitana del Valle de Aburrá (AMVA) | https://eod2025.metropol.gov.co/api/api/indicadores/{id}/agregado · `data\raw\eod2025_indicadores.json` | 43 indicadores; 3126 pares OD; 96 celdas hora×grupo | no aplica (JSON); la matriz OD tiene 3 campos | no disponible: son agregados de un día hábil típico de 2025, sin fechas. Descarga: 2026-10-23 | 0.222898 (222898 bytes) |
| 4 | Road-traffic incidents and fatalities in Medellín 2008–2025 | Correa Álvarez et al. (2026), Mendeley Data, con registros de la Secretaría de Movilidad (CC BY 4.0) | https://data.mendeley.com/public-files/datasets/r6g5dfnpgh/files/e992c888-5819-40c6-9538-41980ea1d429/file_downloaded · `data\raw\mendeley_siniestros_medellin_2008_2025.zip -> Medellin_Road_Traffic_Fatalities_Dataset_2008_2025/Fatal_Road_Traffic.xlsx (hoja BD)` | 702540 | 13 | 2008-01-01 00:00:00 – 2025-08-31 00:00:00 | 63.120526 (63120526 bytes, ZIP) |
| 5 | Aforos vehiculares | Secretaría de Movilidad de Medellín, vía MEData | https://medata.app.medellin.gov.co/sites/default/files/distribution/1-023-25-000301/Aforos_Vehiculares.csv · `data\raw\medata_aforos_vehiculares.csv` | 74900 | 41 | 2017-10-18 00:00:00 – 2019-10-31 00:00:00 (columna DIA/MES/AÑO) | 19.663658 (19663658 bytes) |

**Variables que cada fuente aporta al modelo.** Son los nombres de las columnas finales; en total hay 35, y el
detalle está en la sección 4.

| Fuente | Variables | N |
|---|---|---|
| 1. Velocidad GT | `velocidad_kmh`, `ratio_vel`, `velocidad_media_3h`, `velocidad_delta1`, `ratio_vel_delta1`, `n_lecturas_previas`, `velocidad_kmh_lag1`, `velocidad_kmh_lag2`, `velocidad_kmh_lag3`, `ratio_vel_lag1`, `ratio_vel_lag2`, `ratio_vel_lag3`, `longitud_km`, `flujo_continuo`, `vel_referencia_kmh`, `perfil_velocidad`, `desvio_perfil`. Calendario derivado de su timestamp: `hora_sin`, `hora_cos`, `dow_sin`, `dow_cos`, `mes_sin`, `mes_cos`, `es_fin_semana`, `es_pico`, `es_festivo`. Ubicación (tabla auxiliar SIMM): `lat`, `lon` | 28 |
| 2. Clima | `lluvia_mm`, `lluvia_3h` | 2 |
| 3. EOD 2025 | `eod_share_privado_hora`, `eod_share_publico_hora`, `eod_share_total_hora`, `eod_viajes_generados_mz`, `eod_viajes_atraidos_mz` | 5 |
| 4. Siniestros | Ninguna: la fuente se usa solo en el EDA | 0 |
| 5. Aforos | Ninguna: la fuente se usa solo en el EDA | 0 |

La velocidad GT también define las **dos variables objetivo** (`y_velocidad_1h` y `y_colapso_1h`). Hay
`lluvia_mm_lag1..3` en el código, pero solo se usan para calcular `lluvia_3h`; no entran al modelo como
variables propias.

---

## 2. Limpieza

### 2.1 Velocidad GT (`fuentes.leer_velocidad_gt`, `fuentes.estandarizar_sensores`, `features.preparar_dataset`)

| # | Paso | Registros antes | Registros después | Diferencia |
|---|---|---|---|---|
| 0 | Filas crudas | — | 682502 | — |
| 1 | Quitar filas con FECHA_HORA inválida o velocidad nula | 682502 | 682502 | 0 |
| 2 | Quitar filas con FECHA_HORA incoherente con DIASEM | 682502 | 682502 | 0 |
| 3 | Quitar velocidades fuera de 2-110 km/h (atípicos físicamente imposibles) | 682502 | 682502 | 0 |
| 4 | Agregar a promedio horario por tramo (une lecturas de 30 min y claves duplicadas) | 682502 | 414439 | -268063 |
| 5 | Filtro de fecha inicio >= 2017-02-01 | 414439 | 414439 | 0 |
| 6 | Quitar horas sin lectura exactamente 1 h después (no hay objetivo: última hora del día y huecos) | 414439 | 383813 | -30626 |
| 7 | Quitar horas cuyo objetivo cae en la partición siguiente (sin fuga) y fuera de 2017-2020 | 383813 | 383813 | 0 |

Detalle de cada paso:

- **Paso 1 (nulos).** FECHA_HORA inválida: 0; velocidad nula: 0.
- **Paso 2.** 0 filas tienen el día de la semana incoherente con DIASEM.
- **Paso 3 (atípicos).** Hay 0 lecturas por debajo de 2 km/h y 0
  por encima de 110 km/h. El filtro existe, pero con estos datos no elimina nada.
- **Paso 4 (agregación).** Se calcula el promedio horario por tramo con un solo `groupby(tramo, hora)`. Une dos
  cosas:
  - 9716 claves (tramo, FECHA_HORA) duplicadas exactas: 682502 → 672786.
  - 264156 lecturas con minuto distinto de :00 (casi todas a las :30, presentes en todo el
    periodo, no solo en 2020): 672786 → 414439.
  - El resultado coincide con `data/interim/sensores_velocidad_horaria.parquet` (414439 filas).
- **Horario.** Hay lecturas de las 5 a las 20 h. No se aplica
  filtro de horario. La hora 20 queda fuera del modelo porque no tiene objetivo a las 21 h, y la hora 5 solo
  tiene 2 lecturas.
- **Tramos.** 22 tramos (corredor + sentido) en el archivo crudo y 22 en el
  dataset final. No hay filtro de tramo. Validación y test tienen 20 tramos con datos; train y drift, 22.
- **Paso 6 (objetivo).** Se descartan 30626 horas que no tienen una lectura
  exactamente 1 h después: la última hora de cada día y los huecos del sensor.
- **Paso 7 (fronteras).** Ninguna fila cruza la frontera entre particiones (0) ni queda
  fuera de 2017-2020 (0).
- **Nulos que quedan (no se eliminan).** Los rezagos son NaN cuando la lectura anterior no está justo 1, 2 o
  3 h antes. Random Forest los imputa con la mediana y LightGBM los maneja de forma nativa. Conteos en train:
  `velocidad_delta1` 20309, `ratio_vel_delta1` 20309, `velocidad_kmh_lag1` 20309, `velocidad_kmh_lag2` 40227, `velocidad_kmh_lag3` 59888, `ratio_vel_lag1` 20309, `ratio_vel_lag2` 40227, `ratio_vel_lag3` 59888.

**Número final: 383813 horas-tramo** (train 249813, valid 24424, test 30060, drift 79516).

### 2.2 Clima (`fuentes.estandarizar_clima`)

| # | Paso | Registros antes | Registros después | Diferencia |
|---|---|---|---|---|
| 0 | Filas crudas (1 por hora, 2017-01-01 a 2020-12-31) | — | 35064 | — |
| 1 | Rellenar 0 nulos con 0 y recortar 0 negativos a 0 (no elimina filas) | 35064 | 35064 | 0 |
| 2 | Unir por hora a la serie de velocidad (se usan las horas con lectura de sensor) | 35064 | 19337 | -15727 |

- Nulos de lluvia: 0. Negativos: 0. Timestamps duplicados:
  0. No hay filtro de atípicos; el máximo es 17.4 mm/h.
- Horas con lluvia mayor que 0: 12653 de 35064.
- Todas las 19337 horas distintas con lectura de sensor tienen dato de clima
  (0 sin cruce). Por eso no queda ningún NaN de lluvia en las variables
  (0).
- Es un único punto, el centro de Medellín (6.2442, -75.5812); la misma lluvia se asigna a todos los tramos.

**Número final: 35064 horas** en la tabla limpia, de las que se usan 19337.

### 2.3 EOD 2025 (`fuentes.estandarizar_eod`, `fuentes.priors_macrozona`)

Del JSON (43 indicadores) salen dos tablas, así que los pasos no son una sola cadena:

| Tabla | Paso | Registros antes | Registros después |
|---|---|---|---|
| Distribución horaria | Tomar los 4 indicadores horarios (16 informal, 17 privado, 18 público, 19 no motorizado) | 96 celdas hora×grupo | 96 |
| Distribución horaria | Unir los 4 grupos por hora (horas sin dato = 0) y sumar el total | 96 | 24 filas |
| Matriz OD | Tomar el indicador 15 (pares origen-destino) | 3126 pares | 3126 |
| Matriz OD | Agregar viajes generados (por origen) y atraídos (por destino) por macrozona | 3126 | 67 macrozonas |

- **Distribución horaria.** Celdas hora×grupo sin dato: 0. Su suma da
  6490298.966998089 viajes, igual al indicador oficial «Total de viajes en un día hábil»
  (6490298.966998089).
- **Matriz OD.** Pares nulos: 0. Duplicados: 0. Tiene
  67 macrozonas de origen y 67 de destino, y suma
  6490299.100000001 viajes.
- **Uso en el modelo.** Cada tramo se asigna a la macrozona con el centroide más cercano. Los 22 tramos caen en
  las macrozonas [12, 14, 15, 16, 19, 21, 30].

**Número final:** 24 filas horarias y 67 macrozonas con viajes generados y atraídos.

### 2.4 Siniestros (`fuentes.estandarizar_siniestros`)

| # | Paso | Registros antes | Registros después | Diferencia |
|---|---|---|---|---|
| 0 | Filas crudas (hoja de datos del Excel) | — | 702540 | — |
| 1 | Estandarizar 8 columnas (año, fecha, hora, clase, gravedad, lat, lon, comuna) y marcar fatal | 702540 | 702540 | 0 |
| 2 | Filtro año 2008-2025 (EDA) | 702540 | 702540 | 0 |
| 3 | Quitar filas sin hora (solo para la tabla por hora) | 702540 | 702540 | 0 |

- **Nulos.** anio: 0, fecha: 0, hora: 0, lat: 44785, lon: 44785. Las filas sin coordenadas no se eliminan
  porque el EDA no usa ubicación.
- No hay filtro de duplicados ni de atípicos.
- Del total, 2762 incidentes son fatales (gravedad que empieza por «MUERT»).
- **Filtro de la tabla del EDA (3.4).** Se usan los días hábiles de 2017-02-01 a 2020-03-19, la misma ventana
  de los sensores: 104228 incidentes.

**Número final: 702540 incidentes** en la tabla limpia. La fuente no entra al modelo.

### 2.5 Aforos (`fuentes.estandarizar_aforos`)

| # | Paso | Registros antes | Registros después | Diferencia |
|---|---|---|---|---|
| 0 | Filas crudas (conteos de 15 min por movimiento) | — | 74900 | — |
| 1 | Seleccionar 8 columnas (nodo, 5 tipos de vehículo, año, hora) y convertir a número | 74900 | 74900 | 0 |
| 2 | Quitar filas sin hora o sin año | 74900 | 59691 | -15209 |
| 3 | Agregar por año x hora (suma de vehículos) | 59691 | 36 | -59655 |

- **Paso 2.** Las 15209 filas eliminadas no tienen ni NODO ni HORA_A (3204 son de 2017 y 12005 de 2018). Por
  eso los años que quedan son [2018, 2019], y el aforo válido va de 2018-07-26 a 2019-10-31 (71 días).
- **Otros nulos tras convertir a número** (no eliminan filas porque la suma los ignora):
  autos 527, buses 522, camiones 523, motos 523, bicicletas 1, anio 0.
- **Duplicados.** Hay 65 filas duplicadas exactas en el crudo (64 entre las filas
  válidas). **El código no las elimina.**
- **Agregación.** Se hace por año × hora. Hay 151 nodos distintos. El resultado coincide con
  `data/interim/aforos_composicion.parquet`.

**Número final: 36 filas** (año × hora) y 59691 conteos de 15 min. La fuente no
entra al modelo.

---

## 3. EDA

### 3.1 Velocidades: % de horas en colapso y velocidad media por hora

La tabla usa 329163 horas-tramo de 2017-02-01 a 2020-03-19. Se excluyen 14162
horas-tramo de festivos entre semana. «horas» son horas-tramo.

```csv
hora,horas_tramo_habil,horas_colapso_habil,pct_colapso_habil,vel_media_kmh_habil,horas_tramo_fin_semana,horas_colapso_fin_semana,pct_colapso_fin_semana,vel_media_kmh_fin_semana
5,2,0,0,40.75,,,,
6,11092,302,2.722683014785431,31.09860972300929,4155,6,0.1444043321299639,38.13450060168472
7,15697,1240,7.8995986494234565,28.057386359844315,5717,19,0.33234213748469477,36.543029560958544
8,15671,574,3.6628166677302025,29.63182373568405,5719,46,0.8043364224514775,34.23315556332692
9,15679,1033,6.588430384590854,27.313726579987183,5704,65,1.1395511921458625,33.16578424497429
10,15720,1348,8.575063613231553,27.422123318793165,5681,126,2.2179193803907764,31.838332453206597
11,15776,1434,9.089756592292089,27.72172317202743,5691,278,4.884905991917062,30.618552685526854
12,15696,1553,9.894240570846076,27.24421529901461,5730,578,10.087260034904014,29.35633507853403
13,15667,800,5.106274334588626,28.393194293738432,5683,704,12.38782333274679,29.314270631708606
14,15696,1135,7.231141692150866,26.88094631328576,5725,548,9.572052401746726,30.761796215429403
15,15660,1968,12.567049808429118,25.624260323541932,5728,393,6.8610335195530725,31.561723114525137
16,15675,3255,20.76555023923445,23.943413259255365,5728,237,4.137569832402234,32.12332984171322
17,15736,6581,41.82130147432638,21.091436999176896,5728,142,2.479050279329609,32.416462988826815
18,15688,4067,25.924273329933705,24.087739946820133,5680,97,1.7077464788732395,32.170868544600935
19,15699,1547,9.854130836359005,27.092818013886237,5713,121,2.1179765447225622,31.616010268977185
20,15752,844,5.358049771457592,29.78804702048417,5713,66,1.1552599334850342,32.490206546472955
```

**Conclusión.** En día hábil el colapso es 2.9425874173587716 veces más
frecuente que en fin de semana: 11.98799511489524 % frente a 4.0739639693204115 % de las
horas-tramo. El punto crítico es las 17 h de los días hábiles: 41.82130147432638 %
de las horas en colapso, cuando la velocidad media de la red baja a 21.091436999176896 km/h.
El fin de semana el máximo es 12.38782333274679 %, a las 13 h.

### 3.2 Lluvia: % de colapso en hora pico por nivel de lluvia

Se usan días hábiles del periodo del EDA y las horas pico del EDA original (7, 8, 17, 18 y 19). Los niveles son:
sin lluvia, 0 mm; leve, más de 0 y hasta 3 mm/h; fuerte, más de 3 mm/h. La columna `horas_tramo` cuenta
lecturas tramo-hora y `horas_reloj` cuenta horas distintas del calendario.

```csv
nivel,horas_reloj,horas_tramo,horas_colapso,pct_colapso
sin_lluvia,2490,53393,7752,14.518757140449123
leve_0_a_3mm,1111,23934,5877,24.555026322386563
fuerte_mas_de_3mm,54,1164,380,32.64604810996563
```

El mismo cálculo con los cuatro cortes de la figura `eda/figures/08_lluvia_vs_colapso.png` (0, 0-1, 1-3 y más
de 3 mm):

```csv
nivel,horas_tramo,horas_colapso,pct_colapso
sin_lluvia,53393,7752,14.518757140449123
0-1mm,20726,4887,23.579079417157196
1-3mm,3208,990,30.860349127182047
mas_de_3mm,1164,380,32.64604810996563
```

> La figura 08 del EDA usa como referencia el p95 de todo el periodo anterior a la pandemia, no solo el de
> train. Esta tabla usa la misma referencia del modelo, así que sus porcentajes no tienen por qué coincidir
> con los de la figura.

**Conclusión.** En hora pico, el colapso pasa de 14.518757140449123 % sin lluvia a
24.555026322386563 % con lluvia leve y 32.64604810996563 % con lluvia
fuerte: 2.248542887945556 veces más. La lluvia fuerte
es rara: solo 54 horas de reloj (1164
horas-tramo).

### 3.3 Encuesta Origen-Destino 2025

**Viajes por hora de inicio (día hábil):**

```csv
hora,viajes_informal,viajes_privado,viajes_publico,viajes_no_motorizado,viajes_total
0,578.035690235962,1774.7469483317132,2927.319656217451,1777.9142353626562,7058.016530147783
1,1037.3069253288738,3685.0561991777913,1346.81844639251,1530.3299639274028,7599.511534826578
2,1760.7710750105157,6873.077611480348,3112.8481965453184,1883.043385729484,13629.740268765669
3,976.1150325750498,7441.9389507124115,5859.297134218854,2343.192553185073,16620.54367069139
4,1995.4369813710855,26722.660755887347,64219.92343283563,9844.874540203098,102782.89571029716
5,6721.494300771577,114379.55223617573,148582.4473178992,74269.58458655693,343953.07844140346
6,16545.99832581314,230844.39939990384,239033.82777169722,230544.48418767488,716968.7096850891
7,19531.684336329847,200941.4500576473,175366.5762563718,123770.6747408812,519610.3853912301
8,14244.13998762791,100780.1781694766,118391.92307937666,113921.654827102,347337.8960635832
9,17450.073429551536,65838.90440871674,98624.04557403381,110015.44009968324,291928.4635119853
10,20024.893247835684,72141.59133239134,113663.1310523966,135480.95746848156,341310.57310110517
11,14477.753188719704,69099.06830546347,100226.735791438,151332.7111681349,335136.2684537561
12,12338.865530631272,123540.3994122522,119081.95222054442,341052.36205545,596013.5792188778
13,11715.246614681224,85685.78678599474,105321.89261197843,110942.50639313029,313665.43240578467
14,14095.984049977324,98802.99682666906,131900.0151001582,102425.07517371999,347224.07115052454
15,13932.957149727663,92947.28962411202,116221.47584944085,95025.6115326948,318127.3341559754
16,15673.828298456896,130123.38587103249,157919.4309809503,107067.2429872778,410783.8881377175
17,17909.10224323727,181713.69287311845,212837.43173775356,225682.97609597948,638143.2029500888
18,10813.525442054895,97205.39055286715,130452.63896955352,111277.10558261658,349748.66054709215
19,8178.340326988511,54752.863195717335,60774.29456102083,58161.94718220544,181867.44526593213
20,3953.4254517691666,50848.44218584645,41997.68242871865,31118.225403923494,127917.77547025775
21,4581.188330494268,27629.96683715258,27154.7899345171,17632.495055980427,76998.44015814437
22,4130.108894613837,22792.78267543439,19844.25739059742,16027.558798468448,62794.70775911409
23,1803.352302146688,12888.35008556135,2099.888892923741,6286.756135067512,23078.347415699292
```

**Viajes por macrozona de destino (top 10 de 67):**

```csv
id_macrozona,municipio,macrozona,viajes_atraidos,pct_del_total
19,Medellín,La Candelaria,578475.1,8.912918974720284
12,Medellín,El Poblado,444067.3,6.842015955782375
11,Medellín,Robledo,330583.5,5.093501777136896
16,Medellín,Belén,328044.7,5.054384935819059
21,Medellín,Laureles-Estadio,298227,4.594965430791934
13,Medellín,Manrique,243652,3.7540950924742433
15,Medellín,Buenos Aires,235550.3,3.629267255187053
22,Medellín,San Javier,234376.3,3.6111787205615835
17,Medellín,Aranjuez,234035.69999999998,3.605930888454739
30,Medellín,Castilla,208719.3,3.2158656601819784
```

**Conclusión.** La demanda se concentra a las 6 h, con 716968.7096850891 viajes que
empiezan en esa hora, y La Candelaria es el destino número uno (8.912918974720284 % de los
viajes atraídos). El modelo recibe esta información a través de `eod_share_*_hora` (la hora objetivo) y
`eod_viajes_*_mz` (la macrozona del tramo).

### 3.4 Siniestros: relación con el colapso por hora

Se usan días hábiles de 2017-02-01 a 2020-03-19 (104228 incidentes). Los
porcentajes de colapso son los mismos de la tabla 3.1.

```csv
hora,incidentes,pct_colapso_habil
5,2727,0
6,6480,2.722683014785431
7,6864,7.8995986494234565
8,5297,3.6628166677302025
9,4875,6.588430384590854
10,5211,8.575063613231553
11,5507,9.089756592292089
12,6118,9.894240570846076
13,6163,5.106274334588626
14,6341,7.231141692150866
15,6558,12.567049808429118
16,7133,20.76555023923445
17,8425,41.82130147432638
18,6700,25.924273329933705
19,5522,9.854130836359005
20,4442,5.358049771457592
```

**Conclusión.** Los incidentes y el colapso suben juntos a lo largo del día: la correlación de Pearson entre
horas es 0.725664887586906 (n = 16 horas), y las dos curvas tienen su máximo a las
17 h (8425 incidentes). Es una relación agregada, no causal, porque las dos
dependen del volumen de tráfico. Por eso la fuente se usa como contexto de valor y no entra al modelo.

### 3.5 Aforos: volumen vehicular y colapso por hora

Se usan los conteos de 2018-2019 y el colapso de los días hábiles de esos mismos años. `total` es la suma de
autos, buses, camiones, motos y bicicletas aforados.

```csv
hora,total,motos,pct_motos,pct_colapso_habil
5,556,209,37.589928057553955,0
6,295777,120220,40.64548629541851,4.006163328197227
7,378865,157924,41.68344924973276,8.253319713993871
8,336051,118687,35.31815111396782,3.7950081833060554
9,195878,69635,35.55018940360837,7.606035889070147
10,189682,68071,35.886905452283294,9.399106780349168
11,196799,72385,36.78118283121357,9.664674298450004
12,300836,112395,37.36088765972158,10.437607878972486
13,297627,111185,37.35716181663626,5.273357813137495
14,215054,83333,38.749802375217385,7.840551780099402
15,215017,81696,37.99513526837413,12.930327868852459
16,392639,155574,39.622655925672184,21.95718654434251
17,467363,216820,46.39220477444727,43.88292485314969
18,433903,198104,45.65628723470453,25.183374083129586
19,221255,81460,36.81724706786287,10.272579332790887
20,146718,53295,36.324786324786324,5.1566314076484945
```

**Conclusión.** El volumen aforado y el colapso están correlacionados entre horas (Pearson
0.6951055690551806, n = 16), y el pico de volumen es a las 17 h
(467363 vehículos). Las motos son el 39.674828960840344 % de todos los vehículos aforados
(1750338 de 4411709).

---

## 4. Modelo

> **Modelo vigente: entrenado con las cámaras ARS/CCTV del SIMM (sep-2019 a sep-2026).** Esta sección se
> regeneró el 2026-11-19 con `models/metadata.json`, `models/_resultados_entrenamiento.csv` y los modelos
> guardados. Las secciones 1 a 3 describen la serie GT 2017-2020 con la que se hizo el EDA.

### 4.1 Algoritmo final y modelos comparados

Son dos tareas, y se eligió un ganador para cada una con reglas fijadas antes de ver test
(`src/mobipredict/selection.py`).

- **Colapso a 1 hora (el que genera la alerta): `lightgbm` (LGBMClassifier)**, con `{"n_estimators": 200, "learning_rate": 0.025172670316561726, "num_leaves": 25, "min_child_samples": 24, "subsample": 0.6321943010099753, "colsample_bytree": 0.5844885816176459, "reg_lambda": 3.0648200249672355, "scale_pos_weight": 1.0061806713946442, "subsample_freq": 1}`.
  - Regla de selección: recall ≥ 0.70 en validación; entre los que cumplen, la mayor PR-AUC.
  - Detalle de `metadata.json`: lightgbm obtiene PR-AUC de validación 0.848 con recall 0.79 y precisión 0.73 (umbral 0.348).
- **Velocidad a 1 hora (el que da el tiempo de viaje): `mlp` (red neuronal MLPRegressor)**, con `{"regressor__m__alpha": 1.1527987128232396e-05, "regressor__m__hidden_layer_sizes": [128, 64], "regressor__m__learning_rate_init": 0.0026361418548357203}`.
  - Detalle de `metadata.json`: mlp obtiene el menor RMSE de validación (2.10 km/h) y reduce el WAPE 67.6 % frente al perfil histórico.

En las dos tareas, la búsqueda de hiperparámetros usó TimeSeriesSplit(3): Optuna para LightGBM y
RandomizedSearchCV para el resto. Las métricas vienen de `models/_resultados_entrenamiento.csv`, sin redondear.

**Colapso.** El umbral es el que maximiza F1 en validación. `regla_umbral` es la línea base sin entrenamiento.

```csv
modelo,umbral,valid_pr_auc,valid_recall_colapso,valid_precision_colapso,test_pr_auc,test_roc_auc,test_recall_colapso,test_precision_colapso,test_f1_colapso,test_brier,test_falsas_alarmas_por_dia,drift_pr_auc,drift_falsas_alarmas_por_dia,latencia_ms_1000,cv_score
regla_umbral,0.5569908546788909,0.6586569905265703,0.7192777482740308,0.634795650543682,0.6689687982481257,0.9379228636616777,0.6976412259615384,0.6456030587417448,0.670614145936383,0.06522709075338884,13.967123287671233,0.6886335572442958,13.894957983193278,0.23996666520057866,
logistica,0.8626649982459607,0.8072672935158707,0.7716409984067977,0.7076758231053965,0.8026349079694823,0.9664245589973661,0.7534555288461539,0.7218943428818195,0.7373373520546939,0.0922829839012783,10.586301369863014,0.8026615041758962,9.46218487394958,1.7718000017339364,0.7163888604212539
random_forest,0.7100129289925103,0.8367984177366025,0.7977695167286245,0.7211021505376344,0.8394376615860903,0.9745538306529414,0.8103966346153846,0.7219917012448133,0.763644085793162,0.057809004956716196,11.38082191780822,0.8432557433262015,11.592436974789916,49.186833333806135,0.710736695538421
lightgbm,0.3481829215022871,0.8477802252592085,0.7939458311205523,0.7344993613049032,0.8408231374302512,0.9740844859322892,0.7943960336538461,0.7380138181310629,0.7651676856843096,0.04072874673410255,10.284931506849315,0.8417128897651533,10.483193277310924,5.2364666674596565,0.7357745612738312
```

**Velocidad.** Errores en km/h. `perfil_historico` es la línea base.

```csv
modelo,valid_mae,valid_rmse,valid_wape,valid_r2,test_mae,test_rmse,test_wape,test_r2,test_mae_pico,drift_mae,drift_wape,latencia_ms_1000,cv_score
perfil_historico,4.554020376411052,5.777901637040037,0.16992170625708078,0.48497828454083003,4.469135368038664,5.654467039370239,0.1761533338440547,0.20201439963846068,4.361230238565752,5.012572834824777,0.19514112160905958,0.1650333336632078,
ridge,1.6732036851965912,2.409386185884926,0.06243134672320088,0.9104432994719222,1.6482022284524864,2.3095473329141174,0.06496476241634262,0.8668732175986595,1.8095658115998638,1.8576698692918123,0.07231970363691113,2.0846999977948144,-2.7308861954770918
random_forest,1.516620620644325,2.157082241562245,0.05658884728303541,0.9282174867609052,1.4621581878513712,2.0729593967018376,0.05763173817454445,0.8927509899723558,1.5837874653117423,1.6900116068894782,0.06579271192021896,64.86796666285954,-2.675008419567591
lightgbm,1.493960118393326,2.1537336408357417,0.05574332818367497,0.9284401805445708,1.436249695975715,2.029171216520006,0.05661054126665769,0.8972340864145472,1.5926789465990154,1.6771801702242954,0.0652931798385496,21.276300001773052,-2.6228340078302494
mlp,1.4753567018571214,2.1026606012785454,0.05504918893554664,0.9317938387998617,1.5030936090797764,2.105687605173877,0.059245229449224474,0.8893377280278222,1.6402722242499916,1.736059490238746,0.06758537127911551,5.045066665237148,-2.678699226681715
```

### 4.2 Variables de entrada, agrupadas por fuente

Las dos tareas usan las mismas 35 variables (`features.FEATURES_NUM`). Las variables marcadas como «hora
objetivo» se calculan para t + 1 h.

| Grupo | Variables | N |
|---|---|---|
| Velocidad ARS (cámaras SIMM): lecturas del tramo | `velocidad_kmh`, `ratio_vel`, `velocidad_media_3h`, `velocidad_delta1`, `ratio_vel_delta1`, `n_lecturas_previas`, `velocidad_kmh_lag1`, `velocidad_kmh_lag2`, `velocidad_kmh_lag3`, `ratio_vel_lag1`, `ratio_vel_lag2`, `ratio_vel_lag3` | 12 |
| Catálogo y referencias del tramo (longitud del catálogo GT; referencia y perfil calculados solo con train ARS) | `longitud_km`, `flujo_continuo`, `vel_referencia_kmh`, `perfil_velocidad`, `desvio_perfil` | 5 |
| Calendario derivado del timestamp (+ festivos del paquete holidays) | `hora_sin`, `hora_cos`, `dow_sin`, `dow_cos`, `mes_sin`, `mes_cos`, `es_fin_semana`, `es_pico`, `es_festivo` | 9 |
| Ubicación del tramo (referencia auxiliar data/reference/corredores_simm.csv) | `lat`, `lon` | 2 |
| Clima (Open-Meteo ERA5, 2019-2026) | `lluvia_mm`, `lluvia_3h` | 2 |
| EOD 2025 (AMVA) | `eod_share_privado_hora`, `eod_share_publico_hora`, `eod_share_total_hora`, `eod_viajes_generados_mz`, `eod_viajes_atraidos_mz` | 5 |

- **`perfil_velocidad`** (hora objetivo): velocidad media del tramo × tipo de día × hora. Se calcula solo con train.
- **`desvio_perfil`**: velocidad actual menos el perfil.
- **`vel_referencia_kmh`**: p95 de train. **`ratio_vel`**: velocidad actual dividida por la referencia.
- **`es_pico`**: horas 6, 7, 8, 17, 18 y 19.
- **`eod_share_*_hora`** (hora objetivo): fracción de los viajes diarios de la EOD que empiezan a esa hora.

### 4.3 Variable objetivo

- **`y_colapso_1h`** = 1 si `velocidad(t + 1 h) / vel_referencia_kmh < 0.5`.
  - La velocidad de t + 1 h es el promedio horario de las lecturas de las cámaras del tramo.
  - `vel_referencia_kmh` es el percentil 0.95 de la velocidad del tramo en train (2019-09-01 a 2023-12-31).
  - Solo existe si hay una lectura **exactamente** 1 h después; si no, la fila se descarta.
- **`y_velocidad_1h`**: velocidad media del tramo en t + 1 h, en km/h.
- **Horizonte:** 60 min. **Historia mínima** para predecir en la API: 4 lecturas horarias consecutivas.

### 4.4 Umbrales de alerta

El umbral rojo es el umbral de decisión de LightGBM, que maximiza F1 en validación. El ámbar es el 60 % de
ese umbral (`api/replay.py`, `_nivel`).

| Nivel | Nombre en la API | Probabilidad de colapso en 1 h | Horas-tramo de test en ese nivel |
|---|---|---|---|
| Verde | `normal` | p < 0.20892 (= 0.6 × 0.3482) | 93154 |
| Ámbar | `precaucion` | 0.20892 ≤ p < 0.3482 | 4001 |
| Rojo (alerta) | `colapso` | p ≥ 0.3482 | 14329 |

El umbral exacto del entrenamiento es 0.3481829215022871; la API usa el valor redondeado de `metadata.json` (0.3482).

### 4.5 Partición temporal

| Partición | Desde | Hasta | Filas | Días | Tramos | Colapsos | Tasa de colapso |
|---|---|---|---|---|---|---|---|
| train | 2019-09-01 06:00:00 | 2023-12-26 06:00:00 | 423483 | 1454 | 22 | 30885 | 0.07293090867874272 |
| valid | 2024-01-02 17:00:00 | 2024-12-31 19:00:00 | 84172 | 296 | 22 | 9415 | 0.11185429834149123 |
| test | 2025-01-01 06:00:00 | 2025-12-31 19:00:00 | 111484 | 365 | 22 | 13312 | 0.11940726920454953 |
| drift | 2026-01-01 06:00:00 | 2026-09-03 16:00:00 | 70606 | 238 | 22 | 9842 | 0.13939325269807099 |

- Reglas de corte: 2019-09-01 ≤ train < 2024-01-01 ≤ valid < 2025-01-01 ≤ test < 2026-01-01 ≤ drift < 2026-09-04
  (`scripts/reentrenar_con_ars.py`).
- **Drift** es el holdout más reciente (ene-sep 2026). Se reporta, pero no se usa para elegir el modelo. La pandemia
  (2020) queda dentro de train.

### 4.6 Métricas en test

Test va de 2025-01-01 a 2025-12-31: 111484 horas-tramo y 13312 colapsos reales. De esos colapsos,
3916 ocurrieron en vías que no estaban colapsadas en t. Las cifras se recalcularon cargando los modelos
guardados y coinciden con `GET /valor`.

| Método | Alertas | Aciertos (TP) | Falsas alarmas (FP) | Colapsos no avisados (FN) | Recall | Precisión | Colapsos sin aviso anticipados |
|---|---|---|---|---|---|---|---|
| **LightGBM (modelo final), umbral 0.3482** | 14329 | 10575 | 3754 | 2737 | 0.7943960336538461 | 0.7380138181310629 | 1475 de 3916 |
| Línea base `regla_umbral` (sin entrenamiento), umbral 0.5569908546788909 | 14385 | 9287 | 5098 | 4025 | 0.6976412259615384 | 0.6456030587417448 | 932 de 3916 |
| Regla reactiva («si está colapsada ahora, seguirá colapsada») | 13341 | 9396 | 3945 | 3916 | 0.7058293269230769 | 0.7042950303575444 | 0 de 3916 |

- **Otras métricas del modelo final en test.** PR-AUC 0.8408231374302512; ROC-AUC 0.9740844859322892;
  F1 0.7651676856843096; Brier 0.04072874673410255; 10.284931506849315 falsas alarmas por día
  en toda la red (365 días).
- **Velocidad (MLP) en test.** MAE 1.5030936090797764 km/h, RMSE 2.105687605173877, WAPE 0.059245229449224474. La línea
  base `perfil_historico` da MAE 4.469135368038664. El MAE
  recalculado con el modelo guardado (prediciendo al menos 1 km/h, como la API) es 1.5030936090797764.

### 4.7 Importancia de variables (top 10)

**Modelo de colapso.** LightGBM, artefacto `importancias/_imp_colapso_lightgbm.csv` del run en MLflow:

```csv
feature,importancia
perfil_velocidad,0.12458333333333334
ratio_vel,0.11791666666666667
vel_referencia_kmh,0.10583333333333333
desvio_perfil,0.085
velocidad_kmh,0.042916666666666665
eod_share_privado_hora,0.042708333333333334
ratio_vel_lag1,0.041666666666666664
hora_sin,0.03854166666666667
velocidad_delta1,0.033125
longitud_km,0.030416666666666668
```

**Modelo de velocidad.** La red neuronal MLP no tiene una importancia nativa y no se calculó una por permutación.

**Importancia sumada por grupo de fuente, modelo de colapso** (normalizada a suma 1):

```csv
grupo,n_variables,importancia_colapso_lgbm
Velocidad ARS - lecturas,12,0.365625
Velocidad ARS - catálogo y perfil,5,0.34958333333333336
Calendario,9,0.125
Ubicación (SIMM),2,0.03145833333333333
Clima,2,0.009583333333333334
EOD 2025,5,0.11875000000000001
```

---

## Qué no se pudo calcular o hay que tener en cuenta

- **Periodo de la EOD 2025:** no disponible. El JSON del visor trae agregados de un día hábil típico de 2025,
  sin fechas por registro. Solo se sabe la fecha de descarga (2026-10-23).
- **Columnas de la EOD:** no aplica. Es un JSON de 43 indicadores con estructuras distintas, no
  una tabla.
- **Una nota del código no cuadra con los datos.** El docstring de `fuentes.leer_velocidad_gt` dice que las
  lecturas cada 30 min empiezan en 2020, pero los datos tienen lecturas a las :30 desde 2017-02-01 06:30.
- **Duplicados de aforos.** El código no elimina las 65 filas duplicadas exactas de
  aforos. Solo afectan al EDA, no al modelo.
- **Recall del modelo.** Con GT ningún modelo de colapso alcanzó el recall mínimo de 0.70 en validación; con ARS
  lo alcanzan los tres candidatos entrenados.
