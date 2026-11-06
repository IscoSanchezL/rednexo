// Licencias en la aplicación: aviso por vencer, gracia (solo lectura), bloqueo y renovación por el superadmin.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDoc, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const DIA = 86400000;
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  for (const [cid, dias] of [["col-pv", 10], ["col-gr", -5], ["col-bl", -40]]) {
    await setDoc(doc(db, `colegios/${cid}`), { nombre: "Colegio " + cid, licencia: { plan: "basico", vence: Timestamp.fromMillis(Date.now() + dias * DIA), graciaDias: 15, maxEstudiantes: 1 } });
    await setDoc(doc(db, `colegios/${cid}/settings/global`), { colegio: "Colegio " + cid });
    await setDoc(doc(db, `colegios/${cid}/miembros/adm@${cid}.co`), { email: `adm@${cid}.co`, role: "admin", status: "active" });
    await setDoc(doc(db, `colegios/${cid}/groups/g1`), { id: "g1", name: "5A", color: "#a78bfa" });
    for (const [id, n] of [["1", "Ana"], ["2", "Beto"]]) await setDoc(doc(db, `colegios/${cid}/students/${id}`), { id, name: n, group: "5A", av: n[0] });
  }
});
const vence = async (cid) => { let v; await env.withSecurityRulesDisabled(async (x) => { v = (await getDoc(doc(x.firestore(), `colegios/${cid}`))).data().licencia.vence.toMillis(); }); return v; };
const vite = spawn("npx", ["vite", "--port", "5184", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
const entrar = async (email) => { const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); p.on("dialog", (d) => d.accept()); await p.goto("http://localhost:5184/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), email); return p; };
const texto = async (p) => (await p.innerText("body")).replace(/\s+/g, " ");
try {
  let p = await entrar("adm@col-pv.co"); await p.waitForSelector("text=Tu licencia vence", { timeout: 15000 });
  let t = await texto(p);
  check(/Tu licencia vence el .* \(en 10 días\)/.test(t), "por vencer: el administrador ve el aviso con los días que faltan");
  check(/Tu plan incluye hasta 1 estudiantes y hay 2/.test(t), "superar el tope de estudiantes solo avisa (no bloquea)");
  await p.click("button:has-text('Grupos')"); t = await texto(p);
  check(!/solo lectura/i.test(t), "por vencer: sigue pudiendo editar");

  p = await entrar("adm@col-gr.co"); await p.waitForSelector("text=periodo de gracia", { timeout: 15000 });
  t = await texto(p);
  check(/periodo de gracia, solo lectura, \d+ días más/.test(t), "gracia: aviso rojo de solo lectura");
  await p.click("button:has-text('Encuestas')");
  check(await p.locator("button:has-text('+ Nueva Encuesta')").count() === 0, "gracia: no puede crear encuestas");

  p = await entrar("adm@col-bl.co"); await p.waitForSelector("text=Licencia vencida", { timeout: 15000 });
  t = await texto(p);
  check(/Licencia vencida/.test(t) && !t.includes("Dashboard"), "bloqueado: solo ve «Licencia vencida», sin entrar a los datos");

  p = await entrar("franksanlo@gmail.com"); await p.waitForSelector("text=Elige tu colegio", { timeout: 15000 });
  t = await texto(p);
  check(/Básico · vencida/.test(t) && /Básico · en gracia/.test(t), "superadmin: ve el estado de licencia de cada colegio");
  const antes = await vence("col-bl");
  const tarjeta = p.locator("div", { has: p.locator("text=Colegio col-bl") }).filter({ has: p.locator("button:has-text('Renovar 12 meses')") }).last();
  await tarjeta.locator("button:has-text('Renovar 12 meses')").click();
  await new Promise((r) => setTimeout(r, 2500));
  const despues = await vence("col-bl");
  check(despues > Date.now() + 360 * DIA && despues > antes, "superadmin: «Renovar 12 meses» deja la licencia a un año desde hoy");
  // Elegir plan: se ajustan tope y costo solos
  await p.locator("select").filter({ has: p.locator("option", { hasText: "Elegir plan" }) }).nth(0).selectOption("plus");
  await new Promise((r) => setTimeout(r, 2500));
  let lic; await env.withSecurityRulesDisabled(async (x) => { lic = (await getDoc(doc(x.firestore(), "colegios/col-bl"))).data().licencia; });
  const ids = ["col-bl", "col-gr", "col-pv"];
  const algunoPlus = []; for (const id of ids) await env.withSecurityRulesDisabled(async (x) => { algunoPlus.push((await getDoc(doc(x.firestore(), `colegios/${id}`))).data().licencia); });
  check(algunoPlus.some((l) => l.plan === "plus" && l.maxEstudiantes === 1500 && l.precio === 4900000), "al elegir el plan Plus se ajustan solos el máximo de estudiantes (1500) y el costo ($4.900.000)");
  p = await entrar("adm@col-bl.co"); await p.waitForSelector("text=Dashboard", { timeout: 15000 });
  check(true, "tras renovar, el colegio bloqueado vuelve a entrar");
  await p.click("button:has-text('Config')"); await p.waitForSelector("text=Costo anual", { timeout: 8000 });
  t = await texto(p);
  check(/plan .*estudiantes .*costo anual .*vigencia/i.test(t), "el administrador ve su plan, tope, costo y vigencia en Config");
} catch (e) { console.log("FALLÓ  excepción: " + e.message); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} fallo(s)` : "\nLicencias OK"); process.exit(failed ? 1 : 0);
