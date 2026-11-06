import test from "node:test";
import assert from "node:assert/strict";
import { plantillaCSV, parsearImportacion, planImportacion } from "../src/lib/importar.js";

test("la plantilla trae encabezado, BOM y ejemplos que no se importan", () => {
  const t = plantillaCSV();
  assert.ok(t.startsWith("﻿Grupo;Estudiante"));
  const r = parsearImportacion(t);
  assert.equal(r.filas.length, 0); assert.equal(r.ignoradas, 3);
  assert.match(r.errores[0], /no tiene estudiantes/);
});
test("lee con ; , o tabulación, con o sin encabezado, con comillas y tildes", () => {
  assert.equal(parsearImportacion("Grupo;Estudiante\n5° A;Ana Pérez\n5° A;Beto").filas.length, 2);
  assert.equal(parsearImportacion("5° A,Ana\n5° B,Beto").filas.length, 2);
  assert.equal(parsearImportacion("Curso\tNombre\n6° A\tCarla").filas[0].nombre, "Carla");
  assert.equal(parsearImportacion('5° A,"Pérez, Ana"').filas[0].nombre, "Pérez, Ana");
  assert.equal(parsearImportacion("﻿Grupo;Estudiante\r\n7° C;Dani\r\n").filas[0].grupo, "7° C");
});
test("avisa las filas incompletas con su número de línea", () => {
  const r = parsearImportacion("Grupo;Estudiante\n5° A;Ana\n;Sin grupo\n5° B;\n");
  assert.equal(r.filas.length, 1);
  assert.deepEqual(r.errores, ["Línea 3: falta el grupo.", "Línea 4: falta el nombre del estudiante."]);
});
test("el plan no duplica grupos ni estudiantes (mayúsculas y tildes)", () => {
  const filas = parsearImportacion("5° a;Ana Pérez\n5° A;ana perez\n6° A;Beto\n5° A;Carla").filas;
  const p = planImportacion(filas, ["5° A"], [{ group: "5° A", name: "Carla" }]);
  assert.deepEqual(p.gruposNuevos, ["6° A"]);
  assert.deepEqual(p.estudiantesNuevos, [{ grupo: "5° A", nombre: "Ana Pérez" }, { grupo: "6° A", nombre: "Beto" }]);
  assert.equal(p.repetidos, 2);
});
test("un mismo nombre en grupos distintos sí se importa", () => {
  const p = planImportacion(parsearImportacion("5° A;Ana\n5° B;Ana").filas, [], []);
  assert.equal(p.estudiantesNuevos.length, 2); assert.deepEqual(p.gruposNuevos, ["5° A", "5° B"]);
});
