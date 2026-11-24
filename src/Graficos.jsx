// Modo «Gráficos» para psicólogos: gráficos de grupo y de cada estudiante, con detalle al hacer clic.
// Todo es SVG propio (sin librerías) para que se vea igual en modo claro y oscuro y se pueda exportar a imagen.
import { useMemo, useRef, useState } from "react";
import { computeReport, ROLE_LABELS } from "./lib/reports.js";
import { buildConnections } from "./lib/sociometry.js";
import { ROLES_ORDEN, ROL_COLOR, rolesPorGrupo, puntosDispersion, mapaCalorGrupos, rankingMutuas, redIndividual, compararAplicaciones, maxEje } from "./lib/graficos.js";
import { GLOSARIO } from "./lib/glosario.js";
import { Ayuda } from "./Ayuda.jsx";

const V = (n) => `var(--c-${n})`;
const caja = { background: V("card"), border: `1px solid ${V("border")}`, borderRadius: 14, padding: 16, marginBottom: 14 };
const btn = (on) => ({ padding: "5px 12px", borderRadius: 8, border: `1px solid ${on ? V("rx") : V("border")}`, background: on ? V("rx") : "transparent", color: on ? "#fff" : V("t2"), fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" });
const sel = { background: V("surface"), border: `1px solid ${V("border")}`, borderRadius: 8, padding: "5px 9px", color: V("text"), fontSize: 12, fontFamily: "inherit", maxWidth: "100%" };

// Descarga un SVG como PNG: se resuelven las variables de color del tema y se pinta sobre fondo sólido.
function descargarPng(svg, nombre) {
  if (!svg) return;
  const cs = getComputedStyle(document.documentElement);
  const fondo = cs.getPropertyValue("--c-card").trim() || "#ffffff";
  let xml = new XMLSerializer().serializeToString(svg).replace(/var\((--[\w-]+)\)/g, (_, v) => cs.getPropertyValue(v).trim() || "#888888");
  if (!/xmlns=/.test(xml)) xml = xml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  const vb = svg.viewBox.baseVal, esc = 2;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas"); c.width = vb.width * esc; c.height = vb.height * esc;
    const g = c.getContext("2d"); g.fillStyle = fondo; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((b) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = nombre + ".png"; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(a.href), 4000); });
  };
  img.onerror = () => alert("No se pudo generar la imagen. Inténtalo de nuevo.");
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
}

function Marco({ titulo, ayuda, nota, children, svgRef, archivo }) {
  return (
    <section style={caja}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{titulo}{ayuda && <Ayuda clave={ayuda} />}</h3>
        <span style={{ flex: 1 }} />
        {svgRef && <button type="button" style={btn(false)} onClick={() => descargarPng(svgRef.current, archivo || "grafico")}>⬇ Imagen</button>}
      </div>
      {nota && <div style={{ fontSize: 11, color: V("t3"), marginBottom: 8, lineHeight: 1.5 }}>{nota}</div>}
      {children}
    </section>
  );
}

const Chip = ({ rol, children }) => <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: ROL_COLOR[rol] + "26", color: ROL_COLOR[rol], border: `1px solid ${ROL_COLOR[rol]}66` }}>{children || ROLE_LABELS[rol]}</span>;
const pct = (v) => `${v}%`;
const nombreVisible = (s, ver) => (ver ? s.name : "Estudiante " + String(s.id).slice(-3));
const corto = (n, m = 16) => (n.length > m ? n.slice(0, m - 1) + "…" : n);

// ── Ficha de un estudiante (detalle al hacer clic en cualquier gráfico) ──
function Ficha({ row, report, ver, onIndividual }) {
  if (!row) return <div style={{ fontSize: 12, color: V("t3"), padding: "8px 0" }}>Haz clic en un punto, barra o círculo para ver el detalle aquí.</div>;
  const prom = (k) => (report.rows.length ? Math.round((report.rows.reduce((a, r) => a + Number(r[k]), 0) / report.rows.length) * 10) / 10 : 0);
  const g = GLOSARIO[row.rol];
  const celdas = [["Aceptación", pct(row.popularidad), pct(prom("popularidad")), V("teal")], ["Rechazo", pct(row.rechazo), pct(prom("rechazo")), V("err")], ["Expansión", pct(row.expansion), pct(prom("expansion")), V("violet")]];
  return (
    <div data-ficha={row.student.id} style={{ border: `1px solid ${V("border")}`, borderRadius: 10, padding: 12, background: V("surface") }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <b style={{ fontSize: 14 }}>{nombreVisible(row.student, ver)}</b>
        <span style={{ fontSize: 11, color: V("t2") }}>{row.student.group}</span>
        <Chip rol={row.rol} />
        <span style={{ flex: 1 }} />
        {onIndividual && <button type="button" style={btn(false)} onClick={() => onIndividual(String(row.student.id))}>Ver gráfico individual →</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8, marginBottom: 8 }}>
        {celdas.map(([l, v, p, c]) => <div key={l} style={{ textAlign: "center", padding: 8, borderRadius: 8, border: `1px solid ${V("border")}` }}><div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div><div style={{ fontSize: 10, color: V("t2"), textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 10, color: V("t3") }}>grupo: {p}</div></div>)}
        <div style={{ textAlign: "center", padding: 8, borderRadius: 8, border: `1px solid ${V("border")}` }}><div style={{ fontSize: 18, fontWeight: 800 }}>{row.mutuasPos}<span style={{ fontSize: 12, color: V("err") }}> / {row.rechazosMutuos}</span></div><div style={{ fontSize: 10, color: V("t2"), textTransform: "uppercase" }}>Mutuas + / −</div></div>
      </div>
      <div style={{ fontSize: 12, color: V("t2"), lineHeight: 1.5 }}>Eligió a {row.hechas} · lo marcaron {row.recibidas} ({row.posR} positivas, {row.negR} negativas). {g && <><b>{g.titulo}:</b> {g.que} <span style={{ color: V("amber") }}>Vigilar: {g.vigilar}</span></>}</div>
    </div>
  );
}

