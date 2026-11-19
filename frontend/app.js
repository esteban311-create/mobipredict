/* MobiPredict — Centro de anticipación vial.
 * Todo lo que se ve sale de la API: /replay/{fecha} ejecuta los modelos sobre un día real, /valor resume el
 * periodo de prueba y /predict responde el "¿y si llueve?". Leaflet va incluido en vendor/ (funciona sin CDN);
 * solo el fondo del mapa necesita internet. */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const ESTADO = {
  tramos: new Map(),       // tramo_id -> catálogo (/tramos)
  dias: [],                // /dias
  valor: null,             // /valor
  reent: null,             // /reentrenamiento
  dia: null,               // respuesta de /replay/{fecha}
  porTramo: new Map(),     // tramo_id -> { info, porHora: Map(hora -> punto) }
  horas: [],
  hora: 6,
  revelar: true,
  sel: null,
  vista: "control",
  timer: null,
  mapa: null,
  marcadores: new Map(),
  kpiPrevio: 0,
  envivo: null,            // respuesta de /envivo
  ruta: null,              // respuesta de /envivo/ruta
  rutaSel: 0,
  capaRutas: null,
  timerEnvivo: null,
};

const NOMBRES_MODELO = {
  perfil_historico: "Perfil histórico (línea base)", regla_umbral: "Regla simple (línea base)",
  ridge: "Ridge (lineal)", logistica: "Regresión logística", random_forest: "Random Forest",
  lightgbm: "LightGBM", mlp: "Red neuronal (MLP)",
};
const FIGURAS = {
  "01_congestion_cronica_heatmap.png": ["Congestión por vía y hora", "Más oscuro = más lento que lo normal."],
  "02_eod2025_viajes_por_hora.png": ["Viajes por hora (EOD 2025)", "Dos picos: salida a las 6 h y regreso a las 17 h."],
  "03_eod2025_reparto_modal.png": ["En qué se mueve la gente", "A pie es el primer modo y la moto ya supera al carro."],
  "04_eod2025_densidad_destinos.png": ["Zonas que más viajes atraen", "El centro y El Poblado concentran los destinos."],
  "05_siniestralidad_vial.png": ["Siniestralidad vial", "Incidentes fatales por año y todos los incidentes por hora."],
  "06_horas_en_colapso_por_tramo.png": ["Horas en colapso por vía", "% del tiempo laborable por debajo de la mitad de la velocidad normal."],
  "07_drift_pandemia.png": ["El efecto de la pandemia (serie GT)", "Con los sensores GT 2017-2020: la congestión cayó en la cuarentena y luego se recuperó."],
  "08_lluvia_vs_colapso.png": ["Lluvia y colapso", "Con lluvia fuerte el colapso en hora pico es mucho más frecuente."],
  "09_composicion_vehicular_aforos.png": ["Qué vehículos circulan", "Proporción de carros, motos y buses aforados."],
};
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const FLECHA = { NS: "↓", SN: "↑", EW: "←", WE: "→" };
const ROTACION = { SN: 0, WE: 90, NS: 180, EW: 270 };
const SENTIDO = { NS: "norte → sur", SN: "sur → norte", EW: "oriente → occidente", WE: "occidente → oriente" };
const COLOR = { normal: "var(--normal)", precaucion: "var(--precaucion)", colapso: "var(--colapso)" };
const HEX = { normal: "#3fbf8a", precaucion: "#f4b740", colapso: "#ff4f62", valor: "#2fd8c5", hoy: "#7d8c9b" };

/* ---------------- utilidades ---------------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function num(x, dec = 1) {
  if (x === null || x === undefined || Number.isNaN(x) || !Number.isFinite(x)) return "—";
  return Number(x).toLocaleString("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
const pct = (x, dec = 0) => (x == null || !Number.isFinite(x) ? "—" : `${num(x * 100, dec)} %`);
const hh = (h) => `${String(h).padStart(2, "0")}:00`;
const corto = (c) => String(c).replace(/^Avenida /, "Av. ").replace(/^Autopista /, "Autop. ");
function fechaDe(iso) { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); }
function fechaLarga(iso) {
  const d = fechaDe(iso);
  const dia = d.toLocaleDateString("es-CO", { weekday: "long" });
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
function fechaCorta(iso) { const d = fechaDe(iso); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; }

async function pedir(ruta, opciones = {}) {
  const r = await fetch(ruta, { headers: { "Content-Type": "application/json" }, ...opciones });
  let cuerpo = null;
  try { cuerpo = await r.json(); } catch { /* sin JSON */ }
  if (!r.ok) {
    const det = cuerpo?.detail ? (typeof cuerpo.detail === "string" ? cuerpo.detail : JSON.stringify(cuerpo.detail)) : `HTTP ${r.status}`;
    throw new Error(det);
  }
  return cuerpo;
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ---------------- arranque ---------------- */
async function iniciar() {
  enlazarControles();
  cargarGaleria();
  let salud;
  try { salud = await pedir("/health"); } catch (e) { return sinModelos("Sin conexión con la API", `No se pudo consultar /health: ${e.message}`); }
  if (!salud.modelos_cargados) return sinModelos("API activa, sin modelos", salud.detalle || "");
  const est = $("#estado");
  est.textContent = `${NOMBRES_MODELO[salud.modelo_velocidad] || salud.modelo_velocidad} + ${NOMBRES_MODELO[salud.modelo_colapso] || salud.modelo_colapso}`;
  est.className = "estado ok";

  try {
    const [tramos, dias] = await Promise.all([pedir("/tramos"), pedir("/dias")]);
    tramos.forEach((t) => ESTADO.tramos.set(t.tramo_id, t));
    ESTADO.dias = dias;
  } catch (e) { return sinModelos("Error al cargar datos", e.message); }

  iniciarMapa();
  pintarCalendario();
  cargarModelos();
  cargarReentrenamiento();
  pedir("/valor").then((v) => {
    ESTADO.valor = v;
    pintarEvidenciaValor();
    if (v.desde && v.hasta) {
      const d0 = fechaCorta(v.desde.slice(0, 10)), d1 = fechaCorta(v.hasta.slice(0, 10));
      $("#ev-sobre").textContent = `Periodo de prueba · ${d0} → ${d1} · datos que el modelo nunca vio`;
    }
    if (!$("#historia").hidden) pasoHistoria(ESTADO.pasoHist || 0);
  }).catch(() => { $("#ev-valor").innerHTML = `<p class="error">No se pudieron calcular las cifras de valor.</p>`; });

  const params = new URLSearchParams(location.hash.slice(1));
  const inicial = ESTADO.dias.find((d) => d.fecha === params.get("fecha"))?.fecha || diaDestacado().fecha;
  await cargarDia(inicial, Number(params.get("h")) || null);

  let vista = false;
  try { vista = sessionStorage.getItem("mp-historia") === "1"; } catch { /* sin almacenamiento */ }
  if (!vista && !params.get("fecha")) abrirHistoria();
  const hashVista = params.get("vista");
  if (hashVista && ["control", "viaje", "navegar", "envivo", "ars", "evidencia"].includes(hashVista)) cambiarVista(hashVista);
}

function sinModelos(estado, detalle) {
  $("#estado").textContent = estado;
  $("#estado").className = "estado mal";
  $("#sin-modelos").hidden = false;
  $("#sin-modelos-detalle").textContent = detalle;
}

function diaDestacado() {
  const test = ESTADO.dias.filter((d) => d.periodo === "test");
  return [...test].sort((a, b) => b.colapsos_sin_aviso - a.colapsos_sin_aviso)[0] || ESTADO.dias[0];
}

function enlazarControles() {
  $$(".vistas button").forEach((b) => b.addEventListener("click", () => cambiarVista(b.dataset.vista)));
  $("#marca").addEventListener("click", (e) => { e.preventDefault(); cambiarVista("control"); });
  $("#btn-play").addEventListener("click", alternarPlay);
  $("#hora").addEventListener("input", (e) => { pausar(); irAHora(Number(e.target.value)); });
  $("#revelar").addEventListener("change", (e) => { ESTADO.revelar = e.target.checked; pintarHora(); });
  $("#btn-dia").addEventListener("click", () => $("#dlg-dias").showModal());
  $("#btn-historia").addEventListener("click", abrirHistoria);
  $("#btn-chip-ars").addEventListener("click", () => cambiarVista("ars"));
  $("#btn-ars-control")?.addEventListener("click", () => cambiarVista("control"));
  $("#btn-ars-evidencia")?.addEventListener("click", () => cambiarVista("evidencia"));
  $("#viaje-tramo").addEventListener("change", (e) => seleccionar(e.target.value));
  $$("#viaje-modo [data-ir]").forEach((b) => b.addEventListener("click", () => cambiarVista(b.dataset.ir)));
  $("#btn-envivo").addEventListener("click", consultarEnVivo);
  $("#btn-ir-navegar").addEventListener("click", () => cambiarVista("navegar"));
  $("#ruta-form").addEventListener("submit", (e) => { e.preventDefault(); buscarRuta(); });
  $("#ruta-gps").addEventListener("click", miUbicacion);
  $("#ruta-swap").addEventListener("click", () => {
    const a = $("#ruta-origen"), b = $("#ruta-destino");
    [a.value, b.value] = [b.value, a.value];
  });
  $("#ruta-limpiar").addEventListener("click", limpiarRuta);
  $$(".filtro button").forEach((b) => b.addEventListener("click", () => {
    ESTADO.soloTempranos = b.dataset.f === "tempranos";
    $$(".filtro button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    pintarHora();
  }));
  document.addEventListener("keydown", (e) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName) || !$("#historia").hidden) return;
    if (ESTADO.vista === "envivo" || ESTADO.vista === "navegar") return;
    if (e.key === "ArrowRight") { pausar(); paso(1); }
    else if (e.key === "ArrowLeft") { pausar(); paso(-1); }
    else if (e.key === " " && !["evidencia", "ars", "envivo"].includes(ESTADO.vista)) { e.preventDefault(); alternarPlay(); }
  });
}

