// Registro de actividad del colegio: cómo se arma cada entrada y cómo se muestra su fecha (lógica pura).

export const ACTIVITY_TYPES = ["create", "survey", "group", "user", "export", "report", "system"];
const MAX_ACTION = 200, MAX_DETAIL = 300;
const clean = (s) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();

/**
 * Entrada de actividad lista para guardar (sin `createdAt`, que lo pone el servidor).
 * No incluye nombres de estudiantes: el detalle debe hablar de grupos, encuestas o cantidades, no de menores.
 */
export function buildActivity(type, action, detail, user, email) {
  return {
    type: ACTIVITY_TYPES.includes(type) ? type : "system",
    action: clean(action).slice(0, MAX_ACTION),
    detail: clean(detail).slice(0, MAX_DETAIL),
    user: clean(user || email).slice(0, 120),
    email: String(email || "").toLowerCase(),
  };
}

const toDate = (ts) => {
  if (!ts) return null;
  if (typeof ts.toDate === "function") { try { return ts.toDate(); } catch (e) { return null; } }
  const d = ts instanceof Date ? ts : new Date(ts);
  return isNaN(d) ? null : d;
};
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const dayKey = (d) => d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();

/** «Hoy 09:12», «Ayer 16:40», «3 nov 10:05» o «3 nov 2025 10:05». Sin fecha (aún sin confirmar): «Ahora». */
export function formatWhen(ts, now = new Date()) {
  const d = toDate(ts);
  if (!d) return "Ahora";
  const ayer = new Date(now); ayer.setDate(ayer.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return `Hoy ${hhmm(d)}`;
  if (dayKey(d) === dayKey(ayer)) return `Ayer ${hhmm(d)}`;
  return `${d.getDate()} ${MESES[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? "" : " " + d.getFullYear()} ${hhmm(d)}`;
}
