import { test } from "node:test";
import assert from "node:assert/strict";
import { toPlain, buildExport, exportFileName, confirmaEliminar, etiquetaEstado, COLEGIO_SUBCOLLECTIONS } from "../src/lib/export.js";

const ts = (iso) => ({ toDate: () => new Date(iso) });

test("toPlain convierte marcas de tiempo, anida y descarta undefined", () => {
  const out = toPlain({ a: ts("2026-03-01T10:00:00Z"), b: [ts("2026-01-01T00:00:00Z"), { c: undefined, d: 1 }], e: null, f: "x", g: new Date("2026-02-02T00:00:00Z") });
  assert.deepEqual(out, { a: "2026-03-01T10:00:00.000Z", b: ["2026-01-01T00:00:00.000Z", { d: 1 }], e: null, f: "x", g: "2026-02-02T00:00:00.000Z" });
  assert.doesNotThrow(() => JSON.stringify(out));
});
test("la exportación incluye todas las subcolecciones y sus conteos", () => {
  const e = buildExport({ id: "inicial", nombre: "Colegio X" }, { students: [{ id: "1" }, { id: "2" }], responses: [{ id: "r", submittedAt: ts("2026-03-01T00:00:00Z") }] }, new Date("2026-11-05T12:00:00Z"));
  assert.equal(e.formato, "rednexo-export-v1");
  assert.deepEqual(Object.keys(e.datos), COLEGIO_SUBCOLLECTIONS);
  assert.equal(e.conteos.students, 2);
  assert.equal(e.conteos.groups, 0);
  assert.equal(e.datos.responses[0].submittedAt, "2026-03-01T00:00:00.000Z");
  assert.equal(e.colegio.estado, "activo");
  assert.equal(e.exportadoEn, "2026-11-05T12:00:00.000Z");
});
test("la exportación se puede serializar y volver a leer sin pérdida", () => {
  const e = buildExport({ id: "x", nombre: "Ñandú" }, { students: [{ id: "1", name: "Ana Núñez" }] });
  assert.deepEqual(JSON.parse(JSON.stringify(e)).datos.students, [{ id: "1", name: "Ana Núñez" }]);
});
test("nombre de archivo con colegio y fecha", () => {
  assert.equal(exportFileName("colegio-a", new Date("2026-11-05T23:59:00Z")), "rednexo-colegio-a-2026-11-05.json");
});
test("eliminar exige escribir el identificador exacto", () => {
  assert.equal(confirmaEliminar("colegio-a", "colegio-a"), true);
  assert.equal(confirmaEliminar("colegio-a", "  colegio-a "), true);
  assert.equal(confirmaEliminar("colegio-a", "Colegio-A"), false);
  assert.equal(confirmaEliminar("colegio-a", ""), false);
  assert.equal(confirmaEliminar("", ""), false);
  assert.equal(confirmaEliminar("colegio-a", undefined), false);
});
test("etiqueta de estado", () => {
  assert.equal(etiquetaEstado("suspendido"), "Suspendido");
  assert.equal(etiquetaEstado(undefined), "Activo");
});
