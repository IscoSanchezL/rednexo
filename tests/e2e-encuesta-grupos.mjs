// Grupos de una encuesta: lo que eliges es lo que ven los estudiantes (también para encuestas con datos contradictorios).
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDoc, getDocs, collection, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const QS = [{ id: "qp", text: "¿Con quién trabajarías?", tp: "pos" }];
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore(), cid = "col-g2";
  await setDoc(doc(db, `colegios/${cid}`), { nombre: "Colegio G2" }); await setDoc(doc(db, `colegios/${cid}/settings/global`), { colegio: "Colegio G2" });
  await setDoc(doc(db, `colegios/${cid}/miembros/psi@g2.co`), { email: "psi@g2.co", role: "psychologist", status: "active" });
  await setDoc(doc(db, `colegios/${cid}/groups/g1`), { id: "g1", name: "Grupo Prueba", color: "#a78bfa" });
  await setDoc(doc(db, `colegios/${cid}/groups/g2`), { id: "g2", name: "Grupo Prueba 1", color: "#2dd4bf" });
  const est = [["1", "Isco", "Grupo Prueba"], ["2", "Milena", "Grupo Prueba"], ["3", "pacho", "Grupo Prueba 1"], ["4", "pacho1", "Grupo Prueba 1"], ["5", "pacho2", "Grupo Prueba 1"], ["6", "pacho3", "Grupo Prueba 1"]];
  for (const [id, name, group] of est) await setDoc(doc(db, `colegios/${cid}/students/${id}`), { id, name, group, av: name[0].toUpperCase() });
  // El estado del error: se eligió «Grupo Prueba 1» en el selector antiguo, pero la lista de grupos quedó con «Grupo Prueba»
  const rosterViejo = [est[0], est[1]].map(([id, name, group]) => ({ id, name, group, av: name[0].toUpperCase() }));
  await setDoc(doc(db, `colegios/${cid}/surveys/sv_bug`), { id: "sv_bug", title: "Encuesta prueba1", status: "active", group: "Grupo Prueba 1", groups: ["Grupo Prueba"], maxSel: 3, anon: true, createdAt: Timestamp.now(), questions: QS, roster: rosterViejo, rosterIds: ["1", "2"], colegioNombre: "Colegio G2" });
  await setDoc(doc(db, `colegios/${cid}/surveys/sv_borrador`), { id: "sv_borrador", title: "Borrador mixto", status: "draft", group: "Grupo Prueba 1", groups: ["Grupo Prueba"], maxSel: 3, anon: true, createdAt: Timestamp.now(), questions: QS });
});
const survey = async (id) => { let d = null; await env.withSecurityRulesDisabled(async (c) => { d = (await getDoc(doc(c.firestore(), `colegios/col-g2/surveys/${id}`))).data(); }); return d; };
const until = async (fn, ms = 10000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 250)); } };
const ids = (s) => (s.rosterIds || []).slice().sort().join(",");