function cambiarVista(v) {
  ESTADO.vista = v;
  document.body.dataset.vista = v;
  $$(".vistas button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.vista === v)));
  $("#panel-control").hidden = v !== "control";
  $("#panel-viaje").hidden = v !== "viaje";
  $("#evidencia").hidden = v !== "evidencia";
  $("#vista-ars").hidden = v !== "ars";
  $("#panel-envivo").hidden = v !== "envivo";
  $("#panel-navegar").hidden = v !== "navegar";
  $("#nav-dock").hidden = v !== "navegar";
  const vivo = v === "envivo" || v === "navegar";
  if (v === "evidencia" || v === "ars" || vivo) pausar();
  if (v !== "navegar") quitarCapaRutas(); else if (ESTADO.ruta) dibujarRutas();
  clearInterval(ESTADO.timerEnvivo); ESTADO.timerEnvivo = null;
  if (vivo) { cargarEnVivo(); ESTADO.timerEnvivo = setInterval(cargarEnVivo, 60000); }
  if (v === "viaje" && !ESTADO.sel) seleccionar(rankingHora()[0]?.id, false);
  if (v === "ars") pintarArs();
  pintarHora();
  setTimeout(() => ESTADO.mapa?.invalidateSize(), 50);
}

/* ---------------- mapa ---------------- */
function posicion(t) {
  // Cada tramo tiene un punto (promedio de sus cámaras). Los dos sentidos se separan ~120 m hacia su
  // derecha (en Colombia se circula por la derecha) para que no se tapen.
  const d = 0.0011;
  const off = { SN: [0, d], NS: [0, -d], WE: [-d, 0], EW: [d, 0] }[t.sentido] || [0, 0];
  return [t.lat + off[0], t.lon + off[1]];
}

function iniciarMapa() {
  if (typeof L === "undefined") { $("#mapa").innerHTML = `<p class="vacio">No se pudo cargar el mapa.</p>`; return; }
  const mapa = L.map("mapa", { zoomControl: false, attributionControl: true, minZoom: 11, maxZoom: 16, zoomSnap: 0.25 });
  L.control.zoom({ position: "topright" }).addTo(mapa);
  // Fondo oscuro de Esri (no requiere clave de API) + capa de nombres de calles encima
  const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
  L.tileLayer(`${esri}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom: 16, attribution: "Mapa base &copy; Esri, HERE, Garmin, &copy; colaboradores de OpenStreetMap",
  }).addTo(mapa);
  L.tileLayer(`${esri}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, pane: "overlayPane", opacity: .8 }).addTo(mapa);
  ESTADO.mapa = mapa;
  const pts = [];
  ESTADO.tramos.forEach((t) => {
    if (t.lat == null || t.lon == null) return;
    const pos = posicion(t);
    pts.push(pos);
    const m = L.marker(pos, { icon: icono(t, null), keyboard: true, title: `${t.corredor} ${SENTIDO[t.sentido] || t.sentido}` })
      .addTo(mapa).on("click", () => seleccionar(t.tramo_id));
    m.bindTooltip("", { className: "tip", direction: "top", offset: [0, -14] });
    ESTADO.marcadores.set(t.tramo_id, m);
  });
  encuadrar(pts);
  window.addEventListener("resize", debounce(() => encuadrar(pts), 200));
}

function encuadrar(pts) {
  if (!pts.length) return;
  const ancho = window.innerWidth > 980;
  ESTADO.mapa.fitBounds(L.latLngBounds(pts), ancho
    ? { paddingTopLeft: [400, 110], paddingBottomRight: [ESTADO.sel ? 430 : 60, 130] }
    : { padding: [24, 24] });
}

function icono(t, p) {
  const nivel = p?.nivel || "normal";
  const temprano = p && p.alerta && !p.colapso_actual;
  const cls = ["mk", p ? "" : "sin-dato", p?.alerta ? "alerta" : "", temprano ? "temprano" : "", ESTADO.sel === t.tramo_id ? "sel" : ""].join(" ");
  let badge = "";
  if (p && ESTADO.revelar && ESTADO.vista !== "envivo" && (p.alerta || p.colapso_real)) {
    badge = p.alerta && p.colapso_real ? `<i class="badge ok">✓</i>` : `<i class="badge mal">✗</i>`;
  }
  return L.divIcon({
    className: "", iconSize: [34, 34], iconAnchor: [17, 17],
    html: `<div class="${cls}" style="--c:${p ? COLOR[nivel] : "#3a4756"};--rot:${ROTACION[t.sentido] ?? 0}deg">
      <div class="nucleo"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 L10.5 10.5 L6 8 L1.5 10.5Z" fill="#0a0f15"/></svg></div>${badge}</div>`,
  });
}

function pintarMapa(filas) {
  filas.forEach(({ id, t, p }) => {
    const m = ESTADO.marcadores.get(id);
    if (!m) return;
    m.setIcon(icono(t, p));
    m.setZIndexOffset(p ? Math.round(p.probabilidad_colapso * 1000) + (ESTADO.sel === id ? 2000 : 0) : -500);
    m.setTooltipContent(p
      ? `<b>${esc(corto(t.corredor))} ${FLECHA[t.sentido] || ""}</b><br>Riesgo de colapso a las ${hh(ESTADO.hora + 1)}: <b class="t-${p.nivel}">${pct(p.probabilidad_colapso)}</b><br>Ahora ${num(p.velocidad_actual_kmh, 0)} km/h → en 1 h ${num(p.velocidad_predicha_kmh, 0)} km/h`
      : `<b>${esc(corto(t.corredor))} ${FLECHA[t.sentido] || ""}</b><br>Sin lecturas a esta hora`);
  });
  const lluvia = filas.find((f) => f.p)?.p.lluvia_mm || 0;
  $("#lluvia").style.opacity = String(Math.min(1, lluvia / 4) * 0.9);
}

/* ---------------- día y hora ---------------- */
async function cargarDia(fecha, hora = null) {
  pausar();
  $("#dia-texto").textContent = "Calculando…";
  let dia;
  try { dia = await pedir(`/replay/${fecha}`); } catch (e) { $("#dia-texto").textContent = "Error"; $("#ranking").innerHTML = `<li class="error vacio">No se pudo repetir el día: ${esc(e.message)}</li>`; return; }
  ESTADO.dia = dia;
  ESTADO.porTramo = new Map(dia.tramos.map((t) => [t.tramo_id, { info: t, porHora: new Map(t.serie.map((p) => [p.hora, p])) }]));
  ESTADO.horas = dia.por_hora.map((h) => h.hora);
  ESTADO.kpiPrevio = 0;
  const [h0, h1] = [ESTADO.horas[0], ESTADO.horas.at(-1)];
  Object.assign($("#hora"), { min: h0, max: h1 });
  ESTADO.hora = hora && hora >= h0 && hora <= h1 ? hora : h0;
  $("#hora").value = ESTADO.hora;
  $("#dia-texto").textContent = `${fechaCorta(fecha)}${dia.periodo === "drift" ? " · holdout" : ""}`;
  $("#btn-dia").title = fechaLarga(fecha);
  $("#horas").innerHTML = ESTADO.horas.map((h) => `<span data-h="${h}">${h}</span>`).join("");
  pintarCalendario();
  pintarHora();
}

function irAHora(h) {
  ESTADO.hora = Math.max(ESTADO.horas[0], Math.min(ESTADO.horas.at(-1), h));
  $("#hora").value = ESTADO.hora;
  pintarHora();
}
function paso(d) { irAHora(ESTADO.hora + d); }

function alternarPlay() { ESTADO.timer ? pausar() : reproducir(); }
function reproducir() {
  if (!ESTADO.dia) return;
  if (ESTADO.hora >= ESTADO.horas.at(-1)) irAHora(ESTADO.horas[0]);
  $("#btn-play").textContent = "❚❚"; $("#btn-play").classList.add("pausa"); $("#btn-play").setAttribute("aria-label", "Pausar");
  ESTADO.timer = setInterval(() => {
    if (ESTADO.hora >= ESTADO.horas.at(-1)) return pausar();
    paso(1);
  }, 1800);
}
function pausar() {
  clearInterval(ESTADO.timer); ESTADO.timer = null;
  const b = $("#btn-play");
  b.textContent = "▶"; b.classList.remove("pausa"); b.setAttribute("aria-label", "Reproducir el día");
}

function rankingHora() {
  const h = ESTADO.hora;
  const filas = [...ESTADO.tramos.values()].map((t) => ({ id: t.tramo_id, t, p: ESTADO.porTramo.get(t.tramo_id)?.porHora.get(h) || null }));
  return filas.sort((a, b) => (b.p?.probabilidad_colapso ?? -1) - (a.p?.probabilidad_colapso ?? -1));
}

function pintarHora() {
  if (ESTADO.vista === "envivo" || ESTADO.vista === "navegar") return pintarEnVivo();
  if (!ESTADO.dia) return;
  const h = ESTADO.hora;
  const filas = rankingHora();
  try { history.replaceState(null, "", `#fecha=${ESTADO.dia.fecha}&h=${h}`); } catch { /* file:// */ }
  const texto = `${fechaLarga(ESTADO.dia.fecha)} · ${hh(h)} → predicción para las ${hh(h + 1)}`;
  $("#control-hora").textContent = texto;
  $("#viaje-hora").textContent = texto;
  $$("#horas span").forEach((s) => s.classList.toggle("act", Number(s.dataset.h) === h));
  pintarMapa(filas);
  pintarHisto();
  pintarKpis();
  pintarRanking(filas);
  pintarViaje();
  pintarDetalle();
}

/* ---------------- KPIs acumulados del día ---------------- */
function acumulado() {
  // Al llegar a la hora h ya se conoce el resultado de las predicciones hechas hasta h-1; con
  // "Revelar lo que pasó" también se muestra el de la hora h.
  const lim = ESTADO.revelar ? ESTADO.hora : ESTADO.hora - 1;
  const a = { sinAviso: 0, ant: 0, reales: 0, det: 0, alertas: 0, reac: 0, reacAlertas: 0, errTt: 0, errPerfil: 0, n: 0 };
  ESTADO.porTramo.forEach(({ porHora }) => porHora.forEach((p) => {
    if (p.hora > lim) return;
    a.sinAviso += p.colapso_sin_aviso; a.ant += p.anticipado; a.reales += p.colapso_real;
    a.det += p.alerta && p.colapso_real; a.alertas += p.alerta;
    a.reac += p.colapso_actual && p.colapso_real; a.reacAlertas += p.colapso_actual;
    if (p.tiempo_viaje_real_min != null) {
      a.errTt += Math.abs(p.tiempo_viaje_predicho_min - p.tiempo_viaje_real_min);
      if (p.tiempo_viaje_perfil_min != null) a.errPerfil += Math.abs(p.tiempo_viaje_perfil_min - p.tiempo_viaje_real_min);
      a.n += 1;
    }
  }));
  a.lim = lim;
  return a;
}

