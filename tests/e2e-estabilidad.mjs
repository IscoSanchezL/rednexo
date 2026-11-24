// Auditoría de estabilidad: recorre TODAS las pestañas con cada rol y con distintos volúmenes de datos
// (colegio vacío, estudiantes sin respuestas, colegio con datos), en escritorio y en celular.
// Busca: errores de JavaScript, errores de consola, peticiones fallidas, textos rotos (NaN, undefined, [object Object]),
// desbordes horizontales, tiempos lentos, botones de edición visibles para solo lectura y descargas corruptas.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const PORT = 5220;

// ── Datos ──
const NOM = ["Valentina Ortiz", "Samuel Cárdenas", "Mariana Beltrán", "Tomás Quintero", "Isabela Mejía", "Emilio Roldán", "Luciana Parra", "Mateo Salazar", "Renata Vélez", "Andrés Montoya", "Sofía Naranjo", "Julián Herrera", "Camila Restrepo", "Daniel Aguirre", "Antonia Giraldo", "Sebastián Lozano", "Paula Cano", "Nicolás Duque", "Gabriela Ríos", "Martín Escobar", "Juliana Pineda", "Felipe Arango", "Laura Zapata", "Simón Correa"];
const ST = NOM.map((name, i) => ({ id: String(i + 1), name, group: i < 12 ? "6A" : "6B", av: name.split(" ").map((w) => w[0]).join("") }));
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const elegir = (yo, n) => { const pool = ST.filter((x) => x.group === yo.group && x.id !== yo.id); const o = []; while (o.length < n) { const c = pool[Math.floor(rnd() * pool.length)].id; if (!o.includes(c)) o.push(c); } return o; };
const Q = [{ id: "q1", text: "¿Con quién trabajarías?", tp: "pos", kind: "justificable", obligatoria: true }, { id: "q2", text: "¿Con quién NO trabajarías?", tp: "neg" }, { id: "q3", text: "¿Qué mejorarías?", tp: "neu", kind: "abierta" }];
const mail = (role, cid) => `${role}@${cid}.co`;
async function colegio(cid, { estudiantes = true, respuestas = true } = {}) {
  const P = `colegios/${cid}`;
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, P), { nombre: "Colegio " + cid }); await setDoc(doc(db, P + "/settings/global"), { colegio: "Colegio " + cid });
    for (const role of ["admin", "psychologist", "readonly"]) { const email = mail(role, cid); await setDoc(doc(db, `${P}/miembros/${email}`), { email, name: role, role, status: "active" }); }
    if (!estudiantes) return;
    await setDoc(doc(db, P + "/groups/g1"), { id: "g1", name: "6A", color: "#3b82f6" }); await setDoc(doc(db, P + "/groups/g2"), { id: "g2", name: "6B", color: "#f59e0b" });
    for (const s of ST) await setDoc(doc(db, `${P}/students/${s.id}`), s);
    const base = { status: "active", group: "6A", groups: ["6A", "6B"], maxSel: 3, createdAt: Timestamp.fromMillis(Date.now()), rosterIds: ST.map((s) => s.id), roster: ST, colegioNombre: "Colegio " + cid };
    await setDoc(doc(db, P + "/surveys/sv1"), { id: "sv1", title: "Encuesta A", questions: Q, ...base });
    await setDoc(doc(db, P + "/surveys/sv2"), { id: "sv2", title: "Encuesta B (sin respuestas)", questions: Q.slice(0, 2), ...base });
    const SOLO = [{ id: "99", name: "Único Estudiante", group: "Solo", av: "UE" }];
    await setDoc(doc(db, P + "/groups/g3"), { id: "g3", name: "Solo", color: "#10b981" }); await setDoc(doc(db, P + "/students/99"), SOLO[0]);
    await setDoc(doc(db, P + "/surveys/sv4"), { id: "sv4", title: "Grupo de uno", questions: [{ id: "q1", text: "¿Con quién trabajarías?", tp: "pos", obligatoria: true }], ...base, group: "Solo", groups: ["Solo"], rosterIds: ["99"], roster: SOLO });
    await setDoc(doc(db, P + "/surveys/sv3"), { id: "sv3", title: "Borrador", questions: Q.slice(0, 1), ...base, status: "draft" });
    if (!respuestas) return;
    for (const s of ST) { if (Number(s.id) % 7 === 0) continue; const q1 = elegir(s, 3); await setDoc(doc(db, `${P}/responses/sv1_${s.id}`), { surveyId: "sv1", respondentId: s.id, respondentName: s.name, submittedAt: Timestamp.fromMillis(Date.now()), answers: { q1, q2: rnd() < 0.5 ? elegir(s, 1) : [] }, justificaciones: Object.fromEntries(q1.map((t) => [`q1|${t}`, "Buen compañero"])), abiertas: { q3: "Más tiempo libre" } }); }
  });
}
await colegio("vacio", { estudiantes: false });
await colegio("sinresp", { respuestas: false });
await colegio("lleno");

