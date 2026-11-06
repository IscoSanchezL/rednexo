// «Confidencial»: ya no hay opción «Anónima» (no hacía nada); las encuestas antiguas se ven igual y los estudiantes ven el aviso verdadero.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDocs, collection, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const Q = [{ id: "p", text: "¿Con quién trabajarías?", tp: "pos" }];
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore(), cid = "col-cf";
  await setDoc(doc(db, `colegios/${cid}`), { nombre: "Colegio CF" }); await setDoc(doc(db, `colegios/${cid}/settings/global`), { colegio: "Colegio CF" });
  await setDoc(doc(db, `colegios/${cid}/miembros/psi@cf.co`), { email: "psi@cf.co", role: "psychologist", status: "active" });
  await setDoc(doc(db, `colegios/${cid}/groups/g1`), { id: "g1", name: "5A", color: "#a78bfa" });
  for (const [id, n] of [["1", "Ana"], ["2", "Beto"]]) await setDoc(doc(db, `colegios/${cid}/students/${id}`), { id, name: n, group: "5A", av: n[0] });
  const sv = (id, title, anon, ms) => setDoc(doc(db, `colegios/${cid}/surveys/${id}`), { id, title, status: "active", group: "5A", groups: ["5A"], maxSel: 3, anon, createdAt: Timestamp.fromMillis(ms), questions: Q, rosterIds: ["1", "2"], roster: [{ id: "1", name: "Ana", group: "5A", av: "A" }, { id: "2", name: "Beto", group: "5A", av: "B" }], colegioNombre: "Colegio CF" });
  await sv("vieja_identificada", "Antigua identificada", false, 1000); await sv("vieja_anonima", "Antigua anónima", true, 2000);
});
const surveys = async () => { let o = []; await env.withSecurityRulesDisabled(async (x) => { o = (await getDocs(collection(x.firestore(), "colegios/col-cf/surveys"))).docs.map((d) => d.data()); }); return o; };
const until = async (fn, ms = 10000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 250)); } };

const vite = spawn("npx", ["vite", "--port", "5183", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept());
  await p.goto("http://localhost:5183/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), "psi@cf.co");
  await p.waitForSelector("text=Dashboard", { timeout: 15000 }); await p.click("button:has-text('Encuestas')"); await p.waitForSelector("text=Antigua anónima");
  let t = (await p.innerText("body")).replace(/\s+/g, " ");
  check((t.match(/🔒 Confidencial/g) || []).length === 2 && !/Anónima|Identificada/.test(t.replace("Antigua anónima", "").replace("Antigua identificada", "")), "las dos encuestas antiguas (marcadas «anónima» e «identificada») se ven igual: «🔒 Confidencial»");
  // Formulario nuevo
  await p.locator("button:has-text('+ Nueva Encuesta')").first().click(); await p.waitForSelector("text=Crear Nueva Encuesta");
  t = (await p.innerText("body")).replace(/\s+/g, " ");
  check(t.includes("Confidencial. Los estudiantes no ven lo que responden los demás") && t.includes("Se guarda quién respondió") && !/Anónima/.test(t), "el formulario ya no tiene el interruptor «Anónima»; explica que es confidencial y que se guarda quién respondió");
  await p.fill("input[placeholder='Ej: Sociograma Q2']", "Encuesta nueva"); await p.fill("input[placeholder*='Escribe la pregunta']", "¿Con quién?").catch(() => {});
  const nuevaPreg = p.locator("input[placeholder*='pregunta']").first(); await nuevaPreg.fill("¿Con quién jugarías?"); await nuevaPreg.press("Enter").catch(() => {});
  await p.locator("button:has-text('+ Agregar'), button:has-text('Agregar')").first().click({ timeout: 2000 }).catch(() => {});
  await p.locator("button:has-text('Guardar'), button:has-text('Crear encuesta')").last().click({ timeout: 5000 }).catch(() => {});
  const nueva = await until(async () => (await surveys()).find((s) => s.title === "Encuesta nueva"));
  check(!!nueva && !("anon" in nueva), "una encuesta nueva se guarda sin el campo «anon»" + (nueva ? "" : " (no se creó)"));
  // Duplicar una antigua no arrastra el dato
  await p.locator("xpath=//span[normalize-space()='Antigua anónima']/ancestor::div[.//button[contains(.,'Duplicar')]][1]//button[contains(.,'Duplicar')]").first().click();
  const copia = await until(async () => (await surveys()).find((s) => s.title === "Copia de Antigua anónima"));
  check(!!copia && !("anon" in copia), "duplicar una encuesta antigua no copia el dato «anon»");
  // JSON exportado
  const [dl] = await Promise.all([p.waitForEvent("download"), p.locator("xpath=//span[normalize-space()='Antigua identificada']/ancestor::div[.//button[contains(.,'JSON')]][1]//button[contains(.,'JSON')]").first().click()]);
  const json = JSON.parse(readFileSync(await dl.path(), "utf8"));
  check(!("anonima" in json) && json.preguntas.length === 1, "el JSON exportado ya no trae «anonima»");
  check(errs.length === 0, "sin errores de JavaScript" + (errs.length ? ": " + errs[0] : ""));
  // Lo que ve el estudiante
  for (const id of ["vieja_identificada", "vieja_anonima"]) {
    const q = await (await b.newContext()).newPage(); await q.goto(`http://localhost:5183/?c=col-cf&survey=${id}`); await q.waitForSelector("text=¿Quién eres tú?", { timeout: 15000 });
    const tq = (await q.innerText("body")).replace(/\s+/g, " ");
    check(tq.includes("Tus respuestas son confidenciales: solo las ve el equipo del colegio. Tus compañeros no ven lo que respondes."), `el estudiante ve el aviso de confidencialidad (${id})`);
    check(!/anónim/i.test(tq.replace(/Antigua an[oó]nima/, "")), "y nada que prometa anonimato (se excluye el título de ejemplo, que dice «anónima»)");
    await q.close();
  }
} catch (e) { console.log("FALLÓ  excepción:", e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} comprobación(es) fallaron` : "\nTodo bien");
process.exit(failed ? 1 : 0);
