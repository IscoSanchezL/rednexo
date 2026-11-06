import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIVITY_TYPES, buildActivity, formatWhen } from "../src/lib/activity.js";

test("entrada: tipo válido, textos limpios y con límite, correo en minúsculas", () => {
  const a = buildActivity("group", "  creó   el grupo ", "5° A\n", "Ana Gómez", "Ana@Colegio.CO");
  assert.deepEqual(a, { type: "group", action: "creó el grupo", detail: "5° A", user: "Ana Gómez", email: "ana@colegio.co" });
  assert.ok(!("createdAt" in a));                                                     // la fecha la pone el servidor
  assert.equal(buildActivity("inventado", "x", "", "u", "e@x.co").type, "system");      // un tipo desconocido no se guarda tal cual
  assert.equal(buildActivity("user", "x".repeat(500), "y".repeat(500), "u", "e@x.co").action.length, 200);
  assert.equal(buildActivity("user", "a", "y".repeat(500), "u", "e@x.co").detail.length, 300);
  assert.equal(buildActivity("user", "a\u0000b", "", "", "sin@nombre.co").user, "sin@nombre.co");   // sin nombre, usa el correo
  assert.ok(ACTIVITY_TYPES.includes("export") && ACTIVITY_TYPES.length === 7);
});
const AHORA = new Date(2026, 10, 6, 15, 30);          // 6 nov 2026, 15:30 (hora local)
test("fecha: hoy, ayer, este año y otros años", () => {
  assert.equal(formatWhen(new Date(2026, 10, 6, 9, 5), AHORA), "Hoy 09:05");
  assert.equal(formatWhen(new Date(2026, 10, 5, 23, 59), AHORA), "Ayer 23:59");
  assert.equal(formatWhen(new Date(2026, 9, 3, 10, 0), AHORA), "3 oct 10:00");
  assert.equal(formatWhen(new Date(2025, 11, 31, 8, 7), AHORA), "31 dic 2025 08:07");
});
test("fecha: acepta marcas de tiempo de Firestore, texto ISO y valores vacíos o inválidos", () => {
  assert.equal(formatWhen({ toDate: () => new Date(2026, 10, 6, 1, 2) }, AHORA), "Hoy 01:02");
  assert.equal(formatWhen(new Date(2026, 10, 6, 12, 0).toISOString(), AHORA), "Hoy 12:00");
  for (const v of [null, undefined, "", "no es fecha", { toDate: () => { throw new Error("x"); } }]) assert.equal(formatWhen(v, AHORA), "Ahora");
});
test("fecha: ayer funciona al cambiar de mes y de año", () => {
  assert.equal(formatWhen(new Date(2026, 9, 31, 20, 0), new Date(2026, 10, 1, 8, 0)), "Ayer 20:00");
  assert.equal(formatWhen(new Date(2025, 11, 31, 20, 0), new Date(2026, 0, 1, 8, 0)), "Ayer 20:00");
});
