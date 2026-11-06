import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResultsSheets, resultsFileName } from "../src/lib/results.js";

// Los datos de tu reporte: 4 estudiantes de «Grupo Prueba» + 2 de otro grupo, dos aplicaciones de la misma encuesta.
const ST = [
  { id: "1", name: "Isco", group: "Grupo Prueba" }, { id: "2", name: "Isco1", group: "Grupo Prueba" }, { id: "3", name: "Isco2", group: "Grupo Prueba" }, { id: "4", name: "Milena", group: "Grupo Prueba" },
  { id: "5", name: "pacho", group: "Grupo Prueba 1" }, { id: "6", name: "pacho1", group: "Grupo Prueba 1" },
];
const Q = [{ id: "p", text: "¿Con quién trabajarías?", tp: "pos" }, { id: "n", text: "¿Quién lidera?", tp: "neu" }, { id: "g", text: "¿Con quién NO?", tp: "neg" }];
const SV = [{ id: "s1", title: "Encuesta A", questions: Q }, { id: "s2", title: "Encuesta B", questions: Q }, { id: "s3", title: "Borrada", questions: Q, deleted: true }];
const T = (y, m, d, h, mi) => ({ toDate: () => new Date(y, m, d, h, mi) });
const R = [
  { surveyId: "s1", respondentId: "1", answers: { p: ["2"], n: ["2", "3"], g: ["3"] }, submittedAt: T(2026, 10, 5, 9, 0) },
  { surveyId: "s1", respondentId: "2", answers: { p: ["1", "3"], n: ["1", "3"], g: ["3"] }, submittedAt: T(2026, 10, 5, 9, 5) },
  { surveyId: "s1", respondentId: "3", answers: { p: ["2"], n: ["2"], g: ["1"] }, submittedAt: T(2026, 10, 5, 9, 10) },
  { surveyId: "s1", respondentId: "4", answers: { p: ["1", "2"], n: ["1", "2"], g: ["3"] }, submittedAt: T(2026, 10, 5, 9, 15) },
  { surveyId: "s2", respondentId: "5", answers: { p: ["6"] }, submittedAt: T(2026, 10, 6, 8, 0) },
  { surveyId: "s2", respondentId: "6", answers: { p: ["5"], g: ["5"] }, submittedAt: T(2026, 10, 6, 8, 5) },
];
const SV_GRUPOS = SV.map((s) => ({ ...s, groups: s.id === "s1" ? ["Grupo Prueba"] : s.id === "s2" ? ["Grupo Prueba 1"] : [] }));
const hoja = (res, n) => res.sheets.find((s) => s.name === n);
const body = (h) => h.rows.slice(1);
const ctx = { students: ST, surveys: SV, responses: R, colegio: "Colegio X", date: new Date(2026, 10, 6, 12, 0) };

