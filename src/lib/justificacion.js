// Preguntas «con justificación»: el estudiante elige compañeros Y escribe, junto a cada uno, por qué lo eligió.
// Hay dos tipos de pregunta: «seleccion» (la de siempre) y «justificable» (elección + explicación obligatoria).
// Lógica pura (sin Firebase ni React). Se guarda en la respuesta como un mapa plano { "preguntaId|estudianteId": "texto" }
// (plano para que las reglas de Firestore puedan limitar su tamaño total).
export const MAX_JUST = 280;      // caracteres por justificación
export const MIN_JUST = 3;        // mínimo de caracteres en una justificación
export const MAX_JUST_TOTAL = 60; // justificaciones por respuesta (lo mismo que permiten las reglas)

export const KIND_LABELS = { seleccion: "☑ Selección múltiple", justificable: "💬 Selección con justificación" };

/** Tipo de pregunta: «seleccion» (por defecto, también en encuestas antiguas) o «justificable». */
export function kindOf(q) {
  return q && q.kind === "justificable" ? "justificable" : "seleccion";
}
export const esJustificable = (q) => kindOf(q) === "justificable";

export const justKey = (qId, studentId) => `${qId}|${studentId}`;

/** Texto limpio: sin caracteres de control, espacios repetidos colapsados y máximo MAX_JUST caracteres. */
export function cleanJustText(t) {
  return String(t == null ? "" : t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_JUST);
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

/** Valor escrito en un archivo o en el JSON de una encuesta → tipo. Vacío o desconocido = selección. */
export function parseKind(v) {
  const s = String(v == null ? "" : v).normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  return ["justificable", "justificacion", "justifica", "con justificacion", "justificada", "justify", "si", "yes", "1", "true"].includes(s) ? "justificable" : "seleccion";
}
/** Tipo → texto para archivos. */
export const kindToText = (k) => (k === "justificable" ? "justificable" : "seleccion");
