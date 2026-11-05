// Grupos: se ven al crearlos y tras recargar, los antiguos sin documento reaparecen, y la búsqueda encuentra grupos y estudiantes.
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
  await setDoc(doc(db, "colegios/colegio-g"), { nombre: "Colegio G" });
  await setDoc(doc(db, "colegios/colegio-g/settings/global"), { colegio: "Colegio G" });
  await setDoc(doc(db, "colegios/colegio-g/miembros/psi@g.co"), { email: "psi@g.co", role: "psychologist", status: "active" });
  await setDoc(doc(db, "colegios/colegio-g/groups/g1"), { id: "g1", name: "5° A", color: "#3b82f6" });
  await setDoc(doc(db, "colegios/colegio-g/students/1"), { id: "1", name: "Ana García", group: "5° A", av: "AG" });
  // Como en producción: estudiantes en grupos que NUNCA se guardaron como grupo.
  await setDoc(doc(db, "colegios/colegio-g/students/2"), { id: "2", name: "Isco Pérez", group: "Prueba", av: "IP" });
  await setDoc(doc(db, "colegios/colegio-g/students/3"), { id: "3", name: "Isco Dos", group: "prueba1", av: "ID" });
  await setDoc(doc(db, "colegios/colegio-vacio"), { nombre: "Colegio Vacío" });
  await setDoc(doc(db, "colegios/colegio-vacio/settings/global"), { colegio: "Colegio Vacío" });
  await setDoc(doc(db, "colegios/colegio-vacio/miembros/vacio@g.co"), { email: "vacio@g.co", role: "psychologist", status: "active" });
});
const groupDocs = async (cid) => { let n = []; await env.withSecurityRulesDisabled(async (c) => { n = (await getDocs(collection(c.firestore(), `colegios/${cid}/groups`))).docs.map((d) => d.data().name); }); return n; };

const vite = spawn("npx", ["vite", "--port", "5196", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
const login = async (email) => {
  const p = await (await b.newContext()).newPage(); p.on("dialog", (d) => d.accept());
  const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.errs = errs;
  await p.goto("http://localhost:5196/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), email);
  await p.waitForSelector("text=Dashboard", { timeout: 15000 }); await p.click("button:has-text('Grupos')"); return p;
};
const body = async (p) => (await p.innerText("body")).replace(/\s+/g, " ");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const p = await login("psi@g.co");
  await p.waitForSelector("text=Prueba", { timeout: 10000 });
  let t = await body(p);
  check(t.includes("5° A") && t.includes("Prueba") && t.includes("prueba1"), "con la búsqueda vacía se ven TODOS los grupos, también los que solo existían en los estudiantes");
  check(t.includes("Isco Pérez") && t.includes("Isco Dos") && t.includes("Ana García"), "cada grupo muestra sus estudiantes");
  await wait(1500);
  const g0 = await groupDocs("colegio-g");
  check(g0.length === 3 && g0.includes("Prueba") && g0.includes("prueba1"), "los grupos antiguos se guardaron una sola vez como grupos reales (" + g0.length + " documentos)");

  // Crear un grupo nuevo
  await p.click("button:has-text('+ Nuevo Grupo')"); await p.fill("input[placeholder='Ej: 7° B']", "Séptimo");
  await p.click("button:has-text('Crear')"); await p.waitForSelector("text=/Grupo «Séptimo» creado/", { timeout: 10000 });
  t = await body(p);
  check(t.includes("Séptimo"), "el grupo nuevo aparece enseguida");
  check((await groupDocs("colegio-g")).includes("Séptimo"), "el grupo nuevo quedó guardado en la base de datos");
  await p.reload(); await p.waitForSelector("text=Dashboard", { timeout: 15000 }); await p.click("button:has-text('Grupos')"); await p.waitForSelector("text=Séptimo", { timeout: 10000 });
  check(true, "tras recargar la página el grupo sigue ahí");

  // Duplicado (sin distinguir mayúsculas ni tildes)
  await p.click("button:has-text('+ Nuevo Grupo')"); await p.fill("input[placeholder='Ej: 7° B']", "septimo"); await p.click("button:has-text('Crear')");
  await p.waitForSelector("text=/Ya existe un grupo/", { timeout: 5000 });
  check((await groupDocs("colegio-g")).filter((n) => n.toLowerCase().startsWith("s")).length === 1, "no permite crear un grupo repetido");
  await p.click("button:has-text('Cancelar')").catch(() => {});

  // Agregar un estudiante al grupo nuevo
  await p.locator("xpath=//span[normalize-space()='Séptimo']/../..//button[contains(.,'Agregar')]").first().click();
  await p.fill("input[placeholder='Nombre completo']", "Zoe Núñez");
  await p.locator("xpath=//input[@placeholder='Nombre completo']/following::button[1]").click();
  await p.waitForSelector("text=Zoe Núñez", { timeout: 10000 });
  check(true, "se agrega un estudiante al grupo nuevo y se ve");

  // Búsqueda
  const search = async (q) => { await p.fill("input[placeholder='Buscar estudiante o grupo...']", q); await wait(400); return body(p); };
  t = await search("prueba");
  check(t.includes("2 grupos") && t.includes("Isco Pérez") && t.includes("Isco Dos"), "buscar «prueba» muestra los grupos Prueba y prueba1 con los estudiantes que tienen dentro");
  t = await search("SEPTIMO");
  check(t.includes("1 grupo") && t.includes("Zoe Núñez"), "buscar «SEPTIMO» (sin tilde, en mayúsculas) encuentra el grupo y a su estudiante");
  t = await search("nunez");
  check(t.includes("Zoe Núñez") && t.includes("1 estudiante"), "buscar un estudiante sin tilde lo encuentra");
  t = await search("is");
  check(t.includes("Isco Pérez") && t.includes("Isco Dos") && !t.includes("Ana García · "), "buscar por inicial de estudiante sigue funcionando");
  t = await search("zzzz");
  check(t.includes("No se encontró ningún estudiante ni grupo"), "una búsqueda sin resultados lo dice claramente");
  check(p.errs.length === 0, "sin errores de JavaScript" + (p.errs.length ? ": " + p.errs[0] : ""));

  // Colegio sin grupos
  const v = await login("vacio@g.co"); await v.waitForSelector("text=Todavía no hay grupos", { timeout: 10000 });
  check(true, "un colegio sin grupos muestra una invitación a crear el primero");
} catch (e) { console.log("FALLÓ  excepción:", e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} comprobación(es) fallaron` : "\nTodo bien");
process.exit(failed ? 1 : 0);
