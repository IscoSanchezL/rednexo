// Informe de UN estudiante (para el equipo y para reuniones con familias). Lógica pura, sin Firebase ni React.
// Dos versiones: «equipo» (con nombres y explicaciones, desde y hacia el estudiante) y «familias» (sin nombres de otros
// niños ni textos de compañeros: solo cifras, lectura del perfil y comparación con el grupo).
import { buildConnections } from "./sociometry.js";
import { studentStats, ROLE_LABELS, ROLE_HELP, REPORT_CSS, cabeceraHTML, esc, roleThreshold } from "./reports.js";
import { esAbierta, esJustificable } from "./justificacion.js";

const TIPOS = { pos: "Positiva", neu: "Neutral", neg: "Negativa" };
const num = (v) => parseFloat(String(v)) || 0;
const media = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const un = (x) => x.toFixed(1);
const porNombre = (a, b) => String(a).localeCompare(String(b), "es");

/** Reúne todo lo del estudiante. `students`: todos los del colegio; `responses`/`surveys`: los vivos (no en la papelera). */
export function buildStudentReport({ student, students, responses, surveys, surveyId = "all" }) {
  const vivas = (surveys || []).filter((sv) => !sv.deleted && (surveyId === "all" || sv.id === surveyId));
  const okIds = new Set(vivas.map((sv) => sv.id));
  const resp = (responses || []).filter((r) => r && okIds.has(r.surveyId));
  const porId = new Map((students || []).map((s) => [String(s.id), s]));
  const sid = String(student.id);
  const grupo = (students || []).filter((s) => s.group === student.group);
  const gIds = new Set(grupo.map((s) => String(s.id)));
  const conns = buildConnections(resp, vivas);
  const connsGrupo = conns.filter((c) => gIds.has(String(c.f)) && gIds.has(String(c.t)));

  const stats = studentStats(student, grupo, connsGrupo);
  const todos = grupo.map((s) => studentStats(s, grupo, connsGrupo));
  const posR = todos.map((x) => x.posR), negR = todos.map((x) => x.negR);
  const promedios = { aceptacion: media(todos.map((x) => num(x.popularidad))), rechazo: media(todos.map((x) => num(x.rechazo))), expansion: media(todos.map((x) => num(x.expansion))), posR: media(posR), negR: media(negR), hechas: media(todos.map((x) => x.hechas)) };
  const puesto = (arr, v) => 1 + arr.filter((x) => x > v).length;

  // Fuera del grupo (conexiones con compañeros de otros grupos)
  const fuera = { hizo: conns.filter((c) => String(c.f) === sid && !gIds.has(String(c.t))).length, recibio: conns.filter((c) => String(c.t) === sid && !gIds.has(String(c.f))).length };

  // Por pregunta: a quién eligió y quién lo eligió, con la explicación si la hubo
  const preguntas = [];
  const respondio = resp.some((r) => String(r.respondentId) === sid);
  for (const sv of vivas) {
    const mias = resp.find((r) => r.surveyId === sv.id && String(r.respondentId) === sid);
    for (const q of sv.questions || []) {
      if (esAbierta(q)) continue;
      const nota = (r, aId) => { const t = r.justificaciones && r.justificaciones[`${q.id}|${aId}`]; return typeof t === "string" && t.trim() ? t.trim() : ""; };
      const elegidos = ((mias && mias.answers && mias.answers[q.id]) || []).map((id) => { const s = porId.get(String(id)); return { name: s ? s.name : "?", grupo: s ? s.group : "", nota: mias ? nota(mias, id) : "" }; }).sort((a, b) => porNombre(a.name, b.name));
      const recibidos = resp.filter((r) => r.surveyId === sv.id && r.answers && (r.answers[q.id] || []).map(String).includes(sid)).map((r) => { const s = porId.get(String(r.respondentId)); return { name: s ? s.name : "?", grupo: s ? s.group : "", nota: nota(r, student.id) }; }).sort((a, b) => porNombre(a.name, b.name));
      preguntas.push({ encuesta: sv.title || "", pregunta: q.text, tp: q.tp, justificable: esJustificable(q), elegidos, recibidos });
    }
  }
  const abiertas = [];
  for (const sv of vivas) for (const q of (sv.questions || []).filter(esAbierta)) {
    const r = resp.find((x) => x.surveyId === sv.id && String(x.respondentId) === sid);
    const t = r && r.abiertas && r.abiertas[q.id];
    if (typeof t === "string" && t.trim()) abiertas.push({ encuesta: sv.title || "", pregunta: q.text, text: t.trim() });
  }
  // Relaciones mutuas (dentro del grupo)
  const mutuasPos = connsGrupo.filter((c) => String(c.f) === sid && c.types.includes("pos") && connsGrupo.some((r) => String(r.f) === String(c.t) && String(r.t) === sid && r.types.includes("pos"))).map((c) => (porId.get(String(c.t)) || {}).name || "?").sort(porNombre);
  const rechazosMutuos = connsGrupo.filter((c) => String(c.f) === sid && c.types.includes("neg") && connsGrupo.some((r) => String(r.f) === String(c.t) && String(r.t) === sid && r.types.includes("neg"))).map((c) => (porId.get(String(c.t)) || {}).name || "?").sort(porNombre);

  // Datos que llaman la atención aunque el perfil sea «Regular» (el perfil exige que la mitad del grupo coincida; esto compara con el promedio)
  const destacados = [];
  if (stats.negR >= 2 && stats.negR >= 2 * promedios.negR) destacados.push(`Recibió ${stats.negR} marcas negativas; el promedio del grupo es ${un(promedios.negR)}. Conviene prestarle atención aunque su perfil no sea «Rechazado».`);
  if (stats.posR === 0 && promedios.posR >= 1) destacados.push(`Ningún compañero la eligió positivamente (el promedio del grupo es ${un(promedios.posR)}).`);
  if (stats.posR >= 3 && stats.posR >= 2 * promedios.posR) destacados.push(`Recibió ${stats.posR} elecciones positivas, más del doble del promedio del grupo (${un(promedios.posR)}).`);
  return { destacados, student, n: grupo.length, encuestas: vivas.map((sv) => sv.title || ""), respondio, stats, promedios, puestos: { aceptacion: puesto(posR, stats.posR), rechazo: puesto(negR, stats.negR) }, umbral: roleThreshold(grupo.length), fuera, preguntas, abiertas, mutuasPos, rechazosMutuos };
}