function barraVs(etq, v, c) {
  return `<div class="vs"><span>${etq}</span><i style="--p:${Math.round((v ?? 0) * 100)}%;--c:${c}"></i><em>${pct(v)}</em></div>`;
}

function pintarKpis() {
  const a = acumulado();
  const vacio = a.lim < ESTADO.horas[0];
  const cont = $("#kpis");
  const r = (x, y) => (y ? x / y : null);
  cont.innerHTML = `
    <div class="kpi estrella" id="kpi-ant">
      <span>Colapsos anticipados con 1 h de ventaja ${vacio ? "" : `(hasta las ${hh(a.lim + 1)})`}</span>
      <b>${vacio ? "—" : a.ant}</b> <small>${vacio ? "se llena a medida que avanza el día" : `de ${a.sinAviso} que empezaron sin aviso · el monitoreo actual vio 0`}</small>
    </div>
    <div class="kpi"><span>Colapsos detectados</span>
      ${barraVs("MobiPredict", vacio ? null : r(a.det, a.reales), HEX.valor)}${barraVs("Hoy", vacio ? null : r(a.reac, a.reales), HEX.hoy)}</div>
    <div class="kpi"><span>Alertas que acertaron</span>
      ${barraVs("MobiPredict", vacio ? null : r(a.det, a.alertas), HEX.valor)}${barraVs("Hoy", vacio ? null : r(a.reac, a.reacAlertas), HEX.hoy)}</div>
    <div class="kpi"><span>Error en el tiempo de viaje</span>
      <b>${vacio || !a.n ? "—" : num(a.errTt / a.n, 2)}</b> <small>min</small>
      <small style="display:block">${vacio || !a.n ? "por trayecto, frente a lo medido" : `promedio histórico: ${num(a.errPerfil / a.n, 2)} min`}</small></div>`;
  if (a.ant > ESTADO.kpiPrevio) { const k = $("#kpi-ant"); k.classList.add("pulso"); }
  ESTADO.kpiPrevio = a.ant;
}

/* ---------------- histograma de la línea de tiempo ---------------- */
function pintarHisto() {
  const ph = ESTADO.dia.por_hora;
  const max = Math.max(1, ...ph.map((x) => Math.max(x.alertas, x.colapsos_reales)));
  $("#histo").innerHTML = ph.map((x) => {
    const fut = x.hora > ESTADO.hora;
    const alto = (v) => `${Math.round((v / max) * 26)}px`;
    return `<div class="col ${fut ? "fut" : ""}" title="${hh(x.hora)}: ${x.alertas} alertas, ${x.colapsos_reales} colapsos reales, ${x.anticipados} anticipados${x.lluvia_mm ? `, lluvia ${num(x.lluvia_mm)} mm` : ""}">
      ${x.lluvia_mm >= 0.5 ? `<span class="gota">●</span>` : ""}
      <span class="b" style="height:${alto(Math.max(0, x.alertas - x.anticipados))}"></span>
      <span class="b ant" style="height:${alto(x.anticipados)}"></span></div>`;
  }).join("");
}

/* ---------------- ranking: dónde actuar primero ---------------- */
function resultado(p) {
  if (!ESTADO.revelar || !p) return "";
  if (p.alerta && p.colapso_real) return `<span class="res ok">✓ colapsó (${num(p.velocidad_real_kmh, 0)} km/h)</span>`;
  if (p.alerta) return `<span class="res neutro">falsa alarma</span>`;
  if (p.colapso_real) return `<span class="res mal">✗ colapso no anticipado</span>`;
  return "";
}

function pintarRanking(filas) {
  if (ESTADO.vista !== "control") return;
  const tempranos = filas.filter(({ p }) => p && p.alerta && !p.colapso_actual);
  $("#filtro-n").textContent = tempranos.length;
  if (ESTADO.soloTempranos) filas = tempranos;
  if (!filas.length) {
    $("#ranking").innerHTML = `<li class="vacio">Ningún aviso temprano a las ${hh(ESTADO.hora)}: no se espera que colapse ninguna vía que hoy fluya.</li>`;
    return;
  }
  $("#ranking").innerHTML = filas.map(({ id, t, p }, i) => {
    if (!p) return `<li><button type="button" class="fila sin-dato" data-id="${esc(id)}"><span class="pos">—</span><span class="nom">${esc(corto(t.corredor))}<small>${FLECHA[t.sentido] || ""}</small></span><span class="prob">—</span><span class="det">Sin lecturas a esta hora</span></button></li>`;
    const temprano = p.alerta && !p.colapso_actual;
    return `<li><button type="button" class="fila" data-id="${esc(id)}" aria-pressed="${ESTADO.sel === id}">
      <span class="pos">${i + 1}</span>
      <span class="nom">${esc(corto(t.corredor))}<small>${FLECHA[t.sentido] || ""} ${esc(t.inicio)} → ${esc(t.fin)}</small></span>
      <span class="prob ${p.nivel}">${pct(p.probabilidad_colapso)}</span>
      <span class="barra-p"><i class="bg-${p.nivel}" style="width:${p.probabilidad_colapso * 100}%"></i></span>
      <span class="det">ahora ${num(p.velocidad_actual_kmh, 0)} → ${num(p.velocidad_predicha_kmh, 0)} km/h
        ${temprano ? `<i class="etq-temprano">AVISO TEMPRANO</i>` : ""}${resultado(p)}</span>
    </button></li>`;
  }).join("");
  $$("#ranking .fila").forEach((b) => b.addEventListener("click", () => seleccionar(b.dataset.id)));
}

/* ---------------- detalle de una vía ---------------- */
function seleccionar(id, volar = true) {
  if (!id) return;
  ESTADO.sel = id;
  $("#viaje-tramo").value = id;
  const t = ESTADO.tramos.get(id);
  if (volar && ESTADO.mapa && t?.lat != null && window.innerWidth > 980) {
    ESTADO.mapa.flyTo(posicion(t), Math.max(ESTADO.mapa.getZoom(), 14), { duration: .8 });
  }
  pintarHora();
}

function pintarDetalle() {
  const cont = $("#detalle");
  const id = ESTADO.sel;
  document.body.classList.toggle("con-detalle", Boolean(id) && !["evidencia", "ars"].includes(ESTADO.vista));
  if (!id || ["evidencia", "ars"].includes(ESTADO.vista)) { cont.hidden = true; return; }
  const t = ESTADO.tramos.get(id);
  const reg = ESTADO.porTramo.get(id);
  const p = reg?.porHora.get(ESTADO.hora) || null;
  cont.hidden = false;
  const h = ESTADO.hora;
  let veredicto;
  if (!p) veredicto = `<div class="veredicto"><p class="grande">Sin lecturas</p><p>Este tramo no tiene datos a las ${hh(h)} de este día.</p></div>`;
  else {
    const temprano = p.alerta && !p.colapso_actual;
    const clase = temprano ? "temprano" : p.nivel;
    const titulo = temprano ? "Aviso temprano" : p.alerta ? "El colapso continúa" : p.nivel === "precaucion" ? "Vigilar" : "Sin riesgo";
    const cuerpo = temprano
      ? `Ahora circula a <b>${num(p.velocidad_actual_kmh, 0)} km/h</b>, pero el modelo espera que caiga a <b>${num(p.velocidad_predicha_kmh, 0)} km/h</b> a las ${hh(h + 1)}. El monitoreo actual todavía no ve nada: hay una hora para actuar.`
      : p.alerta ? `La vía ya está lenta (${num(p.velocidad_actual_kmh, 0)} km/h) y seguirá colapsada a las ${hh(h + 1)}.`
        : p.nivel === "precaucion" ? `La probabilidad se acerca al umbral de alerta (${pct(ESTADO.dia.umbral_decision)}).`
          : `No se espera colapso a las ${hh(h + 1)}.`;
    const real = ESTADO.revelar
      ? `<p style="margin-top:6px">Lo que pasó a las ${hh(h + 1)}: <b>${num(p.velocidad_real_kmh, 1)} km/h</b>, ${p.colapso_real ? "<b class='t-colapso'>sí colapsó</b>" : "no colapsó"}. ${resultado(p)}</p>` : "";
    veredicto = `<div class="veredicto ${clase}"><p class="grande ${temprano ? "" : `t-${p.nivel}`}" ${temprano ? 'style="color:var(--valor)"' : ""}>${titulo} · ${pct(p.probabilidad_colapso)}</p><p>${cuerpo}</p>${real}</div>`;
  }
  cont.innerHTML = `
    <div class="det-cab">
      <button type="button" class="cerrar-det" aria-label="Cerrar detalle">×</button>
      <h3>${esc(t.corredor)} ${FLECHA[t.sentido] || ""}</h3>
      <p>${esc(t.inicio)} → ${esc(t.fin)} · ${num(t.longitud_km)} km · velocidad normal ${num(t.vel_referencia_kmh, 0)} km/h</p>
    </div>
    <div class="det-cuerpo">
      ${veredicto}
      ${p ? `<div class="tres">
        <div><span>Ahora (${hh(h)})</span><b>${num(p.velocidad_actual_kmh, 0)}</b> <small>km/h</small><br><small>${num(t.longitud_km / p.velocidad_actual_kmh * 60, 1)} min</small></div>
        <div><span>Predicción ${hh(h + 1)}</span><b style="color:var(--valor)">${num(p.velocidad_predicha_kmh, 0)}</b> <small>km/h</small><br><small>${num(p.tiempo_viaje_predicho_min, 1)} min</small></div>
        <div><span>${ESTADO.revelar ? `Real ${hh(h + 1)}` : "Normal"}</span><b>${ESTADO.revelar ? num(p.velocidad_real_kmh, 0) : num(t.vel_referencia_kmh, 0)}</b> <small>km/h</small><br><small>${ESTADO.revelar ? `${num(p.tiempo_viaje_real_min, 1)} min` : "flujo libre"}</small></div>
      </div>` : ""}
      <div><p class="subt">El día en esta vía</p><div class="graf">${graficoDia(reg, t)}</div>
        <div class="graf-ley"><span><i style="background:#e6edf3"></i>medido</span><span><i style="background:${HEX.valor}"></i>predicho 1 h antes</span><span><i style="background:${HEX.colapso};opacity:.5"></i>zona de colapso</span></div></div>
      ${p ? `<div class="quesi"><p class="subt">¿Y si empieza a llover?</p>
        <label for="quesi-lluvia"><span>Lluvia en la hora actual</span><b id="quesi-mm">${num(p.lluvia_mm, 1)} mm</b></label>
        <input type="range" id="quesi-lluvia" min="0" max="20" step="0.5" value="${p.lluvia_mm}">
        <p class="res-quesi" id="quesi-res">Mueve el control: el modelo vuelve a predecir con esa lluvia.</p></div>` : ""}
    </div>`;
  $(".cerrar-det", cont).addEventListener("click", () => { ESTADO.sel = null; pintarHora(); });
  const r = $("#quesi-lluvia", cont);
  if (r) r.addEventListener("input", (e) => { $("#quesi-mm").textContent = `${num(Number(e.target.value), 1)} mm`; queSiLluvia(id, Number(e.target.value)); });
}

