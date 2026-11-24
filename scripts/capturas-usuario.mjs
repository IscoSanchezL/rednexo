// Capturas de pantalla del manual de usuario, con datos ficticios en el emulador.
// Uso: npx firebase emulators:exec --only auth,firestore --project rednexo-fd35c "node scripts/capturas-usuario.mjs"
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync, mkdirSync } from "node:fs";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";

const OUT = "docs/manuales/img-usuario"; mkdirSync(OUT, { recursive: true });
const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const CID = "col-demo", P = `colegios/${CID}`;
const NOM = {
  "6A": ["Valentina Ortiz", "Samuel Cárdenas", "Mariana Beltrán", "Tomás Quintero", "Isabela Mejía", "Emilio Roldán", "Luciana Parra", "Mateo Salazar", "Renata Vélez", "Andrés Montoya", "Sofía Naranjo", "Julián Herrera"],
  "6B": ["Camila Restrepo", "Daniel Aguirre", "Antonia Giraldo", "Sebastián Lozano", "Paula Cano", "Nicolás Duque", "Gabriela Ríos", "Martín Escobar", "Juliana Pineda", "Felipe Arango", "Laura Zapata", "Simón Correa"],
};
const ST = []; let k = 1; for (const [g, ns] of Object.entries(NOM)) for (const name of ns) { ST.push({ id: String(k++), name, group: g, av: name.split(" ").map((w) => w[0]).join("") }); }
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const peso = (s) => ({ 0: 5, 1: 3, 2: 0.4, 3: 1, 4: 2, 5: 1, 6: 0.3, 7: 2, 8: 1, 9: 4, 10: 1, 11: 2 })[(Number(s.id) - 1) % 12];
function elegir(yo, n, neg) { const pool = ST.filter((x) => x.group === yo.group && x.id !== yo.id); const out = []; while (out.length < n && out.length < pool.length) { const w = pool.map((x) => (neg ? (x.id % 5 === 0 ? 4 : 0.6) : peso(x)) * (out.includes(x.id) ? 0 : 1)); const tot = w.reduce((a, b) => a + b, 0); let r = rnd() * tot, i = 0; while (r > w[i] && i < w.length - 1) { r -= w[i]; i++; } if (!out.includes(pool[i].id)) out.push(pool[i].id); } return out; }
const MOT = ["Es muy buen compañero y siempre ayuda", "Trabaja con responsabilidad", "Nos entendemos bien y nos reímos mucho", "Explica bien cuando no entiendo", "Es mi amiga desde primaria"];
const ABI = ["Más tiempo de descanso y mejores canchas", "Que haya menos ruido en clase", "Un espacio para hablar de lo que sentimos", "Más trabajos en equipo"];
const Q = [{ id: "q1", text: "¿Con quién te gustaría trabajar en un proyecto en equipo?", tp: "pos", kind: "justificable", obligatoria: true }, { id: "q2", text: "¿A quién invitarías a tu cumpleaños?", tp: "pos" }, { id: "q3", text: "¿Con quién preferirías no trabajar?", tp: "neg" }, { id: "q4", text: "¿Qué cambiarías para estar mejor en tu salón?", tp: "neu", kind: "abierta" }];
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, P), { nombre: "Colegio Los Almendros" }); await setDoc(doc(db, P + "/settings/global"), { colegio: "Colegio Los Almendros" });
  await setDoc(doc(db, P + "/miembros/orientacion@losalmendros.edu.co"), { email: "orientacion@losalmendros.edu.co", name: "Marcela Ospina", role: "admin", status: "active" });
  await setDoc(doc(db, P + "/miembros/psicologa@losalmendros.edu.co"), { email: "psicologa@losalmendros.edu.co", name: "Lucía Cano", role: "psychologist", status: "active" });
  await setDoc(doc(db, P + "/miembros/coordinacion@losalmendros.edu.co"), { email: "coordinacion@losalmendros.edu.co", name: "Rodrigo Pérez", role: "readonly", status: "active" });
  await setDoc(doc(db, P + "/groups/g1"), { id: "g1", name: "6A", color: "#3b82f6" }); await setDoc(doc(db, P + "/groups/g2"), { id: "g2", name: "6B", color: "#f59e0b" });
  for (const s of ST) await setDoc(doc(db, `${P}/students/${s.id}`), s);
  const base = { status: "active", group: "6A", groups: ["6A", "6B"], maxSel: 3, rosterIds: ST.map((s) => s.id), roster: ST, colegioNombre: "Colegio Los Almendros" };
  await setDoc(doc(db, P + "/surveys/sv1"), { id: "sv1", title: "Convivencia 6° · inicio de año", createdAt: Timestamp.fromMillis(Date.now() - 86400000 * 60), questions: Q, ...base });
  await setDoc(doc(db, P + "/surveys/sv2"), { id: "sv2", title: "Convivencia 6° · cierre de año", createdAt: Timestamp.fromMillis(Date.now() - 86400000 * 5), questions: Q.slice(0, 3), ...base });
  for (const s of ST) {
    if (Number(s.id) % 8 === 0) continue;                    // algunos no responden
    const q1 = elegir(s, 3, false), q2 = elegir(s, 2, false), q3 = rnd() < 0.5 ? elegir(s, 1, true) : [];
    const just = Object.fromEntries(q1.map((t, i) => [`q1|${t}`, MOT[(Number(s.id) + i) % MOT.length]]));
    await setDoc(doc(db, `${P}/responses/sv1_${s.id}`), { surveyId: "sv1", respondentId: s.id, respondentName: s.name, submittedAt: Timestamp.fromMillis(Date.now() - 86400000 * 50), answers: { q1, q2, ...(q3.length ? { q3 } : {}) }, justificaciones: just, abiertas: { q4: ABI[Number(s.id) % ABI.length] } });
    if (Number(s.id) % 3 !== 0) { const a1 = elegir(s, 3, false), a3 = rnd() < 0.4 ? elegir(s, 1, true) : []; await setDoc(doc(db, `${P}/responses/sv2_${s.id}`), { surveyId: "sv2", respondentId: s.id, respondentName: s.name, submittedAt: Timestamp.fromMillis(Date.now() - 86400000 * 3), answers: { q1: a1, q2: elegir(s, 2, false), ...(a3.length ? { q3: a3 } : {}) }, justificaciones: Object.fromEntries(a1.map((t, i) => [`q1|${t}`, MOT[(Number(s.id) + i + 1) % MOT.length]])) }); }
  }
});
const vite = spawn("npx", ["vite", "--port", "5210", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem("rednexo-theme", "light"); } catch {} });
const p = await ctx.newPage(); p.on("pageerror", (e) => console.log("pageerror", e.message));
const pausa = (ms = 500) => p.waitForTimeout(ms);
const foto = async (nombre, opciones = {}) => { const { desde = 0, alto = 0 } = opciones; const h = alto || 900 - desde; await p.screenshot({ path: `${OUT}/${nombre}.png`, clip: { x: 0, y: desde, width: 1360, height: h } }); console.log("ok", nombre); };
const menu = (t) => p.click(`header button:has-text('${t}')`);
try {
  await p.goto("http://localhost:5210/"); await pausa(1500); await foto("01-ingreso", { desde: 0, alto: 900 });
  await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((x) => window.__rnSignIn(x), "orientacion@losalmendros.edu.co");
  await p.waitForSelector("text=PARTICIPANTES", { timeout: 25000 }); await pausa(2500);
  await foto("02-dashboard", { desde: 0, alto: 900 });
  await p.mouse.click(700, 520); await pausa(600);
  await menu("Encuestas"); await pausa(900); await foto("04-encuestas", { desde: 135, alto: 700 });
  await p.click("button:has-text('Nueva Encuesta')"); await pausa(800); await foto("05-crear-encuesta", { desde: 135, alto: 750 });
  await p.click("button:has-text('Cancelar')"); await pausa(400);
  await menu("Matriz"); await pausa(1200); await foto("06-matriz", { desde: 135, alto: 750 });
  await menu("Grupos"); await pausa(900); await foto("07-grupos", { desde: 135, alto: 750 });
  await menu("Reportes"); await pausa(900); await foto("08-reportes", { desde: 135, alto: 750 });
  await p.click("button:has-text('Un estudiante')"); await pausa(400); await p.selectOption("#rn-est", "1"); await pausa(400); await foto("09-informe-estudiante", { desde: 135, alto: 750 });
  await menu("Gráficos"); await pausa(900); await foto("10-graficos-panorama", { desde: 135, alto: 900 });
  await p.click("[data-graficos] button:has-text('Estudiantes')"); await pausa(900); await p.locator("[data-punto]").nth(2).click({ force: true }); await pausa(500); await p.screenshot({ path: `${OUT}/11-graficos-estudiantes.png`, fullPage: true, clip: { x: 0, y: 150, width: 1360, height: 1050 } });
  await p.click("[data-graficos] button:has-text('Individual')"); await pausa(500); await p.selectOption("select[aria-label=Estudiante]", "3"); await pausa(600); await p.screenshot({ path: `${OUT}/12-graficos-individual.png`, fullPage: true, clip: { x: 0, y: 150, width: 1360, height: 1300 } });
  await p.click("[data-graficos] button:has-text('Comparar aplicaciones')"); await pausa(400); await p.selectOption("select[aria-label=Antes]", "sv1"); await p.selectOption("select[aria-label=Después]", "sv2"); await pausa(600); await p.screenshot({ path: `${OUT}/13-graficos-comparar.png`, fullPage: true, clip: { x: 0, y: 150, width: 1360, height: 850 } });
  await menu("Usuarios"); await pausa(900); await foto("14-usuarios", { desde: 135, alto: 750 });
  await menu("Actividad"); await pausa(900); await foto("15-actividad", { desde: 135, alto: 750 });
  await menu("Config"); await pausa(900); await foto("16-config", { desde: 135, alto: 850 });
  // Estudiante (celular)
  const m = await (await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 })).newPage();
  await m.addInitScript(() => { try { localStorage.setItem("rednexo-theme", "light"); } catch {} });
  await m.goto(`http://localhost:5210/?c=${CID}&survey=sv2`); await m.waitForSelector("text=¿Quién eres tú?", { timeout: 20000 }); await m.waitForTimeout(600);
  await m.screenshot({ path: `${OUT}/17-estudiante-nombre.png` });
  await m.locator("button:has-text('Valentina')").click(); await m.waitForSelector("text=Pregunta 1"); await m.waitForTimeout(400);
  await m.locator("button:has-text('Mariana')").first().click(); await m.waitForTimeout(300);
  await m.screenshot({ path: `${OUT}/18-estudiante-pregunta.png` });
} catch (e) { console.log("FALLÓ", e.message.split("\n").slice(0, 3).join(" | ")); }
await b.close(); vite.kill(); await env.cleanup();
