// Lógica pura del modelo multi-colegio (sin Firebase ni React), para poder probarla.

/** Identificador de colegio seguro para URL y rutas de Firestore: "Colegio San José" → "colegio-san-jose". */
export function slugify(name) {
  return String(name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** Colegio al que pertenecen los datos creados antes del modelo multi-colegio y los enlaces ?survey=ID sin &c=. */
export const LEGACY_COLEGIO_ID = "inicial";

/** Lee de la URL el colegio y la encuesta: ?c=COLEGIO&survey=ID (sin c → colegio inicial). */
export function parsePublicSurveyUrl(search) {
  const q = new URLSearchParams(search);
  const survey = q.get("survey");
  if (!survey) return null;
  const c = q.get("c") || LEGACY_COLEGIO_ID;
  if (!/^[a-z0-9-]{1,40}$/.test(c) || !/^[A-Za-z0-9_-]{1,80}$/.test(survey)) return null;
  return { colegioId: c, surveyId: survey };
}

const ROLE_MAP = { psychologist: "psychologist", readonly: "readonly", admin: "admin" };

/**
 * Plan de migración de las colecciones globales a colegios/{cid}/...
 * Devuelve [{ path, data }]. NO borra nada del origen; es idempotente (mismos ids, mismo contenido).
 * `legacy`: { students, groups, surveys, responses, activity, users, settings } con { id, ...data }.
 */
export function planMigration(legacy, cid, buildRoster) {
  const ops = [];
  const put = (sub, id, data) => ops.push({ path: `colegios/${cid}/${sub}/${id}`, data });
  const settings = legacy.settings || {};
  ops.push({ path: `colegios/${cid}`, data: { nombre: settings.colegio || cid, ciudad: settings.ciudad || "", migrado: true } });
  if (legacy.settings) put("settings", "global", { ...settings });
  (legacy.groups || []).forEach((g) => put("groups", String(g.id), g));
  (legacy.students || []).forEach((s) => put("students", String(s.id), s));
  const students = legacy.students || [];
  (legacy.surveys || []).forEach((sv) => {
    let data = { ...sv };
    if (sv.status === "active" && !sv.deleted && !Array.isArray(sv.rosterIds)) data = { ...data, ...buildRoster(sv, students) };
    if (sv.status === "active" && !sv.deleted) data = { ...data, colegioNombre: settings.colegio || "", ...(settings.logo ? { logo: settings.logo } : {}) };
    put("surveys", String(sv.id), data);
  });
  (legacy.responses || []).forEach((r) => {
    put("responses", String(r.id), r);
    if (r.surveyId != null && r.respondentId != null) put("responseMarks", String(r.id), { surveyId: r.surveyId, respondentId: r.respondentId });
  });
  (legacy.activity || []).forEach((a) => put("activity", String(a.id), a));
  (legacy.users || []).forEach((u) => {
    const email = String(u.email || u.id || "").toLowerCase();
    if (!email || !ROLE_MAP[u.role]) return;
    put("miembros", email, { email, role: ROLE_MAP[u.role], status: ["active", "revoked", "pending"].includes(u.status) ? u.status : "revoked" });
  });
  return ops;
}

/** Parte las operaciones en lotes (Firestore admite 500 escrituras por lote). */
export function chunk(arr, size = 400) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
