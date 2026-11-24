// Preguntas abiertas: solo texto libre, sin elegir compañeros; se ven en el informe y el Excel, no cuentan como conexiones.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDocs, collection, Timestamp } from "firebase/firestore";
import { spawn, execFileSync } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const CID = "col-ab", P = `colegios/${CID}`;
const ST = [["1", "Ana Pérez"], ["2", "Beto Díaz"], ["3", "Carla Ruiz"]].map(([id, name]) => ({ id, name, group: "5A", av: name.split(" ").map((w) => w[0]).join("") }));
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, P), { nombre: "Colegio AB" }); await setDoc(doc(db, P + "/settings/global"), { colegio: "Colegio AB" });
  await setDoc(doc(db, P + "/miembros/psi@ab.co"), { email: "psi@ab.co", role: "psychologist", status: "active" });
  await setDoc(doc(db, P + "/groups/g1"), { id: "g1", name: "5A", color: "#a78bfa" });
  for (const s of ST) await setDoc(doc(db, `${P}/students/${s.id}`), s);
  const questions = [{ id: "q1", text: "¿Con quién trabajarías?", tp: "pos" }, { id: "q2", text: "¿Qué mejorarías del salón?", tp: "neu", kind: "abierta" }, { id: "q3", text: "¿Alguna sugerencia?", tp: "neu", kind: "abierta" }];
  await setDoc(doc(db, P + "/surveys/sv1"), { id: "sv1", title: "Con abiertas", status: "active", group: "5A", groups: ["5A"], maxSel: 2, createdAt: Timestamp.fromMillis(Date.now()), questions, rosterIds: ST.map((s) => s.id), roster: ST, colegioNombre: "Colegio AB" });
});
const leer = async (path) => { let o = []; await env.withSecurityRulesDisabled(async (x) => { o = (await getDocs(collection(x.firestore(), path))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return o; };
const until = async (fn, ms = 10000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 250)); } };
const vite = spawn("npx", ["vite", "--port", "5176", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0; const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
try {
  const errs = [];
  // ── Estudiante 1: elige a Beto y escribe una opinión; deja la segunda abierta en blanco ──
  const e = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); e.on("pageerror", (x) => errs.push(x.message));
  await e.goto(`http://localhost:5176/?c=${CID}&survey=sv1`); await e.waitForSelector("text=¿Quién eres tú?", { timeout: 15000 });
  await e.locator("button:has-text('Ana')").click(); await e.waitForSelector("text=Pregunta 1");
  await e.locator("button:has-text('Beto')").first().click(); await e.locator("button:has-text('Siguiente')").click(); await e.waitForSelector("text=Pregunta 2");
  let t = (await e.innerText("body")).replace(/\s+/g, " ");
  check(await e.locator("textarea").count() === 1 && !t.includes("Beto Díaz") && !t.includes("Carla Ruiz") && !t.includes("Selecciona hasta"), "pregunta abierta: solo hay un cuadro de texto; no aparece la lista de compañeros ni «Selecciona hasta»");
  check(t.includes("no tienes que elegir a nadie"), "…y explica que no hay que elegir a nadie");
  check(!(await e.locator("button:has-text('Siguiente')").isDisabled()), "…y se puede seguir sin escribir (es opcional)");
  await e.locator("textarea").fill("Pondría <b>más luz</b> & un buzón de sugerencias 🙂");
  check((await e.innerText("body")).includes("/500"), "…con contador de caracteres (máximo 500)");
  await e.locator("button:has-text('Siguiente')").click(); await e.waitForSelector("text=Pregunta 3");
  await e.locator("button:has-text('Enviar')").click(); await e.waitForSelector("text=Gracias", { timeout: 10000 });
  const r1 = (await leer(P + "/responses")).find((r) => r.respondentId === "1");
  check(JSON.stringify(r1.answers) === JSON.stringify({ q1: ["2"] }) && JSON.stringify(Object.keys(r1.abiertas)) === JSON.stringify(["q2"]) && r1.abiertas.q2.includes("<b>más luz</b>"), "se guarda la elección de la pregunta 1 y solo el texto escrito de la 2 (la 3, vacía, no se guarda); el HTML queda como texto");
  // ── Estudiante 2: solo abiertas en blanco ──
  const e2 = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await e2.goto(`http://localhost:5176/?c=${CID}&survey=sv1`); await e2.waitForSelector("text=¿Quién eres tú?"); await e2.locator("button:has-text('Beto')").click(); await e2.waitForSelector("text=Pregunta 1");
  await e2.locator("button:has-text('Carla')").first().click(); await e2.locator("button:has-text('Siguiente')").click(); await e2.waitForSelector("text=Pregunta 2");
  await e2.locator("textarea").fill("Menos ruido en los pasillos"); await e2.locator("button:has-text('Siguiente')").click(); await e2.waitForSelector("text=Pregunta 3");
  await e2.locator("textarea").fill("Un buzón en la entrada"); await e2.locator("button:has-text('Enviar')").click(); await e2.waitForSelector("text=Gracias", { timeout: 10000 });
  check(Object.keys((await leer(P + "/responses")).find((r) => r.respondentId === "2").abiertas).sort().join() === "q2,q3", "otra persona: se guardan sus dos respuestas abiertas");

  // ── El equipo lo ve ──
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage(); p.on("pageerror", (x) => errs.push(x.message)); p.on("dialog", (d) => d.accept());
  await p.goto("http://localhost:5176/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((x) => window.__rnSignIn(x), "psi@ab.co");
  await p.waitForSelector("text=PARTICIPANTES", { timeout: 20000 }); await p.waitForTimeout(2000);
  check(/2\s*CONEXIONES/i.test((await p.innerText("body")).replace(/\s+/g, " ")), "Dashboard: las respuestas abiertas no crean conexiones (solo las 2 elecciones reales)");
  await p.click("header button:has-text('Reportes')"); await p.waitForTimeout(600);
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }).catch(() => null), p.locator("text=Descargar HTML").click()]);
  const h = dl ? readFileSync(await dl.path(), "utf8") : "";
  check(h.includes("Respuestas abiertas") && h.includes("¿Qué mejorarías del salón?") && h.includes("Menos ruido en los pasillos") && h.includes("Un buzón en la entrada"), "Informe individual: sección «Respuestas abiertas» agrupada por pregunta");
  check(/<td>Ana Pérez<\/td><td>5A<\/td><td><i>«Pondría &lt;b&gt;más luz&lt;\/b&gt;/.test(h), "…con quién escribió cada una, y el HTML escapado");
  await p.locator("button:has-text('Grupal')").click(); await p.waitForTimeout(300);
  const [dg] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }).catch(() => null), p.locator("text=Descargar HTML").click()]);
  const hg = dg ? readFileSync(await dg.path(), "utf8") : "x";
  check(!hg.includes("Menos ruido") && !hg.includes("Respuestas abiertas"), "Informe grupal (sin nombres): no incluye las respuestas abiertas");
  const [dx] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }).catch(() => null), p.locator("text=Excel (.xlsx)").click()]);
  let wb = "", hojas = ""; if (dx) { const f = await dx.path(); try { wb = execFileSync("sh", ["-c", `unzip -p "${f}" xl/workbook.xml`], { encoding: "utf8" }); hojas = execFileSync("sh", ["-c", `unzip -p "${f}" 'xl/worksheets/*.xml'`], { encoding: "utf8", maxBuffer: 50e6 }); } catch (x) {} }
  check(wb.includes('name="Abiertas"') && hojas.includes("Menos ruido en los pasillos") && hojas.includes("&lt;b&gt;más luz"), "Excel: hoja «Abiertas» con las respuestas");

  // ── Crear una pregunta abierta desde la pantalla ──
  await p.click("header button:has-text('Encuestas')"); await p.waitForTimeout(600);
  await p.locator("button:has-text('+ Nueva Encuesta')").first().click(); await p.waitForSelector("text=Crear Nueva Encuesta");
  await p.fill("input[placeholder='Ej: Sociograma Q2']", "Nueva con abierta");
  await p.fill("input[placeholder='Escribe la pregunta...']", "¿Qué te gustaría cambiar?");
  const fila = p.locator("xpath=//input[@placeholder='Escribe la pregunta...']/ancestor::div[2]");
  check(await fila.locator("select").count() === 2, "Crear: con «Selección múltiple» hay dos selectores (carácter y tipo)");
  await fila.locator("select").nth(1).selectOption("abierta");
  check(await fila.locator("select").count() === 1, "…al elegir «Pregunta abierta» desaparece el carácter (+ / − / ○), que no aplica");
  await p.click("button:has-text('+ Agregar')");
  check((await p.innerText("body")).includes("abierta"), "…y la pregunta se marca como «abierta»");
  await p.click("button:has-text('Guardar')");
  const nueva = await until(async () => (await leer(P + "/surveys")).find((s) => s.title === "Nueva con abierta"));
  check(nueva?.questions[0].kind === "abierta" && nueva.questions[0].tp === "neu", "…y se guarda como pregunta abierta");
  const tarjeta = p.locator(`xpath=//span[normalize-space()="Nueva con abierta"]/ancestor::div[.//button[contains(.,'Editar')]][1]`);
  check((await tarjeta.innerText()).includes("1 abiertas"), "la tarjeta de la encuesta cuenta las preguntas abiertas");
  await tarjeta.locator("button:has-text('Editar')").click(); await p.waitForTimeout(500);
  const filaQ = p.locator("xpath=//input[@value='¿Qué te gustaría cambiar?']/ancestor::div[1]");
  check(await filaQ.locator("select").count() === 1, "Editar: una pregunta abierta solo muestra el selector de tipo");
  await filaQ.locator("select").selectOption("seleccion");
  await until(async () => { const s = (await leer(P + "/surveys")).find((x) => x.title === "Nueva con abierta"); return s && !("kind" in s.questions[0]); });
  check(await filaQ.locator("select").count() === 2, "…y al volver a «Selección múltiple» reaparece el carácter");
  check(errs.length === 0, "sin errores de JavaScript" + (errs.length ? ": " + errs[0] : ""));
} catch (x) { console.log("FALLÓ excepción:", x.message.split("\n").slice(0, 3).join(" | ")); failed++; }
await b.close(); vite.kill(); await env.cleanup(); console.log(failed ? `\n${failed} fallo(s)` : "\nAbiertas OK"); process.exit(failed ? 1 : 0);
