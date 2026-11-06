import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { crc32, zipStore, buildXlsx, colName, sheetNames, xmlText } from "../src/lib/xlsx.js";

// Lector mínimo de ZIP (solo lo que necesitamos para comprobar lo que generamos).
function leerZip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = u8.length - 22; assert.equal(dv.getUint32(e, true), 0x06054b50, "falta el fin del directorio central");
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = {};
  for (let i = 0; i < n; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50);
    const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
    assert.equal(dv.getUint32(off, true), 0x04034b50);
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const data = u8.subarray(start, start + csize); assert.equal(method, 0); assert.equal(crc32(data), crc, "CRC distinto en " + name);
    out[name] = new TextDecoder().decode(data); p += 46 + nlen + elen + clen;
  }
  return out;
}
test("crc32 coincide con el valor conocido y el ZIP se puede leer de vuelta", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xCBF43926);
  const z = leerZip(zipStore([{ name: "a.txt", data: new TextEncoder().encode("hola ñandú") }, { name: "d/b.xml", data: new Uint8Array([60, 47, 62]) }]));
  assert.deepEqual(Object.keys(z), ["a.txt", "d/b.xml"]); assert.equal(z["a.txt"], "hola ñandú");
});
test("columnas, nombres de hoja y escape de XML", () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52, 701, 702].map(colName), ["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  assert.deepEqual(sheetNames(["Índices", "índices", "A/B:C?[x]*", "x".repeat(40), ""]), ["Índices", "índices (2)", "A-B-C--x--", "x".repeat(31), "Hoja5"]);
  assert.equal(xmlText('a<b>&"c"\u0000\u0007\uD800'), "a&lt;b&gt;&amp;&quot;c&quot;");
});
const LIBRO = () => buildXlsx([
  { name: "Datos", header: true, widths: [20, 10, 12, 20], rows: [["Nombre", "Edad", "Aceptación", "Fecha"], ["Ana <b> & \"Cía\"", 12, { v: 0.6667, s: "pct" }, new Date(2026, 10, 6, 9, 30)], ["=1+1", true, null, ""], ["Ñandú", -3.5, { v: 1, s: "pct" }, null]] },
  { name: "Notas", rows: [[{ v: "Título", s: "title" }], [], ["línea", { v: "texto largo", s: "wrap" }]] },
], new Date(2026, 10, 6, 10, 0));
test("el libro tiene las partes que Excel exige y las hojas dicen lo que deben", () => {
  const z = leerZip(LIBRO());
  assert.deepEqual(Object.keys(z).sort(), ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]);
  assert.match(z["xl/workbook.xml"], /<sheet name="Datos" sheetId="1" r:id="rId1"\/><sheet name="Notas" sheetId="2" r:id="rId2"\/>/);
  const s1 = z["xl/worksheets/sheet1.xml"];
  assert.match(s1, /<pane ySplit="1"[^>]*state="frozen"/);                   // encabezado fijo
  assert.match(s1, /<autoFilter ref="A1:D4"\/>/);                              // filtro
  assert.match(s1, /<c r="A1" s="1" t="inlineStr">/);                           // encabezado con estilo
  assert.match(s1, /<c r="B2"><v>12<\/v><\/c>/);                                // número como número
  assert.match(s1, /<c r="C2" s="2"><v>0\.6667<\/v><\/c>/);                     // porcentaje
  assert.match(s1, /<c r="D2" s="3"><v>46332\.3958/);                            // fecha 6-nov-2026 09:30 como número de Excel
  assert.match(s1, /Ana &lt;b&gt; &amp; &quot;Cía&quot;/);                      // texto escapado
  assert.match(s1, /<c r="A3" t="inlineStr"><is><t xml:space="preserve">=1\+1<\/t>/);   // «=1+1» es texto, no fórmula
  assert.match(s1, /<c r="B3" t="b"><v>1<\/v><\/c>/);
  assert.ok(!/<c r="C3"/.test(s1) && !/<c r="D4"/.test(s1));                    // las celdas vacías no se escriben
  assert.match(s1, /<col min="1" max="1" width="20" customWidth="1"\/>/);
  assert.ok(!/<autoFilter/.test(z["xl/worksheets/sheet2.xml"]));
});
test("un libro sin hojas con datos o con filas vacías tampoco rompe", () => {
  const z = leerZip(buildXlsx([{ name: "Vacía", rows: [] }, { name: "Solo encabezado", header: true, rows: [["a", "b"]] }]));
  assert.ok(!/autoFilter/.test(z["xl/worksheets/sheet2.xml"]));
  assert.match(z["xl/worksheets/sheet1.xml"], /<sheetData><\/sheetData>/);
});
const tienePython = spawnSync("python3", ["-c", "import openpyxl"]).status === 0;
test("lo abre openpyxl (la librería estándar de Python para Excel) y los valores y formatos son los esperados", { skip: !tienePython && "openpyxl no está instalado" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "xlsx-")), f = join(dir, "libro.xlsx"); writeFileSync(f, LIBRO());
  const out = execFileSync("python3", ["-I", "-c", `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb["Datos"]
print(json.dumps({"hojas": wb.sheetnames, "A1": ws["A1"].value, "A2": ws["A2"].value, "B2": ws["B2"].value, "C2": ws["C2"].value, "fmtC2": ws["C2"].number_format,
  "D2": str(ws["D2"].value), "fmtD2": ws["D2"].number_format, "A3": ws["A3"].value, "B3": ws["B3"].value, "tipoA3": ws["A3"].data_type, "B4": ws["B4"].value, "A4": ws["A4"].value,
  "congelado": ws.freeze_panes, "filtro": ws.auto_filter.ref, "negrita": ws["A1"].font.b, "ancho": ws.column_dimensions["A"].width}))`, f]).toString();
  const r = JSON.parse(out);
  assert.deepEqual(r.hojas, ["Datos", "Notas"]);
  assert.deepEqual([r.A1, r.A2, r.B2, r.C2, r.fmtC2], ["Nombre", 'Ana <b> & "Cía"', 12, 0.6667, "0.0%"]);
  assert.deepEqual([r.D2, r.fmtD2], ["2026-11-06 09:30:00", "dd/mm/yyyy\\ hh:mm"]);
  assert.deepEqual([r.A3, r.tipoA3, r.B3, r.B4, r.A4], ["=1+1", "s", true, -3.5, "Ñandú"]);   // «=1+1» queda como texto
  assert.deepEqual([r.congelado, r.filtro, r.negrita, r.ancho], ["A2", "A1:D4", true, 20]);
});
const tieneLO = existsSync("/usr/bin/soffice");
test("lo abre LibreOffice (equivalente a Excel) y lo convierte a CSV con el contenido correcto", { skip: !tieneLO && "LibreOffice no está instalado", timeout: 120000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "xlsx-lo-")), f = join(dir, "libro.xlsx"); writeFileSync(f, LIBRO());
  const r = spawnSync("soffice", ["--headless", "--norestore", `-env:UserInstallation=file://${dir}/perfil`, "--convert-to", "csv:Text - txt - csv (StarCalc):44,34,76,1", "--outdir", dir, f], { timeout: 100000 });
  assert.equal(r.status, 0, String(r.stderr));
  const csv = execFileSync("python3", ["-I", "-c", "import sys,glob; print(open(glob.glob(sys.argv[1]+'/libro*.csv')[0], encoding='utf-8').read())", dir]).toString();
  assert.match(csv, /"Nombre","Edad","Aceptación","Fecha"/);
  assert.match(csv, /"Ana <b> & ""Cía""",12,66\.7%,06\/11\/2026 09:30/);        // número, porcentaje y fecha con su formato
  assert.match(csv, /"=1\+1",TRUE,,/);                                          // «=1+1» se queda como texto (no se evalúa como fórmula) y el booleano es booleano
  assert.match(csv, /"Ñandú",-3\.5,100\.0%/);
});