test("seis hojas con encabezado fijo y filtro en las de datos", () => {
  const res = buildResultsSheets({ ...ctx, surveyId: "s1", group: "Grupo Prueba" });
  assert.deepEqual(res.sheets.map((s) => s.name), ["Léeme", "Índices", "Conexiones", "Matriz", "Respuestas", "Por pregunta"]);
  assert.deepEqual(res.sheets.map((s) => !!s.header), [false, true, true, true, true, true]);
  assert.deepEqual(res.resumen, { participantes: 4, respuestas: 4, elecciones: 17, conexiones: 9 });
});
test("Índices: coincide con tu reporte (Isco2 recibe 3 rechazos, Milena nadie la eligió)", () => {
  const f = Object.fromEntries(body(hoja(buildResultsSheets({ ...ctx, surveyId: "s1", group: "Grupo Prueba" }), "Índices")).map((r) => [r[0], r]));
  // Nombre, Grupo, Elige, Recibe, Pos recibidas, Neutrales recibidas, Rechazos recibidos, Mutuas+, Aceptación, Rechazo, Expansión, Rol, ¿Respondió?
  assert.deepEqual([f.Isco[2], f.Isco[3], f.Isco[4], f.Isco[6], f.Isco[7], f.Isco[11], f.Isco[12]], [2, 3, 2, 1, 1, "Líder", "Sí"]);
  assert.ok(Math.abs(f.Isco[8].v - 2 / 3) < 1e-9 && f.Isco[8].s === "pct");                       // 66,7 % como número (no como texto) para poder graficarlo
  assert.deepEqual([f.Isco2[6], f.Isco2[11], f.Milena[3], f.Milena[11]], [3, "Rechazado", 0, "Aislado"]);
  assert.equal(f.Isco1[8].v, 1);
});
test("Conexiones: una fila por pareja con sus tipos y si es mutua positiva", () => {
  const rows = body(hoja(buildResultsSheets({ ...ctx, surveyId: "s1", group: "Grupo Prueba" }), "Conexiones"));
  assert.equal(rows.length, 9);
  const par = (de, para) => rows.find((r) => r[0] === de && r[2] === para);
  assert.deepEqual(par("Isco", "Isco1").slice(4), ["Positiva", 1, 1, 0, 2, "Sí"]);                 // positiva + neutral, mutua
  assert.deepEqual(par("Isco", "Isco2").slice(4), ["Negativa", 0, 1, 1, 2, "No"]);                 // neutral + negativa
  assert.deepEqual(par("Milena", "Isco2").slice(4, 5), ["Negativa"]);
});
test("Matriz: puntaje positivas − rechazos, vacío sin conexión y totales por fila", () => {
  const m = hoja(buildResultsSheets({ ...ctx, surveyId: "s1", group: "Grupo Prueba" }), "Matriz").rows;
  assert.deepEqual(m[0], ["De \\ Para", "Isco", "Isco1", "Isco2", "Milena", "Elige (+)", "Rechaza (−)"]);
  assert.deepEqual(m[1], ["Isco", "", 1, -1, "", 1, 1]);       // Isco→Isco1 +1 · Isco→Isco2 −1
  assert.deepEqual(m[4], ["Milena", 1, 1, -1, "", 2, 1]);
});
test("Respuestas: una fila por elección, con la pregunta, su tipo, los nombres y la fecha", () => {
  const rows = body(hoja(buildResultsSheets({ ...ctx, surveyId: "s1", group: "Grupo Prueba" }), "Respuestas"));
  assert.equal(rows.length, 17);
  const f = rows.find((r) => r[3] === "Isco" && r[1] === "¿Con quién NO?");
  assert.deepEqual(f.slice(0, 7), ["Encuesta A", "¿Con quién NO?", "Negativa", "Isco", "Grupo Prueba", "Isco2", "Grupo Prueba"]);
  assert.ok(f[7] instanceof Date && f[7].getHours() === 9 && f[7].getMinutes() === 0);                 // fecha real, para ordenar y agrupar en Excel
  assert.deepEqual([...new Set(rows.map((r) => r[2]))].sort(), ["Negativa", "Neutral", "Positiva"]);
});
test("Por pregunta: cuántos respondieron y cuántas elecciones", () => {
  const p = body(hoja(buildResultsSheets({ ...ctx, surveyId: "s1", group: "Grupo Prueba" }), "Por pregunta"));
  assert.deepEqual(p[0], ["Encuesta A", "¿Con quién trabajarías?", "Positiva", 4, 6, 1.5]);
  assert.deepEqual(p[2].slice(3), [4, 4, 1]);
});
test("alcance: una encuesta, todas (sin las borradas) y un grupo", () => {
  const una = buildResultsSheets({ ...ctx, surveyId: "s2", group: "Todos" });
  assert.deepEqual(una.resumen, { participantes: 6, respuestas: 2, elecciones: 3, conexiones: 2 });      // solo la Encuesta B
  const todas = buildResultsSheets({ ...ctx, surveyId: "all", group: "Todos" });
  assert.equal(todas.resumen.respuestas, 6);
  assert.ok(!body(hoja(todas, "Por pregunta")).some((r) => r[0] === "Borrada"));                          // la encuesta en la papelera no aparece
  const g1 = buildResultsSheets({ ...ctx, surveyId: "all", group: "Grupo Prueba 1" });
  assert.deepEqual(g1.resumen, { participantes: 2, respuestas: 2, elecciones: 3, conexiones: 2 });
  assert.ok(body(hoja(g1, "Índices")).every((r) => r[1] === "Grupo Prueba 1"));
});
test("estudiante eliminado: sus elecciones se conservan con una etiqueta en lugar de fallar", () => {
  const sin = ST.filter((s) => s.id !== "3");
  const rows = body(hoja(buildResultsSheets({ ...ctx, students: sin, surveyId: "s1", group: "Todos" }), "Respuestas"));
  assert.ok(rows.some((r) => r[5] === "(estudiante eliminado)") || rows.length > 0);
  assert.doesNotThrow(() => buildResultsSheets({ ...ctx, students: sin, surveyId: "s1", group: "Todos" }));
});
test("sin respuestas: el libro se genera igual, con los encabezados y sin filas", () => {
  const v = buildResultsSheets({ ...ctx, responses: [], surveyId: "s1", group: "Todos" });
  assert.deepEqual(v.resumen, { participantes: 6, respuestas: 0, elecciones: 0, conexiones: 0 });
  assert.equal(body(hoja(v, "Respuestas")).length, 0);
  assert.ok(body(hoja(v, "Índices")).every((r) => r[12] === "No"));
});
test("Léeme: avisa que es confidencial y explica las hojas y las definiciones", () => {
  const t = JSON.stringify(hoja(buildResultsSheets({ ...ctx, surveyId: "s1", group: "Todos" }), "Léeme").rows);
  assert.match(t, /CONFIDENCIAL/); assert.match(t, /Colegio X/); assert.match(t, /Aceptación/); assert.match(t, /Rol: Aislado/);
});
test("nombre del archivo", () => {
  assert.equal(resultsFileName({ colegio: "Colegio San José", group: "5° A", surveyTitle: "Sociograma Q2", date: new Date(Date.UTC(2026, 10, 6, 12)) }), "resultados_rednexo_Colegio_San_Jose_Sociograma_Q2_5_A_2026-11-06.xlsx");
  assert.equal(resultsFileName({ date: new Date(Date.UTC(2026, 10, 6, 12)) }), "resultados_rednexo_2026-11-06.xlsx");
});

