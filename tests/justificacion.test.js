import test from "node:test";
import assert from "node:assert/strict";
import { kindOf, esJustificable, justKey, cleanJustText, buildJustificaciones, justificacionesFaltantes, parseKind, kindToText, MAX_JUST, MIN_JUST } from "../src/lib/justificacion.js";
import { buildConnections } from "../src/lib/sociometry.js";
import { computeReport, renderReportHTML } from "../src/lib/reports.js";
import { exportSurveyJSON, surveyToCSV, parseSurveyImport } from "../src/lib/surveys.js";

const Q = [{ id: "q1", text: "¿Con quién trabajarías?", tp: "pos", kind: "justificable" }, { id: "q2", text: "¿Con quién NO?", tp: "neg", kind: "justificable" }, { id: "q3", text: "¿Líder?", tp: "neu" }];

test("tipo de pregunta: selección por defecto (también las antiguas) y justificable solo si se indica", () => {
  assert.equal(kindOf({}), "seleccion"); assert.equal(kindOf(undefined), "seleccion"); assert.equal(kindOf({ kind: "raro" }), "seleccion");
  assert.equal(kindOf({ kind: "justificable" }), "justificable"); assert.equal(esJustificable({ kind: "justificable" }), true); assert.equal(esJustificable({ tp: "pos" }), false);
});
test("limpieza del texto: sin caracteres de control, espacios colapsados, máximo 280", () => {
  assert.equal(cleanJustText("  hola \u0000   mundo\u0007 "), "hola mundo");
  assert.equal(cleanJustText("a".repeat(500)).length, MAX_JUST);
  assert.equal(cleanJustText(null), ""); assert.equal(cleanJustText("línea 1\n\n\n\nlínea 2"), "línea 1\n\nlínea 2");
});
test("lo que se guarda: solo personas elegidas, preguntas justificables y textos no vacíos", () => {
  const answers = { q1: ["2", "3"], q2: ["4"], q3: ["2"] };
  const textos = { [justKey("q1", "2")]: " Me ayuda ", [justKey("q1", "3")]: "   ", [justKey("q2", "4")]: "Me molesta", [justKey("q3", "2")]: "no se pidió", [justKey("q1", "9")]: "ya no está elegido" };
  assert.deepEqual(buildJustificaciones(answers, textos, Q), { "q1|2": "Me ayuda", "q2|4": "Me molesta" });
  assert.deepEqual(buildJustificaciones({}, {}, Q), {});
});
test("la justificación es obligatoria: faltan los que tienen menos de 3 letras; en las de selección nunca falta", () => {
  assert.deepEqual(justificacionesFaltantes(Q[1], ["4", "5"], { "q2|4": "ok", "q2|5": "Es agresivo" }), ["4"]);
  assert.deepEqual(justificacionesFaltantes(Q[0], ["2", "3"], {}), ["2", "3"]);
  assert.deepEqual(justificacionesFaltantes(Q[1], ["4"], { "q2|4": "a".repeat(MIN_JUST) }), []);
  assert.deepEqual(justificacionesFaltantes(Q[2], ["2"], {}), []);
});
test("archivos: valores del campo «formato» y su texto de vuelta", () => {
  assert.deepEqual(["", "seleccion", "Justificable", "JUSTIFICACIÓN", "x"].map(parseKind), ["seleccion", "seleccion", "justificable", "justificable", "seleccion"]);
  assert.deepEqual(["seleccion", "justificable"].map(kindToText), ["seleccion", "justificable"]);
});
test("exportar e importar encuestas conserva el tipo de pregunta (JSON y CSV)", () => {
  const sv = { title: "T", maxSel: 3, questions: Q };
  const j = exportSurveyJSON(sv);
  assert.equal(j.preguntas[0].formato, "justificable"); assert.ok(!("formato" in j.preguntas[2]));
  assert.deepEqual(parseSurveyImport(JSON.stringify(j), "x.json").survey.questions.map((q) => q.kind), ["justificable", "justificable", undefined]);
  const csv = surveyToCSV(sv);
  assert.match(csv, /pregunta;tipo;formato/);
  assert.deepEqual(parseSurveyImport(csv, "x.csv").survey.questions.map((q) => q.kind), ["justificable", "justificable", undefined]);
  // Encuestas sin preguntas justificables: el archivo no cambia (sin la columna)
  assert.equal(surveyToCSV({ questions: [{ text: "a", tp: "pos" }] }).includes("formato"), false);
});
test("las conexiones llevan las explicaciones; sin ellas, ni el campo", () => {
  const sv = [{ id: "s", questions: Q }];
  const rs = [{ surveyId: "s", respondentId: "1", answers: { q1: ["2"], q2: ["2"], q3: ["3"] }, justificaciones: { "q1|2": "Siempre me ayuda", "q2|2": "Me grita", "q1|9": "ajena" } }, { surveyId: "s", respondentId: "2", answers: { q1: ["1"] } }];
  const c = buildConnections(rs, sv);
  const c12 = c.find((x) => x.f === "1" && x.t === "2"), c13 = c.find((x) => x.f === "1" && x.t === "3"), c21 = c.find((x) => x.f === "2");
  assert.deepEqual(c12.notas, [{ q: "¿Con quién trabajarías?", tp: "pos", text: "Siempre me ayuda" }, { q: "¿Con quién NO?", tp: "neg", text: "Me grita" }]);
  assert.ok(!("notas" in c13) && !("notas" in c21));
  assert.equal(c12.types.length, 2);       // la elección se cuenta igual, con o sin texto
  assert.deepEqual(buildConnections([{ surveyId: "s", respondentId: "1", answers: { q1: ["2"] }, justificaciones: { "q1|2": 123 } }], sv)[0].notas, undefined);   // no es texto: se ignora
});
test("informe: sección de explicaciones, fichas, escape y nada en el grupal", () => {
  const st = [{ id: "1", name: "Ana", group: "A" }, { id: "2", name: "Beto <b>", group: "A" }, { id: "3", name: "Carla", group: "A" }];
  const sv = [{ id: "s", questions: Q }];
  const rs = [{ surveyId: "s", respondentId: "1", answers: { q1: ["2"], q2: ["3"] }, justificaciones: { "q1|2": "Me ayuda <script>alert(1)</script>", "q2|3": "No comparte" } }];
  const rep = computeReport(st, buildConnections(rs, sv));
  assert.equal(rep.kpis.justificaciones, 2);
  assert.equal(rep.fichas.find((f) => f.row.student.id === "2").notasRecibidas[0].de, "Ana");
  assert.equal(rep.fichas.find((f) => f.row.student.id === "1").notasHechas.length, 2);
  const h = renderReportHTML(rep, { type: "individual" });
  assert.match(h, /Explicaciones de las elecciones/); assert.match(h, /¿Con quién trabajarías\?/);
  assert.match(h, /<td>Ana<\/td><td>Beto &lt;b&gt;<\/td><td><i>«Me ayuda &lt;script&gt;/);
  assert.doesNotMatch(h, /<script>alert/);
  assert.match(h, /Por qué lo eligieron o marcaron/); assert.match(h, /Por qué eligió o marcó a cada uno/);
  const g = renderReportHTML(rep, { type: "grupal" });
  assert.doesNotMatch(g, /Me ayuda|No comparte|Explicaciones de las elecciones/);
  // sin explicaciones no aparece la sección
  assert.doesNotMatch(renderReportHTML(computeReport(st, buildConnections([{ surveyId: "s", respondentId: "1", answers: { q1: ["2"] } }], sv)), { type: "individual" }), /Explicaciones de las elecciones/);
});

