import { test } from "node:test";
import assert from "node:assert/strict";
import { revokePatch, reactivateRole, userActions, statusLabel } from "../src/lib/users.js";

test("revocar recuerda el rol anterior y baja a solo lectura", () => {
  assert.deepEqual(revokePatch({ role: "psychologist" }), { status: "revoked", role: "readonly", rolAnterior: "psychologist" });
  assert.deepEqual(revokePatch({ role: "admin" }), { status: "revoked", role: "readonly", rolAnterior: "admin" });
  assert.deepEqual(revokePatch({ role: "readonly" }), { status: "revoked", role: "readonly", rolAnterior: "readonly" });
  assert.equal(revokePatch({ role: "inventado" }).rolAnterior, "readonly");
});
test("revocar dos veces no pierde el rol original", () => {
  const una = revokePatch({ role: "psychologist" });
  assert.equal(revokePatch({ ...una }).rolAnterior, "psychologist");     // ya está en solo lectura, pero recuerda que era psicólogo
});
test("reactivar: lo elegido, si no el rol anterior, si no solo lectura", () => {
  assert.equal(reactivateRole({ role: "readonly", rolAnterior: "psychologist" }), "psychologist");
  assert.equal(reactivateRole({ role: "readonly", rolAnterior: "psychologist" }, "admin"), "admin");
  assert.equal(reactivateRole({ role: "readonly" }), "readonly");                       // revocado antes de existir esta función: no se puede saber
  assert.equal(reactivateRole({ role: "readonly", rolAnterior: "xxx" }, "yyy"), "readonly");
});
const U = [
  { email: "yo@x.co", role: "admin", status: "active" }, { email: "otro@x.co", role: "admin", status: "active" },
  { email: "psi@x.co", role: "psychologist", status: "active" }, { email: "vieja@x.co", role: "readonly", status: "revoked" }, { email: "pend@x.co", role: "psychologist", status: "pending" },
];
test("nadie se revoca ni se elimina a sí mismo", () => {
  const a = userActions(U, U[0], "YO@x.co");
  assert.deepEqual([a.esYo, a.puedeRevocar, a.puedeEliminar, a.motivo], [true, false, false, "No puedes revocarte a ti mismo"]);
});
test("a otras personas activas se las revoca, pero no se las elimina directamente", () => {
  const a = userActions(U, U[2], "yo@x.co");
  assert.deepEqual([a.puedeRevocar, a.puedeEliminar, a.puedeReactivar], [true, false, false]);
  assert.equal(userActions(U, U[1], "yo@x.co").puedeRevocar, true);           // hay otro administrador activo
});
test("el único administrador activo no se puede revocar", () => {
  const solo = [{ email: "a@x.co", role: "admin", status: "active" }, { email: "p@x.co", role: "psychologist", status: "active" }];
  const a = userActions(solo, solo[0], "super@iskonex.co");                    // lo intenta alguien que no es él (p. ej. el superadmin)
  assert.deepEqual([a.ultimoAdmin, a.puedeRevocar, a.motivo], [true, false, "Es el único administrador activo: nombra a otro antes"]);
  assert.equal(userActions([...solo, { email: "b@x.co", role: "admin", status: "revoked" }], solo[0], "x@x.co").ultimoAdmin, true);   // un administrador revocado no cuenta
});
test("revocados y pendientes se pueden reactivar o eliminar", () => {
  for (const u of [U[3], U[4]]) { const a = userActions(U, u, "yo@x.co"); assert.deepEqual([a.puedeReactivar, a.puedeEliminar, a.puedeRevocar], [true, true, false]); }
  assert.deepEqual(["active", "pending", "revoked", undefined].map(statusLabel), ["Activo", "Pendiente", "Revocado", "Revocado"]);
});
