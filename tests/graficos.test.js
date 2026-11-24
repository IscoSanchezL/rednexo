import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReport, ROLE_HELP } from "../src/lib/reports.js";
import { ROLES_ORDEN, ROL_COLOR, rolesPorGrupo, puntosDispersion, mapaCalorGrupos, rankingMutuas, redIndividual, compararAplicaciones, maxEje } from "../src/lib/graficos.js";
import { GLOSARIO } from "../src/lib/glosario.js";
import { esObligatoria, faltaRespuesta } from "../src/lib/justificacion.js";
import { exportSurveyJSON, parseSurveyImport } from "../src/lib/surveys.js";

const ST = ["A", "B", "C", "D", "E", "F"].map((n, i) => ({ id: String(i + 1), name: "Est " + n, group: i < 3 ? "G1" : "G2", av: n }));
const K = (f, t, types) => ({ f, t, types, tp: types[0], s: 1, counts: { pos: +types.includes("pos"), neu: +types.includes("neu"), neg: +types.includes("neg") } });
const CN = [K("1", "2", ["pos"]), K("2", "1", ["pos"]), K("1", "3", ["neg"]), K("3", "1", ["neg"]), K("4", "1", ["pos"]), K("2", "5", ["pos"]), K("5", "6", ["neu"])];
const rep = computeReport(ST, CN);

test("cada rol tiene color y explicación en el glosario", () => {
  for (const k of ROLES_ORDEN) { assert.ok(ROL_COLOR[k], k); assert.ok(GLOSARIO[k]?.que && GLOSARIO[k]?.vigilar, k); assert.ok(ROLE_HELP[k], k); }
  for (const k of ["densidad", "aceptacion", "rechazo", "expansion", "conexiones", "mutuas"]) assert.ok(GLOSARIO[k].como, k);
});

test("roles por grupo suman los estudiantes de cada grupo", () => {
  const r = rolesPorGrupo(rep);
  assert.deepEqual(r.map((g) => g.group), ["G1", "G2"]);
  for (const g of r) assert.equal(ROLES_ORDEN.reduce((a, k) => a + g.porRol[k].length, 0), g.total);
});

test("dispersión: un punto por estudiante con aceptación y rechazo", () => {
  const p = puntosDispersion(rep);
  assert.equal(p.length, 6);
  const e1 = p.find((x) => x.id === "1");
  assert.equal(e1.x, Number(rep.rows[0].popularidad)); assert.equal(e1.y, Number(rep.rows[0].rechazo));
  assert.ok(p.every((q) => typeof q.x === "number" && typeof q.y === "number" && Number.isFinite(q.x)));   // los % del informe son texto: deben llegar como número
});

test("mapa de calor entre grupos cuenta por tipo y dirección", () => {
  const m = mapaCalorGrupos(ST, CN, "pos");
  assert.equal(m.celdas.G1.G1, 2);      // 1→2 y 2→1
  assert.equal(m.celdas.G2.G1, 1);      // 4→1
  assert.equal(m.celdas.G1.G2, 1);      // 2→5
  const n = mapaCalorGrupos(ST, CN, "neg");
  assert.equal(n.celdas.G1.G1, 2); assert.equal(n.max, 2);
});

test("ranking de mutuas: positivas y rechazos mutuos", () => {
  const pos = rankingMutuas(rep, "pos");
  assert.deepEqual(pos.map((x) => x.id).sort(), ["1", "2"]);
  const neg = rankingMutuas(rep, "neg");
  assert.deepEqual(neg.map((x) => x.id).sort(), ["1", "3"]);
  assert.equal(rankingMutuas(rep, "pos", 1).length, 1);
});

test("red individual clasifica lo que da y lo que recibe cada vecino", () => {
  const red = redIndividual("1", ST, CN);
  const por = Object.fromEntries(red.map((n) => [n.id, n]));
  assert.equal(por["2"].mutuaPos, true);
  assert.equal(por["3"].mutuaNeg, true);
  assert.equal(por["4"].recibe.pos, 1); assert.equal(por["4"].mutuaPos, false);
  assert.equal(por["5"], undefined);
});

test("comparar aplicaciones detecta cambio de rol y de rechazo", () => {
  const rep2 = computeReport(ST, CN.filter((c) => !(c.f === "3" && c.t === "1")));
  const c = compararAplicaciones(rep, rep2);
  assert.equal(c.cambios.length, 6);
  const e1 = c.cambios.find((x) => x.id === "1");
  assert.ok(e1.dRechazo < 0);
});

test("maxEje redondea hacia un máximo legible", () => {
  assert.equal(maxEje(0), 10); assert.equal(maxEje(12), 20); assert.equal(maxEje(48.1), 50); assert.equal(maxEje(100), 100);
});

test("pregunta obligatoria: de selección exige elegir a alguien; abierta exige texto", () => {
  const sel = { id: "q1", text: "x", tp: "pos" };
  assert.equal(esObligatoria(sel), false);
  assert.equal(faltaRespuesta(sel, [], ""), false);          // opcional: se puede dejar en blanco
  const o = { ...sel, obligatoria: true };
  assert.equal(faltaRespuesta(o, [], ""), true);
  assert.equal(faltaRespuesta(o, ["2"], ""), false);
  const ab = { id: "q2", text: "y", tp: "neu", kind: "abierta", obligatoria: true };
  assert.equal(faltaRespuesta(ab, [], "  "), true);
  assert.equal(faltaRespuesta(ab, [], "ok"), true);          // muy corta (mínimo 3)
  assert.equal(faltaRespuesta(ab, [], "Más respeto"), false);
  assert.equal(faltaRespuesta({ ...ab, obligatoria: false }, [], ""), false);
});

test("la obligatoriedad viaja en la exportación e importación JSON", () => {
  const sv = { title: "T", maxSel: 2, questions: [{ id: "a", text: "Obligatoria", tp: "pos", obligatoria: true }, { id: "b", text: "Opcional", tp: "neg" }] };
  const j = exportSurveyJSON(sv);
  assert.equal(j.preguntas[0].obligatoria, true); assert.equal("obligatoria" in j.preguntas[1], false);
  const r = parseSurveyImport(JSON.stringify(j), "t.json");
  assert.equal(r.ok, true);
  assert.equal(r.survey.questions[0].obligatoria, true); assert.equal(r.survey.questions[1].obligatoria, undefined);
});