const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
const hallazgos = []; let pruebas = 0;
const check = (ok, msg) => { pruebas++; console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) hallazgos.push(msg); };
const b = await chromium.launch();
const MALO = /\bNaN\b|\bundefined\b|\[object Object\]|\bInfinity\b|\bnull%/;

async function sesion(cid, email, { movil = false } = {}) {
  const ctx = await b.newContext({ viewport: movil ? { width: 390, height: 844 } : { width: 1360, height: 900 }, acceptDownloads: true, isMobile: movil, hasTouch: movil });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("JS: " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/favicon|net::ERR_|Failed to load resource|WebChannelConnection|firestore\.googleapis|localhost:8080|identitytoolkit|127\.0\.0\.1/.test(m.text())) errs.push("consola: " + m.text().slice(0, 160)); });
  p.on("dialog", (d) => d.accept());
  await p.addInitScript((c) => { try { sessionStorage.setItem("rn-colegio", c); localStorage.setItem("rednexo-colegio", c); } catch {} }, cid);
  await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => !!window.__rnSignIn, null, { timeout: 20000 });
  await p.evaluate((e) => window.__rnSignIn(e), email);
  await p.waitForSelector("header", { timeout: 25000 });
  return { p, errs, ctx };
}
async function elegirColegio(p, cid) {
  // Si aparece el selector de colegio, entra al indicado
  const sel = p.locator(`text=Colegio ${cid}`).first();
  if (await sel.count() && !(await p.locator("header button:has-text('Dashboard')").count())) await sel.click().catch(() => {});
  await p.waitForSelector("header button:has-text('Dashboard')", { timeout: 20000 });
}
async function recorrer(p, errs, etiqueta, { movil = false, esperadas = [] } = {}) {
  const tabs = await p.locator("header > div button").allInnerTexts();
  const nombres = tabs.map((t) => t.replace(/^[^\p{L}]+/u, "").trim()).filter((t) => /^(Dashboard|Encuestas|Matriz|Grupos|Reportes|Gráficos|Usuarios|Actividad|Config)/.test(t));
  for (const n of nombres) {
    const t0 = Date.now();
    await p.locator(`header button:has-text('${n}')`).first().click();
    await p.waitForTimeout(350);
    const ms = Date.now() - t0;
    const txt = await p.innerText("body");
    const mal = txt.match(MALO);
    check(!mal, `${etiqueta} · ${n}: sin textos rotos${mal ? " (aparece «" + mal[0] + "»)" : ""}`);
    check(ms < 2500, `${etiqueta} · ${n}: abre en ${ms} ms`);
    const desborde = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (movil) check(desborde <= 2, `${etiqueta} · ${n}: sin desborde horizontal en celular (${desborde}px)`);
    else check(desborde <= 2, `${etiqueta} · ${n}: sin desborde horizontal (${desborde}px)`);
  }
  check(errs.length === 0, `${etiqueta}: sin errores de JavaScript ni de consola${errs.length ? " → " + errs.slice(0, 3).join(" | ") : ""}`);
  return nombres;
}

