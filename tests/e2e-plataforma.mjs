// Gestión de plataforma con navegador real: exportar, suspender, superadmins, bitácora y eliminar.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDocs, getDoc, collection } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  for (const [cid, nom] of [["colegio-a", "Colegio A"], ["colegio-b", "Colegio B"]]) {
    await setDoc(doc(db, `colegios/${cid}`), { nombre: nom });
    await setDoc(doc(db, `colegios/${cid}/settings/global`), { colegio: nom });
    await setDoc(doc(db, `colegios/${cid}/miembros/psi@${cid.slice(-1)}.co`), { email: `psi@${cid.slice(-1)}.co`, role: "psychologist", status: "active" });
    await setDoc(doc(db, `colegios/${cid}/groups/g1`), { id: "g1", name: "5A" });
    for (const [i, n] of [["1", "Ana " + nom], ["2", "Beto " + nom]]) await setDoc(doc(db, `colegios/${cid}/students/${i}`), { id: i, name: n, group: "5A" });
  }
  await setDoc(doc(db, "colegios/colegio-a/surveys/sv1"), { id: "sv1", status: "active", questions: [{ id: "q1", text: "¿?", tp: "pos" }], rosterIds: ["1", "2"], roster: [{ id: "1", name: "Ana Colegio A", group: "5A" }, { id: "2", name: "Beto Colegio A", group: "5A" }], colegioNombre: "Colegio A" });
});

const vite = spawn("npx", ["vite", "--port", "5197", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const URL0 = "http://localhost:5197/";
const b = await chromium.launch();
const login = async (email) => {
  const ctx = await b.newContext({ acceptDownloads: true }); const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept());
  const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.errs = errs;
  await p.goto(URL0); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), email);
  return p;
};
const body = async (p) => (await p.innerText("body")).replace(/\s+/g, " ");
const audit = async () => { let out = []; await env.withSecurityRulesDisabled(async (c) => { out = (await getDocs(collection(c.firestore(), "auditoria"))).docs.map((d) => d.data()); }); return out; };
const count = async (path) => { let n = -1; await env.withSecurityRulesDisabled(async (c) => { n = (await getDocs(collection(c.firestore(), path))).size; }); return n; };
try {
  const root = await login("franksanlo@gmail.com");
  await root.waitForSelector("text=Colegio A", { timeout: 15000 });
  check((await body(root)).includes("Colegio B"), "la cuenta raíz ve todos los colegios");

  // Exportar
  const [dl] = await Promise.all([root.waitForEvent("download", { timeout: 15000 }), root.locator("button:has-text('Exportar')").nth(0).click()]);
  const pack = JSON.parse(readFileSync(await dl.path(), "utf8"));
  check(pack.formato === "rednexo-export-v1" && pack.colegio.id === "colegio-a" && pack.conteos.students === 2 && pack.datos.surveys.length === 1, "exportar descarga un JSON completo del colegio (" + dl.suggestedFilename() + ")");
  check(JSON.stringify(pack).includes("Ana Colegio A") && !JSON.stringify(pack).includes("Colegio B"), "la exportación trae sus datos y nada de otro colegio");

  // Suspender: el psicólogo queda bloqueado y la encuesta pública también
  await root.locator("button:has-text('Suspender')").nth(0).click();
  await root.waitForSelector("text=SUSPENDIDO", { timeout: 10000 });
  check(true, "el superadmin suspende un colegio y lo ve marcado");
  const psi = await login("psi@a.co"); await psi.waitForSelector("text=Acceso suspendido", { timeout: 15000 });
  check(!(await body(psi)).includes("Ana Colegio A"), "el psicólogo del colegio suspendido no entra ni ve sus datos");
  const anon = await (await b.newContext()).newPage(); await anon.goto(URL0 + "?c=colegio-a&survey=sv1"); await anon.waitForSelector("text=Encuesta no disponible", { timeout: 15000 });
  check(true, "la encuesta pública del colegio suspendido deja de estar disponible");
  const psiB = await login("psi@b.co"); await psiB.waitForSelector("text=Dashboard", { timeout: 15000 });
  check(true, "el otro colegio sigue funcionando con normalidad");

  // Reactivar
  await root.locator("button:has-text('Reactivar')").nth(0).click();
  await root.waitForFunction(() => !document.body.innerText.includes("SUSPENDIDO"), null, { timeout: 10000 });
  const psi2 = await login("psi@a.co"); await psi2.waitForSelector("text=Dashboard", { timeout: 15000 });
  check(true, "al reactivar, el psicólogo vuelve a entrar");

  // Superadmin adicional
  await root.fill("input[placeholder='nombre@iskonex.co']", "dueno@iskonex.co");
  await root.click("button:has-text('Agregar')"); await root.waitForSelector("text=dueno@iskonex.co", { timeout: 10000 });
  check(true, "la raíz agrega un superadmin adicional");
  const sa = await login("dueno@iskonex.co"); await sa.waitForSelector("text=Colegio A", { timeout: 15000 });
  const tsa = await body(sa);
  check(tsa.includes("Superadmin") && tsa.includes("Colegio B"), "el superadmin adicional ve todos los colegios");
  check(!(await sa.locator("input[placeholder='nombre@iskonex.co']").count()), "el superadmin adicional no puede administrar superadmins (solo la raíz)");
  await sa.locator("button", { hasText: "Colegio A" }).first().click(); await sa.waitForSelector("text=Dashboard", { timeout: 15000 });
  check(true, "el superadmin adicional entra a un colegio del que no es miembro");

  // Bitácora
  await new Promise((r) => setTimeout(r, 1500));
  const acciones = (await audit()).map((a) => a.accion);
  for (const a of ["exportar", "suspender", "reactivar", "superadmin_agregar", "acceso_soporte"]) check(acciones.includes(a), `la bitácora registra «${a}»`);

  // Eliminar: exige exportación marcada + id exacto
  await root.bringToFront(); await root.reload(); await root.waitForSelector("text=Colegio A", { timeout: 15000 });
  await root.locator("button:has-text('Eliminar')").nth(0).click();
  const del = root.locator("button:has-text('Eliminar definitivamente')");
  check(await del.isDisabled(), "eliminar está bloqueado hasta confirmar");
  await root.check("input[type=checkbox]"); await root.fill("input[placeholder='colegio-a']", "colegio-x");
  check(await del.isDisabled(), "con un identificador incorrecto sigue bloqueado");
  await root.fill("input[placeholder='colegio-a']", "colegio-a");
  check(!(await del.isDisabled()), "con la exportación marcada y el identificador exacto se habilita");
  await del.click(); await root.waitForSelector("text=/eliminado \\(/", { timeout: 20000 });
  check((await count("colegios/colegio-a/students")) === 0 && (await count("colegios/colegio-a/miembros")) === 0 && (await count("colegios/colegio-a/settings")) === 0, "el colegio eliminado no deja datos (estudiantes, miembros ni ajustes)");
  let aExiste = true; await env.withSecurityRulesDisabled(async (c) => { aExiste = (await getDoc(doc(c.firestore(), "colegios/colegio-a"))).exists(); });
  check(!aExiste, "el documento del colegio también se elimina");
  check((await count("colegios/colegio-b/students")) === 2, "el otro colegio queda intacto");
  check((await audit()).some((a) => a.accion === "eliminar" && a.colegio === "colegio-a"), "la eliminación queda en la bitácora (que no se borra)");
} catch (e) { console.log("FALLÓ  excepción:", e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} comprobación(es) fallaron` : "\nTodo bien");
process.exit(failed ? 1 : 0);