const LECTURA = {
  lider: "Es una de las personas más elegidas del grupo y casi no recibe rechazos: los compañeros la buscan y la valoran.",
  controvertido: "Recibe muchas elecciones y también muchos rechazos: genera opiniones encontradas en el grupo. Conviene mirar el contexto.",
  rechazado: "Recibe varios rechazos y pocas elecciones: es una persona a la que el grupo le cuesta acercarse. Conviene acompañarla.",
  aislado: "Ningún compañero la eligió positivamente en esta aplicación. No es un diagnóstico: puede ser nueva, tímida, haber faltado o no haber coincidido con quienes eligieron.",
  integrado: "Tiene al menos dos relaciones de elección mutua positiva: cuenta con vínculos de ida y vuelta en el grupo.",
  regular: "No muestra un patrón destacado: tiene vínculos dentro de lo habitual en el grupo.",
};

/** HTML completo. version: "equipo" | "familias". mode: "html" | "pdf" | "preview". */
export function renderStudentReportHTML(d, { version = "equipo", colegio = "", date = "", mode = "html", color = "#3b82f6", observaciones = true } = {}) {
  const fam = version === "familias";
  const s = d.stats, nombre = d.student.name;
  const col = /^#[0-9a-fA-F]{6}$/.test(String(color)) ? color : "#3b82f6";
  const kpi = (v, l, _c, sub = "") => `<div class="kpi"><div class="val">${v}</div><div class="lbl">${l}</div>${sub ? `<div style="font-size:10px;color:#5a6a7c;margin-top:3px">${sub}</div>` : ""}</div>`;
  const comp = (valor, prom, unidad = "%") => `Grupo: ${un(prom)}${unidad}`;
  const rol = `<span class="role role-${s.rol}">${ROLE_LABELS[s.rol]}</span>`;
  const nombres = (arr) => arr.map((x) => esc(x.name)).join(", ");

  const aviso = fam
    ? `<div class="banner">Versión para familias: <b>no incluye nombres de otros estudiantes</b> ni lo que escribieron los compañeros. Muestra solo cifras y la lectura del perfil de ${esc(nombre)}.</div>`
    : `<div class="banner banner-conf"><b>Documento confidencial para el equipo del colegio.</b> Incluye nombres de otros estudiantes y lo que escribieron. <b>No lo entregue ni lo muestre a familias</b>: para ellas use la versión «Para familias».</div>`;

  const resumen = `<div class="section"><h2>Resumen</h2><div class="sub">${esc(nombre)} · ${esc(d.student.group)} · ${d.n} estudiantes en el grupo · ${esc(d.encuestas.join(" · ") || "sin encuestas")}</div>
    ${d.respondio ? "" : `<div class="alert alert-warn">${esc(nombre)} <b>no respondió</b> esta aplicación; las cifras de lo que eligió son cero, pero sí se ven las elecciones que recibió.</div>`}
    <div class="alert alert-info"><b>Perfil en el grupo:</b> ${rol} — ${esc(LECTURA[s.rol])}</div>
    ${(d.destacados || []).map((t) => `<div class="alert alert-warn"><b>Para tener en cuenta:</b> ${esc(t)}</div>`).join("")}
    <div class="kpis">${kpi(s.recibidas, "Compañeros que lo marcaron", "#3b82f6")}${kpi(s.posR, "Lo eligieron positivamente", "#2dd4bf", comp(s.posR, d.promedios.posR, ""))}${kpi(s.negR, "Lo rechazaron", "#f87171", comp(s.negR, d.promedios.negR, ""))}${kpi(s.mutuasPos, "Relaciones mutuas positivas", "#34d399")}</div>
    <table class="expl"><thead><tr><th>Indicador</th><th>${esc(nombre)}</th><th>Promedio del grupo</th><th>Cómo leerlo</th></tr></thead><tbody>
      <tr><td>Aceptación</td><td><b>${s.popularidad}%</b> (puesto ${d.puestos.aceptacion} de ${d.n})</td><td>${un(d.promedios.aceptacion)}%</td><td>Compañeros que lo eligieron positivamente ÷ (estudiantes − 1).</td></tr>
      <tr><td>Rechazo</td><td><b>${s.rechazo}%</b> (puesto ${d.puestos.rechazo} de ${d.n})</td><td>${un(d.promedios.rechazo)}%</td><td>Compañeros que lo marcaron negativamente ÷ (estudiantes − 1).</td></tr>
      <tr><td>Expansión</td><td><b>${s.expansion}%</b> (eligió a ${s.hechas})</td><td>${un(d.promedios.expansion)}%</td><td>A cuántos compañeros eligió o marcó, sobre el total posible.</td></tr>
      <tr><td>Rechazos mutuos</td><td><b>${s.rechazosMutuos}</b></td><td>—</td><td>Personas a las que rechazó y que también lo rechazaron.</td></tr>
      ${d.fuera.hizo + d.fuera.recibio ? `<tr><td>Con otros grupos</td><td><b>${d.fuera.hizo}</b> eligió · <b>${d.fuera.recibio}</b> lo marcaron</td><td>—</td><td>Conexiones con estudiantes de otros grupos (no entran en los % de arriba).</td></tr>` : ""}
    </tbody></table>
    <div class="sub2" style="margin-top:8px;font-size:11px;color:#5a6a7c">Se considera «muchos» a partir de ${d.umbral} compañeros (la mitad del grupo). ${esc(ROLE_HELP[s.rol])}</div></div>`;

  // ── Versión equipo: detalle por pregunta, desde y hacia ──
  const bloque = (lista, vacio) => (lista.length ? `<ul class="notas">${lista.map((x) => `<li><b>${esc(x.name)}</b> <span class="q">· ${esc(x.grupo)}</span>${x.nota ? `<br><i>«${esc(x.nota)}»</i>` : ""}</li>`).join("")}</ul>` : `<div class="ln none">${vacio}</div>`);
  const preguntasHtml = fam ? "" : `<div class="section"><h2>Detalle por pregunta: desde y hacia ${esc(nombre)}</h2><div class="sub">Para cada pregunta: a quién eligió o marcó, y quién lo eligió o marcó a él/ella. Las explicaciones aparecen entre comillas.</div>${d.preguntas.map((q) => `<div class="ficha" style="margin-bottom:12px"><h3>${esc(q.pregunta)} <span class="tag${q.tp === "neg" ? " tag-neg" : ""}">${TIPOS[q.tp] || ""}</span>${q.justificable ? ` <span class="tag">con justificación</span>` : ""}</h3><div class="sub2" style="font-size:10px;color:#5a6a7c;margin-bottom:6px">${esc(q.encuesta)}</div>
      <div class="ln"><b>${esc(nombre.split(" ")[0])} eligió o marcó a (${q.elegidos.length}):</b></div>${bloque(q.elegidos, "No eligió a nadie en esta pregunta.")}
      <div class="ln"><b>Lo eligieron o marcaron (${q.recibidos.length}):</b></div>${bloque(q.recibidos, "Nadie lo eligió en esta pregunta.")}</div>`).join("") || `<div class="alert alert-warn">No hay preguntas de selección en las encuestas consideradas.</div>`}</div>`;

  const mutuasHtml = fam ? "" : `<div class="section"><h2>Relaciones de ida y vuelta</h2>
    <div class="ln"><b>Elección mutua positiva con (${d.mutuasPos.length}):</b> ${d.mutuasPos.length ? d.mutuasPos.map(esc).join(", ") : "ninguna"}</div>
    <div class="ln"><b>Rechazo mutuo con (${d.rechazosMutuos.length}):</b> ${d.rechazosMutuos.length ? d.rechazosMutuos.map(esc).join(", ") : "ninguno"}</div></div>`;

  const abiertasHtml = fam || !d.abiertas.length ? "" : `<div class="section"><h2>Lo que escribió en preguntas abiertas</h2><div class="sub">Sus propias palabras (opiniones, sugerencias). Pueden mencionar a otros estudiantes: revíselo antes de comentarlo.</div><table class="expl"><thead><tr><th>Pregunta</th><th>Respuesta</th></tr></thead><tbody>${d.abiertas.map((a) => `<tr><td>${esc(a.pregunta)}</td><td><i>«${esc(a.text)}»</i></td></tr>`).join("")}</tbody></table></div>`;

  // Versión familias: cifras por pregunta sin nombres
  const porPreguntaFam = !fam ? "" : `<div class="section"><h2>Por pregunta</h2><div class="sub">Cuántos compañeros marcaron a ${esc(nombre.split(" ")[0])} y a cuántos marcó, sin nombres.</div><table class="expl"><thead><tr><th>Pregunta</th><th>Tipo</th><th>Lo marcaron</th><th>Marcó a</th></tr></thead><tbody>${d.preguntas.map((q) => `<tr><td>${esc(q.pregunta)}</td><td>${TIPOS[q.tp] || ""}</td><td>${q.recibidos.length}</td><td>${q.elegidos.length}</td></tr>`).join("")}</tbody></table></div>`;

  const notas = !observaciones ? "" : `<div class="section"><h2>${fam ? "Acuerdos de la reunión" : "Observaciones y acuerdos"}</h2><div class="sub">${fam ? "Espacio para anotar durante la reunión con la familia." : "Contraste estos datos con la observación en aula, entrevistas y la información de docentes antes de decidir."}</div>${"<div style=\"border-bottom:1px solid #b9c2cf;height:26px\"></div>".repeat(6)}</div>`;

  const aclaracion = `<div class="section"><div class="alert alert-info" style="font-size:11px"><b>Cómo leer este informe.</b> Es una fotografía de cómo se relaciona el estudiante dentro de su grupo en el momento de la encuesta; no es un diagnóstico ni una evaluación de su conducta. Un resultado bajo puede deberse a que es nuevo, estuvo ausente o no coincidió con quienes eligieron. Úselo para acompañar, no para etiquetar ni sancionar.</div></div>`;

  const toolbar = mode === "pdf"
    ? `<div class="barra no-print"><span>RedNexo · Informe de ${esc(nombre)} · ${fam ? "Para familias" : "Para el equipo"}</span><button onclick="window.print()">Imprimir / Guardar PDF</button></div><div style="height:46px" class="no-print"></div>`
    : "";
  const extraCss = mode === "pdf" ? `@page{size:A4;margin:14mm 12mm}body{font-size:12px}.page{padding:6px 0}table{font-size:11.5px}th,td{padding:7px 8px}.kpi .val{font-size:30px}` : "";
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Informe RedNexo — ${esc(nombre)}</title><style>${REPORT_CSS}${extraCss}</style></head><body>${toolbar}<div class="page">${cabeceraHTML({ etiqueta: "Informe individual · " + (fam ? "Para familias" : "Para el equipo"), titulo: esc(nombre), subtitulo: esc(d.student.group) + (colegio ? " · " + esc(colegio) : ""), meta: [esc(date), "Inteligencia sociométrica escolar"] })}${aviso}${resumen}${porPreguntaFam}${preguntasHtml}${mutuasHtml}${abiertasHtml}${notas}${aclaracion}<div class="footer">RedNexo — ${esc(date)} · ${esc(nombre)} · Documento confidencial</div></div></body></html>`;
}

export const informeEstudianteNombre = (nombre, version, ext) => `informe_${version === "familias" ? "familias" : "equipo"}_${String(nombre).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "estudiante"}.${ext}`;