// ── Preguntas abiertas ──
import { esAbierta, buildAbiertas, cleanOpenText, MAX_ABIERTA } from "../src/lib/justificacion.js";
import { listarAbiertas } from "../src/lib/abiertas.js";
import { countTipos } from "../src/lib/surveys.js";
import { buildResultsSheets } from "../src/lib/results.js";

const QA = [{ id: "q1", text: "¿Con quién trabajarías?", tp: "pos" }, { id: "q2", text: "¿Qué mejorarías del salón?", tp: "neu", kind: "abierta" }, { id: "q3", text: "¿Alguna sugerencia?", tp: "neu", kind: "abierta" }, { id: "q4", text: "¿Por qué?", tp: "pos", kind: "justificable" }];

test("tipos de pregunta: seleccion, justificable y abierta", () => {
  assert.deepEqual(QA.map(kindOf), ["seleccion", "abierta", "abierta", "justificable"]);
  assert.deepEqual(QA.map(esAbierta), [false, true, true, false]);
  assert.equal(esJustificable(QA[1]), false);   // una abierta no pide elegir ni justificar
});
test("respuestas abiertas que se guardan: solo de preguntas abiertas, con texto, limpias y acotadas", () => {
  const t = { q1: "no es abierta", q2: "  Más   luz  \u0000 ", q3: "   ", q4: "tampoco", qX: "inexistente" };
  assert.deepEqual(buildAbiertas(t, QA), { q2: "Más luz" });
  assert.equal(cleanOpenText("a".repeat(900)).length, MAX_ABIERTA);
  assert.deepEqual(buildAbiertas({}, QA), {});
});
test("una pregunta abierta no cuenta como positiva/negativa/neutral en el resumen", () => {
  assert.deepEqual(countTipos(QA), { pos: 2, neu: 0, neg: 0 });
});
test("archivos: el formato «abierta» se conserva y el tipo no hace falta", () => {
  assert.equal(parseKind("Abierta"), "abierta"); assert.equal(parseKind("texto libre"), "abierta");
  const j = exportSurveyJSON({ title: "T", maxSel: 3, questions: QA });
  assert.equal(j.preguntas[1].formato, "abierta");
  const csv = "pregunta;tipo;formato\n¿Con quién?;positiva;seleccion\n¿Qué mejorarías?;;abierta\n¿Y la sugerencia?;;abierta\n";
  const r = parseSurveyImport(csv, "x.csv");
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.survey.questions.map((q) => [q.kind, q.tp]), [[undefined, "pos"], ["abierta", "neu"], ["abierta", "neu"]]);
  assert.deepEqual(parseSurveyImport(JSON.stringify(j), "x.json").survey.questions.map((q) => q.kind), [undefined, "abierta", "abierta", "justificable"]);
  // una pregunta de selección sigue exigiendo su tipo
  assert.equal(parseSurveyImport("pregunta;tipo;formato\n¿Con quién?;;seleccion\n", "x.csv").ok, false);
});
test("lista de respuestas abiertas: por pregunta y estudiante, sin papelera ni estudiantes ajenos, filtrando por encuesta", () => {
  const st = [{ id: "1", name: "Ana", group: "A" }, { id: "2", name: "Beto", group: "A" }];
  const sv = [{ id: "s1", title: "E1", questions: QA }, { id: "s2", title: "E2", questions: QA }, { id: "s3", title: "Borrada", deleted: true, questions: QA }];
  const rs = [{ surveyId: "s1", respondentId: "2", abiertas: { q2: "Más luz", q3: "" } }, { surveyId: "s1", respondentId: "1", abiertas: { q2: "Menos ruido", q3: "Un buzón" } },
    { surveyId: "s2", respondentId: "1", abiertas: { q2: "Otra encuesta" } }, { surveyId: "s3", respondentId: "1", abiertas: { q2: "papelera" } }, { surveyId: "s1", respondentId: "9", abiertas: { q2: "ajeno" } }];
  const todas = listarAbiertas(rs, sv, st);
  assert.deepEqual(todas.map((f) => [f.pregunta, f.de, f.text]), [["¿Alguna sugerencia?", "Ana", "Un buzón"], ["¿Qué mejorarías del salón?", "Ana", "Menos ruido"], ["¿Qué mejorarías del salón?", "Ana", "Otra encuesta"], ["¿Qué mejorarías del salón?", "Beto", "Más luz"]]);
  assert.equal(listarAbiertas(rs, sv, st, { surveyId: "s2" }).length, 1);
});
test("informe: sección «Respuestas abiertas» en individual y completo (con nombre); el grupal no la lleva", () => {
  const st = [{ id: "1", name: "Ana", group: "A" }, { id: "2", name: "Beto", group: "A" }];
  const sv = [{ id: "s1", title: "E1", questions: QA }];
  const rs = [{ surveyId: "s1", respondentId: "1", abiertas: { q2: "Más <b>luz</b>" } }];
  const rep = computeReport(st, [], { abiertas: listarAbiertas(rs, sv, st) });
  assert.equal(rep.kpis.abiertas, 1);
  const h = renderReportHTML(rep, { type: "individual" });
  assert.match(h, /Respuestas abiertas/); assert.match(h, /<td>Ana<\/td><td>A<\/td><td><i>«Más &lt;b&gt;luz&lt;\/b&gt;»/);
  assert.doesNotMatch(h, /<b>luz<\/b>/);
  assert.doesNotMatch(renderReportHTML(rep, { type: "grupal" }), /Más |Respuestas abiertas/);
  assert.doesNotMatch(renderReportHTML(computeReport(st, []), { type: "individual" }), /Respuestas abiertas/);
});
test("Excel: hoja «Abiertas» solo si hay preguntas abiertas, y «Por pregunta» las cuenta sin elecciones", () => {
  const st = [{ id: "1", name: "Ana", group: "A" }, { id: "2", name: "Beto", group: "A" }];
  const sv = [{ id: "s1", title: "E1", groups: ["A"], questions: QA }];
  const rs = [{ surveyId: "s1", respondentId: "1", answers: { q1: ["2"] }, abiertas: { q2: "Más luz" } }, { surveyId: "s1", respondentId: "2", answers: {}, abiertas: { q2: "Menos ruido", q3: "Un buzón" } }];
  const r = buildResultsSheets({ students: st, surveys: sv, responses: rs });
  assert.ok(r.sheets.some((h) => h.name === "Abiertas"));
  const ab = r.sheets.find((h) => h.name === "Abiertas").rows;
  assert.deepEqual(ab[0], ["Encuesta", "Pregunta", "Estudiante", "Grupo", "Respuesta"]); assert.equal(ab.length, 4);
  const pp = r.sheets.find((h) => h.name === "Por pregunta").rows;
  const fila = pp.find((x) => x[1] === "¿Qué mejorarías del salón?");
  assert.deepEqual([fila[2], fila[3], fila[4]], ["Abierta", 2, 0]);
  const sinAb = buildResultsSheets({ students: st, surveys: [{ id: "s1", title: "E", groups: ["A"], questions: [QA[0]] }], responses: [{ surveyId: "s1", respondentId: "1", answers: { q1: ["2"] } }] });
  assert.ok(!sinAb.sheets.some((h) => h.name === "Abiertas"));
});
test("las preguntas abiertas no generan conexiones", () => {
  const c = buildConnections([{ surveyId: "s", respondentId: "1", answers: {}, abiertas: { q2: "hola" } }], [{ id: "s", questions: QA }]);
  assert.deepEqual(c, []);
});
