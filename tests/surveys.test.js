import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATE_QUESTIONS, buildTemplateSurvey, parseTipo, countTipos, exportSurveyJSON, surveyToCSV, surveyFileName, parseCSV, parseSurveyImport } from "../src/lib/surveys.js";

test("la plantilla de prueba trae preguntas positivas, neutrales y negativas", () => {
  assert.deepEqual(countTipos(TEMPLATE_QUESTIONS), { pos: 3, neu: 2, neg: 2 });
  const s = buildTemplateSurvey(["5A", "5B"]);
  assert.deepEqual([s.groups, s.group, s.maxSel, s.anon, s.questions.length], [["5A", "5B"], "5A", 3, true, 7]);
  assert.equal(buildTemplateSurvey([]).group, "");
  s.questions[0].text = "x"; assert.notEqual(TEMPLATE_QUESTIONS[0].text, "x");     // es una copia
});
test("tipo: acepta español, inglés, símbolos, tildes y mayúsculas; rechaza lo demás", () => {
  for (const [v, e] of [["Positiva", "pos"], [" POS ", "pos"], ["+", "pos"], ["neutral", "neu"], ["Neutra", "neu"], ["0", "neu"], ["Negativa", "neg"], ["-", "neg"], ["negative", "neg"]]) assert.equal(parseTipo(v), e, v);
  for (const v of ["", null, undefined, "medio", "positivo!"]) assert.equal(parseTipo(v), null, String(v));
});
test("exportar JSON y CSV conservan texto, tildes, ñ y el tipo de cada pregunta", () => {
  const sv = { title: "Año 2026 — Ñandú", maxSel: 2, anon: false, questions: [{ text: "¿Con quién, \"sí\" o no?", tp: "pos" }, { text: "¿Quién lidera?", tp: "neu" }, { text: "¿Con quién NO?", tp: "neg" }] };
  const j = exportSurveyJSON(sv);
  assert.deepEqual([j.formato, j.maxSel, j.anonima, j.preguntas.map((p) => p.tipo)], ["rednexo-encuesta-v1", 2, false, ["positiva", "neutral", "negativa"]]);
  const csv = surveyToCSV(sv);
  assert.ok(csv.startsWith("﻿pregunta;tipo\r\n"));
  assert.ok(csv.includes('"¿Con quién, ""sí"" o no?";positiva'));
});
test("nombre de archivo sin tildes ni símbolos y con fecha", () => {
  assert.equal(surveyFileName({ title: "Año 2026 — Ñandú" }, "csv", new Date("2026-11-05T10:00:00Z")), "encuesta-ano-2026-nandu-2026-11-05.csv");
  assert.equal(surveyFileName({ title: "***" }, "json", new Date("2026-01-02T00:00:00Z")), "encuesta-encuesta-2026-01-02.json");
});
test("ida y vuelta: lo que se exporta en JSON o CSV se vuelve a importar idéntico", () => {
  const sv = { title: "Mi encuesta", maxSel: 4, anon: false, questions: [{ text: "¿Con quién, \"sí\" o no?", tp: "pos" }, { text: "Línea uno\nlínea dos", tp: "neu" }, { text: "¿Con quién NO?", tp: "neg" }] };
  const esperado = [{ text: "¿Con quién, \"sí\" o no?", tp: "pos" }, { text: "Línea uno línea dos", tp: "neu" }, { text: "¿Con quién NO?", tp: "neg" }];
  const a = parseSurveyImport(JSON.stringify(exportSurveyJSON(sv)), "x.json");
  assert.ok(a.ok); assert.deepEqual(a.survey.questions, esperado); assert.deepEqual([a.survey.title, a.survey.maxSel, a.survey.anon], ["Mi encuesta", 4, false]);
  const b = parseSurveyImport(surveyToCSV(sv), "encuesta-mi-encuesta-2026-11-05.csv");
  assert.ok(b.ok); assert.deepEqual(b.survey.questions, esperado); assert.equal(b.survey.title, "mi encuesta");
});
test("CSV: separador «,» o «;», con o sin encabezado, comillas y finales de línea de Windows", () => {
  const a = parseSurveyImport("pregunta,tipo\n¿Uno?,positiva\n¿Dos?,negativa", "a.csv");
  const b = parseSurveyImport("¿Uno?;Positiva\r\n¿Dos?;NEGATIVA\r\n", "b.csv");
  assert.deepEqual(a.survey.questions, [{ text: "¿Uno?", tp: "pos" }, { text: "¿Dos?", tp: "neg" }]);
  assert.deepEqual(b.survey.questions, a.survey.questions);
  assert.deepEqual(parseCSV('a,"b,c"\n"d""e",f'), [["a", "b,c"], ['d"e', "f"]]);
});
test("errores claros con el número de fila y sin importar nada a medias", () => {
  const r = parseSurveyImport("pregunta;tipo\n¿Uno?;positiva\n¿Dos?;regular\n;neutral\n¿Cuatro?;", "e.csv");
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ["Fila 3: el tipo «regular» no es válido (usa positiva, neutral o negativa).", "Fila 4: la pregunta está vacía.", "Fila 5: el tipo «» no es válido (usa positiva, neutral o negativa)."]);
});
test("duplicadas se omiten con aviso; límites y archivos inválidos se rechazan sin lanzar errores", () => {
  const d = parseSurveyImport("¿Uno?;pos\n¿uno?;pos\n¿Uno?;neg", "d.csv");
  assert.deepEqual([d.ok, d.survey.questions.length, d.warnings.length], [true, 2, 1]);
  assert.equal(parseSurveyImport("", "x.csv").ok, false);
  assert.equal(parseSurveyImport("   \n  ", "x.csv").ok, false);
  assert.match(parseSurveyImport("{no es json", "x.json").errors[0], /JSON no es válido/);
  assert.match(parseSurveyImport('{"titulo":"x"}', "x.json").errors[0], /lista de preguntas/);
  assert.equal(parseSurveyImport("x".repeat(200001), "x.csv").ok, false);
  const muchas = Array.from({ length: 41 }, (_, i) => `Pregunta ${i};pos`).join("\n");
  assert.match(parseSurveyImport(muchas, "m.csv").errors.join(" "), /máximo es 40/);
  assert.match(parseSurveyImport("x".repeat(301) + ";pos", "l.csv").errors[0], /pasa de 300/);
});
test("JSON tolerante: lista de textos con tipo, formato interno y valores fuera de rango", () => {
  const a = parseSurveyImport('{"titulo":"T","maxSel":99,"preguntas":[{"texto":"¿A?","tipo":"positiva"}]}', "a.json");
  assert.equal(a.survey.maxSel, 3);
  const b = parseSurveyImport('{"title":"T","questions":[{"text":"¿B?","tp":"neg"}]}', "b.json");
  assert.deepEqual(b.survey.questions, [{ text: "¿B?", tp: "neg" }]);
  const c = parseSurveyImport('[{"texto":"¿C?","tipo":"neutral"}]', "");
  assert.deepEqual([c.ok, c.survey.title], [true, "Encuesta importada"]);                   // sin título ni nombre de archivo
  assert.equal(parseSurveyImport('[{"texto":"¿C?","tipo":"neutral"}]', "mi-encuesta.json").survey.title, "mi encuesta");   // título tomado del nombre del archivo
});
test("seguridad: se quitan caracteres de control y se neutralizan fórmulas de Excel al exportar y al importar", () => {
  const sv = { title: "T", questions: [{ text: "=HYPERLINK(\"http://x\")", tp: "pos" }, { text: "-2+3", tp: "neg" }] };
  const csv = surveyToCSV(sv);
  assert.ok(csv.includes("'=HYPERLINK") && csv.includes("'-2+3"));
  assert.deepEqual(parseSurveyImport(csv, "f.csv").survey.questions, sv.questions);                       // se recupera el texto original
  assert.equal(parseSurveyImport("Hola\u0000\u0007 mundo;pos", "c.csv").survey.questions[0].text, "Hola mundo");
  assert.equal(parseSurveyImport('[{"texto":"<script>alert(1)</script>","tipo":"pos"}]', "s.json").survey.questions[0].text, "<script>alert(1)</script>");   // se guarda como texto; React lo muestra escapado
});
