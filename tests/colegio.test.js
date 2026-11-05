import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, parsePublicSurveyUrl, planMigration, chunk, LEGACY_COLEGIO_ID } from "../src/lib/colegio.js";
import { buildRoster } from "../src/lib/sociometry.js";

test("slugify: tildes, espacios y símbolos", () => {
  assert.equal(slugify("Colegio San José"), "colegio-san-jose");
  assert.equal(slugify("  Gimnasio   Iráklion #2 "), "gimnasio-iraklion-2");
  assert.equal(slugify("***"), "");
  assert.ok(slugify("x".repeat(100)).length <= 40);
});
test("URL pública: con y sin colegio; rechaza valores peligrosos", () => {
  assert.deepEqual(parsePublicSurveyUrl("?c=abc&survey=sv_1"), { colegioId: "abc", surveyId: "sv_1" });
  assert.deepEqual(parsePublicSurveyUrl("?survey=sv_1"), { colegioId: LEGACY_COLEGIO_ID, surveyId: "sv_1" });
  assert.equal(parsePublicSurveyUrl("?c=abc"), null);
  assert.equal(parsePublicSurveyUrl("?c=../x&survey=sv_1"), null);
  assert.equal(parsePublicSurveyUrl("?c=abc&survey=a/b"), null);
});

const legacy = {
  settings: { colegio: "Colegio X", ciudad: "Bogotá", logo: "data:img" },
  groups: [{ id: "g1", name: "5A" }],
  students: [{ id: "1", name: "Ana", group: "5A" }, { id: "2", name: "Beto", group: "5B" }],
  surveys: [
    { id: "sv1", status: "active", group: "5A", questions: [] },
    { id: "sv2", status: "draft" },
    { id: "sv3", status: "active", deleted: true },
    { id: "sv4", status: "active", rosterIds: ["9"], roster: [] },
  ],
  responses: [{ id: "sv1_1", surveyId: "sv1", respondentId: "1", answers: {} }],
  activity: [{ id: "a1", text: "x" }],
  users: [
    { id: "psi@x.co", email: "PSI@x.co", role: "psychologist", status: "active" },
    { id: "ro@x.co", role: "readonly", status: "revoked" },
    { id: "raro@x.co", role: "superadmin", status: "active" },
    { id: "pend@x.co", role: "psychologist", status: "pending" },
  ],
};

test("migración: copia todo bajo colegios/{id}/ y no pierde ningún documento", () => {
  const ops = planMigration(legacy, "inicial", buildRoster);
  const paths = ops.map((o) => o.path);
  assert.equal(new Set(paths).size, paths.length, "rutas únicas");
  assert.ok(paths.every((p) => p.startsWith("colegios/inicial")));
  for (const p of ["colegios/inicial", "colegios/inicial/settings/global", "colegios/inicial/groups/g1", "colegios/inicial/students/1", "colegios/inicial/students/2",
    "colegios/inicial/surveys/sv1", "colegios/inicial/surveys/sv2", "colegios/inicial/surveys/sv3", "colegios/inicial/surveys/sv4",
    "colegios/inicial/responses/sv1_1", "colegios/inicial/responseMarks/sv1_1", "colegios/inicial/activity/a1"]) assert.ok(paths.includes(p), p);
  assert.equal(ops.find((o) => o.path === "colegios/inicial").data.nombre, "Colegio X");
});
test("migración: encuestas activas reciben lista de nombres, nombre y logo del colegio; borradores y borradas no", () => {
  const get = (id) => planMigration(legacy, "inicial", buildRoster).find((o) => o.path.endsWith("/surveys/" + id)).data;
  assert.deepEqual(get("sv1").rosterIds, ["1"]);                 // solo el grupo 5A
  assert.equal(get("sv1").colegioNombre, "Colegio X");
  assert.equal(get("sv1").logo, "data:img");
  assert.deepEqual(get("sv4").rosterIds, ["9"]);                 // ya tenía lista: no se pisa
  assert.ok(!("rosterIds" in get("sv2")) && !("logo" in get("sv2")));
  assert.ok(!("logo" in get("sv3")));
});
test("migración: usuarios → miembros (correo en minúsculas, roles válidos, superadmin excluido)", () => {
  const m = planMigration(legacy, "inicial", buildRoster).filter((o) => o.path.includes("/miembros/"));
  assert.deepEqual(m.map((o) => o.path).sort(), ["colegios/inicial/miembros/pend@x.co", "colegios/inicial/miembros/psi@x.co", "colegios/inicial/miembros/ro@x.co"]);
  assert.deepEqual(m.find((o) => o.path.endsWith("psi@x.co")).data, { email: "psi@x.co", role: "psychologist", status: "active" });
  assert.equal(m.find((o) => o.path.endsWith("ro@x.co")).data.status, "revoked");
});
test("migración: es idempotente y no modifica los datos de origen", () => {
  const copia = JSON.stringify(legacy);
  const a = planMigration(legacy, "inicial", buildRoster), b = planMigration(legacy, "inicial", buildRoster);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(legacy), copia);
});
test("migración con colecciones vacías no falla", () => {
  assert.equal(planMigration({}, "inicial", buildRoster).length, 1);
});
test("lotes de máximo N operaciones", () => {
  const c = chunk(Array.from({ length: 1001 }, (_, i) => i), 400);
  assert.deepEqual(c.map((x) => x.length), [400, 400, 201]);
});
