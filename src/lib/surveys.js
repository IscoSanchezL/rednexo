// Plantilla, importación y exportación de encuestas (lógica pura, sin Firebase ni React).

export const TIPOS = { pos: "positiva", neu: "neutral", neg: "negativa" };
const LIMITS = { maxQuestions: 40, maxQuestionLen: 300, maxTitleLen: 120, maxBytes: 200000 };

/** Encuesta de prueba: 3 positivas, 2 neutrales y 2 negativas. */
export const TEMPLATE_QUESTIONS = [
  { text: "¿Con quién te gustaría trabajar en un proyecto en equipo?", tp: "pos" },
  { text: "¿A quién invitarías a tu cumpleaños?", tp: "pos" },
  { text: "¿A quién acudes cuando necesitas ayuda con una tarea?", tp: "pos" },
  { text: "¿Quién consideras que es el líder del grupo?", tp: "neu" },
  { text: "¿A quién ves con más frecuencia durante el recreo?", tp: "neu" },
  { text: "¿Con quién NO te gustaría trabajar en equipo?", tp: "neg" },
  { text: "¿Con quién te sientes menos cómodo(a) en el salón?", tp: "neg" },
];
export function buildTemplateSurvey(groups) {
  return { title: "Encuesta de prueba — Sociograma", groups: [...groups], group: groups[0] || "", maxSel: 3, anon: true, questions: TEMPLATE_QUESTIONS.map((q) => ({ ...q })) };
}

/** Normaliza el tipo escrito por una persona: «Positiva», «pos», «+», «NEGATIVA»… → "pos" | "neu" | "neg" | null. */
export function parseTipo(v) {
  const t = String(v == null ? "" : v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (["pos", "positiva", "positivo", "positive", "+"].includes(t)) return "pos";
  if (["neu", "neutral", "neutra", "neutro", "0"].includes(t)) return "neu";
  if (["neg", "negativa", "negativo", "negative", "-"].includes(t)) return "neg";
  return null;
}

const clean = (s) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
/** Una celda que empieza con = + - @ se interpretaría como fórmula al abrir el CSV en Excel: se antepone un apóstrofo. */
const guard = (s) => (/^[=+\-@\t\r]/.test(s) ? "'" + s : s);
const unguard = (s) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s);

/** Resumen de tipos: { pos: 3, neu: 2, neg: 2 }. */
export function countTipos(questions) {
  const c = { pos: 0, neu: 0, neg: 0 };
  for (const q of questions || []) if (c[q.tp] !== undefined) c[q.tp]++;
  return c;
}

