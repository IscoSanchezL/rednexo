import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, roleThreshold, studentStats, computeReport, renderReportHTML, reportFileName, REPORT_TYPES } from "../src/lib/reports.js";

// Los datos de la captura de tu reporte: 4 estudiantes de «Grupo Prueba».
const ST = [{ id: "1", name: "Isco", group: "Grupo Prueba", av: "I" }, { id: "2", name: "Isco1", group: "Grupo Prueba", av: "I" }, { id: "3", name: "Isco2", group: "Grupo Prueba", av: "I" }, { id: "4", name: "Milena", group: "Grupo Prueba", av: "M" }];
const K = (f, t, types) => ({ f, t, types, tp: types.includes("neg") && types.length === 1 ? "neg" : types[0], s: 1, counts: { pos: +types.includes("pos"), neu: +types.includes("neu"), neg: +types.includes("neg") } });
const CN = [
  K("1", "2", ["pos", "neu"]), K("1", "3", ["neu", "neg"]),
  K("2", "1", ["pos", "neu"]), K("2", "3", ["pos", "neu", "neg"]),
  K("3", "1", ["neg"]), K("3", "2", ["pos", "neu"]),
  K("4", "1", ["pos", "neu"]), K("4", "2", ["pos", "neu"]), K("4", "3", ["neg"]),
];

test("umbral de roles: la mitad del grupo, mínimo 2", () => {
  assert.deepEqual([roleThreshold(4), roleThreshold(30), roleThreshold(2), roleThreshold(1)], [2, 15, 2, 2]);
});
test("tus datos: las cifras coinciden con las del reporte y cada rol tiene sentido", () => {
  const r = Object.fromEntries(ST.map((s) => [s.name, studentStats(s, ST, CN)]));
  assert.deepEqual([r.Isco.posR, r.Isco.negR, r.Isco.recibidas, r.Isco.popularidad, r.Isco.rechazo], [2, 1, 3, "66.7", "33.3"]);
  assert.deepEqual([r.Isco1.posR, r.Isco1.negR, r.Isco1.popularidad], [3, 0, "100.0"]);
  assert.deepEqual([r.Isco2.posR, r.Isco2.negR, r.Isco2.rechazo], [1, 3, "100.0"]);
  assert.deepEqual([r.Milena.recibidas, r.Milena.hechas, r.Milena.expansion], [0, 3, "100.0"]);
  assert.deepEqual([r.Isco.rol, r.Isco1.rol, r.Isco2.rol], ["lider", "lider", "rechazado"]);
  assert.equal(r.Milena.rol, "aislado");            // antes «Regular»: eligió a 3 pero NADIE la eligió
});
test("mutuas: solo cuentan las positivas; el rechazo mutuo se cuenta aparte", () => {
  const rep = computeReport(ST, CN);
  assert.deepEqual([rep.kpis.positivas, rep.kpis.rechazos, rep.kpis.mutuasPos, rep.kpis.rechazosMutuos, rep.kpis.densidad], [6, 4, 2, 1, "75.0"]);   // antes «3 mutuas» incluía a Isco↔Isco2, que se rechazan
  const isco = rep.rows.find((x) => x.student.name === "Isco");
  assert.deepEqual([isco.mutuasPos, isco.rechazosMutuos], [1, 1]);
});
test("roles: controvertido (muchas elecciones y muchos rechazos), aislado con solo rechazos leves y grupos pequeños", () => {
  const st = ["a", "b", "c", "d", "e"].map((n, i) => ({ id: String(i + 1), name: n, group: "G" }));
  const cn = [["2", "1", ["pos"]], ["3", "1", ["pos"]], ["4", "1", ["neg"]], ["5", "1", ["neg"]], ["1", "2", ["neg"]], ["3", "5", ["pos"]]].map(([f, t, ty]) => K(f, t, ty));
  assert.equal(studentStats(st[0], st, cn).rol, "controvertido");           // a: 2 pos y 2 neg (umbral 2)
  assert.equal(studentStats(st[1], st, cn).rol, "aislado");                 // b: 1 rechazo, 0 positivas
  assert.equal(studentStats(st[4], st, cn).rol, "regular");                 // e: 1 positiva, sin mutuas
  assert.equal(studentStats({ id: "1" }, [{ id: "1" }], []).rol, "aislado");   // un solo participante: sin división por cero
});
test("el reporte sin participantes ni conexiones no falla", () => {
  const rep = computeReport([], []);
  assert.deepEqual([rep.n, rep.kpis.densidad], [0, "0.0"]);
  assert.match(renderReportHTML(rep, { type: "ambos" }), /No hay participantes/);
});

