// Editar (nombre y color) y eliminar grupos, incluidos los vacíos y los que ya tienen estudiantes y encuestas.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDocs, collection, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const CID = "col-ge", P = `colegios/${CID}`;
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, P), { nombre: "Colegio GE" }); await setDoc(doc(db, P + "/settings/global"), { colegio: "Colegio GE" });
  await setDoc(doc(db, P + "/miembros/psi@ge.co"), { email: "psi@ge.co", role: "psychologist", status: "active" });
  await setDoc(doc(db, P + "/miembros/ro@ge.co"), { email: "ro@ge.co", role: "readonly", status: "active" });
  await setDoc(doc(db, P + "/groups/g1"), { id: "g1", name: "5A", color: "#a78bfa" });
  await setDoc(doc(db, P + "/groups/g2"), { id: "g2", name: "Prueba vacía", color: "#2dd4bf" });
  await setDoc(doc(db, P + "/groups/g3"), { id: "g3", name: "Prueba con alumnos", color: "#fbbf24" });
  for (const [id, n, g] of [["1", "Ana", "5A"], ["2", "Beto", "5A"], ["3", "Carla", "Prueba con alumnos"], ["4", "Dani", "Prueba con alumnos"]]) await setDoc(doc(db, `${P}/students/${id}`), { id, name: n, group: g, av: n[0] });
  const R = [{ id: "1", name: "Ana", group: "5A", av: "A" }, { id: "2", name: "Beto", group: "5A", av: "B" }];
  await setDoc(doc(db, P + "/surveys/sv1"), { id: "sv1", title: "Encuesta 5A", status: "active", group: "5A", groups: ["5A"], maxSel: 2, createdAt: Timestamp.fromMillis(Date.now()), questions: [{ id: "q1", text: "¿Quién?", tp: "pos" }], rosterIds: ["1", "2"], roster: R, colegioNombre: "Colegio GE" });
});
const leer = async (path) => { let o = []; await env.withSecurityRulesDisabled(async (x) => { o = (await getDocs(collection(x.firestore(), path))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return o; };
const until = async (fn, ms = 10000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 250)); } };
const vite = spawn("npx", ["vite", "--port", "5167", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0; const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
const entrar = async (email) => { const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); p.mensajes = []; p.on("dialog", (d) => { p.mensajes.push(d.message()); d.accept(); }); await p.goto("http://localhost:5167/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), email); await p.waitForSelector("button:has-text('Dashboard')", { timeout: 20000 }); await p.click("header button:has-text('Grupos')"); await p.waitForSelector("text=/Gestión de Grupos|No puedes gestionar grupos/", { timeout: 10000 }); await p.waitForTimeout(800); return p; };
const tarjeta = (p, nombre) => p.locator(`xpath=//span[normalize-space()="${nombre}"]/ancestor::div[.//button[contains(.,'Agregar')]][1]`);
try {
  const ro = await entrar("ro@ge.co");
  check((await ro.locator("button:has-text('✎ Editar')").count()) === 0 && (await ro.locator("button:has-text('🗑')").count()) === 0, "solo lectura: no ve Editar ni eliminar grupos");
  const p = await entrar("psi@ge.co");
  check((await p.locator("button:has-text('✎ Editar')").count()) === 3, "cada grupo tiene su botón «✎ Editar»");
  // Eliminar un grupo vacío
  await tarjeta(p, "Prueba vacía").locator("button:has-text('🗑')").click();
  await until(async () => !(await leer(P + "/groups")).some((g) => g.name === "Prueba vacía"));
  check(!(await leer(P + "/groups")).some((g) => g.name === "Prueba vacía"), "eliminar un grupo vacío: desaparece");
  check(p.mensajes.some((m) => /Está vacío/.test(m)) && p.mensajes.length === 1, "…con una sola confirmación que dice que está vacío");
  // Nombre repetido
  await tarjeta(p, "5A").locator("button:has-text('✎ Editar')").click();
  await p.fill("input[aria-label='Nombre del grupo']", "prueba con alumnos"); await p.click("button:has-text('✓ Guardar')"); await p.waitForTimeout(500);
  check((await p.innerText("body")).includes("Ya existe un grupo llamado") && (await leer(P + "/groups")).some((g) => g.name === "5A"), "editar: un nombre que ya existe se rechaza y no cambia nada");
  // Renombrar 5A → 6B y cambiar el color
  await p.fill("input[aria-label='Nombre del grupo']", "  6° B  "); await p.locator("button[aria-label='Color #34d399']").click(); await p.click("button:has-text('✓ Guardar')");
  await until(async () => (await leer(P + "/students")).filter((s) => s.group === "6° B").length === 2);
  const gs = await leer(P + "/groups"), sts = await leer(P + "/students"), sv = (await leer(P + "/surveys"))[0];
  check(sts.filter((s) => s.group === "6° B").length === 2 && !sts.some((s) => s.group === "5A"), "renombrar: los estudiantes pasan al nombre nuevo");
  check(gs.some((g) => g.name === "6° B" && g.color === "#34d399") && !gs.some((g) => g.name === "5A") && gs.filter((g) => g.name === "6° B").length === 1, "…el grupo queda con el nombre y color nuevos, sin duplicados");
  check(JSON.stringify(sv.groups) === JSON.stringify(["6° B"]) && sv.group === "6° B", "…y la encuesta que lo usaba ahora apunta al nombre nuevo");
  const sv2 = await until(async () => { const x = (await leer(P + "/surveys"))[0]; return x.roster.every((r) => r.group === "6° B") ? x : null; });
  check(!!sv2, "…y la lista de nombres de la encuesta pública se actualiza");
  check((await p.innerText("body")).includes("Grupo renombrado a «6° B»"), "…y avisa que quedó renombrado");
  check((await leer(P + "/activity")).some((a) => /renombró el grupo/.test(a.action) && a.detail === "5A → 6° B"), "…y queda en la bitácora de actividad");
  // Crear un grupo con el nombre viejo ya no pisa al renombrado
  await p.click("button:has-text('+ Nuevo Grupo')"); await p.fill("input[placeholder='Ej: 7° B']", "5A"); await p.click("button:has-text('Crear')"); await p.waitForTimeout(1000);
  const gs2 = await leer(P + "/groups");
  check(gs2.some((g) => g.name === "6° B") && gs2.some((g) => g.name === "5A"), "crear un grupo con el nombre anterior no pisa al grupo renombrado");
  // Eliminar un grupo con estudiantes: dos confirmaciones
  p.mensajes.length = 0;
  await tarjeta(p, "Prueba con alumnos").locator("button:has-text('🗑')").click();
  await until(async () => !(await leer(P + "/students")).some((s) => s.group === "Prueba con alumnos"));
  check(!(await leer(P + "/students")).some((s) => s.group === "Prueba con alumnos") && !(await leer(P + "/groups")).some((g) => g.name === "Prueba con alumnos"), "eliminar un grupo con estudiantes: se van el grupo y sus estudiantes");
  check(p.mensajes.length === 2 && /sus 2 estudiantes/.test(p.mensajes[0]) && /Última confirmación/.test(p.mensajes[1]), "…pidiendo dos confirmaciones que dicen cuántos estudiantes se eliminan");
  check((await leer(P + "/students")).filter((s) => s.group === "6° B").length === 2, "…sin tocar a los de otros grupos");
  check(p.errs.length === 0, "sin errores de JavaScript" + (p.errs.length ? ": " + p.errs[0] : ""));
} catch (x) { console.log("FALLÓ excepción:", x.message.split("\n").slice(0, 3).join(" | ")); failed++; }
await b.close(); vite.kill(); await env.cleanup(); console.log(failed ? `\n${failed} fallo(s)` : "\nGrupos editar OK"); process.exit(failed ? 1 : 0);
