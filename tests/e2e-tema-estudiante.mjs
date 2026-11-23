// Encuesta de los estudiantes: tema claro y oscuro (sigue el del celular y se puede cambiar con un botón que se recuerda).
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const CID = "col-tm", P = `colegios/${CID}`;
const ST = [["1", "Ana Pérez"], ["2", "Beto Díaz"], ["3", "Carla Ruiz"]].map(([id, name]) => ({ id, name, group: "5A", av: name.split(" ").map((w) => w[0]).join("") }));
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, P), { nombre: "Colegio TM" }); await setDoc(doc(db, P + "/settings/global"), { colegio: "Colegio TM" });
  await setDoc(doc(db, P + "/miembros/psi@tm.co"), { email: "psi@tm.co", role: "psychologist", status: "active" });
  for (const s of ST) await setDoc(doc(db, `${P}/students/${s.id}`), s);
  await setDoc(doc(db, P + "/surveys/sv1"), { id: "sv1", title: "Tema", status: "active", group: "5A", groups: ["5A"], maxSel: 2, createdAt: Timestamp.fromMillis(Date.now()), questions: [{ id: "q1", text: "¿Con quién?", tp: "pos", kind: "justificable" }], rosterIds: ST.map((s) => s.id), roster: ST, colegioNombre: "Colegio TM" });
});
const vite = spawn("npx", ["vite", "--port", "5173", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0; const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
const URL = `http://localhost:5173/?c=${CID}&survey=sv1`;
const claro = (p) => p.evaluate(() => document.documentElement.classList.contains("light"));
const fondo = (p) => p.evaluate(() => { const rgb = getComputedStyle(document.querySelector("div[style*='position: fixed']")).backgroundColor.match(/\d+/g).map(Number); return (rgb[0] + rgb[1] + rgb[2]) / 3; });
const nuevo = async (colorScheme) => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme })).newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); return p; };
try {
  // Celular en modo claro, sin preferencia guardada → empieza claro
  const p = await nuevo("light");
  await p.goto(URL); await p.waitForSelector("text=¿Quién eres tú?", { timeout: 15000 });
  check((await claro(p)) && (await fondo(p)) > 200, "celular en modo claro: la encuesta empieza en tema claro (fondo claro)");
  check(await p.evaluate(() => localStorage.getItem("rednexo-theme")) === null, "…y no guarda nada mientras el estudiante no elija");
  // Botón → oscuro, y se recuerda
  await p.locator("button[aria-label='Cambiar a tema oscuro']").click(); await p.waitForTimeout(300);
  check(!(await claro(p)) && (await fondo(p)) < 60 && await p.evaluate(() => localStorage.getItem("rednexo-theme")) === "dark", "el botón cambia a tema oscuro y lo guarda");
  await p.reload(); await p.waitForSelector("text=¿Quién eres tú?");
  check(!(await claro(p)), "al recargar sigue oscuro (aunque el celular esté en claro)");
  // Las preguntas, con explicación, se leen en claro
  await p.locator("button[aria-label='Cambiar a tema claro']").click(); await p.waitForTimeout(300);
  await p.locator("button:has-text('Ana')").click(); await p.waitForSelector("text=Pregunta 1");
  await p.locator("button:has-text('Beto')").first().click();
  const colores = await p.evaluate(() => { const ta = document.querySelector("textarea"); const q = [...document.querySelectorAll("div")].find((d) => d.textContent.trim() === "¿Con quién?"); return { fondoTextarea: getComputedStyle(ta).backgroundColor, textoTextarea: getComputedStyle(ta).color, textoPregunta: q && getComputedStyle(q).color }; });
  const lum = (c) => c.match(/\d+/g).slice(0, 3).map(Number).reduce((a, x) => a + x, 0) / 3;
  check(lum(colores.fondoTextarea) > 200 && lum(colores.textoTextarea) < 80 && lum(colores.textoPregunta) < 80, "tema claro en la pregunta: cuadro de texto claro con letra oscura, y pregunta en letra oscura");
  await p.locator("textarea").first().fill("Es mi amigo");
  await p.locator("button:has-text('Enviar')").click(); await p.waitForSelector("text=Gracias", { timeout: 10000 });
  check((await claro(p)) && (await p.innerText("body")).includes("Gracias"), "la pantalla final también respeta el tema claro");
  check(await p.locator("button[aria-label='Cambiar a tema oscuro']").count() === 1, "…y conserva el botón de tema");
  // Celular en oscuro: empieza oscuro
  const o = await nuevo("dark"); await o.goto(URL); await o.waitForSelector("text=¿Quién eres tú?");
  check(!(await claro(o)) && (await fondo(o)) < 60, "celular en modo oscuro: la encuesta empieza en tema oscuro");
  // Encuesta inexistente: el botón también está
  await o.goto(`http://localhost:5173/?c=${CID}&survey=no-existe`); await o.waitForSelector("text=Encuesta no disponible");
  check(await o.locator("button[aria-label^='Cambiar a tema']").count() === 1, "la pantalla de «encuesta no disponible» también tiene el botón de tema");
  // El panel del colegio no cambia: sin preferencia y celular en claro, sigue empezando oscuro
  const a = await nuevo("light"); await a.goto("http://localhost:5173/"); await a.waitForSelector("text=Continuar con Google");
  check(!(await claro(a)), "el panel del colegio no cambió: sin preferencia sigue empezando oscuro");
  check(p.errs.length + o.errs.length + a.errs.length === 0, "sin errores de JavaScript");
} catch (x) { console.log("FALLÓ excepción:", x.message.split("\n").slice(0, 3).join(" | ")); failed++; }
await b.close(); vite.kill(); await env.cleanup(); console.log(failed ? `\n${failed} fallo(s)` : "\nTema estudiante OK"); process.exit(failed ? 1 : 0);