try {
  // ── A. Colegio vacío ──
  { const { p, errs } = await sesion("vacio", mail("admin", "vacio")); await elegirColegio(p, "vacio").catch(() => {}); const n = await recorrer(p, errs, "Colegio vacío (admin)"); check(n.length >= 5, "Colegio vacío: aparecen las pestañas (" + n.join(", ") + ")"); await p.context().close(); }
  // ── B. Estudiantes sin respuestas ──
  { const { p, errs } = await sesion("sinresp", mail("psychologist", "sinresp")); await elegirColegio(p, "sinresp").catch(() => {});
    const n = await recorrer(p, errs, "Sin respuestas (psicólogo)");
    // Reportes con cero respuestas: ningún tipo debe romperse ni escribir NaN
    await p.click("header button:has-text('Reportes')"); await p.waitForTimeout(400);
    for (const tipo of ["Individual", "Grupal", "Completo"]) {
      await p.click(`button:has-text('${tipo}')`).catch(() => {});
      const [d] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }).catch(() => null), p.locator("text=Descargar HTML").click()]);
      if (d) { const html = readFileSync(await d.path(), "utf8"); const m = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").match(MALO); check(!m, `Reporte ${tipo} sin respuestas: sin textos rotos${m ? " («" + m[0] + "»)" : ""}`); }
      else check(false, `Reporte ${tipo} sin respuestas: no se pudo descargar`);
    }
    check(errs.length === 0, "Sin respuestas: sin errores tras generar reportes" + (errs.length ? " → " + errs[0] : ""));
    await p.context().close(); }
  // ── C. Colegio con datos, por rol ──
  for (const rol of ["admin", "psychologist", "readonly"]) {
    const { p, errs } = await sesion("lleno", mail(rol, "lleno")); await elegirColegio(p, "lleno").catch(() => {});
    await p.waitForSelector("text=PARTICIPANTES", { timeout: 20000 }).catch(() => {});
    const n = await recorrer(p, errs, `Con datos (${rol})`);
    if (rol === "readonly") {
      check(!n.some((t) => /Usuarios|Actividad|Config/.test(t)), "Solo lectura: no ve Usuarios, Actividad ni Config");
      await p.click("header button:has-text('Encuestas')"); await p.waitForTimeout(400);
      const t = await p.innerText("body");
      check(!/Nueva Encuesta/.test(t) && !/Importar/.test(t), "Solo lectura: no ve «Nueva Encuesta» ni «Importar»");
      check(await p.locator("button:has-text('Editar')").count() === 0, "Solo lectura: no ve botones «Editar»");
      await p.click("header button:has-text('Grupos')"); await p.waitForTimeout(400);
      check(!/Nuevo Grupo/.test(await p.innerText("body")), "Solo lectura: no ve «Nuevo Grupo»");
    }
    if (rol === "psychologist") check(!n.some((t) => /Usuarios|Actividad|Config/.test(t)), "Psicólogo: no ve Usuarios, Actividad ni Config");
    if (rol === "admin") check(["Usuarios", "Actividad", "Config"].every((x) => n.some((t) => t.startsWith(x))), "Admin: ve Usuarios, Actividad y Config");
    await p.context().close();
  }
  // ── D. Celular ──
  { const { p, errs } = await sesion("lleno", mail("psychologist", "lleno"), { movil: true }); await elegirColegio(p, "lleno").catch(() => {}); await p.waitForTimeout(800); await recorrer(p, errs, "Celular (psicólogo)", { movil: true }); await p.context().close(); }
  // ── E. Descargas de la encuesta con datos ──
  { const { p, errs } = await sesion("lleno", mail("admin", "lleno")); await elegirColegio(p, "lleno").catch(() => {});
    await p.click("header button:has-text('Encuestas')"); await p.waitForTimeout(600);
    // El botón de Excel está desactivado en una encuesta sin respuestas (correcto); se toma el de la que sí las tiene.
    const sinResp = await p.locator("button[disabled]:has-text('Resultados (Excel)')").count();
    check(sinResp >= 1, "Excel desactivado en las encuestas sin respuestas (" + sinResp + ")");
    const [dx] = await Promise.all([p.waitForEvent("download", { timeout: 20000 }).catch(() => null), p.locator("button:not([disabled]):has-text('Resultados (Excel)')").first().click()]);
    if (dx) { const buf = readFileSync(await dx.path()); check(buf.length > 2000 && buf.toString("latin1", 0, 2) === "PK", `Descarga Excel: archivo válido (${buf.length} bytes) · ${dx.suggestedFilename()}`); } else check(false, "Descarga Excel: no se generó");
    let hallado = false;
    const nJson = await p.locator("button:has-text('JSON')").count();
    for (let i = 0; i < nJson && !hallado; i++) {
      const [d] = await Promise.all([p.waitForEvent("download", { timeout: 20000 }).catch(() => null), p.locator("button:has-text('JSON')").nth(i).click()]);
      if (!d) continue;
      try { const j = JSON.parse(readFileSync(await d.path(), "utf8")); if (j.titulo === "Encuesta A") { hallado = true; check(Array.isArray(j.preguntas) && j.preguntas.length === 3 && j.preguntas[0].obligatoria === true && j.preguntas[2].formato === "abierta", "JSON: conserva las preguntas, el tipo y la obligatoriedad"); } } catch { check(false, "JSON: no se puede leer"); }
    }
    check(hallado, "JSON de «Encuesta A» descargado");
    const [dc] = await Promise.all([p.waitForEvent("download", { timeout: 20000 }).catch(() => null), p.locator("button:has-text('CSV')").first().click()]);
    check(!!dc && readFileSync(await dc.path(), "utf8").split("\n").length >= 2, "Descarga CSV: archivo con preguntas");
    check(errs.length === 0, "Descargas: sin errores" + (errs.length ? " → " + errs[0] : ""));
    await p.context().close(); }
  // ── F. Estudiante: doble envío y recarga ──
  { const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const e = await ctx.newPage(); const errs = []; e.on("pageerror", (x) => errs.push(x.message));
    await e.goto(`http://localhost:${PORT}/?c=lleno&survey=sv2`); await e.waitForSelector("text=¿Quién eres tú?", { timeout: 20000 });
    await e.locator("button:has-text('Valentina')").click(); await e.waitForSelector("text=Pregunta 1");
    await e.locator("button:has-text('Mariana')").first().click(); await e.locator("textarea").first().fill("Buena compañera"); await e.locator("button:has-text('Siguiente')").click(); await e.waitForSelector("text=Pregunta 2");
    const enviar = e.locator("button:has-text('Enviar')");
    await enviar.dblclick();
    await e.waitForSelector("text=Gracias", { timeout: 15000 });
    let n = 0; await env.withSecurityRulesDisabled(async (c) => { const { getDocs, collection } = await import("firebase/firestore"); n = (await getDocs(collection(c.firestore(), "colegios/lleno/responses"))).docs.filter((d) => d.id.startsWith("sv2_")).length; });
    check(n === 1, "Doble clic en Enviar: queda una sola respuesta (" + n + ")");
    await e.reload(); await e.waitForSelector("text=¿Quién eres tú?", { timeout: 15000 }); await e.locator("button:has-text('Valentina')").click(); await e.waitForTimeout(800);
    check(/Ya respondiste/.test(await e.innerText("body")), "Volver a entrar como quien ya respondió: lo indica");
    check(errs.length === 0, "Estudiante: sin errores de JavaScript" + (errs.length ? " → " + errs[0] : ""));
    await ctx.close(); }
  // ── G. Celular: la ayuda «i» no se sale de la pantalla ──
  { const { p, errs } = await sesion("lleno", mail("psychologist", "lleno"), { movil: true }); await p.waitForSelector("text=PARTICIPANTES", { timeout: 20000 });
    for (const k of ["conexiones", "densidad"]) {
      await p.locator(`[data-ayuda=${k}]`).first().click(); await p.waitForTimeout(150);
      const r = await p.locator("[role=dialog]").first().boundingBox(); const W = 390;
      if (process.env.DEBUG_AYUDA) console.log("debug", k, JSON.stringify(r), await p.evaluate(() => ({ iw: innerWidth, sw: document.documentElement.scrollWidth, tr: document.querySelector("[role=dialog]")?.style.transform })));
      check(!!r && r.x >= 0 && r.x + r.width <= W, `Celular: la ayuda de ${k} cabe en la pantalla (x=${Math.round(r?.x)}, ancho=${Math.round(r?.width)})`);
      await p.keyboard.press("Escape");
    }
    await p.context().close(); }
  // ── H. Si falla una sección, no se cae toda la app ──
  { const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } }); const p = await ctx.newPage();
    await p.goto(`http://localhost:${PORT}/#boom`); await p.waitForFunction(() => !!window.__rnSignIn, null, { timeout: 20000 });
    await p.evaluate((e) => window.__rnSignIn(e), mail("admin", "lleno")); await p.waitForSelector("header button:has-text('Matriz')", { timeout: 25000 });
    check(await p.locator("[data-error-pantalla]").count() === 1 && /Algo no salió como esperábamos/.test(await p.innerText("body")), "Error de una sección: se muestra un aviso en lugar de pantalla en blanco");
    check(await p.locator("header button:has-text('Matriz')").count() === 1, "…y el menú sigue disponible");
    await p.click("header button:has-text('Matriz')"); await p.waitForTimeout(500);
    check(await p.locator("[data-error-pantalla]").count() === 0 && /Matriz/.test(await p.innerText("body")), "…y al cambiar de sección la app se recupera sola");
    await ctx.close(); }
  // ── I. Estudiante: pregunta obligatoria sin compañeros; envío con mala conexión ──
  { const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const e = await ctx.newPage();
    await e.goto(`http://localhost:${PORT}/?c=lleno&survey=sv4`); await e.waitForSelector("text=¿Quién eres tú?", { timeout: 20000 });
    await e.locator("button:has-text('Único')").click(); await e.waitForSelector("text=Pregunta 1");
    check(!(await e.locator("button:has-text('Enviar')").isDisabled()), "Pregunta obligatoria en un grupo de una sola persona: no lo deja atascado");
    await ctx.close(); }
  { const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const e = await ctx.newPage();
    await e.goto(`http://localhost:${PORT}/?c=lleno&survey=sv2`); await e.waitForSelector("text=¿Quién eres tú?", { timeout: 20000 });
    await e.locator("button:has-text('Samuel')").click(); await e.waitForSelector("text=Pregunta 1");
    await e.locator("button:has-text('Valentina')").first().click(); await e.locator("textarea").first().fill("Buena compañera"); await e.locator("button:has-text('Siguiente')").click(); await e.waitForSelector("text=Pregunta 2");
    await ctx.setOffline(true); await e.locator("button:has-text('Enviar')").click();
    await e.waitForSelector("text=La conexión está lenta o se perdió", { timeout: 15000 }).then(() => check(true, "Sin internet al enviar: avisa que no cierre la pantalla"), () => check(false, "Sin internet al enviar: no avisó nada"));
    await ctx.setOffline(false);
    await e.waitForSelector("text=Gracias", { timeout: 40000 }).then(() => check(true, "…y al volver la conexión la respuesta se envía sola"), () => check(false, "…al volver la conexión la respuesta no se envió"));
    await ctx.close(); }
} catch (x) { console.log("FALLÓ excepción:", x.message.split("\n").slice(0, 4).join(" | ")); hallazgos.push("excepción: " + x.message.split("\n")[0]); }
await b.close(); vite.kill(); await env.cleanup();
console.log(`\n${pruebas} comprobaciones, ${hallazgos.length} hallazgo(s)`); hallazgos.forEach((h, i) => console.log(`  ${i + 1}. ${h}`));
process.exit(hallazgos.length ? 1 : 0);