// ── 1. Roles por grupo ──
function RolesGrupo({ report, onPick, pick }) {
  const ref = useRef(null);
  const datos = useMemo(() => rolesPorGrupo(report), [report]);
  const W = 640, fila = 34, ml = 90, H = datos.length * fila + 62, ancho = W - ml - 20;
  const lista = pick ? (datos.find((d) => d.group === pick.group)?.porRol[pick.rol] || []) : [];
  return (
    <Marco titulo="Roles por grupo" ayuda="regular" svgRef={ref} archivo="roles-por-grupo" nota="Cada barra es un grupo; cada color, un rol. Haz clic en un segmento para ver quiénes son.">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} fontFamily="system-ui, sans-serif">
        {datos.map((d, i) => {
          let x = ml;
          return (
            <g key={d.group}>
              <text x={ml - 8} y={i * fila + 22} textAnchor="end" fontSize="12" fill={V("text")}>{corto(d.group, 11)}</text>
              {ROLES_ORDEN.map((rol) => {
                const n = d.porRol[rol].length; if (!n) return null;
                const w = (n / d.total) * ancho, x0 = x; x += w;
                const on = pick && pick.group === d.group && pick.rol === rol;
                return (
                  <g key={rol} role="button" tabIndex={0} aria-label={`${d.group}: ${n} ${ROLE_LABELS[rol]}`} data-seg={`${d.group}|${rol}`} style={{ cursor: "pointer" }} onClick={() => onPick({ group: d.group, rol })} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick({ group: d.group, rol })}>
                    <rect x={x0} y={i * fila + 8} width={Math.max(w - 1, 1)} height={22} rx="3" fill={ROL_COLOR[rol]} stroke={on ? V("text") : "none"} strokeWidth="2" />
                    {w > 18 && <text x={x0 + w / 2} y={i * fila + 23} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{n}</text>}
                  </g>
                );
              })}
            </g>
          );
        })}
                {ROLES_ORDEN.map((rol, i) => <g key={rol} transform={`translate(${ml + (i % 3) * 170}, ${datos.length * fila + 12 + Math.floor(i / 3) * 18})`}><rect width="10" height="10" rx="2" fill={ROL_COLOR[rol]} /><text x="14" y="9" fontSize="11" fill={V("t2")}>{ROLE_LABELS[rol]}</text></g>)}
      </svg>
      {pick && <div data-lista-rol style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}><Chip rol={pick.rol} /> en <b>{pick.group}</b>: {lista.length ? lista.map((r) => r.student.name).join(", ") : "nadie"}. <span style={{ color: V("t3") }}>{GLOSARIO[pick.rol]?.que}</span></div>}
    </Marco>
  );
}

