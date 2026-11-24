// Reportes sociométricos: datos (probados) + un único generador de HTML para vista previa, HTML descargado y PDF.
import { hasType, density } from "./sociometry.js";
import { LOGO_DATA_URI } from "./logoData.js";

export const REPORT_TYPES = { individual: "Individual", grupal: "Grupal", ambos: "Completo", estudiante: "De un estudiante" };
export const ROLE_LABELS = { controvertido: "Controvertido", lider: "Líder", rechazado: "Rechazado", aislado: "Aislado", integrado: "Integrado", regular: "Regular" };
export const ROLE_HELP = {
  lider: "Lo eligen al menos la mitad de sus compañeros y casi no lo rechazan.",
  controvertido: "Recibe muchas elecciones y también muchos rechazos.",
  rechazado: "Lo rechazan al menos la mitad de sus compañeros y casi nadie lo elige.",
  aislado: "Nadie lo ha elegido positivamente.",
  integrado: "Tiene al menos 2 relaciones de elección mutua positiva.",
  regular: "Sin un patrón destacado.",
};

/** Escapa texto para meterlo en HTML o en un atributo. Todo nombre o texto de una persona pasa por aquí. */
export const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const safeColor = (c, d = "#3b82f6") => (/^#[0-9a-fA-F]{6}$/.test(String(c)) ? c : d);
const same = (a, b) => String(a) === String(b);
const pct = (k, t) => (t > 0 ? ((k / t) * 100).toFixed(1) : "0.0");

/** Más estudiantes que esto y la matriz del reporte «Completo» no se incluye (sería un archivo gigante e ilegible). */
export const MATRIZ_MAX_REPORTE = 120;

/** Umbral de «muchos»: la mitad del grupo (n − 1 compañeros), con un mínimo de 2. */
export const roleThreshold = (n) => Math.max(2, Math.ceil((n - 1) / 2));

/**
 * Cifras y rol de un estudiante dentro de `stList`/`cnList` (siempre lo visible, del mismo grupo de análisis).
 * Roles (inspirados en las categorías sociométricas clásicas):
 *  controvertido: muchas elecciones Y muchos rechazos · líder: muchas elecciones, pocos rechazos ·
 *  rechazado: muchos rechazos, pocas elecciones · aislado: nadie lo eligió positivamente ·
 *  integrado: ≥ 2 mutuas positivas · regular: el resto.
 */
/** Índices para no recorrer todas las conexiones por cada estudiante (con 1.500 estudiantes pasaba de 7 s a milisegundos). */
function indexar(stList, cnList) {
  const byId = new Map(stList.map((s) => [String(s.id), s]));
  const out = new Map(), inn = new Map(), pares = { pos: new Set(), neg: new Set(), neu: new Set() };
  for (const c of cnList) {
    const f = String(c.f), t = String(c.t);
    if (!out.has(f)) out.set(f, []); out.get(f).push(c);
    if (!inn.has(t)) inn.set(t, []); inn.get(t).push(c);
    for (const ty of ["pos", "neg", "neu"]) if (hasType(c, ty)) pares[ty].add(f + ">" + t);
  }
  return { byId, out, inn, pares };
}

export function studentStats(s, stList, cnList, ix = indexar(stList, cnList)) {
  const t = stList.length - 1, thr = roleThreshold(stList.length);
  const sid = String(s.id);
  const out = ix.out.get(sid) || [], inn = ix.inn.get(sid) || [];
  const posR = inn.filter((c) => hasType(c, "pos")).length;
  const negR = inn.filter((c) => hasType(c, "neg")).length;
  const neuR = inn.filter((c) => hasType(c, "neu")).length;
  const back = (c, ty) => ix.pares[ty].has(String(c.t) + ">" + sid);
  const mutuasPos = out.filter((c) => hasType(c, "pos") && back(c, "pos")).length;
  const rechazosMutuos = out.filter((c) => hasType(c, "neg") && back(c, "neg")).length;
  let rol = "regular";
  if (posR >= thr && negR >= thr) rol = "controvertido";
  else if (posR >= thr) rol = "lider";
  else if (negR >= thr) rol = "rechazado";
  else if (posR === 0) rol = "aislado";
  else if (mutuasPos >= 2) rol = "integrado";
  return { hechas: out.length, recibidas: inn.length, posR, negR, neuR, mutuasPos, rechazosMutuos, popularidad: pct(posR, t), rechazo: pct(negR, t), expansion: pct(out.length, t), rol, rolLabel: ROLE_LABELS[rol] };
}

/** Todo lo que necesitan los reportes, ya calculado. */
export function computeReport(stList, cnList, extra = {}) {
  const n = stList.length;
  const ix = indexar(stList, cnList);
  const rows = stList.map((s) => ({ student: s, ...studentStats(s, stList, cnList, ix) }));
  const nameOf = (id) => { const s = ix.byId.get(String(id)); return s ? s.name : "?"; };
  const byRole = Object.fromEntries(Object.keys(ROLE_LABELS).map((k) => [k, rows.filter((r) => r.rol === k)]));
  const groups = [...new Set(stList.map((s) => s.group))].map((g) => {
    const miembros = rows.filter((r) => r.student.group === g);
    const inG = (id) => { const s = ix.byId.get(String(id)); return s ? s.group : null; };
    const connInt = cnList.filter((c) => inG(c.f) === g && inG(c.t) === g).length;
    const connExt = cnList.filter((c) => inG(c.f) !== null && inG(c.t) !== null && inG(c.f) !== inG(c.t) && (inG(c.f) === g || inG(c.t) === g)).length;
    return { group: g, miembros: miembros.length, connInt, connExt, densidad: miembros.length > 1 ? density(connInt, miembros.length) + "%" : "N/A",
      lideres: miembros.filter((r) => r.rol === "lider").map((r) => r.student.name),
      counts: { lider: miembros.filter((r) => r.rol === "lider").length, controvertido: miembros.filter((r) => r.rol === "controvertido").length, rechazado: miembros.filter((r) => r.rol === "rechazado").length, aislado: miembros.filter((r) => r.rol === "aislado").length } };
  });
  const fichas = rows.map((r) => {
    const id = r.student.id;
    const inn = ix.inn.get(String(id)) || [], out = ix.out.get(String(id)) || [];
    const list = (arr, ty, key) => arr.filter((c) => hasType(c, ty)).map((c) => nameOf(c[key])).sort((a, b) => a.localeCompare(b, "es"));
    const mutuas = out.filter((c) => hasType(c, "pos") && ix.pares.pos.has(String(c.t) + ">" + String(id))).map((c) => nameOf(c.t)).sort((a, b) => a.localeCompare(b, "es"));
    // Explicaciones escritas por quien eligió (preguntas con «justificar»): las que recibió y las que dio.
    const porNombre = (a, b, k) => String(a[k]).localeCompare(String(b[k]), "es") || String(a.q).localeCompare(String(b.q), "es");
    const notasRecibidas = inn.flatMap((c) => (c.notas || []).map((n) => ({ de: nameOf(c.f), ...n }))).sort((a, b) => porNombre(a, b, "de"));
    const notasHechas = out.flatMap((c) => (c.notas || []).map((n) => ({ para: nameOf(c.t), ...n }))).sort((a, b) => porNombre(a, b, "para"));
    return { row: r, eligieronPos: list(inn, "pos", "f"), rechazaron: list(inn, "neg", "f"), neutralDe: list(inn, "neu", "f"), eligioPos: list(out, "pos", "t"), rechazo: list(out, "neg", "t"), mutuas, notasRecibidas, notasHechas };
  });
  return {
    n, rows, byRole, groups, fichas, conns: cnList, students: stList, abiertas: extra.abiertas || [],
    kpis: {
      participantes: n, conexiones: cnList.length,
      positivas: cnList.filter((c) => hasType(c, "pos")).length, rechazos: cnList.filter((c) => hasType(c, "neg")).length,
      mutuasPos: Math.round(rows.reduce((a, r) => a + r.mutuasPos, 0) / 2), rechazosMutuos: Math.round(rows.reduce((a, r) => a + r.rechazosMutuos, 0) / 2),
      densidad: density(cnList.length, n),
      justificaciones: cnList.reduce((a, c) => a + (c.notas ? c.notas.length : 0), 0),
      abiertas: (extra.abiertas || []).length,
    },
  };
}

export const reportFileName = (groupLabel, type, ext) => `reporte_rednexo_${REPORT_TYPES[type] || "Completo"}_${String(groupLabel).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "grupo"}.${ext}`;

export const REPORT_CSS = `:root{--ink:#1b2a3a;--txt:#2d3b4b;--soft:#5a6a7c;--line:#dbe3ec;--fill:#f4f8fc;--accent:#3a6ea5;--accent-d:#2d5a8c;--pos:#2a8268;--posbg:#e8f5ef;--neg:#bd4b47;--negbg:#fcecec;--warn:#a8721a;--warnbg:#fdf4e1;--infobg:#eaf2fa;--vio:#6a5aa6;--viobg:#f1eefa}*{box-sizing:border-box;margin:0;padding:0}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:"Inter","Segoe UI","Helvetica Neue",Arial,sans-serif;background:#fff;color:var(--txt);font-size:14px;line-height:1.65}.page{max-width:1000px;margin:0 auto;padding:36px 30px 30px}.doc-head{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:16px;border-bottom:2px solid #c9dcee}.logo{height:58px;width:auto;display:block}.doc-head .meta{text-align:right;font-size:12.5px;color:var(--soft);line-height:1.6}.doc-title{margin:24px 0 22px}.kicker{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent-d);font-weight:700;margin-bottom:8px}h1{font:400 32px/1.15 Georgia,"Times New Roman",serif;color:var(--ink)}.sub-t{font-size:13.5px;color:var(--soft);margin-top:8px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0 28px}.kpi{padding:16px 18px;border-radius:10px;background:var(--infobg);border:1px solid #d3e3f3}.kpi:nth-child(2){background:var(--posbg);border-color:#cfe8dd}.kpi:nth-child(3){background:var(--negbg);border-color:#f2d3d2}.kpi:nth-child(4){background:var(--viobg);border-color:#ddd6f1}.kpi .val{font:400 34px/1 Georgia,"Times New Roman",serif;color:var(--accent-d)}.kpi:nth-child(2) .val{color:var(--pos)}.kpi:nth-child(3) .val{color:var(--neg)}.kpi:nth-child(4) .val{color:var(--vio)}.kpi .lbl{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--txt);margin-top:8px;font-weight:600}.section{margin-bottom:30px}.section h2{font:400 21px Georgia,"Times New Roman",serif;color:var(--ink);padding-bottom:6px;border-bottom:2px solid #dbe7f3;margin-bottom:6px}.section h3{font:600 14.5px "Inter","Segoe UI",Arial,sans-serif;color:var(--ink)}.section .sub{font-size:13px;color:var(--soft);margin-bottom:14px}.sub2{font-size:12.5px;color:var(--soft);margin:2px 0 10px}table{border-collapse:collapse;width:100%;font-size:13px;margin-top:10px}th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#46586c;font-weight:700;text-align:center;padding:9px 10px;background:var(--fill);border-bottom:2px solid #bcd0e4}td{padding:9px 10px;text-align:center;border-bottom:1px solid #e6edf4;color:var(--txt)}tbody tr:nth-child(even) td{background:#fafcfe}td:first-child,th:first-child{text-align:left}td b{color:var(--ink);font-weight:600}.pos{color:var(--pos);font-weight:600}.neg{color:var(--neg);font-weight:600}.mut{color:var(--vio);font-weight:600}th.pos,th.neg{color:#46586c}table.matriz{font-size:13px}table.matriz th{font-size:10px}table.matriz td,table.matriz th{padding:5px 3px}.badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;color:var(--accent-d);background:var(--infobg);border:1px solid #d3e3f3}.role{display:inline-block;padding:2px 11px;border-radius:12px;font-size:12px;font-weight:600;color:#46586c;background:#eef1f5;border:1px solid #dde3ea}.role-lider{color:#1f7a5c;background:var(--posbg);border-color:#cfe8dd}.role-integrado{color:var(--accent-d);background:var(--infobg);border-color:#d3e3f3}.role-controvertido{color:#8a5d10;background:var(--warnbg);border-color:#f0e0b8}.role-aislado{color:#5a4a96;background:var(--viobg);border-color:#ddd6f1}.role-rechazado{color:#a63d39;background:var(--negbg);border-color:#f2d3d2}.tag{display:inline-block;margin-left:8px;padding:1px 9px;border-radius:10px;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:#46586c;background:#eef1f5;font-weight:600;vertical-align:middle}.tag-neg{color:#a63d39;background:var(--negbg)}.alert{padding:11px 15px;margin-bottom:10px;font-size:13.5px;border-left:4px solid #9fb3c8;border-radius:0 8px 8px 0;background:var(--fill);color:var(--ink)}.alert b{color:var(--ink)}.alert-ok{border-left-color:var(--pos);background:var(--posbg)}.alert-info{border-left-color:var(--accent);background:var(--infobg)}.alert-warn{border-left-color:#d19a2f;background:var(--warnbg)}.banner{padding:11px 15px;margin-bottom:18px;font-size:13px;border-radius:8px;border:1px solid #d3e3f3;background:var(--infobg);color:var(--txt)}.banner b{color:var(--ink)}.banner-conf{border-color:#efc9c7;background:var(--negbg);color:#7d2f2c}.banner-conf b{color:#7d2f2c}.fichas{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:10px}.ficha{border:1px solid var(--line);border-radius:10px;padding:14px 16px;break-inside:avoid;background:#fff;box-shadow:0 1px 3px rgba(40,70,100,.06)}.ficha h3{font:600 14.5px "Inter","Segoe UI",Arial,sans-serif;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;color:var(--ink)}.ficha .nums{font-size:12px;color:var(--soft);margin-bottom:8px}.ficha .ln{font-size:13px;margin:4px 0;line-height:1.55}.ficha .ln b{color:var(--ink);font-weight:600}.ficha .none{color:var(--warn)}.notas{margin:5px 0 9px 20px;font-size:13px;color:var(--txt)}.notas li{margin:5px 0}.notas .q{color:var(--soft);font-size:12px}table.expl th,table.expl td{text-align:left}.footer{margin-top:34px;padding-top:12px;border-top:2px solid #dbe7f3;font-size:12px;color:var(--soft);text-align:center}.barra{position:fixed;top:0;left:0;right:0;z-index:999;background:#fff;border-bottom:1px solid var(--line);padding:10px 22px;display:flex;align-items:center;gap:12px;font-size:13.5px;color:var(--ink)}.barra span{flex:1}.barra button{border:0;background:var(--accent);color:#fff;padding:8px 18px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit}.barra button.sec{background:#eef1f5;color:var(--ink)}@media print{body{background:#fff}.no-print{display:none}.kpis,.alert,.banner{break-inside:avoid}tr{break-inside:avoid}.section h2{break-after:avoid}}`;
export const LOGO_SVG = `<img class="logo" src="${LOGO_DATA_URI}" alt="Iskonex RedNexo">`;

/** Cabecera común de los documentos: logo y datos a la derecha, luego etiqueta y título. Los textos deben venir ya escapados. */
export const cabeceraHTML = ({ etiqueta, titulo, subtitulo = "", meta = [] }) => `<div class="doc-head">${LOGO_SVG}<div class="meta">${meta.map((m) => `<div>${m}</div>`).join("")}</div></div><div class="doc-title"><div class="kicker">${etiqueta}</div><h1>${titulo}</h1>${subtitulo ? `<div class="sub-t">${subtitulo}</div>` : ""}</div>`;

/**
 * Documento HTML completo del reporte. mode: "html" (descarga), "pdf" (ventana con barra de imprimir) o "preview" (iframe sin scripts).
 *  individual: índices por estudiante + ficha de cada uno.  grupal: SIN nombres (apto para compartir): cifras, roles en conteos y tabla de grupos.
 *  ambos (completo): todo, incluida la matriz con nombres.
 */
export function renderReportHTML(report, { type = "ambos", groupLabel = "Todos los grupos", date = "", mode = "html", colors = {} } = {}) {
  const k = report.kpis, isG = type === "grupal", showIdx = type === "individual" || type === "ambos", showGrp = type === "grupal" || type === "ambos";
  const badge = (g) => `<span class="badge">${esc(g)}</span>`;
  const role = (key) => `<span class="role role-${key}" title="${esc(ROLE_HELP[key])}">${ROLE_LABELS[key]}</span>`;
  const names = (arr) => arr.map((r) => esc(r.student.name)).join(", ");
  const R = report.byRole;
  const nombres = new Map(report.students.map((s) => [String(s.id), s.name]));
  const nameOf2 = (id) => nombres.get(String(id)) || "?";

  const kpis = `<div class="kpis"><div class="kpi"><div class="val">${k.participantes}</div><div class="lbl">Participantes</div></div><div class="kpi"><div class="val">${k.positivas}</div><div class="lbl">Elecciones positivas</div></div><div class="kpi"><div class="val">${k.rechazos}</div><div class="lbl">Rechazos</div></div><div class="kpi"><div class="val">${k.mutuasPos}</div><div class="lbl">Mutuas positivas</div></div></div>`;

  const alerts = [];
  if (isG) {
    alerts.push(`<div class="banner">Reporte <b>sin nombres de estudiantes</b>: no indica quién eligió o rechazó a quién. Aun así contiene información sobre un grupo de menores: compártelo solo con quien corresponda.</div>`);
    alerts.push(`<div class="alert alert-info"><b>Densidad:</b> ${k.densidad}% · <b>Relaciones mutuas positivas:</b> ${k.mutuasPos}${k.rechazosMutuos ? ` · <b>Rechazos mutuos:</b> ${k.rechazosMutuos}` : ""}</div>`);
    alerts.push(`<div class="alert alert-ok"><b>Con liderazgo:</b> ${R.lider.length} · <b>Controvertidos:</b> ${R.controvertido.length}</div>`);
    if (R.rechazado.length + R.aislado.length > 0) alerts.push(`<div class="alert alert-warn"><b>Rechazados:</b> ${R.rechazado.length} · <b>Sin elecciones positivas (aislados):</b> ${R.aislado.length}</div>`);
  } else {
    if (R.lider.length) alerts.push(`<div class="alert alert-ok"><b>Líderes (${R.lider.length}):</b> ${names(R.lider)}</div>`);
    if (R.controvertido.length) alerts.push(`<div class="alert alert-info"><b>Controvertidos (${R.controvertido.length}):</b> ${names(R.controvertido)} — reciben muchas elecciones y muchos rechazos.</div>`);
    if (R.rechazado.length) alerts.push(`<div class="alert alert-warn"><b>Rechazados (${R.rechazado.length}):</b> ${names(R.rechazado)}</div>`);
    if (R.aislado.length) alerts.push(`<div class="alert alert-warn"><b>Aislados — nadie los eligió positivamente (${R.aislado.length}):</b> ${names(R.aislado)}</div>`);
    alerts.push(`<div class="alert alert-info"><b>Densidad:</b> ${k.densidad}% · <b>Relaciones mutuas positivas:</b> ${k.mutuasPos}${k.rechazosMutuos ? ` · <b>Rechazos mutuos:</b> ${k.rechazosMutuos}` : ""}</div>`);
  }
  const resumen = `<div class="section"><h2>Resumen</h2><div class="sub">Hallazgos clave — ${esc(groupLabel)}</div>${alerts.join("")}</div>`;

  const idxRows = report.rows.map((r) => `<tr><td><b>${esc(r.student.name)}</b></td><td>${badge(r.student.group)}</td><td>${r.hechas}</td><td>${r.recibidas}</td><td class="pos">${r.posR}</td><td class="neg">${r.negR}</td><td class="mut">${r.mutuasPos}</td><td class="pos">${r.popularidad}%</td><td class="neg">${r.rechazo}%</td><td>${r.expansion}%</td><td>${role(r.rol)}</td></tr>`).join("");
  const indices = `<div class="section"><h2>Índices individuales</h2><div class="sub">Aceptación = elecciones positivas recibidas ÷ (participantes − 1) · Rechazo = rechazos recibidos ÷ (participantes − 1) · Expansión = a cuántos eligió ÷ (participantes − 1)</div><table><thead><tr><th>Nombre</th><th>Grupo</th><th>Elige</th><th>Recibe</th><th class="pos">Pos.</th><th class="neg">Neg.</th><th class="mut">Mutuas (+)</th><th class="pos">Aceptación</th><th class="neg">Rechazo</th><th>Expansión</th><th>Rol</th></tr></thead><tbody>${idxRows}</tbody></table></div>`;

  const grpRows = report.groups.map((g) => isG
    ? `<tr><td>${badge(g.group)}</td><td>${g.miembros}</td><td class="pos">${g.connInt}</td><td>${g.connExt}</td><td><b>${g.densidad}</b></td><td>${g.counts.lider}</td><td>${g.counts.controvertido}</td><td>${g.counts.rechazado}</td><td>${g.counts.aislado}</td></tr>`
    : `<tr><td>${badge(g.group)}</td><td>${g.miembros}</td><td class="pos">${g.connInt}</td><td>${g.connExt}</td><td><b>${g.densidad}</b></td><td>${g.lideres.length ? `<b>${g.lideres.map(esc).join(", ")}</b>` : "—"}</td></tr>`).join("");
  const grupos = `<div class="section"><h2>Grupos</h2><div class="sub">Conexiones dentro de cada grupo y hacia otros grupos</div><table><thead><tr><th>Grupo</th><th>Miembros</th><th class="pos">Conn. int.</th><th>Conn. ext.</th><th>Densidad</th>${isG ? `<th>Líderes</th><th>Controvertidos</th><th>Rechazados</th><th>Aislados</th>` : `<th>Líder</th>`}</tr></thead><tbody>${grpRows}</tbody></table></div>`;

  let matriz = "";
  if (type === "ambos" && report.students.length > MATRIZ_MAX_REPORTE) {
    matriz = `<div class="section"><h2>Matriz sociométrica</h2><div class="alert alert-warn">Con <b>${report.students.length}</b> estudiantes la matriz es demasiado grande para incluirla (máximo ${MATRIZ_MAX_REPORTE}). Genera el reporte de un solo grupo para ver su matriz, o descarga el Excel de resultados.</div></div>`;
  } else if (type === "ambos") {
    const st = report.students, cn = report.conns;
    const porPar = new Map(cn.map((x) => [String(x.f) + ">" + String(x.t), x]));
    const th = `<th style="min-width:90px">De ↓ / Para →</th>` + st.map((s) => `<th title="${esc(s.name)}" style="min-width:32px">${esc(s.av || String(s.name).slice(0, 2))}</th>`).join("") + `<th class="pos">Σ+</th><th class="neg">Σ−</th>`;
    const body = st.map((from) => {
      let pos = 0, neg = 0;
      const cells = st.map((to) => {
        if (same(from.id, to.id)) return `<td style="background:#eef3f8;color:#9aa6b5">—</td>`;
        const c = porPar.get(String(from.id) + ">" + String(to.id)), rev = porPar.get(String(to.id) + ">" + String(from.id));
        if (hasType(c, "pos")) pos++; if (hasType(c, "neg")) neg++;
        const sym = c ? (c.tp === "pos" ? (rev ? "◆" : "+") : c.tp === "neg" ? "−" : "○") : "";
        const col = c ? (c.tp === "pos" ? (rev ? "#1f7a5c" : "#2a8268") : c.tp === "neg" ? "#bd4b47" : "#a8721a") : "#ccc";
        const extra = c && c.types && c.types.length > 1 ? `<sup style="font-size:7px">${c.types.map((x) => (x === "pos" ? "+" : x === "neg" ? "−" : "○")).join("")}</sup>` : "";
        return `<td style="color:${col};font-weight:${rev ? "800" : "600"}">${sym}${extra}</td>`;
      }).join("");
      return `<tr><td style="font-weight:700;white-space:nowrap">${esc(from.av || "")} ${esc(from.name)}</td>${cells}<td class="pos">${pos}</td><td class="neg">${neg}</td></tr>`;
    }).join("");
    matriz = `<div class="section"><h2>Matriz sociométrica</h2><div class="sub">Fila = quien responde · columna = a quién marcó · + positiva · ◆ positiva mutua · − rechazo · ○ neutral · el índice pequeño lista los demás tipos marcados</div><table class="matriz"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  // Explicaciones escritas (texto de una persona: siempre escapado).
  const notasHtml = (label, arr, quien) => (arr && arr.length ? `<div class="ln"><b>${label}:</b></div><ul class="notas">${arr.map((n) => `<li><b>${esc(n[quien])}</b>${n.q ? ` <span class="q">· ${esc(n.q)}</span>` : ""}<br><i>«${esc(n.text)}»</i></li>`).join("")}</ul>` : "");
  const lines = (label, arr, cls = "") => (arr.length ? `<div class="ln"><b>${label}:</b> ${arr.map(esc).join(", ")}</div>` : "");
  const fichaHtml = report.fichas.map((f) => {
    const r = f.row;
    return `<div class="ficha"><h3>${esc(r.student.name)} ${badge(r.student.group)} ${role(r.rol)}</h3><div class="nums">Elige ${r.hechas} · Recibe ${r.recibidas} · Aceptación ${r.popularidad}% · Rechazo ${r.rechazo}%</div>${f.eligieronPos.length ? lines("Lo eligieron positivamente", f.eligieronPos) : `<div class="ln none">Nadie lo eligió positivamente.</div>`}${lines("Lo rechazaron", f.rechazaron)}${lines("Lo marcaron como neutral", f.neutralDe)}${lines("Eligió positivamente a", f.eligioPos)}${lines("Rechazó a", f.rechazo)}${lines("Elección mutua positiva con", f.mutuas)}${notasHtml("Por qué lo eligieron o marcaron", f.notasRecibidas, "de")}${notasHtml("Por qué eligió o marcó a cada uno", f.notasHechas, "para")}</div>`;
  }).join("");
  // Todas las explicaciones agrupadas por pregunta: quién responde → a quién eligió → qué escribió.
  const porPregunta = new Map();
  for (const c of report.conns) for (const n of c.notas || []) {
    const k = n.q || "(pregunta)";
    if (!porPregunta.has(k)) porPregunta.set(k, { tp: n.tp, filas: [] });
    porPregunta.get(k).filas.push({ de: nameOf2(c.f), para: nameOf2(c.t), text: n.text });
  }
  const explicaciones = porPregunta.size === 0 ? "" : `<div class="section"><h2>Explicaciones de las elecciones</h2><div class="sub">Lo que escribieron los estudiantes para justificar a quién eligieron. Confidencial: solo para el equipo del colegio.</div>${[...porPregunta.entries()].map(([q, g]) => `<h3 style="margin:16px 0 4px">${esc(q)} <span class="tag${g.tp === "neg" ? " tag-neg" : ""}">${g.tp === "neg" ? "Negativa" : g.tp === "neu" ? "Neutral" : "Positiva"}</span></h3><table class="expl"><thead><tr><th>Estudiante</th><th>Eligió a</th><th>Explicación</th></tr></thead><tbody>${g.filas.sort((a, b) => a.de.localeCompare(b.de, "es") || a.para.localeCompare(b.para, "es")).map((f) => `<tr><td>${esc(f.de)}</td><td>${esc(f.para)}</td><td><i>«${esc(f.text)}»</i></td></tr>`).join("")}</tbody></table>`).join("")}</div>`;
  // Respuestas a preguntas abiertas (opiniones y sugerencias), agrupadas por pregunta. Solo para el equipo: llevan el nombre de quien escribió.
  const porAbierta = new Map();
  for (const a of report.abiertas || []) { if (!porAbierta.has(a.pregunta)) porAbierta.set(a.pregunta, []); porAbierta.get(a.pregunta).push(a); }
  const abiertasHtml = porAbierta.size === 0 ? "" : `<div class="section"><h2>Respuestas abiertas</h2><div class="sub">Opiniones, sugerencias o datos que escribieron los estudiantes en preguntas de texto libre. Confidencial: solo para el equipo del colegio.</div>${[...porAbierta.entries()].map(([q, filas]) => `<h3 style="margin:16px 0 4px">${esc(q)} <span class="tag">${filas.length} respuesta${filas.length === 1 ? "" : "s"}</span></h3><table class="expl"><thead><tr><th>Estudiante</th><th>Grupo</th><th>Respuesta</th></tr></thead><tbody>${filas.map((f) => `<tr><td>${esc(f.de)}</td><td>${esc(f.grupo)}</td><td><i>«${esc(f.text)}»</i></td></tr>`).join("")}</tbody></table>`).join("")}</div>`;
  const fichas = `<div class="section"><h2>Fichas por estudiante</h2><div class="sub">Quién eligió o rechazó a cada estudiante y a quién eligió o rechazó. Información confidencial.</div><div class="fichas">${fichaHtml}</div></div>`;

  const toolbar = mode === "pdf"
    ? `<div class="barra no-print"><span>RedNexo · Reporte ${REPORT_TYPES[type]} · ${esc(groupLabel)}</span><button onclick="window.print()">Imprimir / Guardar PDF</button><button class="sec" onclick="window.close()">Cerrar</button></div><div style="height:46px" class="no-print"></div>`
    : "";
  const sections = [resumen, showIdx ? indices : "", showGrp ? grupos : "", matriz, showIdx ? explicaciones : "", showIdx ? abiertasHtml : "", showIdx ? fichas : ""].join("");
  const empty = report.n === 0 ? `<div class="section"><div class="alert alert-warn">No hay participantes en este grupo.</div></div>` : "";
  const extraCss = mode === "pdf" ? `@page{size:A4;margin:14mm 12mm}body{font-size:12px}.page{padding:6px 0}table{font-size:11.5px}th,td{padding:7px 8px}.kpi .val{font-size:30px}` : "";
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reporte RedNexo ${REPORT_TYPES[type]} — ${esc(groupLabel)}</title><style>${REPORT_CSS}${extraCss}</style></head><body>${toolbar}<div class="page">${cabeceraHTML({ etiqueta: "Reporte " + REPORT_TYPES[type], titulo: esc(groupLabel), subtitulo: "Inteligencia sociométrica escolar", meta: [esc(date), k.participantes + " participantes", k.conexiones + " conexiones"] })}${kpis}${empty || sections}<div class="footer">RedNexo — ${esc(date)} · ${esc(groupLabel)} · Documento confidencial</div></div></body></html>`;
}
