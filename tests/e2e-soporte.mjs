// Botón «Soporte»: solo en el panel y en el login, nunca en la encuesta pública; con token y contexto mínimo.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc } from "firebase/firestore";
import { spawn } from "node:child_process";
import http from "node:http";

// «Soporte» falso: guarda lo que la app le configura, para comprobarlo.
const pedidos = [];
const servidor = http.createServer((req, res) => {
  pedidos.push(req.url);
  res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Content-Type", "application/javascript");
  res.end(`window.__soporte = { configs: [], abiertos: [] }; window.IskonexSoporte = { configure(o) { window.__soporte.configs.push(o); }, open(p) { window.__soporte.abiertos.push(p || null); } };`);
}).listen(5170);

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, "colegios/col-sp"), { nombre: "Colegio SP" }); await setDoc(doc(db, "colegios/col-sp/settings/global"), { colegio: "Colegio SP" });
  await setDoc(doc(db, "colegios/col-sp/miembros/psi@sp.co"), { email: "psi@sp.co", role: "psychologist", status: "active" });
  await setDoc(doc(db, "colegios/col-sp/students/1"), { id: "1", name: "Estudiante Secreto", group: "5A", av: "ES" });
});
const vite = spawn("npx", ["vite", "--port", "5188", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true", VITE_SOPORTE_URL: "http://localhost:5170" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const until = async (fn, ms = 10000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 200)); } };
const b = await chromium.launch();
try {
  // 1) Encuesta pública: ni script ni botón
  const pub = await (await b.newContext()).newPage();
  await pub.goto("http://localhost:5188/?c=col-sp&survey=no-existe"); await pub.waitForTimeout(2500);
  check(pedidos.length === 0, "en la encuesta pública (?survey=) no se descarga el script de soporte");
  check(!(await pub.evaluate(() => !!window.IskonexSoporte)) && (await pub.locator("button:has-text('Soporte')").count()) === 0, "…y no hay botón «Soporte»");
  await pub.close();

  // 2) Pantalla de inicio de sesión: sin token
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:5188/"); await p.waitForSelector("text=Continuar con Google");
  await until(() => p.evaluate(() => window.__soporte?.configs.length > 0));
  let cfg = await p.evaluate(() => { const c = window.__soporte.configs.at(-1); return { user: c.user, token: c.getIdToken, notice: c.notice, ctx: c.context(), version: c.version }; });
  check(cfg.user === null && cfg.token === null, "en el login se configura sin usuario y sin token");
  check(cfg.notice === "No escriba nombres de estudiantes ni datos personales de menores en este mensaje.", "el aviso sobre datos de menores está configurado");
  check(JSON.stringify(cfg.ctx) === JSON.stringify({ rol: "sin sesión", colegio: "" }), "contexto sin sesión: solo «sin sesión»");
  check(/^\d+\.\d+\.\d+ · \d{4}-\d{2}-\d{2}$/.test(cfg.version), "la versión (número y fecha) viaja con el ticket: " + cfg.version);
  await p.click("text=¿No puedes entrar?");
  check(JSON.stringify(await p.evaluate(() => window.__soporte.abiertos.at(-1))) === JSON.stringify({ type: "acceso" }), "«¿No puedes entrar?» abre el formulario con el tipo «No puedo entrar»");

  // 3) Con sesión: verificado y contexto mínimo
  await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), "psi@sp.co");
  await p.waitForSelector("text=Dashboard", { timeout: 15000 });
  await until(() => p.evaluate(() => window.__soporte.configs.at(-1)?.user?.email === "psi@sp.co" && window.__soporte.configs.at(-1).context().colegio === "Colegio SP"));
  const s = await p.evaluate(async () => { const c = window.__soporte.configs.at(-1); const t = await c.getIdToken(); return { user: c.user, tokenOk: typeof t === "string" && t.split(".").length === 3, ctx: c.context() }; });
  check(s.user.email === "psi@sp.co", "con sesión se envía el correo de quien escribe");
  check(s.tokenOk, "getIdToken devuelve el token de Firebase (el ticket llega verificado)");
  check(JSON.stringify(s.ctx) === JSON.stringify({ rol: "psychologist", colegio: "Colegio SP" }), "el contexto es solo el rol y el colegio");
  check(!JSON.stringify(s).includes("Secreto"), "ningún dato de estudiantes viaja al soporte");
  await p.locator("header button:has-text('Soporte')").click();
  check((await p.evaluate(() => window.__soporte.abiertos.length)) === 2, "el botón «❓ Soporte» de la cabecera abre el formulario");

  // 4) Cerrar sesión: se limpia
  await p.click("button:has-text('Salir')");
  await p.waitForSelector("text=Continuar con Google");
  check(!!(await until(() => p.evaluate(() => window.__soporte.configs.at(-1).user === null))), "al cerrar sesión se quita el usuario y el token del widget");
  check(errs.length === 0, "sin errores de JavaScript" + (errs.length ? ": " + errs[0] : ""));
} catch (e) { console.log("FALLÓ  excepción: " + e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); servidor.close(); await env.cleanup();
console.log(failed ? `\n${failed} fallo(s)` : "\nSoporte OK"); process.exit(failed ? 1 : 0);
