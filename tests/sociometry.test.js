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

import { normalizeText, groupExists, groupIdFor, allGroupNames, missingGroups, searchGroups, highlightRange } from "../src/lib/sociometry.js";

test("normalizar texto: tildes, mayúsculas y espacios", () => {
  assert.equal(normalizeText("  Ñandú ÁÉÍ "), "nandu aei");
  assert.equal(normalizeText(null), "");
});
test("grupo duplicado: sin distinguir mayúsculas ni tildes; vacío no cuenta", () => {
  assert.equal(groupExists(["5° A", "Prueba"], "prueba"), true);
  assert.equal(groupExists(["Séptimo"], "septimo"), true);
  assert.equal(groupExists(["5° A"], "5° B"), false);
  assert.equal(groupExists(["5° A"], "  "), false);
});
test("id de grupo estable y distinto para nombres distintos", () => {
  assert.equal(groupIdFor("Prueba"), groupIdFor("Prueba"));
  assert.notEqual(groupIdFor("Prueba"), groupIdFor("prueba"));
  assert.match(groupIdFor("5° A ñ"), /^g_[0-9a-z]+$/);
});
const G = [{ id: "g1", name: "5° A" }, { id: "g2", name: "Séptimo" }];
const S = [{ id: "1", name: "Ana García", group: "5° A" }, { id: "2", name: "Isco Pérez", group: "Prueba" }, { id: "3", name: "Isco Dos", group: "prueba1" }, { id: "4", name: "Beto Ruiz", group: "5° A" }];
test("grupos a mostrar: los guardados más los que usan los estudiantes sin documento", () => {
  assert.deepEqual(allGroupNames(G, S), ["5° A", "Séptimo", "Prueba", "prueba1"]);
  assert.deepEqual(missingGroups(G, S), ["Prueba", "prueba1"]);
  assert.deepEqual(missingGroups(G, []), []);
  assert.deepEqual(allGroupNames([], [{ group: "" }, { group: undefined }, { group: "X" }]), ["X"]);
});
test("buscar un grupo trae a sus estudiantes; buscar un estudiante trae su grupo", () => {
  const names = allGroupNames(G, S);
  const porGrupo = searchGroups(S, names, "prueba");
  assert.deepEqual(porGrupo.map((r) => r.group), ["Prueba", "prueba1"]);
  assert.deepEqual(porGrupo[0].members.map((m) => m.name), ["Isco Pérez"]);
  assert.ok(porGrupo.every((r) => r.groupMatched));
  const porNombre = searchGroups(S, names, "is");
  assert.deepEqual(porNombre.map((r) => [r.group, r.members.length, r.groupMatched]), [["Prueba", 1, false], ["prueba1", 1, false]]);
  assert.deepEqual(searchGroups(S, names, "ANA").map((r) => r.group), ["5° A"]);
});
test("buscar ignora tildes y mayúsculas, muestra grupos vacíos y no devuelve nada con búsqueda vacía", () => {
  const names = allGroupNames(G, S);
  assert.deepEqual(searchGroups(S, names, "SEPTIMO").map((r) => [r.group, r.members.length]), [["Séptimo", 0]]);
  assert.deepEqual(searchGroups(S, names, "garcia").map((r) => r.members[0].name), ["Ana García"]);
  assert.deepEqual(searchGroups(S, names, "   "), []);
  assert.deepEqual(searchGroups(S, names, "zzz"), []);
});
test("resaltado: posición del texto buscado con tildes y mayúsculas", () => {
  assert.deepEqual(highlightRange("Ana García", "garcia"), [4, 10]);
  assert.deepEqual(highlightRange("Isco", "IS"), [0, 2]);
  assert.equal(highlightRange("Isco", "zz"), null);
  assert.equal(highlightRange("Isco", ""), null);
});
