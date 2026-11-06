// Genera las capturas de pantalla de los manuales con un colegio de EJEMPLO (datos ficticios) y los emuladores de Firebase.
// Uso: npm run manuales:capturas  (levanta los emuladores y toma las capturas; luego npm run manuales arma los PDF)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync, mkdirSync } from "node:fs";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";

const OUT = new URL("../docs/manuales/img/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const CID = "san-marcos";
const logo = "data:image/svg+xml;base64," + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d4ed8"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><path d="M50 4 90 18v30c0 24-16 40-40 48C26 88 10 72 10 48V18z" fill="url(#g)"/><text x="50" y="62" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="34" fill="#fff">SM</text></svg>`).toString("base64");

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

const vite = spawn("npx", ["vite", "--port", "5180", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
const b = await chromium.launch();
const ctx = async (w = 1280, h = 860, extra = {}) => { const c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1.5, ...extra }); await c.addInitScript(() => { try { localStorage.setItem("rednexo-theme", "light"); } catch (e) {} }); return c; };
const shot = async (p, name, opts = {}) => { await p.waitForTimeout(opts.espera ?? 700); await p.screenshot({ path: `${OUT}${name}.jpg`, type: "jpeg", quality: 84, ...opts.shot }); console.log("captura", name); };
/** Números rojos sobre la captura, para que el manual pueda decir «mira el 1, el 2…». */
const marcar = async (p, lista) => {
  await p.evaluate(() => document.querySelectorAll(".mk").forEach((e) => e.remove()));
  const items = [];
  for (const [sel, n, dx = 0, dy = 0] of lista) { const bb = await p.locator(sel).first().boundingBox().catch(() => null); if (bb) items.push([bb.x + dx, bb.y + dy, n]); }
  await p.evaluate((items) => items.forEach(([x, y, n]) => { const d = document.createElement("div"); d.className = "mk"; d.textContent = n; d.style.cssText = `position:fixed;z-index:99999;left:${x}px;top:${y}px;width:26px;height:26px;border-radius:50%;background:#e11d48;color:#fff;font:700 14px Inter,Arial;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid #fff`; document.body.appendChild(d); }), items);
};
const ir = async (p, t) => { await p.click(`button:has-text('${t}')`); await p.waitForTimeout(600); };
const intenta = async (nombre, fn) => { try { await fn(); } catch (e) { console.log("FALLÓ captura", nombre, e.message.split("\n")[0]); } };
try {
  // Pantalla de ingreso (sin sesión)
  await intenta("01-ingreso", async () => { const c = await ctx(1280, 780); const p = await c.newPage(); await p.goto("http://localhost:5180/"); await p.waitForSelector("text=Google"); await shot(p, "01-ingreso", { espera: 1200 }); await c.close(); });

  const c = await ctx(); const p = await c.newPage();
  await p.goto("http://localhost:5180/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate(() => window.__rnSignIn("coordinacion@sanmarcos.edu.co"));
  await p.waitForSelector("text=Dashboard", { timeout: 20000 }); await p.waitForTimeout(2500);
  await intenta("02-dashboard", async () => { await marcar(p, [["button:has-text('Dashboard')", 1, 4, -6], ["#rn-fuente", 2, -30, 0], ["canvas", 3, 12, 12]]); await shot(p, "02-dashboard", { espera: 1500 }); await marcar(p, []); });
  await intenta("03-nodo", async () => { await p.locator("input[placeholder='Nombre del estudiante...']").fill("Tomás"); await p.waitForTimeout(1200); await shot(p, "03-nodo", { espera: 1200 }); await p.locator("input[placeholder='Nombre del estudiante...']").fill(""); });
  await intenta("04-grupos", async () => { await ir(p, "Grupos"); await p.waitForSelector("text=Gestión de Grupos"); await shot(p, "04-grupos"); });
  await intenta("05-lista", async () => { await p.locator("xpath=//span[normalize-space()='5° B']/../..//button[contains(.,'Agregar')]").first().click(); await p.waitForTimeout(400); const modo = p.locator("button:has-text('Lista (copiar/pegar)')").first(); await modo.click(); await p.locator("textarea").first().fill("Mariana Londoño\nSebastián Ochoa\nValeria Pineda\nJuan Esteban Cardona"); await shot(p, "05-lista"); await p.reload(); await p.waitForSelector("text=Dashboard"); await ir(p, "Grupos"); });
  await intenta("06-encuestas", async () => { await ir(p, "Encuestas"); await p.waitForSelector("text=Avance:"); await marcar(p, [["button:has-text('+ Nueva Encuesta')", 1, -8, -8], ["button:has-text('Encuesta de prueba')", 2, -8, -8], ["button:has-text('Importar')", 3, -8, -8], ["button:has-text('Aplicar')", 4, -8, -8]]); await shot(p, "06-encuestas"); await marcar(p, []); });
  await intenta("07-crear", async () => { await p.locator("button:has-text('+ Nueva Encuesta')").first().click(); await p.waitForSelector("text=Crear Nueva Encuesta"); await p.fill("input[placeholder='Ej: Sociograma Q2']", "Sociograma 5° A — Segundo periodo"); const inp = p.locator("input[placeholder*='pregunta']").first(); await inp.fill("¿Con quién te gustaría trabajar en equipo?"); await inp.press("Enter"); await inp.fill("¿Con quién NO te gustaría compartir mesa?"); await p.locator("select").last().selectOption("neg").catch(() => {}); await inp.press("Enter"); await shot(p, "07-crear"); await p.locator("button:has-text('← Volver')").click(); });
  await intenta("08-editar", async () => { await p.waitForSelector("text=Avance:"); await p.locator("xpath=//span[normalize-space()='Sociograma 5° A — Primer periodo']/ancestor::div[.//button[contains(.,'Editar')]][1]//button[contains(.,'Editar')]").first().click(); await p.waitForSelector("text=Grupos de la encuesta"); await p.locator("text=Grupos de la encuesta").first().scrollIntoViewIfNeeded(); await shot(p, "08-editar"); await p.locator("xpath=//span[normalize-space()='Sociograma 5° A — Primer periodo']/ancestor::div[.//button[contains(.,'Cerrar')]][1]//button[contains(.,'Cerrar')]").first().click().catch(() => {}); });
  await intenta("09-matriz", async () => { await ir(p, "Matriz"); await p.waitForSelector("text=Matriz Sociométrica Neural"); await shot(p, "09-matriz", { espera: 1200 }); });
  await intenta("10-reportes", async () => { await ir(p, "Reportes"); await p.waitForSelector("text=Configurar reporte"); await shot(p, "10-reportes"); });
  await intenta("11-reporte-individual", async () => { await p.locator("text=Explora los datos en pantalla").click(); await p.waitForSelector("iframe"); await p.waitForTimeout(1500); await p.locator("iframe").scrollIntoViewIfNeeded(); await shot(p, "11-reporte-individual", { espera: 1000 }); });
  await intenta("12-usuarios", async () => { await ir(p, "Usuarios"); await p.waitForSelector("text=Todos los usuarios registrados"); await shot(p, "12-usuarios"); });
  await intenta("13-actividad", async () => { await ir(p, "Actividad"); await p.waitForSelector("text=Actividad Reciente"); await shot(p, "13-actividad"); });
  await intenta("14-config", async () => { await ir(p, "Config"); await p.waitForSelector("text=Configuración"); await shot(p, "14-config"); });
  await c.close();

  // Lo que ve el estudiante (celular)
  await intenta("15-estudiante", async () => { const m = await ctx(390, 844, { deviceScaleFactor: 2, isMobile: true, hasTouch: true }); const q = await m.newPage(); await q.goto(`http://localhost:5180/?c=${CID}&survey=sv1`); await q.waitForSelector("text=¿Quién eres tú?"); await shot(q, "15-estudiante-nombre", { espera: 1000 });
    await q.locator("button:has-text('Samuel Ortiz')").click(); await q.waitForSelector("text=¿Con quién te gustaría trabajar"); await q.waitForTimeout(500);
    for (const n of ["Tomás Mejía", "Valentina Rojas"]) await q.locator(`button:has-text('${n}')`).first().click().catch(() => {});
    await shot(q, "16-estudiante-pregunta", { espera: 800 }); await m.close(); });
} catch (e) { console.log("ERROR general", e.message); }
await b.close(); vite.kill(); await env.cleanup();
console.log("listo");
process.exit(0);
