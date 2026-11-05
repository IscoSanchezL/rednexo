// Encuestas: sin datos inventados, avance real en vivo, "Aplicar" abre la encuesta real.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const students = async (db, cid, names) => { for (const [i, n] of names.entries()) await setDoc(doc(db, `colegios/${cid}/students/${i + 1}`), { id: String(i + 1), name: n, group: "5A", av: n.slice(0, 2).toUpperCase() }); };
const colegio = async (db, cid, email) => {
  await setDoc(doc(db, `colegios/${cid}`), { nombre: cid }); await setDoc(doc(db, `colegios/${cid}/settings/global`), { colegio: cid });
  await setDoc(doc(db, `colegios/${cid}/miembros/${email}`), { email, role: "psychologist", status: "active" });
  await setDoc(doc(db, `colegios/${cid}/groups/g1`), { id: "g1", name: "5A", color: "#3b82f6" });
};
const survey = (id, title, status) => ({ id, title, status, group: "5A", maxSel: 3, anon: true, createdAt: Timestamp.now(), questions: [{ id: "q1", text: "¿Con quién?", tp: "pos" }] });
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await colegio(db, "sin-estudiantes", "a@x.co");
  await colegio(db, "sin-encuestas", "b@x.co"); await students(db, "sin-encuestas", ["Ana Uno", "Beto Dos"]);
  await colegio(db, "con-encuesta", "c@x.co"); await students(db, "con-encuesta", ["Ana Uno", "Beto Dos", "Cami Tres", "Dani Cuatro"]);
  await setDoc(doc(db, "colegios/con-encuesta/surveys/sv_act"), { ...survey("sv_act", "Encuesta real", "active"), rosterIds: ["1", "2", "3", "4"], roster: [] });
  await setDoc(doc(db, "colegios/con-encuesta/surveys/sv_bor"), survey("sv_bor", "Solo borrador", "draft"));
  for (const id of ["1", "2"]) await setDoc(doc(db, `colegios/con-encuesta/responses/sv_act_${id}`), { surveyId: "sv_act", respondentId: id, respondentName: "x", answers: { q1: ["3"] } });
});

const vite = spawn("npx", ["vite", "--port", "5195", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
const login = async (email) => {
  const ctx = await b.newContext(); const p = await ctx.newPage(); p.ctx = ctx; p.on("dialog", (d) => d.accept());
  const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.errs = errs;
  await p.goto("http://localhost:5195/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), email);
  await p.waitForSelector("text=Dashboard", { timeout: 15000 }); await p.click("button:has-text('Encuestas')"); await p.waitForSelector("text=Gestión de Encuestas"); return p;
};
const body = async (p) => (await p.innerText("body")).replace(/\s+/g, " ");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  // Sin estudiantes
  let p = await login("a@x.co"); await p.waitForSelector("text=Todavía no hay encuestas", { timeout: 10000 });
  let t = await body(p);
  check(t.includes("Primero crea tus grupos"), "sin estudiantes, la pantalla explica que primero hay que crear grupos");
  check(!t.includes("completadas") && !t.includes("Progreso de Encuesta Activa") && !t.includes("pendientes"), "sin estudiantes no aparece ningún avance inventado");

  // Con estudiantes pero sin encuestas
  p = await login("b@x.co"); await p.waitForSelector("text=Todavía no hay encuestas", { timeout: 10000 });
  t = await body(p);
  check(!t.includes("completadas") && !t.includes("pendientes") && !t.includes("Progreso de Encuesta Activa"), "sin encuestas no se muestra el bloque de avance (antes mostraba «7 completadas»)");
  check((await p.locator("button:has-text('+ Nueva Encuesta')").count()) >= 2, "se ofrece crear la primera encuesta desde el aviso y desde el encabezado");
  check(p.errs.length === 0, "sin errores de JavaScript" + (p.errs.length ? ": " + p.errs[0] : ""));

  // Con una encuesta activa y una en borrador
  p = await login("c@x.co"); await p.waitForSelector("text=Avance: Encuesta real", { timeout: 10000 });
  t = await body(p);
  check(t.includes("2 de 4 completadas") && t.includes("2 pendientes") && t.includes("50% completado"), "el avance es real: 2 de 4 completadas, 2 pendientes, 50 %");
  check(!t.includes("Avance: Solo borrador") && t.includes("Solo borrador") && t.includes("Borrador"), "la encuesta en borrador aparece en la lista pero no tiene avance");
  check(!t.includes("Todavía no hay encuestas") && !t.includes("Ejecutar"), "ya no existe el botón «Ejecutar» de demostración ni el aviso de vacío");
  // En vivo: llega una respuesta nueva
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "colegios/con-encuesta/responses/sv_act_3"), { surveyId: "sv_act", respondentId: "3", respondentName: "Cami Tres", answers: {} }); });
  await p.waitForSelector("text=3 de 4 completadas", { timeout: 10000 });
  check(true, "el avance se actualiza solo cuando llega otra respuesta (3 de 4)");
  // Aplicar abre la encuesta real
  const [pop] = await Promise.all([p.ctx.waitForEvent("page", { timeout: 10000 }), p.locator("xpath=//span[normalize-space()='Encuesta real']/ancestor::div[.//button[contains(.,'Aplicar')]][1]//button[contains(.,'Aplicar')]").click()]);
  const url = pop.url();
  check(/\?c=con-encuesta&survey=sv_act$/.test(url), "«Aplicar» abre el enlace real de la encuesta (" + url.replace("http://localhost:5195", "") + ")");
  await pop.waitForSelector("text=Ana Uno", { timeout: 15000 });
  check(true, "la encuesta aplicada carga la lista de estudiantes del colegio");
  // Aplicar un borrador avisa
  await p.locator("xpath=//span[normalize-space()='Solo borrador']/ancestor::div[.//button[contains(.,'Aplicar')]][1]//button[contains(.,'Aplicar')]").click();
  await p.waitForSelector("text=Activa la encuesta", { timeout: 5000 });
  check(true, "aplicar una encuesta en borrador avisa que primero hay que activarla");
} catch (e) { console.log("FALLÓ  excepción:", e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} comprobación(es) fallaron` : "\nTodo bien");
process.exit(failed ? 1 : 0);
