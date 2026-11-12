// Convierte los manuales y el documento comercial (HTML) a PDF.  Uso: npm run manuales
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const docs = [
  ["docs/manuales/manual-psicologo.html", "docs/manuales/Manual-RedNexo-Orientacion.pdf"],
  ["docs/manuales/guia-estudiante.html", "docs/manuales/Guia-RedNexo-Estudiantes.pdf"],
  ["docs/comercial/licencias-y-precios.html", "docs/comercial/RedNexo-Licencias-y-Precios.pdf"],
  ["docs/comercial/lista-piloto.html", "docs/comercial/RedNexo-Lista-Piloto.pdf"],
];
const b = await chromium.launch();
for (const [src, out] of docs) {
  const p = await b.newPage();
  await p.goto(pathToFileURL(resolve(src)).href, { waitUntil: "load" });
  await p.pdf({ path: resolve(out), format: "A4", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
    headerTemplate: "<span></span>", footerTemplate: '<div style="font-size:8px;color:#94a3b8;width:100%;text-align:center">RedNexo · Iskonex — página <span class="pageNumber"></span> de <span class="totalPages"></span></div>' });
  console.log("✔", out);
}
await b.close();
