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
    return { f: c.f, t: c.t, s: Math.min(c.count, 3), tp };
  });
}

/** Lista mínima de nombres que la encuesta pública necesita (ver firestore.rules). */
export function buildRoster(sv, students) {
  const gs = sv.groups?.length > 0 ? sv.groups : sv.group ? [sv.group] : null;
  const list = students.filter((s) => !gs || gs.includes(s.group)).map((s) => ({ id: String(s.id), name: s.name, group: s.group, av: s.av || "" }));
  return { roster: list, rosterIds: list.map((s) => s.id) };
}