// ── 2. Densidad por grupo ──
function DensidadGrupo({ report, onPick, pick }) {
  const ref = useRef(null);
  const datos = report.groups.map((g) => ({ ...g, valor: g.densidad === "N/A" ? 0 : parseFloat(g.densidad) }));
  const W = 640, fila = 30, ml = 90, H = datos.length * fila + 30, max = maxEje(Math.max(1, ...datos.map((d) => d.valor)));
  const det = pick ? datos.find((d) => d.group === pick) : null;
  return (
    <Marco titulo="Densidad por grupo" ayuda="densidad" svgRef={ref} archivo="densidad-por-grupo" nota="Compara grupos entre sí: un grupo muy por debajo de los demás, o que baja entre aplicaciones, merece una mirada.">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} fontFamily="system-ui, sans-serif">
        {datos.map((d, i) => {
          const w = (d.valor / max) * (W - ml - 60);
          return (
            <g key={d.group} role="button" tabIndex={0} aria-label={`${d.group}: densidad ${d.densidad}`} data-dens={d.group} style={{ cursor: "pointer" }} onClick={() => onPick(d.group)} onKeyDown={(e) => e.key === "Enter" && onPick(d.group)}>
              <text x={ml - 8} y={i * fila + 19} textAnchor="end" fontSize="12" fill={V("text")}>{corto(d.group, 11)}</text>
              <rect x={ml} y={i * fila + 6} width={Math.max(w, 2)} height={20} rx="3" fill={V("amber")} stroke={pick === d.group ? V("text") : "none"} strokeWidth="2" />
              <text x={ml + w + 6} y={i * fila + 21} fontSize="12" fontWeight="700" fill={V("text")}>{d.densidad === "N/A" ? "N/A" : d.valor + "%"}</text>
            </g>
          );
        })}
      </svg>
      {det && <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}><b>{det.group}</b>: {det.miembros} estudiantes · {det.connInt} conexiones dentro del grupo · {det.connExt} con otros grupos · densidad {det.densidad}.</div>}
    </Marco>
  );
}

