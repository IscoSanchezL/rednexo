import test from "node:test";
import assert from "node:assert/strict";
import { esEncuestaPublica, urlSoporte, contextoSoporte, configuracionSoporte, cargarWidget, SOPORTE_AVISO } from "../src/lib/soporte.js";

test("la encuesta pública se reconoce por ?survey=", () => {
  assert.equal(esEncuestaPublica("?c=col&survey=abc"), true);
  assert.equal(esEncuestaPublica("?survey="), true);
  assert.equal(esEncuestaPublica(""), false);
  assert.equal(esEncuestaPublica("?c=col"), false);
});
test("contexto: solo rol y colegio, aunque llegue algo más", () => {
  const c = contextoSoporte({ rol: "psychologist", colegio: "Colegio San José", estudiantes: ["Ana"], email: "x@y.co", respuestas: [1], token: "t" });
  assert.deepEqual(Object.keys(c).sort(), ["colegio", "rol"]);
  assert.deepEqual(c, { rol: "psychologist", colegio: "Colegio San José" });
});
test("contexto: recorta y limpia saltos de línea; sin datos queda «sin sesión»", () => {
  assert.equal(contextoSoporte({ rol: "admin", colegio: "A\nB" + "x".repeat(200) }).colegio.length, 80);
  assert.ok(!contextoSoporte({ colegio: "A\nB" }).colegio.includes("\n"));
  assert.deepEqual(contextoSoporte(), { rol: "sin sesión", colegio: "" });
});
test("dirección del widget: producción, override y sin cargar en pruebas con emuladores", () => {
  assert.equal(urlSoporte({}), "https://soporte.iskonex.com");
  assert.equal(urlSoporte({ emuladores: true }), null);
  assert.equal(urlSoporte({ emuladores: true, override: "http://localhost:5199/" }), "http://localhost:5199");
});
test("configuración sin sesión: sin usuario ni token", () => {
  const c = configuracionSoporte({ sesion: null, version: "1.0.0" });
  assert.equal(c.user, null); assert.equal(c.getIdToken, null); assert.equal(c.notice, SOPORTE_AVISO);
  assert.deepEqual(c.context(), { rol: "sin sesión", colegio: "" });
});
test("configuración con sesión: usuario, token y contexto cerrado", async () => {
  const c = configuracionSoporte({ sesion: { email: "p@col.co", name: "Pía" }, rol: "admin", colegio: "Col", getIdToken: async () => "TOKEN", version: "1.0.0" });
  assert.deepEqual(c.user, { email: "p@col.co", name: "Pía" });
  assert.equal(await c.getIdToken(), "TOKEN");
  assert.deepEqual(c.context(), { rol: "admin", colegio: "Col" });
});
test("el aviso para menores está", () => {
  assert.equal(SOPORTE_AVISO, "No escriba nombres de estudiantes ni datos personales de menores en este mensaje.");
});
test("cargarWidget no hace nada sin dirección y reutiliza el widget ya cargado", async () => {
  assert.equal(await cargarWidget({ base: null }), null);
  const w = { IskonexSoporte: { ok: 1 } };
  assert.deepEqual(await cargarWidget({ base: "http://x", win: w, doc: {} }), { ok: 1 });
});
test("cargarWidget: inserta un solo script con data-app y sin botón flotante; si falla devuelve null", async () => {
  const hijos = []; const doc = { createElement: () => ({ dataset: {}, remove() {} }), head: { appendChild: (s) => hijos.push(s) } };
  const win = {};
  const p1 = cargarWidget({ base: "https://soporte.iskonex.com", win, doc });
  const p2 = cargarWidget({ base: "https://soporte.iskonex.com", win, doc });
  assert.equal(hijos.length, 1);
  assert.equal(hijos[0].src, "https://soporte.iskonex.com/widget.js");
  assert.equal(hijos[0].dataset.app, "rednexo"); assert.equal(hijos[0].dataset.button, "false");
  win.IskonexSoporte = { configure() {} }; hijos[0].onload();
  assert.equal(await p1, win.IskonexSoporte); assert.equal(await p2, win.IskonexSoporte);
  const win2 = {}; const p3 = cargarWidget({ base: "http://x", win: win2, doc }); hijos.at(-1).onerror();
  assert.equal(await p3, null); assert.equal(win2.__soporteCarga, null);
});
