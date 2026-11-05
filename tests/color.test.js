import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tint, mixOn, ink } from "../src/lib/color.js";

test("tint con hex conserva el comportamiento de siempre", () => {
  assert.equal(tint("#34d399", "14"), "#34d39914");
  assert.equal(tint("#ff4d6a", "99"), "#ff4d6a99");
});
test("tint con variables del tema produce un color válido (porcentaje de transparencia)", () => {
  assert.equal(tint("var(--c-ok)", "ff"), "color-mix(in srgb, var(--c-ok) 100%, transparent)");
  assert.equal(tint("var(--c-ok)", "00"), "color-mix(in srgb, var(--c-ok) 0%, transparent)");
  assert.equal(tint("var(--c-teal)", "80"), "color-mix(in srgb, var(--c-teal) 50%, transparent)");
  assert.equal(tint("var(--c-err)", "14"), "color-mix(in srgb, var(--c-err) 8%, transparent)");
});
test("mixOn e ink mezclan sobre un fondo opaco y sobre el color del texto", () => {
  assert.equal(mixOn("#ff4d6a", 20), "color-mix(in srgb, #ff4d6a 20%, var(--c-cardAlt))");
  assert.equal(mixOn("var(--c-rx)", 16, "var(--c-surface)"), "color-mix(in srgb, var(--c-rx) 16%, var(--c-surface))");
  assert.equal(ink("var(--c-teal)"), "color-mix(in srgb, var(--c-teal) 60%, var(--c-text))");
});

// Guardia contra el error original: «C.ok + "14"» daba «var(--c-ok)14», un valor que el navegador ignora.
const src = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
test("ningún color del tema recibe un sufijo de transparencia pegado (usa tint)", () => {
  const malos = [...src.matchAll(/\bC\.\w+\s*\+\s*"[0-9a-fA-F]{2}"|\$\{C\.\w+\}[0-9a-fA-F]{2}\b/g)].map((m) => m[0]);
  assert.deepEqual(malos, []);
});
test("la matriz no usa fondos oscuros fijos (deben seguir el tema claro/oscuro)", () => {
  const a = src.indexOf("function SocioMatrix"), b = src.indexOf("// ════════ SURVEY EXECUTION", a) > 0 ? src.indexOf("// ════════ SURVEY EXECUTION", a) : src.indexOf("// ════════ GROUP MANAGEMENT", a);
  const matriz = src.slice(a, b);
  assert.ok(matriz.length > 5000);
  assert.deepEqual(matriz.match(/#0a0a14|#0c0c18|#1a1a2a/g) || [], []);
});
