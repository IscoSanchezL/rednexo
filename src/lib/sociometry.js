// Lógica pura de RedNexo (sin React ni Firebase) para poder probarla de forma aislada.

/** Iniciales de un nombre: "Ana García" → "AG" (máximo 2 letras). */
export function initials(name) {
  return String(name).trim().split(/\s+/).map((w) => w[0] || "").join("").toUpperCase().slice(0, 2);
}

/**
 * Importación masiva: una línea = un estudiante. Ignora líneas vacías y espacios sobrantes.
 * `makeId` se inyecta para que las pruebas sean deterministas.
 */
export function parseBulkStudents(text, group, makeId = (i) => Date.now() + i + Math.random()) {
  return String(text || "")
    .split("\n").map((l) => l.trim()).filter(Boolean)
    .map((name, i) => ({ id: makeId(i), name, group, av: initials(name) }));
}

/** Densidad de la red: conexiones reales / conexiones posibles (n·(n−1)), en % con un decimal. */
export function density(connCount, n) {
  if (!(n > 1)) return "0.0";
  return ((connCount / (n * (n - 1))) * 100).toFixed(1);
}

/**
 * Convierte respuestas de encuestas en conexiones dirigidas {f, t, s, tp}.
 *  f: quien elige · t: elegido · s: fuerza (veces elegido, máx. 3) · tp: tipo dominante (pos/neg/neu)
 * El tipo sale de la pregunta (`tp`); si la pregunta no existe se asume "pos".
 */
export function buildConnections(responses, surveys) {
  const acc = {};
  for (const r of responses) {
    if (!r || !r.answers) continue;
    const sv = surveys.find((s) => s.id === r.surveyId);
    for (const [qId, selected] of Object.entries(r.answers)) {
      const q = sv?.questions?.find((x) => String(x.id) === String(qId));
      const tp = q?.tp || "pos";
      for (const toId of selected || []) {
        const key = `${r.respondentId}_${toId}`;
        if (!acc[key]) acc[key] = { f: r.respondentId, t: toId, tpCounts: { pos: 0, neg: 0, neu: 0 }, count: 0 };
        acc[key].tpCounts[tp] = (acc[key].tpCounts[tp] || 0) + 1;
        acc[key].count++;
      }
    }
  }
  return Object.values(acc).map((c) => {
    const tp = Object.entries(c.tpCounts).sort((a, b) => b[1] - a[1])[0][0];
    // `tp` es el tipo dominante (el que se dibuja con «Todas»); `types` y `counts` conservan TODOS los tipos que
    // esa persona marcó para ese compañero, para que ninguno desaparezca al filtrar o al contar.
    const types = TYPE_ORDER.filter((t) => c.tpCounts[t] > 0);
    return { f: c.f, t: c.t, s: Math.min(c.count, 3), tp, types, counts: { pos: c.tpCounts.pos, neu: c.tpCounts.neu, neg: c.tpCounts.neg } };
  });
}

export const TYPE_ORDER = ["pos", "neu", "neg"];

/** ¿Esta conexión incluye el tipo pedido? (también para conexiones antiguas que solo traen `tp`). */
export function hasType(c, t) {
  return !!c && (Array.isArray(c.types) ? c.types.includes(t) : c.tp === t);
}

/** Fuerza (1-3) de la conexión para un tipo: cuántas veces se marcó ese tipo. Sin tipo, la fuerza total. */
export function strengthOf(c, t) {
  if (!t || t === "all" || !c.counts) return c.s;
  return Math.max(1, Math.min(c.counts[t] || 0, 3));
}

/** Conexiones para dibujar con un filtro: solo las que incluyen ese tipo, y dibujadas COMO de ese tipo. */
export function filterConns(conns, filter) {
  if (!filter || filter === "all") return conns;
  return conns.filter((c) => hasType(c, filter)).map((c) => ({ ...c, tp: filter, s: strengthOf(c, filter) }));
}

/** Lista mínima de nombres que la encuesta pública necesita (ver firestore.rules). */
export function buildRoster(sv, students) {
  const gs = sv.groups?.length > 0 ? sv.groups : sv.group ? [sv.group] : null;
  const list = students.filter((s) => !gs || gs.includes(s.group)).map((s) => ({ id: String(s.id), name: s.name, group: s.group, av: s.av || "" }));
  return { roster: list, rosterIds: list.map((s) => s.id) };
}

// ── Grupos y búsqueda ──────────────────────────────────────────

