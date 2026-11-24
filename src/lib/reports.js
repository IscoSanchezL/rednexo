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

export const REPORT_CSS = `:root{--ink:#14202e;--txt:#2a3441;--soft:#667385;--line:#d8dee6;--fill:#f4f6f9;--accent:#1f4e8c;--warn:#8a5a14;--neg:#8f2d2d}*{box-sizing:border-box;margin:0;padding:0}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:"Inter","Segoe UI","Helvetica Neue",Arial,sans-serif;background:#fff;color:var(--txt);font-size:12.5px;line-height:1.55}.page{max-width:980px;margin:0 auto;padding:36px 28px 28px}.doc-head{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:14px;border-bottom:1.5px solid var(--ink)}.logo{height:30px;width:auto;display:block}.doc-head .meta{text-align:right;font-size:11px;color:var(--soft);line-height:1.6}.doc-title{margin:22px 0 22px}.kicker{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);font-weight:600;margin-bottom:7px}h1{font:400 28px/1.15 Georgia,"Times New Roman",serif;color:var(--ink);letter-spacing:-.005em}.sub-t{font-size:12px;color:var(--soft);margin-top:7px}.kpis{display:flex;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin:0 0 26px}.kpi{flex:1;padding:14px 16px;border-right:1px solid var(--line);text-align:left}.kpi:last-child{border-right:0}.kpi .val{font:400 30px/1 Georgia,"Times New Roman",serif;color:var(--ink)}.kpi .lbl{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--soft);margin-top:7px}.section{margin-bottom:28px}.section h2{font:400 17px Georgia,"Times New Roman",serif;color:var(--ink);padding-bottom:5px;border-bottom:1px solid var(--line);margin-bottom:5px}.section h3{font:600 12.5px "Inter","Segoe UI",Arial,sans-serif;color:var(--ink)}.section .sub{font-size:11px;color:var(--soft);margin-bottom:12px}.sub2{font-size:11px;color:var(--soft);margin:2px 0 10px}table{border-collapse:collapse;width:100%;font-size:11px;margin-top:8px}th{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);font-weight:600;text-align:center;padding:6px 8px;border-bottom:1.5px solid var(--ink)}td{padding:6px 8px;text-align:center;border-bottom:1px solid #e6eaef;color:var(--txt)}td:first-child,th:first-child{text-align:left}td b{color:var(--ink);font-weight:600}.pos{color:var(--ink);font-weight:600}.neg{color:var(--neg);font-weight:600}.mut{color:var(--ink)}th.pos,th.neg{color:var(--soft)}.badge{display:inline-block;padding:1px 7px;border:1px solid var(--line);border-radius:2px;font-size:10px;color:var(--txt);background:#fff}.role{display:inline-block;padding:1px 7px;border:1px solid #b9c2cf;border-radius:2px;font-size:10px;font-weight:600;color:var(--txt);background:#fff}.role-lider,.role-integrado{border-color:var(--accent);color:var(--accent)}.role-controvertido,.role-aislado{border-color:var(--warn);color:var(--warn)}.role-rechazado{border-color:var(--neg);color:var(--neg)}.tag{display:inline-block;margin-left:6px;padding:0 6px;border:1px solid var(--line);border-radius:2px;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--soft);font-weight:500;vertical-align:middle}.tag-neg{color:var(--neg);border-color:#dcbcbc}.alert{padding:9px 13px;margin-bottom:8px;font-size:12px;border-left:3px solid #9aa6b5;background:var(--fill);color:var(--txt)}.alert b{color:var(--ink)}.alert-ok{border-left-color:#9aa6b5}.alert-info{border-left-color:var(--accent)}.alert-warn{border-left-color:var(--warn)}.banner{padding:9px 13px;margin-bottom:16px;font-size:11px;border:1px solid var(--line);background:var(--fill);color:var(--soft)}.banner b{color:var(--ink)}.banner-conf{border-color:var(--neg);background:#fff;color:var(--neg)}.banner-conf b{color:var(--neg)}.fichas{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px}.ficha{border:1px solid var(--line);padding:11px 13px;break-inside:avoid;background:#fff}.ficha h3{font:600 12.5px "Inter","Segoe UI",Arial,sans-serif;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px;color:var(--ink)}.ficha .nums{font-size:10px;color:var(--soft);margin-bottom:7px}.ficha .ln{font-size:11px;margin:3px 0;line-height:1.5}.ficha .ln b{color:var(--ink);font-weight:600}.ficha .none{color:var(--warn)}.notas{margin:4px 0 8px 18px;font-size:11.5px;color:var(--txt)}.notas li{margin:4px 0}.notas .q{color:var(--soft);font-size:10.5px}table.expl th,table.expl td{text-align:left}.footer{margin-top:30px;padding-top:10px;border-top:1px solid var(--line);font-size:9.5px;color:var(--soft);text-align:center;letter-spacing:.02em}.barra{position:fixed;top:0;left:0;right:0;z-index:999;background:#fff;border-bottom:1px solid var(--line);padding:9px 20px;display:flex;align-items:center;gap:12px;font-size:12.5px;color:var(--ink)}.barra span{flex:1}.barra button{border:1px solid var(--ink);background:var(--ink);color:#fff;padding:6px 16px;border-radius:2px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit}.barra button.sec{background:#fff;color:var(--ink)}@media print{body{background:#fff}.no-print{display:none}.kpis,.alert,.banner{break-inside:avoid}tr{break-inside:avoid}.section h2{break-after:avoid}.fichas{grid-template-columns:1fr 1fr}}`;
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
        if (same(from.id, to.id)) return `<td style="background:#f4f6f9;color:#9aa6b5">—</td>`;
        const c = porPar.get(String(from.id) + ">" + String(to.id)), rev = porPar.get(String(to.id) + ">" + String(from.id));
        if (hasType(c, "pos")) pos++; if (hasType(c, "neg")) neg++;
        const sym = c ? (c.tp === "pos" ? (rev ? "◆" : "+") : c.tp === "neg" ? "−" : "○") : "";
        const col = c ? (c.tp === "pos" ? "#14202e" : c.tp === "neg" ? "#8f2d2d" : "#667385") : "#ccc";
        const extra = c && c.types && c.types.length > 1 ? `<sup style="font-size:7px">${c.types.map((x) => (x === "pos" ? "+" : x === "neg" ? "−" : "○")).join("")}</sup>` : "";
        return `<td style="color:${col};font-weight:${rev ? "800" : "600"}">${sym}${extra}</td>`;
      }).join("");
      return `<tr><td style="font-weight:700;white-space:nowrap">${esc(from.av || "")} ${esc(from.name)}</td>${cells}<td class="pos">${pos}</td><td class="neg">${neg}</td></tr>`;
    }).join("");
    matriz = `<div class="section"><h2>Matriz sociométrica</h2><div class="sub">Fila = quien responde · columna = a quién marcó · + positiva · ◆ positiva mutua · − rechazo · ○ neutral · el índice pequeño lista los demás tipos marcados</div><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
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
  const extraCss = mode === "pdf" ? `@page{size:A4;margin:15mm 13mm}body{font-size:11px}.page{padding:8px 0}` : "";
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reporte RedNexo ${REPORT_TYPES[type]} — ${esc(groupLabel)}</title><style>${REPORT_CSS}${extraCss}</style></head><body>${toolbar}<div class="page">${cabeceraHTML({ etiqueta: "Reporte " + REPORT_TYPES[type], titulo: esc(groupLabel), subtitulo: "Inteligencia sociométrica escolar", meta: [esc(date), k.participantes + " participantes", k.conexiones + " conexiones"] })}${kpis}${empty || sections}<div class="footer">RedNexo — ${esc(date)} · ${esc(groupLabel)} · Documento confidencial</div></div></body></html>`;
}
