// Colegio con 300 estudiantes y nombres difíciles: el mapa y la matriz empiezan por un grupo, nada tarda, los reportes grandes se acotan.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, Timestamp, writeBatch } from "firebase/firestore";
import { spawn } from "node:child_process";
const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const P = "colegios/g", N_G = 10, POR = 30;
const RARO = ['María José "Chepe" <b>O\'Brien</b> & Co.', "Ñandú Peña-Gómez 🙂", "X".repeat(90), "<img src=x onerror=alert(1)>", "Ángel   Ramírez   (repetido)", "Ángel Ramírez (repetido)"];
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, "colegios/g"), { nombre: "Colegio <i>Grande</i>" }); await setDoc(doc(db, P + "/settings/global"), { colegio: "Colegio <i>Grande</i>" });
  await setDoc(doc(db, P + "/miembros/adm@g.co"), { email: "adm@g.co", role: "admin", status: "active" });
  let id = 0; const roster = []; const porG = {};
  let batch = writeBatch(db), n = 0; const flush = async () => { await batch.commit(); batch = writeBatch(db); n = 0; };
  for (let g = 0; g < N_G; g++) { const name = `Curso ${g + 1}`; batch.set(doc(db, `${P}/groups/g${g}`), { id: "g" + g, name, color: ["#ff4d6a", "#2dd4bf", "#a78bfa", "#f59e0b", "#38bdf8"][g % 5] }); n++; porG[name] = [];
    for (let i = 0; i < POR; i++) { id++; const nombre = g === 0 && i < RARO.length ? RARO[i] : `Estudiante ${id}`; const e = { id: String(id), name: nombre, group: name, av: nombre[0].toUpperCase() }; batch.set(doc(db, `${P}/students/${id}`), e); n++; porG[name].push(e); roster.push(e); if (n > 400) await flush(); } }
  await flush();
  const Q = [{ id: "q1", text: "¿Con quién trabajarías?", tp: "pos" }, { id: "q2", text: "¿Con quién NO?", tp: "neg" }];
  await setDoc(doc(db, P + "/surveys/sv1"), { id: "sv1", title: "Encuesta <script>x</script> grande", status: "active", group: "Curso 1", groups: Object.keys(porG), maxSel: 3, createdAt: Timestamp.fromMillis(Date.now()), questions: Q, rosterIds: roster.map((e) => e.id), roster, colegioNombre: "Colegio <i>Grande</i>" });
  for (const lista of Object.values(porG)) for (const e of lista) { const otros = lista.filter((x) => x.id !== e.id); const pk = (k) => Array.from({ length: k }, (_, j) => otros[(Number(e.id) * 7 + j * 5) % otros.length].id); batch.set(doc(db, `${P}/responses/sv1_${e.id}`), { surveyId: "sv1", respondentId: e.id, respondentName: e.name, answers: { q1: pk(3), q2: pk(1) }, submittedAt: Timestamp.fromMillis(Date.now()) }); n++; if (n > 400) await flush(); }
  await flush();
});
const vite = spawn("npx", ["vite", "--port", "5164", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
const b = await chromium.launch();
let fallos = 0; const check = (ok, m) => { console.log((ok ? "ok     " : "FALLÓ  ") + m); if (!ok) fallos++; };
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => { errs.push("DIÁLOGO: " + d.message()); d.dismiss(); });
const txt = async () => (await p.innerText("body")).replace(/\s+/g, " ");
try {
  await p.goto("http://localhost:5164/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate(() => window.__rnSignIn("adm@g.co"));
  await p.waitForFunction(() => /Con 300 estudiantes/.test(document.body.innerText), null, { timeout: 60000 });
  let t = await txt();
  check(/30\s*PARTICIPANTES/i.test(t) && t.includes("solo «Curso 1»"), "300 estudiantes: el Dashboard empieza con un solo grupo (30 participantes) y lo explica");
  await p.locator("button:has-text('Curso 2')").first().click(); await p.waitForTimeout(500);
  check(/60\s*PARTICIPANTES/i.test(await txt()), "…y se pueden sumar grupos con los botones del mapa (60)");
  const lento = [];
  for (const tab of ["Matriz", "Reportes", "Encuestas", "Grupos", "Dashboard"]) {
    const t1 = Date.now(); await p.click(`header button:has-text('${tab}')`); await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
    const ms = Date.now() - t1; if (ms > 4000) lento.push(`${tab} ${ms} ms`);
    if (tab === "Matriz") { await p.waitForTimeout(500); const n = await p.locator("tbody tr").count(); check(n <= 40, "Matriz con 300 estudiantes: empieza con un grupo (" + n + " filas)"); }
  }
  check(lento.length === 0, "con 300 estudiantes ninguna pestaña tarda más de 4 s" + (lento.length ? " — " + lento.join(", ") : ""));
  await p.click("header button:has-text('Grupos')"); await p.waitForTimeout(800);
  const html = await p.evaluate(() => document.body.innerHTML);
  check(!/<img[^>]*src="x"/.test(html) && !/<i>Grande<\/i>/.test(html), "nombres con HTML, comillas, emoji y 90 caracteres se muestran como texto (sin interpretarse)");
  await p.click("header button:has-text('Reportes')"); await p.waitForTimeout(500);
  await p.locator("button:has-text('Completo')").first().click();
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }).catch(() => null), p.locator("text=Descargar HTML").click()]);
  check(!!dl, "Reporte Completo de 300 estudiantes se descarga (sin la matriz gigante)");
  if (dl) { const h = readFileSync(await dl.path(), "utf8"); check(h.includes("demasiado grande para incluirla") && h.length < 3_000_000 && !h.includes("<img src=x"), "…con el aviso de matriz omitida y tamaño razonable (" + Math.round(h.length / 1024) + " KB)"); }
  const [x] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }).catch(() => null), p.locator("text=Excel (.xlsx)").click()]);
  check(!!x, "Excel de resultados de 300 estudiantes se descarga");
  check(errs.length === 0, "sin errores de JavaScript ni diálogos" + (errs.length ? ": " + errs[0] : ""));
} catch (e) { console.log("FALLÓ excepción:", e.message.split("\n").slice(0, 3).join(" | ")); fallos++; }
await b.close(); vite.kill(); await env.cleanup(); console.log(fallos ? `\n${fallos} fallo(s)` : "\nCarga OK"); process.exit(fallos ? 1 : 0);
