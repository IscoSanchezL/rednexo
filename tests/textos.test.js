import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Guardia: no volver a prometer algo que la app no hace.
const src = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
test("la interfaz no dice «Anónima» ni «Identificada»: toda encuesta guarda quién respondió y es confidencial", () => {
  assert.deepEqual(src.match(/Anónima|Identificada|anónima|identificada/g) || [], []);
  assert.ok(src.includes("Confidencial"));
});
test("ninguna encuesta nueva se guarda con un campo «anon»", () => {
  assert.deepEqual(src.match(/\banon\b\s*:/g) || [], []);          // ni en el formulario, ni al importar, ni al duplicar
  assert.ok(!/setNS\([^)]*anon/.test(src));
});
