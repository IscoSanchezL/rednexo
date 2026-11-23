import test from "node:test";
import assert from "node:assert/strict";
import { validarNombreGrupo, renombrarEnEncuesta, resumenEliminar, textoEliminar } from "../src/lib/grupos.js";

test("nombre de grupo: vacío, largo y repetido se rechazan; cambiar mayúsculas del propio nombre sí", () => {
  const ex = ["5° A", "5° B"];
  assert.equal(validarNombreGrupo("   ", ex, "5° A").ok, false);
  assert.equal(validarNombreGrupo("x".repeat(61), ex, "5° A").ok, false);
  assert.match(validarNombreGrupo("5° b", ex, "5° A").error, /Ya existe/);
  assert.deepEqual(validarNombreGrupo("  5°   a  ", ex, "5° A"), { ok: true, nombre: "5° a" });
  assert.deepEqual(validarNombreGrupo("6° A", ex, "5° A"), { ok: true, nombre: "6° A" });
});
test("renombrar en una encuesta: solo si usa el grupo, conserva el resto y el orden", () => {
  assert.deepEqual(renombrarEnEncuesta({ groups: ["5° A", "5° B"], group: "5° A" }, "5° B", "6° B"), { groups: ["5° A", "6° B"], group: "5° A" });
  assert.deepEqual(renombrarEnEncuesta({ group: "5° A" }, "5° A", "6° A"), { groups: ["6° A"], group: "6° A" });   // encuesta antigua con un solo «group»
  assert.equal(renombrarEnEncuesta({ groups: ["5° A"], group: "5° A" }, "7° C", "8° C"), null);
});
test("resumen al eliminar: estudiantes y encuestas vivas que lo usan", () => {
  const st = [{ group: "5° A" }, { group: "5° A" }, { group: "5° B" }];
  const sv = [{ title: "S1", groups: ["5° A"] }, { title: "S2", groups: ["5° B"] }, { title: "Borrada", groups: ["5° A"], deleted: true }];
  const r = resumenEliminar("5° A", st, sv);
  assert.deepEqual(r, { estudiantes: 2, encuestas: ["S1"] });
  assert.match(textoEliminar("5° A", r), /sus 2 estudiantes/);
  assert.match(textoEliminar("5° A", r), /la encuesta: «S1»/);
  assert.match(textoEliminar("Vacío", resumenEliminar("Vacío", st, sv)), /Está vacío/);
  assert.match(textoEliminar("5° A", { estudiantes: 1, encuestas: [] }), /su único estudiante/);
});
