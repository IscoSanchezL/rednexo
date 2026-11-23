// Informe de UN estudiante: versión para el equipo (con nombres y explicaciones) y para familias (sin nombres de otros niños).
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDocs, collection, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const CID = "col-ie", P = `colegios/${CID}`;
const NOMBRES = ["Vanegas Agredo Benjamín", "Garzón Medina Samuel", "Granados Estupiñán Jerónimo", "Ramírez Díaz Ignacio", "Montoya Quintero Eva", "Amaya Trujillo Antonia"];
const ST = NOMBRES.map((name, i) => ({ id: String(i + 1), name, group: i < 5 ? "3°A" : "3°B", av: name.split(" ").map((w) => w[0]).slice(0, 2).join("") }));
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, P), { nombre: "Colegio IE" }); await setDoc(doc(db, P + "/settings/global"), { colegio: "Colegio IE" });
  await setDoc(doc(db, P + "/miembros/psi@ie.co"), { email: "psi@ie.co", role: "psychologist", status: "active" });
  await setDoc(doc(db, P + "/groups/g1"), { id: "g1", name: "3°A", color: "#fbbf24" }); await setDoc(doc(db, P + "/groups/g2"), { id: "g2", name: "3°B", color: "#a78bfa" });
  for (const s of ST) await setDoc(doc(db, `${P}/students/${s.id}`), s);
  const Q = [{ id: "q1", text: "¿Con quién trabajarías?", tp: "pos", kind: "justificable" }, { id: "q2", text: "¿Con quién NO trabajarías?", tp: "neg", kind: "justificable" }, { id: "q3", text: "¿Cómo podemos mejorar el grupo?", tp: "neu", kind: "abierta" }];
  await setDoc(doc(db, P + "/surveys/sv1"), { id: "sv1", title: "Convivencia 3°", status: "active", group: "3°A", groups: ["3°A", "3°B"], maxSel: 3, createdAt: Timestamp.fromMillis(Date.now()), questions: Q, rosterIds: ST.map((s) => s.id), roster: ST, colegioNombre: "Colegio IE" });
  const R = {
    // Vanegas (1): no respondió. Lo rechazan Garzón (2), Granados (3) y Ramírez (4) con explicación; Eva (5) lo elige.
    2: { answers: { q2: ["1"], q1: ["5"] }, justificaciones: { "q2|1": "Siempre me está molestando", "q1|5": "Es mi amiga" }, abiertas: { q3: "Más respeto en clase" } },
    3: { answers: { q2: ["1"] }, justificaciones: { "q2|1": "Me dice que soy malo" } },
    4: { answers: { q2: ["1"], q1: ["2"] }, justificaciones: { "q2|1": "Me irrespeta", "q1|2": "Juega bien" } },
    5: { answers: { q1: ["1"] }, justificaciones: { "q1|1": "Me ayuda con las tareas" }, abiertas: { q3: "Un buzón de sugerencias" } },
  };
  for (const [id, r] of Object.entries(R)) await setDoc(doc(db, `${P}/responses/sv1_${id}`), { surveyId: "sv1", respondentId: id, respondentName: ST[id - 1].name, submittedAt: Timestamp.fromMillis(Date.now()), ...r });
});
const leer = async (path) => { let o = []; await env.withSecurityRulesDisabled(async (x) => { o = (await getDocs(collection(x.firestore(), path))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return o; };
const vite = spawn("npx", ["vite", "--port", "5180", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0; const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
try {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const avisos = []; p.on("dialog", (d) => { avisos.push(d.message()); d.accept(); });
  await p.goto("http://localhost:5180/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), "psi@ie.co");
  await p.waitForSelector("text=PARTICIPANTES", { timeout: 20000 }); await p.click("header button:has-text('Reportes')"); await p.waitForTimeout(600);
  await p.click("button:has-text('Un estudiante')"); await p.waitForTimeout(300);
  check(await p.locator("#rn-est").count() === 1 && (await p.innerText("body")).includes("Para familias"), "aparece el tipo «Un estudiante» con selector de estudiante y de versión");
  // Sin elegir a nadie
  await p.locator("text=Descargar HTML").click(); await p.waitForTimeout(300);
  check(avisos.some((a) => /Elige primero un estudiante/.test(a)), "sin elegir estudiante avisa en vez de generar un informe vacío");
  const opciones = await p.locator("#rn-est option").allInnerTexts();
  check(opciones.includes("Vanegas Agredo Benjamín") && opciones.includes("Amaya Trujillo Antonia"), "el selector lista a los estudiantes de todos los grupos");
  await p.selectOption("#rn-est", "1");
  // ── Versión equipo ──
  const [d1] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }), p.locator("text=Descargar HTML").click()]);
  const eq = readFileSync(await d1.path(), "utf8");
  check(/informe_equipo_Vanegas_Agredo_Benjam/.test(d1.suggestedFilename()), "el archivo se llama informe_equipo_<nombre>.html: " + d1.suggestedFilename());
  check(eq.includes("Documento confidencial para el equipo") && eq.includes("no lo entregue ni lo muestre a familias") || eq.includes("No lo entregue ni lo muestre a familias"), "la versión del equipo advierte que no se entrega a familias");
  check(eq.includes("no respondió") && /Recibió 3 marcas negativas; el promedio del grupo es/.test(eq), "dice que no respondió y destaca que recibió más marcas negativas que el promedio del grupo");
  check(["Garzón Medina Samuel", "Granados Estupiñán Jerónimo", "Ramírez Díaz Ignacio", "Montoya Quintero Eva"].every((n) => eq.includes(n)), "nombra a quienes lo marcaron");
  check(["Siempre me está molestando", "Me dice que soy malo", "Me irrespeta", "Me ayuda con las tareas"].every((t) => eq.includes(t)), "incluye las explicaciones que escribieron sobre él, junto a cada compañero y su pregunta");
  check(/¿Con quién NO trabajarías\?/.test(eq) && /Lo eligieron o marcaron \(3\)/.test(eq), "organizado por pregunta (3 lo rechazaron en la pregunta negativa)");
  check(!eq.includes("Más respeto en clase") && !eq.includes("Un buzón de sugerencias"), "las respuestas abiertas de otros no se mezclan con las de él");
  check(eq.includes("Observaciones y acuerdos") && eq.includes("no es un diagnóstico"), "trae espacio para observaciones y la aclaración de cómo leerlo");
  // ── Estudiante con respuestas y abiertas propias (Garzón) ──
  await p.selectOption("#rn-est", "2");
  const [d2] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }), p.locator("text=Descargar HTML").click()]);
  const g = readFileSync(await d2.path(), "utf8");
  check(g.includes("Vanegas Agredo Benjamín") && g.includes("Montoya Quintero Eva") && g.includes("Es mi amiga") && g.includes("Siempre me está molestando"), "informe de quien sí respondió: a quién eligió y lo que explicó (desde él/ella)");
  check(g.includes("Lo que escribió en preguntas abiertas") && g.includes("Más respeto en clase"), "…y sus propias respuestas abiertas");
  // ── Versión familias ──
  await p.selectOption("#rn-est", "1"); await p.click("button:has-text('Para familias')");
  const [d3] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }), p.locator("text=Descargar HTML").click()]);
  const fa = readFileSync(await d3.path(), "utf8");
  check(/informe_familias_/.test(d3.suggestedFilename()), "el archivo se llama informe_familias_<nombre>.html");
  check(!["Garzón", "Granados", "Ramírez", "Montoya", "Amaya"].some((n) => fa.includes(n)), "la versión para familias NO nombra a ningún otro estudiante");
  check(/Para tener en cuenta/.test(fa), "…pero sí destaca, sin nombres, lo que se aparta del promedio del grupo");
  check(!["molestando", "malo", "irrespeta", "ayuda con las tareas", "Más respeto"].some((t) => fa.includes(t)), "…ni incluye lo que escribieron otros ni respuestas abiertas");
  check(fa.includes("Versión para familias") && fa.includes("Acuerdos de la reunión") && /<td>3<\/td><td>0<\/td>/.test(fa), "…pero sí las cifras por pregunta, la lectura del perfil y un espacio para acuerdos");
  // Vista previa y PDF
  await p.locator("div", { hasText: /^Vista Previa$/ }).first().click(); await p.waitForTimeout(800);
  const marco = p.frameLocator("iframe[title='Vista previa del reporte']");
  check((await marco.locator("body").innerText()).includes("Vanegas Agredo Benjamín"), "la vista previa muestra el informe en pantalla");
  // Privacidad en la actividad
  const act = await leer(P + "/activity");
  check(act.some((a) => /informe de un estudiante/.test(a.action)) && !JSON.stringify(act).includes("Vanegas"), "queda en la actividad sin guardar el nombre del estudiante");
  check(errs.length === 0, "sin errores de JavaScript" + (errs.length ? ": " + errs[0] : ""));
} catch (x) { console.log("FALLÓ excepción:", x.message.split("\n").slice(0, 3).join(" | ")); failed++; }
await b.close(); vite.kill(); await env.cleanup(); console.log(failed ? `\n${failed} fallo(s)` : "\nInforme estudiante OK"); process.exit(failed ? 1 : 0);
