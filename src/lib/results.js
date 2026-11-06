// Resultados de encuestas listos para Excel: qué hojas y columnas lleva el archivo (lógica pura, probada).
import { buildConnections, hasType, surveyGroups } from "./sociometry.js";
import { computeReport, ROLE_LABELS, ROLE_HELP } from "./reports.js";

const TIPO = { pos: "Positiva", neu: "Neutral", neg: "Negativa" };
const sameId = (a, b) => String(a) === String(b);
const when = (ts) => { try { const d = ts && typeof ts.toDate === "function" ? ts.toDate() : ts instanceof Date ? ts : ts ? new Date(ts) : null; return d && !isNaN(d) ? d : null; } catch (e) { return null; } };

/**
 * Libro de resultados. surveyId: "all" o el id de una encuesta; group: "Todos" o el nombre de un grupo.
 * Devuelve { sheets, resumen } (sheets listo para buildXlsx).
 * Hojas: Léeme · Índices (una fila por estudiante) · Conexiones (una por pareja) · Matriz · Respuestas (una fila por elección, ideal para tablas dinámicas) · Por pregunta.
 */
export function buildResultsSheets({ students, surveys, responses, surveyId = "all", group = "Todos", colegio = "", date = new Date() }) {
  // Los participantes de una encuesta son los estudiantes de SUS grupos (no todo el colegio): de ahí salen los porcentajes (÷ compañeros).
  const sv1 = surveyId === "all" ? null : surveys.find((x) => x.id === surveyId);
  const gruposEncuesta = sv1 ? surveyGroups(sv1) : [];
  const base = gruposEncuesta.length ? students.filter((s) => gruposEncuesta.includes(s.group)) : students;
  const scopeStudents = group === "Todos" ? base : base.filter((s) => s.group === group);
  const inScope = new Set(scopeStudents.map((s) => String(s.id)));
  const surveyList = surveyId === "all" ? surveys.filter((s) => !s.deleted) : surveys.filter((s) => s.id === surveyId);
  const allowed = new Set(surveyId === "all" ? surveys.map((s) => s.id) : [surveyId]);
  const resp = responses.filter((r) => r && allowed.has(r.surveyId) && inScope.has(String(r.respondentId)));
  const conns = buildConnections(resp, surveys).filter((c) => inScope.has(String(c.f)) && inScope.has(String(c.t)));
  const report = computeReport(scopeStudents, conns);
  const byId = new Map(scopeStudents.map((s) => [String(s.id), s]));
  const nombre = (id) => (byId.get(String(id)) || students.find((s) => sameId(s.id, id)) || {}).name || "(estudiante eliminado)";
  const grupoDe = (id) => (byId.get(String(id)) || students.find((s) => sameId(s.id, id)) || {}).group || "";
  const respondieron = new Set(resp.map((r) => String(r.respondentId)));
  const alcance = `${group === "Todos" ? "Todos los grupos" : group} · ${surveyId === "all" ? `todas las encuestas (${surveyList.length})` : (surveyList[0] && surveyList[0].title) || "encuesta"}`;

  // ── Léeme ──
  const leeme = [
    [{ v: "Resultados RedNexo", s: "title" }], [],
    [{ v: "Colegio", s: "bold" }, colegio || ""], [{ v: "Fecha de exportación", s: "bold" }, date], [{ v: "Alcance", s: "bold" }, alcance],
    [{ v: "Participantes", s: "bold" }, scopeStudents.length], [{ v: "Respuestas recibidas", s: "bold" }, resp.length], [{ v: "Han respondido", s: "bold" }, `${scopeStudents.filter((s) => respondieron.has(String(s.id))).length} de ${scopeStudents.length}`], [],
    [{ v: "CONFIDENCIAL: contiene datos de menores de edad (quién eligió o rechazó a quién). Guárdalo en un lugar seguro y compártelo solo con quien corresponda.", s: "wrap" }], [],
    [{ v: "Hojas", s: "bold" }],
    ["Índices", "Una fila por estudiante: cuántas elecciones hizo y recibió, aceptación, rechazo, expansión y rol."],
    ["Conexiones", "Una fila por pareja (quién → a quién) con cuántas veces se marcó cada tipo."],
    ["Matriz", "Quién (filas) marcó a quién (columnas). Valor = elecciones positivas − rechazos (positivo = aceptación; negativo = rechazo; vacío = sin conexión)."],
    ["Respuestas", "Una fila por elección individual. Es la hoja ideal para tablas dinámicas y gráficos."],
    ["Por pregunta", "Resumen de cada pregunta: cuántos respondieron y cuántas elecciones recibió."], [],
    [{ v: "Definiciones", s: "bold" }],
    ["Aceptación", "Compañeros que lo eligieron positivamente ÷ (participantes − 1). De 0 % a 100 %."],
    ["Rechazo", "Compañeros que lo rechazaron ÷ (participantes − 1)."],
    ["Expansión", "A cuántos compañeros eligió esa persona (en cualquier pregunta) ÷ (participantes − 1)."],
    ...Object.keys(ROLE_LABELS).map((k) => [`Rol: ${ROLE_LABELS[k]}`, ROLE_HELP[k]]),
  ];

  // ── Índices ──
  const indices = [["Nombre", "Grupo", "Elige", "Recibe", "Elecciones positivas recibidas", "Neutrales recibidas", "Rechazos recibidos", "Mutuas positivas", "Aceptación", "Rechazo", "Expansión", "Rol", "¿Respondió?"]];
  const d = scopeStudents.length > 1 ? scopeStudents.length - 1 : 0;
  const ratio = (k) => ({ v: d ? k / d : 0, s: "pct" });          // valor exacto (no el redondeado de la pantalla) para poder graficarlo
  for (const r of report.rows) indices.push([r.student.name, r.student.group, r.hechas, r.recibidas, r.posR, r.neuR, r.negR, r.mutuasPos, ratio(r.posR), ratio(r.negR), ratio(r.hechas), r.rolLabel, respondieron.has(String(r.student.id)) ? "Sí" : "No"]);

  // ── Conexiones ──
  const conexiones = [["De", "Grupo (de)", "Para", "Grupo (para)", "Tipo dominante", "Positivas", "Neutrales", "Negativas", "Fuerza (1-3)", "¿Mutua positiva?"]];
  const sorted = conns.slice().sort((a, b) => nombre(a.f).localeCompare(nombre(b.f), "es") || nombre(a.t).localeCompare(nombre(b.t), "es"));
  for (const c of sorted) {
    const mutua = hasType(c, "pos") && conns.some((x) => sameId(x.f, c.t) && sameId(x.t, c.f) && hasType(x, "pos"));
    conexiones.push([nombre(c.f), grupoDe(c.f), nombre(c.t), grupoDe(c.t), TIPO[c.tp] || c.tp, (c.counts || {}).pos ?? (c.tp === "pos" ? c.s : 0), (c.counts || {}).neu ?? (c.tp === "neu" ? c.s : 0), (c.counts || {}).neg ?? (c.tp === "neg" ? c.s : 0), c.s, mutua ? "Sí" : "No"]);
  }

  // ── Matriz ──
  const matriz = [["De \\ Para", ...scopeStudents.map((s) => s.name), "Elige (+)", "Rechaza (−)"]];
  for (const from of scopeStudents) {
    let pos = 0, neg = 0;
    const celdas = scopeStudents.map((to) => {
      if (sameId(from.id, to.id)) return "";
      const c = conns.find((x) => sameId(x.f, from.id) && sameId(x.t, to.id));
      if (!c) return "";
      if (hasType(c, "pos")) pos++; if (hasType(c, "neg")) neg++;
      const counts = c.counts || { pos: c.tp === "pos" ? c.s : 0, neg: c.tp === "neg" ? c.s : 0 };
      return counts.pos - counts.neg;
    });
    matriz.push([from.name, ...celdas, pos, neg]);
  }

  // ── Respuestas (una fila por elección) y Por pregunta ──
  const respuestas = [["Encuesta", "Pregunta", "Tipo de pregunta", "De", "Grupo (de)", "Elegido(a)", "Grupo (elegido)", "Fecha de respuesta"]];
  const porPregunta = new Map();
  const orden = (a, b) => nombre(a.respondentId).localeCompare(nombre(b.respondentId), "es");
  for (const sv of surveyList) {
    for (const q of sv.questions || []) porPregunta.set(`${sv.id}|${q.id}`, { sv, q, respondieron: new Set(), elecciones: 0 });
    for (const r of resp.filter((x) => x.surveyId === sv.id).sort(orden)) {
      for (const q of sv.questions || []) {
        const chosen = (r.answers && r.answers[q.id]) || [];
        if (!chosen.length) continue;
        const acc = porPregunta.get(`${sv.id}|${q.id}`); acc.respondieron.add(String(r.respondentId));
        for (const to of chosen) { acc.elecciones++; respuestas.push([sv.title, q.text, TIPO[q.tp] || q.tp, nombre(r.respondentId), grupoDe(r.respondentId), nombre(to), grupoDe(to), when(r.submittedAt)]); }
      }
    }
  }
  const preguntas = [["Encuesta", "Pregunta", "Tipo", "Estudiantes que respondieron", "Elecciones", "Elecciones por estudiante (promedio)"]];
  for (const { sv, q, respondieron: rs, elecciones } of porPregunta.values()) preguntas.push([sv.title, q.text, TIPO[q.tp] || q.tp, rs.size, elecciones, rs.size ? Math.round((elecciones / rs.size) * 100) / 100 : 0]);

  const w = (...a) => a;
  return {
    resumen: { participantes: scopeStudents.length, respuestas: resp.length, elecciones: respuestas.length - 1, conexiones: conns.length },
    sheets: [
      { name: "Léeme", rows: leeme, widths: w(30, 100) },
      { name: "Índices", header: true, rows: indices, widths: w(24, 18, 8, 8, 16, 14, 14, 12, 12, 10, 11, 14, 12) },
      { name: "Conexiones", header: true, rows: conexiones, widths: w(24, 18, 24, 18, 14, 11, 11, 11, 11, 15) },
      { name: "Matriz", header: true, rows: matriz, widths: [24, ...scopeStudents.map(() => 12), 11, 12] },
      { name: "Respuestas", header: true, rows: respuestas, widths: w(26, 52, 15, 24, 18, 24, 18, 18) },
      { name: "Por pregunta", header: true, rows: preguntas, widths: w(26, 56, 12, 16, 12, 18) },
    ],
  };
}

export function resultsFileName({ colegio = "", group = "Todos", surveyTitle = "", date = new Date() }) {
  const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const partes = ["resultados_rednexo", slug(colegio), surveyTitle ? slug(surveyTitle) : "", group !== "Todos" ? slug(group) : "", date.toISOString().slice(0, 10)].filter(Boolean);
  return partes.join("_").slice(0, 120) + ".xlsx";
}
