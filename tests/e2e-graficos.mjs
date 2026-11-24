// Gráficos para psicólogos (clic para ver detalle, individual, comparar, imagen), ayudas «ⓘ» y preguntas obligatorias.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync, statSync } from "node:fs";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { spawn } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const CID = "col-gr", P = `colegios/${CID}`;
const NOM = ["Ana Pérez", "Beto Díaz", "Carla Ruiz", "Dani Mora", "Eva Soto", "Fabio Lara", "Gina Rey", "Hugo Paz"];
const ST = NOM.map((name, i) => ({ id: String(i + 1), name, group: i < 4 ? "5A" : "5B", av: name.split(" ").map((w) => w[0]).join("") }));
const Q = [{ id: "q1", text: "¿Con quién jugarías?", tp: "pos", obligatoria: true }, { id: "q2", text: "¿Con quién NO jugarías?", tp: "neg" }, { id: "q3", text: "¿Qué mejorarías?", tp: "neu", kind: "abierta", obligatoria: true }];
const A1 = { 1: { q1: ["2", "5"], q2: ["3"] }, 2: { q1: ["1"], q2: ["3"] }, 3: { q1: ["1"], q2: ["4"] }, 4: { q1: ["1", "2"] }, 5: { q1: ["6", "1"] }, 6: { q1: ["5"] }, 7: { q1: ["6"] }, 8: { q1: ["5"] } };
const A2 = { 1: { q1: ["2"] }, 2: { q1: ["1"] }, 3: { q1: ["1", "2"] } };
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, P), { nombre: "Colegio GR" }); await setDoc(doc(db, P + "/settings/global"), { colegio: "Colegio GR" });
  await setDoc(doc(db, P + "/miembros/psi@gr.co"), { email: "psi@gr.co", role: "psychologist", status: "active" });
  await setDoc(doc(db, P + "/groups/g1"), { id: "g1", name: "5A", color: "#a78bfa" }); await setDoc(doc(db, P + "/groups/g2"), { id: "g2", name: "5B", color: "#fbbf24" });
  for (const s of ST) await setDoc(doc(db, `${P}/students/${s.id}`), s);
  const base = { status: "active", group: "5A", groups: ["5A", "5B"], maxSel: 2, createdAt: Timestamp.fromMillis(Date.now()), rosterIds: ST.map((s) => s.id), roster: ST, colegioNombre: "Colegio GR" };
  await setDoc(doc(db, P + "/surveys/sv1"), { id: "sv1", title: "Inicio de año", questions: Q, ...base });
  await setDoc(doc(db, P + "/surveys/sv2"), { id: "sv2", title: "Fin de año", questions: Q.slice(0, 2), ...base });
  for (const [sv, A] of [["sv1", A1], ["sv2", A2]]) for (const [id, answers] of Object.entries(A)) await setDoc(doc(db, `${P}/responses/${sv}_${id}`), { surveyId: sv, respondentId: id, respondentName: NOM[id - 1], submittedAt: Timestamp.fromMillis(Date.now()), answers });
});
const vite = spawn("npx", ["vite", "--port", "5200", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0; const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
try {
  const errs = [];
  // ── Estudiante: preguntas obligatorias y opcionales ──
  const e = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); e.on("pageerror", (x) => errs.push(x.message));
  await e.goto(`http://localhost:5200/?c=${CID}&survey=sv1`); await e.waitForSelector("text=¿Quién eres tú?", { timeout: 15000 });
  await e.locator("button:has-text('Hugo')").click(); await e.waitForSelector("text=Pregunta 1");
  // (Hugo ya respondió en el seed; si la app lo bloquea, usamos otro) 
  await e.waitForTimeout(300);
  let t = (await e.innerText("body")).replace(/\s+/g, " ");
  if (/Pregunta 1/.test(t)) {
    check(t.includes("esta pregunta es obligatoria") && await e.locator("button:has-text('Siguiente')").isDisabled(), "pregunta obligatoria: sin elegir a nadie no se puede continuar, y lo explica");
    check(await e.locator("[aria-label=obligatoria]").count() === 1, "…y la pregunta lleva el asterisco de obligatoria");
    await e.locator("button:has-text('Ana')").first().click();
    check(!(await e.locator("button:has-text('Siguiente')").isDisabled()), "…al elegir a alguien ya puede continuar");
    await e.locator("button:has-text('Siguiente')").click(); await e.waitForSelector("text=Pregunta 2");
    t = (await e.innerText("body")).replace(/\s+/g, " ");
    check(t.includes("puedes dejarla en blanco") && !(await e.locator("button:has-text('Siguiente')").isDisabled()), "pregunta opcional: se puede dejar en blanco y continuar");
    await e.locator("button:has-text('Siguiente')").click(); await e.waitForSelector("text=Pregunta 3");
    check(await e.locator("button:has-text('Enviar')").isDisabled(), "pregunta abierta obligatoria: sin texto no se puede enviar");
    await e.locator("textarea").fill("ab"); check(await e.locator("button:has-text('Enviar')").isDisabled(), "…ni con menos de 3 caracteres");
    await e.locator("textarea").fill("Más luz"); check(!(await e.locator("button:has-text('Enviar')").isDisabled()), "…con texto suficiente sí");
  } else check(false, "no se pudo abrir la pregunta 1: " + t.slice(0, 120));

  // ── Psicólogo: Dashboard con ayudas ──
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage(); p.on("pageerror", (x) => errs.push(x.message));
  await p.goto("http://localhost:5200/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((x) => window.__rnSignIn(x), "psi@gr.co");
  await p.waitForSelector("text=PARTICIPANTES", { timeout: 20000 });
  await p.locator("[data-ayuda=densidad]").click();
  const dlg = await p.locator("[role=dialog][aria-label=Densidad]").innerText();
  check(/Cuándo vigilar/.test(dlg) && /n × \(n − 1\)/.test(dlg), "el Dashboard tiene la ayuda «ⓘ» de Densidad con qué es, cómo leerla y cuándo vigilar");
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  check(await p.locator("[role=dialog][aria-label=Densidad]").count() === 0, "…y se cierra con Escape");
  await p.click("header button:has-text('Reportes')"); await p.waitForTimeout(400);
  await p.click("summary:has-text('Guía para leer')");
  check((await p.innerText("body")).includes("Rechazo") && /Vigilar:/.test(await p.innerText("body")), "Reportes: guía desplegable con los indicadores y roles");

  // ── Gráficos ──
  await p.click("header button:has-text('Gráficos')"); await p.waitForSelector("[data-graficos]");
  check(await p.locator("[data-seg]").count() > 0 && await p.locator("[data-dens]").count() === 2, "Panorama: barras de roles por grupo y densidad por grupo (2 grupos)");
  await p.locator("[data-seg]").first().click();
  check(await p.locator("[data-lista-rol]").count() === 1 && /en .*:/.test(await p.locator("[data-lista-rol]").innerText()), "clic en un segmento de rol → lista quiénes son");
  await p.locator("[data-dens]").first().click();
  check(/conexiones dentro del grupo/.test(await p.innerText("[data-graficos]")), "clic en una barra de densidad → detalle del grupo");
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + "/panorama.png", fullPage: true });
  await p.locator("[data-celda]").first().click();
  check(/hacia|Dentro de/.test(await p.innerText("[data-graficos]")), "clic en el mapa de calor → detalle de celda");
  const [img] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }), p.locator("button:has-text('Imagen')").first().click()]);
  check(/\.png$/.test(img.suggestedFilename()) && statSync(await img.path()).size > 1500, "«⬇ Imagen» descarga el gráfico como PNG: " + img.suggestedFilename());

  await p.click("button:has-text('Estudiantes')"); await p.waitForTimeout(300);
  check(await p.locator("[data-punto]").count() === 8, "Estudiantes: un punto por estudiante (8)");
  check((await p.innerText("[data-graficos]")).includes("Carla Ruiz"), "…con el nombre visible junto al punto");
  await p.locator("[data-punto='3']").click();
  const ficha = await p.locator("[data-ficha='3']").innerText();
  check(/Carla Ruiz/.test(ficha) && /aceptación/i.test(ficha) && /rechazo/i.test(ficha) && /expansión/i.test(ficha), "clic en un punto → ficha con rol, aceptación, rechazo y expansión");
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + "/estudiantes.png", fullPage: true });
  await p.locator("button[aria-pressed]:has-text('Regular')").click(); await p.waitForTimeout(200);
  check(await p.locator("[data-punto]").count() < 8, "la leyenda oculta/muestra los roles");
  await p.locator("button[aria-pressed]:has-text('Regular')").click();
  check(await p.locator("[data-mutua]").count() > 0, "ranking de relaciones mutuas");
  await p.locator("[data-mutua]").first().click();
  await p.click("button:has-text('Ver gráfico individual')"); await p.waitForTimeout(400);
  check(await p.locator("[data-vecino]").count() > 0, "Individual: red de relaciones del estudiante");
  await p.locator("[data-vecino]").first().click();
  check(await p.locator("[data-detalle-vecino]").count() === 1, "clic en un compañero → detalle de la relación");
  await p.selectOption("select[aria-label=Estudiante]", "1"); await p.waitForTimeout(300);
  check((await p.innerText("[data-graficos]")).includes("Indicadores de Ana Pérez") && await p.locator("[data-vecino]").count() >= 3, "elegir otro estudiante actualiza indicadores contra el grupo y la red");

  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + "/individual.png", fullPage: true });
  await p.click("button:has-text('Comparar aplicaciones')"); await p.waitForTimeout(300);
  await p.selectOption("select[aria-label=Antes]", "sv1"); await p.selectOption("select[aria-label=Después]", "sv2"); await p.waitForTimeout(400);
  const cmp = await p.innerText("[data-graficos]");
  check(/Cambios en el grupo/.test(cmp) && /Densidad/.test(cmp) && /Estudiantes que cambiaron/.test(cmp), "Comparar: indicadores antes/después y estudiantes que cambiaron");

  // Tema claro: los gráficos siguen usando las variables del tema
  await p.click("button[title='Cambiar a modo claro']"); await p.click("button:has-text('Panorama')"); await p.waitForTimeout(300);
  check(await p.locator("[data-seg]").count() > 0, "los gráficos también funcionan en modo claro");
  await p.click("button:has-text('Estudiantes')"); await p.locator("[data-punto='3']").click(); await p.click("button:has-text('Individual')"); await p.waitForTimeout(300);
  check(!/NaN/.test(await p.innerText("[data-graficos]")), "ningún gráfico ni ficha muestra «NaN»");
  check(errs.length === 0, "sin errores de JavaScript" + (errs.length ? ": " + errs[0] : ""));
} catch (x) { console.log("FALLÓ excepción:", x.message.split("\n").slice(0, 4).join(" | ")); failed++; }
await b.close(); vite.kill(); await env.cleanup(); console.log(failed ? `\n${failed} fallo(s)` : "\nGráficos OK"); process.exit(failed ? 1 : 0);
