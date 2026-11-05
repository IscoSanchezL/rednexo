import { test } from "node:test";
import assert from "node:assert/strict";
import { initials, parseBulkStudents, density, buildConnections, buildRoster } from "../src/lib/sociometry.js";

test("iniciales", () => {
  assert.equal(initials("Ana García"), "AG");
  assert.equal(initials("  juan  carlos  pérez "), "JC");
  assert.equal(initials("Madonna"), "M");
});

test("importación masiva: una línea por estudiante, sin vacías ni espacios", () => {
  const out = parseBulkStudents("Ana García\n\n  Carlos Ruiz  \r\n   \nMaría López", "5° A", (i) => "id" + i);
  assert.deepEqual(out.map((s) => s.name), ["Ana García", "Carlos Ruiz", "María López"]);
  assert.deepEqual(out.map((s) => s.av), ["AG", "CR", "ML"]);
  assert.ok(out.every((s) => s.group === "5° A"));
  assert.equal(new Set(out.map((s) => s.id)).size, 3);
});
test("importación masiva: texto vacío o nulo no crea nada; ids por defecto son únicos", () => {
  assert.deepEqual(parseBulkStudents("", "5° A"), []);
  assert.deepEqual(parseBulkStudents(null, "5° A"), []);
  const out = parseBulkStudents(Array.from({ length: 200 }, (_, i) => "Est " + i).join("\n"), "6° A");
  assert.equal(new Set(out.map((s) => s.id)).size, 200);
});

test("densidad", () => {
  assert.equal(density(0, 10), "0.0");
  assert.equal(density(90, 10), "100.0");   // 10·9 = 90 posibles
  assert.equal(density(9, 10), "10.0");
  assert.equal(density(1, 3), "16.7");      // 1/6
  assert.equal(density(5, 1), "0.0");       // un solo estudiante: sin división por cero
  assert.equal(density(0, 0), "0.0");
});

const surveys = [{ id: "s1", questions: [{ id: "q1", tp: "pos" }, { id: "q2", tp: "neg" }] }];
test("conexiones: una elección = una conexión del tipo de su pregunta", () => {
  const c = buildConnections([{ surveyId: "s1", respondentId: "1", answers: { q1: ["2", "3"], q2: ["4"] } }], surveys);
  assert.equal(c.length, 3);
  assert.deepEqual(c.find((x) => x.t === "2"), { f: "1", t: "2", s: 1, tp: "pos" });
  assert.equal(c.find((x) => x.t === "4").tp, "neg");
});
test("conexiones: la misma elección repetida suma fuerza hasta 3 y el tipo dominante gana", () => {
  const sv = [{ id: "s1", questions: [{ id: "a", tp: "pos" }, { id: "b", tp: "pos" }, { id: "c", tp: "neg" }, { id: "d", tp: "pos" }] }];
  const c = buildConnections([{ surveyId: "s1", respondentId: "1", answers: { a: ["2"], b: ["2"], c: ["2"], d: ["2"] } }], sv);
  assert.equal(c.length, 1);
  assert.equal(c[0].s, 3);          // 4 elecciones, tope 3
  assert.equal(c[0].tp, "pos");     // 3 pos vs 1 neg
});
test("conexiones: dirección (A→B no es B→A), pregunta/encuesta desconocida → pos, respuestas sin answers se ignoran", () => {
  const c = buildConnections([
    { surveyId: "s1", respondentId: "1", answers: { q1: ["2"] } },
    { surveyId: "s1", respondentId: "2", answers: { q1: ["1"] } },
    { surveyId: "borrada", respondentId: "3", answers: { x: ["1"] } },
    { surveyId: "s1", respondentId: "4" },
    null,
  ], surveys);
  assert.equal(c.length, 3);
  assert.ok(c.some((x) => x.f === "1" && x.t === "2") && c.some((x) => x.f === "2" && x.t === "1"));
  assert.equal(c.find((x) => x.f === "3").tp, "pos");
});
test("conexiones: sin respuestas no hay conexiones", () => {
  assert.deepEqual(buildConnections([], surveys), []);
});

test("lista de nombres de la encuesta pública: solo los grupos de la encuesta, ids como texto", () => {
  const st = [{ id: 1, name: "Ana", group: "5A", av: "A" }, { id: "2", name: "Beto", group: "5B" }, { id: 3, name: "Cami", group: "6A" }];
  const r = buildRoster({ groups: ["5A", "5B"] }, st);
  assert.deepEqual(r.rosterIds, ["1", "2"]);
  assert.deepEqual(r.roster[1], { id: "2", name: "Beto", group: "5B", av: "" });
  assert.deepEqual(buildRoster({ group: "6A" }, st).rosterIds, ["3"]);
  assert.equal(buildRoster({}, st).rosterIds.length, 3);   // sin grupos definidos: todos
  assert.ok(!("email" in r.roster[0]));                   // solo campos mínimos
});
