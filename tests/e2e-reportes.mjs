// Reportes: los tres tipos se diferencian, vista previa = HTML = PDF, y los nombres no pueden inyectar código.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const colegio = async (db, cid, email, names, R) => {
  await setDoc(doc(db, `colegios/${cid}`), { nombre: cid }); await setDoc(doc(db, `colegios/${cid}/settings/global`), { colegio: cid });
  await setDoc(doc(db, `colegios/${cid}/miembros/${email}`), { email, role: "psychologist", status: "active" });
  await setDoc(doc(db, `colegios/${cid}/groups/g1`), { id: "g1", name: "Grupo Prueba", color: "#a78bfa" });
  for (const [i, n] of names.entries()) await setDoc(doc(db, `colegios/${cid}/students/${i + 1}`), { id: String(i + 1), name: n, group: "Grupo Prueba", av: n.slice(0, 1) });
  await setDoc(doc(db, `colegios/${cid}/surveys/sv1`), { id: "sv1", title: "S", status: "active", group: "Grupo Prueba", groups: ["Grupo Prueba"], maxSel: 5, anon: true, createdAt: Timestamp.now(), rosterIds: names.map((_, i) => String(i + 1)), roster: [], questions: [{ id: "p", text: "p", tp: "pos" }, { id: "n", text: "n", tp: "neu" }, { id: "g", text: "g", tp: "neg" }] });
  for (const [id, answers] of Object.entries(R)) await setDoc(doc(db, `colegios/${cid}/responses/sv1_${id}`), { surveyId: "sv1", respondentId: id, respondentName: "x", answers });
};
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await colegio(db, "col-rep", "a@rep.co", ["Isco", "Isco1", "Isco2", "Milena"], {
    1: { p: ["2"], n: ["2", "3"], g: ["3"] }, 2: { p: ["1", "3"], n: ["1", "3"], g: ["3"] }, 3: { p: ["2"], n: ["2"], g: ["1"] }, 4: { p: ["1", "2"], n: ["1", "2"], g: ["3"] },
  });
  await colegio(db, "col-xss", "b@rep.co", ['Eve<img src=x onerror=window.__pwned=1>', "Beto"], { 1: { p: ["2"] }, 2: { p: ["1"], g: ["1"] } });
});

const vite = spawn("npx", ["vite", "--port", "5188", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
const login = async (email) => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage(); p.ctx = ctx;
  const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.errs = errs; p.on("dialog", (d) => d.accept());
  await p.goto("http://localhost:5188/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), email);
  await p.waitForSelector("text=Dashboard", { timeout: 15000 }); await p.click("button:has-text('Reportes')"); await p.waitForSelector("text=Configurar reporte"); return p;
};
const secciones = (html) => [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1]);
const preview = async (p) => { if (!(await p.locator("iframe").count())) await p.locator("text=Explora los datos en pantalla").click(); await p.waitForSelector("iframe"); return p.locator("iframe").getAttribute("srcdoc"); };
const tipo = (p, t) => p.locator(`button:has-text('${t}')`).first().click();
try {
  const p = await login("a@rep.co");
  let t = (await p.innerText("body")).replace(/\s+/g, " ");
  check(t.includes("una ficha por persona"), "al elegir «Individual» se explica qué incluye");
  let h = await preview(p);
  check(JSON.stringify(secciones(h)) === JSON.stringify(["Resumen", "Índices individuales", "Fichas por estudiante"]), "Individual: Resumen, Índices individuales y Fichas (sin Grupos ni Matriz)");
  check(/Aislados — nadie los eligió positivamente \(1\):<\/b> Milena/.test(h) && /Reporte Individual/.test(h), "Individual: Milena aparece como aislada aunque eligió a 3 compañeros");
  const marco = p.frameLocator("iframe");
  check(await marco.locator("text=Fichas por estudiante").count() === 1 && await marco.locator(".ficha").count() === 4, "la vista previa muestra de verdad el documento (4 fichas)");
  await tipo(p, "Grupal"); await p.waitForTimeout(400); h = await preview(p);
  check(JSON.stringify(secciones(h)) === JSON.stringify(["Resumen", "Grupos"]) && /Reporte Grupal/.test(h), "Grupal: solo Resumen y Grupos");
  check(!["Isco", "Isco1", "Isco2", "Milena"].some((n) => h.includes(n)), "Grupal: no contiene ningún nombre de estudiante");
  await tipo(p, "Completo"); await p.waitForTimeout(400); h = await preview(p);
  check(JSON.stringify(secciones(h)) === JSON.stringify(["Resumen", "Índices individuales", "Grupos", "Matriz sociométrica", "Fichas por estudiante"]) && /Reporte Completo/.test(h), "Completo: las cinco secciones y la cabecera dice «Completo» (antes decía «Grupal»)");
  check(/<td class="mut">1<\/td>/.test(h) && />2<\/div><div class="lbl">Mutuas positivas</.test(h), "las mutuas cuentan solo las positivas (2, no 3)");
  // HTML descargado = vista previa
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 10000 }), p.locator("text=Archivo HTML completo").click()]);
  const archivo = readFileSync(await dl.path(), "utf8");
  check(/^reporte_rednexo_Completo_Todos_los_grupos\.html$/.test(dl.suggestedFilename()), "el HTML se descarga con un nombre claro (" + dl.suggestedFilename() + ")");
  check(JSON.stringify(secciones(archivo)) === JSON.stringify(secciones(h)) && !archivo.includes("window.print"), "el HTML descargado tiene las mismas secciones que la vista previa");
  // PDF
  const [pop] = await Promise.all([p.ctx.waitForEvent("page", { timeout: 10000 }), p.locator("text=Abre una ventana lista para imprimir").click()]);
  await pop.waitForSelector("text=Fichas por estudiante");
  check(await pop.locator("button:has-text('Imprimir / PDF')").count() === 1 && (await pop.locator("h2").allInnerTexts()).length === 5, "el PDF abre una ventana con el botón de imprimir y las mismas 5 secciones");
  await pop.close();
  check(p.errs.length === 0, "sin errores de JavaScript" + (p.errs.length ? ": " + p.errs[0] : ""));

  // Un nombre con HTML no puede ejecutar código
  const x = await login("b@rep.co");
  await tipo(x, "Completo"); const hx = await preview(x);
  check(hx.includes("Eve&lt;img src=x onerror=window.__pwned=1&gt;") && !hx.includes("<img src=x"), "un nombre con HTML se escapa en el reporte");
  const [pop2] = await Promise.all([x.ctx.waitForEvent("page"), x.locator("text=Abre una ventana lista para imprimir").click()]);
  await pop2.waitForSelector("text=Fichas por estudiante"); await pop2.waitForTimeout(800);
  check((await pop2.evaluate(() => window.__pwned)) === undefined && await pop2.locator("img[src=x]").count() === 0, "en la ventana del PDF no se ejecuta ni se inserta el código del nombre");
  check((await pop2.innerText("body")).includes("Eve<img src=x onerror=window.__pwned=1>"), "el nombre se ve literal, como texto");
} catch (e) { console.log("FALLÓ  excepción:", e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} comprobación(es) fallaron` : "\nTodo bien");
process.exit(failed ? 1 : 0);
