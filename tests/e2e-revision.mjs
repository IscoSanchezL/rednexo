// Revisión general: bordes que fallaban (diseño móvil, papelera, solicitud de acceso, solo lectura, ajustes sin efecto).
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync, mkdirSync } from "node:fs";
import { doc, setDoc, getDoc, getDocs, collection, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";
import http from "node:http";
const OUT = "/tmp/";
const CID = "san-marcos";
const logo = "";
// Números "al azar" repetibles, para que las capturas siempre salgan iguales.
let seed = 20261105; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (arr, w, n, excl) => { const pool = arr.filter((x) => x !== excl); const out = []; while (out.length < n && out.length < pool.length) { const tot = pool.filter((x) => !out.includes(x)).reduce((a, x) => a + (w[x] ?? 1), 0); let r = rnd() * tot; for (const x of pool.filter((x) => !out.includes(x))) { r -= w[x] ?? 1; if (r <= 0) { out.push(x); break; } } } return out; };

const A = ["Valentina Rojas", "Santiago Pérez", "Mariana Gómez", "Samuel Ortiz", "Isabella Cano", "Mateo Vargas", "Sofía Herrera", "Emmanuel Díaz", "Daniela Ruiz", "Tomás Mejía", "Luciana Torres", "Andrés Salazar"];
const B = ["Camila Soto", "Juan Pablo León", "Gabriela Ríos", "Nicolás Mora", "Antonella Silva", "Felipe Cruz", "Paula Acosta", "David Núñez"];
const Q = [
  { id: "q1", text: "¿Con quién te gustaría trabajar en un proyecto en equipo?", tp: "pos" },
  { id: "q2", text: "¿A quién invitarías a tu cumpleaños?", tp: "pos" },
  { id: "q3", text: "¿A quién acudes cuando necesitas ayuda con una tarea?", tp: "pos" },
  { id: "q4", text: "¿Quién consideras que es el líder del grupo?", tp: "neu" },
  { id: "q5", text: "¿A quién ves con más frecuencia durante el recreo?", tp: "neu" },
  { id: "q6", text: "¿Con quién NO te gustaría trabajar en equipo?", tp: "neg" },
  { id: "q7", text: "¿Con quién te sientes menos cómodo(a) en el salón?", tp: "neg" },
];

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore(), P = `colegios/${CID}`;
  await setDoc(doc(db, P), { nombre: "Colegio San Marcos (ejemplo)", ciudad: "Medellín" });
  await setDoc(doc(db, `${P}/settings/global`), { colegio: "Colegio San Marcos (ejemplo)", ciudad: "Medellín", periodo: "2026-2", dominio: "all", registro: "no", notifEncuesta: "yes", notifResultados: "psy", logo, idioma: "es" });
  for (const [e, role] of [["coordinacion@sanmarcos.edu.co", "admin"], ["psicologa@sanmarcos.edu.co", "psychologist"], ["consulta@sanmarcos.edu.co", "readonly"]]) await setDoc(doc(db, `${P}/miembros/${e}`), { email: e, role, status: "active", createdAt: Timestamp.fromMillis(Date.now() - 86400000 * 30) });
  await setDoc(doc(db, `${P}/miembros/exdocente@sanmarcos.edu.co`), { email: "exdocente@sanmarcos.edu.co", role: "readonly", status: "revoked", rolAnterior: "psychologist", createdAt: Timestamp.fromMillis(Date.now() - 86400000 * 90) });
  await setDoc(doc(db, `${P}/groups/g1`), { id: "g1", name: "5° A", color: "#ff4d6a" }); await setDoc(doc(db, `${P}/groups/g2`), { id: "g2", name: "5° B", color: "#2dd4bf" });
  const all = [...A.map((n) => [n, "5° A"]), ...B.map((n) => [n, "5° B"])];
  all.forEach(([name, group], i) => setDoc(doc(db, `${P}/students/${i + 1}`), { id: String(i + 1), name, group, av: name.split(" ").map((w) => w[0]).slice(0, 2).join("") }));
  const idsA = A.map((_, i) => String(i + 1)), idsB = B.map((_, i) => String(A.length + i + 1));
  const rosterA = A.map((n, i) => ({ id: String(i + 1), name: n, group: "5° A", av: n.split(" ").map((w) => w[0]).join("") }));
  await setDoc(doc(db, `${P}/surveys/sv1`), { id: "sv1", title: "Sociograma 5° A — Primer periodo", status: "active", group: "5° A", groups: ["5° A"], maxSel: 3, createdAt: Timestamp.fromMillis(Date.now() - 86400000 * 6), questions: Q, rosterIds: idsA, roster: rosterA, colegioNombre: "Colegio San Marcos (ejemplo)", logo });
  await setDoc(doc(db, `${P}/surveys/sv2`), { id: "sv2", title: "Sociograma 5° B — Borrador", status: "draft", group: "5° B", groups: ["5° B"], maxSel: 3, createdAt: Timestamp.fromMillis(Date.now() - 86400000 * 2), questions: Q });
  // 11 de los 12 estudiantes de 5° A ya respondieron (Samuel falta); Tomás es muy elegido, Andrés casi nadie lo elige, Emmanuel recibe rechazos.
  const peso = { [String(10)]: 6, [String(12)]: 0.15, [String(8)]: 1, [String(1)]: 3, [String(3)]: 2.5 };
  const negPeso = { [String(8)]: 6, [String(12)]: 2 };
  for (const [i, nombre] of A.entries()) {
    const id = String(i + 1); if (id === "4") continue;
    const answers = { q1: pick(idsA, peso, 2, id), q2: pick(idsA, peso, 2, id), q3: pick(idsA, peso, 1, id), q4: pick(idsA, { 10: 8, 1: 2 }, 1, id), q5: pick(idsA, peso, 2, id), q6: pick(idsA, negPeso, 1, id), q7: pick(idsA, negPeso, 1, id) };
    await setDoc(doc(db, `${P}/responses/sv1_${id}`), { surveyId: "sv1", respondentId: id, respondentName: nombre, answers, submittedAt: Timestamp.fromMillis(Date.now() - 86400000 * 3 + i * 600000) });
    await setDoc(doc(db, `${P}/responseMarks/sv1_${id}`), { surveyId: "sv1", respondentId: id });
  }
  const acts = [["user", "ingresó a RedNexo", ""], ["group", "creó el grupo", "5° A"], ["group", "agregó 12 estudiante(s) al grupo", "5° A"], ["create", "creó la encuesta de prueba", "Sociograma 5° A — Primer periodo · 7 preguntas"], ["survey", "activó la encuesta", "Sociograma 5° A — Primer periodo"], ["report", "descargó el reporte Completo (HTML)", "5° A"], ["export", "exportó los resultados de la encuesta (Excel)", "Sociograma 5° A — Primer periodo"], ["user", "autorizó el acceso (Psicólogo Escolar)", "psicologa@sanmarcos.edu.co"]];
  for (const [k, [type, action, detail]] of acts.entries()) await setDoc(doc(db, `${P}/activity/a${k}`), { type, action, detail, user: k % 2 ? "psicologa@sanmarcos.edu.co" : "coordinacion@sanmarcos.edu.co", email: k % 2 ? "psicologa@sanmarcos.edu.co" : "coordinacion@sanmarcos.edu.co", createdAt: Timestamp.fromMillis(Date.now() - (acts.length - k) * 1500000) });
});

