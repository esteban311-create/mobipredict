const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  BorderStyle, LevelFormat } = require("docx");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "Guion_Exposicion_Pipeline_MobiPredict.docx");

const border = { style: BorderStyle.SINGLE, size: 6, color: "2FD8C5", space: 8 };

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 160, before: opts.before ?? 0, line: 276 },
    alignment: opts.align,
    ...opts.para,
    children: [
      new TextRun({
        text,
        font: "Calibri",
        size: opts.size ?? 22, // 11pt
        bold: opts.bold,
        italics: opts.italics,
        color: opts.color ?? "1A2430",
      }),
    ],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    border: { bottom: border },
    children: [new TextRun({ text, font: "Calibri", size: 32, bold: true, color: "0A3D38" })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, font: "Calibri", size: 26, bold: true, color: "028090" })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, font: "Calibri", size: 24, bold: true, color: "1A2430" })],
  });
}

function quote(text) {
  return new Paragraph({
    spacing: { after: 200, before: 120 },
    indent: { left: 360 },
    children: [
      new TextRun({
        text: `“${text}”`,
        font: "Calibri",
        size: 22,
        italics: true,
        color: "3A5568",
      }),
    ],
  });
}

function bullet(text, ref = "bullets") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80, line: 276 },
    children: [new TextRun({ text, font: "Calibri", size: 22, color: "1A2430" })],
  });
}

