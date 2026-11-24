// Rendimiento de los Gráficos con 1.500 estudiantes (50 grupos de 30): tiempos de cada vista y de cada clic de detalle.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, Timestamp, writeBatch } from "firebase/firestore";
import { spawn } from "node:child_process";
const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const P = "colegios/big", N_G = 50, POR = 30;
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, "colegios/big"), { nombre: "Colegio Grande" }); await setDoc(doc(db, P + "/settings/global"), { colegio: "Colegio Grande" });
  await setDoc(doc(db, P + "/miembros/adm@big.co"), { email: "adm@big.co", role: "admin", status: "active" });
  let batch = writeBatch(db), n = 0; const flush = async () => { await batch.commit(); batch = writeBatch(db); n = 0; };
  const add = async (ref, d) => { batch.set(ref, d); if (++n >= 400) await flush(); };
  let id = 0; const porG = {};
  for (let g = 0; g < N_G; g++) { const name = `Curso ${g + 1}`; await add(doc(db, `${P}/groups/g${g}`), { id: "g" + g, name, color: ["#ff4d6a", "#2dd4bf", "#a78bfa", "#f59e0b", "#38bdf8"][g % 5] }); porG[name] = [];
    for (let i = 0; i < POR; i++) { id++; const e = { id: String(id), name: `Estudiante ${id} Apellido`, group: name, av: "E" }; porG[name].push(e); await add(doc(db, `${P}/students/${id}`), e); } }
  const Q = [{ id: "q1", text: "¿Con quién trabajarías?", tp: "pos" }, { id: "q2", text: "¿Con quién NO?", tp: "neg" }];
  const all = Object.values(porG).flat();
  await add(doc(db, P + "/surveys/sv1"), { id: "sv1", title: "Grande", status: "active", group: "Curso 1", groups: Object.keys(porG), maxSel: 3, createdAt: Timestamp.fromMillis(Date.now()), questions: Q, rosterIds: all.map((s) => s.id), roster: all, colegioNombre: "Colegio Grande" });
  for (const lista of Object.values(porG)) for (const e of lista) { const otros = lista.filter((x) => x.id !== e.id); const pk = (k) => Array.from({ length: k }, (_, j) => otros[(Number(e.id) * 7 + j * 5) % otros.length].id); await add(doc(db, `${P}/responses/sv1_${e.id}`), { surveyId: "sv1", respondentId: e.id, respondentName: e.name, submittedAt: Timestamp.fromMillis(Date.now()), answers: { q1: pk(3), q2: pk(1) } }); }
  await flush();
});
const vite = spawn("npx", ["vite", "--port", "5230", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
const b = await chromium.launch();
let fallos = 0; const check = (ok, m) => { console.log((ok ? "ok     " : "FALLÓ  ") + m); if (!ok) fallos++; };
const p = await (await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true })).newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
const t = async (etiqueta, fn, max = 2500) => { const t0 = Date.now(); await fn(); const ms = Date.now() - t0; check(ms <= max, `${etiqueta}: ${ms} ms (límite ${max})`); };
try {
  const t0 = Date.now();
  await p.goto("http://localhost:5230/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate(() => window.__rnSignIn("adm@big.co"));
  await p.waitForSelector("text=PARTICIPANTES", { timeout: 90000 });
  console.log("info   carga inicial con 1.500 estudiantes y 1.500 respuestas:", Date.now() - t0, "ms");
  await t("Abrir Gráficos", async () => { await p.click("header button:has-text('Gráficos')"); await p.waitForSelector("[data-seg]"); });
  await t("Clic en un segmento de rol", async () => { await p.locator("[data-seg]").first().click(); await p.waitForSelector("[data-lista-rol]"); }, 1200);
  await t("Clic en el mapa de calor", async () => { await p.locator("[data-celda]").first().click(); }, 1200);
  await t("Vista Estudiantes (1.500 puntos)", async () => { await p.click("[data-graficos] button:has-text('Estudiantes')"); await p.waitForSelector("[data-punto]"); });
  check(await p.locator("[data-punto]").count() === 1500, "…un punto por estudiante (1.500)");
  await t("Clic en un punto", async () => { await p.locator("[data-punto]").nth(40).click({ force: true }); await p.waitForSelector("[data-ficha]"); }, 1200);
  await t("Ocultar un rol en la leyenda", async () => { await p.locator("button[aria-pressed]:has-text('Regular')").click(); }, 1500);
  await t("Vista Individual", async () => { await p.click("[data-graficos] button:has-text('Individual')"); await p.waitForSelector("select[aria-label=Estudiante]"); });
  await t("Elegir estudiante (red de relaciones)", async () => { await p.selectOption("select[aria-label=Estudiante]", "5"); await p.waitForSelector("[data-vecino]"); }, 1500);
  await t("Filtrar por un grupo", async () => { await p.selectOption("select[aria-label=Grupo]", "Curso 3"); await p.waitForTimeout(100); }, 1500);
  await t("Volver a Panorama con un grupo", async () => { await p.click("[data-graficos] button:has-text('Panorama')"); await p.waitForSelector("[data-seg]"); }, 1500);
  check(errs.length === 0, "sin errores de JavaScript" + (errs.length ? ": " + errs[0] : ""));
} catch (x) { console.log("FALLÓ excepción:", x.message.split("\n").slice(0, 3).join(" | ")); fallos++; }
await b.close(); vite.kill(); await env.cleanup(); console.log(fallos ? `\n${fallos} fallo(s)` : "\nCarga de Gráficos OK"); process.exit(fallos ? 1 : 0);