// ── Exportar ──
export function exportSurveyJSON(sv) {
  return {
    formato: "rednexo-encuesta-v1",
    titulo: sv.title,
    maxSel: sv.maxSel || 3,
    anonima: sv.anon !== false,
    preguntas: (sv.questions || []).map((q) => ({ texto: q.text, tipo: TIPOS[q.tp] || "positiva" })),
  };
}
const csvCell = (s, d) => { const v = guard(String(s)); return /["\n\r]/.test(v) || v.includes(d) ? `"${v.replace(/"/g, '""')}"` : v; };
/** CSV con «;» (Excel en español) y marca BOM para que respete tildes y ñ. */
export function surveyToCSV(sv, d = ";") {
  const rows = [["pregunta", "tipo"], ...(sv.questions || []).map((q) => [q.text, TIPOS[q.tp] || "positiva"])];
  return "﻿" + rows.map((r) => r.map((c) => csvCell(c, d)).join(d)).join("\r\n") + "\r\n";
}
export function surveyFileName(sv, ext, now = new Date()) {
  const base = String(sv.title || "encuesta").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "encuesta";
  return `encuesta-${base}-${now.toISOString().slice(0, 10)}.${ext}`;
}

// ── Importar ──
/** Lee un CSV (separador «,» o «;», comillas, comillas dobles y saltos de línea dentro de comillas). */
export function parseCSV(text) {
  const src = String(text).replace(/^﻿/, "");
  const first = src.split(/\r?\n/)[0] || "";
  const d = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : (first.includes("\t") && !first.includes(",") ? "\t" : ",");
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && src[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * Convierte un archivo (.json o .csv) en una encuesta. Nunca lanza: devuelve { ok, survey, errors, warnings }.
 * Cada error indica la fila o pregunta, para que se pueda corregir el archivo.
 */
export function parseSurveyImport(text, fileName = "") {
  const errors = [], warnings = [];
  const fail = (m) => ({ ok: false, survey: null, errors: [m], warnings });
  const raw = String(text == null ? "" : text);
  if (!raw.trim()) return fail("El archivo está vacío.");
  if (raw.length > LIMITS.maxBytes) return fail("El archivo es demasiado grande (máximo 200 KB).");
  const fromName = clean(String(fileName).replace(/\.[^.]+$/, "").replace(/^encuesta-/, "").replace(/-\d{4}-\d{2}-\d{2}$/, "").replace(/[-_]+/g, " "));
  let title = "", maxSel = 3, anon = true, items = [];   // items: { n, text, tipo }
  const isJson = /^\s*[\[{]/.test(raw) || /\.json$/i.test(fileName);
  if (isJson) {
    let data;
    try { data = JSON.parse(raw); } catch (e) { return fail("El archivo JSON no es válido: " + e.message); }
    const list = Array.isArray(data) ? data : (data.preguntas || data.questions || null);
    if (!Array.isArray(list)) return fail("No se encontró la lista de preguntas (campo «preguntas»).");
    title = clean(Array.isArray(data) ? "" : (data.titulo || data.title || ""));
    if (!Array.isArray(data)) { if (data.maxSel != null) maxSel = data.maxSel; if (data.anonima != null || data.anon != null) anon = (data.anonima ?? data.anon) !== false; }
    items = list.map((q, i) => ({ n: i + 1, text: typeof q === "string" ? q : (q && (q.texto ?? q.text ?? q.pregunta)), tipo: typeof q === "string" ? "" : (q && (q.tipo ?? q.tp ?? q.type)) }));
  } else {
    const rows = parseCSV(raw);
    if (rows.length === 0) return fail("El archivo no tiene filas.");
    const h0 = parseTipo(rows[0][1]) === null ? clean(rows[0][0]).toLowerCase() : "";
    const hasHeader = ["pregunta", "preguntas", "texto", "question", "questions"].includes(h0.normalize("NFD").replace(/[̀-ͯ]/g, "")) || ["tipo", "type", "tp"].includes(clean(rows[0][1] || "").toLowerCase());
    items = rows.slice(hasHeader ? 1 : 0).map((r, i) => ({ n: i + (hasHeader ? 2 : 1), text: r[0], tipo: r[1] }));
  }
  title = (title || fromName || "Encuesta importada").slice(0, LIMITS.maxTitleLen);
  maxSel = Number.isInteger(+maxSel) && +maxSel >= 1 && +maxSel <= 10 ? +maxSel : 3;
  const questions = [], seen = new Set();
  for (const it of items) {
    const where = isJson ? `Pregunta ${it.n}` : `Fila ${it.n}`;
    const text = unguard(clean(it.text));
    if (!text) { errors.push(`${where}: la pregunta está vacía.`); continue; }
    if (text.length > LIMITS.maxQuestionLen) { errors.push(`${where}: la pregunta pasa de ${LIMITS.maxQuestionLen} caracteres.`); continue; }
    const tp = parseTipo(it.tipo);
    if (!tp) { errors.push(`${where}: el tipo «${clean(it.tipo)}» no es válido (usa positiva, neutral o negativa).`); continue; }
    const key = text.toLowerCase() + "|" + tp;
    if (seen.has(key)) { warnings.push(`${where}: repetida, se omitió.`); continue; }
    seen.add(key); questions.push({ text, tp });
  }
  if (questions.length > LIMITS.maxQuestions) { errors.push(`Hay ${questions.length} preguntas; el máximo es ${LIMITS.maxQuestions}.`); }
  if (questions.length === 0 && errors.length === 0) errors.push("El archivo no tiene preguntas.");
  return { ok: errors.length === 0, survey: { title, maxSel, anon, questions }, errors, warnings };
}
