// Ranking del dashboard (más aceptados / más rechazados) y lista de conexiones de un nodo.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const NAMES = ["Ana", "Beto", "Cami", "Dani", "Eli", "Zoe"];   // Zoe es la ÚLTIMA de la lista y la más aceptada
const colegio = async (db, cid, email, R) => {
  await setDoc(doc(db, `colegios/${cid}`), { nombre: cid }); await setDoc(doc(db, `colegios/${cid}/settings/global`), { colegio: cid });
  await setDoc(doc(db, `colegios/${cid}/miembros/${email}`), { email, role: "psychologist", status: "active" });
  await setDoc(doc(db, `colegios/${cid}/groups/g1`), { id: "g1", name: "Grupo", color: "#a78bfa" });
  for (const [i, n] of NAMES.entries()) await setDoc(doc(db, `colegios/${cid}/students/${i + 1}`), { id: String(i + 1), name: n, group: "Grupo", av: n[0] });
  await setDoc(doc(db, `colegios/${cid}/surveys/sv1`), { id: "sv1", title: "S", status: "active", group: "Grupo", groups: ["Grupo"], maxSel: 5, anon: true, createdAt: Timestamp.now(), rosterIds: NAMES.map((_, i) => String(i + 1)), roster: [], questions: [{ id: "p", text: "p", tp: "pos" }, { id: "g", text: "g", tp: "neg" }] });
  for (const [id, answers] of Object.entries(R)) await setDoc(doc(db, `colegios/${cid}/responses/sv1_${id}`), { surveyId: "sv1", respondentId: id, respondentName: "x", answers });
};
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await colegio(db, "con-rechazos", "a@r.co", {
    1: { p: ["6"], g: ["2"] }, 2: { p: ["6"] }, 3: { p: ["6"], g: ["2"] }, 4: { p: ["6"], g: ["2"] }, 5: { p: ["6"], g: ["3"] },
    6: { p: ["1", "2", "3", "4", "5"] },
  });
  await colegio(db, "sin-rechazos", "b@r.co", { 1: { p: ["2"] }, 2: { p: ["1"] } });
});

const vite = spawn("npx", ["vite", "--port", "5189", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
const login = async (email) => {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.errs = errs;
  await p.goto("http://localhost:5189/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), email);
  await p.waitForSelector("text=Dashboard", { timeout: 15000 }); await p.waitForSelector("text=Ranking"); await p.waitForTimeout(800); return p;
};
const filas = (p) => p.locator("div[title*='compañero(s)']").evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
const body = async (p) => (await p.innerText("body")).replace(/\s+/g, " ");
try {
  const p = await login("a@r.co");
  let f = await filas(p);
  check(f.length === 4 && f[0].startsWith("#1 Zoe 5 1.00"), `«Más aceptados» pone primero a Zoe, que está última en la lista (${f[0]})`);
  check(f[1].startsWith("#2 Ana 1") && f[2].startsWith("#2 Beto 1") && f[3].startsWith("#2 Cami 1"), "los empates conservan el puesto (#2, #2, #2) y se ordenan por nombre");
  check((await body(p)).includes("Ver los 6 del ranking"), "con más de 4 en el ranking ofrece verlos todos");
  await p.locator("button:has-text('Ver los 6 del ranking')").click(); await p.waitForTimeout(300);
  check((await filas(p)).length === 6, "«Ver los 6» muestra los 6");
  await p.locator("button:has-text('Mostrar menos')").first().click();
  await p.locator("button:has-text('Más rechazados')").click(); await p.waitForTimeout(300);
  f = await filas(p);
  check(f.length === 2 && f[0].startsWith("#1 Beto 3 0.60") && f[1].startsWith("#2 Cami 1 0.20"), `«Más rechazados»: Beto 3 (0.60) y Cami 1 (0.20) — ${f.join(" | ")}`);
  check(!f.some((x) => x.includes("Zoe")), "quien no recibió rechazos no aparece en «Más rechazados» (sin ceros)");
  await p.locator("button:has-text('Más aceptados')").click();
  // Clic en una fila selecciona el nodo
  await p.locator("div[title*='compañero(s)']").first().click(); await p.waitForTimeout(500);
  const tn = await body(p);
  check(tn.includes("ACEPTACIÓN") || tn.toLowerCase().includes("aceptación"), "al pulsar una fila se selecciona esa persona en el sociograma");
  check(/CONEXIONES \(10\)/.test(tn) && tn.includes("Ver las 5 restantes"), "la lista de conexiones indica el total (10) y ofrece ver las 5 restantes");
  await p.locator("button:has-text('Ver las 5 restantes')").click(); await p.waitForTimeout(300);
  const filasConn = await p.locator("div:has(> span:text-matches('^[→←]$'))").count();
  check(filasConn === 10 && (await body(p)).includes("Mostrar menos"), `al desplegar se ven las 10 conexiones (${filasConn})`);
  check(p.errs.length === 0, "sin errores de JavaScript" + (p.errs.length ? ": " + p.errs[0] : ""));

  const q = await login("b@r.co");
  await q.locator("button:has-text('Más rechazados')").click(); await q.waitForTimeout(300);
  check((await body(q)).includes("Nadie ha recibido rechazos en los grupos visibles"), "sin rechazos, lo dice en lugar de mostrar una lista de ceros");
  check((await filas(q)).length === 0, "y no inventa filas");
} catch (e) { console.log("FALLÓ  excepción:", e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} comprobación(es) fallaron` : "\nTodo bien");
process.exit(failed ? 1 : 0);
