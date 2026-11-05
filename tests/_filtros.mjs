import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";
const OUT = process.argv[2];
const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore(), cid = "col-f";
  await setDoc(doc(db, `colegios/${cid}`), { nombre: "Colegio F" }); await setDoc(doc(db, `colegios/${cid}/settings/global`), { colegio: "Colegio F" });
  await setDoc(doc(db, `colegios/${cid}/miembros/psi@f.co`), { email: "psi@f.co", role: "psychologist", status: "active" });
  await setDoc(doc(db, `colegios/${cid}/groups/g1`), { id: "g1", name: "Grupo Prueba", color: "#ff4d6a" });
  const names = ["Isco", "Isco1", "Isco2"];
  for (const [i, n] of names.entries()) await setDoc(doc(db, `colegios/${cid}/students/${i + 1}`), { id: String(i + 1), name: n, group: "Grupo Prueba", av: "I" });
  await setDoc(doc(db, `colegios/${cid}/surveys/sv1`), { id: "sv1", title: "S", status: "active", group: "Grupo Prueba", groups: ["Grupo Prueba"], maxSel: 3, anon: true, createdAt: Timestamp.now(), rosterIds: ["1", "2", "3"], roster: [],
    questions: [{ id: "qp", text: "pos", tp: "pos" }, { id: "qn", text: "neu", tp: "neu" }, { id: "qg", text: "neg", tp: "neg" }] });
  // 1→2 positiva, 1→3 neutral, 2→1 neutral, 2→3 negativa, 3→1 positiva, 3→2 neutral  (6 conexiones, 3 neutrales)
  const R = { 1: { qp: ["2"], qn: ["3"] }, 2: { qn: ["1"], qg: ["3"] }, 3: { qp: ["1"], qn: ["2"] } };
  for (const [id, answers] of Object.entries(R)) await setDoc(doc(db, `colegios/${cid}/responses/sv1_${id}`), { surveyId: "sv1", respondentId: id, respondentName: "x", answers });
});
const vite = spawn("npx", ["vite", "--port", "5191", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
const b = await chromium.launch();
for (const theme of ["dark", "light"]) {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await p.addInitScript((t) => { try { localStorage.setItem("rednexo-theme", t); } catch (e) {} }, theme);
  await p.goto("http://localhost:5191/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate(() => window.__rnSignIn("psi@f.co"));
  await p.waitForSelector("text=Dashboard", { timeout: 15000 }); await p.waitForTimeout(2500);
  for (const f of ["Todas", "Positivas", "Neutrales", "Negativas"]) {
    await p.locator(`button:has-text('${f}')`).first().click(); await p.waitForTimeout(1800);
    await p.screenshot({ path: `${OUT}/${theme}-${f}.png`, clip: { x: 0, y: 150, width: 920, height: 480 } });
  }
}
await b.close(); vite.kill(); await env.cleanup(); console.log("listo");