const queSiLluvia = debounce(async (id, mm) => {
  const reg = ESTADO.porTramo.get(id);
  const h = ESTADO.hora;
  const base = reg?.porHora.get(h);
  const out = $("#quesi-res");
  if (!base || !out) return;
  const obs = [];
  for (let k = h; reg.porHora.has(k); k--) obs.unshift(reg.porHora.get(k));   // horas consecutivas hasta h
  if (obs.length < 4) { out.textContent = `Se necesitan 4 horas seguidas de lecturas; a las ${hh(h)} esta vía solo tiene ${obs.length}.`; return; }
  const observaciones = obs.map((p) => ({ timestamp: p.timestamp, velocidad_kmh: p.velocidad_actual_kmh, lluvia_mm: p.hora === h ? mm : p.lluvia_mm }));
  try {
    const r = await pedir("/predict", { method: "POST", body: JSON.stringify({ tramo_id: id, observaciones }) });
    if (ESTADO.sel !== id || ESTADO.hora !== h) return;
    const dp = r.probabilidad_colapso - base.probabilidad_colapso;
    out.innerHTML = `Con <b>${num(mm, 1)} mm</b>: riesgo <b class="t-${base.nivel}">${pct(base.probabilidad_colapso)}</b> → <b class="t-${r.nivel}">${pct(r.probabilidad_colapso)}</b>
      (${dp >= 0 ? "+" : ""}${num(dp * 100, 0)} pts) · velocidad ${num(base.velocidad_predicha_kmh, 0)} → <b>${num(r.velocidad_predicha_kmh, 0)} km/h</b>${r.alerta_colapso && !base.alerta ? " · <b class='t-colapso'>se activaría la alerta</b>" : ""}`;
  } catch (e) { out.innerHTML = `<span class="error">No se pudo predecir: ${esc(e.message)}</span>`; }
}, 220);

