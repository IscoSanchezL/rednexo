// Matriz: «recibidas» por tipo (positivas, rechazos y neutrales) y encabezado fijo al deslizar.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const CID = "col-mr", P = `colegios/${CID}`;
const N = 30;
const ST = Array.from({ length: N }, (_, i) => ({ id: String(i + 1), name: i === N - 1 ? "Vanegas Agredo Benjamín" : `Apellido${i + 1} Segundo${i + 1} Nombre${i + 1}`, group: "3A", av: i === N - 1 ? "VA" : "E" + ((i + 1) % 10) }));
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, P), { nombre: "Colegio MR" }); await setDoc(doc(db, P + "/settings/global"), { colegio: "Colegio MR" });
  await setDoc(doc(db, P + "/miembros/psi@mr.co"), { email: "psi@mr.co", role: "psychologist", status: "active" });
  await setDoc(doc(db, P + "/groups/g1"), { id: "g1", name: "3A", color: "#fbbf24" });
  for (const s of ST) await setDoc(doc(db, `${P}/students/${s.id}`), s);
  const Q = [{ id: "q1", text: "¿Con quién trabajarías?", tp: "pos" }, { id: "q2", text: "¿Con quién NO?", tp: "neg" }, { id: "q3", text: "¿Líder?", tp: "neu" }];
  await setDoc(doc(db, P + "/surveys/sv1"), { id: "sv1", title: "Matriz", status: "active", group: "3A", groups: ["3A"], maxSel: 3, createdAt: Timestamp.fromMillis(Date.now()), questions: Q, rosterIds: ST.map((s) => s.id), roster: ST, colegioNombre: "Colegio MR" });
  // Vanegas (id 30) solo recibe RECHAZOS (de 1, 2 y 3): no elige a nadie ni recibe elecciones positivas. El 29 recibe 2 positivas y 1 neutral.
  const resp = { 1: { q2: ["30"], q1: ["29"] }, 2: { q2: ["30"], q1: ["29"] }, 3: { q2: ["30"], q3: ["29"] } };
  for (const [id, answers] of Object.entries(resp)) await setDoc(doc(db, `${P}/responses/sv1_${id}`), { surveyId: "sv1", respondentId: id, respondentName: ST[id - 1].name, answers, submittedAt: Timestamp.fromMillis(Date.now()) });
});
const vite = spawn("npx", ["vite", "--port", "5178", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0; const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
try {
  const p = await (await b.newContext({ viewport: { width: 1400, height: 700 } })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:5178/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), "psi@mr.co");
  await p.waitForSelector("text=PARTICIPANTES", { timeout: 20000 }); await p.click("header button:has-text('Matriz')"); await p.waitForSelector("[data-testid=matriz-scroll]"); await p.waitForTimeout(800);
  // Recibidas por tipo bajo la columna de cada estudiante
  const fila = async (etiqueta) => p.evaluate((et) => { const tr = [...document.querySelectorAll("tbody tr")].find((r) => r.firstElementChild.textContent.includes(et)); return tr ? [...tr.children].slice(1, -1).map((td) => parseInt(td.textContent, 10)) : null; }, etiqueta);
  const columna = (nombre) => p.evaluate((n) => [...document.querySelectorAll("thead th")].slice(1, -2).findIndex((th) => th.querySelector("div[title]")?.title === n), nombre);
  const pos = await fila("RECIBIDAS +"), neg = await fila("RECIBIDAS −"), neu = await fila("NEUTRALES");
  check(!!pos && !!neg && !!neu && pos.length === N, "existen las tres filas al pie: recibidas +, recibidas − y neutrales");
  const iV = await columna("Vanegas Agredo Benjamín"), iO = await columna("Apellido29 Segundo29 Nombre29");
  check(iV >= 0 && neg && neg[iV] === 3 && pos[iV] === 0, "Vanegas (solo recibió rechazos): «recibidas −» = 3 y «recibidas +» = 0 (antes solo se veía el 0 de las positivas)");
  check(iO >= 0 && pos[iO] === 2 && neu[iO] === 1 && neg[iO] === 0, "otro estudiante: 2 positivas y 1 neutral recibidas");
  check(neg && neg.reduce((a, x) => a + x, 0) === 3 && pos.reduce((a, x) => a + x, 0) === 2, "los totales de cada fila coinciden con las elecciones registradas");
  // Nombres completos en las filas y apellido vertical en las columnas
  const nombres = await p.evaluate(() => [...document.querySelectorAll("tbody tr td:first-child span[title]")].map((s) => s.title));
  check(nombres.includes("Vanegas Agredo Benjamín") && (await p.evaluate(() => [...document.querySelectorAll("thead th div[title]")].some((d) => d.title === "Vanegas Agredo Benjamín" && d.textContent === "Vanegas Agredo"))), "filas con el nombre completo y columnas con el apellido escrito en vertical (se sabe de quién es cada columna)");
  // Encabezado y resumen fijos al deslizar
  const antes = await p.evaluate(() => { const c = document.querySelector("[data-testid=matriz-scroll]"); return { alto: c.clientHeight, total: c.scrollHeight }; });
  check(antes.total > antes.alto, "la matriz tiene su propio desplazamiento (alto " + antes.alto + " de " + antes.total + " px)");
  await p.evaluate(() => { const c = document.querySelector("[data-testid=matriz-scroll]"); c.scrollTop = Math.round(c.scrollHeight / 2); });
  await p.waitForTimeout(300);
  const medio = await p.evaluate(() => { const c = document.querySelector("[data-testid=matriz-scroll]").getBoundingClientRect(); const th = document.querySelector("thead th:nth-child(3)").getBoundingClientRect(); const f = [...document.querySelectorAll("tbody tr")].find((r) => r.firstElementChild.textContent.includes("RECIBIDAS −")).children[1].getBoundingClientRect(); return { thArriba: Math.abs(th.top - c.top) < 3, resumenAbajo: f.bottom <= c.bottom + 1 && f.top >= c.top }; });
  check(medio.thArriba, "a media tabla, el encabezado con las iniciales y apellidos sigue visible arriba");
  check(medio.resumenAbajo, "…y las filas de «recibidas» siguen visibles abajo (sin llegar al final)");
  await p.evaluate(() => { const c = document.querySelector("[data-testid=matriz-scroll]"); c.scrollTop = c.scrollHeight; c.scrollLeft = c.scrollWidth; });
  await p.waitForTimeout(300);
  const fin = await p.evaluate(() => { const c = document.querySelector("[data-testid=matriz-scroll]").getBoundingClientRect(); const th = document.querySelector("thead th:nth-child(3)").getBoundingClientRect(); return Math.abs(th.top - c.top) < 3; });
  check(fin, "también arriba al desplazar a la esquina inferior derecha");
  await p.screenshot({ path: "/tmp/claude-0/-home-user-rednexo/c47e28d2-83a4-5c53-b7e0-49e9fc970146/scratchpad/aud/matriz-fija.png" });
  check(errs.length === 0, "sin errores de JavaScript" + (errs.length ? ": " + errs[0] : ""));
} catch (x) { console.log("FALLÓ excepción:", x.message.split("\n").slice(0, 3).join(" | ")); failed++; }
await b.close(); vite.kill(); await env.cleanup(); console.log(failed ? `\n${failed} fallo(s)` : "\nMatriz resumen OK"); process.exit(failed ? 1 : 0);
