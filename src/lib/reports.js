// Reportes sociométricos: datos (probados) + un único generador de HTML para vista previa, HTML descargado y PDF.
import { hasType, density } from "./sociometry.js";

export const REPORT_TYPES = { individual: "Individual", grupal: "Grupal", ambos: "Completo" };
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

/** Umbral de «muchos»: la mitad del grupo (n − 1 compañeros), con un mínimo de 2. */
export const roleThreshold = (n) => Math.max(2, Math.ceil((n - 1) / 2));

/**
 * Cifras y rol de un estudiante dentro de `stList`/`cnList` (siempre lo visible, del mismo grupo de análisis).
 * Roles (inspirados en las categorías sociométricas clásicas):
 *  controvertido: muchas elecciones Y muchos rechazos · líder: muchas elecciones, pocos rechazos ·
 *  rechazado: muchos rechazos, pocas elecciones · aislado: nadie lo eligió positivamente ·
 *  integrado: ≥ 2 mutuas positivas · regular: el resto.
 */
export function studentStats(s, stList, cnList) {
  const t = stList.length - 1, thr = roleThreshold(stList.length);
  const out = cnList.filter((c) => same(c.f, s.id)), inn = cnList.filter((c) => same(c.t, s.id));
  const posR = inn.filter((c) => hasType(c, "pos")).length;
  const negR = inn.filter((c) => hasType(c, "neg")).length;
  const neuR = inn.filter((c) => hasType(c, "neu")).length;
  const back = (c, ty) => cnList.some((r) => same(r.f, c.t) && same(r.t, s.id) && hasType(r, ty));
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
export function computeReport(stList, cnList) {
  const n = stList.length;
  const rows = stList.map((s) => ({ student: s, ...studentStats(s, stList, cnList) }));
  const nameOf = (id) => { const s = stList.find((x) => same(x.id, id)); return s ? s.name : "?"; };
  const byRole = Object.fromEntries(Object.keys(ROLE_LABELS).map((k) => [k, rows.filter((r) => r.rol === k)]));
  const groups = [...new Set(stList.map((s) => s.group))].map((g) => {
    const miembros = rows.filter((r) => r.student.group === g);
    const inG = (id) => { const s = stList.find((x) => same(x.id, id)); return s ? s.group : null; };
    const connInt = cnList.filter((c) => inG(c.f) === g && inG(c.t) === g).length;
    const connExt = cnList.filter((c) => inG(c.f) !== null && inG(c.t) !== null && inG(c.f) !== inG(c.t) && (inG(c.f) === g || inG(c.t) === g)).length;
    return { group: g, miembros: miembros.length, connInt, connExt, densidad: miembros.length > 1 ? density(connInt, miembros.length) + "%" : "N/A",
      lideres: miembros.filter((r) => r.rol === "lider").map((r) => r.student.name),
      counts: { lider: miembros.filter((r) => r.rol === "lider").length, controvertido: miembros.filter((r) => r.rol === "controvertido").length, rechazado: miembros.filter((r) => r.rol === "rechazado").length, aislado: miembros.filter((r) => r.rol === "aislado").length } };
  });
  const fichas = rows.map((r) => {
    const id = r.student.id;
    const inn = cnList.filter((c) => same(c.t, id)), out = cnList.filter((c) => same(c.f, id));
    const list = (arr, ty, key) => arr.filter((c) => hasType(c, ty)).map((c) => nameOf(c[key])).sort((a, b) => a.localeCompare(b, "es"));
    const mutuas = out.filter((c) => hasType(c, "pos") && cnList.some((x) => same(x.f, c.t) && same(x.t, id) && hasType(x, "pos"))).map((c) => nameOf(c.t)).sort((a, b) => a.localeCompare(b, "es"));
    return { row: r, eligieronPos: list(inn, "pos", "f"), rechazaron: list(inn, "neg", "f"), neutralDe: list(inn, "neu", "f"), eligioPos: list(out, "pos", "t"), rechazo: list(out, "neg", "t"), mutuas };
  });
  return {
    n, rows, byRole, groups, fichas, conns: cnList, students: stList,
    kpis: {
      participantes: n, conexiones: cnList.length,
      positivas: cnList.filter((c) => hasType(c, "pos")).length, rechazos: cnList.filter((c) => hasType(c, "neg")).length,
      mutuasPos: Math.round(rows.reduce((a, r) => a + r.mutuasPos, 0) / 2), rechazosMutuos: Math.round(rows.reduce((a, r) => a + r.rechazosMutuos, 0) / 2),
      densidad: density(cnList.length, n),
    },
  };
}

export const reportFileName = (groupLabel, type, ext) => `reporte_rednexo_${REPORT_TYPES[type] || "Completo"}_${String(groupLabel).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "grupo"}.${ext}`;

export const REPORT_CSS = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;background:#f5f6fa;color:#1a1a2e;font-size:13px}.page{max-width:1050px;margin:0 auto;padding:28px 20px}.header{background:#050a1a;color:#fff;padding:24px 28px;border-radius:14px;margin-bottom:22px;display:flex;justify-content:space-between;align-items:center}.header h1{font-size:26px;font-weight:800;letter-spacing:-1px}.header h1 span{color:#3b82f6}.header .meta{text-align:right;font-size:12px;color:#9498ae;line-height:2}.section{background:#fff;border-radius:10px;padding:20px;margin-bottom:18px;box-shadow:0 1px 8px rgba(0,0,0,.07)}.section h2{font-size:15px;font-weight:700;margin-bottom:3px;display:flex;align-items:center;gap:7px;color:#1a1a2e}.section .sub{font-size:11px;color:#888;margin-bottom:14px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}.kpi{background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 8px rgba(0,0,0,.07);text-align:center}.kpi .val{font-size:28px;font-weight:800}.kpi .lbl{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-top:3px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #e5e7eb;padding:6px 9px;text-align:center}th{background:#f9fafb;font-weight:700;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.3px}td:first-child{text-align:left}tr:hover td{background:#fafafa}.pos{color:#2dd4bf;font-weight:700}.neg{color:#f87171;font-weight:700}.mut{color:#34d399}.badge{display:inline-block;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700}.alert{border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:12px;border-left:4px solid}.alert-ok{background:#d1fae5;border-color:#10b981;color:#065f46}.alert-warn{background:#fef3c7;border-color:#f59e0b;color:#92400e}.alert-info{background:#dbeafe;border-color:#3b82f6;color:#1e40af}.footer{text-align:center;font-size:10px;color:#aaa;margin-top:24px;padding:12px;border-top:1px solid #e5e7eb}@media print{body{background:#fff}.section{box-shadow:none;border:1px solid #e5e7eb;break-inside:avoid}.kpis{break-inside:avoid}}.sub2{font-size:11px;color:#6b7280;margin:-6px 0 12px}.role{display:inline-block;padding:2px 9px;border-radius:8px;font-size:10px;font-weight:700;border:1px solid}.role-lider{background:#d1fae5;color:#065f46;border-color:#10b981}.role-controvertido{background:#ede9fe;color:#5b21b6;border-color:#8b5cf6}.role-rechazado{background:#fee2e2;color:#991b1b;border-color:#ef4444}.role-aislado{background:#fef3c7;color:#92400e;border-color:#f59e0b}.role-integrado{background:#dbeafe;color:#1e40af;border-color:#3b82f6}.role-regular{background:#f3f4f6;color:#4b5563;border-color:#d1d5db}.fichas{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ficha{border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;break-inside:avoid;background:#fff}.ficha h3{font-size:13px;font-weight:800;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}.ficha .nums{font-size:10px;color:#6b7280;margin-bottom:8px}.ficha .ln{font-size:11px;margin:3px 0;line-height:1.5}.ficha .ln b{font-weight:700}.ficha .none{color:#92400e;font-weight:600}.banner{border-radius:8px;padding:9px 14px;margin-bottom:16px;font-size:11px;background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3}.hide-mobile{}@media print{.fichas{grid-template-columns:1fr 1fr}}`;
const LOGO_SVG = `<div style="width:44px;height:44px;background:#050a1a;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="32" height="32" viewBox="0 0 40 40" fill="none"><ellipse cx="20" cy="22" rx="14" ry="5" fill="#3b82f6" opacity="0.09"/><circle cx="6" cy="7" r="1.8" fill="#3b82f6" opacity="0.4"/><circle cx="30" cy="7" r="1.8" fill="#3b82f6" opacity="0.4"/><line x1="6" y1="7" x2="17" y2="7" stroke="#3b82f6" stroke-width="0.7" opacity="0.2"/><line x1="30" y1="7" x2="17" y2="7" stroke="#3b82f6" stroke-width="0.7" opacity="0.2"/><polyline points="4,20 9,20 12,13 15,27 17,7 19,27 22,20 32,20 36,20" stroke="#3b82f6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="17" cy="7" r="3.5" fill="#3b82f6" opacity="0.2"/><circle cx="17" cy="7" r="2.2" fill="#3b82f6"/><circle cx="17" cy="7" r="1" fill="#050a1a"/></svg></div>`;

/**
 * Documento HTML completo del reporte. mode: "html" (descarga), "pdf" (ventana con barra de imprimir) o "preview" (iframe sin scripts).
 *  individual: índices por estudiante + ficha de cada uno.  grupal: SIN nombres (apto para compartir): cifras, roles en conteos y tabla de grupos.
 *  ambos (completo): todo, incluida la matriz con nombres.
 */
export function renderReportHTML(report, { type = "ambos", groupLabel = "Todos los grupos", date = "", mode = "html", colors = {} } = {}) {
  const k = report.kpis, isG = type === "grupal", showIdx = type === "individual" || type === "ambos", showGrp = type === "grupal" || type === "ambos";
  const gcol = (g) => safeColor(colors[g], "#3b82f6");
  const badge = (g) => `<span class="badge" style="background:${gcol(g)}22;color:${gcol(g)}">${esc(g)}</span>`;
  const role = (key) => `<span class="role role-${key}" title="${esc(ROLE_HELP[key])}">${ROLE_LABELS[key]}</span>`;
  const names = (arr) => arr.map((r) => esc(r.student.name)).join(", ");
  const R = report.byRole;

  const kpis = `<div class="kpis"><div class="kpi"><div class="val" style="color:#3b82f6">${k.participantes}</div><div class="lbl">Participantes</div></div><div class="kpi"><div class="val" style="color:#2dd4bf">${k.positivas}</div><div class="lbl">Elecciones positivas</div></div><div class="kpi"><div class="val" style="color:#f87171">${k.rechazos}</div><div class="lbl">Rechazos</div></div><div class="kpi"><div class="val" style="color:#34d399">${k.mutuasPos}</div><div class="lbl">Mutuas positivas</div></div></div>`;

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

  const idxRows = report.rows.map((r) => `<tr><td><b>${esc(r.student.name)}</b></td><td>${badge(r.student.group)}</td><td>${r.hechas}</td><td>${r.recibidas}</td><td class="pos">${r.posR}</td><td class="neg">${r.negR}</td><td class="mut">${r.mutuasPos}</td><td class="pos">${r.popularidad}%</td><td class="neg">${r.rechazo}%</td><td style="color:#8b5cf6;font-weight:700">${r.expansion}%</td><td>${role(r.rol)}</td></tr>`).join("");
  const indices = `<div class="section"><h2>Índices individuales</h2><div class="sub">Aceptación = elecciones positivas recibidas ÷ (participantes − 1) · Rechazo = rechazos recibidos ÷ (participantes − 1) · Expansión = a cuántos eligió ÷ (participantes − 1)</div><table><thead><tr><th>Nombre</th><th>Grupo</th><th>Elige</th><th>Recibe</th><th class="pos">Pos.</th><th class="neg">Neg.</th><th class="mut">Mutuas (+)</th><th class="pos">Aceptación</th><th class="neg">Rechazo</th><th>Expansión</th><th>Rol</th></tr></thead><tbody>${idxRows}</tbody></table></div>`;

  const grpRows = report.groups.map((g) => isG
    ? `<tr><td>${badge(g.group)}</td><td>${g.miembros}</td><td class="pos">${g.connInt}</td><td style="color:#8b5cf6">${g.connExt}</td><td><b>${g.densidad}</b></td><td>${g.counts.lider}</td><td>${g.counts.controvertido}</td><td>${g.counts.rechazado}</td><td>${g.counts.aislado}</td></tr>`
    : `<tr><td>${badge(g.group)}</td><td>${g.miembros}</td><td class="pos">${g.connInt}</td><td style="color:#8b5cf6">${g.connExt}</td><td><b>${g.densidad}</b></td><td>${g.lideres.length ? `<b>${g.lideres.map(esc).join(", ")}</b>` : "—"}</td></tr>`).join("");
  const grupos = `<div class="section"><h2>Grupos</h2><div class="sub">Conexiones dentro de cada grupo y hacia otros grupos</div><table><thead><tr><th>Grupo</th><th>Miembros</th><th class="pos">Conn. int.</th><th>Conn. ext.</th><th>Densidad</th>${isG ? `<th>Líderes</th><th>Controvertidos</th><th>Rechazados</th><th>Aislados</th>` : `<th>Líder</th>`}</tr></thead><tbody>${grpRows}</tbody></table></div>`;

  let matriz = "";
  if (type === "ambos") {
    const st = report.students, cn = report.conns;
    const th = `<th style="min-width:90px">De ↓ / Para →</th>` + st.map((s) => `<th title="${esc(s.name)}" style="min-width:32px">${esc(s.av || String(s.name).slice(0, 2))}</th>`).join("") + `<th class="pos">Σ+</th><th class="neg">Σ−</th>`;
    const body = st.map((from) => {
      let pos = 0, neg = 0;
      const cells = st.map((to) => {
        if (same(from.id, to.id)) return `<td style="background:#f3f4f6">—</td>`;
        const c = cn.find((x) => same(x.f, from.id) && same(x.t, to.id)), rev = cn.find((x) => same(x.f, to.id) && same(x.t, from.id));
        if (hasType(c, "pos")) pos++; if (hasType(c, "neg")) neg++;
        const sym = c ? (c.tp === "pos" ? (rev ? "◆" : "+") : c.tp === "neg" ? "−" : "○") : "";
        const col = c ? (c.tp === "pos" ? (rev ? "#059669" : "#0d9488") : c.tp === "neg" ? "#dc2626" : "#b45309") : "#ccc";
        const extra = c && c.types && c.types.length > 1 ? `<sup style="font-size:7px">${c.types.map((x) => (x === "pos" ? "+" : x === "neg" ? "−" : "○")).join("")}</sup>` : "";
        return `<td style="color:${col};font-weight:${rev ? "800" : "600"}">${sym}${extra}</td>`;
      }).join("");
      return `<tr><td style="font-weight:700;white-space:nowrap">${esc(from.av || "")} ${esc(from.name)}</td>${cells}<td class="pos">${pos}</td><td class="neg">${neg}</td></tr>`;
    }).join("");
    matriz = `<div class="section"><h2>Matriz sociométrica</h2><div class="sub">Fila = quien responde · columna = a quién marcó · + positiva · ◆ positiva mutua · − rechazo · ○ neutral · el índice pequeño lista los demás tipos marcados</div><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  const lines = (label, arr, cls = "") => (arr.length ? `<div class="ln"><b>${label}:</b> ${arr.map(esc).join(", ")}</div>` : "");
  const fichaHtml = report.fichas.map((f) => {
    const r = f.row;
    return `<div class="ficha"><h3>${esc(r.student.name)} ${badge(r.student.group)} ${role(r.rol)}</h3><div class="nums">Elige ${r.hechas} · Recibe ${r.recibidas} · Aceptación ${r.popularidad}% · Rechazo ${r.rechazo}%</div>${f.eligieronPos.length ? lines("Lo eligieron positivamente", f.eligieronPos) : `<div class="ln none">Nadie lo eligió positivamente.</div>`}${lines("Lo rechazaron", f.rechazaron)}${lines("Lo marcaron como neutral", f.neutralDe)}${lines("Eligió positivamente a", f.eligioPos)}${lines("Rechazó a", f.rechazo)}${lines("Elección mutua positiva con", f.mutuas)}</div>`;
  }).join("");
  const fichas = `<div class="section"><h2>Fichas por estudiante</h2><div class="sub">Quién eligió o rechazó a cada estudiante y a quién eligió o rechazó. Información confidencial.</div><div class="fichas">${fichaHtml}</div></div>`;

  const toolbar = mode === "pdf"
    ? `<div class="no-print" style="position:fixed;top:0;left:0;right:0;background:#050a1a;color:#fff;padding:10px 16px;display:flex;align-items:center;gap:12px;z-index:999;font-family:'Segoe UI',Arial,sans-serif;font-size:13px"><span style="flex:1">RedNexo · Reporte ${REPORT_TYPES[type]} · ${esc(groupLabel)}</span><button onclick="window.print()" style="background:#3b82f6;color:#fff;border:none;padding:7px 18px;border-radius:7px;font-weight:700;cursor:pointer">Imprimir / PDF</button><button onclick="window.close()" style="background:transparent;color:#9498ae;border:1px solid #555;padding:7px 14px;border-radius:7px;cursor:pointer">Cerrar</button></div><div style="height:48px" class="no-print"></div>`
    : "";
  const sections = [resumen, showIdx ? indices : "", showGrp ? grupos : "", matriz, showIdx ? fichas : ""].join("");
  const empty = report.n === 0 ? `<div class="section"><div class="alert alert-warn">No hay participantes en este grupo.</div></div>` : "";
  const extraCss = mode === "pdf" ? `@page{size:A4;margin:15mm 12mm}body{background:#fff;font-size:11px}.no-print{display:none}@media print{.no-print{display:none}}` : "";
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reporte RedNexo ${REPORT_TYPES[type]} — ${esc(groupLabel)}</title><style>${REPORT_CSS}${extraCss}</style></head><body>${toolbar}<div class="page"><div class="header"><div style="display:flex;align-items:center;gap:14px">${LOGO_SVG}<div><div style="font-size:10px;color:#9498ae;letter-spacing:2px;margin-bottom:3px">INTELIGENCIA SOCIOMÉTRICA</div><h1>Red<span>Nexo</span></h1><div style="font-size:12px;color:#9498ae;margin-top:3px">Reporte ${REPORT_TYPES[type]} · ${esc(groupLabel)}</div></div></div><div class="meta"><div>${esc(date)}</div><div>${k.participantes} participantes</div><div>${k.conexiones} conexiones</div></div></div>${kpis}${empty || sections}<div class="footer">RedNexo — ${esc(date)} · ${esc(groupLabel)} · Documento confidencial</div></div></body></html>`;
}
