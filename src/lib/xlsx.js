// Generador mínimo de archivos Excel (.xlsx) sin dependencias: ZIP sin compresión + XML de hojas con cadenas en línea.
// Soporta varias hojas, texto, números, fechas, porcentajes, encabezado en negrita con fila fija y filtro, y ancho de columnas.

const enc = new TextEncoder();

// ── ZIP (método «stored») ──
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

/** files: [{ name, data: Uint8Array }] → Uint8Array con el .zip */
export function zipStore(files, now = new Date()) {
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

// ── Utilidades XML ──
const BAD_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
export const xmlText = (v) => String(v).replace(BAD_XML, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function colName(i) { let s = ""; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; }
/** Nombre de hoja válido: sin \ / ? * [ ] :, hasta 31 caracteres, sin repetirse (sin distinguir mayúsculas). */
export function sheetNames(names) {
  const used = new Set();
  return names.map((n, i) => {
    let base = String(n || `Hoja${i + 1}`).replace(BAD_XML, "").replace(/[\\/?*[\]:]/g, "-").replace(/^'+|'+$/g, "").trim().slice(0, 31) || `Hoja${i + 1}`, name = base, k = 2;
    while (used.has(name.toLowerCase())) { const suf = ` (${k++})`; name = base.slice(0, 31 - suf.length) + suf; }
    used.add(name.toLowerCase()); return name;
  });
}
// Estilos: 0 normal · 1 encabezado · 2 porcentaje · 3 fecha y hora · 4 texto largo · 5 título · 6 negrita
const STYLE = { header: 1, pct: 2, date: 3, wrap: 4, title: 5, bold: 6 };
const excelDate = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) / 86400000 + 25569;   // hora local tal cual, sin zona

function cellXml(ref, spec) {
  let v = spec, s = 0;
  if (spec && typeof spec === "object" && !(spec instanceof Date) && "v" in spec) { v = spec.v; s = STYLE[spec.s] || 0; }
  if (v === null || v === undefined || v === "") return s ? `<c r="${ref}" s="${s}"/>` : "";
  if (v instanceof Date) return isNaN(v) ? "" : `<c r="${ref}" s="${s || STYLE.date}"><v>${excelDate(v)}</v></c>`;
  if (typeof v === "number") return Number.isFinite(v) ? `<c r="${ref}"${s ? ` s="${s}"` : ""}><v>${v}</v></c>` : "";
  if (typeof v === "boolean") return `<c r="${ref}"${s ? ` s="${s}"` : ""} t="b"><v>${v ? 1 : 0}</v></c>`;
  return `<c r="${ref}"${s ? ` s="${s}"` : ""} t="inlineStr"><is><t xml:space="preserve">${xmlText(String(v).slice(0, 32000))}</t></is></c>`;
}

/**
 * sheets: [{ name, rows: [[celda, …], …], widths?: [ancho, …], header?: true (primera fila = encabezado: negrita, fija y con filtro) }]
 * Una celda es un valor (texto, número, fecha, booleano) o { v, s: "pct" | "date" | "wrap" | "title" | "bold" | "header" }.
 */
export function buildXlsx(sheets, now = new Date()) {
  const names = sheetNames(sheets.map((s) => s.name));
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const REL = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const files = [];
  files.push({ name: "[Content_Types].xml", data: enc.encode(head + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`) });
  files.push({ name: "_rels/.rels", data: enc.encode(head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') });
  files.push({ name: "xl/workbook.xml", data: enc.encode(head + `<workbook ${NS} ${REL}><sheets>${names.map((n, i) => `<sheet name="${xmlText(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`) });
  files.push({ name: "xl/_rels/workbook.xml.rels", data: enc.encode(head + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) });
  files.push({ name: "xl/styles.xml", data: enc.encode(head + `<styleSheet ${NS}><numFmts count="2"><numFmt numFmtId="164" formatCode="0.0%"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy\\ hh:mm"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F1"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`) });
  sheets.forEach((sh, i) => {
    const rows = sh.rows || [];
    const cols = Math.max(0, ...rows.map((r) => r.length));
    const body = rows.map((r, ri) => { const cells = r.map((c, ci) => cellXml(`${colName(ci)}${ri + 1}`, sh.header && ri === 0 && !(c && typeof c === "object" && "v" in c) ? { v: c, s: "header" } : c)).join(""); return cells ? `<row r="${ri + 1}">${cells}</row>` : ""; }).join("");
    const pane = sh.header ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : "";
    const widths = sh.widths ? `<cols>${sh.widths.map((w, k) => `<col min="${k + 1}" max="${k + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    const filter = sh.header && rows.length > 1 && cols > 0 ? `<autoFilter ref="A1:${colName(cols - 1)}${rows.length}"/>` : "";
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(head + `<worksheet ${NS}><sheetViews><sheetView workbookViewId="0"${i === 0 ? ' tabSelected="1"' : ""}>${pane}</sheetView></sheetViews>${widths}<sheetData>${body}</sheetData>${filter}</worksheet>`) });
  });
  return zipStore(files, now);
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
