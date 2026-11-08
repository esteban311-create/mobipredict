# Reporte EDA — MobiPredict (datos reales)

Generado por `src/mobipredict/eda.py`. Figuras en `eda/figures/`. Fuentes en `docs/fuentes_de_datos.md`.

## Cifras clave

| Indicador | Valor | Fuente |
| --- | --- | --- |
| Viajes en un día hábil | 6.490.299 | EOD 2025 (API AMVA) |
| Personas que no viajan | 31.59 % | EOD 2025 |
| Tiempo promedio de viaje | 39.3 min | EOD 2025 |
| Motos / autos por 1.000 habitantes | 120.5 / 67.1 | EOD 2025 |
| Variación tenencia de motos 2017-2025 | +48 % | EOD 2025, publicado por El Colombiano |
| Variación participación TP 2017-2025 | -14 % | EOD 2025, publicado por El Colombiano |
| Muertes viales Medellín 2025 | 276 | Observatorio de Movilidad |
| Lecturas de velocidad (tramo-hora) | 414.439 en 22 tramos, 1340 días | MEData / SIMM |
| Horas en colapso (laborable, pre-pandemia) | 13.0 % | MEData / SIMM |
| Incidentes viales 2008-ago 2025 | 702.540 (2.762 fatales) | Mendeley Data |
| Motos en los aforos | 39.7 % de los vehículos | MEData aforos |

## Hallazgos

1. **Congestión crónica.** Se repite a diario en las horas pico; Avenida Oriental (SN) es el tramo más congestionado. El perfil histórico por tramo y hora es una línea base fuerte y una feature clave.
2. **Demanda.** La EOD 2025 registra 6.490.299 viajes en un día hábil, con pico de inicio a las 6 h. La distribución horaria oficial entra al modelo como prior de demanda.
3. **Densidad.** Medellín - La Candelaria es la macrozona que más viajes atrae. Cada tramo hereda los viajes generados y atraídos de su macrozona como feature espacial.
4. **Motos.** Hay 120.5 motos por cada 1.000 habitantes, casi el doble que autos. En los aforos son el 39.7 % de los vehículos.
5. **Lluvia.** Con más de 3 mm/h el colapso en hora pico es más frecuente; la lluvia actual y la de las últimas 3 horas entran como features.
6. **Pandemia.** Desde el 20-mar-2020 la congestión se desplomó. Ese periodo se aparta del entrenamiento y se usa como prueba de estrés de drift.
7. **Siniestralidad.** 702.540 incidentes reportados entre 2008 y agosto de 2025; la hora con más incidentes es las 17 h. El cierre oficial de 2025 fue de 276 muertes (162 motociclistas y 100 peatones; -11,8 % frente a 2024).

## Horas en colapso por tramo

| Tramo | % horas |
| --- | --- |
| Avenida Ferrocarril (SN) | 33.19 |
| Avenida Oriental (SN) | 28.52 |
| Avenida Oriental (NS) | 28.20 |
| Avenida Ferrocarril (NS) | 26.42 |
| Avenida El Poblado (NS) | 21.03 |
| Avenida El Poblado (SN) | 19.02 |
| Autopista Sur (NS) | 16.64 |
| Avenida Regional (SN) | 16.16 |
| Calle 30 (EW) | 15.26 |
| Avenida Guayabal (SN) | 14.05 |
| Autopista Norte (SN) | 14.03 |
| Avenida 33 (EW) | 11.42 |
| Calle 30 (WE) | 8.71 |
| Avenida San Juan (EW) | 6.45 |
| Avenida 80 (SN) | 6.27 |
| Avenida Guayabal (NS) | 5.40 |
| Autopista Norte (NS) | 4.20 |
| Avenida 33 (WE) | 3.98 |
| Avenida Las Palmas (NS) | 1.95 |
| Avenida Las Palmas (SN) | 1.86 |
| Avenida 80 (NS) | 1.77 |
| Avenida San Juan (WE) | 1.51 |

## Calidad de la serie de sensores

Cobertura = lecturas / (días con datos × 15 horas). Detalle en `calidad_sensores_por_tramo.csv`.

Cobertura media: 93.7 %. Las lecturas solo existen de 6:00 a 20:00; los rezagos no cruzan la noche y las horas faltantes no se imputan.

## Limitaciones

- La serie de velocidad abierta llega a diciembre de 2020; la EOD es de 2025. Se asume que la forma horaria de la demanda y la jerarquía de macrozonas son estables; antes de operar hay que reentrenar con el feed actual del SIMM.
- Las velocidades provienen de tiempos de viaje de Google Traffic agregados por la Alcaldía, no de espiras.
- La base de siniestros cuenta incidentes (un incidente puede tener varias víctimas); el cierre oficial cuenta personas fallecidas.