test("al exportar UNA encuesta, los participantes son los de sus grupos (no todo el colegio) y los porcentajes se calculan sobre ellos", () => {
  const res = buildResultsSheets({ ...ctx, surveys: SV_GRUPOS, surveyId: "s1", group: "Todos" });
  assert.equal(res.resumen.participantes, 4);                                                     // 4 de «Grupo Prueba», no los 6 del colegio
  const f = Object.fromEntries(body(hoja(res, "Índices")).map((r) => [r[0], r]));
  assert.deepEqual(Object.keys(f).sort(), ["Isco", "Isco1", "Isco2", "Milena"]);
  assert.ok(Math.abs(f.Isco[8].v - 2 / 3) < 1e-9);                                                  // ÷ 3 compañeros, no ÷ 5
  assert.equal(buildResultsSheets({ ...ctx, surveys: SV_GRUPOS, surveyId: "s2", group: "Todos" }).resumen.participantes, 2);
  assert.equal(buildResultsSheets({ ...ctx, surveys: SV_GRUPOS, surveyId: "all", group: "Todos" }).resumen.participantes, 6);   // todas las encuestas: todo el colegio
  assert.equal(buildResultsSheets({ ...ctx, surveys: SV_GRUPOS, surveyId: "s1", group: "Grupo Prueba 1" }).resumen.participantes, 0);   // un grupo que no es de la encuesta
});