async function main() {
  const doc = new Document({
    styles: {
      default: {
        document: {
          styles: [
            {
              id: "Normal",
              run: { font: "Calibri", size: 22 },
              paragraph: { spacing: { after: 120, line: 276 } },
            },
          ],
        },
        heading1: {
          run: { font: "Calibri", size: 32, bold: true, color: "0A3D38" },
          paragraph: { spacing: { before: 360, after: 180 }, keepNext: true },
        },
        heading2: {
          run: { font: "Calibri", size: 26, bold: true, color: "028090" },
          paragraph: { spacing: { before: 280, after: 120 }, keepNext: true },
        },
        heading3: {
          run: { font: "Calibri", size: 24, bold: true, color: "1A2430" },
          paragraph: { spacing: { before: 200, after: 100 }, keepNext: true },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [{
            level: 0, format: LevelFormat.BULLET, text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
        {
          reference: "steps",
          levels: [{
            level: 0, format: LevelFormat.DECIMAL, text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
        {
          reference: "speak",
          levels: [{
            level: 0, format: LevelFormat.BULLET, text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1008, right: 1008, bottom: 1008, left: 1008 }, // 0.7"
        },
      },
      children: [
        p("MobiPredict — Proyecto final", { size: 20, color: "6D7F91", after: 40 }),
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({
            text: "Guion de exposición: el pipeline, los modelos y cómo se usa",
            font: "Calibri", size: 36, bold: true, color: "0A0F15",
          })],
        }),
        p("Versión para presentar en voz alta · lenguaje sencillo · duración sugerida del bloque técnico: 6 a 8 minutos", {
          size: 20, italics: true, color: "5A6B7C", after: 280,
        }),

        h1("1. Cómo abrir el bloque (30 segundos)"),
        quote("Antes de abrir la aplicación, quiero contarles cómo se cocina MobiPredict. No es magia: es una receta automática de seis pasos. Entramos datos reales de Medellín y salen dos modelos listos para avisar qué vía se va a trancar en la próxima hora."),
        p("Luego diga la analogía:"),
        quote("Piénsenlo como una cocina industrial: traemos ingredientes, los preparamos, probamos, cocinamos varias versiones del plato y dejamos en la carta solo al ganador. Esa cocina es el pipeline."),

        h1("2. Qué pregunta responde el sistema"),
        p("MobiPredict no pregunta “¿hay trancón ahora?”. Eso ya lo hacen Waze y Google Maps."),
        p("MobiPredict pregunta: “¿esta vía va a colapsar dentro de una hora?”."),
        p("Colapso, en palabras simples: la vía circula a menos de la mitad de su velocidad normal. Si normalmente va a 40 km/h, colapsa por debajo de 20 km/h."),
        p("Para responder eso, el sistema aprende de dos tareas a la vez:"),
        bullet("Tarea 1 — Velocidad: estimar a cuántos km/h irá el tramo dentro de una hora."),
        bullet("Tarea 2 — Colapso: estimar la probabilidad de que ese tramo colapse dentro de una hora, y disparar una alerta si pasa un umbral."),

        h1("3. Inputs y outputs (qué entra y qué sale)"),
        h2("Qué entra (inputs)"),
        p("Los “ingredientes” del modelo, explicados sin jerga:"),
        bullet("Velocidades de las cámaras ARS/CCTV del Observatorio de Movilidad (serie horaria por vía, 2019 a 2026)."),
        bullet("Lluvia de Open-Meteo (cuánto llovió y cuánto puede llover)."),
        bullet("Calendario: hora del día, día de la semana, si es festivo en Colombia."),
        bullet("Contexto de movilidad de la ciudad (por ejemplo patrones de la Encuesta Origen-Destino y aforos, usados en el análisis y en features)."),
        bullet("En modo En vivo / Navegar: lecturas recientes de TomTom, HERE y Google (tráfico de ahora), más lluvia actual."),
        p("Importante para el jurado: el modelo no “mira el futuro”. Mira las últimas horas y proyecta la siguiente."),

        h2("Qué sale (outputs)"),
        bullet("Velocidad predicha a 1 hora (km/h) y tiempo de viaje estimado del tramo."),
        bullet("Probabilidad de colapso a 1 hora (de 0 a 100 %)."),
        bullet("Nivel semáforo: normal, precaución o alerta."),
        bullet("Aviso temprano: hoy la vía aún fluye, pero en una hora se espera colapso. Eso es el valor frente al monitoreo solo en tiempo real."),
        bullet("En la app: ranking de vías, consejo de viaje, y rutas de Google pintadas con ese riesgo."),

        h1("4. El pipeline en seis pasos (guion oral)"),
        p("Señale la diapositiva del pipeline mientras habla. Un paso = unas 25–40 segundos."),

        h2("Paso 1 — Adquisición (“ir al mercado”)"),
        quote("Primero bajamos los datos: cámaras, clima, festivos, encuesta. Cada archivo se guarda con una huella digital para saber que no se alteró. Si la descarga falla, el sistema reintenta."),
        p("Herramienta detrás (solo si preguntan): Prefect orquesta este paso con un reintento."),

        h2("Paso 2 — Estandarización (“lavar y cortar”)"),
        quote("Los datos llegan en formatos distintos. Aquí los unificamos: una lectura por vía y por hora, con lluvia y si el día es festivo. Así todo habla el mismo idioma."),

        h2("Paso 3 — EDA (“probar la salsa”)"),
        quote("Antes de entrenar, miramos el problema con gráficos: ¿dónde hay más trancón? ¿a qué hora? ¿la lluvia empeora? Todavía no predecimos: entendemos."),

        h2("Paso 4 — Features (“armar la receta”)"),
        quote("Convertimos la historia en señales útiles: qué tan lento iba hace una, dos o tres horas, si llueve, si es hora pico, etc. Luego partimos el tiempo en cajas para no hacernos trampa."),
        p("Las cajas de tiempo (dígalo así):"),
        bullet("Entrenamiento: aprende patrones (hasta inicios de 2024)."),
        bullet("Validación: ajustamos y elegimos (2024)."),
        bullet("Prueba: medimos de verdad (todo 2025)."),
        bullet("Holdout 2026: chequeo extra; no se usa para elegir al ganador. No es pandemia: es el periodo reciente."),

        h2("Paso 5 — Entrenamiento (“varios cocineros, mismo plato”)"),
        quote("Entrenamos varios candidatos para velocidad y varios para colapso. Cada intento queda anotado en un cuaderno de laboratorio digital llamado MLflow: parámetros, errores y aciertos."),

        h2("Paso 6 — Selección (“el plato del día”)"),
        quote("Con reglas fijadas de antemano elegimos un campeón por tarea, lo registramos como champion y la API lo sirve a la aplicación. La app es la vitrina; el pipeline es la fábrica."),

        h1("5. Qué modelos se entrenaron"),
        h2("Para predecir velocidad"),
        bullet("Perfil histórico (línea base): “mañana a esta hora suele ir a X km/h”."),
        bullet("Ridge: modelo lineal simple."),
        bullet("Random Forest: muchos árboles de decisión votando."),
        bullet("LightGBM: árboles potentes y rápidos."),
        bullet("MLP (red neuronal): capas de neuronas artificiales que combinan señales no lineales."),

        h2("Para predecir colapso (sí/no + probabilidad)"),
        bullet("Regla umbral (línea base): “si ya va lento, seguirá lento”."),
        bullet("Regresión logística: probabilidad con una fórmula lineal."),
        bullet("Random Forest."),
        bullet("LightGBM."),

        h1("6. Quién ganó, de qué se trata y por qué"),

        h2("Ganador de velocidad: MLP (red neuronal)"),
        p("De qué se trata, en criollo: una red neuronal tipo MLP es como varias capas de “filtros” que combinan las señales de entrada (velocidad reciente, lluvia, hora…) hasta estimar un número: la velocidad de dentro de una hora. En nuestro caso usó capas internas de 128 y 64 neuronas."),
        p("Por qué ganó: en validación tuvo el menor error tipico de velocidad (RMSE más bajo: unos 2,10 km/h). Frente al perfil histórico, reduce el error relativo (WAPE) cerca de un 68 %. Esa fue la regla: elegir con validación, no mirando el examen final."),
        p("Números de prueba 2025 (para citarlos con calma):"),
        bullet("MAE ≈ 1,50 km/h (error medio absoluto)."),
        bullet("RMSE ≈ 2,11 km/h."),
        bullet("WAPE ≈ 5,9 %."),
        p("Nota honesta si preguntan: en prueba, LightGBM quedó un poquito mejor en RMSE. No lo cambiamos, porque eso sería usar el examen para elegir al alumno. Ese empate se vigila con la idea champion / challenger."),

        h2("Ganador de colapso: LightGBM"),
        p("De qué se trata, en criollo: LightGBM es un modelo de árboles que va corrigiendo errores en cadena. Es muy usado cuando hay tablas con muchas filas y señales mezcladas (hora, lluvia, velocidad…). Entrega una probabilidad de colapso; si supera el umbral 0,348, dispara alerta."),
        p("Por qué ganó: en validación tuvo el mejor equilibrio medido con PR-AUC (área bajo la curva precisión-recall), pensado para problemas donde el colapso no es lo más frecuente. Priorizamos no perder alertas (recall alto), porque una alerta falsa se descarta en segundos y un colapso no visto cuesta más."),
        p("Números de prueba 2025:"),
        bullet("PR-AUC ≈ 0,841."),
        bullet("Recall ≈ 79 % (detecta cerca de 4 de cada 5 colapsos)."),
        bullet("Precisión ≈ 74 % (cuando alerta, suele acertar)."),
        bullet("Frente a la regla reactiva: recall ~71 % y precisión ~70 %."),

        h1("7. Valor en lenguaje humano (cifras del periodo de prueba)"),
        quote("No solo acierta más: anticipa trancónes que el monitoreo actual no puede ver, porque empiezan en una vía que una hora antes todavía fluía."),
        bullet("Periodo de prueba: 365 días de 2025 que el modelo no usó para aprender."),
        bullet("Cerca de 29 % de los colapsos empiezan “sin aviso” (la vía iba bien una hora antes)."),
        bullet("De esos, MobiPredict anticipó 1.475 con una hora de ventaja (el monitoreo solo en tiempo real anticipa 0)."),
        bullet("Error de tiempo de viaje: 0,63 minutos vs 1,77 del promedio histórico (~64 % menos error)."),

        h1("8. De la fábrica a la app (cómo se conecta)"),
        bullet("El pipeline deja los modelos champion y un archivo de metadata."),
        bullet("La API (FastAPI) los carga y responde predicciones."),
        bullet("El frontend muestra Centro, Mi viaje, Evidencia (demo con días reales) y En vivo / Navegar (hoy, con 4 horas de historia por vía)."),
        bullet("MLOps en una frase: orquestamos (Prefect), registramos experimentos (MLflow), versionamos al campeón y podemos recargar sin apagar el servicio."),

        h1("9. Cierre del bloque técnico (20 segundos)"),
        quote("Resumen: el pipeline es la fábrica, los campeones son MLP y LightGBM, los inputs son la ciudad medida hora a hora, y el output es una hora de ventaja. Ahora sí, pasemos a la aplicación para verlo en el mapa."),

        h1("10. Preguntas frecuentes del jurado (respuestas cortas)"),
        h3("¿Por qué no usaron solo LightGBM para todo?"),
        p("Porque cada tarea tiene su métrica. Para velocidad ganó la red neuronal en la regla de validación; para colapso ganó LightGBM. Forzar el mismo modelo no es un objetivo."),

        h3("¿No se sobreentrenaron mirando el test?"),
        p("No. Hiperparámetros y elección del ganador se fijan en validación. El test y el holdout 2026 solo se reportan."),

        h3("¿Sirve en 2026 si entrenaron con historia pasada?"),
        p("Reentrenamos con cámaras ARS hasta 2026 y dejamos 2026 como holdout de estrés. Además, En vivo usa tráfico actual de proveedores, con la salvedad de que es una aproximación calibrada."),

        h3("¿Cuántas vías cubre?"),
        p("22 tramos de vías principales. No es toda la malla; es el corredor donde hay sensores consistentes."),

        h3("¿Qué es MLOps aquí?"),
        p("Automatizar el camino de datos → modelo → servicio, con registro, versión champion y posibilidad de volver a entrenar y recargar."),

        h1("11. Cheatsheet de 30 segundos (por si se corta el tiempo)"),
        bullet("Problema: hoy se reacciona cuando la vía ya está en rojo."),
        bullet("Solución: predecir colapso a +1 h."),
        bullet("Datos: cámaras ARS 2019–2026 + clima + calendario."),
        bullet("Fábrica: pipeline Prefect de 6 pasos + MLflow."),
        bullet("Campeones: MLP (velocidad) y LightGBM (colapso)."),
        bullet("Salida: probabilidad, alerta y aviso temprano en la app."),

        p("Documento de apoyo a la exposición · MobiPredict · lenguaje sencillo", {
          size: 18, color: "8A9AAB", before: 400, after: 0, italics: true,
        }),
      ],
    }],
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(OUT, buf);
  console.log("Wrote", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
