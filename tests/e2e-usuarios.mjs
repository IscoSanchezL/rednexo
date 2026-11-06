// Usuarios: revocar recuerda el rol, reactivar lo restaura, eliminar solo a quien ya no tiene acceso, nadie se quita el acceso a sí mismo.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDoc, getDocs, collection } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore(), cid = "col-u";
  await setDoc(doc(db, `colegios/${cid}`), { nombre: "Colegio U" }); await setDoc(doc(db, `colegios/${cid}/settings/global`), { colegio: "Colegio U" });
  const m = (e, role, status, extra = {}) => setDoc(doc(db, `colegios/${cid}/miembros/${e}`), { email: e, role, status, createdAt: new Date("2026-01-02T03:04:05Z"), ...extra });
  await m("admin@u.co", "admin", "active"); await m("admin2@u.co", "admin", "active"); await m("psi@u.co", "psychologist", "active");
  await m("vieja@u.co", "readonly", "revoked", { rolAnterior: "psychologist" });       // revocada con la versión nueva
  await m("antigua@u.co", "readonly", "revoked");                                      // revocada con la versión anterior: no se sabe su rol
  await m("pend@u.co", "psychologist", "pending");
});
const miembro = async (e) => { let d = null; await env.withSecurityRulesDisabled(async (c) => { const s = await getDoc(doc(c.firestore(), `colegios/col-u/miembros/${e}`)); d = s.exists() ? s.data() : null; }); return d; };
const actividad = async () => { let a = []; await env.withSecurityRulesDisabled(async (c) => { a = (await getDocs(collection(c.firestore(), "colegios/col-u/activity"))).docs.map((d) => d.data().action + " " + d.data().detail); }); return a; };
const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 250)); } };

const vite = spawn("npx", ["vite", "--port", "5186", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
const login = async (email, esperar = "text=Dashboard") => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.errs = errs; p.on("dialog", (d) => d.accept());
  await p.goto("http://localhost:5186/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), email);
  await p.waitForSelector(esperar, { timeout: 15000 }); return p;
};
const fila = (p, e) => p.locator(`tr:has-text('${e}')`);
try {
  const p = await login("admin@u.co");
  await p.click("button:has-text('Usuarios')"); await p.waitForSelector("text=Todos los usuarios registrados");
  // Uno mismo
  const yo = fila(p, "admin@u.co");
  check((await yo.innerText()).includes("(tú)") && await yo.locator("button:has-text('Revocar')").isDisabled(), "en tu propia fila aparece «(tú)» y «Revocar» está deshabilitado");
  check(((await yo.locator("button:has-text('Revocar')").getAttribute("title")) || "").includes("No puedes revocarte a ti mismo"), "y explica el motivo al pasar el cursor");
  check(!(await yo.locator("button:has-text('Eliminar')").count()), "a un usuario activo no se le ofrece «Eliminar»: primero se revoca");
  check(await fila(p, "admin2@u.co").locator("button:has-text('Revocar')").isEnabled(), "a otro administrador sí se le puede revocar (hay otro activo)");
  // Revocar guarda el rol
  await fila(p, "psi@u.co").locator("button:has-text('Revocar')").click(); await p.waitForSelector("text=Acceso revocado");
  const rv = await until(async () => { const m = await miembro("psi@u.co"); return m && m.status === "revoked" ? m : null; });
  check(!!rv && rv.role === "readonly" && rv.rolAnterior === "psychologist", "revocar baja a solo lectura pero guarda el rol anterior (psicólogo)");
  check((await fila(p, "psi@u.co").innerText()).includes("Antes: Psicólogo"), "la tabla muestra «Antes: Psicólogo»");
  // Reactivar lo restaura
  await fila(p, "psi@u.co").locator("button:has-text('Reactivar')").click(); await p.waitForSelector("text=/reactivado como Psicólogo/");
  const ra = await until(async () => { const m = await miembro("psi@u.co"); return m && m.status === "active" ? m : null; });
  check(!!ra && ra.role === "psychologist" && !("rolAnterior" in ra), "reactivar restaura el rol de psicólogo y limpia el dato auxiliar");
  check(ra && ra.createdAt && ra.createdAt.toDate().toISOString() === "2026-01-02T03:04:05.000Z", "y conserva la fecha de alta original");
  // Revocada con la versión anterior: se elige el rol
  const ant = fila(p, "antigua@u.co");
  check((await ant.locator("select").inputValue()) === "readonly", "si no se sabe el rol anterior, propone «Solo lectura»");
  await ant.locator("select").selectOption("psychologist"); await ant.locator("button:has-text('Reactivar')").click();
  check(!!(await until(async () => { const m = await miembro("antigua@u.co"); return m && m.status === "active" && m.role === "psychologist"; })), "se puede elegir el rol al reactivar (psicólogo)");
  // Eliminar
  const vieja = fila(p, "vieja@u.co");
  check((await vieja.locator("select").inputValue()) === "psychologist", "una revocada con la versión nueva propone su rol anterior");
  await vieja.locator("button:has-text('Eliminar')").click(); await p.waitForSelector("text=Usuario eliminado");
  check(!!(await until(async () => (await miembro("vieja@u.co")) === null)), "eliminar borra a la persona");
  check(!(await p.innerText("body")).includes("vieja@u.co"), "y desaparece de la lista");
  await fila(p, "pend@u.co").locator("button:has-text('Eliminar')").click(); await p.waitForSelector("text=Usuario eliminado");
  check(!!(await until(async () => (await miembro("pend@u.co")) === null)), "también se puede eliminar a un usuario pendiente");
  // Bitácora
  const act = await until(async () => { const a = await actividad(); return a.some((x) => x.startsWith("eliminó al usuario vieja@u.co")) && a.some((x) => x.startsWith("revocó el acceso psi@u.co")) && a.some((x) => x.startsWith("reactivó el acceso (Psicólogo) psi@u.co")) ? a : null; });
  check(!!act, "revocar, reactivar y eliminar quedan en el registro de actividad");
  // Autorizar de nuevo a uno mismo para degradarse: no
  await p.fill("input[placeholder='correo@gmail.com']", "admin@u.co");
  await p.locator("select").first().selectOption("readonly");
  await p.click("button:has-text('Autorizar acceso')"); await p.waitForSelector("text=/Ese correo eres tú/");
  check((await miembro("admin@u.co")).role === "admin", "no puedes degradarte a ti mismo «autorizando» tu propio correo");
  check(p.errs.length === 0, "sin errores de JavaScript" + (p.errs.length ? ": " + p.errs[0] : ""));

  // Quien se eliminó o se revocó no puede entrar
  const q = await login("vieja@u.co", "text=/no está autorizado/i");
  check(true, "quien fue eliminado no puede entrar: «tu correo no está autorizado»");
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "colegios/col-u/miembros/psi@u.co"), { status: "revoked", role: "readonly" }, { merge: true }); });
  await login("psi@u.co", "text=/acceso fue revocado/i");
  check(true, "quien está revocado tampoco entra: «tu acceso fue revocado»");
} catch (e) { console.log("FALLÓ  excepción:", e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} comprobación(es) fallaron` : "\nTodo bien");
process.exit(failed ? 1 : 0);
