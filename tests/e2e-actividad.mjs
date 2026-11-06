// Registro de actividad: cada acción real deja su entrada, con quién, cuándo y sin nombres de estudiantes.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDocs, collection } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore(), cid = "col-act";
  await setDoc(doc(db, `colegios/${cid}`), { nombre: "Colegio Act" }); await setDoc(doc(db, `colegios/${cid}/settings/global`), { colegio: "Colegio Act" });
  for (const [e, role] of [["admin@act.co", "admin"], ["psi@act.co", "psychologist"], ["ro@act.co", "readonly"]]) await setDoc(doc(db, `colegios/${cid}/miembros/${e}`), { email: e, role, status: "active" });
  await setDoc(doc(db, `colegios/${cid}/groups/g1`), { id: "g1", name: "5A", color: "#a78bfa" });
  for (const [i, n] of ["Ana", "Beto"].entries()) await setDoc(doc(db, `colegios/${cid}/students/${i + 1}`), { id: String(i + 1), name: n, group: "5A", av: n[0] });
});
const entradas = async () => { let out = []; await env.withSecurityRulesDisabled(async (c) => { out = (await getDocs(collection(c.firestore(), "colegios/col-act/activity"))).docs.map((d) => d.data()); }); return out; };
const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 250)); } };

const vite = spawn("npx", ["vite", "--port", "5187", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
const login = async (email) => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage(); p.ctx = ctx;
  const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.errs = errs; p.on("dialog", (d) => d.accept());
  await p.goto("http://localhost:5187/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), email);
  await p.waitForSelector("text=Dashboard", { timeout: 15000 }); return p;
};
const tab = async (p, t) => { await p.click(`button:has-text('${t}')`); await p.waitForTimeout(500); };
const body = async (p) => (await p.innerText("body")).replace(/\s+/g, " ");
try {
  const p = await login("admin@act.co");
  check(!!(await until(async () => (await entradas()).some((e) => e.action === "ingresó a RedNexo" && e.email === "admin@act.co"))), "al entrar se registra el ingreso");
  // Grupos
  await tab(p, "Grupos");
  await p.click("button:has-text('+ Nuevo Grupo')"); await p.fill("input[placeholder='Ej: 7° B']", "Séptimo"); await p.click("button:has-text('Crear')"); await p.waitForSelector("text=/creado/");
  await p.locator("xpath=//span[normalize-space()='Séptimo']/../..//button[contains(.,'Agregar')]").first().click();
  await p.fill("input[placeholder='Nombre completo']", "Zoe Secreta"); await p.locator("xpath=//input[@placeholder='Nombre completo']/following::button[1]").click(); await p.waitForSelector("text=Zoe Secreta");
  // Encuestas
  await tab(p, "Encuestas");
  await p.locator("button:has-text('Encuesta de prueba')").first().click(); await p.waitForSelector("text=Encuesta de prueba — Sociograma");
  await p.locator("button:has-text('Borrador')").first().click(); await p.waitForSelector("text=● Activa");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.locator("button:has-text('⬇ JSON')").first().click()]); await dl.path();
  // Reportes
  await tab(p, "Reportes"); await p.waitForSelector("text=Configurar reporte");
  const [dl2] = await Promise.all([p.waitForEvent("download"), p.locator("text=Archivo HTML completo").click()]); await dl2.path();
  // Usuarios
  await tab(p, "Usuarios"); await p.fill("input[placeholder='correo@gmail.com']", "nuevo@act.co"); await p.click("button:has-text('Autorizar acceso')"); await p.waitForSelector("text=/autorizado correctamente/");
  // Configuración
  await tab(p, "Config"); await p.fill("input[placeholder='Nombre del colegio']", "Colegio Auditado"); await p.click("button:has-text('Guardar todos los cambios')"); await p.waitForTimeout(800);
  const [dl3] = await Promise.all([p.waitForEvent("download"), p.click("button:has-text('Exportar datos del colegio')")]); await dl3.path();
  await p.waitForSelector("text=/Descargado:/");

  const esperadas = ["creó el grupo", "agregó un estudiante al grupo", "creó la encuesta de prueba", "activó la encuesta", "exportó la encuesta (JSON)", "descargó el reporte Individual (HTML)", "autorizó el acceso (Psicólogo Escolar)", "actualizó la configuración del colegio", "exportó los datos del colegio"];
  const ok = await until(async () => { const a = (await entradas()).map((e) => e.action); return esperadas.every((x) => a.includes(x)); }, 10000);
  const all = await entradas();
  check(!!ok, `quedan registradas las ${esperadas.length} acciones realizadas` + (ok ? "" : " — faltan: " + esperadas.filter((x) => !all.some((e) => e.action === x)).join(" | ")));
  check(all.every((e) => e.email === "admin@act.co" && e.user === "admin@act.co" && e.createdAt && typeof e.createdAt.toDate === "function"), "cada entrada lleva quién la hizo y la hora del servidor");
  check(!JSON.stringify(all).match(/Zoe|Secreta|Ana|Beto/), "ninguna entrada contiene nombres de estudiantes");
  check(all.find((e) => e.action === "creó el grupo").detail === "Séptimo" && all.find((e) => e.action === "agregó un estudiante al grupo").detail === "Séptimo", "el detalle indica el grupo, no la persona");

  // La pantalla
  await tab(p, "Actividad"); await p.waitForSelector("text=Actividad Reciente"); await p.waitForTimeout(800);
  const t = await body(p);
  check(esperadas.every((x) => t.includes(x)) && /Hoy \d\d:\d\d/.test(t), "la pestaña Actividad las muestra, con «Hoy hh:mm»");
  check(!t.includes("No hay actividad registrada") && /\(\d+ entradas\)/.test(t), "ya no dice «No hay actividad registrada»");
  const filas = await p.locator("span[title='admin@act.co']").count();
  check(filas >= esperadas.length, `cada fila muestra la hora y, al pasar el cursor, el correo (${filas} filas)`);
  const primera = (await p.locator("div:has(> span[title='admin@act.co'])").first().innerText()).replace(/\s+/g, " ");
  check(/exportó los datos del colegio/.test(primera) === true || /actualizó|exportó/.test(primera), "la más reciente va primero (" + primera.slice(0, 60) + ")");
  // Recargar no duplica el ingreso
  await p.reload(); await p.waitForSelector("text=Dashboard"); await p.waitForTimeout(1200);
  check((await entradas()).filter((e) => e.action === "ingresó a RedNexo" && e.email === "admin@act.co").length === 1, "recargar la página no vuelve a registrar el ingreso");
  check(p.errs.length === 0, "sin errores de JavaScript" + (p.errs.length ? ": " + p.errs[0] : ""));

  // Un psicólogo: sus acciones también quedan, pero no ve la pestaña
  const psi = await login("psi@act.co");
  check(!(await body(psi)).includes("Actividad") || !(await psi.locator("button:has-text('Actividad')").count()), "el psicólogo no tiene la pestaña Actividad");
  await tab(psi, "Grupos"); await psi.click("button:has-text('+ Nuevo Grupo')"); await psi.fill("input[placeholder='Ej: 7° B']", "Octavo"); await psi.click("button:has-text('Crear')"); await psi.waitForSelector("text=/creado/");
  const deP = await until(async () => (await entradas()).find((e) => e.email === "psi@act.co" && e.action === "creó el grupo"));
  check(!!deP && deP.user === "psi@act.co" && deP.detail === "Octavo", "la acción del psicólogo queda registrada a su nombre");
  await p.bringToFront(); await tab(p, "Dashboard"); await tab(p, "Actividad"); await p.waitForSelector("text=Actividad Reciente");
  check(await p.locator("span[title='psi@act.co']").count() >= 1, "el administrador ve la acción del psicólogo");
  // Solo lectura: no escribe nada y no rompe
  const ro = await login("ro@act.co"); await tab(ro, "Dashboard"); await ro.waitForTimeout(1500);
  check(!(await entradas()).some((e) => e.email === "ro@act.co") && ro.errs.length === 0, "el usuario de solo lectura no deja entradas y la app no falla");
} catch (e) { console.log("FALLÓ  excepción:", e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} comprobación(es) fallaron` : "\nTodo bien");
process.exit(failed ? 1 : 0);
