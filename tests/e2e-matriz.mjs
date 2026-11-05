// Matriz sociométrica: legibilidad (contraste WCAG) y tonos correctos en modo claro y oscuro.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore(), cid = "col-matriz";
  await setDoc(doc(db, `colegios/${cid}`), { nombre: "Colegio Matriz" });
  await setDoc(doc(db, `colegios/${cid}/settings/global`), { colegio: "Colegio Matriz" });
  await setDoc(doc(db, `colegios/${cid}/miembros/psi@m.co`), { email: "psi@m.co", role: "psychologist", status: "active" });
  await setDoc(doc(db, `colegios/${cid}/groups/g1`), { id: "g1", name: "5° A", color: "#ff4d6a" });
  await setDoc(doc(db, `colegios/${cid}/groups/g2`), { id: "g2", name: "5° B", color: "#2dd4bf" });
  const names = ["Ana García", "Beto Ruiz", "Cami Torres", "Dani Pérez", "Eli Gómez", "Fabi Mora"];
  for (const [i, n] of names.entries()) await setDoc(doc(db, `colegios/${cid}/students/${i + 1}`), { id: String(i + 1), name: n, group: i < 3 ? "5° A" : "5° B", av: n.split(" ").map((w) => w[0]).join("") });
  await setDoc(doc(db, `colegios/${cid}/surveys/sv1`), { id: "sv1", title: "S", status: "active", group: "5° A", groups: ["5° A", "5° B"], maxSel: 3, anon: true, createdAt: Timestamp.now(), rosterIds: names.map((_, i) => String(i + 1)), roster: [], questions: [{ id: "q1", text: "a", tp: "pos" }, { id: "q2", text: "b", tp: "neu" }, { id: "q3", text: "c", tp: "neg" }] });
  const R = { 1: { q1: ["2", "3"], q2: ["4"], q3: ["6"] }, 2: { q1: ["1"], q3: ["3"] }, 3: { q1: ["1"] }, 4: { q1: ["5"], q3: ["1"] }, 5: { q1: ["4", "6"] }, 6: { q1: ["5"], q2: ["1"] } };
  for (const [id, answers] of Object.entries(R)) await setDoc(doc(db, `colegios/${cid}/responses/sv1_${id}`), { surveyId: "sv1", respondentId: id, respondentName: names[id - 1], answers });
});

