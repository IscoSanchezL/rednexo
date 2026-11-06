// Importar grupos y estudiantes desde la plantilla CSV.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDocs, collection } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore(), cid = "col-im";
  await setDoc(doc(db, `colegios/${cid}`), { nombre: "Colegio IM" }); await setDoc(doc(db, `colegios/${cid}/settings/global`), { colegio: "Colegio IM" });
  await setDoc(doc(db, `colegios/${cid}/miembros/psi@im.co`), { email: "psi@im.co", role: "psychologist", status: "active" });
  await setDoc(doc(db, `colegios/${cid}/groups/g1`), { id: "g1", name: "5° A", color: "#a78bfa" });
  await setDoc(doc(db, `colegios/${cid}/students/1`), { id: "1", name: "Ana Pérez", group: "5° A", av: "AP" });
});
const leer = async (sub) => { let o = []; await env.withSecurityRulesDisabled(async (x) => { o = (await getDocs(collection(x.firestore(), `colegios/col-im/${sub}`))).docs.map((d) => d.data()); }); return o; };
const until = async (fn, ms = 10000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 250)); } };
const vite = spawn("npx", ["vite", "--port", "5186", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:5186/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), "psi@im.co");
  await p.waitForSelector("text=Dashboard", { timeout: 15000 }); await p.click("button:has-text('Grupos')"); await p.waitForSelector("text=Gestión de Grupos");
  // Plantilla
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("button:has-text('Plantilla')")]);
  const tpl = readFileSync(await dl.path(), "utf8");
  check(dl.suggestedFilename() === "plantilla-grupos-y-estudiantes.csv" && tpl.includes("Grupo;Estudiante") && tpl.includes("(Ejemplo)"), "descarga la plantilla CSV con encabezado y filas de ejemplo");
  // Importar: la plantilla sin tocar no importa nada
  await p.setInputFiles("[data-testid=import-grupos]", { name: "plantilla.csv", mimeType: "text/csv", buffer: Buffer.from(tpl) });
  await p.waitForSelector("text=Vista previa de la importación");
  check(await p.locator("button:has-text('Confirmar importación')").isDisabled(), "la plantilla sin diligenciar no se puede importar (los ejemplos se ignoran)");
  await p.click("button:has-text('Cancelar')");
  // Archivo diligenciado: grupo nuevo, uno existente, un repetido y una fila incompleta
  const csv = "Grupo;Estudiante\n5° A;Ana Pérez\n5° A;Beto Díaz\n6° B;Carla Ruiz\n6° B;Dani Soto\n;Sin grupo\n";
  await p.setInputFiles("[data-testid=import-grupos]", { name: "mi-colegio.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await p.waitForSelector("text=Vista previa de la importación");
  let t = (await p.innerText("body")).replace(/\s+/g, " ");
  check(/1 grupo\(s\) nuevo\(s\): 6° B y se agregarán 3 estudiante\(s\)/.test(t) && /Se omiten 1 que ya existen/.test(t) && t.includes("Línea 6: falta el grupo"), "la vista previa cuenta grupos y estudiantes nuevos, repetidos y errores");
  check((await leer("students")).length === 1, "antes de confirmar no se guarda nada");
  await p.click("button:has-text('Confirmar importación')");
  const est = await until(async () => { const s = await leer("students"); return s.length === 4 ? s : null; });
  const grp = await leer("groups");
  check(!!est && est.filter((s) => s.group === "6° B").length === 2 && est.filter((s) => s.group === "5° A").length === 2, "se guardaron los estudiantes en sus grupos");
  check(grp.some((g) => g.name === "6° B") && grp.length === 2, "se creó el grupo nuevo y no se duplicó el existente");
  await p.waitForSelector("text=Importación lista");
  const act = await leer("activity");
  check(act.some((a) => /importó 3 estudiante/.test(a.action || "")), "queda registrado en la actividad");
  check(errs.length === 0, "sin errores de JavaScript" + (errs.length ? ": " + errs[0] : ""));
} catch (e) { console.log("FALLÓ  excepción: " + e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} fallo(s)` : "\nImportar OK"); process.exit(failed ? 1 : 0);
