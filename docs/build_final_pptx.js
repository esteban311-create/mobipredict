/**
 * Deck final de exposición — MobiPredict
 * Fuente: "copia - copia" reorganizada, narrativa + técnica ARS, métricas actuales.
 */
const pptxgen = require("pptxgenjs");
const path = require("path");
const fs = require("fs");

const OUT = path.join(__dirname, "MobiPredict_Exposicion_Final.pptx");
const MEDIA = path.join(__dirname, "_pptx_media", "unpacked", "ppt", "media");

const C = {
  bg: "0A0F15",
  panel: "0F1822",
  panelSoft: "132030",
  border: "2A3A4A",
  text: "E6EDF3",
  muted: "9AABBB",
  dim: "6D7F91",
  valor: "2FD8C5",
  warn: "F4B740",
  danger: "FF4F62",
  white: "FFFFFF",
  lightBg: "F4F7FA",
  lightText: "1A2430",
  lightMuted: "5A6B7C",
  lightPanel: "FFFFFF",
  lightBorder: "D5DEE8",
};

async function build() {
  const pres = new pptxgen();
  const ST = pres.ShapeType;
  pres.defineLayout({ name: "WIDE16x9", width: 10, height: 5.625 });
  pres.layout = "WIDE16x9";
  pres.author = "MobiPredict";
  pres.title = "MobiPredict — Exposición final";
  pres.subject = "Anticipación de colapso vial · Medellín · ARS 2019-2026";

  const img = (name) => path.join(MEDIA, name);

  function darkBg(s) {
    s.addShape(ST.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.bg } });
  }
  function lightBg(s) {
    s.addShape(ST.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.lightBg } });
  }
  function card(s, x, y, w, h, opts = {}) {
    s.addShape(ST.roundRect, {
      x, y, w, h,
      fill: { color: opts.fill || C.panel },
      rectRadius: 0.1,
      line: { color: opts.line || C.border, width: 1 },
    });
  }
  function eyebrow(s, t, x, y, w, dark = true) {
    s.addText(t, {
      x, y, w, h: 0.28,
      fontFace: "Calibri", fontSize: 11, bold: true,
      color: dark ? C.valor : "028090",
      margin: 0, isTextBox: true, charSpacing: 1.4,
    });
  }
  function h1(s, t, x, y, w, dark = true) {
    s.addText(t, {
      x, y, w, h: 0.55,
      fontFace: "Calibri", fontSize: 26, bold: true,
      color: dark ? C.white : C.lightText,
      margin: 0, isTextBox: true,
    });
  }
  function bullets(s, items, x, y, w, h, dark = true, size = 14) {
    s.addText(
      items.map((t, i) => ({
        text: t,
        options: { bullet: true, breakLine: i < items.length - 1, paraSpaceAfter: 5 },
      })),
      {
        x, y, w, h,
        fontFace: "Calibri", fontSize: size,
        color: dark ? C.muted : C.lightMuted,
        margin: 0, isTextBox: true, valign: "top",
      }
    );
  }
  function footer(s, n, dark = true) {
    s.addText(String(n), {
      x: 9.3, y: 5.25, w: 0.5, h: 0.25,
      fontFace: "Calibri", fontSize: 11,
      color: dark ? C.dim : "8A9AAB",
      align: "right", margin: 0, isTextBox: true,
    });
  }

  // ═══════════════════════════════════════
  // 1. Portada
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    darkBg(s);
    s.addShape(ST.ellipse, {
      x: 6.8, y: -1.4, w: 5.2, h: 5.2,
      fill: { color: "0E2A33" }, line: { color: "0E2A33" },
    });
    eyebrow(s, "PROYECTO FINAL · EXPOSICIÓN", 0.55, 1.45, 7);
    s.addText("MobiPredict", {
      x: 0.55, y: 1.85, w: 8, h: 0.8,
      fontFace: "Calibri", fontSize: 44, bold: true, color: C.white, margin: 0, isTextBox: true,
    });
    s.addText("El pronóstico del tráfico de Medellín:\navisa qué vía se va a trancar una hora antes", {
      x: 0.55, y: 2.75, w: 7.5, h: 0.85,
      fontFace: "Calibri", fontSize: 18, color: C.muted, margin: 0, isTextBox: true,
    });
    s.addText("Cámaras ARS 2019–2026  ·  MLP + LightGBM  ·  Prefect · MLflow · FastAPI", {
      x: 0.55, y: 4.65, w: 8.5, h: 0.3,
      fontFace: "Calibri", fontSize: 13, color: C.dim, margin: 0, isTextBox: true,
    });
    s.addNotes("Apertura. Una frase: Waze mira el presente; MobiPredict pronostica la próxima hora.");
  }

  // ═══════════════════════════════════════
  // 2. Agenda
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    lightBg(s);
    eyebrow(s, "HOY VAMOS A VER", 0.5, 0.35, 5, false);
    h1(s, "Recorrido de la exposición", 0.5, 0.7, 9, false);
    const items = [
      ["01", "Problema y valor", "Por qué hace falta anticipar"],
      ["02", "Datos y modelos", "ARS, pipeline, campeones, MLOps"],
      ["03", "Producto", "Cómo se usa la aplicación"],
      ["04", "Evidencia", "Métricas, usuarios, límites"],
    ];
    items.forEach((it, i) => {
      const y = 1.45 + i * 0.9;
      card(s, 0.5, y, 9, 0.78, { fill: C.lightPanel, line: C.lightBorder });
      s.addText(it[0], {
        x: 0.7, y: y + 0.18, w: 0.8, h: 0.4,
        fontFace: "Calibri", fontSize: 20, bold: true, color: "028090", margin: 0, isTextBox: true,
      });
      s.addText(it[1], {
        x: 1.7, y: y + 0.12, w: 4, h: 0.3,
        fontFace: "Calibri", fontSize: 16, bold: true, color: C.lightText, margin: 0, isTextBox: true,
      });
      s.addText(it[2], {
        x: 1.7, y: y + 0.42, w: 7, h: 0.28,
        fontFace: "Calibri", fontSize: 13, color: C.lightMuted, margin: 0, isTextBox: true,
      });
    });
    footer(s, 2, false);
  }

  // ═══════════════════════════════════════
  // 3. Idea en 10 segundos
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    darkBg(s);
    eyebrow(s, "LA IDEA EN 10 SEGUNDOS", 0.5, 0.3, 6);
    h1(s, "Presente vs próxima hora");
    card(s, 0.5, 1.2, 4.2, 3.4);
    s.addText("Waze y Google Maps", {
      x: 0.7, y: 1.4, w: 3.8, h: 0.4,
      fontFace: "Calibri", fontSize: 16, bold: true, color: C.dim, margin: 0, isTextBox: true,
    });
    s.addText("¿Hay trancón\nahora?", {
      x: 0.7, y: 2.0, w: 3.8, h: 1.0,
      fontFace: "Calibri", fontSize: 26, bold: true, color: C.white, margin: 0, isTextBox: true,
    });
    s.addText("Como mirar por la ventana\npara saber si está lloviendo.", {
      x: 0.7, y: 3.3, w: 3.8, h: 0.9,
      fontFace: "Calibri", fontSize: 14, color: C.muted, margin: 0, isTextBox: true,
    });
    card(s, 5.3, 1.2, 4.2, 3.4, { line: C.valor, fill: "0C2422" });
    s.addText("MobiPredict", {
      x: 5.5, y: 1.4, w: 3.8, h: 0.4,
      fontFace: "Calibri", fontSize: 16, bold: true, color: C.valor, margin: 0, isTextBox: true,
    });
    s.addText("¿Habrá trancón\nen una hora?", {
      x: 5.5, y: 2.0, w: 3.8, h: 1.0,
      fontFace: "Calibri", fontSize: 26, bold: true, color: C.white, margin: 0, isTextBox: true,
    });
    s.addText("Como el pronóstico del clima:\nte dice si va a llover antes de salir.", {
      x: 5.5, y: 3.3, w: 3.8, h: 0.9,
      fontFace: "Calibri", fontSize: 14, color: C.muted, margin: 0, isTextBox: true,
    });
    footer(s, 3);
    s.addNotes("Si solo recuerdan una cosa: esa hora de ventaja es tiempo para actuar.");
  }

  // ═══════════════════════════════════════
  // 4. Problema
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    lightBg(s);
    eyebrow(s, "EL PROBLEMA", 0.5, 0.3, 4, false);
    h1(s, "Hoy se reacciona cuando la vía ya está en rojo", 0.5, 0.65, 9, false);
    const stats = [
      ["6,49 M", "viajes cada día hábil\nen el Valle de Aburrá"],
      ["1 de 8", "horas laborables una vía\nprincipal está colapsada"],
      ["Tarde", "el centro de control actúa\ncuando ya ve el rojo"],
    ];
    stats.forEach((st, i) => {
      const x = 0.5 + i * 3.15;
      card(s, x, 1.45, 3.0, 2.4, { fill: C.lightPanel, line: C.lightBorder });
      s.addText(st[0], {
        x: x + 0.2, y: 1.7, w: 2.6, h: 0.7,
        fontFace: "Calibri", fontSize: 32, bold: true, color: i === 2 ? "C0392B" : "028090", margin: 0, isTextBox: true,
      });
      s.addText(st[1], {
        x: x + 0.2, y: 2.55, w: 2.6, h: 1.0,
        fontFace: "Calibri", fontSize: 14, color: C.lightMuted, margin: 0, isTextBox: true,
      });
    });
    s.addText("Fuentes: EOD 2025 (AMVA) · Observatorio de Movilidad / SIMM", {
      x: 0.5, y: 4.2, w: 9, h: 0.35,
      fontFace: "Calibri", fontSize: 12, color: "8A9AAB", margin: 0, isTextBox: true,
    });
    footer(s, 4, false);
  }

  // ═══════════════════════════════════════
  // 5. Divider datos
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    darkBg(s);
    s.addText("02", {
      x: 0.55, y: 1.8, w: 2, h: 0.5,
      fontFace: "Calibri", fontSize: 18, bold: true, color: C.valor, margin: 0, isTextBox: true,
    });
    s.addText("Datos, modelos\ny MLOps", {
      x: 0.55, y: 2.3, w: 8, h: 1.3,
      fontFace: "Calibri", fontSize: 36, bold: true, color: C.white, margin: 0, isTextBox: true,
    });
    s.addText("De cámaras ARS al modelo en producción", {
      x: 0.55, y: 3.7, w: 8, h: 0.4,
      fontFace: "Calibri", fontSize: 16, color: C.muted, margin: 0, isTextBox: true,
    });
    footer(s, 5);
  }

  // ═══════════════════════════════════════
  // 6. Datos ARS
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    lightBg(s);
    eyebrow(s, "DATOS · REENTRENAMIENTO 2026", 0.5, 0.28, 6, false);
    h1(s, "De sensores GT a cámaras ARS", 0.5, 0.62, 9, false);
    card(s, 0.5, 1.3, 4.35, 3.5, { fill: C.lightPanel, line: C.lightBorder });
    s.addText("Antes · GT / SIMM", {
      x: 0.7, y: 1.5, w: 4, h: 0.35,
      fontFace: "Calibri", fontSize: 15, bold: true, color: C.lightMuted, margin: 0, isTextBox: true,
    });
    bullets(s, [
      "Serie de velocidad hasta ~2020",
      "Campeones: LightGBM + Random Forest",
      "MAE ~2,35 km/h · recall ~0,62",
      "Holdout histórico = pandemia 2020",
    ], 0.7, 2.05, 3.9, 2.4, false, 14);
    card(s, 5.15, 1.3, 4.35, 3.5, { fill: C.lightPanel, line: "02C39A" });
    s.addText("Ahora · ARS / CCTV", {
      x: 5.35, y: 1.5, w: 4, h: 0.35,
      fontFace: "Calibri", fontSize: 15, bold: true, color: "028090", margin: 0, isTextBox: true,
    });
    bullets(s, [
      "Observatorio de Movilidad · 2019→2026",
      "22 tramos · ~744 mil horas",
      "Campeones: MLP + LightGBM",
      "MAE 1,50 · recall 0,79 · PR-AUC 0,84",
    ], 5.35, 2.05, 3.9, 2.4, false, 14);
    footer(s, 6, false);
  }

  // ═══════════════════════════════════════
  // 7. Protocolo temporal
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    lightBg(s);
    eyebrow(s, "PROTOCOLO TEMPORAL", 0.5, 0.28, 5, false);
    h1(s, "Train → Valid → Test → Holdout 2026", 0.5, 0.62, 9, false);
    const parts = [
      ["Train", "sep-2019 → ene-2024", "Ajuste del modelo"],
      ["Validación", "2024 → 2025", "Hiperparámetros y umbral"],
      ["Prueba", "2025 (todo el año)", "Métricas que reportamos"],
      ["Holdout", "ene → sep 2026", "Solo diagnóstico"],
    ];
    parts.forEach((p, i) => {
      const x = 0.45 + i * 2.4;
      card(s, x, 1.4, 2.25, 2.5, { fill: C.lightPanel, line: C.lightBorder });
      s.addText(p[0], {
        x: x + 0.15, y: 1.6, w: 1.95, h: 0.4,
        fontFace: "Calibri", fontSize: 16, bold: true, color: "028090", margin: 0, isTextBox: true,
      });
      s.addText(p[1], {
        x: x + 0.15, y: 2.15, w: 1.95, h: 0.7,
        fontFace: "Calibri", fontSize: 13, bold: true, color: C.lightText, margin: 0, isTextBox: true,
      });
      s.addText(p[2], {
        x: x + 0.15, y: 2.95, w: 1.95, h: 0.7,
        fontFace: "Calibri", fontSize: 13, color: C.lightMuted, margin: 0, isTextBox: true,
      });
    });
    s.addText("El holdout 2026 no es pandemia: es el periodo reciente que no se usó para elegir el modelo.", {
      x: 0.5, y: 4.2, w: 9, h: 0.4,
      fontFace: "Calibri", fontSize: 13, color: "8A5A00", margin: 0, isTextBox: true,
    });
    footer(s, 7, false);
  }

  // ═══════════════════════════════════════
  // 8. Pipeline
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    lightBg(s);
    eyebrow(s, "PIPELINE · PREFECT", 0.5, 0.28, 5, false);
    h1(s, "Seis tareas de punta a punta", 0.5, 0.62, 9, false);
    const steps = [
      ["1", "Adquisición", "Descarga + hash\n1 reintento"],
      ["2", "Estandarizar", "Serie horaria\nclima · festivos"],
      ["3", "EDA", "Figuras +\nreporte"],
      ["4", "Features", "35 variables\nsplit temporal"],
      ["5", "Entrenar", "Optuna / RSearch\n+ MLflow"],
      ["6", "Seleccionar", "Champion +\nmetadata"],
    ];
    steps.forEach((st, i) => {
      const x = 0.35 + i * 1.6;
      card(s, x, 1.35, 1.5, 2.7, { fill: C.lightPanel, line: C.lightBorder });
      s.addText(st[0], {
        x, y: 1.5, w: 1.5, h: 0.4,
        fontFace: "Calibri", fontSize: 22, bold: true, color: "028090", align: "center", margin: 0, isTextBox: true,
      });
      s.addText(st[1], {
        x: x + 0.08, y: 2.05, w: 1.34, h: 0.55,
        fontFace: "Calibri", fontSize: 12, bold: true, color: C.lightText, align: "center", margin: 0, isTextBox: true,
      });
      s.addText(st[2], {
        x: x + 0.08, y: 2.7, w: 1.34, h: 1.0,
        fontFace: "Calibri", fontSize: 11, color: C.lightMuted, align: "center", margin: 0, isTextBox: true,
      });
    });
    s.addText("python run_pipeline.py  ·  flow mobipredict-pipeline  ·  API + frontend", {
      x: 0.5, y: 4.35, w: 9, h: 0.35,
      fontFace: "Calibri", fontSize: 13, color: "8A9AAB", margin: 0, isTextBox: true,
    });
    footer(s, 8, false);
  }

  // ═══════════════════════════════════════
  // 9. Candidatos + ganadores
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    lightBg(s);
    eyebrow(s, "MODELOS", 0.5, 0.28, 4, false);
    h1(s, "Candidatos entrenados y campeones", 0.5, 0.62, 9, false);
    card(s, 0.5, 1.25, 4.35, 3.55, { fill: C.lightPanel, line: C.lightBorder });
    s.addText("Velocidad a 1 hora", {
      x: 0.7, y: 1.4, w: 4, h: 0.35,
      fontFace: "Calibri", fontSize: 15, bold: true, color: "028090", margin: 0, isTextBox: true,
    });
    bullets(s, [
      "Perfil histórico (línea base)",
      "Ridge",
      "Random Forest",
      "LightGBM",
      "MLP  ← ganador",
    ], 0.7, 1.9, 3.9, 2.5, false, 14);
    card(s, 5.15, 1.25, 4.35, 3.55, { fill: C.lightPanel, line: C.lightBorder });
    s.addText("Colapso a 1 hora", {
      x: 5.35, y: 1.4, w: 4, h: 0.35,
      fontFace: "Calibri", fontSize: 15, bold: true, color: "028090", margin: 0, isTextBox: true,
    });
    bullets(s, [
      "Regla umbral (línea base)",
      "Regresión logística",
      "Random Forest",
      "LightGBM  ← ganador",
    ], 5.35, 1.9, 3.9, 2.5, false, 14);
    footer(s, 9, false);
  }

  // ═══════════════════════════════════════
  // 10. Métricas campeones
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    darkBg(s);
    eyebrow(s, "CAMPEONES · PERIODO DE PRUEBA 2025", 0.5, 0.28, 7);
    h1(s, "Quién ganó y con qué números");
    card(s, 0.5, 1.2, 4.4, 3.6, { line: C.valor });
    s.addText("MLP", {
      x: 0.7, y: 1.4, w: 4, h: 0.4,
      fontFace: "Calibri", fontSize: 28, bold: true, color: C.valor, margin: 0, isTextBox: true,
    });
    s.addText("Velocidad · [128, 64]", {
      x: 0.7, y: 1.85, w: 4, h: 0.3,
      fontFace: "Calibri", fontSize: 13, color: C.dim, margin: 0, isTextBox: true,
    });
    [
      ["MAE", "1,50 km/h"],
      ["RMSE", "2,11 km/h"],
      ["WAPE", "5,9 %"],
      ["vs perfil", "−67 % WAPE"],
    ].forEach((r, i) => {
      const y = 2.35 + i * 0.5;
      s.addText(r[0], { x: 0.7, y, w: 1.6, h: 0.4, fontFace: "Calibri", fontSize: 14, color: C.muted, margin: 0, isTextBox: true });
      s.addText(r[1], { x: 2.4, y, w: 2.2, h: 0.4, fontFace: "Calibri", fontSize: 16, bold: true, color: C.white, margin: 0, isTextBox: true });
    });
    card(s, 5.1, 1.2, 4.4, 3.6, { line: C.valor });
    s.addText("LightGBM", {
      x: 5.3, y: 1.4, w: 4, h: 0.4,
      fontFace: "Calibri", fontSize: 28, bold: true, color: C.valor, margin: 0, isTextBox: true,
    });
    s.addText("Colapso · umbral 0,348", {
      x: 5.3, y: 1.85, w: 4, h: 0.3,
      fontFace: "Calibri", fontSize: 13, color: C.dim, margin: 0, isTextBox: true,
    });
    [
      ["PR-AUC", "0,841"],
      ["Recall", "79 %"],
      ["Precisión", "74 %"],
      ["Prioridad", "No perder alertas"],
    ].forEach((r, i) => {
      const y = 2.35 + i * 0.5;
      s.addText(r[0], { x: 5.3, y, w: 1.8, h: 0.4, fontFace: "Calibri", fontSize: 14, color: C.muted, margin: 0, isTextBox: true });
      s.addText(r[1], { x: 7.2, y, w: 2.0, h: 0.4, fontFace: "Calibri", fontSize: 16, bold: true, color: C.white, margin: 0, isTextBox: true });
    });
    footer(s, 10);
    s.addNotes("Selección en validación; test solo se reporta. En test LightGBM velocidad quedó levemente mejor en RMSE: no se cambia al ganador para no filtrar test.");
  }

  // ═══════════════════════════════════════
  // 11. MLOps
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    lightBg(s);
    eyebrow(s, "MLOPS Y AUTOMATIZACIÓN", 0.5, 0.28, 6, false);
    h1(s, "Cómo se opera el ciclo de vida", 0.5, 0.62, 9, false);
    const ops = [
      ["Prefect 3", "Orquesta el flow, reintentos y logs por tarea"],
      ["MLflow", "Experimentos, métricas y Model Registry"],
      ["Alias champion", "mobipredict-velocidad y mobipredict-colapso"],
      ["FastAPI", "Serving + /admin/reload sin apagar"],
      ["Docker Compose", "trainer · api · mlflow · prefect"],
      ["Trazabilidad", "SHA-256 de fuentes + replay offline"],
    ];
    ops.forEach((o, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 0.5 + col * 4.75;
      const y = 1.3 + row * 1.15;
      card(s, x, y, 4.55, 1.0, { fill: C.lightPanel, line: C.lightBorder });
      s.addText(o[0], {
        x: x + 0.2, y: y + 0.18, w: 4.15, h: 0.3,
        fontFace: "Calibri", fontSize: 15, bold: true, color: "028090", margin: 0, isTextBox: true,
      });
      s.addText(o[1], {
        x: x + 0.2, y: y + 0.52, w: 4.15, h: 0.35,
        fontFace: "Calibri", fontSize: 13, color: C.lightMuted, margin: 0, isTextBox: true,
      });
    });
    footer(s, 11, false);
  }

  // ═══════════════════════════════════════
  // 12. Arquitectura
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    darkBg(s);
    eyebrow(s, "ARQUITECTURA", 0.5, 0.28, 4);
    h1(s, "Entradas → núcleo → salidas");
    const cols = [
      ["ENTRA", ["ARS/CCTV horaria", "Clima Open-Meteo", "Festivos Colombia", "EOD / aforos", "En vivo: TomTom·HERE·Google"]],
      ["NÚCLEO", ["Feature store", "MLP velocidad", "LightGBM colapso", "Umbral de alerta", "API + replay"]],
      ["SALE", ["Velocidad +1 h", "P(colapso) + nivel", "Avisos tempranos", "Rutas con riesgo", "KPIs de valor"]],
    ];
    cols.forEach((c, i) => {
      const x = 0.4 + i * 3.2;
      card(s, x, 1.2, 3.0, 3.6, { line: i === 1 ? C.valor : C.border });
      s.addText(c[0], {
        x: x + 0.2, y: 1.4, w: 2.6, h: 0.35,
        fontFace: "Calibri", fontSize: 13, bold: true, color: i === 1 ? C.valor : C.dim, margin: 0, isTextBox: true,
      });
      bullets(s, c[1], x + 0.2, 1.95, 2.6, 2.5, true, 13);
    });
    footer(s, 12);
  }

  // ═══════════════════════════════════════
  // 13. Divider producto
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    darkBg(s);
    s.addText("03", {
      x: 0.55, y: 1.8, w: 2, h: 0.5,
      fontFace: "Calibri", fontSize: 18, bold: true, color: C.valor, margin: 0, isTextBox: true,
    });
    s.addText("El producto", {
      x: 0.55, y: 2.3, w: 8, h: 0.8,
      fontFace: "Calibri", fontSize: 36, bold: true, color: C.white, margin: 0, isTextBox: true,
    });
    s.addText("Cómo se usa: demo histórica y ciudad en vivo", {
      x: 0.55, y: 3.3, w: 8, h: 0.4,
      fontFace: "Calibri", fontSize: 16, color: C.muted, margin: 0, isTextBox: true,
    });
    footer(s, 13);
  }

  // ═══════════════════════════════════════
  // 14. Cómo funciona + colores
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    lightBg(s);
    eyebrow(s, "CÓMO FUNCIONA", 0.5, 0.28, 4, false);
    h1(s, "Mira · Compara · Avisa", 0.5, 0.62, 9, false);
    const steps = [
      ["1", "Mira", "Velocidad reciente, lluvia, hora, día y demanda de la zona"],
      ["2", "Compara", "Patrones aprendidos de ARS 2019–2026 (MLP + LightGBM)"],
      ["3", "Avisa", "Qué vía colapsa en 1 h y con qué probabilidad"],
    ];
    steps.forEach((st, i) => {
      const x = 0.5 + i * 3.15;
      card(s, x, 1.3, 3.0, 2.0, { fill: C.lightPanel, line: C.lightBorder });
      s.addText(st[0], {
        x: x + 0.2, y: 1.45, w: 0.5, h: 0.35,
        fontFace: "Calibri", fontSize: 18, bold: true, color: "028090", margin: 0, isTextBox: true,
      });
      s.addText(st[1], {
        x: x + 0.7, y: 1.48, w: 2.0, h: 0.35,
        fontFace: "Calibri", fontSize: 16, bold: true, color: C.lightText, margin: 0, isTextBox: true,
      });
      s.addText(st[2], {
        x: x + 0.2, y: 2.05, w: 2.6, h: 1.0,
        fontFace: "Calibri", fontSize: 13, color: C.lightMuted, margin: 0, isTextBox: true,
      });
    });
    const colorRows = [
      ["3FBF8A", "Normal", "Todo bien en la próxima hora"],
      ["F4B740", "Precaución", "El riesgo sube: vigilar"],
      ["FF4F62", "Alerta", "Va a colapsar en 1 h"],
      ["2FD8C5", "Aviso temprano", "Hoy fluye; en 1 h colapsa"],
    ];
    colorRows.forEach((c, i) => {
      const x = 0.5 + i * 2.4;
      s.addShape(ST.ellipse, {
        x: x + 0.05, y: 3.6, w: 0.28, h: 0.28,
        fill: { color: c[0] }, line: { color: c[0] },
      });
      s.addText(c[1], {
        x: x + 0.4, y: 3.55, w: 1.9, h: 0.28,
        fontFace: "Calibri", fontSize: 13, bold: true, color: C.lightText, margin: 0, isTextBox: true,
      });
      s.addText(c[2], {
        x: x + 0.4, y: 3.85, w: 1.9, h: 0.55,
        fontFace: "Calibri", fontSize: 11, color: C.lightMuted, margin: 0, isTextBox: true,
      });
    });
    footer(s, 14, false);
  }

  // ═══════════════════════════════════════
  // 15. Dos modos
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    lightBg(s);
    eyebrow(s, "DOS MODOS DE USO", 0.5, 0.28, 5, false);
    h1(s, "Demo histórica vs ciudad ahora", 0.5, 0.62, 9, false);
    card(s, 0.5, 1.3, 4.4, 3.4, { fill: C.lightPanel, line: C.lightBorder });
    s.addText("Demo · día real ARS", {
      x: 0.7, y: 1.5, w: 4, h: 0.35,
      fontFace: "Calibri", fontSize: 16, bold: true, color: "B8860B", margin: 0, isTextBox: true,
    });
    bullets(s, [
      "Centro de control + máquina del tiempo",
      "Mi viaje (¿salgo o espero?)",
      "Historia (presentación de 1 minuto)",
      "Evidencia y Actualización GT→ARS",
    ], 0.7, 2.1, 4, 2.3, false, 14);
    card(s, 5.1, 1.3, 4.4, 3.4, { fill: C.lightPanel, line: "02C39A" });
    s.addText("Hoy · tiempo real", {
      x: 5.3, y: 1.5, w: 4, h: 0.35,
      fontFace: "Calibri", fontSize: 16, bold: true, color: "028090", margin: 0, isTextBox: true,
    });
    bullets(s, [
      "En vivo: necesita 4 h seguidas por vía",
      "Navegar: rutas Google + riesgo MobiPredict",
      "Proveedores: TomTom, HERE, Google",
      "Lluvia: Open-Meteo",
    ], 5.3, 2.1, 4, 2.3, false, 14);
    footer(s, 15, false);
  }

  // ═══════════════════════════════════════
  // 16. Centro
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    lightBg(s);
    eyebrow(s, "CENTRO DE CONTROL", 0.5, 0.22, 5, false);
    h1(s, "¿Dónde actúo primero?", 0.5, 0.52, 5, false);
    if (fs.existsSync(img("image1.png"))) {
      s.addImage({ path: img("image1.png"), x: 4.7, y: 0.9, w: 4.9, h: 3.9 });
    }
    const steps = [
      "Elige un día real y pulsa ▶",
      "La lista ordena por riesgo a +1 h",
      "Clic en una vía del mapa o ranking",
      "Lee el veredicto y «¿Y si llueve?»",
    ];
    steps.forEach((t, i) => {
      const y = 1.25 + i * 0.8;
      s.addShape(ST.ellipse, {
        x: 0.55, y: y + 0.05, w: 0.38, h: 0.38,
        fill: { color: "028090" }, line: { color: "028090" },
      });
      s.addText(String(i + 1), {
        x: 0.55, y: y + 0.08, w: 0.38, h: 0.32,
        fontFace: "Calibri", fontSize: 14, bold: true, color: C.white, align: "center", margin: 0, isTextBox: true,
      });
      s.addText(t, {
        x: 1.1, y: y + 0.08, w: 3.4, h: 0.5,
        fontFace: "Calibri", fontSize: 14, color: C.lightText, margin: 0, isTextBox: true,
      });
    });
    footer(s, 16, false);
    s.addNotes("Repite días reales hora a hora. 'Revelar lo que pasó' muestra si acertó. Flechas = hora; espacio = pausa.");
  }

  // ═══════════════════════════════════════
  // 17. Mi viaje
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    lightBg(s);
    eyebrow(s, "MI VIAJE", 0.5, 0.22, 4, false);
    h1(s, "¿Salgo ahora o espero?", 0.5, 0.52, 5, false);
    if (fs.existsSync(img("image2.png"))) {
      s.addImage({ path: img("image2.png"), x: 5.0, y: 1.0, w: 4.5, h: 3.7 });
    }
    bullets(s, [
      "Abre la pestaña Mi viaje",
      "Escoge tu recorrido",
      "Lee: «Sal ahora» o «Si puedes, espera»",
      "Compara minutos ahora vs en 1 h",
      "Es demo histórica: para hoy usa En vivo / Navegar",
    ], 0.5, 1.3, 4.3, 3.2, false, 14);
    footer(s, 17, false);
  }

  // ═══════════════════════════════════════
  // 18. Navegar
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    lightBg(s);
    eyebrow(s, "NAVEGAR", 0.5, 0.22, 4, false);
    h1(s, "Rutas de Google + pronóstico", 0.5, 0.52, 5, false);
    if (fs.existsSync(img("image3.png"))) {
      s.addImage({ path: img("image3.png"), x: 4.7, y: 0.9, w: 4.9, h: 3.9 });
    }
    bullets(s, [
      "Desde / Hasta (o ubicación ◎)",
      "Ver rutas: Google trae el camino",
      "El color es el colapso a +1 h",
      "«EVITA EL COLAPSO» = recomendada",
    ], 0.5, 1.3, 4.0, 3.0, false, 14);
    footer(s, 18, false);
    s.addNotes("Necesita internet, clave Google y 4 h de historia en vivo para pintar riesgo completo.");
  }

  // ═══════════════════════════════════════
  // 19. Otras pestañas
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    lightBg(s);
    eyebrow(s, "EL RESTO DE LA APP", 0.5, 0.28, 5, false);
    h1(s, "Historia · En vivo · Evidencia · Actualización", 0.5, 0.62, 9, false);
    const tabs = [
      ["Historia", "Pitch de un minuto: problema, punto ciego y solución"],
      ["En vivo", "Medellín ahora; 4 h de lecturas antes de predecir"],
      ["Evidencia", "Cifras, comparación de modelos y gráficos EDA"],
      ["Actualización", "Antes/después del salto GT → ARS"],
    ];
    tabs.forEach((t, i) => {
      const y = 1.35 + i * 0.85;
      card(s, 0.5, y, 9, 0.75, { fill: C.lightPanel, line: C.lightBorder });
      s.addText(t[0], {
        x: 0.75, y: y + 0.2, w: 2.4, h: 0.35,
        fontFace: "Calibri", fontSize: 15, bold: true, color: "028090", margin: 0, isTextBox: true,
      });
      s.addText(t[1], {
        x: 3.3, y: y + 0.2, w: 5.9, h: 0.4,
        fontFace: "Calibri", fontSize: 14, color: C.lightMuted, margin: 0, isTextBox: true,
      });
    });
    footer(s, 19, false);
  }

  // ═══════════════════════════════════════
  // 20. Divider evidencia
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    darkBg(s);
    s.addText("04", {
      x: 0.55, y: 1.8, w: 2, h: 0.5,
      fontFace: "Calibri", fontSize: 18, bold: true, color: C.valor, margin: 0, isTextBox: true,
    });
    s.addText("Evidencia y cierre", {
      x: 0.55, y: 2.3, w: 8, h: 0.8,
      fontFace: "Calibri", fontSize: 36, bold: true, color: C.white, margin: 0, isTextBox: true,
    });
    s.addText("365 días de 2025 que el modelo nunca vio al entrenar", {
      x: 0.55, y: 3.3, w: 8, h: 0.4,
      fontFace: "Calibri", fontSize: 16, color: C.muted, margin: 0, isTextBox: true,
    });
    footer(s, 20);
  }

  // ═══════════════════════════════════════
  // 21. Resultados
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    darkBg(s);
    eyebrow(s, "¿FUNCIONA?", 0.5, 0.28, 4);
    h1(s, "Sí — y se mide en el periodo de prueba");
    const big = [
      ["1.475", "colapsos «sin aviso»\nanticipados con 1 h"],
      ["79 %", "de los colapsos\ndetectados (recall)"],
      ["64 %", "menos error de tiempo\nde viaje vs perfil"],
    ];
    big.forEach((b, i) => {
      const x = 0.5 + i * 3.15;
      card(s, x, 1.25, 3.0, 2.3, { line: C.valor });
      s.addText(b[0], {
        x: x + 0.15, y: 1.5, w: 2.7, h: 0.7,
        fontFace: "Calibri", fontSize: 32, bold: true, color: C.valor, margin: 0, isTextBox: true,
      });
      s.addText(b[1], {
        x: x + 0.15, y: 2.35, w: 2.7, h: 0.9,
        fontFace: "Calibri", fontSize: 14, color: C.muted, margin: 0, isTextBox: true,
      });
    });
    s.addText("Regla reactiva actual: recall 71 % · precisión 70 %.  MobiPredict: 79 % · 74 %.  MAE tiempo de viaje 0,63 min vs 1,77 del perfil.", {
      x: 0.5, y: 3.85, w: 9, h: 0.7,
      fontFace: "Calibri", fontSize: 13, color: C.dim, margin: 0, isTextBox: true,
    });
    s.addText("Fuente: GET /valor · test 2025 (365 días) · datos no vistos en entrenamiento", {
      x: 0.5, y: 4.55, w: 9, h: 0.3,
      fontFace: "Calibri", fontSize: 11, color: C.dim, margin: 0, isTextBox: true,
    });
    footer(s, 21);
  }

  // ═══════════════════════════════════════
  // 22. Quién gana
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    lightBg(s);
    eyebrow(s, "USUARIOS", 0.5, 0.28, 4, false);
    h1(s, "Quién gana y qué gana", 0.5, 0.62, 9, false);
    const users = [
      ["Operador", "1 h para actuar: semáforos, agentes, avisos. Alertas revisables en un turno."],
      ["Ciudadano", "Salir ahora o esperar; ruta que esquiva el colapso antes de formarse."],
      ["Alcaldía", "Qué vías fallan, cuándo y con lluvia — sin sensores nuevos."],
    ];
    users.forEach((u, i) => {
      const x = 0.5 + i * 3.15;
      card(s, x, 1.4, 3.0, 2.8, { fill: C.lightPanel, line: C.lightBorder });
      s.addText(String(i + 1), {
        x: x + 0.2, y: 1.6, w: 0.5, h: 0.35,
        fontFace: "Calibri", fontSize: 18, bold: true, color: "028090", margin: 0, isTextBox: true,
      });
      s.addText(u[0], {
        x: x + 0.2, y: 2.15, w: 2.6, h: 0.4,
        fontFace: "Calibri", fontSize: 16, bold: true, color: C.lightText, margin: 0, isTextBox: true,
      });
      s.addText(u[1], {
        x: x + 0.2, y: 2.7, w: 2.6, h: 1.2,
        fontFace: "Calibri", fontSize: 13, color: C.lightMuted, margin: 0, isTextBox: true,
      });
    });
    footer(s, 22, false);
  }

  // ═══════════════════════════════════════
  // 23. Fortalezas / límites
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    lightBg(s);
    eyebrow(s, "HONESTIDAD TÉCNICA", 0.5, 0.28, 5, false);
    h1(s, "Lo bueno y lo que falta", 0.5, 0.62, 9, false);
    card(s, 0.5, 1.3, 4.4, 3.5, { fill: C.lightPanel, line: "02C39A" });
    s.addText("Fortalezas", {
      x: 0.7, y: 1.5, w: 4, h: 0.35,
      fontFace: "Calibri", fontSize: 16, bold: true, color: "028090", margin: 0, isTextBox: true,
    });
    bullets(s, [
      "Avisa antes, no después",
      "Datos oficiales ARS hasta 2026",
      "Split temporal + holdout reciente",
      "Líneas base y MLOps documentado",
      "Producto usable (mapa + rutas)",
    ], 0.7, 2.0, 4, 2.5, false, 14);
    card(s, 5.1, 1.3, 4.4, 3.5, { fill: C.lightPanel, line: "E07470" });
    s.addText("Límites", {
      x: 5.3, y: 1.5, w: 4, h: 0.35,
      fontFace: "Calibri", fontSize: 16, bold: true, color: "C0392B", margin: 0, isTextBox: true,
    });
    bullets(s, [
      "22 tramos, no toda la malla",
      "En vivo depende de APIs externas",
      "Sin cron Prefect / retrain automático",
      "~1 de cada 5 colapsos se escapa",
      "Velocidad live ≈ índice, no ARS validado",
    ], 5.3, 2.0, 4, 2.5, false, 14);
    footer(s, 23, false);
  }

  // ═══════════════════════════════════════
  // 24. vs Waze
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    lightBg(s);
    eyebrow(s, "POSICIONAMIENTO", 0.5, 0.28, 5, false);
    h1(s, "¿Y Waze / Google Maps?", 0.5, 0.62, 9, false);
    s.addTable(
      [
        [
          { text: "", options: { fill: { color: "E8EEF3" } } },
          { text: "Waze / Maps", options: { fill: { color: "E8EEF3" }, bold: true, color: C.lightText } },
          { text: "MobiPredict", options: { fill: { color: "E8EEF3" }, bold: true, color: "028090" } },
        ],
        ["Pregunta", "¿Hay trancón ahora?", "¿Habrá trancón en 1 h?"],
        ["Para quién", "El conductor", "Centro de control (+ ciudadano)"],
        ["Qué hace", "Desvía cuando ya existe", "Avisa para evitarlo"],
        ["Datos", "Celulares de usuarios", "Sensores oficiales + clima"],
        ["Cobertura", "Todas las calles", "22 tramos principales"],
      ],
      {
        x: 0.5, y: 1.3, w: 9, h: 3.2,
        colW: [1.8, 3.5, 3.7],
        border: [{ pt: 0.5, color: C.lightBorder }],
        fontFace: "Calibri",
        fontSize: 13,
        color: C.lightText,
        align: "left",
        valign: "middle",
      }
    );
    s.addText("No compite: los complementa. Navegar usa rutas de Google y suma el pronóstico.", {
      x: 0.5, y: 4.7, w: 9, h: 0.3,
      fontFace: "Calibri", fontSize: 13, color: C.lightMuted, margin: 0, isTextBox: true,
    });
    footer(s, 24, false);
  }

  // ═══════════════════════════════════════
  // 25. Cierre
  // ═══════════════════════════════════════
  {
    const s = pres.addSlide();
    darkBg(s);
    s.addShape(ST.ellipse, {
      x: -1.8, y: 2.8, w: 4.2, h: 4.2,
      fill: { color: "0E2A33" }, line: { color: "0E2A33" },
    });
    eyebrow(s, "EN UNA FRASE", 0.55, 1.6, 5);
    s.addText("Waze te dice dónde está\nel trancón. MobiPredict te\ndice dónde va a estar.", {
      x: 0.55, y: 2.05, w: 8.5, h: 1.6,
      fontFace: "Calibri", fontSize: 26, bold: true, color: C.white, margin: 0, isTextBox: true,
    });
    s.addText("Demo: http://localhost:8000  ·  Empieza por Historia", {
      x: 0.55, y: 4.0, w: 8, h: 0.35,
      fontFace: "Calibri", fontSize: 14, color: C.valor, margin: 0, isTextBox: true,
    });
    s.addText("Proyecto académico — no es un servicio oficial de la Alcaldía", {
      x: 0.55, y: 4.55, w: 8, h: 0.3,
      fontFace: "Calibri", fontSize: 12, color: C.dim, margin: 0, isTextBox: true,
    });
    footer(s, 25);
  }

  await pres.writeFile({ fileName: OUT });

  // quitar entradas de carpeta en el zip
  const { execSync } = require("child_process");
  // cleanup via writing already done by pptxgen mostly; python cleanup below
  console.log("Wrote", OUT);
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
