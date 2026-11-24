// Preguntas «con justificación»: el estudiante elige compañeros Y escribe, junto a cada uno, por qué lo eligió.
// Hay tres tipos de pregunta: «seleccion» (la de siempre), «justificable» (elección + explicación obligatoria)
// y «abierta» (solo texto libre: opinión, sugerencia o dato del grupo; no se elige a ningún compañero).
// Lógica pura (sin Firebase ni React). Se guarda en la respuesta como un mapa plano { "preguntaId|estudianteId": "texto" }
// (plano para que las reglas de Firestore puedan limitar su tamaño total).
export const MAX_JUST = 280;      // caracteres por justificación
export const MIN_JUST = 3;        // mínimo de caracteres en una justificación
export const MAX_JUST_TOTAL = 60; // justificaciones por respuesta (lo mismo que permiten las reglas)

export const MAX_ABIERTA = 500;      // caracteres por respuesta abierta
export const MAX_ABIERTAS_TOTAL = 30; // respuestas abiertas por respuesta (lo mismo que permiten las reglas)

export const KIND_LABELS = { seleccion: "Selección múltiple", justificable: "Selección con justificación", abierta: "Pregunta abierta (texto libre)" };

/** Tipo de pregunta: «seleccion» (por defecto, también en encuestas antiguas), «justificable» o «abierta». */
export function kindOf(q) {
  return q && (q.kind === "justificable" || q.kind === "abierta") ? q.kind : "seleccion";
}
export const esJustificable = (q) => kindOf(q) === "justificable";
/** Pregunta abierta: no se elige a nadie, solo se escribe. */
export const esAbierta = (q) => kindOf(q) === "abierta";

export const justKey = (qId, studentId) => `${qId}|${studentId}`;

function limpiar(t, max) {
  return String(t == null ? "" : t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}
/** Texto limpio: sin caracteres de control, espacios repetidos colapsados y máximo MAX_JUST caracteres. */
export function cleanJustText(t) { return limpiar(t, MAX_JUST); }
/** Igual, para una respuesta abierta (hasta MAX_ABIERTA caracteres). */
export function cleanOpenText(t) { return limpiar(t, MAX_ABIERTA); }

/** Respuestas abiertas que se guardan: solo de preguntas «abierta» y no vacías. `textos`: { preguntaId: "texto" }. */
export function buildAbiertas(textos, questions) {
  const out = {};
  for (const q of questions || []) {
    if (!esAbierta(q)) continue;
    const t = cleanOpenText(textos && textos[q.id]);
    if (t) out[q.id] = t;
  }
  return Object.fromEntries(Object.entries(out).slice(0, MAX_ABIERTAS_TOTAL));
}

/**
 * Lo que se guarda en la respuesta: solo textos de personas realmente elegidas, en preguntas justificables y que no están vacíos.
 * `answers`: { preguntaId: [ids] } · `textos`: { "preguntaId|id": "texto" } (lo escrito en pantalla).
 */
export function buildJustificaciones(answers, textos, questions) {
  const out = {};
  for (const q of questions || []) {
    if (!esJustificable(q)) continue;
    for (const id of (answers && answers[q.id]) || []) {
      const t = cleanJustText(textos && textos[justKey(q.id, id)]);
      if (t) out[justKey(q.id, id)] = t;
    }
  }
  return Object.fromEntries(Object.entries(out).slice(0, MAX_JUST_TOTAL));
}

/** Ids elegidos en la pregunta a los que les falta la justificación (vacío si la pregunta no es justificable). */
export function justificacionesFaltantes(q, selected, textos) {
  if (!esJustificable(q)) return [];
  return (selected || []).filter((id) => cleanJustText(textos && textos[justKey(q.id, id)]).length < MIN_JUST);
}

/** ¿La pregunta es obligatoria? Por defecto no (así se comportan las encuestas anteriores). */
export const esObligatoria = (q) => !!q && q.obligatoria === true;

/** Pregunta obligatoria sin responder: de selección, sin elegir a nadie; abierta, sin texto suficiente. */
export function faltaRespuesta(q, selected, textoAbierto) {
  if (!esObligatoria(q)) return false;
  if (esAbierta(q)) return cleanOpenText(textoAbierto).length < MIN_JUST;
  return (selected || []).length === 0;
}

/** Valor escrito en un archivo o en el JSON de una encuesta → tipo. Vacío o desconocido = selección. */
export function parseKind(v) {
  const s = String(v == null ? "" : v).normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (["abierta", "abierto", "texto", "texto libre", "open"].includes(s)) return "abierta";
  return ["justificable", "justificacion", "justifica", "con justificacion", "justificada", "justify", "si", "yes", "1", "true"].includes(s) ? "justificable" : "seleccion";
}
/** Tipo → texto para archivos. */
export const kindToText = (k) => (k === "justificable" || k === "abierta" ? k : "seleccion");