const leer = async (path) => { let o = []; await env.withSecurityRulesDisabled(async (x) => { o = (await getDocs(collection(x.firestore(), path))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return o; };
const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 250)); } };
const fake = http.createServer((req, res) => { res.setHeader("Content-Type", "application/javascript"); res.end("window.__soporte = { abiertos: [] }; window.IskonexSoporte = { configure() {}, open(p) { window.__soporte.abiertos.push(p || null); } };"); }).listen(5171);
const vite = spawn("npx", ["vite", "--port", "5162", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true", VITE_SOPORTE_URL: "http://localhost:5171" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
const b = await chromium.launch();
let fallos = 0; const check = (ok, m) => { console.log((ok ? "ok     " : "FALLÓ  ") + m); if (!ok) fallos++; };
const nuevo = async (w, h, dark = false) => { const c = await b.newContext({ viewport: { width: w, height: h } }); await c.addInitScript((d) => { try { localStorage.setItem("rednexo-theme", d ? "dark" : "light"); } catch (e) {} }, dark); const p = await c.newPage(); p.on("dialog", (d) => d.accept()); return p; };
const entrar = async (p, email) => { await p.goto("http://localhost:5162/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), email); await p.waitForSelector("button:has-text('Dashboard')", { timeout: 20000 }); await p.waitForTimeout(1500); };
const TABS = ["Dashboard", "Encuestas", "Matriz", "Grupos", "Reportes", "Usuarios", "Actividad", "Config"];
try {
  // 1) Móvil: ninguna pestaña se sale de la pantalla
  const m = await nuevo(390, 844, true); await entrar(m, "coordinacion@sanmarcos.edu.co");
  const malas = [];
  for (const t of TABS) { await m.click(`header button:has-text('${t}')`); await m.waitForTimeout(700); const o = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 2) malas.push(`${t} (+${o}px)`); }
  check(malas.length === 0, "móvil (390px): ninguna pestaña desborda la pantalla" + (malas.length ? " — " + malas.join(", ") : ""));
  // 2) Escritorio: las 8 pestañas se ven completas
  const d = await nuevo(1280, 860); await entrar(d, "coordinacion@sanmarcos.edu.co");
  const cajas = await d.evaluate((tabs) => tabs.map((t) => { const b = [...document.querySelectorAll("header button")].find((x) => x.innerText.includes(t)); const r = b?.getBoundingClientRect(); return b ? [t, r.left >= 0 && r.right <= innerWidth] : [t, false]; }), TABS);
  check(cajas.every(([, ok]) => ok), "escritorio (1280px): las 8 pestañas caben completas en la cabecera" + (cajas.some(([, ok]) => !ok) ? " — fuera: " + cajas.filter(([, ok]) => !ok).map(([t]) => t).join(", ") : ""));
  // 3) Config: ajustes sin efecto desactivados y rotulados
  await d.click("header button:has-text('Config')"); await d.waitForTimeout(600);
  const dis = await d.locator("select:disabled").count(); const tx = (await d.innerText("body")).replace(/\s+/g, " ");
  check(dis === 5 && /aún sin efecto/.test(tx) && tx.includes("(próximamente)"), "Config: los 5 ajustes que aún no hacen nada están desactivados y dicen «próximamente»");
  // 4) Solo lectura no ve Aplicar / Link
  const r = await nuevo(1280, 860); await entrar(r, "consulta@sanmarcos.edu.co"); await r.click("header button:has-text('Encuestas')"); await r.waitForTimeout(800);
  const rt = await r.innerText("body");
  check(!rt.includes("Aplicar") && !rt.includes("Link") && !rt.includes("Duplicar") && !rt.includes("+ Nueva"), "solo lectura: no ve Aplicar, Link, Duplicar ni crear encuestas");
  // 5) Papelera: lo que está en la papelera no cuenta; eliminar para siempre borra las respuestas
  const card = (titulo) => d.locator(`xpath=//span[normalize-space()="${titulo}"]/ancestor::div[.//button[contains(.,'Editar')]][1]`);
  await d.click("header button:has-text('Encuestas')"); await d.waitForTimeout(700);
  await card("Sociograma 5° A — Primer periodo").locator("button:has-text('🗑')").click(); await d.waitForTimeout(1000);
  await d.click("header button:has-text('Dashboard')"); await d.waitForTimeout(900);
  check(/0\s*CONEXIONES/i.test(await d.innerText("body")), "papelera: las respuestas de una encuesta en la papelera no cuentan en el mapa");
  await d.click("header button:has-text('Encuestas')"); await d.click("button:has-text('Papelera')"); await d.waitForTimeout(500);
  await d.locator("button:has-text('✕ Eliminar')").first().click();
  await until(async () => (await leer("colegios/san-marcos/responses")).length === 0);
  check((await leer("colegios/san-marcos/responses")).length === 0 && (await leer("colegios/san-marcos/responseMarks")).length === 0 && !(await leer("colegios/san-marcos/surveys")).some((s) => s.id === "sv1"), "eliminar para siempre: se borran la encuesta, sus respuestas y sus marcas");
  // 6) Solicitud de acceso: ya no dice «enviada» sin enviar; abre el formulario de soporte con los datos
  const l = await nuevo(1280, 860); await l.goto("http://localhost:5162/"); await l.waitForSelector("text=Solicitar acceso");
  await l.click("text=+ Solicitar acceso");
  await l.fill("input[placeholder='Tu nombre']", "Ana Prueba"); await l.fill("input[placeholder='tu@institucion.edu']", "ana@colegio.edu.co");
  await l.click("button:has-text('Continuar con la solicitud')"); await l.waitForTimeout(1500);
  const ab = await l.evaluate(() => window.__soporte?.abiertos || []);
  const lt = (await l.innerText("body")).replace(/\s+/g, " ");
  check(ab.length === 1 && ab[0].type === "acceso" && /Ana Prueba/.test(ab[0].subject) && /ana@colegio\.edu\.co/.test(ab[0].description) && ab[0].email === "ana@colegio.edu.co", "solicitud de acceso: abre el soporte con tipo «acceso», nombre y correo");
  check(lt.includes("Solicitud preparada") && !lt.includes("Solicitud enviada") && !/Super Admin aprobará/.test(lt), "solicitud de acceso: el mensaje ya no promete un envío que no ocurría");
} catch (e) { console.log("FALLÓ excepción:", e.message.split("\n").slice(0, 3).join(" | ")); fallos++; }
await b.close(); vite.kill(); fake.close(); await env.cleanup(); console.log(fallos ? `\n${fallos} fallo(s)` : "\nRevisión OK"); process.exit(fallos ? 1 : 0);
