// Superadmin: editar planes y precios, y panel de vencimientos con recordatorio.
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
  for (const [cid, dias] of [["col-ok", 200], ["col-gr", -5]]) {
    await setDoc(doc(db, `colegios/${cid}`), { nombre: "Colegio " + cid, licencia: { plan: "basico", vence: Timestamp.fromMillis(Date.now() + dias * DIA), graciaDias: 15, maxEstudiantes: 300 } });
    await setDoc(doc(db, `colegios/${cid}/miembros/adm@${cid}.co`), { email: `adm@${cid}.co`, role: "admin", status: "active" });
  }
});
const vite = spawn("npx", ["vite", "--port", "5185", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } }); const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept());
  await p.goto("http://localhost:5185/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), "franksanlo@gmail.com");
  await p.waitForSelector("text=Elige tu colegio", { timeout: 15000 });
  await p.click("button:has-text('Vencimientos')"); await p.waitForSelector("text=en gracia");
  let t = (await p.innerText("body")).replace(/\s+/g, " ");
  check(/Colegio col-gr .*en gracia/.test(t) && !/Colegio col-ok .*en gracia/.test(t) && t.includes("Recordatorio"), "Vencimientos: solo lista el colegio en gracia, con botón de recordatorio");
  await p.click("button:has-text('Planes y precios')");
  const inputBasico = p.locator("input").nth(3);
  await inputBasico.fill("1300000"); await p.click("button:has-text('Guardar planes')");
  await new Promise((r) => setTimeout(r, 2000));
  let pl; await env.withSecurityRulesDisabled(async (x) => { pl = (await getDoc(doc(x.firestore(), "plataforma/planes"))).data(); });
  check(pl?.basico?.precio === 1300000 && pl?.plus?.maxEstudiantes === 1500, "guardar planes escribe plataforma/planes con el nuevo precio");
  t = (await p.innerText("body")).replace(/\s+/g, " ");
  check(t.includes("Planes y precios guardados"), "confirma que se guardaron");
  // Un valor inválido bloquea el guardado
  await p.click("button:has-text('Planes y precios')");
  await p.locator("input").nth(3).fill("abc");
  check(await p.locator("button:has-text('Guardar planes')").isDisabled(), "un precio inválido deshabilita «Guardar planes»");
  // El selector de colegios usa el precio nuevo
  await p.reload(); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((e) => window.__rnSignIn(e), "franksanlo@gmail.com");
  await p.waitForSelector("text=Elige tu colegio", { timeout: 15000 });
  const opciones = await p.locator("select option").allInnerTexts();
  check(opciones.some((o) => o.includes("$1.300.000")), "tras recargar, el selector de planes muestra el precio nuevo ($1.300.000)");
} catch (e) { console.log("FALLÓ  excepción: " + e.message.split("\n")[0]); failed++; }
await b.close(); vite.kill(); await env.cleanup();
console.log(failed ? `\n${failed} fallo(s)` : "\nPlanes OK"); process.exit(failed ? 1 : 0);
