// Justificar una elección: el estudiante escribe por qué eligió a cada compañero; se ve en el informe, el Excel y el detalle del mapa, y la elección cuenta en el dashboard.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDocs, collection, Timestamp } from "firebase/firestore";
import { spawn, execFileSync } from "node:child_process";

const env = await initializeTestEnvironment({ projectId: "rednexo-fd35c", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const CID = "col-jf", P = `colegios/${CID}`;
const ST = [["1", "Ana Pérez"], ["2", "Beto Díaz"], ["3", "Carla Ruiz"], ["4", "Dani Soto"]].map(([id, name]) => ({ id, name, group: "5A", av: name.split(" ").map((w) => w[0]).join("") }));
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, P), { nombre: "Colegio JF" }); await setDoc(doc(db, P + "/settings/global"), { colegio: "Colegio JF" });
  await setDoc(doc(db, P + "/miembros/psi@jf.co"), { email: "psi@jf.co", role: "psychologist", status: "active" });
  await setDoc(doc(db, P + "/groups/g1"), { id: "g1", name: "5A", color: "#a78bfa" });
  for (const s of ST) await setDoc(doc(db, `${P}/students/${s.id}`), s);
  const questions = [{ id: "q1", text: "¿Con quién trabajarías?", tp: "pos", kind: "justificable" }, { id: "q2", text: "¿Con quién NO trabajarías?", tp: "neg", kind: "justificable" }, { id: "q3", text: "¿Quién es el líder?", tp: "neu" }];
  await setDoc(doc(db, P + "/surveys/sv1"), { id: "sv1", title: "Con explicaciones", status: "active", group: "5A", groups: ["5A"], maxSel: 2, createdAt: Timestamp.fromMillis(Date.now()), questions, rosterIds: ST.map((s) => s.id), roster: ST, colegioNombre: "Colegio JF" });
});
const leer = async (path) => { let o = []; await env.withSecurityRulesDisabled(async (x) => { o = (await getDocs(collection(x.firestore(), path))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return o; };
const until = async (fn, ms = 10000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 250)); } };
const vite = spawn("npx", ["vite", "--port", "5166", "--strictPort"], { env: { ...process.env, VITE_USE_EMULATORS: "true" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 4000));
let failed = 0; const check = (ok, msg) => { console.log((ok ? "ok     " : "FALLÓ  ") + msg); if (!ok) failed++; };
const b = await chromium.launch();
try {
  // ── El estudiante responde ──
  const e = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errs = []; e.on("pageerror", (x) => errs.push(x.message));
  await e.goto(`http://localhost:5166/?c=${CID}&survey=sv1`); await e.waitForSelector("text=¿Quién eres tú?", { timeout: 15000 });
  await e.locator("button:has-text('Ana')").tap(); await e.waitForSelector("text=Pregunta 1");
  const fila = (n) => e.locator(`button:has-text('${n}')`).first();
  check(await e.locator("textarea").count() === 0, "Pregunta con explicación: antes de elegir a nadie no hay cuadros de texto");
  await fila("Beto").tap(); await fila("Carla").tap();
  check(await e.locator("textarea").count() === 2, "al elegir a 2 compañeros aparece un cuadro de texto por cada uno");
  check(await e.locator("button:has-text('Siguiente')").isDisabled() && (await e.innerText("body")).includes("Escribe por qué elegiste a: Beto Díaz, Carla Ruiz"), "pregunta justificable: no se puede seguir sin explicar, y avisa a quién le falta");
  await e.locator("textarea").first().fill("Siempre me ayuda con las tareas");
  check(await e.locator("button:has-text('Siguiente')").isDisabled(), "…ni explicando solo a uno de los dos");
  await fila("Dani").tap();   // máximo 2: no se agrega
  check(await e.locator("textarea").count() === 2, "el máximo de selecciones se respeta");
  await fila("Carla").tap(); await fila("Dani").tap();
  check(await e.locator("textarea").count() === 2, "al cambiar de elegido, el cuadro de quien se quitó desaparece");
  await e.locator("textarea").nth(1).fill("Comparte conmigo");   // Dani
  await fila("Dani").tap(); await fila("Carla").tap();             // quita a Dani y vuelve a poner a Carla: el texto de Dani no debe sobrevivir
  check(await e.locator("button:has-text('Siguiente')").isDisabled(), "…y el cuadro de quien vuelve a elegirse empieza vacío")
  await e.locator("textarea").nth(1).fill("Es muy divertida");     // Carla
  check(!(await e.locator("button:has-text('Siguiente')").isDisabled()), "con todas las explicaciones escritas, ya se puede seguir");
  await e.locator("button:has-text('Siguiente')").tap(); await e.waitForSelector("text=Pregunta 2");
  // Pregunta 2: también justificable
  await fila("Dani").tap();
  check(await e.locator("button:has-text('Siguiente')").isDisabled(), "pregunta justificable: tampoco se puede seguir sin escribirla");
  check((await e.innerText("body")).includes("Escribe por qué elegiste a: Dani Soto"), "…y avisa a quién le falta");
  await e.locator("textarea").first().fill("ok");
  check(await e.locator("button:has-text('Siguiente')").isDisabled(), "…ni con un texto de 2 letras");
  await e.locator("textarea").first().fill("<b>Me insulta</b> & \"molesta\" 🙂");
  await e.locator("button:has-text('Siguiente')").tap(); await e.waitForSelector("text=Pregunta 3");
  check(await e.locator("textarea").count() === 0 && !(await e.innerText("body")).includes("por qué"), "pregunta de selección múltiple: se comporta como siempre, sin cuadros de texto");
  await fila("Beto").tap();
  await e.locator("button:has-text('Enviar')").tap(); await e.waitForSelector("text=Gracias", { timeout: 10000 });
  const resp = (await leer(P + "/responses")).find((r) => r.respondentId === "1");
  check(JSON.stringify(Object.keys(resp.justificaciones || {}).sort()) === JSON.stringify(["q1|2", "q1|3", "q2|4"]), "se guardan solo las explicaciones de las personas elegidas (3), con su pregunta y su estudiante: " + Object.keys(resp.justificaciones || {}));
  check(resp.justificaciones["q1|2"] === "Siempre me ayuda con las tareas" && resp.justificaciones["q1|3"] === "Es muy divertida" && resp.justificaciones["q2|4"].includes("<b>Me insulta</b>"), "…con el texto exacto (el HTML se guarda como texto)");
  check(JSON.stringify(resp.answers.q1) === JSON.stringify(["2", "3"]) && JSON.stringify(resp.answers.q2) === JSON.stringify(["4"]) && JSON.stringify(resp.answers.q3) === JSON.stringify(["2"]), "…y la elección queda guardada como siempre en «answers»");
  // Una segunda persona responde
  const e2 = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await e2.goto(`http://localhost:5166/?c=${CID}&survey=sv1`); await e2.waitForSelector("text=¿Quién eres tú?"); await e2.locator("button:has-text('Beto')").click(); await e2.waitForSelector("text=Pregunta 1");
  await e2.locator("button:has-text('Ana')").first().click(); await e2.locator("textarea").first().fill("Es mi mejor amiga"); await e2.locator("button:has-text('Siguiente')").click(); await e2.waitForSelector("text=Pregunta 2");
  await e2.locator("button:has-text('Carla')").first().click(); await e2.locator("textarea").first().fill("Hace trampa en los juegos"); await e2.locator("button:has-text('Siguiente')").click(); await e2.waitForSelector("text=Pregunta 3");
  await e2.locator("button:has-text('Enviar')").click(); await e2.waitForSelector("text=Gracias", { timeout: 10000 });
  const r2 = (await leer(P + "/responses")).find((r) => r.respondentId === "2");
  check(JSON.stringify(Object.keys(r2.justificaciones).sort()) === JSON.stringify(["q1|1", "q2|3"]), "otra persona: se guardan sus 2 explicaciones y ninguna vacía");

  // ── El equipo lo ve ──
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
  p.on("pageerror", (x) => errs.push(x.message)); p.on("dialog", (d) => d.accept());
  await p.goto("http://localhost:5166/"); await p.waitForFunction(() => !!window.__rnSignIn); await p.evaluate((x) => window.__rnSignIn(x), "psi@jf.co");
  await p.waitForSelector("text=PARTICIPANTES", { timeout: 20000 }); await p.waitForTimeout(2000);
  let t = (await p.innerText("body")).replace(/\s+/g, " ");
  check(/5\s*CONEXIONES/i.test(t), "Dashboard: las elecciones con explicación cuentan como conexiones (5 parejas)");
  // Detalle de un nodo: se prueban puntos del mapa hasta abrir uno que tenga explicaciones en sus conexiones
  const cv = await p.locator("canvas").boundingBox(); let visto = "";
  for (const rad of [0.1, 0.16, 0.22, 0.3]) for (let i = 0; i < 24 && !visto; i++) { const a = (i / 24) * Math.PI * 2; await p.mouse.click(cv.x + cv.width / 2 + Math.cos(a) * Math.min(cv.width, cv.height) * rad, cv.y + cv.height / 2 + Math.sin(a) * Math.min(cv.width, cv.height) * rad); await p.waitForTimeout(120); const tx = (await p.innerText("body")).replace(/\s+/g, " "); if (/CONEXIONES \(\d+\)/.test(tx) && tx.includes("«")) visto = tx; }
  check(!!visto && /💬|«(Siempre me ayuda con las tareas|Es muy divertida|Hace trampa en los juegos|<b>Me insulta)/.test(visto), "Dashboard: el detalle de un nodo muestra lo que escribieron en sus conexiones");
  // Informe individual
  await p.click("header button:has-text('Reportes')"); await p.waitForTimeout(600);
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }).catch(() => null), p.locator("text=Descargar HTML").click()]);
  const h = dl ? readFileSync(await dl.path(), "utf8") : "";
  check(h.includes("Explicaciones de las elecciones") && h.includes("Siempre me ayuda con las tareas") && h.includes("Es muy divertida") && h.includes("Hace trampa en los juegos") && h.includes("Es mi mejor amiga"), "Informe individual: sección «Explicaciones de las elecciones» con los textos");
  check(/Ana Pérez<\/td><td>Beto Díaz<\/td><td><i>«Siempre me ayuda/.test(h), "…cada texto aparece junto a quien escribió y al estudiante que eligió (Ana → Beto)");
  check(h.includes("Por qué lo eligieron o marcaron") && h.includes("Por qué eligió o marcó a cada uno"), "…y en la ficha de cada estudiante: por qué lo eligieron y por qué eligió");
  check(!h.includes("<b>Me insulta</b>") && h.includes("&lt;b&gt;Me insulta&lt;/b&gt;"), "…y el HTML escrito por un estudiante se muestra como texto, sin interpretarse");
  await p.locator("button:has-text('Grupal')").click(); await p.waitForTimeout(300);
  const [dl2] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }).catch(() => null), p.locator("text=Descargar HTML").click()]);
  const hg = dl2 ? readFileSync(await dl2.path(), "utf8") : "x";
  check(!hg.includes("Siempre me ayuda") && !hg.includes("Explicaciones de las elecciones") && !hg.includes("Beto"), "Informe grupal (sin nombres): no incluye ninguna explicación");
  // Excel
  const [dx] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }).catch(() => null), p.locator("text=Excel (.xlsx)").click()]);
  let xml = ""; if (dx) { const f = await dx.path(); try { xml = execFileSync("sh", ["-c", `unzip -p "${f}" 'xl/worksheets/*.xml'`], { encoding: "utf8", maxBuffer: 50e6 }); } catch (x) { xml = ""; } }
  check(xml.includes("Justificación (lo que escribió)") && xml.includes("Siempre me ayuda con las tareas") && xml.includes("&lt;b&gt;Me insulta"), "Excel: la hoja «Respuestas» trae la columna «Justificación» con los textos");
  // ── Crear la encuesta con explicación desde la pantalla ──
  await p.click("header button:has-text('Encuestas')"); await p.waitForTimeout(600);
  await p.locator("button:has-text('+ Nueva Encuesta')").first().click(); await p.waitForSelector("text=Crear Nueva Encuesta");
  await p.fill("input[placeholder='Ej: Sociograma Q2']", "Nueva con explicación");
  await p.fill("input[placeholder='Escribe la pregunta...']", "¿A quién admiras?");
  await p.locator("xpath=//input[@placeholder='Escribe la pregunta...']/ancestor::div[2]//select").nth(1).selectOption("justificable");
  await p.click("button:has-text('+ Agregar')");
  check((await p.innerText("body")).includes("💬") && (await p.innerText("body")).includes("Selección con justificación"), "Crear encuesta: el tipo «Selección con justificación» está disponible y la pregunta se marca con 💬");
  await p.click("button:has-text('💾 Guardar')");
  const nueva = await until(async () => (await leer(P + "/surveys")).find((s) => s.title === "Nueva con explicación"));
  check(nueva?.questions[0].kind === "justificable", "…y se guarda como pregunta justificable");
  await p.locator(`xpath=//span[normalize-space()="Nueva con explicación"]/ancestor::div[.//button[contains(.,'Editar')]][1]`).locator("button:has-text('Editar')").click(); await p.waitForTimeout(500);
  await p.locator("select[aria-label='Tipo de pregunta']").first().selectOption("seleccion");
  const sinJ = await until(async () => { const s = (await leer(P + "/surveys")).find((x) => x.title === "Nueva con explicación"); return s && !("kind" in s.questions[0]) ? s : null; });
  check(!!sinJ, "Editar encuesta: se puede volver una pregunta a selección múltiple");
  check(errs.length === 0, "sin errores de JavaScript" + (errs.length ? ": " + errs[0] : ""));
} catch (x) { console.log("FALLÓ excepción:", x.message.split("\n").slice(0, 3).join(" | ")); failed++; }
await b.close(); vite.kill(); await env.cleanup(); console.log(failed ? `\n${failed} fallo(s)` : "\nJustificaciones OK"); process.exit(failed ? 1 : 0);
