// Flujos que faltaba cubrir: guardar la Configuración, exportar los datos, encuesta de prueba, activar/aplicar, papelera y restaurar, PDF de reportes.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDoc, getDocs, collection } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const CID = "col-fl", P = `colegios/${CID}`;
const ST = ["Ana Pérez", "Beto Díaz", "Carla Ruiz", "Dani Mora"].map((name, i) => ({ id: String(i + 1), name, group: "7A", av: name.split(" ").map((w) => w[0]).join("") }));
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, P), { nombre: "Colegio Flujos" }); await setDoc(doc(db, P + "/settings/global"), { colegio: "Colegio Flujos", ciudad: "Cali" });
  await setDoc(doc(db, P + "/miembros/adm@fl.co"), { email: "adm@fl.co", role: "admin", status: "active" });
  await setDoc(doc(db, P + "/groups/g1"), { id: "g1", name: "7A", color: "#3b82f6" });
  for (const s of ST) await setDoc(doc(db, `${P}/students/${s.id}`), s);
});
const leer = async (path) => { let o = []; await env.withSecurityRulesDisabled(async (x) => { o = (await getDocs(collection(x.firestore(), path))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return o; };
const vite = spawn("npx", ["vite", "--port", "5240", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0; const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
try {
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); const avisos = []; p.on("dialog", (d) => { avisos.push(d.message()); d.accept(); });
  await p.goto("http://localhost:5240/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((x) => window.__rnSignIn(x), "adm@fl.co");
  await p.waitForSelector("header button:has-text('Config')", { timeout: 25000 });

  // ── Configuración ──
  await p.click("header button:has-text('Config')"); await p.waitForTimeout(500);
  check(await p.locator("button:has-text('Guardar cambios')").isDisabled(), "Configuración: «Guardar cambios» está desactivado mientras no hay cambios");
  const anio = new Date().getFullYear();
  const periodos = await p.locator("select").first().locator("option").allInnerTexts().catch(() => []);
  await p.getByPlaceholder("Nombre del colegio").fill("Colegio Flujos Nuevo"); await p.getByPlaceholder("Ciudad", { exact: true }).fill("Medellín");
  check(/Cambios sin guardar/.test(await p.innerText("body")), "…al editar aparece «Cambios sin guardar»");
  await p.click("button:has-text('Guardar cambios')"); await p.waitForSelector("text=Guardado", { timeout: 8000 });
  const st = (await getDocSafe()).data;
  async function getDocSafe() { let d; await env.withSecurityRulesDisabled(async (x) => { d = (await getDoc(doc(x.firestore(), P + "/settings/global"))).data(); }); return { data: d }; }
  check(st.colegio === "Colegio Flujos Nuevo" && st.ciudad === "Medellín", "…guardar escribe el nombre y la ciudad en la base de datos");
  await p.reload(); await p.waitForSelector("header button:has-text('Config')", { timeout: 25000 });
  check((await p.innerText("header")).includes("Colegio Flujos Nuevo"), "…y el nuevo nombre del colegio aparece en el encabezado tras recargar");
  await p.click("header button:has-text('Config')"); await p.waitForTimeout(500);
  const optsPeriodo = await p.locator("select option").allInnerTexts();
  check(optsPeriodo.some((o) => o.includes(String(anio + 1))) && optsPeriodo.some((o) => o.includes(String(anio))), `El selector de período incluye el año actual y el siguiente (${anio}, ${anio + 1})`);
  const [dd] = await Promise.all([p.waitForEvent("download", { timeout: 20000 }), p.locator("button:has-text('Exportar datos')").first().click()]);
  const j = JSON.parse(readFileSync(await dd.path(), "utf8"));
  check(j.datos && j.datos.students.length === 4 && Array.isArray(j.datos.groups), "Exportar datos del colegio: JSON válido con los estudiantes y grupos (" + dd.suggestedFilename() + ")");

  // ── Encuesta de prueba → activar → aplicar → papelera → restaurar ──
  await p.click("header button:has-text('Encuestas')"); await p.waitForTimeout(500);
  await p.click("button:has-text('Crear encuesta de prueba')"); await p.waitForTimeout(1200);
  let sv = await leer(P + "/surveys");
  check(sv.length === 1 && sv[0].status !== "active" && sv[0].questions.length >= 3, "«Crear encuesta de prueba» crea un borrador con preguntas de los tres tipos");
  await p.locator("button:has-text('Borrador')").first().click(); await p.waitForTimeout(800);
  sv = await leer(P + "/surveys"); check(sv[0].status === "active", "Pulsar «Borrador» la activa");
  const [pop] = await Promise.all([ctx.waitForEvent("page", { timeout: 10000 }), p.locator("button:has-text('Aplicar')").first().click()]);
  await pop.waitForLoadState(); check(/survey=/.test(pop.url()), "«Aplicar» abre la encuesta en una pestaña nueva: " + pop.url().replace(/^.*\?/, "?")); await pop.close();
  await p.locator("button:has-text('Link')").first().click(); await p.waitForTimeout(400);
  check(avisos.some((a) => /Link copiado/.test(a)) && /survey=/.test(await p.evaluate(() => navigator.clipboard.readText())), "«Link» copia el enlace al portapapeles");
  await p.locator("button.dan, button:has-text('🗑')").first().click(); await p.waitForTimeout(900);
  sv = await leer(P + "/surveys"); check(sv[0].deleted === true, "Eliminar manda la encuesta a la papelera");
  await p.locator("summary:has-text('Papelera'), button:has-text('Papelera')").first().click().catch(() => {}); await p.waitForTimeout(300);
  await p.locator("button:has-text('Restaurar')").first().click(); await p.waitForTimeout(900);
  sv = await leer(P + "/surveys"); check(sv[0].deleted === false || sv[0].deleted == null, "Restaurar la saca de la papelera");

  // ── PDF de reportes (ventana de impresión) ──
  await p.click("header button:has-text('Reportes')"); await p.waitForTimeout(500);
  for (const tipo of ["Individual", "Grupal", "Completo"]) {
    await p.click(`button:has-text('${tipo}')`);
    const [w] = await Promise.all([ctx.waitForEvent("page", { timeout: 10000 }).catch(() => null), p.locator("text=Exportar PDF").first().click()]);
    if (!w) { check(false, `PDF ${tipo}: no se abrió la ventana (avisos: ${avisos.slice(-2).join(" | ")})`); continue; }
    await w.waitForLoadState(); const t = await w.innerText("body");
    check(/Reporte|RedNexo/.test(t) && !/\bNaN\b|undefined/.test(t), `PDF ${tipo}: abre la ventana de impresión con el reporte`);
    await w.close();
  }
  check(errs.length === 0, "sin errores de JavaScript" + (errs.length ? ": " + errs[0] : ""));
} catch (x) { console.log("FALLÓ excepción:", x.message.split("\n").slice(0, 4).join(" | ")); failed++; }
await b.close(); vite.kill(); await env.cleanup(); console.log(failed ? `\n${failed} fallo(s)` : "\nFlujos OK"); process.exit(failed ? 1 : 0);
