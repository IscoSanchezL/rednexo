// Prueba de extremo a extremo de la encuesta pública contra el emulador de Firestore.
// Uso: npm run test:e2e  (levanta el emulador y Vite con VITE_USE_EMULATORS=true)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // Playwright no es dependencia del proyecto: debe estar instalado en el equipo
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, "colegios/colegio-a/surveys/sv1"), { id: "sv1", status: "active", title: "Encuesta A", maxSel: 2, anon: true,
    questions: [{ id: "q1", text: "¿Con quién trabajarías?", tp: "pos" }], rosterIds: ["1", "2", "3"], colegioNombre: "Colegio A",
    roster: [{ id: "1", name: "Ana Uno", group: "5A", av: "AU" }, { id: "2", name: "Beto Dos", group: "5A", av: "BD" }, { id: "3", name: "Cami Tres", group: "5A", av: "CT" }] });
  await setDoc(doc(db, "colegios/colegio-b/students/9"), { id: "9", name: "SECRETO Colegio B", group: "5A" });
});

const vite = spawn("npx", ["vite", "--port", "5199", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
try {
  const b = await chromium.launch(); const p = await b.newPage();
  const text = async () => (await p.innerText("body")).replace(/\s+/g, " ");
  await p.goto("http://localhost:5199/?c=colegio-a&survey=sv1"); await p.waitForSelector("text=Ana Uno", { timeout: 15000 });
  const t = await text();
  check(t.includes("Beto Dos") && t.includes("Cami Tres"), "la encuesta de colegio-a lista sus estudiantes");
  check(!t.includes("SECRETO"), "no aparecen estudiantes de otro colegio");
  await p.click("text=Ana Uno"); await p.waitForTimeout(800);
  await p.click("text=Beto Dos"); await p.waitForTimeout(300);
  const next = p.locator("button", { hasText: "Enviar respuestas" }); await next.click();
  await p.waitForSelector("text=¡Gracias por responder!", { timeout: 10000 });
  check(true, "la respuesta se envía y se muestra el agradecimiento");
  let r, m;
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    r = (await getDoc(doc(db, "colegios/colegio-a/responses/sv1_1"))).data();
    m = (await getDoc(doc(db, "colegios/colegio-a/responseMarks/sv1_1"))).exists();
  });
  check(r && r.respondentName === "Ana Uno" && JSON.stringify(r.answers.q1) === '["2"]', "la respuesta quedó en colegios/colegio-a/responses con la elección correcta");
  check(m, "se creó la marca de 'ya respondió'");
  await p.goto("http://localhost:5199/?c=colegio-a&survey=sv1"); await p.waitForSelector("text=Ana Uno"); await p.click("text=Ana Uno");
  await p.waitForSelector("text=Ya respondiste esta encuesta", { timeout: 8000 });
  check(true, "quien ya respondió lo ve y no puede repetir");
  const p2 = await b.newPage(); await p2.goto("http://localhost:5199/?c=colegio-b&survey=sv1"); await p2.waitForSelector("text=Encuesta no disponible", { timeout: 10000 });
  check(true, "la misma encuesta pedida con otro colegio no existe");
  const p3 = await b.newPage(); await p3.goto("http://localhost:5199/?c=../x&survey=sv1"); await p3.waitForSelector("text=Encuesta no disponible", { timeout: 10000 });
  check(true, "un colegio con caracteres inválidos se rechaza");
  await b.close();
} catch (e) { console.log("FALLÓ  excepción:", e.message.split("\n")[0]); failed++; }
vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} comprobación(es) fallaron` : "\nTodo bien");
process.exit(failed ? 1 : 0);
