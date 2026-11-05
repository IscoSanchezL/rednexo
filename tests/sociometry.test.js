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
  assert.deepEqual(c.find((x) => x.t === "2"), { f: "1", t: "2", s: 1, tp: "pos", types: ["pos"], counts: { pos: 1, neu: 0, neg: 0 } });
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

import { surveyProgress } from "../src/lib/sociometry.js";
test("avance de encuesta: cuenta solo a quienes de su lista respondieron, una vez cada uno", () => {
  const st = [{ id: "1", name: "Ana", group: "5A" }, { id: 2, name: "Beto", group: "5A" }, { id: "3", name: "Cami", group: "5A" }, { id: "4", name: "Dani", group: "6A" }];
  const sv = { id: "s1", group: "5A" };
  const res = [
    { surveyId: "s1", respondentId: "1" }, { surveyId: "s1", respondentId: "1" },      // repetida
    { surveyId: "s1", respondentId: 2 },                                               // id numérico vs texto
    { surveyId: "otra", respondentId: "3" },                                           // otra encuesta
    { surveyId: "s1", respondentId: "99" },                                            // ya no está en la lista
    { surveyId: "s1", respondentId: "4" },                                             // de otro grupo
    null,
  ];
  const p = surveyProgress(sv, st, res);
  assert.deepEqual([p.total, p.completed, p.pending, p.pct], [3, 2, 1, 67]);
  assert.deepEqual(p.items.filter((i) => i.done).map((i) => i.name), ["Ana", "Beto"]);
});
test("avance de encuesta: sin respuestas es 0 % y sin estudiantes no divide por cero ni da pendientes negativos", () => {
  assert.deepEqual(surveyProgress({ id: "s", group: "5A" }, [{ id: "1", name: "Ana", group: "5A" }], []).pct, 0);
  const vacio = surveyProgress({ id: "s", group: "5A" }, [], [{ surveyId: "s", respondentId: "1" }]);
  assert.deepEqual([vacio.total, vacio.completed, vacio.pending, vacio.pct], [0, 0, 0, 0]);
});

import { hasType, strengthOf, filterConns } from "../src/lib/sociometry.js";
test("una pareja con respuestas de varios tipos conserva TODOS los tipos (no solo el dominante)", () => {
  // Caso real: 3 estudiantes que eligen a los dos compañeros en las preguntas positiva, neutral y negativa.
  const sv = [{ id: "s", questions: [{ id: "qp", tp: "pos" }, { id: "qn", tp: "neu" }, { id: "qg", tp: "neg" }] }];
  const resp = ["1", "2", "3"].map((id) => ({ surveyId: "s", respondentId: id, answers: { qp: ["1", "2", "3"].filter((x) => x !== id), qn: ["1", "2", "3"].filter((x) => x !== id), qg: ["1", "2", "3"].filter((x) => x !== id) } }));
  const c = buildConnections(resp, sv);
  assert.equal(c.length, 6);                                              // 3·2 parejas dirigidas: densidad 100 %
  assert.ok(c.every((x) => x.tp === "pos"));                               // empate → «positiva» domina
  assert.ok(c.every((x) => JSON.stringify(x.types) === '["pos","neu","neg"]'));
  assert.equal(filterConns(c, "neu").length, 6);                           // antes: 0 (las neutrales desaparecían)
  assert.equal(filterConns(c, "neg").length, 6);
  assert.equal(filterConns(c, "all").length, 6);
});
test("filtrar dibuja la conexión como del tipo pedido y con la fuerza de ese tipo", () => {
  const sv = [{ id: "s", questions: [{ id: "a", tp: "pos" }, { id: "b", tp: "pos" }, { id: "c", tp: "pos" }, { id: "d", tp: "neu" }] }];
  const c = buildConnections([{ surveyId: "s", respondentId: "1", answers: { a: ["2"], b: ["2"], c: ["2"], d: ["2"] } }], sv);
  assert.deepEqual([c[0].tp, c[0].s, c[0].counts], ["pos", 3, { pos: 3, neu: 1, neg: 0 }]);
  const n = filterConns(c, "neu")[0];
  assert.deepEqual([n.tp, n.s], ["neu", 1]);                              // la neutral es 1 elección, no 3
  assert.equal(strengthOf(c[0], "pos"), 3);
  assert.equal(strengthOf(c[0], "all"), 3);
});
test("hasType y filtros funcionan también con conexiones antiguas sin `types`", () => {
  const vieja = { f: "1", t: "2", s: 2, tp: "neg" };
  assert.deepEqual([hasType(vieja, "neg"), hasType(vieja, "pos"), hasType(null, "pos")], [true, false, false]);
  assert.deepEqual(filterConns([vieja], "neg").map((x) => x.tp), ["neg"]);
  assert.deepEqual(filterConns([vieja], "neu"), []);
  assert.equal(strengthOf(vieja, "neg"), 2);
});
test("pareja que solo tiene un tipo: el filtro de otro tipo no la muestra", () => {
  const sv = [{ id: "s", questions: [{ id: "a", tp: "pos" }] }];
  const c = buildConnections([{ surveyId: "s", respondentId: "1", answers: { a: ["2"] } }], sv);
  assert.deepEqual(c[0].types, ["pos"]);
  assert.deepEqual(filterConns(c, "neu"), []);
});

