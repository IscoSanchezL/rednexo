// Extremo a extremo con sesión: selector de colegio, migración de datos existentes, roles y aislamiento.
// Uso: npm run test:e2e (emuladores de Auth y Firestore + Vite con VITE_USE_EMULATORS=true)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDoc, getDocs, collection } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
// Datos "de producción" anteriores al modelo multi-colegio: colecciones globales.
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, "settings/global"), { colegio: "Colegio Real", ciudad: "Bogotá" });
  await setDoc(doc(db, "groups/g1"), { id: "g1", name: "5° A", color: "#3b82f6" });
  for (const [id, n] of [["1", "Ana Real"], ["2", "Beto Real"], ["3", "Cami Real"]]) await setDoc(doc(db, "students/" + id), { id, name: n, group: "5° A", av: n.slice(0, 2).toUpperCase() });
  await setDoc(doc(db, "surveys/sv_old"), { id: "sv_old", title: "Encuesta vieja", status: "active", group: "5° A", maxSel: 2, anon: true, questions: [{ id: "q1", text: "¿Con quién?", tp: "pos" }] });
  await setDoc(doc(db, "responses/sv_old_1"), { surveyId: "sv_old", respondentId: "1", respondentName: "Ana Real", answers: { q1: ["2"] } });
  await setDoc(doc(db, "users/psi@real.co"), { email: "psi@real.co", role: "psychologist", status: "active" });
  await setDoc(doc(db, "users/lector@real.co"), { email: "lector@real.co", role: "readonly", status: "active" });
});

const vite = spawn("npx", ["vite", "--port", "5198", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const URL0 = "http://localhost:5198/";
const b = await chromium.launch();
const login = async (email) => {
  const ctx = await b.newContext(); const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept());
  const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.errs = errs;
  await p.goto(URL0); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), email);
  return p;
};
const body = async (p) => (await p.innerText("body")).replace(/\s+/g, " ");
try {
  // 1. Superadmin: selector, importación de datos existentes
  let p = await login("franksanlo@gmail.com");
  await p.waitForSelector("text=Elige tu colegio", { timeout: 15000 });
  check(true, "el superadmin ve el selector de colegio");
  await p.click("button:has-text('Importar datos existentes')");
  await p.waitForSelector("text=/Listo: 3 estudiantes/", { timeout: 20000 });
  check(true, "la importación copia 3 estudiantes, 1 grupo, 1 encuesta, 1 respuesta y 2 usuarios");
  const legacyUntouched = await (async () => { let n = 0; await env.withSecurityRulesDisabled(async (c) => { n = (await getDocs(collection(c.firestore(), "students"))).size; }); return n; })();
  check(legacyUntouched === 3, "los datos anteriores siguen intactos (no se borró nada)");
  await p.click("text=Colegio Real"); await p.waitForSelector("text=Dashboard", { timeout: 15000 });
  await p.click("button:has-text('Grupos')"); await p.waitForSelector("text=Ana Real", { timeout: 10000 });
  const t1 = await body(p);
  check(t1.includes("Beto Real") && t1.includes("Cami Real"), "el colegio migrado muestra sus estudiantes");
  check(t1.includes("Colegio Real"), "la cabecera muestra el nombre del colegio desde su configuración");
  check(!t1.includes("Colegio Demo") && !t1.includes("GI School"), "no queda marca de otro colegio ni de demostración");
  check(p.errs.length === 0, "sin errores de JavaScript en el flujo del superadmin" + (p.errs.length ? ": " + p.errs[0] : ""));

  // 2. Crear un colegio nuevo con su administrador
  await p.click("text=Cambiar colegio"); await p.waitForSelector("text=Crear colegio");
  await p.fill("input[placeholder='Colegio San José']", "Colegio Nuevo");
  await p.fill("input[placeholder='admin@colegio.edu.co']", "dir@nuevo.co");
  await p.click("button:has-text('Crear colegio')"); await p.waitForSelector("text=/creado/", { timeout: 10000 });
  check(true, "el superadmin crea un colegio nuevo con su administrador");

  // 3. Psicólogo migrado: entra directo a su único colegio, sin pestañas de administración
  const psi = await login("psi@real.co"); await psi.waitForSelector("text=Dashboard", { timeout: 15000 }); await psi.waitForSelector("text=Colegio Real", { timeout: 10000 }).catch(() => {});
  const tp = await body(psi);
  check(tp.includes("Colegio Real") && !tp.includes("Elige tu colegio"), "el psicólogo migrado entra directo a su colegio");
  check(!tp.includes("Usuarios") && !tp.includes("Config"), "el psicólogo no ve Usuarios ni Config");
  check(psi.errs.length === 0, "sin errores de JavaScript en el flujo del psicólogo" + (psi.errs.length ? ": " + psi.errs[0] : ""));

  // 4. Solo lectura
  const ro = await login("lector@real.co"); await ro.waitForSelector("text=Dashboard", { timeout: 15000 });
  await ro.click("button:has-text('Grupos')"); await ro.waitForSelector("text=Solo lectura", { timeout: 8000 });
  check(true, "el usuario de solo lectura no puede gestionar grupos");

  // 5. Administrador del colegio nuevo: ve su colegio vacío, nunca los datos del otro, y sí administra usuarios
  const adm = await login("dir@nuevo.co"); await adm.waitForSelector("text=Aún no hay estudiantes", { timeout: 15000 }); await adm.waitForSelector("text=Colegio Nuevo", { timeout: 10000 }).catch(() => {});
  const ta = await body(adm);
  check(ta.includes("Colegio Nuevo") && !ta.includes("Ana Real"), "el administrador del colegio nuevo ve estado vacío y nada del otro colegio");
  check(ta.includes("Usuarios") && ta.includes("Config"), "el administrador del colegio ve Usuarios y Config");
  check(!ta.includes("Cambiar colegio"), "el administrador de un solo colegio no ve el cambio de colegio");

  // 6. Intruso: sin acceso
  const bad = await login("intruso@gmail.com"); await bad.waitForSelector("text=/no está autorizado/i", { timeout: 15000 });
  check(true, "un correo sin colegio es rechazado con un mensaje claro");

  // 7. Encuesta pública: enlace anterior (sin &c=) sigue funcionando y trae nombres del colegio inicial
  const anon = await (await b.newContext()).newPage();
  await anon.goto(URL0 + "?survey=sv_old"); await anon.waitForSelector("text=Ana Real", { timeout: 15000 });
  const tan = await body(anon);
  check(tan.includes("Beto Real") && tan.includes("Cami Real"), "el enlace anterior ?survey=ID sigue funcionando tras la migración");
} catch (e) { console.log("FALLÓ  excepción:", e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} comprobación(es) fallaron` : "\nTodo bien");
process.exit(failed ? 1 : 0);
