// Duplicar una encuesta, ver los datos de una sola encuesta y exportar resultados a Excel (el archivo se abre con openpyxl).
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doc, setDoc, getDocs, collection, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const Q = [{ id: "p", text: "¿Con quién trabajarías?", tp: "pos" }, { id: "n", text: "¿Quién lidera?", tp: "neu" }, { id: "g", text: "¿Con quién NO?", tp: "neg" }];
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore(), cid = "col-xl";
  await setDoc(doc(db, `colegios/${cid}`), { nombre: "Colegio Excel" }); await setDoc(doc(db, `colegios/${cid}/settings/global`), { colegio: "Colegio Excel" });
  await setDoc(doc(db, `colegios/${cid}/miembros/psi@xl.co`), { email: "psi@xl.co", role: "psychologist", status: "active" });
  await setDoc(doc(db, `colegios/${cid}/miembros/ro@xl.co`), { email: "ro@xl.co", role: "readonly", status: "active" });
  await setDoc(doc(db, `colegios/${cid}/groups/g1`), { id: "g1", name: "5A", color: "#a78bfa" }); await setDoc(doc(db, `colegios/${cid}/groups/g2`), { id: "g2", name: "6A", color: "#2dd4bf" });
  const est = [["1", "Ana", "5A"], ["2", "Beto", "5A"], ["3", "Cami", "5A"], ["4", "Dani", "6A"], ["5", "Eli", "6A"]];
  for (const [id, name, group] of est) await setDoc(doc(db, `colegios/${cid}/students/${id}`), { id, name, group, av: name[0] });
  const sv = (id, title, status, group, ids, ms) => setDoc(doc(db, `colegios/${cid}/surveys/${id}`), { id, title, status, group, groups: [group], maxSel: 3, anon: true, createdAt: Timestamp.fromMillis(ms), questions: Q, rosterIds: ids, roster: est.filter(([i]) => ids.includes(i)).map(([i, name, g]) => ({ id: i, name, group: g, av: name[0] })), colegioNombre: "Colegio Excel" });
  await sv("s1", "Encuesta 2026", "active", "5A", ["1", "2", "3"], 1000); await sv("s2", "Encuesta 6A", "active", "6A", ["4", "5"], 2000); await sv("s3", "Borrador vacío", "draft", "5A", [], 3000);
  const resp = (s, id, answers, m) => setDoc(doc(db, `colegios/${cid}/responses/${s}_${id}`), { surveyId: s, respondentId: id, respondentName: "x", answers, submittedAt: Timestamp.fromMillis(m) });
  await resp("s1", "1", { p: ["2"], n: ["3"], g: ["3"] }, 1762506000000); await resp("s1", "2", { p: ["1", "3"] }, 1762506300000); await resp("s1", "3", { p: ["1"], g: ["2"] }, 1762506600000);
  await resp("s2", "4", { p: ["5"] }, 1762592400000); await resp("s2", "5", { p: ["4"] }, 1762592700000);
  for (const [s, ids] of [["s1", ["1", "2", "3"]], ["s2", ["4", "5"]]]) for (const id of ids) await setDoc(doc(db, `colegios/${cid}/responseMarks/${s}_${id}`), { surveyId: s, respondentId: id });
});
const lista = async (c) => { let o = []; await env.withSecurityRulesDisabled(async (x) => { o = (await getDocs(collection(x.firestore(), `colegios/col-xl/${c}`))).docs.map((d) => d.data()); }); return o; };
const until = async (fn, ms = 10000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 250)); } };
const tmp = mkdtempSync(join(tmpdir(), "xl-"));
const leerXlsx = (file) => JSON.parse(execFileSync("python3", ["-I", "-c", `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1])
def filas(n): return [[c for c in r] for r in wb[n].iter_rows(values_only=True)]
print(json.dumps({"hojas": wb.sheetnames, "indices": filas("Índices"), "respuestas": [[str(c) for c in r] for r in filas("Respuestas")], "leeme": [str(r[0]) + " " + str(r[1]) for r in filas("Léeme")], "porPregunta": filas("Por pregunta")}, default=str))`, file]).toString());