import { nodeStats } from "../src/lib/sociometry.js";
test("aceptación y rechazo del nodo: tu caso, todos eligen a todos en las 3 preguntas → 1.00 y 1.00", () => {
  const sv = [{ id: "s", questions: [{ id: "p", tp: "pos" }, { id: "n", tp: "neu" }, { id: "g", tp: "neg" }] }];
  const o = (id) => ["1", "2", "3"].filter((x) => x !== id);
  const conns = buildConnections(["1", "2", "3"].map((id) => ({ surveyId: "s", respondentId: id, answers: { p: o(id), n: o(id), g: o(id) } })), sv);
  const s = nodeStats("2", conns, 3);
  assert.deepEqual([s.elecciones, s.recibidas, s.reciprocas, s.aceptacion, s.rechazo], [2, 2, 2, "1.00", "1.00"]);
});
test("un estudiante solo rechazado NO tiene aceptación; uno solo querido NO tiene rechazo", () => {
  const sv = [{ id: "s", questions: [{ id: "p", tp: "pos" }, { id: "g", tp: "neg" }] }];
  const conns = buildConnections([
    { surveyId: "s", respondentId: "1", answers: { g: ["4"], p: ["2"] } },
    { surveyId: "s", respondentId: "2", answers: { g: ["4"], p: ["1"] } },
    { surveyId: "s", respondentId: "3", answers: { g: ["4"], p: ["2"] } },
  ], sv);
  const rechazado = nodeStats("4", conns, 4), querido = nodeStats("2", conns, 4);
  assert.deepEqual([rechazado.aceptacion, rechazado.rechazo], ["0.00", "1.00"]);
  assert.deepEqual([querido.aceptacion, querido.rechazo, querido.recibidas], ["0.67", "0.00", 2]);
});
test("nodo: grupo de un solo participante no divide por cero, y los ids numéricos y de texto cuentan igual", () => {
  assert.deepEqual([nodeStats("1", [], 1).aceptacion, nodeStats("1", [], 0).rechazo], ["0.00", "0.00"]);
  const conns = [{ f: 1, t: "2", s: 1, tp: "pos" }, { f: "2", t: 1, s: 1, tp: "pos" }];
  const s = nodeStats(1, conns, 2);
  assert.deepEqual([s.elecciones, s.recibidas, s.reciprocas, s.aceptacion], [1, 1, 1, "1.00"]);
});
test("nodo: solo cuenta las conexiones que se le pasan (los grupos ocultos no inflan el índice)", () => {
  const todas = [{ f: "2", t: "1", s: 1, tp: "pos" }, { f: "9", t: "1", s: 1, tp: "pos" }];   // «9» está en un grupo oculto
  assert.equal(nodeStats("1", todas, 2).aceptacion, "2.00");                                   // mezcla mal: 2 recibidas ÷ 1
  assert.equal(nodeStats("1", todas.filter((c) => c.f !== "9"), 2).aceptacion, "1.00");        // solo lo visible
});