const vite = spawn("npx", ["vite", "--port", "5192", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();

// Se ejecuta dentro de la página: contraste real entre el color del texto y el fondo efectivo (compuesto sobre sus ancestros).
const medir = () => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1; const g = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (css) => { g.clearRect(0, 0, 1, 1); g.fillStyle = "#000"; g.fillStyle = css; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top, bot) => { const a = top[3] + bot[3] * (1 - top[3]); if (a === 0) return [0, 0, 0, 0]; return [0, 1, 2].map((i) => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a).concat(a); };
  const bgDe = (el) => { const capas = []; for (let e = el; e; e = e.parentElement) capas.push(rgba(getComputedStyle(e).backgroundColor)); let acc = [255, 255, 255, 1]; for (const c of capas.reverse()) acc = over(c, acc); return acc; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const textoDe = (el) => over(rgba(getComputedStyle(el).color), bgDe(el));
  const pares = [];
  const add = (nombre, el, min) => { if (!el) { pares.push({ nombre, falta: true }); return; } pares.push({ nombre, min, ratio: Math.round(ratio(textoDe(el), bgDe(el)) * 100) / 100 }); };
  const q = (sel, txt) => [...document.querySelectorAll(sel)].find((e) => !txt || e.textContent.trim() === txt);
  const tabla = document.querySelector("table");
  add("nombre de estudiante (fila)", q("tbody td span[title]"), 4.5);
  add("iniciales (fila)", [...document.querySelectorAll("tbody td div")].find((d) => /^[A-Z]{2}$/.test(d.textContent.trim())), 4.5);
  add("iniciales (columna)", [...document.querySelectorAll("thead th div")].find((d) => /^[A-Z]{2}$/.test(d.textContent.trim())), 4.5);
  add("grupo bajo la columna", q("thead th div", "5° A"), 4.5);
  add("«De ↓ Para →»", q("thead th div", null) && [...document.querySelectorAll("thead th div")].find((d) => d.textContent.includes("De")), 4.5);
  add("«RECIBIDAS»", q("tbody td", "RECIBIDAS"), 4.5);
  add("encabezado Σ+", q("thead th", "Σ+"), 4.5);
  add("encabezado Σ−", q("thead th", "Σ−"), 4.5);
  const filas = [...document.querySelectorAll("tbody tr")];
  add("total Σ+ de una fila", filas[0] && filas[0].children[filas[0].children.length - 2], 4.5);
  add("total Σ− de una fila", filas[0] && filas[0].children[filas[0].children.length - 1], 4.5);
  const ultima = filas[filas.length - 1];
  add("número de «recibidas»", ultima && ultima.querySelector("td span"), 4.5);
  add("leyenda", [...document.querySelectorAll("span")].find((s) => s.children.length === 1 && s.textContent.trim().endsWith("Positiva")), 4.5);
  add("conteo de participantes", [...document.querySelectorAll("span")].find((s) => /participantes/.test(s.textContent)), 4.5);
  // Símbolos de conexión sobre su celda (gráfico grande: 3:1)
  const syms = [...document.querySelectorAll("td.nm-cell span")].filter((s) => /[▲⬥▼◯]/.test(s.textContent));
  const peor = syms.map((s) => ({ t: s.textContent, r: ratio(textoDe(s), bgDe(s)) })).sort((a, b) => a.r - b.r)[0];
  pares.push({ nombre: `símbolos de conexión (${syms.length}; el peor «${peor?.t}»)`, min: 3, ratio: peor ? Math.round(peor.r * 100) / 100 : 0 });
  // Fondos: nada casi negro en modo claro
  const luzFondo = (el) => lum(bgDe(el));
  return { pares, luzEnc: luzFondo(document.querySelector("thead th")), luzFila: luzFondo(document.querySelector("tbody td")), luzRecib: luzFondo([...document.querySelectorAll("tbody td")].find((d) => d.textContent.trim() === "RECIBIDAS")),
    celdaConexion: (() => { const c = [...document.querySelectorAll("td.nm-cell")].find((d) => /[▲⬥▼◯]/.test(d.textContent)); return c ? rgba(getComputedStyle(c).backgroundColor)[3] : -1; })() };
};

try {
  for (const tema of ["light", "dark"]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); const p = await ctx.newPage();
    await p.addInitScript((t) => { try { localStorage.setItem("rednexo-theme", t); } catch (e) {} }, tema);
    await p.goto("http://localhost:5192/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate(() => window.__rnSignIn("psi@m.co"));
    await p.waitForSelector("text=Dashboard", { timeout: 15000 });
    await p.click("button:has-text('Matriz')"); await p.waitForSelector("td.nm-cell"); await p.waitForTimeout(600);
    const r = await p.evaluate(medir);
    for (const x of r.pares) check(!x.falta && x.ratio >= x.min, `[${tema}] ${x.nombre}: ${x.falta ? "no se encontró" : x.ratio + ":1 (mínimo " + x.min + ")"}`);
    if (tema === "light") {
      check(r.luzEnc > 0.7 && r.luzFila > 0.7 && r.luzRecib > 0.7, `[light] los encabezados son claros, no bloques negros (luminosidad ${r.luzEnc.toFixed(2)} / ${r.luzFila.toFixed(2)} / ${r.luzRecib.toFixed(2)})`);
    } else {
      check(r.luzEnc < 0.12 && r.luzFila < 0.12, `[dark] los encabezados siguen siendo oscuros (luminosidad ${r.luzEnc.toFixed(2)} / ${r.luzFila.toFixed(2)})`);
    }
    check(r.celdaConexion > 0.05, `[${tema}] las celdas con conexión se iluminan con su color (opacidad del fondo ${r.celdaConexion.toFixed(2)})`);
    await ctx.close();
  }
} catch (e) { console.log("FALLÓ  excepción:", e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} comprobación(es) fallaron` : "\nTodo bien");
process.exit(failed ? 1 : 0);
