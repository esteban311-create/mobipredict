/**
 * MobiPredict — deck para exposición (dummies + técnica MLOps / ARS).
 * Genera: docs/MobiPredict_para_dummies.pptx
 */
const pptxgen = require("pptxgenjs");
const path = require("path");

const OUT = path.join(__dirname, "MobiPredict_para_dummies.pptx");

const C = {
  bg: "0A0F15",
  panel: "0F1822",
  panel2: "132030",
  border: "223042",
  text: "E6EDF3",
  muted: "9AABBB",
  dim: "6D7F91",
  valor: "2FD8C5",
  valorDark: "0A3D38",
  warn: "F4B740",
  danger: "FF4F62",
  white: "FFFFFF",
  rain: "6FB4FF",
};

function label(slide, text, x, y, w) {
  slide.addText(text, {
    x, y, w, h: 0.28,
    fontFace: "Calibri", fontSize: 11, bold: true,
    color: C.valor, margin: 0, isTextBox: true,
    charSpacing: 1.2,
  });
}

function title(slide, text, x = 0.5, y = 0.28, w = 9) {
  slide.addText(text, {
    x, y, w, h: 0.55,
    fontFace: "Calibri", fontSize: 28, bold: true,
    color: C.white, margin: 0, isTextBox: true,
  });
}

function body(slide, items, x, y, w, h, size = 14) {
  slide.addText(
    items.map((t, i) => ({
      text: t,
      options: { bullet: true, breakLine: i < items.length - 1, paraSpaceAfter: 6 },
    })),
    {
      x, y, w, h,
      fontFace: "Calibri", fontSize: size, color: C.muted,
      margin: 0, isTextBox: true, valign: "top",
    }
  );
}