const vite = spawn("npx", ["vite", "--port", "5185", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
const publica = async () => {
  const p = await (await b.newContext()).newPage();
  await p.goto("http://localhost:5185/?c=col-g2&survey=sv_bug"); await p.waitForSelector("text=¿Quién eres tú?", { timeout: 15000 });
  return { p, t: (await p.innerText("body")).replace(/\s+/g, " ") };
};
try {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept());
  await p.goto("http://localhost:5185/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), "psi@g2.co");
  await p.waitForSelector("text=Dashboard", { timeout: 15000 }); await p.click("button:has-text('Encuestas')"); await p.waitForSelector("text=Encuesta prueba1");

  // 1. Datos contradictorios: se corrigen solos
  const fix = await until(async () => { const s = await survey("sv_bug"); return JSON.stringify(s.groups) === '["Grupo Prueba 1"]' && ids(s) === "3,4,5,6" ? s : null; });
  check(!!fix, "una encuesta con grupos contradictorios se corrige sola: queda en «Grupo Prueba 1» y con la lista de ese grupo");
  const bor = await until(async () => { const s = await survey("sv_borrador"); return JSON.stringify(s.groups) === '["Grupo Prueba 1"]' ? s : null; });
  check(!!bor, "también se corrige la encuesta en borrador");
  let t = (await p.innerText("body")).replace(/\s+/g, " ");
  check(t.includes("👥 Grupo Prueba 1") && !t.includes("👥 Grupo Prueba,"), "la tarjeta muestra el grupo correcto");
  // 2. Lo que ven los estudiantes
  let { p: pub, t: tp } = await publica();
  check(["pacho", "pacho1", "pacho2", "pacho3"].every((n) => tp.includes(n)) && !tp.includes("Isco") && !tp.includes("Milena") && tp.includes("4 participantes"), "los estudiantes ven a pacho, pacho1, pacho2 y pacho3; ya no a Isco ni a Milena");
  await pub.close();

  // 3. El panel de edición cambia de verdad los grupos
  await p.locator("xpath=//span[normalize-space()='Encuesta prueba1']/ancestor::div[.//button[contains(.,'Editar')]][1]//button[contains(.,'Editar')]").first().click();
  const chip = (nombre) => p.locator("button[aria-pressed]").filter({ hasText: new RegExp(`^(✓ )?${nombre}$`) }).first();
  check((await chip("Grupo Prueba 1").getAttribute("aria-pressed")) === "true" && (await chip("Grupo Prueba").getAttribute("aria-pressed")) === "false", "el panel muestra marcado solo «Grupo Prueba 1»");
  await chip("Grupo Prueba").click();
  check(!!(await until(async () => { const s = await survey("sv_bug"); return s.groups.length === 2 && s.group === "Grupo Prueba 1" && ids(s) === "1,2,3,4,5,6" ? s : null; })), "al agregar «Grupo Prueba» la encuesta pasa a los 6 estudiantes");
  ({ p: pub, t: tp } = await publica());
  check(tp.includes("6 participantes") && tp.includes("Isco") && tp.includes("pacho3"), "y los estudiantes ven a los 6");
  await pub.close();
  await chip("Grupo Prueba 1").click();
  check(!!(await until(async () => { const s = await survey("sv_bug"); return JSON.stringify(s.groups) === '["Grupo Prueba"]' && s.group === "Grupo Prueba" && ids(s) === "1,2" ? s : null; })), "al quitar «Grupo Prueba 1» quedan solo Isco y Milena (group y groups cambian juntos)");
  await chip("Grupo Prueba").click();                                                      // intentar dejar la encuesta sin grupos
  await p.waitForTimeout(800);
  check(JSON.stringify((await survey("sv_bug")).groups) === '["Grupo Prueba"]', "no se puede quitar el último grupo de una encuesta");
  await chip("Grupo Prueba 1").click(); await chip("Grupo Prueba").click();
  check(!!(await until(async () => { const s = await survey("sv_bug"); return JSON.stringify(s.groups) === '["Grupo Prueba 1"]' && ids(s) === "3,4,5,6" ? s : null; })), "se vuelve a dejar solo «Grupo Prueba 1»");

  // 4. Un estudiante nuevo en el grupo aparece sin tocar la encuesta
  await p.click("button:has-text('Grupos')");
  await p.locator("xpath=//span[normalize-space()='Grupo Prueba 1']/../..//button[contains(.,'Agregar')]").first().click();
  await p.fill("input[placeholder='Nombre completo']", "pacho4"); await p.locator("xpath=//input[@placeholder='Nombre completo']/following::button[1]").click(); await p.waitForSelector("text=pacho4");
  check(!!(await until(async () => ids(await survey("sv_bug")) === "3,4,5,6,7" || (await survey("sv_bug")).rosterIds.length === 5)), "un estudiante nuevo del grupo entra solo a la lista de la encuesta activa");
  ({ p: pub, t: tp } = await publica());
  check(tp.includes("pacho4") && tp.includes("5 participantes"), "y los estudiantes ya lo ven");
  await pub.close();
  // 5. Bitácora y errores
  await p.click("button:has-text('Encuestas')");
  check(errs.length === 0, "sin errores de JavaScript" + (errs.length ? ": " + errs[0] : ""));
} catch (e) { console.log("FALLÓ  excepción:", e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} comprobación(es) fallaron` : "\nTodo bien");
process.exit(failed ? 1 : 0);