const NOMBRES = ["Isco", "Isco1", "Isco2", "Milena"];
const html = (type, extra = {}) => renderReportHTML(computeReport(ST, CN), { type, groupLabel: "Grupo Prueba", date: "5 de noviembre de 2026", colors: { "Grupo Prueba": "#ff4d6a" }, ...extra });
const h = (s) => s.match(/<h2>([^<]+)<\/h2>/g).map((x) => x.replace(/<\/?h2>/g, ""));
test("tres tipos de reporte que SÍ se diferencian", () => {
  assert.deepEqual(h(html("individual")), ["Resumen", "Índices individuales", "Fichas por estudiante"]);
  assert.deepEqual(h(html("grupal")), ["Resumen", "Grupos"]);
  assert.deepEqual(h(html("ambos")), ["Resumen", "Índices individuales", "Grupos", "Matriz sociométrica", "Fichas por estudiante"]);
  for (const t of Object.keys(REPORT_TYPES)) assert.match(html(t), new RegExp(`Reporte ${REPORT_TYPES[t]} ·`));   // el Completo ya no se llama «Grupal»
});
test("el reporte Grupal no contiene ningún nombre ni quién eligió a quién", () => {
  const g = html("grupal");
  for (const n of NOMBRES) assert.ok(!g.includes(n), `aparece «${n}» en el reporte grupal`);
  assert.match(g, /sin nombres de estudiantes/);
  assert.match(g, /Aislados/);                                               // sí informa de cuántos
  assert.ok(!/Fichas|Matriz/.test(g));
});
test("Individual y Completo: la ficha de Milena avisa que nadie la eligió; el resumen la nombra como aislada", () => {
  for (const t of ["individual", "ambos"]) {
    const x = html(t);
    assert.match(x, /Aislados — nadie los eligió positivamente \(1\):<\/b> Milena/);
    assert.match(x, /<h3>Milena[\s\S]*?Nadie lo eligió positivamente\./);
  }
  assert.match(html("individual"), /<h3>Isco2[\s\S]*?Lo rechazaron:<\/b> Isco, Isco1, Milena/);
  assert.ok(!html("individual").includes("Matriz sociométrica"));            // la matriz solo va en el Completo
});
test("seguridad: un nombre con HTML no puede inyectar etiquetas ni scripts en ningún reporte", () => {
  const malo = { id: "9", name: `Eve<img src=x onerror="window.__pwned=1">"'&`, group: `G"><script>alert(1)</script>`, av: "<b>" };
  const st = [...ST, malo], cn = [...CN, K("9", "1", ["pos"]), K("1", "9", ["neg"])];
  for (const t of Object.keys(REPORT_TYPES)) for (const mode of ["html", "pdf", "preview"]) {
    const x = renderReportHTML(computeReport(st, cn), { type: t, groupLabel: `<i>x</i>`, mode, colors: { [malo.group]: `red;background:url(javascript:1)` } });
    assert.ok(!x.includes("<i>x</i>"), `${t}/${mode}: etiqueta del nombre del grupo sin escapar`);
    assert.ok(!x.includes("<img src=x"), `${t}/${mode}: etiqueta <img> sin escapar`);
    assert.ok(!x.includes("<script>alert"), `${t}/${mode}: <script> sin escapar`);
    assert.ok(!x.includes("javascript:"), `${t}/${mode}: color inseguro sin filtrar`);
    assert.ok(!/onerror="/.test(x), `${t}/${mode}: atributo con comillas sin escapar`);
  }
  assert.equal(esc(`<a href="x">'&</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&lt;/a&gt;");
  assert.equal(esc(null), "");
});
test("PDF lleva la barra de imprimir; HTML y vista previa no", () => {
  assert.match(html("ambos", { mode: "pdf" }), /window\.print\(\)/);
  assert.ok(!/window\.print/.test(html("ambos", { mode: "html" })) && !/window\.print/.test(html("ambos", { mode: "preview" })));
});
test("nombre de archivo sin tildes ni caracteres peligrosos", () => {
  assert.equal(reportFileName("5° A / Ñandú", "individual", "html"), "reporte_rednexo_Individual_5_A_Nandu.html");
  assert.equal(reportFileName("***", "ambos", "pdf"), "reporte_rednexo_Completo_grupo.pdf");
});