function graficoDia(reg, t) {
  if (!reg) return `<p class="vacio">Sin datos este día.</p>`;
  const W = 360, H = 176, m = { l: 30, r: 10, t: 10, b: 62 };
  const h0 = ESTADO.horas[0], h1 = ESTADO.horas.at(-1) + 1, h = ESTADO.hora;
  const pts = [...reg.porHora.values()];
  const ref = t.vel_referencia_kmh || 0;
  const umbralV = ref * (ESTADO.dia.umbral_colapso_ratio_vel || 0.5);
  const max = Math.max(ref * 1.1, ...pts.map((p) => Math.max(p.velocidad_actual_kmh, p.velocidad_real_kmh || 0, p.velocidad_predicha_kmh))) || 60;
  const x = (hr) => m.l + ((hr - h0) / (h1 - h0)) * (W - m.l - m.r);
  const yb = H - m.b;
  const y = (v) => yb - (v / max) * (yb - m.t);
  const linea = (arr) => arr.map(([a, b], i) => `${i ? "L" : "M"}${x(a).toFixed(1)} ${y(b).toFixed(1)}`).join(" ");
  // medido: velocidad en cada hora hasta h (y la de h+1 si se revela)
  const medido = pts.filter((p) => p.hora <= h).map((p) => [p.hora, p.velocidad_actual_kmh]);
  const ultimo = reg.porHora.get(h);
  if (ESTADO.revelar && ultimo) medido.push([h + 1, ultimo.velocidad_real_kmh]);
  const pred = pts.filter((p) => p.hora <= h).map((p) => [p.hora + 1, p.velocidad_predicha_kmh]);
  const ticks = [0, Math.round(max / 2 / 5) * 5, Math.round(max / 5) * 5];
  // franja de probabilidad (debajo del eje)
  const umb = ESTADO.dia.umbral_decision;
  const yp0 = H - 8, altoP = 24;
  const barras = pts.filter((p) => p.hora <= h).map((p) => {
    const bw = (W - m.l - m.r) / (h1 - h0) - 3;
    const alto = p.probabilidad_colapso * altoP;
    return `<rect x="${x(p.hora + 1) - bw / 2}" y="${yp0 - alto}" width="${bw}" height="${alto}" rx="1.5" fill="${HEX[p.nivel]}" opacity="${p.alerta && !p.colapso_actual ? 1 : .7}"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Velocidad medida y predicha durante el día en ${esc(t.corredor)}">
    ${ticks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="#1d2a38"/><text x="${m.l - 5}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}
    <rect x="${m.l}" y="${y(umbralV)}" width="${W - m.l - m.r}" height="${yb - y(umbralV)}" fill="${HEX.colapso}" opacity=".12"/>
    <line x1="${m.l}" x2="${W - m.r}" y1="${y(umbralV)}" y2="${y(umbralV)}" stroke="${HEX.colapso}" stroke-opacity=".6" stroke-dasharray="3 3"/>
    <line x1="${x(h)}" x2="${x(h)}" y1="${m.t}" y2="${yb}" stroke="#4a5d72" stroke-dasharray="2 3"/>
    <text x="${x(h)}" y="${m.t + 8}" text-anchor="middle" style="fill:#9aabbb">ahora</text>
    <path d="${linea(pred)}" fill="none" stroke="${HEX.valor}" stroke-width="2" stroke-dasharray="5 3"/>
    ${pred.map(([a, b]) => `<circle cx="${x(a)}" cy="${y(b)}" r="2.6" fill="${HEX.valor}"/>`).join("")}
    <path d="${linea(medido)}" fill="none" stroke="#e6edf3" stroke-width="2.2" stroke-linejoin="round"/>
    ${ultimo ? `<circle cx="${x(h + 1)}" cy="${y(ultimo.velocidad_predicha_kmh)}" r="5.5" fill="${HEX.valor}" stroke="#0a0f15" stroke-width="2"/>` : ""}
    ${[h0, 9, 12, 15, 18, h1].filter((v, i, a) => v >= h0 && v <= h1 && a.indexOf(v) === i).map((v) => `<text x="${x(v)}" y="${yb + 13}" text-anchor="middle">${v}h</text>`).join("")}
    <text x="${W - m.r}" y="${yp0 - altoP - 3}" text-anchor="end" style="font-size:10px">probabilidad de colapso (línea: umbral de alerta)</text>
    <line x1="${m.l}" x2="${W - m.r}" y1="${yp0 - umb * altoP}" y2="${yp0 - umb * altoP}" stroke="#9aabbb" stroke-opacity=".5" stroke-dasharray="2 2"/>
    ${barras}
    <line x1="${m.l}" x2="${W - m.r}" y1="${yp0}" y2="${yp0}" stroke="#2e3f53"/>
  </svg>`;
}

/* ---------------- Mi viaje ---------------- */
function llenarSelectorViaje() {
  const sel = $("#viaje-tramo");
  if (sel.options.length) return;
  const grupos = new Map();
  [...ESTADO.tramos.values()].sort((a, b) => a.corredor.localeCompare(b.corredor, "es")).forEach((t) => {
    if (!grupos.has(t.corredor)) grupos.set(t.corredor, []);
    grupos.get(t.corredor).push(t);
  });
  sel.innerHTML = [...grupos].map(([c, ts]) => `<optgroup label="${esc(c)}">${ts.map((t) => `<option value="${esc(t.tramo_id)}">${esc(t.inicio)} → ${esc(t.fin)} (${esc(SENTIDO[t.sentido] || t.sentido)})</option>`).join("")}</optgroup>`).join("");
}

function pintarViaje() {
  if (ESTADO.vista !== "viaje") return;
  llenarSelectorViaje();
  const id = ESTADO.sel;
  if (id) $("#viaje-tramo").value = id;
  const out = $("#viaje-resultado");
  const t = ESTADO.tramos.get(id);
  const p = ESTADO.porTramo.get(id)?.porHora.get(ESTADO.hora);
  if (!t) { out.innerHTML = `<p class="vacio">Elige tu recorrido.</p>`; return; }
  if (!p) { out.innerHTML = `<p class="vacio">No hay lecturas de esta vía a las ${hh(ESTADO.hora)}. Prueba otra hora.</p>`; return; }
  const h = ESTADO.hora;
  const ahora = t.longitud_km / p.velocidad_actual_kmh * 60;
  const luego = p.tiempo_viaje_predicho_min;
  const dif = luego - ahora;
  const libre = t.vel_referencia_kmh ? t.longitud_km / t.vel_referencia_kmh * 60 : null;
  let clase = "", accion, texto;
  if (p.alerta && !(dif >= 1 && luego >= ahora * 1.15)) {
    clase = "espera"; accion = "Evita esta vía si puedes";
    texto = `Va a seguir colapsada a las ${hh(h + 1)}: unos <b>${num(luego, 0)} min</b>${libre ? `, frente a ${num(libre, 0)} min con la vía libre` : ""}. Si tienes una ruta alterna, úsala.`;
  } else if (dif >= 1 && luego >= ahora * 1.15) {
    clase = "sal"; accion = "Sal ahora";
    texto = `Si esperas, a las ${hh(h + 1)} este trayecto tomará unos <b>${num(dif, 0)} min más</b>${p.alerta ? " y la vía puede colapsar" : ""}.`;
  } else if (dif <= -1 && luego <= ahora * 0.87) {
    clase = "espera"; accion = "Si puedes, espera";
    texto = `A las ${hh(h + 1)} se espera que la vía se despeje: <b>${num(-dif, 0)} min menos</b> de trayecto.`;
  } else {
    accion = "Sal cuando quieras";
    texto = `El tiempo de viaje casi no va a cambiar en la próxima hora (${dif >= 0 ? "+" : "−"}${num(Math.abs(dif), 1)} min).`;
  }
  out.innerHTML = `
    <div class="consejo ${clase}"><p class="accion">${accion}</p><p>${texto}</p></div>
    <div class="tiempos">
      <div><span>Si sales a las ${hh(h)}</span><b>${num(ahora, 0)}</b> <small>min</small></div>
      <span class="flecha">→</span>
      <div><span>Si sales a las ${hh(h + 1)}</span><b style="color:${clase === "sal" ? "var(--colapso)" : "var(--valor)"}">${num(luego, 0)}</b> <small>min</small></div>
    </div>
    ${p.alerta ? `<div class="veredicto colapso"><p><b class="t-colapso">Alerta de colapso</b> a las ${hh(h + 1)}: probabilidad ${pct(p.probabilidad_colapso)}.</p></div>` : ""}
    ${ESTADO.revelar ? `<p class="nota">Lo que de verdad tardó a las ${hh(h + 1)}: <b>${num(p.tiempo_viaje_real_min, 1)} min</b> (predicción: ${num(luego, 1)} min).</p>` : ""}
    <p class="nota">${esc(t.corredor)}, ${esc(t.inicio)} → ${esc(t.fin)}, ${num(t.longitud_km)} km. El tiempo de viaje sale de la velocidad predicha por el modelo para la próxima hora.</p>`;
}

/* ---------------- selector de días ---------------- */
function pintarCalendario() {
  if (!ESTADO.dias.length) return;
  const test = ESTADO.dias.filter((d) => d.periodo === "test");
  const drift = ESTADO.dias.filter((d) => d.periodo === "drift");
  const masSinAviso = diaDestacado();
  const lluvioso = [...test].filter((d) => d.colapsos_reales >= 20).sort((a, b) => b.lluvia_mm - a.lluvia_mm)[0];
  const habiles = test.filter((d) => !d.festivo && fechaDe(d.fecha).getDay() % 6 !== 0).sort((a, b) => a.colapsos_reales - b.colapsos_reales);
  const tipico = habiles[Math.floor(habiles.length / 2)];
  const holdout = [...drift].filter((d) => !d.festivo && fechaDe(d.fecha).getDay() % 6 !== 0)
    .sort((a, b) => b.colapsos_sin_aviso - a.colapsos_sin_aviso)[0] || drift[0];
  const anioHoldout = holdout?.fecha?.slice(0, 4) || "";
  const atajos = [
    [masSinAviso, "Más colapsos sin aviso", `${masSinAviso?.colapsos_sin_aviso} colapsos empezaron en vías que fluían`],
    [lluvioso, "Día de lluvia", `${num(lluvioso?.lluvia_mm)} mm y ${lluvioso?.colapsos_reales} colapsos`],
    [tipico, "Día hábil típico", `${tipico?.colapsos_reales} colapsos, la mediana del periodo`],
    [holdout, `Holdout ${anioHoldout}`, "Periodo que el modelo no usó para elegir", "drift"],
  ].filter(([d]) => d);
  $("#atajos").innerHTML = atajos.map(([d, tit, sub, cls]) => `<button type="button" class="atajo ${cls || ""}" data-fecha="${d.fecha}"><b>${tit}</b><span>${esc(fechaLarga(d.fecha))}<br>${esc(sub)}</span></button>`).join("");

  const maxT = Math.max(1, ...test.map((d) => d.colapsos_sin_aviso));
  const maxD = Math.max(1, ...drift.map((d) => d.colapsos_sin_aviso));
  const porMes = new Map();
  ESTADO.dias.forEach((d) => { const k = d.fecha.slice(0, 7); if (!porMes.has(k)) porMes.set(k, []); porMes.get(k).push(d); });
  $("#calendario").innerHTML = [...porMes].map(([k, ds]) => {
    const [a, mth] = k.split("-").map(Number);
    const primero = (new Date(a, mth - 1, 1).getDay() + 6) % 7;     // lunes = 0
    const nDias = new Date(a, mth, 0).getDate();
    const mapa = new Map(ds.map((d) => [Number(d.fecha.slice(8)), d]));
    const celdas = [];
    for (let i = 0; i < primero; i++) celdas.push(`<span class="celda vacia"></span>`);
    for (let dd = 1; dd <= nDias; dd++) {
      const d = mapa.get(dd);
      if (!d) { celdas.push(`<span class="celda vacia" style="opacity:.3">${dd}</span>`); continue; }
      const i = d.colapsos_sin_aviso / (d.periodo === "test" ? maxT : maxD);
      celdas.push(`<button type="button" class="celda ${d.periodo === "drift" ? "drift" : ""} ${d.lluvia_mm >= 5 ? "llueve" : ""} ${ESTADO.dia?.fecha === d.fecha ? "act" : ""}"
        style="--i:${(0.12 + i * 0.88).toFixed(2)}" data-fecha="${d.fecha}"
        title="${esc(fechaLarga(d.fecha))}: ${d.colapsos_reales} colapsos (${d.colapsos_sin_aviso} sin aviso), lluvia ${num(d.lluvia_mm)} mm">${dd}</button>`);
    }
    const esDrift = ds[0].periodo === "drift";
    return `<div class="mes"><h4>${MESES[mth - 1]} ${a}${esDrift ? "<small>holdout</small>" : ""}</h4>
      <div class="mes-grid">${["L", "M", "M", "J", "V", "S", "D"].map((x) => `<span class="ds">${x}</span>`).join("")}${celdas.join("")}</div></div>`;
  }).join("");
  $$("#dlg-dias [data-fecha]").forEach((b) => b.addEventListener("click", () => { $("#dlg-dias").close(); cargarDia(b.dataset.fecha); }));
}

/* ---------------- en vivo ---------------- */
const horaDe = (iso) => String(iso || "").slice(11, 16);

async function cargarEnVivo() {
  try { ESTADO.envivo = await pedir("/envivo"); }
  catch (e) {
    $("#envivo-aviso").className = "envivo-aviso mal";
    $("#envivo-aviso").innerHTML = `No se pudo consultar el estado en vivo: ${esc(e.message)}`;
    return;
  }
  if (ESTADO.vista === "envivo" || ESTADO.vista === "navegar") pintarEnVivo();
}

async function consultarEnVivo() {
  const b = $("#btn-envivo");
  b.disabled = true; b.textContent = "Consultando proveedores…";
  try { await pedir("/envivo/recolectar", { method: "POST" }); }
  catch (e) { $("#envivo-aviso").className = "envivo-aviso mal"; $("#envivo-aviso").textContent = `Error al consultar: ${e.message}`; }
  finally { b.disabled = false; b.textContent = "↻ Consultar ahora"; }
  await cargarEnVivo();
}

function chipFuente(p) {
  if (p.nombre === "open_meteo") {
    return `<span class="fuente ${p.ultimo_ok ? "ok" : "espera"}" title="Lluvia horaria. Última actualización: ${esc(horaDe(p.ultimo_ok) || "aún no")}">Open-Meteo <small>lluvia</small></span>`;
  }
  let cls = "espera", sub = `${p.usadas_hoy}/${p.cupo_diario} hoy`, tit = `Cada ${p.intervalo_min} min · cupo diario ${p.cupo_diario} consultas`;
  if (!p.clave_configurada) { cls = "off"; sub = "sin clave"; tit = `Falta ${p.variable} en el archivo .env`; }
  else if (p.pausado_hasta) { cls = "mal"; sub = `pausado hasta ${horaDe(p.pausado_hasta)}`; tit = p.ultimo_error || "Pausado"; }
  else if (p.ultimo_ok) { cls = "ok"; tit += ` · última lectura ${horaDe(p.ultimo_ok)}`; }
  if (p.ultimo_error && !p.pausado_hasta) tit += ` · último error: ${p.ultimo_error}`;
  return `<span class="fuente ${cls}" title="${esc(tit)}">${esc(p.titulo)} <small>${esc(sub)}</small></span>`;
}

function avisoEnVivo(d) {
  const conClave = d.proveedores.filter((p) => p.variable && p.clave_configurada);
  const r = d.resumen;
  if (!conClave.length) {
    return ["mal", `<b>Falta configurar las claves.</b> Copia <code>.env.example</code> como <code>.env</code>, pega al menos una clave (<code>TOMTOM_API_KEY</code>, <code>HERE_API_KEY</code> o <code>GOOGLE_MAPS_API_KEY</code>) y reinicia la API.`];
  }
  if (conClave.every((p) => p.pausado_hasta)) {
    return ["mal", `<b>Todos los proveedores están pausados</b> (cuota agotada o clave rechazada). Pasa el mouse sobre cada fuente para ver el motivo.`];
  }
  if (!d.en_horario && !r.listos) return ["", `Fuera del horario de recolección (${d.horario[0]} a ${d.horario[1]} h). Puedes forzar una consulta con el botón.`];
  if (!r.listos) {
    const max = Math.max(0, ...d.tramos.map((t) => t.horas_historia));
    const n = d.tramos[0]?.horas_necesarias || 4;
    return ["", `<b>Recolectando historia.</b> El modelo necesita ${n} horas seguidas de lecturas por vía; la que más lleva tiene ${max}. Deja la API encendida y vuelve más tarde.<span class="progreso"><i style="width:${Math.round(Math.min(1, max / n) * 100)}%"></i></span>`];
  }
  if (!d.recolector_activo) return ["", `El recolector automático está apagado: las lecturas solo se actualizan con el botón <b>Consultar ahora</b>.`];
  return ["", ""];
}

function filaEnVivo(f, t, i) {
  const sel = ESTADO.sel === f.tramo_id;
  const nom = `<span class="nom">${esc(corto(t.corredor))}<small>${FLECHA[t.sentido] || ""} ${esc(t.inicio)} → ${esc(t.fin)}</small></span>`;
  if (f.estado !== "ok") {
    const det = f.estado === "recolectando" ? `Recolectando: ${f.horas_historia} de ${f.horas_necesarias} h de historia`
      : f.estado === "desactualizado" ? `Última lectura a las ${horaDe(f.ultima_hora)}` : "Sin lecturas todavía";
    return `<li><button type="button" class="fila sin-dato" data-id="${esc(f.tramo_id)}" aria-pressed="${sel}"><span class="pos">—</span>${nom}<span class="prob">—</span><span class="det">${det}</span></button></li>`;
  }
  const temprano = f.alerta && !f.colapso_actual;
  const fuentes = sel ? `<span class="fuentes-fila">Fuentes: ${esc(f.proveedores.join(", "))} · medido ${num(f.velocidad_proveedor_kmh, 0)} km/h · congestión ${pct(1 - f.indice_congestion)}${f.sentido_verificado ? "" : " · sentido sin confirmar"}</span>` : "";
  return `<li><button type="button" class="fila" data-id="${esc(f.tramo_id)}" aria-pressed="${sel}">
    <span class="pos">${i + 1}</span>${nom}
    <span class="prob ${f.nivel}">${pct(f.probabilidad_colapso)}</span>
    <span class="barra-p"><i class="bg-${f.nivel}" style="width:${f.probabilidad_colapso * 100}%"></i></span>
    <span class="det">ahora ${num(f.velocidad_actual_kmh, 0)} → ${num(f.velocidad_predicha_kmh, 0)} km/h · ${num(f.tiempo_viaje_predicho_min, 0)} min
      ${temprano ? `<i class="etq-temprano">AVISO TEMPRANO</i>` : ""}${f.alerta && !temprano ? `<span class="res mal">colapso en curso</span>` : ""}${fuentes}</span>
  </button></li>`;
}

function pintarEnVivo() {
  document.body.classList.remove("con-detalle");
  $("#detalle").hidden = true;
  const d = ESTADO.envivo;
  if (!d) { $("#envivo-hora").textContent = "Cargando…"; return; }
  const hoy = d.hora_local.slice(0, 10);
  const horaTxt = `${fechaLarga(hoy)} · ${horaDe(d.hora_local)} → predicción para las ${horaDe(d.prediccion_para)}`;
  $("#envivo-hora").textContent = horaTxt;
  $("#nav-hora").textContent = horaTxt;
  $("#envivo-fuentes").innerHTML = d.proveedores.map(chipFuente).join("");
  const [cls, html] = avisoEnVivo(d);
  $("#envivo-aviso").className = `envivo-aviso ${cls}`;
  $("#envivo-aviso").innerHTML = html;
  $("#envivo-nota").textContent = `${d.resumen.listos} de ${d.resumen.tramos} vías con predicción · ${d.resumen.alertas} alertas, ${d.resumen.avisos_tempranos} avisos tempranos. ${d.advertencia}`;

  const orden = { ok: 0, recolectando: 1, desactualizado: 2, sin_datos: 3 };
  const filas = [...d.tramos].filter((f) => ESTADO.tramos.has(f.tramo_id)).sort((a, b) => (orden[a.estado] - orden[b.estado])
    || ((b.probabilidad_colapso ?? -1) - (a.probabilidad_colapso ?? -1)) || (b.horas_historia - a.horas_historia));
  let pos = 0;
  $("#envivo-ranking").innerHTML = filas.map((f) => filaEnVivo(f, ESTADO.tramos.get(f.tramo_id), f.estado === "ok" ? pos++ : 0)).join("");
  $$("#envivo-ranking .fila").forEach((b) => b.addEventListener("click", () => seleccionar(b.dataset.id)));

  filas.forEach((f) => {
    const t = ESTADO.tramos.get(f.tramo_id), m = ESTADO.marcadores.get(f.tramo_id);
    if (!m) return;
    const p = f.estado === "ok" ? f : null;
    m.setIcon(icono(t, p));
    m.setZIndexOffset(p ? Math.round(p.probabilidad_colapso * 1000) + (ESTADO.sel === f.tramo_id ? 2000 : 0) : -500);
    m.setTooltipContent(p
      ? `<b>${esc(corto(t.corredor))} ${FLECHA[t.sentido] || ""}</b><br>Riesgo de colapso a las ${horaDe(d.prediccion_para)}: <b class="t-${p.nivel}">${pct(p.probabilidad_colapso)}</b><br>Ahora ${num(p.velocidad_actual_kmh, 0)} km/h → en 1 h ${num(p.velocidad_predicha_kmh, 0)} km/h`
      : `<b>${esc(corto(t.corredor))} ${FLECHA[t.sentido] || ""}</b><br>${f.estado === "recolectando" ? `Recolectando historia (${f.horas_historia} de ${f.horas_necesarias} h)` : "Sin predicción todavía"}`);
  });
  $("#lluvia").style.opacity = String(Math.min(1, (d.lluvia_mm || 0) / 4) * 0.9);
}

/* ---------------- rutas sugeridas ---------------- */
const COLOR_NIVEL = { normal: HEX.normal, precaucion: HEX.precaucion, colapso: HEX.colapso };

function miUbicacion() {
  const inp = $("#ruta-origen");
  if (!navigator.geolocation) { inp.placeholder = "Tu navegador no da la ubicación"; return; }
  inp.value = ""; inp.placeholder = "Buscando tu ubicación…";
  navigator.geolocation.getCurrentPosition(
    (p) => { inp.value = `${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`; inp.placeholder = "Dirección o lugar"; },
    () => { inp.placeholder = "No se pudo obtener tu ubicación: escríbela"; },
    { enableHighAccuracy: true, timeout: 10000 });
}

async function buscarRuta() {
  const origen = $("#ruta-origen").value.trim(), destino = $("#ruta-destino").value.trim();
  if (!origen || !destino) return;
  const b = $("#btn-ruta");
  b.disabled = true; b.textContent = "Buscando rutas…";
  try {
    ESTADO.ruta = await pedir("/envivo/ruta", { method: "POST", body: JSON.stringify({ origen, destino }) });
    ESTADO.rutaSel = 0;
    pintarRutas(); dibujarRutas(true);
  } catch (e) {
    ESTADO.ruta = null; quitarCapaRutas();
    $("#nav-decision").innerHTML = `<p class="ruta-mensaje mal">${esc(e.message)}</p>`;
    $("#ruta-resultado").innerHTML = "";
  } finally { b.disabled = false; b.textContent = "Ver rutas"; $("#ruta-limpiar").hidden = !ESTADO.ruta; }
}

function limpiarRuta() {
  ESTADO.ruta = null; quitarCapaRutas();
  $("#ruta-resultado").innerHTML = "";
  $("#nav-decision").innerHTML = `<p id="nav-vacio">Escribe de dónde sales y a dónde vas. Comparamos la ruta más rápida de ahora con la que evita un colapso que todavía no se ve.</p>`;
  $("#ruta-limpiar").hidden = true;
}

function viaRuta(x) {
  const cls = x.estado === "ok" ? x.nivel : "nd";
  const dato = x.estado === "ok" ? pct(x.probabilidad_colapso) : "sin predicción";
  return `<span class="via ${cls}" title="Riesgo de colapso en la próxima hora">${esc(corto(x.corredor))} ${FLECHA[x.sentido] || ""} ${dato}</span>`;
}

function nivelRuta(r) {
  const orden = { normal: 1, precaucion: 2, colapso: 3 };
  let nivel = null, rank = 0;
  for (const t of r.tramos || []) {
    if ((orden[t.nivel] || 0) > rank) { nivel = t.nivel; rank = orden[t.nivel]; }
  }
  return nivel;
}

function pintarRutas() {
  const d = ESTADO.ruta;
  if (!d) return;
  const rec = d.rutas.find((r) => r.recomendada);
  const rap = d.rutas.find((r) => r.mas_rapida);
  let vs = "";
  if (rec && rap && rec !== rap) {
    const extra = Math.round(rec.duracion_min - rap.duracion_min);
    vs = `<span class="nav-vs">El tráfico de ahora elegiría <b>${esc(rap.descripcion)}</b> (${num(rap.duracion_min, 0)} min). La recomendación evita un colapso que todavía no se ve${extra > 0 ? ` y suma unos ${extra} min` : ""}.</span>`;
  }
  $("#nav-decision").innerHTML = `<p>${esc(d.mensaje)}</p>${vs}
    <span class="nav-leyenda"><span><i class="punto normal"></i>fluida en 1 h</span><span><i class="punto precaucion"></i>precaución</span><span><i class="punto colapso"></i>va a colapsar</span>
    <span class="ruta-cupo">Predicción para las ${horaDe(d.prediccion_para)} · búsquedas hoy ${d.busquedas_hoy}/${d.cupo_busquedas}</span></span>`;
  // sin ninguna predicción la recomendación es solo la más rápida: no se puede decir que evite un colapso
  const conPrediccion = d.rutas.some((r) => r.tramos.some((x) => x.estado === "ok"));
  $("#ruta-resultado").innerHTML = d.rutas.map((r, i) => {
    const trafico = Math.round(r.duracion_min - r.duracion_sin_trafico_min);
    const nivel = nivelRuta(r);
    const etqRec = !r.recomendada || !conPrediccion ? "" : r.mas_rapida ? "RECOMENDADA" : "EVITA EL COLAPSO";
    return `<button type="button" class="ruta-op" data-i="${i}" data-nivel="${nivel || ""}" aria-pressed="${i === ESTADO.rutaSel}">
      <span class="eta">${num(r.duracion_min, 0)}<small>min</small></span>
      <span class="cab">${etqRec ? `<i class="etq rec">${etqRec}</i>` : ""}${r.mas_rapida ? `<i class="etq rap">AHORA MÁS RÁPIDA</i>` : ""}
        <b>${esc(r.descripcion)}</b></span>
      <span>${num(r.distancia_km, 1)} km${trafico > 0 ? ` · +${trafico} min por el tráfico de este momento` : " · sin demora ahora"}</span>
      <span class="vias">${r.tramos.length ? r.tramos.map(viaRuta).join("") : `<span class="via nd">no pasa por vías vigiladas</span>`}</span>
    </button>`;
  }).join("");
  $$("#ruta-resultado .ruta-op").forEach((b) => b.addEventListener("click", () => {
    ESTADO.rutaSel = Number(b.dataset.i); pintarRutas(); dibujarRutas(true);
  }));
}

function quitarCapaRutas() { if (ESTADO.capaRutas) { ESTADO.capaRutas.remove(); ESTADO.capaRutas = null; } }

function distMetros(a, b) {
  const lat = ((a[0] + b[0]) / 2) * Math.PI / 180;
  const esc = Math.cos(lat) * 111320;
  return Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * esc);
}

function segmentosRuta(r) {
  const orden = { normal: 1, precaucion: 2, colapso: 3 };
  const anclas = (r.tramos || []).map((x) => {
    const t = ESTADO.tramos.get(x.tramo_id);
    return t && x.estado === "ok" ? { lat: t.lat, lon: t.lon, nivel: x.nivel } : null;
  }).filter(Boolean);
  const pts = r.puntos, niveles = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const mid = [(pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2];
    let nivel = null, rank = 0;
    for (const a of anclas) {
      if (distMetros(mid, [a.lat, a.lon]) <= 180 && (orden[a.nivel] || 0) > rank) { nivel = a.nivel; rank = orden[a.nivel]; }
    }
    niveles.push(nivel);
  }
  const trozos = [];
  let i = 0;
  while (i < niveles.length) {
    let j = i;
    while (j + 1 < niveles.length && niveles[j + 1] === niveles[i]) j++;
    trozos.push({ nivel: niveles[i], puntos: pts.slice(i, j + 2) });
    i = j + 1;
  }
  return trozos;
}

function dibujarRutas(encuadre = false) {
  const d = ESTADO.ruta;
  if (!d || !ESTADO.mapa || ESTADO.vista !== "navegar") return;
  quitarCapaRutas();
  const capa = L.layerGroup();
  const elegir = (i) => { ESTADO.rutaSel = i; pintarRutas(); dibujarRutas(); };
  const orden = d.rutas.map((r, i) => i).sort((a, b) => (a === ESTADO.rutaSel) - (b === ESTADO.rutaSel));
  orden.forEach((i) => {
    const r = d.rutas[i], sel = i === ESTADO.rutaSel;
    const tip = `${esc(r.descripcion)} · ${num(r.duracion_min, 0)} min`;
    if (!sel) {
      capa.addLayer(L.polyline(r.puntos, { color: colorPeor(r), weight: 5, opacity: .4 })
        .on("click", () => elegir(i)).bindTooltip(tip, { className: "tip", sticky: true }));
      return;
    }
    capa.addLayer(L.polyline(r.puntos, { color: "#071018", weight: 12, opacity: .85, interactive: false }));
    segmentosRuta(r).forEach((s) => {
      const nivel = s.nivel;
      capa.addLayer(L.polyline(s.puntos, {
        color: nivel ? HEX[nivel] : "#d5e2ee", weight: 6, opacity: .96,
        dashArray: nivel === "colapso" ? "12 10" : null,
        className: nivel === "colapso" ? "ruta-riesgo" : "",
      }).on("click", () => elegir(i)).bindTooltip(tip, { className: "tip", sticky: true }));
    });
  });
  const r = d.rutas[ESTADO.rutaSel];
  // vías vigiladas por las que pasa la ruta elegida, con un aro del color de su riesgo
  r.tramos.forEach((x) => {
    const t = ESTADO.tramos.get(x.tramo_id);
    if (!t) return;
    capa.addLayer(L.circleMarker(posicion(t), { radius: 16, color: COLOR_NIVEL[x.nivel] || HEX.hoy, weight: 3, fill: false, opacity: .9, interactive: false }));
  });
  const ini = r.puntos[0], fin = r.puntos[r.puntos.length - 1];
  capa.addLayer(L.circleMarker(ini, { radius: 7, color: "#fff", weight: 2, fillColor: HEX.valor, fillOpacity: 1 }).bindTooltip("Origen", { className: "tip" }));
  capa.addLayer(L.circleMarker(fin, { radius: 7, color: "#fff", weight: 2, fillColor: HEX.colapso, fillOpacity: 1 }).bindTooltip("Destino", { className: "tip" }));
  capa.addTo(ESTADO.mapa);
  ESTADO.capaRutas = capa;
  if (encuadre) {
    ESTADO.mapa.fitBounds(L.latLngBounds(r.puntos), window.innerWidth > 980
      ? { paddingTopLeft: [40, 180], paddingBottomRight: [40, 250] }
      : { padding: [24, 24] });
  }
}

function colorPeor(r) {
  const nivel = nivelRuta(r);
  return nivel ? HEX[nivel] : "#8aa0b5";
}

/* ---------------- evidencia + actualización ARS ---------------- */
function pintarEvidenciaValor() {
  const v = ESTADO.valor;
  if (!v) return;
  const r = v.regla_reactiva;
  const mejora = v.mae_tiempo_viaje_perfil_min ? 1 - v.mae_tiempo_viaje_min / v.mae_tiempo_viaje_perfil_min : null;
  $("#ev-valor").innerHTML = `
    <div class="ev-tarjeta estrella"><b>${pct(v.pct_colapsos_sin_aviso)}</b><span>de los colapsos empieza en una vía que fluía bien una hora antes</span><small>${v.colapsos_sin_aviso.toLocaleString("es-CO")} de ${v.colapsos_reales.toLocaleString("es-CO")} en ${v.dias} días: invisibles para el monitoreo en tiempo real</small></div>
    <div class="ev-tarjeta estrella"><b>${v.anticipados.toLocaleString("es-CO")}</b><span>de esos colapsos anticipados con 1 hora de ventaja</span><small>${pct(v.pct_anticipados)} de los colapsos sin aviso · monitoreo actual: 0</small></div>
    <div class="ev-tarjeta"><b>${pct(v.recall)}</b><span>de los colapsos detectados (regla actual: ${pct(r.recall)})</span><small>Alertas que aciertan: ${pct(v.precision)} frente a ${pct(r.precision)} · ${num(v.alertas_por_dia, 0)} alertas al día en toda la red</small></div>
    <div class="ev-tarjeta"><b>${num(v.mae_tiempo_viaje_min, 2)} min</b><span>de error al predecir el tiempo de viaje de un tramo</span><small>Promedio histórico: ${num(v.mae_tiempo_viaje_perfil_min, 2)} min · ${pct(mejora)} más preciso</small></div>`;
}

async function cargarModelos() {
  let d;
  try { d = await pedir("/modelos"); } catch (e) { $("#ganadores").innerHTML = `<p class="error">No se pudo cargar la información de los modelos: ${esc(e.message)}</p>`; return; }
  const v = d.modelo_velocidad || {}, c = d.modelo_colapso || {};
  if (d.fuente_sensores) {
    $("#chip-texto").textContent = "ARS 2019–2026 · holdout 2026";
    $("#chip-datos").hidden = false;
    $("#ev-contexto").textContent = `${NOMBRES_MODELO[v.nombre] || v.nombre} + ${NOMBRES_MODELO[c.nombre] || c.nombre}. ${d.fuente_sensores}`;
  }
  $("#ganadores").innerHTML = `
    <article class="ganador"><p class="tarea">Velocidad dentro de 1 hora</p><h3>${esc(NOMBRES_MODELO[v.nombre] || v.nombre)}</h3>
      <div class="nums"><div><span>Error medio (MAE)</span><b>${num(v.test_mae_kmh, 2)} km/h</b></div><div><span>Error relativo (WAPE)</span><b>${pct(v.test_wape, 1)}</b></div></div>
      <ul>${(v.razones || []).map((r) => `<li>${esc(r)}</li>`).join("")}</ul></article>
    <article class="ganador"><p class="tarea">Alerta de colapso dentro de 1 hora</p><h3>${esc(NOMBRES_MODELO[c.nombre] || c.nombre)}</h3>
      <div class="nums"><div><span>Colapsos detectados</span><b>${pct(c.test_recall)}</b></div><div><span>Alertas correctas</span><b>${pct(c.test_precision)}</b></div><div><span>PR-AUC</span><b>${num(c.test_pr_auc, 3)}</b></div></div>
      <ul>${(c.razones || []).map((r) => `<li>${esc(r)}</li>`).join("")}</ul></article>`;
  const filas = d.comparacion || [];
  const tabla = (sel, tarea, cols) => {
    const rows = filas.filter((f) => f.tarea === tarea);
    $(sel).innerHTML = `<thead><tr><th>Modelo</th>${cols.map((k) => `<th>${k[1]}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((f) => `<tr class="${f.seleccionado ? "elegido" : ""}"><td>${esc(NOMBRES_MODELO[f.modelo] || f.modelo)}${f.seleccionado ? " ✔" : ""}</td>${cols.map((k) => `<td>${k[2](f[k[0]])}</td>`).join("")}</tr>`).join("")}</tbody>`;
  };
  const kmh = (x) => num(x, 2), p1 = (x) => pct(x, 1), p3 = (x) => num(x, 3), ms = (x) => num(x, 1);
  tabla("#tabla-velocidad", "velocidad", [["test_mae", "MAE (km/h)", kmh], ["test_rmse", "RMSE", kmh], ["test_wape", "WAPE", p1], ["test_mae_pico", "MAE pico", kmh], ["drift_mae", "MAE holdout", kmh], ["latencia_ms_1000", "ms/1.000", ms]]);
  tabla("#tabla-colapso", "colapso", [["test_pr_auc", "PR-AUC", p3], ["test_recall_colapso", "Recall", p1], ["test_precision_colapso", "Precisión", p1], ["test_falsas_alarmas_por_dia", "Falsas al./día", (x) => num(x, 1)], ["drift_pr_auc", "PR-AUC holdout", p3], ["latencia_ms_1000", "ms/1.000", ms]]);
}

function cardArs(resumen, etiqueta, nueva) {
  if (!resumen) return `<article class="ars-card"><p class="etiq">${esc(etiqueta)}</p><p class="vacio">Sin respaldo del modelo anterior.</p></article>`;
  const filas = resumen.filas || {};
  const total = (filas.train || 0) + (filas.valid || 0) + (filas.test || 0) + (filas.drift || 0);
  return `<article class="ars-card ${nueva ? "nueva" : ""}">
    <p class="etiq">${esc(etiqueta)}</p>
    <h3>${esc(NOMBRES_MODELO[resumen.modelo_velocidad] || resumen.modelo_velocidad || "—")} + ${esc(NOMBRES_MODELO[resumen.modelo_colapso] || resumen.modelo_colapso || "—")}</h3>
    <div class="ars-metricas">
      <div><span>MAE velocidad</span><b>${num(resumen.mae_kmh, 2)} km/h</b></div>
      <div><span>WAPE</span><b>${pct(resumen.wape, 1)}</b></div>
      <div><span>Recall colapso</span><b>${pct(resumen.recall)}</b></div>
      <div><span>PR-AUC</span><b>${num(resumen.pr_auc, 3)}</b></div>
      <div><span>Filas usadas</span><b>${total ? total.toLocaleString("es-CO") : "—"}</b></div>
      <div><span>Precisión alerta</span><b>${pct(resumen.precision)}</b></div>
    </div>
  </article>`;
}

function pintarLineaCortes(cortes) {
  const c = cortes || {};
  const bloques = [
    ["train", "Entrenamiento", c.fecha_inicio, c.corte_validacion],
    ["valid", "Validación", c.corte_validacion, c.corte_test],
    ["test", "Prueba", c.corte_test, c.fin_test],
    ["drift", "Holdout", c.fin_test, c.fin_drift],
  ];
  $("#ars-linea").innerHTML = bloques.map(([cls, tit, a, b]) => {
    const rango = a && b ? `${fechaCorta(String(a).slice(0, 10))} → ${fechaCorta(String(b).slice(0, 10))}` : "—";
    return `<div class="corte ${cls}"><span class="etiq">${esc(tit)}</span><b>${esc(rango)}</b><span>${cls === "drift" ? "No usado para elegir el modelo" : cls === "test" ? "Métricas que ves en Evidencia" : "Ajuste de hiperparámetros"}</span></div>`;
  }).join("");
}

async function cargarReentrenamiento() {
  try {
    ESTADO.reent = await pedir("/reentrenamiento");
    pintarArs();
  } catch { /* la vista queda vacía hasta que se abra con error */ }
}

function pintarArs() {
  const d = ESTADO.reent;
  if (!d) {
    $("#ars-versus").innerHTML = `<p class="vacio">Cargando comparación del reentrenamiento…</p>`;
    return;
  }
  const nar = d.narrativa || {};
  if (nar.titulo) $("#vista-ars .ev-cab h2").textContent = nar.titulo;
  pintarLineaCortes(d.actual?.cortes);
  $("#ars-versus").innerHTML = `${cardArs(d.antes, nar.antes_etiqueta || "Antes", false)}<div class="ars-vs">VS</div>${cardArs(d.actual, nar.actual_etiqueta || "Ahora", true)}`;
  $("#ars-puntos").innerHTML = (nar.puntos || []).map((p) => `<li>${esc(p)}</li>`).join("");
  if (d.actual?.fuente_sensores) $("#ars-bajada").textContent = d.actual.fuente_sensores;
}

function cargarGaleria() {
  const g = $("#galeria");
  Object.entries(FIGURAS).forEach(([archivo, [titulo, texto]]) => {
    const fig = document.createElement("figure");
    fig.className = "figura";
    fig.innerHTML = `<button type="button" aria-label="Ampliar: ${esc(titulo)}"><img src="/figuras/${archivo}" alt="${esc(titulo)}" loading="lazy"></button><figcaption><b>${esc(titulo)}</b>${esc(texto)}</figcaption>`;
    fig.querySelector("img").addEventListener("error", () => fig.remove());
    fig.querySelector("button").addEventListener("click", () => {
      $("#visor-img").src = `/figuras/${archivo}`; $("#visor-img").alt = titulo;
      $("#visor-texto").textContent = `${titulo}. ${texto}`;
      $("#visor").showModal();
    });
    g.appendChild(fig);
  });
}

/* ---------------- historia (modo presentación) ---------------- */
function pasosHistoria() {
  const v = ESTADO.valor;
  const dest = ESTADO.dias.length ? diaDestacado() : null;
  const re = ESTADO.reent?.actual;
  const rangoPrueba = v?.desde && v?.hasta
    ? `${fechaCorta(v.desde.slice(0, 10))} → ${fechaCorta(v.hasta.slice(0, 10))}`
    : "periodo de prueba 2025";
  return [
    { sobre: "El problema", cifra: "6,49 M", roja: true, titulo: "de viajes se hacen cada día hábil en el Valle de Aburrá",
      texto: "Y cada vía principal pasa, en promedio, 1 de cada 7 horas laborables colapsada (2025). Hoy la congestión se gestiona cuando ya ocurrió: el centro de control ve la vía en rojo y reacciona tarde.",
      fuente: "Encuesta Origen-Destino 2025 (AMVA) · cámaras ARS/CCTV del Observatorio de Movilidad" },
    { sobre: "El punto ciego", cifra: v ? pct(v.pct_colapsos_sin_aviso) : "—", roja: true,
      titulo: "de los colapsos empieza en una vía que una hora antes circulaba bien",
      texto: "Quien solo mira el tráfico en tiempo real no tiene ninguna señal de esos colapsos. Para él, llegan sin aviso.",
      fuente: v ? `${v.colapsos_sin_aviso.toLocaleString("es-CO")} de ${v.colapsos_reales.toLocaleString("es-CO")} colapsos · ${v.dias} días reales (${rangoPrueba})` : "" },
    { sobre: "Nuevos datos", cifra: "2019→26", titulo: "Cámaras ARS: siete años de sensores, holdout en 2026",
      texto: re
        ? `Campeones actuales: ${NOMBRES_MODELO[re.modelo_velocidad] || re.modelo_velocidad} (velocidad) y ${NOMBRES_MODELO[re.modelo_colapso] || re.modelo_colapso} (colapso). MAE ${num(re.mae_kmh, 2)} km/h · recall ${pct(re.recall)}.`
        : "El modelo ya no se apoya solo en la serie GT hasta 2020: ahora aprende de la red ARS hasta 2026.",
      fuente: "Reentrenamiento con Observatorio de Movilidad · vista Actualización" },
    { sobre: "La solución", cifra: "1 hora", titulo: "de ventaja: MobiPredict predice qué vía va a colapsar y avisa antes de que pase",
      comp: v ? [["Monitoreo actual", "0", "colapsos sin aviso anticipados"], ["MobiPredict", String(v.anticipados), `colapsos sin aviso anticipados (${pct(v.pct_anticipados)})`]] : null,
      fuente: `Periodo de prueba (${rangoPrueba}): datos que el modelo nunca vio al entrenar` },
    { sobre: "Míralo funcionar", cifra: null, titulo: "Repetimos un día real, hora a hora, como si MobiPredict hubiera estado operando",
      texto: dest ? `${fechaLarga(dest.fecha)}: el día con más colapsos sin aviso del periodo de prueba (${dest.colapsos_sin_aviso}). Centro y Mi viaje son demo histórica; En vivo y Navegar usan el tráfico de hoy.` : "",
      boton: "Ver el día →" },
  ];
}

function abrirHistoria() {
  pausar();
  $("#historia").hidden = false;
  try { sessionStorage.setItem("mp-historia", "1"); } catch { /* sin almacenamiento */ }
  pasoHistoria(0);
  $("#hist-sig").focus();
}

function pasoHistoria(i) {
  const pasos = pasosHistoria();
  ESTADO.pasoHist = i;
  const p = pasos[i];
  $("#hist-paso").innerHTML = `
    <p class="sobre">${esc(p.sobre)}</p>
    ${p.cifra ? `<p class="cifra ${p.roja ? "roja" : ""}">${esc(p.cifra)}</p>` : ""}
    <h2>${esc(p.titulo)}</h2>
    ${p.texto ? `<p class="txt">${esc(p.texto)}</p>` : ""}
    ${p.comp ? `<div class="hist-comp">${p.comp.map(([a, b, c], k) => `<div class="${k ? "mp" : ""}"><span>${esc(a)}</span><b>${esc(b)}</b><span>${esc(c)}</span></div>`).join("")}</div>` : ""}
    ${p.fuente ? `<p class="fuente">${esc(p.fuente)}</p>` : ""}`;
  $("#hist-paso").style.animation = "none"; void $("#hist-paso").offsetWidth; $("#hist-paso").style.animation = "";
  $("#hist-puntos").innerHTML = pasos.map((_, k) => `<i class="${k === i ? "act" : ""}"></i>`).join("");
  $("#hist-sig").textContent = p.boton || "Siguiente →";
  $("#hist-sig").onclick = () => (i < pasos.length - 1 ? pasoHistoria(i + 1) : cerrarHistoria(true));
  $("#hist-saltar").onclick = () => cerrarHistoria(false);
}

async function cerrarHistoria(verDia) {
  $("#historia").hidden = true;
  if (!verDia) return;
  cambiarVista("control");
  const dest = diaDestacado();
  if (dest && ESTADO.dia?.fecha !== dest.fecha) await cargarDia(dest.fecha);
  irAHora(ESTADO.horas[0]);
  ESTADO.revelar = true; $("#revelar").checked = true;
  reproducir();
}

document.addEventListener("keydown", (e) => {
  if ($("#historia").hidden) return;
  if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); $("#hist-sig").click(); }
  else if (e.key === "ArrowLeft" && ESTADO.pasoHist > 0) pasoHistoria(ESTADO.pasoHist - 1);
  else if (e.key === "Escape") cerrarHistoria(false);
});

document.addEventListener("DOMContentLoaded", iniciar);
