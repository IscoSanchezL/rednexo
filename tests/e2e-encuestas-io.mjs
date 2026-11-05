// Encuesta de prueba, importar y exportar: de punta a punta con navegador real.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDocs, collection } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  for (const [cid, email] of [["col-io", "psi@io.co"], ["col-sin-grupos", "sin@io.co"]]) {
    await setDoc(doc(db, `colegios/${cid}`), { nombre: cid }); await setDoc(doc(db, `colegios/${cid}/settings/global`), { colegio: cid });
    await setDoc(doc(db, `colegios/${cid}/miembros/${email}`), { email, role: "psychologist", status: "active" });
  }
  await setDoc(doc(db, "colegios/col-io/groups/g1"), { id: "g1", name: "5A", color: "#3b82f6" });
  for (const [i, n] of ["Ana Uno", "Beto Dos", "Cami Tres"].entries()) await setDoc(doc(db, `colegios/col-io/students/${i + 1}`), { id: String(i + 1), name: n, group: "5A", av: n.slice(0, 2) });
});
const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 250)); } };
const surveysDb = async () => { let out = []; await env.withSecurityRulesDisabled(async (c) => { out = (await getDocs(collection(c.firestore(), "colegios/col-io/surveys"))).docs.map((d) => d.data()); }); return out; };