/** Texto sin tildes ni mayúsculas, para comparar y buscar: "Ñandú  " → "nandu". */
export function normalizeText(t) {
  return String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** ¿Ya existe un grupo con ese nombre (sin distinguir mayúsculas ni tildes)? */
export function groupExists(names, name) {
  const n = normalizeText(name);
  return !!n && names.some((g) => normalizeText(g) === n);
}

/** Identificador estable de un grupo según su nombre exacto: dos sesiones que lo creen a la vez escriben el mismo documento. */
export function groupIdFor(name) {
  let h = 5381;
  for (const ch of String(name)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return "g_" + h.toString(36);
}

/** Nombres de grupo para mostrar: los guardados y, además, los que usan los estudiantes aunque no tengan documento. */
export function allGroupNames(groups, students) {
  const names = groups.map((g) => g.name);
  const seen = new Set(names);
  [...new Set(students.map((s) => s.group).filter((g) => typeof g === "string" && g.trim()))].sort((a, b) => a.localeCompare(b, "es")).forEach((g) => { if (!seen.has(g)) { names.push(g); seen.add(g); } });
  return names;
}

/** Grupos usados por estudiantes que no tienen documento propio (hay que guardarlos). */
export function missingGroups(groups, students) {
  const have = new Set(groups.map((g) => g.name));
  return [...new Set(students.map((s) => s.group).filter((g) => typeof g === "string" && g.trim() && !have.has(g)))];
}

/**
 * Búsqueda global: por nombre de estudiante O por nombre de grupo (sin tildes ni mayúsculas).
 * Si el grupo coincide, trae a TODOS sus estudiantes (y el grupo aparece aunque esté vacío).
 * Devuelve [{ group, members, groupMatched }] en el orden de `groupNames`.
 */
export function searchGroups(students, groupNames, query) {
  const q = normalizeText(query);
  if (!q) return [];
  const out = [];
  for (const g of groupNames) {
    const groupMatched = normalizeText(g).includes(q);
    const inGroup = students.filter((s) => s.group === g);
    const members = groupMatched ? inGroup : inGroup.filter((s) => normalizeText(s.name).includes(q));
    if (groupMatched || members.length > 0) out.push({ group: g, members, groupMatched });
  }
  return out;
}

/** Posición [inicio, fin) de la búsqueda dentro del texto, ignorando tildes y mayúsculas; null si no hay. */
export function highlightRange(text, query) {
  const q = normalizeText(query);
  if (!q) return null;
  const t = String(text);
  const n = t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (n.length !== t.length) { const i = t.toLowerCase().indexOf(String(query).toLowerCase().trim()); return i < 0 ? null : [i, i + String(query).trim().length]; }
  const i = n.indexOf(q);
  return i < 0 ? null : [i, i + q.length];
}

/**
 * Avance REAL de una encuesta: quiénes de su lista ya respondieron.
 * Cuenta una sola vez a cada estudiante (aunque haya respuestas repetidas), ignora respuestas de otras encuestas
 * y de personas que ya no están en la lista, y compara los ids como texto (hay ids numéricos y de texto).
 */
export function surveyProgress(sv, students, responses) {
  const roster = buildRoster(sv, students).roster;
  const done = new Set(responses.filter((r) => r && r.surveyId === sv.id).map((r) => String(r.respondentId)));
  const items = roster.map((s) => ({ id: s.id, name: s.name, group: s.group, done: done.has(s.id) }));
  const total = items.length, completed = items.filter((i) => i.done).length;
  return { total, completed, pending: total - completed, pct: total ? Math.round((completed / total) * 100) : 0, items };
}

/**
 * Cifras de un nodo del sociograma. `conns` debe ser solo lo VISIBLE y `n` los participantes visibles,
 * para que el divisor y lo que se cuenta hablen del mismo grupo.
 *  Aceptación = positivas recibidas ÷ (n − 1)      Rechazo = negativas recibidas ÷ (n − 1)
 * (antes un único «Índice» contaba también los rechazos como si fueran aceptación).
 */
export function nodeStats(id, conns, n) {
  const sid = String(id);
  const hechas = conns.filter((c) => String(c.f) === sid);
  const recibidas = conns.filter((c) => String(c.t) === sid);
  const pos = recibidas.filter((c) => hasType(c, "pos")).length;
  const neg = recibidas.filter((c) => hasType(c, "neg")).length;
  const reciprocas = hechas.filter((c) => conns.some((r) => String(r.f) === String(c.t) && String(r.t) === sid)).length;
  const d = n > 1 ? n - 1 : 0;
  const ratio = (k) => (d ? (k / d).toFixed(2) : "0.00");
  return { elecciones: hechas.length, recibidas: recibidas.length, reciprocas, positivasRecibidas: pos, negativasRecibidas: neg, aceptacion: ratio(pos), rechazo: ratio(neg) };
}
