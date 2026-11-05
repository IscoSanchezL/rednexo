// Filtros del sociograma y matriz: una pareja con respuestas de varios tipos no pierde ninguno.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const QS = [{ id: "qp", text: "positiva", tp: "pos" }, { id: "qn", text: "neutral", tp: "neu" }, { id: "qg", text: "negativa", tp: "neg" }];
const colegio = async (db, cid, email, R) => {
  await setDoc(doc(db, `colegios/${cid}`), { nombre: cid }); await setDoc(doc(db, `colegios/${cid}/settings/global`), { colegio: cid });
  await setDoc(doc(db, `colegios/${cid}/miembros/${email}`), { email, role: "psychologist", status: "active" });
  await setDoc(doc(db, `colegios/${cid}/groups/g1`), { id: "g1", name: "Grupo Prueba", color: "#a78bfa" });
  for (const [i, n] of ["Isco", "Isco1", "Isco2"].entries()) await setDoc(doc(db, `colegios/${cid}/students/${i + 1}`), { id: String(i + 1), name: n, group: "Grupo Prueba", av: "I" });
  await setDoc(doc(db, `colegios/${cid}/surveys/sv1`), { id: "sv1", title: "S", status: "active", group: "Grupo Prueba", groups: ["Grupo Prueba"], maxSel: 3, anon: true, createdAt: Timestamp.now(), rosterIds: ["1", "2", "3"], roster: [], questions: QS });
  for (const [id, answers] of Object.entries(R)) await setDoc(doc(db, `colegios/${cid}/responses/sv1_${id}`), { surveyId: "sv1", respondentId: id, respondentName: "x", answers });
};
const otros = (id) => ["1", "2", "3"].filter((x) => x !== id);
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  // A: como la prueba real: cada estudiante elige a los otros dos en las tres preguntas (positiva, neutral y negativa)
  await colegio(db, "todo-junto", "a@f.co", Object.fromEntries(["1", "2", "3"].map((id) => [id, { qp: otros(id), qn: otros(id), qg: otros(id) }])));
  // B: solo respondieron la positiva: no hay neutrales ni negativas
  await colegio(db, "solo-positivas", "b@f.co", Object.fromEntries(["1", "2", "3"].map((id) => [id, { qp: otros(id) }])));
});

const vite = spawn("npx", ["vite", "--port", "5190", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
const login = async (email) => {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
  await p.addInitScript(() => { try { localStorage.setItem("rednexo-theme", "dark"); } catch (e) {} });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.errs = errs;
  await p.goto("http://localhost:5190/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), email);
  await p.waitForSelector("text=Dashboard", { timeout: 15000 }); await p.waitForSelector("canvas"); await p.waitForTimeout(2500); return p;
};
// Cuenta píxeles dibujados con el color de cada tipo (ámbar = neutral, turquesa = positiva, rojo = negativa) en el sociograma.
const pixeles = (p) => p.evaluate(() => {
  const cv = document.querySelector("canvas"); const g = cv.getContext("2d"); const d = g.getImageData(0, 0, cv.width, cv.height).data;
  const n = { amber: 0, teal: 0, red: 0 };
  for (let i = 0; i < d.length; i += 4) { const [r, gr, bl, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]]; if (a < 180) continue;
    if (r > 190 && gr > 140 && gr < 215 && bl < 110) n.amber++; else if (r < 90 && gr > 160 && bl > 140 && bl < 220) n.teal++; else if (r > 190 && gr < 130 && bl < 140) n.red++; }
  return n;
});
const clic = async (p, f) => { await p.locator(`button:has-text('${f}')`).first().click(); await p.waitForTimeout(1800); };
const body = async (p) => (await p.innerText("body")).replace(/\s+/g, " ");
try {
  const p = await login("a@f.co");
  let t = await body(p);
  check(/Todas 6/.test(t) && /Positivas 6/.test(t) && /Neutrales 6/.test(t) && /Negativas 6/.test(t), "los botones del filtro indican cuántas conexiones hay de cada tipo (6 · 6 · 6 · 6)");
  await clic(p, "Neutrales"); let n = await pixeles(p);
  check(n.amber > 40 && n.teal < 20 && n.red < 20, `con «Neutrales» se dibujan las conexiones neutrales en ámbar (${n.amber} px ámbar, ${n.teal} turquesa, ${n.red} rojo)`);
  check(!(await body(p)).includes("No hay conexiones"), "con «Neutrales» no aparece el aviso de vacío");
  await clic(p, "Negativas"); n = await pixeles(p);
  check(n.red > 40 && n.amber < 20, `con «Negativas» se dibujan los rechazos en rojo (${n.red} px)`);
  await clic(p, "Positivas"); n = await pixeles(p);
  check(n.teal > 40 && n.amber < 20 && n.red < 20, `con «Positivas» solo se dibujan las positivas (${n.teal} px turquesa)`);
  // Matriz: se ven todos los tipos de cada pareja y los totales los cuentan
  await p.click("button:has-text('Matriz')"); await p.waitForSelector("td.nm-cell"); await p.waitForTimeout(500);
  const titulos = await p.locator("td.nm-cell[title*='→']").evaluateAll((els) => els.map((e) => e.getAttribute("title")));
  check(titulos.filter((x) => x.includes("positiva + neutral + negativa")).length === 6, "en la matriz cada pareja indica sus tres tipos (positiva + neutral + negativa)");
  const puntos = await p.locator("td.nm-cell").first().evaluate(() => [...document.querySelectorAll("td.nm-cell")].filter((c) => c.querySelectorAll("div > span").length >= 3).length);
  check(puntos === 6, "cada celda con varios tipos muestra un punto por tipo (6 celdas)");
  const sigma = await p.locator("tbody tr").first().locator("td").evaluateAll((tds) => tds.slice(-2).map((x) => x.textContent.trim()));
  check(sigma[0] === "2" && sigma[1] === "2", `los totales Σ+ y Σ− cuentan los dos tipos (Σ+ ${sigma[0]}, Σ− ${sigma[1]}; antes Σ− daba 0)`);
  check(p.errs.length === 0, "sin errores de JavaScript" + (p.errs.length ? ": " + p.errs[0] : ""));

  // Si de verdad no hay conexiones de ese tipo, lo dice
  const q = await login("b@f.co");
  t = await body(q);
  check(/Positivas 6/.test(t) && /Neutrales 0/.test(t) && /Negativas 0/.test(t), "con solo positivas, los botones indican 6 · 0 · 0");
  await clic(q, "Neutrales"); n = await pixeles(q);
  check((await body(q)).includes("No hay conexiones neutrales en los grupos visibles") && n.amber < 20, "sin neutrales, el sociograma lo explica en vez de quedar vacío sin motivo");
} catch (e) { console.log("FALLÓ  excepción:", e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} comprobación(es) fallaron` : "\nTodo bien");
process.exit(failed ? 1 : 0);