const vite = spawn("npx", ["vite", "--port", "5194", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
const login = async (email) => {
  const ctx = await b.newContext({ acceptDownloads: true }); const p = await ctx.newPage(); p.ctx = ctx; p.on("dialog", (d) => d.accept());
  const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.errs = errs;
  await p.goto("http://localhost:5194/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), email);
  await p.waitForSelector("text=Dashboard", { timeout: 15000 }); await p.click("button:has-text('Encuestas')"); await p.waitForSelector("text=Gestión de Encuestas"); return p;
};
const body = async (p) => (await p.innerText("body")).replace(/\s+/g, " ");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const download = async (p, sel) => { const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 10000 }), p.locator(sel).first().click()]); return { name: dl.suggestedFilename(), text: readFileSync(await dl.path(), "utf8") }; };
try {
  // Sin grupos: avisa en vez de inventar un grupo
  const s0 = await login("sin@io.co");
  await s0.locator("button:has-text('Encuesta de prueba')").first().click();
  await s0.waitForSelector("text=/Primero crea un grupo/", { timeout: 5000 });
  check((await surveysDb()).length === 0, "sin grupos, la encuesta de prueba avisa que primero hay que crear un grupo y no crea nada");
  await s0.locator("button:has-text('+ Nueva Encuesta')").first().click();
  await s0.waitForSelector("text=/Primero crea un grupo/", { timeout: 5000 });
  check(!(await body(s0)).includes("Crear Nueva Encuesta"), "tampoco se abre el formulario de nueva encuesta sin grupos (antes asumía «5° A»)");

  // Encuesta de prueba
  const p = await login("psi@io.co");
  await p.locator("button:has-text('Encuesta de prueba')").first().click();
  await p.waitForSelector("text=Encuesta de prueba — Sociograma", { timeout: 10000 });
  let t = await body(p);
  check(t.includes("7 preguntas (3 + · 2 ○ · 2 −)"), "la encuesta de prueba trae 7 preguntas: 3 positivas, 2 neutrales y 2 negativas");
  const dbS = (await until(async () => (await surveysDb())[0])) || {};
  check(dbS.status === "draft" && dbS.questions && dbS.questions.every((q) => q.id && ["pos", "neu", "neg"].includes(q.tp)) && new Set(dbS.questions.map((q) => q.id)).size === 7, "queda en borrador, y cada pregunta tiene su tipo y un identificador propio");

  // Exportar
  const j = await download(p, "button:has-text('⬇ JSON')");
  const pj = JSON.parse(j.text);
  check(/^encuesta-encuesta-de-prueba-sociograma-\d{4}-\d{2}-\d{2}\.json$/.test(j.name) && pj.formato === "rednexo-encuesta-v1" && pj.preguntas.length === 7 && pj.preguntas.filter((q) => q.tipo === "negativa").length === 2, "exportar JSON descarga la encuesta con el tipo de cada pregunta (" + j.name + ")");
  const c = await download(p, "button:has-text('⬇ CSV')");
  check(c.text.startsWith("﻿pregunta;tipo") && c.text.includes("¿Con quién NO te gustaría trabajar en equipo?;negativa") && c.text.split("\r\n").filter(Boolean).length === 8, "exportar CSV trae encabezado, 7 filas y los tipos (" + c.name + ")");

  // Activar y aplicar de verdad la encuesta de prueba
  await p.locator("button:has-text('Borrador')").first().click(); await p.waitForSelector("text=● Activa", { timeout: 10000 });
  await wait(1500);
  const [pop] = await Promise.all([p.ctx.waitForEvent("page", { timeout: 10000 }), p.locator("button:has-text('Aplicar')").first().click()]);
  await pop.waitForSelector("text=Ana Uno", { timeout: 15000 }); await pop.click("text=Ana Uno");
  await pop.waitForSelector("text=¿Con quién te gustaría trabajar en un proyecto en equipo?", { timeout: 10000 });
  check(true, "la encuesta de prueba activada se puede aplicar: muestra a los estudiantes y su primera pregunta");
  await pop.close();

  // Importar CSV exportado (ida y vuelta)
  const fileInput = p.locator("[data-testid=import-file]");
  await fileInput.setInputFiles({ name: c.name, mimeType: "text/csv", buffer: Buffer.from(c.text, "utf8") });
  await p.waitForSelector("text=Vista previa de la importación", { timeout: 5000 });
  t = await body(p);
  check(t.includes("+ Positiva") && t.includes("○ Neutral") && t.includes("− Negativa") && t.includes("¿Con quién NO te gustaría trabajar en equipo?") && t.includes("Crear encuesta"), "importar muestra primero una vista previa con el tipo de cada pregunta");
  await p.click("button:has-text('Crear encuesta')"); await p.waitForSelector("text=/Encuesta importada en borrador con 7 preguntas/", { timeout: 10000 });
  check(await until(async () => (await surveysDb()).length === 2), "al confirmar se crea la encuesta importada (ahora hay 2)");
  const imp = (await until(async () => (await surveysDb()).length === 2 && (await surveysDb()))).find((s) => s.title !== "Encuesta de prueba — Sociograma");
  check(imp && imp.status === "draft" && imp.questions.length === 7 && imp.questions[5].tp === "neg" && imp.questions.every((q) => q.id), "la importada queda en borrador con sus 7 preguntas, tipos e identificadores");

  // Importar JSON (ida y vuelta)
  await fileInput.setInputFiles({ name: j.name, mimeType: "application/json", buffer: Buffer.from(j.text, "utf8") });
  await p.waitForSelector("text=Vista previa de la importación"); await p.click("button:has-text('Crear encuesta')");
  check(await until(async () => (await surveysDb()).length === 3), "importar el JSON exportado crea otra encuesta idéntica (3 en total)");

  // Archivo con errores: no crea nada y dice dónde
  const malo = "pregunta;tipo\n¿Uno?;positiva\n¿Dos?;regular\n;neutral\n";
  await fileInput.setInputFiles({ name: "malo.csv", mimeType: "text/csv", buffer: Buffer.from(malo, "utf8") });
  await p.waitForSelector("text=No se pudo importar el archivo", { timeout: 5000 });
  t = await body(p);
  check(t.includes("Fila 3") && t.includes("«regular»") && t.includes("Fila 4") && t.includes("No se creó nada"), "un archivo con errores indica la fila y el problema, y no crea nada");
  await wait(500);
  check((await surveysDb()).length === 3 && (await p.locator("button:has-text('Crear encuesta')").count()) === 0, "no aparece el botón de crear con un archivo inválido y las encuestas siguen siendo 3");
  await p.click("button:has-text('Cerrar')");
  check(p.errs.length === 0, "sin errores de JavaScript" + (p.errs.length ? ": " + p.errs[0] : ""));
} catch (e) { console.log("FALLÓ  excepción:", e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} comprobación(es) fallaron` : "\nTodo bien");
process.exit(failed ? 1 : 0);