async function build() {
  const pres = new pptxgen();
  const ST = pres.ShapeType;
  pres.defineLayout({ name: "WIDE16x9", width: 10, height: 5.625 });
  pres.layout = "WIDE16x9";
  pres.author = "MobiPredict";
  pres.title = "MobiPredict — Exposición final";
  pres.subject = "Anticipación de colapso vial · ARS 2019-2026 · MLOps";

  function card(slide, x, y, w, h, opts = {}) {
    slide.addShape(ST.roundRect, {
      x, y, w, h,
      fill: { color: opts.fill || C.panel },
      rectRadius: 0.08,
      line: { color: opts.line || C.border, width: 1 },
    });
  }

  // ── 1. Portada ──
  {
    const s = pres.addSlide();
    s.addShape(ST.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bg } });
    s.addShape(ST.ellipse, {
      x: 6.2, y: -1.2, w: 5.5, h: 5.5,
      fill: { color: "10283A" }, line: { color: "10283A" },
    });
    label(s, "PROYECTO FINAL · CIENCIA DE DATOS / ML", 0.55, 1.35, 8);
    s.addText("MobiPredict", {
      x: 0.55, y: 1.7, w: 8, h: 0.85,
      fontFace: "Calibri", fontSize: 48, bold: true, color: C.white, margin: 0, isTextBox: true,
    });
    s.addText("Anticipa con 1 hora de ventaja qué vía de Medellín va a colapsar", {
      x: 0.55, y: 2.55, w: 7.5, h: 0.7,
      fontFace: "Calibri", fontSize: 18, color: C.muted, margin: 0, isTextBox: true,
    });
    s.addText("Cámaras ARS/CCTV 2019–2026  ·  MLP + LightGBM  ·  Prefect · MLflow · FastAPI", {
      x: 0.55, y: 4.7, w: 9, h: 0.35,
      fontFace: "Calibri", fontSize: 13, color: C.dim, margin: 0, isTextBox: true,
    });
  }

  // ── 2. El problema ──
  {
    const s = pres.addSlide();
    s.addShape(ST.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bg } });
    label(s, "EL PROBLEMA", 0.5, 0.28, 4);
    title(s, "Hoy se reacciona cuando la vía ya está en rojo");
    card(s, 0.5, 1.15, 2.9, 2.2);
    s.addText("6,49 M", { x: 0.7, y: 1.4, w: 2.5, h: 0.7, fontFace: "Calibri", fontSize: 36, bold: true, color: C.danger, margin: 0, isTextBox: true });
    s.addText("viajes/día hábil en el Valle de Aburrá (EOD 2025)", { x: 0.7, y: 2.15, w: 2.5, h: 0.9, fontFace: "Calibri", fontSize: 13, color: C.muted, margin: 0, isTextBox: true });
    card(s, 3.55, 1.15, 2.9, 2.2);
    s.addText("~1/8", { x: 3.75, y: 1.4, w: 2.5, h: 0.7, fontFace: "Calibri", fontSize: 36, bold: true, color: C.warn, margin: 0, isTextBox: true });
    s.addText("de las horas laborables una vía principal está colapsada", { x: 3.75, y: 2.15, w: 2.5, h: 0.9, fontFace: "Calibri", fontSize: 13, color: C.muted, margin: 0, isTextBox: true });
    card(s, 6.6, 1.15, 2.9, 2.2, { line: C.valor });
    s.addText("0 h", { x: 6.8, y: 1.4, w: 2.5, h: 0.7, fontFace: "Calibri", fontSize: 36, bold: true, color: C.valor, margin: 0, isTextBox: true });
    s.addText("de ventaja con el monitoreo solo en tiempo real", { x: 6.8, y: 2.15, w: 2.5, h: 0.9, fontFace: "Calibri", fontSize: 13, color: C.muted, margin: 0, isTextBox: true });
    body(s, [
      "Colapso = velocidad < 50 % de la velocidad de referencia del tramo (p95).",
      "Muchos colapsos empiezan en una vía que una hora antes circulaba bien: el centro de control no los ve venir.",
    ], 0.5, 3.6, 9, 1.5, 15);
  }

  // ── 3. Propuesta ──
  {
    const s = pres.addSlide();
    s.addShape(ST.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bg } });
    label(s, "PROPUESTA DE VALOR", 0.5, 0.28, 5);
    title(s, "Una hora de ventaja operativa");
    const boxes = [
      ["Predice", "Velocidad y probabilidad de colapso a +1 h por tramo"],
      ["Alerta", "Aviso temprano cuando hoy fluye y en 1 h colapsa"],
      ["Decide", "Centro de control, Mi viaje, Navegar y En vivo"],
    ];
    boxes.forEach((b, i) => {
      const x = 0.5 + i * 3.1;
      card(s, x, 1.2, 2.95, 2.5, { line: i === 1 ? C.valor : C.border });
      s.addText(b[0], { x: x + 0.2, y: 1.45, w: 2.55, h: 0.45, fontFace: "Calibri", fontSize: 22, bold: true, color: C.valor, margin: 0, isTextBox: true });
      s.addText(b[1], { x: x + 0.2, y: 2.1, w: 2.55, h: 1.3, fontFace: "Calibri", fontSize: 15, color: C.muted, margin: 0, isTextBox: true });
    });
    s.addText("No reemplaza a Waze/Maps: anticipa colapso en corredores vigilados para quien opera o se mueve en la ciudad.", {
      x: 0.5, y: 4.05, w: 9, h: 0.7, fontFace: "Calibri", fontSize: 14, color: C.dim, margin: 0, isTextBox: true,
    });
  }

  // ── 4. Datos ARS ──
  {
    const s = pres.addSlide();
    s.addShape(ST.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bg } });
    label(s, "DATOS · REENTRENAMIENTO 2026", 0.5, 0.28, 6);
    title(s, "De sensores GT a cámaras ARS");
    card(s, 0.5, 1.15, 4.4, 3.7);
    s.addText("Antes (GT)", { x: 0.7, y: 1.3, w: 4, h: 0.35, fontFace: "Calibri", fontSize: 14, bold: true, color: C.dim, margin: 0, isTextBox: true });
    body(s, [
      "Serie Velocidad y tiempo de viaje GT (SIMM)",
      "Cobertura hasta ~2020",
      "Campeones: LightGBM + Random Forest",
      "MAE velocidad ~2,35 km/h · recall ~0,62",
    ], 0.7, 1.75, 4, 2.8, 14);
    card(s, 5.1, 1.15, 4.4, 3.7, { line: C.valor, fill: "0C2422" });
    s.addText("Ahora (ARS / CCTV)", { x: 5.3, y: 1.3, w: 4, h: 0.35, fontFace: "Calibri", fontSize: 14, bold: true, color: C.valor, margin: 0, isTextBox: true });
    body(s, [
      "Observatorio de Movilidad — cámaras ARS",
      "Serie horaria 2019-09 → 2026-09 · 22 tramos",
      "~744 mil filas horarias agregadas",
      "Campeones: MLP + LightGBM",
      "MAE 1,50 km/h · recall 0,79 · PR-AUC 0,84",
    ], 5.3, 1.75, 4, 2.8, 14);
  }

  // ── 5. Particiones ──
  {
    const s = pres.addSlide();
    s.addShape(ST.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bg } });
    label(s, "PROTOCOLO TEMPORAL", 0.5, 0.28, 5);
    title(s, "Train → Valid → Test → Holdout 2026");
    const parts = [
      ["Train", "2019-09 → 2024-01", "Ajuste del modelo", "6D7F91"],
      ["Valid", "2024 → 2025", "Hiperparámetros y umbral", "6FB4FF"],
      ["Test", "2025 → 2026", "Métricas reportadas", C.valor],
      ["Holdout", "2026 → 2026-09", "Solo diagnóstico (no elegir)", "A58BFF"],
    ];
    parts.forEach((p, i) => {
      const x = 0.45 + i * 2.4;
      card(s, x, 1.25, 2.25, 2.6);
      s.addShape(ST.rect, { x, y: 1.25, w: 2.25, h: 0.12, fill: { color: p[3] } });
      s.addText(p[0], { x: x + 0.15, y: 1.55, w: 1.95, h: 0.4, fontFace: "Calibri", fontSize: 20, bold: true, color: C.white, margin: 0, isTextBox: true });
      s.addText(p[1], { x: x + 0.15, y: 2.05, w: 1.95, h: 0.55, fontFace: "Calibri", fontSize: 13, color: C.valor, margin: 0, isTextBox: true });
      s.addText(p[2], { x: x + 0.15, y: 2.7, w: 1.95, h: 0.8, fontFace: "Calibri", fontSize: 13, color: C.muted, margin: 0, isTextBox: true });
    });
    s.addText("Importante: el holdout 2026 NO es pandemia. La pandemia era el drift del dataset GT antiguo.", {
      x: 0.5, y: 4.2, w: 9, h: 0.55, fontFace: "Calibri", fontSize: 14, color: C.warn, margin: 0, isTextBox: true,
    });
  }

  // ── 6. Pipeline ──
  {
    const s = pres.addSlide();
    s.addShape(ST.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bg } });
    label(s, "PIPELINE · PREFECT", 0.5, 0.28, 5);
    title(s, "Seis tareas orquestadas de punta a punta");
    const steps = [
      ["1", "Adquisición", "Descarga + SHA-256\n1 reintento"],
      ["2", "Estandarización", "Serie horaria\nclima · festivos"],
      ["3", "EDA", "9 figuras +\nreporte"],
      ["4", "Features", "35 variables\nsplit temporal"],
      ["5", "Entrenamiento", "Optuna / RSearch\n+ MLflow"],
      ["6", "Selección", "Champion +\nmetadata"],
    ];
    steps.forEach((st, i) => {
      const x = 0.35 + i * 1.6;
      card(s, x, 1.25, 1.5, 2.85);
      s.addText(st[0], { x, y: 1.4, w: 1.5, h: 0.45, fontFace: "Calibri", fontSize: 22, bold: true, color: C.valor, align: "center", margin: 0, isTextBox: true });
      s.addText(st[1], { x: x + 0.08, y: 1.95, w: 1.34, h: 0.7, fontFace: "Calibri", fontSize: 13, bold: true, color: C.white, align: "center", margin: 0, isTextBox: true });
      s.addText(st[2], { x: x + 0.08, y: 2.75, w: 1.34, h: 1.1, fontFace: "Calibri", fontSize: 11, color: C.muted, align: "center", margin: 0, isTextBox: true });
      if (i < 5) {
        s.addText("→", { x: x + 1.35, y: 2.3, w: 0.35, h: 0.35, fontFace: "Calibri", fontSize: 16, color: C.dim, margin: 0, isTextBox: true });
      }
    });
    s.addText("Entrada: python run_pipeline.py  ·  Flow: mobipredict-pipeline  ·  Luego API + frontend", {
      x: 0.5, y: 4.4, w: 9, h: 0.4, fontFace: "Calibri", fontSize: 13, color: C.dim, margin: 0, isTextBox: true,
    });
  }

  // ── 7. Candidatos ──
  {
    const s = pres.addSlide();
    s.addShape(ST.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bg } });
    label(s, "MODELOS ENTRENADOS", 0.5, 0.28, 5);
    title(s, "Dos tareas, varios candidatos, una línea base");
    card(s, 0.5, 1.15, 4.4, 3.8);
    s.addText("Velocidad a 1 hora", { x: 0.7, y: 1.35, w: 4, h: 0.35, fontFace: "Calibri", fontSize: 16, bold: true, color: C.valor, margin: 0, isTextBox: true });
    body(s, [
      "Perfil histórico (línea base)",
      "Ridge (lineal)",
      "Random Forest",
      "LightGBM",
      "Red neuronal MLP  ← ganador",
    ], 0.7, 1.85, 4, 2.8, 15);
    card(s, 5.1, 1.15, 4.4, 3.8);
    s.addText("Colapso a 1 hora", { x: 5.3, y: 1.35, w: 4, h: 0.35, fontFace: "Calibri", fontSize: 16, bold: true, color: C.valor, margin: 0, isTextBox: true });
    body(s, [
      "Regla umbral (línea base)",
      "Regresión logística",
      "Random Forest",
      "LightGBM  ← ganador",
    ], 5.3, 1.85, 4, 2.8, 15);
  }

  // ── 8. Ganadores ──
  {
    const s = pres.addSlide();
    s.addShape(ST.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bg } });
    label(s, "CAMPEONES · TEST 2025", 0.5, 0.28, 5);
    title(s, "Quién ganó y con qué métricas");
    card(s, 0.5, 1.15, 4.4, 3.7, { line: C.valor });
    s.addText("MLP", { x: 0.7, y: 1.35, w: 4, h: 0.4, fontFace: "Calibri", fontSize: 28, bold: true, color: C.valor, margin: 0, isTextBox: true });
    s.addText("Velocidad · capas [128, 64]", { x: 0.7, y: 1.8, w: 4, h: 0.3, fontFace: "Calibri", fontSize: 13, color: C.dim, margin: 0, isTextBox: true });
    const velM = [
      ["MAE", "1,50 km/h"],
      ["RMSE", "2,11 km/h"],
      ["WAPE", "5,9 %"],
      ["vs perfil", "−67 % WAPE"],
    ];
    velM.forEach((m, i) => {
      const y = 2.25 + i * 0.5;
      s.addText(m[0], { x: 0.7, y, w: 1.6, h: 0.4, fontFace: "Calibri", fontSize: 14, color: C.muted, margin: 0, isTextBox: true });
      s.addText(m[1], { x: 2.4, y, w: 2.2, h: 0.4, fontFace: "Calibri", fontSize: 16, bold: true, color: C.white, margin: 0, isTextBox: true });
    });
    card(s, 5.1, 1.15, 4.4, 3.7, { line: C.valor });
    s.addText("LightGBM", { x: 5.3, y: 1.35, w: 4, h: 0.4, fontFace: "Calibri", fontSize: 28, bold: true, color: C.valor, margin: 0, isTextBox: true });
    s.addText("Colapso · umbral 0,348", { x: 5.3, y: 1.8, w: 4, h: 0.3, fontFace: "Calibri", fontSize: 13, color: C.dim, margin: 0, isTextBox: true });
    const colM = [
      ["PR-AUC", "0,841"],
      ["Recall", "79 %"],
      ["Precisión", "74 %"],
      ["Prioridad", "No perder alertas"],
    ];
    colM.forEach((m, i) => {
      const y = 2.25 + i * 0.5;
      s.addText(m[0], { x: 5.3, y, w: 1.8, h: 0.4, fontFace: "Calibri", fontSize: 14, color: C.muted, margin: 0, isTextBox: true });
      s.addText(m[1], { x: 7.2, y, w: 2.0, h: 0.4, fontFace: "Calibri", fontSize: 16, bold: true, color: C.white, margin: 0, isTextBox: true });
    });
  }

  // ── 9. Selección ──
  {
    const s = pres.addSlide();
    s.addShape(ST.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bg } });
    label(s, "REGLAS DE DECISIÓN", 0.5, 0.28, 5);
    title(s, "Se elige en validación; el test solo se reporta");
    body(s, [
      "Hiperparámetros: Optuna (LightGBM) y RandomizedSearchCV (resto) con TimeSeriesSplit (3 cortes).",
      "Velocidad: menor RMSE en validación (con reglas de empate / latencia cuando aplica).",
      "Colapso: mayor PR-AUC en validación; umbral de alerta fijado en validación (prioriza recall).",
      "En test, LightGBM velocidad quedó levemente mejor en RMSE: no se cambia al ganador (evitar filtrar test).",
      "Ese gap se vigila con esquema champion / challenger en el Model Registry.",
    ], 0.5, 1.2, 9, 3.5, 15);
  }

  // ── 10. MLOps ──
  {
    const s = pres.addSlide();
    s.addShape(ST.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bg } });
    label(s, "MLOPS Y AUTOMATIZACIÓN", 0.5, 0.28, 6);
    title(s, "Stack de operación del ciclo de vida");
    const ops = [
      ["Prefect 3", "Orquesta el flow; reintentos en adquisición; logs por tarea"],
      ["MLflow", "Experimentos, métricas valid/test/holdout, artifacts, Model Registry"],
      ["Alias champion", "mobipredict-velocidad y mobipredict-colapso versionados"],
      ["FastAPI", "Serving + /admin/reload sin apagar el servicio"],
      ["Docker Compose", "trainer · api · mlflow · prefect (perfil orquestación)"],
      ["Tests / CI local", "pytest API y envivo; healthcheck del contenedor"],
      ["Manifest + hash", "Trazabilidad de fuentes (SHA-256) en data/raw"],
      ["Replay + valor", "Evaluación offline sobre días reales nunca vistos"],
    ];
    ops.forEach((o, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 0.5 + col * 4.75;
      const y = 1.15 + row * 0.95;
      card(s, x, y, 4.55, 0.85);
      s.addText(o[0], { x: x + 0.2, y: y + 0.12, w: 4.15, h: 0.28, fontFace: "Calibri", fontSize: 14, bold: true, color: C.valor, margin: 0, isTextBox: true });
      s.addText(o[1], { x: x + 0.2, y: y + 0.42, w: 4.15, h: 0.35, fontFace: "Calibri", fontSize: 12, color: C.muted, margin: 0, isTextBox: true });
    });
  }

  // ── 11. Diagrama I/O ──
  {
    const s = pres.addSlide();
    s.addShape(ST.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bg } });
    label(s, "ARQUITECTURA", 0.5, 0.28, 4);
    title(s, "Entradas → modelo → salidas");
    card(s, 0.4, 1.2, 2.9, 3.6);
    s.addText("ENTRA", { x: 0.55, y: 1.35, w: 2.6, h: 0.3, fontFace: "Calibri", fontSize: 12, bold: true, color: C.dim, margin: 0, isTextBox: true });
    body(s, [
      "ARS/CCTV horaria",
      "Clima Open-Meteo",
      "Festivos CO",
      "EOD / aforos / EDA",
      "En vivo: TomTom·HERE·Google",
    ], 0.55, 1.8, 2.6, 2.7, 13);
    card(s, 3.55, 1.2, 2.9, 3.6, { line: C.valor });
    s.addText("NÚCLEO", { x: 3.7, y: 1.35, w: 2.6, h: 0.3, fontFace: "Calibri", fontSize: 12, bold: true, color: C.valor, margin: 0, isTextBox: true });
    body(s, [
      "Feature store",
      "MLP velocidad",
      "LightGBM colapso",
      "Umbral de alerta",
      "API + replay",
    ], 3.7, 1.8, 2.6, 2.7, 13);
    card(s, 6.7, 1.2, 2.9, 3.6);
    s.addText("SALE", { x: 6.85, y: 1.35, w: 2.6, h: 0.3, fontFace: "Calibri", fontSize: 12, bold: true, color: C.dim, margin: 0, isTextBox: true });
    body(s, [
      "Velocidad +1 h",
      "P(colapso) + nivel",
      "Avisos tempranos",
      "Rutas con riesgo",
      "KPIs de valor",
    ], 6.85, 1.8, 2.6, 2.7, 13);
  }

  // ── 12. Frontend ──
  {
    const s = pres.addSlide();
    s.addShape(ST.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bg } });
    label(s, "PRODUCTO · FRONT", 0.5, 0.28, 4);
    title(s, "Dos modos: demo histórica y ciudad ahora");
    card(s, 0.5, 1.2, 4.4, 3.5);
    s.addText("Demo (día real)", { x: 0.7, y: 1.4, w: 4, h: 0.35, fontFace: "Calibri", fontSize: 16, bold: true, color: C.warn, margin: 0, isTextBox: true });
    body(s, [
      "Centro de control + máquina del tiempo",
      "Mi viaje (¿salgo o espero?)",
      "Evidencia y cifras de valor",
      "Historia (modo presentación)",
    ], 0.7, 1.95, 4, 2.4, 14);
    card(s, 5.1, 1.2, 4.4, 3.5, { line: C.valor });
    s.addText("Hoy (tiempo real)", { x: 5.3, y: 1.4, w: 4, h: 0.35, fontFace: "Calibri", fontSize: 16, bold: true, color: C.valor, margin: 0, isTextBox: true });
    body(s, [
      "En vivo: 4 h de historia por tramo",
      "Navegar: rutas Google + riesgo MobiPredict",
      "Vista Actualización: GT vs ARS",
      "Chip de datos ARS · holdout 2026",
    ], 5.3, 1.95, 4, 2.4, 14);
  }

  // ── 13. Valor ──
  {
    const s = pres.addSlide();
    s.addShape(ST.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bg } });
    label(s, "PRUEBA DE QUE FUNCIONA", 0.5, 0.28, 5);
    title(s, "Periodo de prueba: datos que el modelo no vio");
    body(s, [
      "Se mide cuántos colapsos empiezan sin aviso (vía fluida 1 h antes).",
      "Cuántos de esos anticipa MobiPredict vs monitoreo reactivo (= 0).",
      "Recall / precisión frente a la regla umbral.",
      "Error de tiempo de viaje vs perfil histórico.",
      "La app lo resume en Evidencia (/valor) y al repetir un día (/replay).",
    ], 0.5, 1.2, 9, 3.5, 15);
  }

  // ── 14. Fortalezas / límites ──
  {
    const s = pres.addSlide();
    s.addShape(ST.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bg } });
    label(s, "HONESTIDAD TÉCNICA", 0.5, 0.28, 5);
    title(s, "Qué sostiene el proyecto y qué falta");
    card(s, 0.5, 1.15, 4.4, 3.7, { line: C.valor });
    s.addText("Fortalezas", { x: 0.7, y: 1.35, w: 4, h: 0.35, fontFace: "Calibri", fontSize: 16, bold: true, color: C.valor, margin: 0, isTextBox: true });
    body(s, [
      "Split temporal + holdout reciente",
      "Líneas base y comparación justa",
      "Registry + champion documentado",
      "Demo reproducible sobre días reales",
      "Producto usable (mapa + rutas)",
    ], 0.7, 1.85, 4, 2.7, 14);
    card(s, 5.1, 1.15, 4.4, 3.7, { line: C.danger });
    s.addText("Límites", { x: 5.3, y: 1.35, w: 4, h: 0.35, fontFace: "Calibri", fontSize: 16, bold: true, color: C.danger, margin: 0, isTextBox: true });
    body(s, [
      "22 tramos, no toda la malla",
      "En vivo depende de APIs + DNS",
      "Sin deployment Prefect programado",
      "Reentrenamiento aún manual",
      "Aprox. velocidad live ≠ ARS validado",
    ], 5.3, 1.85, 4, 2.7, 14);
  }

  // ── 15. Cierre ──
  {
    const s = pres.addSlide();
    s.addShape(ST.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bg } });
    s.addShape(ST.ellipse, {
      x: -1.5, y: 2.5, w: 4, h: 4, fill: { color: "10283A" }, line: { color: "10283A" },
    });
    label(s, "CIERRE", 0.55, 1.5, 4);
    s.addText("MobiPredict no espera el rojo:\navisa con una hora de ventaja.", {
      x: 0.55, y: 1.95, w: 8.5, h: 1.2,
      fontFace: "Calibri", fontSize: 28, bold: true, color: C.white, margin: 0, isTextBox: true,
    });
    s.addText("ARS 2019–2026  ·  MLP + LightGBM  ·  Prefect · MLflow · FastAPI · Docker", {
      x: 0.55, y: 3.5, w: 9, h: 0.4,
      fontFace: "Calibri", fontSize: 14, color: C.valor, margin: 0, isTextBox: true,
    });
    s.addText("Proyecto académico — no es un servicio oficial de la Alcaldía", {
      x: 0.55, y: 4.5, w: 9, h: 0.35,
      fontFace: "Calibri", fontSize: 12, color: C.dim, margin: 0, isTextBox: true,
    });
  }

  await pres.writeFile({ fileName: OUT });
  console.log("Wrote", OUT);
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});

