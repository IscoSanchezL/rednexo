// Genera el PDF del manual de usuario (docs/manuales/manual-usuario.html), con índice de páginas calculado.
// Requisitos: Playwright (ya instalado) y pdftotext (poppler) para ubicar las secciones.  Uso: node scripts/manual-usuario.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const SRC = resolve("docs/manuales/manual-usuario.html"), TMP = resolve("docs/manuales/.manual-usuario.tmp.html"), OUT = resolve("docs/manuales/RedNexo-Manual-de-Usuario.pdf");
const base = readFileSync(SRC, "utf8");
const b = await chromium.launch();
async function render(html) {
  writeFileSync(TMP, html);
  const p = await b.newPage();
  await p.goto(pathToFileURL(TMP).href, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: OUT, format: "A4", printBackground: true, preferCSSPageSize: true });
  await p.close();
}
await render(base.replace(/\{\{pg:\w+\}\}/g, ""));
const paginas = execFileSync("pdftotext", ["-layout", OUT, "-"]).toString().split("\f");
const donde = {};
for (let n = 1; n <= 15; n++) { const marca = `SECCIÓN ${String(n).padStart(2, "0")}`; const i = paginas.findIndex((t, k) => k > 1 && t.includes(marca)); donde["s" + n] = i + 1; }
console.log("páginas:", JSON.stringify(donde), "de", paginas.length - 1);
await render(base.replace(/\{\{pg:(\w+)\}\}/g, (_, k) => donde[k] || ""));
await b.close(); rmSync(TMP);
console.log("PDF:", OUT);
