// Gestión comercial: datos legales, contrato por plan, firma, pago, activación de licencia e historial.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDoc, getDocs, collection } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => { const db = c.firestore(); await setDoc(doc(db, "colegios/col-ct"), { nombre: "Colegio CT", ciudad: "Bogotá" }); await setDoc(doc(db, "colegios/col-otro"), { nombre: "Otro colegio" }); });
const leer = async (path) => { let o = []; await env.withSecurityRulesDisabled(async (x) => { o = (await getDocs(collection(x.firestore(), path))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return o; };
const colegio = async () => { let o; await env.withSecurityRulesDisabled(async (x) => { o = (await getDoc(doc(x.firestore(), "colegios/col-ct"))).data(); }); return o; };
const until = async (fn, ms = 10000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 250)); } };
const vite = spawn("npx", ["vite", "--port", "5187", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1100 } }); const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));  p.on("dialog", (d) => d.accept());
  await p.addInitScript(() => { window.__impresos = []; window.open = () => ({ document: { write: (h) => window.__impresos.push(h), close() {} }, focus() {}, print() {} }); });
  await p.goto("http://localhost:5187/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), "franksanlo@gmail.com");
  await p.waitForSelector("text=Elige tu colegio", { timeout: 15000 });
  // Hay campos con la misma etiqueta dentro de formularios cerrados (<details>): solo cuentan los visibles.
  const campo = (label) => p.locator(`xpath=//label[normalize-space()="${label}"]/following-sibling::input >> visible=true`).last();
  const fila = (num) => p.locator(`xpath=//b[normalize-space()="${num}"]/ancestor::div[.//button][1]`);
  const impresos = () => p.evaluate(() => window.__impresos);
  const msg = async (t) => p.waitForSelector(`text=${t}`, { timeout: 8000 }).then(() => true).catch(() => false);

  // 1) Sin datos legales: se genera como borrador y NO se puede firmar
  await p.click("button:has-text('Gestión')"); await p.waitForSelector("text=Gestión · Colegio CT");
  check((await p.innerText("body")).includes("Faltan datos"), "avisa que faltan datos legales de Iskonex y del colegio");
  await p.click("button:has-text('Generar e imprimir contrato')"); await msg("generado");
  let h = (await impresos()).at(-1) || "";
  check(h.includes("BORRADOR — datos pendientes") && h.includes("[PENDIENTE"), "con datos pendientes el contrato sale como borrador");
  await p.click("button:has-text('Marcar firmado')");
  check(await msg("No se puede marcar como firmado"), "no deja marcar como firmado un contrato con datos pendientes");

  // 2) Completar datos de Iskonex (panel) y del colegio
  await p.click("button:has-text('Datos de Iskonex')");
  const emp = { "Razón social *": "Iskonex S.A.S.", "NIT *": "900.111.222-3", "Representante legal *": "Ana Rep", "Cédula del representante *": "111", "Ciudad *": "Medellín", "Dirección *": "Calle 10 # 5-5", "Correo para notificaciones y facturación *": "legal@iskonex.co" };
  for (const [k, v] of Object.entries(emp)) await campo(k).fill(v);
  await p.click("button:has-text('Guardar datos de Iskonex')"); await msg("Datos guardados");
  await p.click("button:has-text('Datos de Iskonex')");
  await p.click("button:has-text('Datos legales')");
  const col = { "Razón social del colegio *": "Colegio CT S.A.", "NIT *": "800.555.666-1", "Representante legal (rector/a) *": "Luis Rector", "Cédula del representante *": "222", "Dirección *": "Cra 7 # 1-1", "Correo para notificaciones y facturación *": "rectoria@ct.edu.co" };
  for (const [k, v] of Object.entries(col)) await campo(k).fill(v);
  await p.click("button:has-text('Guardar datos legales')"); await msg("Datos legales guardados");
  const legal = (await leer("colegios/col-ct/legal"))[0];
  check(legal?.nit === "800.555.666-1" && legal?.ciudad === "Bogotá", "guarda los datos legales del colegio (ciudad tomada del colegio)");

  // 3) Contrato por plan Estándar con 10 % de descuento
  await p.click("button:has-text('Contratos')");
  await p.locator('xpath=//label[normalize-space()="Plan"]/following-sibling::select').selectOption("estandar");
  await campo("Descuento %").fill("10");
  check((await p.innerText("body")).includes("$2.520.000"), "al elegir plan y descuento calcula el valor automáticamente ($2.520.000)");
  await p.click("button:has-text('Generar e imprimir contrato')"); await until(async () => (await leer("colegios/col-ct/contratos")).length === 2);
  const cts = (await leer("colegios/col-ct/contratos")).sort((a, b) => a.numero.localeCompare(b.numero));
  const c2 = cts[1];
  h = (await impresos()).at(-1) || "";
  check(c2.plan === "estandar" && c2.precioFinal === 2520000 && c2.maxEstudiantes === 800 && /^RN-\d{4}-002$/.test(c2.numero), "contrato 2: plan, valor, tope y número consecutivo");
  check(!h.includes("PENDIENTE") && h.includes("Iskonex S.A.S.") && h.includes("Colegio CT S.A.") && h.includes("800 estudiantes") && h.includes("$2.520.000 COP"), "el contrato completo trae los datos de ambas partes, el plan y el valor, sin pendientes");

  // 4) Firmar, pagar y activar
  await fila(c2.numero).locator("button:has-text('Marcar firmado')").click();
  await until(async () => (await leer("colegios/col-ct/contratos")).find((c) => c.numero === c2.numero)?.estado === "firmado");
  check(!!(await until(async () => (await leer("colegios/col-ct/contratos")).find((c) => c.numero === c2.numero)?.estado === "firmado")), "se marca el contrato como firmado");
  await p.click("button:has-text('Pagos')");
  await campo("Valor (COP) *").fill("2520000"); await campo("Referencia / comprobante").fill("TR-123");
  await p.locator('xpath=//label[normalize-space()="Contrato"]/following-sibling::select').selectOption({ label: c2.numero });
  await p.click("button:has-text('Registrar pago')");
  const pagos = await until(async () => { const x = await leer("colegios/col-ct/pagos"); return x.length ? x : null; });
  check(pagos?.[0]?.valor === 2520000 && pagos[0].contratoId === c2.id && pagos[0].registradoPor === "franksanlo@gmail.com", "registra el pago enlazado al contrato y a quien lo anotó");
  await p.click("button:has-text('📄 Contratos')");
  await fila(c2.numero).locator("button:has-text('Activar licencia')").click();
  const lic = await until(async () => (await colegio()).licencia?.plan === "estandar" ? (await colegio()).licencia : null);
  const venceMs = lic?.vence?.toMillis?.() || 0;
  check(!!lic && lic.maxEstudiantes === 800 && lic.precio === 2520000 && venceMs > Date.now() + 360 * 86400000 && venceMs < Date.now() + 372 * 86400000, "activar licencia fija plan, tope, precio con descuento y vencimiento a 12 meses");
  const hist = await until(async () => { const x = await leer("colegios/col-ct/historial"); return x.length ? x : null; });
  check(hist?.[0]?.accion === "contrato" && hist[0].plan === "estandar" && hist[0].contratoId === c2.id, "queda en el historial del colegio");
  await p.click("button:has-text('Historial')");
  check(await msg("Contrato activado"), "el historial se ve en pantalla");

  // 5) Cartera
  await p.click("button:has-text('Cartera')"); await p.waitForSelector("text=Total recibido");
  check((await p.innerText("body")).includes("Total recibido: $2.520.000"), "la cartera suma lo recibido");
  check(errs.length === 0, "sin errores de JavaScript" + (errs.length ? ": " + errs[0] : ""));
} catch (e) { console.log("FALLÓ  excepción: " + e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} fallo(s)` : "\nContratos OK"); process.exit(failed ? 1 : 0);