// ── 3. Mapa de calor entre grupos ──
function CalorGrupos({ students, conns }) {
  const ref = useRef(null);
  const [tipo, setTipo] = useState("pos");
  const [celda, setCelda] = useState(null);
  const m = useMemo(() => mapaCalorGrupos(students, conns, tipo), [students, conns, tipo]);
  const n = m.grupos.length, c = Math.min(64, Math.floor(480 / Math.max(n, 1))), ml = 90, mt = 70, W = ml + n * c + 20, H = mt + n * c + 16;
  const color = tipo === "neg" ? "239,68,68" : "20,184,166";
  return (
    <Marco titulo="Conexiones entre grupos" ayuda="conexiones" svgRef={n < 2 ? null : ref} archivo="conexiones-entre-grupos" nota="Cada celda cuenta cuántas conexiones van del grupo de la fila (quien elige) al de la columna (quien es elegido). La diagonal son vínculos dentro del mismo grupo.">
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}><button type="button" style={btn(tipo === "pos")} onClick={() => setTipo("pos")}>Elecciones positivas</button><button type="button" style={btn(tipo === "neg")} onClick={() => setTipo("neg")}>Rechazos</button></div>
      {n < 2 ? <div style={{ fontSize: 12, color: V("t3") }}>Se necesitan al menos dos grupos con datos para este gráfico.</div> : (
        <svg ref={ref} viewBox={`0 0 ${Math.max(W, 300)} ${H}`} style={{ width: "100%", maxWidth: Math.max(W, 300) * 1.3, height: "auto", display: "block" }} fontFamily="system-ui, sans-serif">
          {m.grupos.map((g, j) => <text key={"c" + g} x={ml + j * c + c / 2} y={mt - 8} fontSize="11" fill={V("t2")} textAnchor="start" transform={`rotate(-35 ${ml + j * c + c / 2} ${mt - 8})`}>{corto(g, 9)}</text>)}
          {m.grupos.map((f, i) => (
            <g key={f}>
              <text x={ml - 8} y={mt + i * c + c / 2 + 4} textAnchor="end" fontSize="11" fill={V("t2")}>{corto(f, 11)}</text>
              {m.grupos.map((t, j) => {
                const v = m.celdas[f][t], a = m.max ? 0.12 + 0.78 * (v / m.max) : 0.06, on = celda && celda.f === f && celda.t === t;
                return (
                  <g key={t} role="button" tabIndex={0} aria-label={`${f} hacia ${t}: ${v}`} data-celda={`${f}>${t}`} style={{ cursor: "pointer" }} onClick={() => setCelda({ f, t, v })} onKeyDown={(e) => e.key === "Enter" && setCelda({ f, t, v })}>
                    <rect x={ml + j * c} y={mt + i * c} width={c - 2} height={c - 2} rx="4" fill={`rgba(${color},${a})`} stroke={on ? V("text") : V("border")} strokeWidth={on ? 2 : 1} />
                    <text x={ml + j * c + c / 2 - 1} y={mt + i * c + c / 2 + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={V("text")}>{v}</text>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      )}
      {celda && <div style={{ fontSize: 12, marginTop: 8 }}>{celda.f === celda.t ? <>Dentro de <b>{celda.f}</b>: {celda.v} {tipo === "neg" ? "rechazos" : "elecciones positivas"}.</> : <>De <b>{celda.f}</b> hacia <b>{celda.t}</b>: {celda.v} {tipo === "neg" ? "rechazos" : "elecciones positivas"}.</>}</div>}
    </Marco>
  );
}

// ── 4. Aceptación vs rechazo (un punto por estudiante) ──
function Dispersion({ report, ver, onPick, pickId }) {
  const ref = useRef(null);
  const [ocultos, setOcultos] = useState(() => new Set());
  const pts = useMemo(() => puntosDispersion(report), [report]);
  const W = 640, H = 420, ml = 48, mr = 16, mt = 14, mb = 42, iw = W - ml - mr, ih = H - mt - mb;
  const mx = maxEje(Math.max(1, ...pts.map((p) => p.x))), my = maxEje(Math.max(1, ...pts.map((p) => p.y)));
  const px = (v) => ml + (v / mx) * iw, py = (v) => mt + ih - (v / my) * ih;
  const prom = (k) => (pts.length ? pts.reduce((a, p) => a + p[k], 0) / pts.length : 0);
  const cont = {};
  const colocados = pts.filter((p) => !ocultos.has(p.rol)).map((p) => {
    const k = `${p.x}|${p.y}`, i = (cont[k] = (cont[k] ?? -1) + 1), ang = i * 2.4, r = 7 * Math.sqrt(i);
    return { ...p, cx: px(p.x) + r * Math.cos(ang), cy: py(p.y) + r * Math.sin(ang) };
  });
  const etiquetar = (p) => ver && (pts.length <= 16 || ["rechazado", "controvertido", "aislado"].includes(p.rol) || String(p.id) === String(pickId));
  const alternar = (rol) => setOcultos((s) => { const n = new Set(s); n.has(rol) ? n.delete(rol) : n.add(rol); return n; });
  return (
    <Marco titulo="Aceptación y rechazo por estudiante" ayuda="rechazo" svgRef={ref} archivo="aceptacion-vs-rechazo" nota="Cada punto es un estudiante. A la derecha, más elegido; arriba, más rechazado. Las líneas punteadas son el promedio. Arriba a la derecha están los controvertidos; arriba a la izquierda, quienes más se deben vigilar. Haz clic en un punto para ver su ficha.">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} fontFamily="system-ui, sans-serif">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={ml} x2={W - mr} y1={py(my * f)} y2={py(my * f)} stroke={V("border")} strokeWidth="1" /><text x={ml - 6} y={py(my * f) + 4} fontSize="10" textAnchor="end" fill={V("t3")}>{Math.round(my * f)}%</text><text x={px(mx * f)} y={H - mb + 16} fontSize="10" textAnchor="middle" fill={V("t3")}>{Math.round(mx * f)}%</text></g>)}
        <text x={ml + iw / 2} y={H - 6} fontSize="11" textAnchor="middle" fill={V("t2")}>Aceptación (% de compañeros que lo eligieron)</text>
        <text transform={`translate(12 ${mt + ih / 2}) rotate(-90)`} fontSize="11" textAnchor="middle" fill={V("t2")}>Rechazo (% que lo marcó)</text>
        <line x1={px(prom("x"))} x2={px(prom("x"))} y1={mt} y2={mt + ih} stroke={V("t3")} strokeDasharray="4 4" />
        <line x1={ml} x2={W - mr} y1={py(prom("y"))} y2={py(prom("y"))} stroke={V("t3")} strokeDasharray="4 4" />
        {colocados.map((p) => {
          const on = String(p.id) === String(pickId);
          return (
            <g key={p.id} role="button" tabIndex={0} aria-label={`${ver ? p.name : "Estudiante"}: aceptación ${p.x}%, rechazo ${p.y}%`} data-punto={p.id} style={{ cursor: "pointer" }} onClick={() => onPick(p.id)} onKeyDown={(e) => e.key === "Enter" && onPick(p.id)}>
              <circle cx={p.cx} cy={p.cy} r="13" fill="transparent" />
              <circle cx={p.cx} cy={p.cy} r={on ? 9 : 6.5} fill={ROL_COLOR[p.rol]} fillOpacity="0.9" stroke={on ? V("text") : "#ffffff"} strokeWidth={on ? 2.5 : 1} />
              {etiquetar(p) && <text x={p.cx + 9} y={p.cy + 4} fontSize="10" fill={V("text")}>{corto(p.name, 18)}</text>}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
        {ROLES_ORDEN.map((rol) => <button key={rol} type="button" aria-pressed={!ocultos.has(rol)} onClick={() => alternar(rol)} style={{ ...btn(false), opacity: ocultos.has(rol) ? 0.4 : 1, display: "flex", alignItems: "center", gap: 5, padding: "2px 9px", fontSize: 11 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: ROL_COLOR[rol] }} />{ROLE_LABELS[rol]} ({pts.filter((p) => p.rol === rol).length})</button>)}
      </div>
    </Marco>
  );
}

// ── 5. Ranking de relaciones mutuas ──
function Mutuas({ report, ver, onPick, pickId }) {
  const ref = useRef(null);
  const [tipo, setTipo] = useState("pos");
  const datos = useMemo(() => rankingMutuas(report, tipo, 10), [report, tipo]);
  const W = 640, fila = 28, ml = 150, H = Math.max(datos.length, 1) * fila + 10, max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <Marco titulo="Relaciones mutuas" ayuda="mutuas" svgRef={datos.length ? ref : null} archivo="relaciones-mutuas" nota="Las 10 personas con más relaciones mutuas. Las positivas son amistades de ida y vuelta; los rechazos mutuos son conflictos de dos lados.">
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}><button type="button" style={btn(tipo === "pos")} onClick={() => setTipo("pos")}>Mutuas positivas</button><button type="button" style={btn(tipo === "neg")} onClick={() => setTipo("neg")}>Rechazos mutuos</button></div>
      {!datos.length ? <div style={{ fontSize: 12, color: V("t3") }}>{tipo === "pos" ? "Todavía no hay relaciones mutuas positivas." : "No hay rechazos mutuos."}</div> : (
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} fontFamily="system-ui, sans-serif">
          {datos.map((d, i) => {
            const w = (d.valor / max) * (W - ml - 50), on = String(d.id) === String(pickId);
            return (
              <g key={d.id} role="button" tabIndex={0} aria-label={`${ver ? d.name : "Estudiante"}: ${d.valor}`} data-mutua={d.id} style={{ cursor: "pointer" }} onClick={() => onPick(d.id)} onKeyDown={(e) => e.key === "Enter" && onPick(d.id)}>
                <text x={ml - 8} y={i * fila + 18} textAnchor="end" fontSize="12" fill={V("text")}>{corto(nombreVisible({ id: d.id, name: d.name }, ver), 20)}</text>
                <rect x={ml} y={i * fila + 5} width={Math.max(w, 3)} height={18} rx="3" fill={tipo === "neg" ? V("err") : V("teal")} stroke={on ? V("text") : "none"} strokeWidth="2" />
                <text x={ml + w + 6} y={i * fila + 19} fontSize="12" fontWeight="700" fill={V("text")}>{d.valor}</text>
              </g>
            );
          })}
        </svg>
      )}
    </Marco>
  );
}

// ── 6. Gráfico individual: indicadores contra el grupo + red de relaciones ──
const REL = {
  mutuaPos: { c: "#14b8a6", l: "Se eligen mutuamente", w: 3 }, mutuaNeg: { c: "#ef4444", l: "Se rechazan mutuamente", w: 3, d: "5 3" },
  meEligio: { c: "#3b82f6", l: "Lo eligió a él/ella", w: 1.8 }, loElegi: { c: "#38bdf8", l: "Él/ella lo eligió", w: 1.8 },
  meRechazo: { c: "#f97316", l: "Lo rechazó a él/ella", w: 1.8, d: "5 3" }, loRechace: { c: "#f43f5e", l: "Él/ella lo rechazó", w: 1.8, d: "5 3" },
  neutral: { c: "#94a3b8", l: "Neutral", w: 1.2 },
};
// «da» = lo que el estudiante central hizo hacia el otro; «recibe» = lo que el otro hizo hacia él.
function clasificar(n) {
  if (n.mutuaPos) return "mutuaPos";
  if (n.mutuaNeg) return "mutuaNeg";
  if (n.recibe.pos) return "meEligio";
  if (n.da.pos) return "loElegi";
  if (n.recibe.neg) return "meRechazo";
  if (n.da.neg) return "loRechace";
  return "neutral";
}

function Individual({ report, students, conns, ver, estId, setEstId }) {
  const ref = useRef(null), ref2 = useRef(null);
  const [vecino, setVecino] = useState(null);
  const orden = useMemo(() => [...students].sort((a, b) => a.name.localeCompare(b.name, "es")), [students]);
  const row = report.rows.find((r) => String(r.student.id) === String(estId));
  const red = useMemo(() => (row ? redIndividual(row.student.id, students, conns).map((n) => ({ ...n, rel: clasificar(n) })) : []), [row, students, conns]);
  const prom = (k) => (report.rows.length ? Math.round((report.rows.reduce((a, r) => a + Number(r[k]), 0) / report.rows.length) * 10) / 10 : 0);
  const MAXN = 36;
  const prioridad = Object.keys(REL);
  const vis = [...red].sort((a, b) => prioridad.indexOf(a.rel) - prioridad.indexOf(b.rel) || a.name.localeCompare(b.name, "es")).slice(0, MAXN);
  const W = 640, H = 480, cx = W / 2, cy = H / 2 - 10, rx = 250, ry = 175;
  const pos = vis.map((n, i) => { const a = (i / vis.length) * Math.PI * 2 - Math.PI / 2; return { ...n, x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }; });
  const det = vecino ? pos.find((n) => n.id === vecino) : null;
  const bw = 420, barras = row ? [["Aceptación", Number(row.popularidad), prom("popularidad"), V("teal")], ["Rechazo", Number(row.rechazo), prom("rechazo"), V("err")], ["Expansión", Number(row.expansion), prom("expansion"), V("violet")]] : [];
  const mb = maxEje(Math.max(1, ...barras.flatMap((b) => [b[1], b[2]])));
  return (
    <>
      <section style={caja}>
        <label style={{ fontSize: 12, color: V("t2") }}>Estudiante: <select aria-label="Estudiante" value={estId || ""} onChange={(e) => { setEstId(e.target.value); setVecino(null); }} style={{ ...sel, marginLeft: 6 }}>
          <option value="">— Elige un estudiante —</option>
          {orden.map((s) => <option key={s.id} value={s.id}>{nombreVisible(s, ver)} · {s.group}</option>)}
        </select></label>
      </section>
      {!row ? <div style={{ ...caja, fontSize: 12, color: V("t3") }}>Elige un estudiante (o haz clic en uno desde otro gráfico) para ver su perfil.</div> : (
        <>
          <Marco titulo={`Indicadores de ${nombreVisible(row.student, ver)} frente al grupo`} ayuda="aceptacion" svgRef={ref} archivo={`indicadores-${row.student.id}`} nota="Barra gruesa: el estudiante. Barra fina con rayas: promedio del grupo.">
            <svg ref={ref} viewBox={`0 0 640 ${barras.length * 52 + 14}`} style={{ width: "100%", height: "auto", display: "block" }} fontFamily="system-ui, sans-serif">
              {barras.map(([l, v, p, c], i) => (
                <g key={l}>
                  <text x="100" y={i * 52 + 24} textAnchor="end" fontSize="12" fill={V("text")}>{l}</text>
                  <rect x="110" y={i * 52 + 8} width={Math.max((v / mb) * bw, 2)} height="20" rx="3" fill={c} />
                  <text x={116 + (v / mb) * bw} y={i * 52 + 23} fontSize="12" fontWeight="700" fill={V("text")}>{v}%</text>
                  <rect x="110" y={i * 52 + 32} width={Math.max((p / mb) * bw, 2)} height="9" rx="2" fill={V("t3")} fillOpacity="0.55" />
                  <text x={116 + (p / mb) * bw} y={i * 52 + 41} fontSize="10" fill={V("t2")}>grupo {p}%</text>
                </g>
              ))}
            </svg>
          </Marco>
          <Marco titulo={`Red de relaciones de ${nombreVisible(row.student, ver)}`} ayuda="conexiones" svgRef={ref2} archivo={`red-${row.student.id}`} nota={`Al centro, el estudiante; alrededor, los compañeros con los que tiene alguna relación${red.length > MAXN ? ` (se muestran ${MAXN} de ${red.length})` : ""}. El color indica la relación. Haz clic en un compañero para ver el detalle.`}>
            <svg ref={ref2} viewBox={`0 0 ${W} ${H + 50}`} style={{ width: "100%", height: "auto", display: "block" }} fontFamily="system-ui, sans-serif">
              {pos.map((n) => <line key={"l" + n.id} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke={REL[n.rel].c} strokeWidth={REL[n.rel].w} strokeDasharray={REL[n.rel].d} strokeOpacity="0.8" />)}
              {pos.map((n) => (
                <g key={n.id} role="button" tabIndex={0} aria-label={`${ver ? n.name : "Estudiante"}: ${REL[n.rel].l}`} data-vecino={n.id} style={{ cursor: "pointer" }} onClick={() => setVecino(n.id)} onKeyDown={(e) => e.key === "Enter" && setVecino(n.id)}>
                  <circle cx={n.x} cy={n.y} r={vecino === n.id ? 10 : 7.5} fill={REL[n.rel].c} stroke={vecino === n.id ? V("text") : "#fff"} strokeWidth={vecino === n.id ? 2.5 : 1} />
                  <text x={n.x} y={n.y + (n.y < cy ? -12 : 20)} fontSize="10" textAnchor="middle" fill={V("text")}>{ver ? corto(n.name.split(" ").slice(0, 2).join(" "), 16) : ""}</text>
                </g>
              ))}
              <circle cx={cx} cy={cy} r="16" fill={ROL_COLOR[row.rol]} stroke={V("text")} strokeWidth="2" />
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">{row.student.av || ""}</text>
              {Object.entries(REL).map(([k, r], i) => <g key={k} transform={`translate(${12 + (i % 4) * 158}, ${H - 4 + Math.floor(i / 4) * 18})`}><line x1="0" x2="16" y1="5" y2="5" stroke={r.c} strokeWidth={r.w} strokeDasharray={r.d} /><text x="20" y="9" fontSize="10" fill={V("t2")}>{r.l}</text></g>)}
            </svg>
            {det && (
              <div data-detalle-vecino style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6, border: `1px solid ${V("border")}`, borderRadius: 8, padding: 10, background: V("surface") }}>
                <b>{nombreVisible(det, ver)}</b> ({det.group}) · {REL[det.rel].l}.
                <div style={{ color: V("t2") }}>Él/ella eligió {det.recibe.pos} vez(ces) positivamente y {det.recibe.neg} negativamente a {row.student.name.split(" ")[0]}; {row.student.name.split(" ")[0]} lo eligió {det.da.pos} y lo marcó negativamente {det.da.neg}.</div>
                {det.notas.length > 0 && <ul style={{ margin: "6px 0 0 16px" }}>{det.notas.map((n, i) => <li key={i}><i>«{n.text}»</i> <span style={{ color: V("t3") }}>— {n.q}</span></li>)}</ul>}
              </div>
            )}
          </Marco>
          <section style={caja}><Ficha row={row} report={report} ver={ver} /></section>
        </>
      )}
    </>
  );
}

// ── 7. Comparar dos aplicaciones (antes y después) ──
function Comparar({ students, surveys, responses, ver, onPick }) {
  const aplic = useMemo(() => surveys.filter((s) => !s.deleted && responses.some((r) => r.surveyId === s.id)), [surveys, responses]);
  const [a, setA] = useState(""), [b, setB] = useState("");
  const rep = (id) => {
    const rs = responses.filter((r) => r.surveyId === id);
    const cn = buildConnections(rs, surveys);
    const ids = new Set(students.map((s) => String(s.id)));
    return computeReport(students, cn.filter((c) => ids.has(String(c.f)) && ids.has(String(c.t))));
  };
  const cmp = useMemo(() => (a && b && a !== b ? compararAplicaciones(rep(a), rep(b)) : null), [a, b, students, surveys, responses]); // eslint-disable-line
  if (aplic.length < 2) return <div style={{ ...caja, fontSize: 12, color: V("t3") }}>Para comparar necesitas al menos dos encuestas con respuestas (por ejemplo, la de inicio y la de fin de año).</div>;
  const cambios = cmp ? cmp.cambios.filter((c) => c.cambioRol || Math.abs(c.dRechazo) >= 10 || Math.abs(c.dAceptacion) >= 10) : [];
  const fila = (l, x, y, extra = "") => <tr><td style={{ padding: "4px 8px" }}>{l}</td><td style={{ padding: "4px 8px", textAlign: "right" }}>{x}</td><td style={{ padding: "4px 8px", textAlign: "right" }}>{y}</td><td style={{ padding: "4px 8px", textAlign: "right", color: V("t2") }}>{extra}</td></tr>;
  const sg = (d) => (d > 0 ? "+" + d : String(d));
  return (
    <>
      <section style={caja}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: V("t2") }}>
          <label>Antes: <select aria-label="Antes" value={a} onChange={(e) => setA(e.target.value)} style={sel}><option value="">—</option>{aplic.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
          <label>Después: <select aria-label="Después" value={b} onChange={(e) => setB(e.target.value)} style={sel}><option value="">—</option>{aplic.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
        </div>
      </section>
      {!cmp ? <div style={{ ...caja, fontSize: 12, color: V("t3") }}>Elige dos encuestas distintas.</div> : (
        <>
          <Marco titulo="Cambios en el grupo" ayuda="densidad" nota="Compara las mismas personas en las dos aplicaciones. Solo se muestran estudiantes que cambiaron de rol o variaron 10 puntos o más.">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ color: V("t3"), textAlign: "right" }}><th style={{ textAlign: "left", padding: "4px 8px" }}>Indicador</th><th style={{ padding: "4px 8px" }}>Antes</th><th style={{ padding: "4px 8px" }}>Después</th><th style={{ padding: "4px 8px" }}>Cambio</th></tr></thead>
              <tbody>
                {fila("Conexiones", cmp.kpiA.conexiones, cmp.kpiB.conexiones, sg(cmp.kpiB.conexiones - cmp.kpiA.conexiones))}
                {fila("Densidad", cmp.kpiA.densidad + "%", cmp.kpiB.densidad + "%", sg(+(cmp.kpiB.densidad - cmp.kpiA.densidad).toFixed(1)) + " pts")}
                {fila("Relaciones mutuas positivas", cmp.kpiA.mutuasPos, cmp.kpiB.mutuasPos, sg(cmp.kpiB.mutuasPos - cmp.kpiA.mutuasPos))}
                {fila("Rechazos mutuos", cmp.kpiA.rechazosMutuos, cmp.kpiB.rechazosMutuos, sg(cmp.kpiB.rechazosMutuos - cmp.kpiA.rechazosMutuos))}
              </tbody>
            </table>
          </Marco>
          <Marco titulo={`Estudiantes que cambiaron (${cambios.length})`} nota="Haz clic en un nombre para ver su ficha.">
            {!cambios.length ? <div style={{ fontSize: 12, color: V("t3") }}>No hay cambios relevantes.</div> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ color: V("t3"), textAlign: "left" }}><th style={{ padding: "4px 8px" }}>Estudiante</th><th style={{ padding: "4px 8px" }}>Rol</th><th style={{ padding: "4px 8px" }}>Aceptación</th><th style={{ padding: "4px 8px" }}>Rechazo</th></tr></thead>
                <tbody>
                  {cambios.map((c) => (
                    <tr key={c.id} style={{ borderTop: `1px solid ${V("border")}` }}>
                      <td style={{ padding: "4px 8px" }}><button type="button" onClick={() => onPick(c.id)} style={{ background: "none", border: "none", color: V("rx"), cursor: "pointer", fontFamily: "inherit", fontSize: 12, padding: 0 }}>{nombreVisible({ id: c.id, name: c.name }, ver)}</button></td>
                      <td style={{ padding: "4px 8px" }}>{c.cambioRol ? <><Chip rol={c.rolA} /> → <Chip rol={c.rolB} /></> : <Chip rol={c.rolB} />}</td>
                      <td style={{ padding: "4px 8px" }}>{c.aceptacionA}% → {c.aceptacionB}% <span style={{ color: c.dAceptacion >= 0 ? V("ok") : V("err") }}>({sg(c.dAceptacion)})</span></td>
                      <td style={{ padding: "4px 8px" }}>{c.rechazoA}% → {c.rechazoB}% <span style={{ color: c.dRechazo <= 0 ? V("ok") : V("err") }}>({sg(c.dRechazo)})</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Marco>
        </>
      )}
    </>
  );
}

// ── Panel principal ──
export function GraficosPanel({ students, conns, surveys = [], responses = [], verNombres = true }) {
  const grupos = useMemo(() => [...new Set(students.map((s) => s.group))], [students]);
  const [vista, setVista] = useState("grupo");
  const [grupo, setGrupo] = useState("Todos");
  const [pickRol, setPickRol] = useState(null);
  const [pickDens, setPickDens] = useState(null);
  const [estId, setEstId] = useState("");
  const st = grupo === "Todos" ? students : students.filter((s) => s.group === grupo);
  const cn = useMemo(() => { const ids = new Set(st.map((s) => String(s.id))); return conns.filter((c) => ids.has(String(c.f)) && ids.has(String(c.t))); }, [st, conns]);
  const report = useMemo(() => computeReport(st, cn), [st, cn]);
  const row = report.rows.find((r) => String(r.student.id) === String(estId));
  const irIndividual = (id) => { setEstId(String(id)); if (!st.some((x) => String(x.id) === String(id))) setGrupo("Todos"); setVista("individual"); };
  const elegir = (id) => setEstId(String(id));
  const vistas = [["grupo", "Panorama del grupo"], ["estudiantes", "Estudiantes"], ["individual", "Individual"], ["comparar", "Comparar aplicaciones"]];
  return (
    <div data-graficos style={{ maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>📈 Gráficos</h2>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{vistas.map(([k, l]) => <button key={k} type="button" aria-pressed={vista === k} onClick={() => setVista(k)} style={btn(vista === k)}>{l}</button>)}</div>
        <span style={{ flex: 1 }} />
        {vista !== "comparar" && <label style={{ fontSize: 12, color: V("t2") }}>Grupo: <select aria-label="Grupo" value={grupo} onChange={(e) => { setGrupo(e.target.value); setPickRol(null); setPickDens(null); }} style={sel}><option>Todos</option>{grupos.map((g) => <option key={g}>{g}</option>)}</select></label>}
      </div>
      {!verNombres && <div style={{ fontSize: 11, color: V("amber"), marginBottom: 8 }}>Tu rol no muestra nombres de estudiantes en los gráficos.</div>}
      {vista === "grupo" && <><RolesGrupo report={report} pick={pickRol} onPick={setPickRol} /><DensidadGrupo report={report} pick={pickDens} onPick={setPickDens} /><CalorGrupos students={st} conns={cn} /></>}
      {vista === "estudiantes" && <>
        <Dispersion report={report} ver={verNombres} onPick={elegir} pickId={estId} />
        <section style={caja}><Ficha row={row} report={report} ver={verNombres} onIndividual={irIndividual} /></section>
        <Mutuas report={report} ver={verNombres} onPick={elegir} pickId={estId} />
      </>}
      {vista === "individual" && <Individual report={report} students={st} conns={cn} ver={verNombres} estId={estId} setEstId={setEstId} />}
      {vista === "comparar" && <Comparar students={students} surveys={surveys} responses={responses} ver={verNombres} onPick={irIndividual} />}
    </div>
  );
}