const vite = spawn("npx", ["vite", "--port", "5184", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
const login = async (email) => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage(); p.ctx = ctx;
  const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.errs = errs; p.on("dialog", (d) => d.accept());
  await p.goto("http://localhost:5184/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), email);
  await p.waitForSelector("text=Dashboard", { timeout: 15000 }); return p;
};
const body = async (p) => (await p.innerText("body")).replace(/\s+/g, " ");
const boton = (p, titulo, texto) => p.locator(`xpath=//span[normalize-space()='${titulo}']/ancestor::div[.//button[contains(.,'${texto}')]][1]//button[contains(.,'${texto}')]`).first();
const conexiones = async (p) => Number(((await body(p)).match(/(\d+) conexiones/i) || [])[1]);
try {
  const p = await login("psi@xl.co");
  // ── Filtro por encuesta ──
  const sel = p.locator("#rn-fuente");
  await sel.waitFor();
  check((await conexiones(p)) === 8, "con «Todas las encuestas» el dashboard cuenta las 8 conexiones (6 de 5A + 2 de 6A)");
  await sel.selectOption("s1"); await p.waitForTimeout(600);
  check((await conexiones(p)) === 6 && (await body(p)).includes("Se muestra solo esta encuesta"), "con «Encuesta 2026» solo cuenta las 6 de esa encuesta y lo avisa");
  await sel.selectOption("s2"); await p.waitForTimeout(600);
  check((await conexiones(p)) === 2, "con «Encuesta 6A» cuenta las 2 de esa encuesta");
  await sel.selectOption("all");
  check((await sel.locator("option").allInnerTexts()).some((t) => t === "Encuesta 2026 (3 respuestas)"), "el selector indica cuántas respuestas tiene cada encuesta");

  // ── Excel desde la encuesta ──
  await p.click("button:has-text('Encuestas')"); await p.waitForSelector("text=Encuesta 2026");
  check(await boton(p, "Borrador vacío", "Resultados (Excel)").isDisabled(), "una encuesta sin respuestas tiene el botón de Excel deshabilitado");
  const [dl] = await Promise.all([p.waitForEvent("download"), boton(p, "Encuesta 2026", "Resultados (Excel)").click()]);
  const f1 = join(tmp, dl.suggestedFilename()); await dl.saveAs(f1);
  check(/^resultados_rednexo_Colegio_Excel_Encuesta_2026_\d{4}-\d{2}-\d{2}\.xlsx$/.test(dl.suggestedFilename()), "el archivo se llama como la encuesta (" + dl.suggestedFilename() + ")");
  const x1 = leerXlsx(f1); if (process.env.DEBUG_XL) console.log(JSON.stringify(x1.indices));
  check(JSON.stringify(x1.hojas) === JSON.stringify(["Léeme", "Índices", "Conexiones", "Matriz", "Respuestas", "Por pregunta"]), "Excel: seis hojas (Léeme, Índices, Conexiones, Matriz, Respuestas, Por pregunta)");
  check(x1.indices.length === 4 && x1.indices.slice(1).map((r) => r[0]).sort().join() === "Ana,Beto,Cami", "Excel: la hoja Índices solo trae a los 3 estudiantes de esa encuesta");
  const ana = x1.indices.find((r) => r[0] === "Ana");
  check(ana[2] === 2 && ana[3] === 2 && Math.abs(ana[8] - 1) < 1e-9, "Excel: Ana elige 2, recibe 2 y su Aceptación es 1 (100 %) como número");
  check(x1.respuestas.length === 1 + 7 && x1.respuestas.some((r) => r[3] === "Ana" && r[1] === "¿Con quién NO?" && r[5] === "Cami" && r[2] === "Negativa") && /^2025-11-0\d \d\d:\d\d/.test(x1.respuestas[1][7]), "Excel: una fila por elección (7) con pregunta, tipo, nombres y fecha");
  check(x1.leeme.some((l) => l.includes("CONFIDENCIAL")), "Excel: la hoja Léeme avisa que es confidencial");

  // ── Duplicar ──
  await boton(p, "Encuesta 2026", "Duplicar").click(); await p.waitForSelector("text=Copia de Encuesta 2026");
  const copia = await until(async () => (await lista("surveys")).find((s) => s.title === "Copia de Encuesta 2026"));
  check(!!copia && copia.status === "draft" && copia.questions.length === 3 && copia.questions.map((q) => q.text + q.tp).join() === Q.map((q) => q.text + q.tp).join(), "duplicar crea una copia en borrador con las mismas 3 preguntas");
  check(copia && copia.questions.every((q) => q.id && !Q.some((o) => o.id === q.id)) || (copia && new Set(copia.questions.map((q) => q.id)).size === 3), "con identificadores de pregunta propios");
  check(JSON.stringify(copia.groups) === '["5A"]' && !(await lista("responses")).some((r) => r.surveyId === copia.id), "con los mismos grupos y sin respuestas");
  check((await p.locator("text=Grupos de la encuesta").count()) >= 1, "se abre el panel de edición de la copia para cambiar título y grupos");
  // la copia se aplica a OTRO grupo (6A): se cambian los grupos y se activa
  const chip = (n) => p.locator("button[aria-pressed]").filter({ hasText: new RegExp(`^(✓ )?${n}$`) }).first();
  await chip("6A").click(); await chip("5A").click();
  check(!!(await until(async () => { const s = (await lista("surveys")).find((x) => x.id === copia.id); return JSON.stringify(s.groups) === '["6A"]' ? s : null; })), "se cambia la copia al grupo 6A");
  await boton(p, "Copia de Encuesta 2026", "Borrador").click();
  await until(async () => { const s = (await lista("surveys")).find((x) => x.id === copia.id); return s.status === "active" && (s.rosterIds || []).join() === "4,5"; });
  // ── Lo que ve cada estudiante ──
  const pub = async (id) => { const q = await (await b.newContext()).newPage(); await q.goto(`http://localhost:5184/?c=col-xl&survey=${id}`); await q.waitForSelector("text=¿Quién eres tú?", { timeout: 15000 }); return q; };
  let q = await pub(copia.id);
  const tc = (await q.innerText("body")).replace(/\s+/g, " ");
  check(tc.includes("Dani") && tc.includes("Eli") && !tc.includes("Ana"), "la copia aplicada a 6A muestra a Dani y Eli");
  await q.click("text=Dani"); await q.waitForTimeout(800);
  check(!(await q.innerText("body")).includes("Ya respondiste") && (await q.innerText("body")).includes("¿Con quién trabajarías?"), "Dani (que respondió la Encuesta 6A) SÍ puede responder esta otra encuesta");
  await q.close();
  q = await pub("s1"); await q.click("text=Ana"); await q.waitForSelector("text=Ya respondiste esta encuesta");
  check(true, "Ana, que ya respondió la Encuesta 2026, NO puede responderla otra vez (una respuesta por estudiante y encuesta)");
  await q.close();

  // ── La misma persona, el año siguiente, en otro grupo: es un registro nuevo y SÍ puede responder la misma encuesta ──
  await p.click("button:has-text('Grupos')"); await p.waitForSelector("text=Gestión de Grupos");
  await p.locator("xpath=//span[normalize-space()='6A']/../..//button[contains(.,'Agregar')]").first().click();
  await p.fill("input[placeholder='Nombre completo']", "Ana"); await p.locator("xpath=//input[@placeholder='Nombre completo']/following::button[1]").click();
  await p.waitForFunction(() => document.querySelectorAll("span").length > 0 && [...document.querySelectorAll("span")].filter((s) => s.textContent.trim() === "Ana").length >= 2);
  await p.click("button:has-text('Encuestas')"); await p.waitForSelector("text=Encuesta 2026");
  await p.locator("xpath=//span[normalize-space()='Encuesta 2026']/ancestor::div[.//button[contains(.,'Editar')]][1]//button[contains(.,'Editar')]").first().click();
  await p.locator("button[aria-pressed]").filter({ hasText: /^(✓ )?6A$/ }).first().click();
  await until(async () => { const s = (await lista("surveys")).find((x) => x.id === "s1"); return (s.rosterIds || []).length === 6 ? s : null; });
  q = await pub("s1");
  const filasAna = await q.locator("button:has-text('Ana')").count();
  check(filasAna === 2, "la encuesta aplicada a 5A y 6A lista dos «Ana»: la del año anterior y la nueva del grupo 6A");
  await q.locator("button:has-text('Ana')").nth(1).click(); await q.waitForTimeout(800);
  const nueva = (await q.innerText("body")).replace(/\s+/g, " ");
  check(!nueva.includes("Ya respondiste") && nueva.includes("¿Con quién trabajarías?"), "la Ana del grupo nuevo SÍ puede responder la misma encuesta (es un registro nuevo)");
  await q.close();
  q = await pub("s1"); await q.locator("button:has-text('Ana')").nth(0).click();
  check(!!(await q.locator("text=Ya respondiste esta encuesta").waitFor({ timeout: 8000 }).then(() => true).catch(() => false)), "mientras que la Ana que ya respondió sigue sin poder repetirla");
  await q.close();

  // ── Excel desde Reportes, por grupo ──
  await p.click("button:has-text('Reportes')"); await p.waitForSelector("text=Configurar reporte");
  await p.locator("button:has-text('6A')").first().click();
  const [dl2] = await Promise.all([p.waitForEvent("download"), p.locator("text=Índices, conexiones, matriz y una fila por respuesta").click()]);
  const f2 = join(tmp, dl2.suggestedFilename()); await dl2.saveAs(f2);
  const x2 = leerXlsx(f2);
  check(/_6A_/.test(dl2.suggestedFilename()) && x2.indices.slice(1).map((r) => r[0]).sort().join() === "Ana,Dani,Eli" && x2.respuestas.length === 1 + 2, "desde Reportes: el Excel del grupo 6A trae solo a sus 3 estudiantes (Ana nueva, Dani y Eli) y las 2 respuestas");
  check(x2.porPregunta.some((r) => r[0] === "Encuesta 6A"), "y la hoja «Por pregunta» menciona la encuesta");
  // ── Bitácora ──
  const acciones = await until(async () => { const a = (await lista("activity")).map((e) => e.action); return ["duplicó la encuesta", "exportó los resultados de la encuesta (Excel)", "exportó los resultados a Excel", "cambió los grupos de la encuesta"].every((x) => a.includes(x)) ? a : null; });
  check(!!acciones, "duplicar y exportar quedan en el registro de actividad");
  check(p.errs.length === 0, "sin errores de JavaScript" + (p.errs.length ? ": " + p.errs[0] : ""));

  // ── Solo lectura ──
  const ro = await login("ro@xl.co"); await ro.click("button:has-text('Encuestas')"); await ro.waitForSelector("text=Encuesta 2026");
  check(!(await ro.locator("button:has-text('Duplicar')").count()) && !(await ro.locator("button:has-text('Resultados (Excel)')").count()), "el usuario de solo lectura no ve «Duplicar» ni «Resultados (Excel)» en las encuestas");
} catch (e) { console.log("FALLÓ  excepción:", e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} comprobación(es) fallaron` : "\nTodo bien");
process.exit(failed ? 1 : 0);
