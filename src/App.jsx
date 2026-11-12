import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { auth, loginWithGoogle, logout, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { initials, parseBulkStudents, density, buildConnections, buildRoster, surveyProgress, groupExists, groupIdFor, allGroupNames, missingGroups, searchGroups, highlightRange, hasType, filterConns, nodeStats, rankStudents, surveyGroups, needsGroupFix, rosterIsStale } from "./lib/sociometry";
import { tint, mixOn, ink } from "./lib/color";
import { REPORT_TYPES, computeReport, renderReportHTML, reportFileName } from "./lib/reports";
import { buildActivity, formatWhen } from "./lib/activity";
import { buildXlsx, XLSX_MIME } from "./lib/xlsx";
import { buildResultsSheets, resultsFileName } from "./lib/results";
import { revokePatch, reactivateRole, userActions, statusLabel, ROLE_NAMES } from "./lib/users";
import { slugify, parsePublicSurveyUrl, planMigration, chunk, LEGACY_COLEGIO_ID } from "./lib/colegio";
import { esEncuestaPublica, urlSoporte, cargarWidget, configuracionSoporte } from "./lib/soporte";
import { plantillaCSV, PLANTILLA_NOMBRE, parsearImportacion, planImportacion } from "./lib/importar";
import { plantillaEncuestaCSV, PLANTILLA_ENCUESTA_NOMBRE, buildTemplateSurvey, countTipos, exportSurveyJSON, surveyToCSV, surveyFileName, parseSurveyImport } from "./lib/surveys";
import { aMs, estadoLicencia, mensajeLicencia, renovar, licenciaNueva, excedeTope, PLANES, etiquetaPlan, aplicarPlan, validarPlanes, aplicarPlanes, porAvisar, recordatorio } from "./lib/licencia";
import { CAMPOS_EMPRESA, CAMPOS_COLEGIO, faltantes, precioConDescuento, numeroContrato, generarContratoHTML, CONTRATO_VERSION } from "./lib/contrato";
import { MEDIOS_PAGO, validarPago, resumenPagos, carteraGeneral, entradaHistorial } from "./lib/gestion";
import { COLEGIO_GESTION, COLEGIO_SUBCOLLECTIONS, buildExport, exportFileName, confirmaEliminar, etiquetaEstado } from "./lib/export";
import { Timestamp, collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, updateDoc, serverTimestamp, query, orderBy, collectionGroup, where, writeBatch, deleteField, addDoc, limit } from "firebase/firestore";

// ═══════════════════════════════════════
// REDNEXO — Inteligencia Sociométrica
// EXTENDED VERSION — All Features
// ═══════════════════════════════════════

// ════════ THEME SYSTEM ════════
// C usa CSS custom properties → un solo toggle de clase en <html> cambia todo
// cc() devuelve hex crudo para uso en Canvas (no soporta CSS vars)

const C = {
  bg:        "var(--c-bg)",
  bgSub:     "var(--c-bgSub)",
  surface:   "var(--c-surface)",
  card:      "var(--c-card)",
  cardAlt:   "var(--c-cardAlt)",
  cardHov:   "var(--c-cardHov)",
  border:    "var(--c-border)",
  borderLit: "var(--c-borderLit)",
  rx:        "var(--c-rx)",
  rxDim:     "var(--c-rxDim)",
  rxGlow:    "var(--c-rxGlow)",
  teal:      "var(--c-teal)",
  tealDim:   "var(--c-tealDim)",
  violet:    "var(--c-violet)",
  violetDim: "var(--c-violetDim)",
  amber:     "var(--c-amber)",
  amberDim:  "var(--c-amberDim)",
  sky:       "var(--c-sky)",
  skyDim:    "var(--c-skyDim)",
  text:      "var(--c-text)",
  t2:        "var(--c-t2)",
  t3:        "var(--c-t3)",
  ok:        "var(--c-ok)",
  err:       "var(--c-err)",
  white:     "#ffffff",
};

// Hex crudos para Canvas (dark)
const _D = {
  bg:"#08080c",bgSub:"#0c0c12",surface:"#12131a",card:"#16171f",
  cardHov:"#1e1f2b",border:"#252637",borderLit:"#35374a",
  rx:"#3b82f6",teal:"#2dd4bf",violet:"#a78bfa",amber:"#fbbf24",
  sky:"#38bdf8",text:"#eaedf6",t2:"#9498ae",t3:"#555770",
  ok:"#34d399",err:"#f87171",
};
// Hex crudos para Canvas (light)
const _L = {
  bg:"#f0f2f8",bgSub:"#e8eaf2",surface:"#ffffff",card:"#ffffff",
  cardHov:"#eef0fa",border:"#dde1f0",borderLit:"#c5cae0",
  rx:"#2563eb",teal:"#0fa89a",violet:"#7c5fe8",amber:"#c98f00",
  sky:"#0e8fc0",text:"#0d0f1a",t2:"#444666",t3:"#888aaa",
  ok:"#1a9e72",err:"#d63c3c",
};

// Helper para Canvas: devuelve hex según tema activo
const cc = (key) => {
  const isLight = document.documentElement.classList.contains("light");
  return isLight ? (_L[key] || _D[key]) : (_D[key] || "#888");
};

const THEME_CSS = `
:root {
  --c-bg:#08080c;--c-bgSub:#0c0c12;--c-surface:#12131a;
  --c-card:#16171f;--c-cardAlt:#1a1b25;--c-cardHov:#1e1f2b;
  --c-border:#252637;--c-borderLit:#35374a;
  --c-rx:#3b82f6;--c-rxDim:#3b82f612;--c-rxGlow:#3b82f625;
  --c-teal:#2dd4bf;--c-tealDim:#2dd4bf12;
  --c-violet:#a78bfa;--c-violetDim:#a78bfa12;
  --c-amber:#fbbf24;--c-amberDim:#fbbf2412;
  --c-sky:#38bdf8;--c-skyDim:#38bdf812;
  --c-text:#eaedf6;--c-t2:#9498ae;--c-t3:#555770;
  --c-ok:#34d399;--c-err:#f87171;
}
:root.light {
  --c-bg:#f0f2f8;--c-bgSub:#e8eaf2;--c-surface:#ffffff;
  --c-card:#ffffff;--c-cardAlt:#f5f6fc;--c-cardHov:#eef0fa;
  --c-border:#dde1f0;--c-borderLit:#c5cae0;
  --c-rx:#2563eb;--c-rxDim:#2563eb18;--c-rxGlow:#2563eb30;
  --c-teal:#0fa89a;--c-tealDim:#0fa89a18;
  --c-violet:#7c5fe8;--c-violetDim:#7c5fe818;
  --c-amber:#c98f00;--c-amberDim:#c98f0018;
  --c-sky:#0e8fc0;--c-skyDim:#0e8fc018;
  --c-text:#0d0f1a;--c-t2:#444666;--c-t3:#888aaa;
  --c-ok:#1a9e72;--c-err:#d63c3c;
}
`;

// Inyecta las variables de tema una sola vez, para que registro, carga y encuesta pública también tengan colores
if (typeof document !== "undefined" && !document.getElementById("rn-theme-vars")) {
  const st = document.createElement("style");
  st.id = "rn-theme-vars";
  st.textContent = THEME_CSS;
  document.head.appendChild(st);
}

// ── Colegio activo: todos los datos viven en colegios/{id}/... (ver firestore.rules) ──
let CID = null;
let SCHOOL = { nombre: "", logo: "" };
let SESSION_EMAIL = "";
let SESSION_NAME = "";
const ROOT_EMAIL = "franksanlo@gmail.com";   // debe coincidir con isRoot() en firestore.rules (la validación real es la de las reglas)
const setCurrentColegio = (id) => { CID = id; };
const ccol = (name) => collection(db, "colegios", CID, name);
const cdoc = (name, id) => doc(db, "colegios", CID, name, id);
// Lo que la encuesta pública necesita (lista de nombres y marca del colegio) viaja dentro de la encuesta activa.
const publicSurveyInfo = (sv, students) => ({ ...buildRoster(sv, students), colegioNombre: SCHOOL.nombre || "", ...(SCHOOL.logo ? { logo: SCHOOL.logo } : {}) });

/** Descarga un archivo de texto desde el navegador. */
function downloadFile(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
/** Descarga un archivo binario (p. ej. .xlsx) desde el navegador. */
function downloadBytes(name, bytes, mime) {
  const blob = new Blob([bytes], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const blankSurvey = () => ({ title: "", group: GROUPS?.[0] || "", groups: [], maxSel: 3, questions: [] });
const TIPO_INFO = { pos: { l: "Positiva", s: "+", c: () => C.teal }, neu: { l: "Neutral", s: "○", c: () => C.amber }, neg: { l: "Negativa", s: "−", c: () => C.err } };

// ── Operaciones de plataforma: bitácora, exportar y eliminar un colegio ──
/**
 * Registro de actividad del colegio (lo ve el administrador en la pestaña Actividad).
 * Nunca debe romper la acción que lo origina: si no se puede escribir, solo avisa en la consola.
 * El detalle habla de grupos, encuestas y cantidades; no se guardan nombres de estudiantes.
 */
function logActivity(type, action, detail = "") {
  if (!CID || !SESSION_EMAIL) return;
  addDoc(ccol("activity"), { ...buildActivity(type, action, detail, SESSION_NAME, SESSION_EMAIL), createdAt: serverTimestamp() })
    .catch((e) => console.log("Actividad no registrada:", e.code || e.message));
}

async function logAudit(accion, colegio, por, detalle = {}) {
  try { await addDoc(collection(db, "auditoria"), { accion, colegio, por, en: serverTimestamp(), ...detalle }); } catch (e) { console.log("auditoría no registrada", e); }
}

/** Descarga un .json con TODO lo del colegio. Devuelve los conteos para que la persona verifique. */
async function exportColegio(colegio, por) {
  const cols = {};
  for (const name of COLEGIO_SUBCOLLECTIONS) {
    try { cols[name] = (await getDocs(collection(db, "colegios", colegio.id, name))).docs.map((d) => ({ id: d.id, ...d.data() })); } catch (e) { cols[name] = []; }
  }
  const pack = buildExport(colegio, cols);
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = exportFileName(colegio.id); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  await logAudit("exportar", colegio.id, por, { conteos: pack.conteos });
  return pack.conteos;
}

/** Borra todas las subcolecciones y por último el colegio. Irreversible: la interfaz exige confirmación escrita. */
async function eliminarColegio(id, por, onProgress = () => {}) {
  let n = 0;
  for (const name of [...COLEGIO_SUBCOLLECTIONS, ...COLEGIO_GESTION]) {
    const snap = await getDocs(collection(db, "colegios", id, name));
    for (const part of chunk(snap.docs, 400)) {
      const b = writeBatch(db); part.forEach((d) => b.delete(d.ref)); await b.commit();
      n += part.length; onProgress(n);
    }
  }
  await deleteDoc(doc(db, "colegios", id));
  await logAudit("eliminar", id, por, { documentos: n });
  return n;
}

const ROLES = {
  admin: { label: "Administrador", color: C.rx, icon: "🏫", desc: "Gestiona su colegio" },
  superadmin: {
    label: "Super Admin",
    color: C.rx,
    icon: "⚡",
    desc: "Control total",
  },
  psychologist: {
    label: "Psicólogo Escolar",
    color: C.violet,
    icon: "🧠",
    desc: "Encuestas y análisis",
  },
  readonly: {
    label: "Solo Lectura",
    color: C.sky,
    icon: "👁",
    desc: "Solo visualización",
  },
};

const initStudents = [
  { id: 1, name: "Ana García", group: "5° A", av: "AG" },
  { id: 2, name: "Carlos Ruiz", group: "5° A", av: "CR" },
  { id: 3, name: "María López", group: "5° B", av: "ML" },
  { id: 4, name: "Juan Torres", group: "5° B", av: "JT" },
  { id: 5, name: "Laura Díaz", group: "5° A", av: "LD" },
  { id: 6, name: "Pedro Sánchez", group: "6° A", av: "PS" },
  { id: 7, name: "Sofia Morales", group: "6° A", av: "SM" },
  { id: 8, name: "Diego Herrera", group: "5° B", av: "DH" },
  { id: 9, name: "Valentina Ríos", group: "5° A", av: "VR" },
  { id: 10, name: "Andrés Mejía", group: "6° A", av: "AM" },
];

const initConns = [
  { f: 1, t: 2, s: 3, tp: "pos" },
  { f: 1, t: 3, s: 2, tp: "pos" },
  { f: 1, t: 5, s: 3, tp: "pos" },
  { f: 2, t: 4, s: 1, tp: "neu" },
  { f: 2, t: 5, s: 2, tp: "pos" },
  { f: 3, t: 4, s: 3, tp: "pos" },
  { f: 3, t: 8, s: 2, tp: "pos" },
  { f: 4, t: 8, s: 1, tp: "neg" },
  { f: 5, t: 9, s: 3, tp: "pos" },
  { f: 6, t: 7, s: 3, tp: "pos" },
  { f: 6, t: 10, s: 2, tp: "pos" },
  { f: 7, t: 10, s: 1, tp: "neu" },
  { f: 7, t: 3, s: 2, tp: "pos" },
  { f: 8, t: 3, s: 2, tp: "pos" },
  { f: 9, t: 1, s: 3, tp: "pos" },
  { f: 9, t: 2, s: 1, tp: "neu" },
  { f: 10, t: 6, s: 3, tp: "pos" },
  { f: 10, t: 7, s: 2, tp: "pos" },
  { f: 4, t: 6, s: 1, tp: "neu" },
  { f: 5, t: 1, s: 2, tp: "pos" },
];

// GROUPS y GC — valores por defecto globales (se sobreescriben dinámicamente desde Firebase)
let GROUPS = ["5° A", "5° B", "6° A"];
let GC = { "5° A": "#ff4d6a", "5° B": "#2dd4bf", "6° A": "#fbbf24" };
const GROUP_COLORS = ["#ff4d6a", "#2dd4bf", "#fbbf24", "#a78bfa", "#38bdf8", "#34d399"];
const DEFAULT_GROUPS = ["5° A", "5° B", "6° A"];
// Los datos ficticios (initStudents/initConns) solo se muestran con ?demo en la URL, nunca por defecto.
const IS_DEMO = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");

// ════════ PRIMITIVES ════════

const Btn = ({
  children,
  v = "def",
  sm,
  disabled,
  onClick,
  style,
  ...rest
}) => {
  const vars = {
    def: { bg: C.card, c: C.t2, bd: C.border },
    pri: { bg: C.rx, c: C.white, bd: "transparent" },
    ghost: { bg: "transparent", c: C.t2, bd: "transparent" },
    dan: { bg: tint(C.err, "15"), c: C.err, bd: tint(C.err, "30") },
    sec: { bg: tint(C.violet, "15"), c: C.violet, bd: tint(C.violet, "30") },
    ok: { bg: tint(C.ok, "15"), c: C.ok, bd: tint(C.ok, "30") },
    teal: { bg: tint(C.teal, "15"), c: C.teal, bd: tint(C.teal, "30") },
  };
  const s = vars[v];
  return (
    <button
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      style={{
        border: `1px solid ${s.bd}`,
        borderRadius: sm ? 7 : 9,
        background: s.bg,
        color: s.c,
        padding: sm ? "4px 11px" : "8px 18px",
        fontSize: sm ? 11 : 13,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        transition: "all .2s",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontFamily: "inherit",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
};

const Card = ({ children, style, glow }) => {
  const [h, setH] = useState(false);
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: h ? C.cardHov : C.card,
        border: `1px solid ${h ? C.borderLit : C.border}`,
        borderRadius: 14,
        padding: 20,
        transition: "all .2s",
        boxShadow: h && glow ? `0 0 30px ${tint(glow, "10")}` : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

const Badge = ({ children, color = C.rx }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "3px 9px",
      borderRadius: 20,
      fontSize: 10,
      fontWeight: 700,
      background: tint(color, "15"),
      color,
      border: `1px solid ${tint(color, "25")}`,
      letterSpacing: ".3px",
    }}
  >
    {children}
  </span>
);

const Inp = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
  style: outerStyle,
}) => (
  <div
    style={{ display: "flex", flexDirection: "column", gap: 4, ...outerStyle }}
  >
    {label && (
      <label style={{ fontSize: 11, fontWeight: 600, color: C.t2 }}>
        {label}
      </label>
    )}
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        background: C.bgSub,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "8px 12px",
        color: C.text,
        fontSize: 13,
        outline: "none",
        fontFamily: "inherit",
        opacity: disabled ? 0.5 : 1,
      }}
      onFocus={(e) => (e.target.style.borderColor = "#3b82f660")}
      onBlur={(e) => (e.target.style.borderColor = "")}
    />
  </div>
);

const Sel = ({ label, value, onChange, options, disabled }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && (
      <label style={{ fontSize: 11, fontWeight: 600, color: C.t2 }}>
        {label}
      </label>
    )}
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{
        background: C.bgSub,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "8px 12px",
        color: C.text,
        fontSize: 13,
        outline: "none",
        fontFamily: "inherit",
      }}
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  </div>
);

// ════════ LOGO — Pulso Social (rojizo) ════════

// size = alto del emblema; el ancho sale de su proporción real (1.4:1)
const LogoIcon = ({ size = 40 }) => (
  <img
    src="/rednexo-icon.webp"
    alt="RedNexo"
    height={size}
    width={Math.round(size * 1.4)}
    style={{ display: "block", flexShrink: 0, objectFit: "contain", filter: "drop-shadow(0 0 8px rgba(59,130,246,0.30))" }}
  />
);

const Logo = ({ size = "md" }) => {
  const cfg = {
    lg: { iconSize: 76, title: 30, sub: 11, gap: 16, subSpacing: "2.5px" },
    md: { iconSize: 46, title: 17, sub: 9, gap: 8, subSpacing: "1.8px" },
    sm: { iconSize: 32, title: 13, sub: 0, gap: 6, subSpacing: "1.5px" },
  }[size] || { iconSize: 40, title: 17, sub: 9, gap: 8, subSpacing: "1.8px" };

  // Versión grande (registro, pantalla de carga): logo completo con el nombre
  if (size === "lg") {
    return (
      <img
        src="/rednexo-logo.webp"
        alt="RedNexo"
        style={{ display: "block", width: "min(300px, 80vw)", height: "auto", filter: "drop-shadow(0 0 24px rgba(59,130,246,0.28))", userSelect: "none" }}
      />
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: cfg.gap }}>
      <LogoIcon size={cfg.iconSize} />
      <div>
        <div
          style={{
            fontSize: cfg.title,
            fontWeight: 800,
            letterSpacing: "-0.5px",
            lineHeight: 1.1,
            color: C.text,
          }}
        >
          <span style={{ color: C.rx }}>Red</span>Nexo
        </div>
        {cfg.sub > 0 && (
          <div
            style={{
              fontSize: cfg.sub,
              color: C.t3,
              letterSpacing: cfg.subSpacing,
              textTransform: "uppercase",
              marginTop: 2,
            }}
          >
            Inteligencia Sociométrica
          </div>
        )}
      </div>
    </div>
  );
};

// ════════ PAGE HEADER ════════
const PageHeader = ({ title, subtitle }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      marginBottom: 22,
      paddingBottom: 16,
      borderBottom: `1px solid ${C.border}`,
    }}
  >
    <LogoIcon size={36} />
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1.1 }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 12, color: C.t2, marginTop: 3 }}>{subtitle}</div>
      )}
    </div>
  </div>
);

// ════════ LOGIN ════════

function LoginPage({ onGoogleLogin, onRegister, loading, error }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#06060e",
      display: "flex",
      position: "relative",
      overflow: "hidden",
      fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800;900&display=swap');
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100%{opacity:.4;transform:scale(1)} 50%{opacity:.9;transform:scale(1.08)} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes dash { to { stroke-dashoffset: -200 } }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        .rn-node { animation: pulse 3s ease-in-out infinite; }
        .rn-node:nth-child(2) { animation-delay: .6s }
        .rn-node:nth-child(3) { animation-delay: 1.2s }
        .rn-node:nth-child(4) { animation-delay: 1.8s }
        .rn-node:nth-child(5) { animation-delay: 2.4s }
        .rn-edge { stroke-dasharray: 6 4; animation: dash 4s linear infinite; }
        .rn-login-card { animation: fadeUp .6s ease both; }
        .rn-google-btn:hover:not(:disabled) {
          box-shadow: 0 0 0 3px #3b82f630, 0 8px 32px rgba(59,130,246,.2) !important;
          transform: translateY(-2px) !important;
        }
        .rn-google-btn:active:not(:disabled) { transform: translateY(0) !important; }
        .rn-req-btn:hover { background: #3b82f622 !important; border-color: #3b82f660 !important; color: #3b82f6 !important; }
      `}</style>

      {/* ── Fondo: red animada de nodos ── */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="rg1" cx="30%" cy="25%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity=".12"/>
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0"/>
          </radialGradient>
          <radialGradient id="rg2" cx="75%" cy="70%">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity=".1"/>
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0"/>
          </radialGradient>
          <radialGradient id="rg3" cx="80%" cy="15%">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity=".08"/>
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0"/>
          </radialGradient>
        </defs>
        {/* Gradientes de fondo */}
        <rect width="100%" height="100%" fill="url(#rg1)"/>
        <rect width="100%" height="100%" fill="url(#rg2)"/>
        <rect width="100%" height="100%" fill="url(#rg3)"/>
        {/* Grid de puntos */}
        {Array.from({length: 30}, (_,i) => Array.from({length: 20}, (_,j) => (
          <circle key={`${i}-${j}`} cx={i*70+35} cy={j*70+35} r="1" fill="#ffffff" opacity=".04"/>
        )))}
        {/* Red de nodos decorativa */}
        <g opacity=".35">
          <line className="rn-edge" x1="12%" y1="18%" x2="28%" y2="8%"  stroke="#3b82f6" strokeWidth="1.2"/>
          <line className="rn-edge" x1="28%" y1="8%"  x2="48%" y2="22%" stroke="#3b82f6" strokeWidth="1"/>
          <line className="rn-edge" x1="48%" y1="22%" x2="72%" y2="12%" stroke="#a78bfa" strokeWidth="1"/>
          <line className="rn-edge" x1="72%" y1="12%" x2="88%" y2="28%" stroke="#a78bfa" strokeWidth="1.2"/>
          <line className="rn-edge" x1="12%" y1="18%" x2="18%" y2="48%" stroke="#3b82f6" strokeWidth="1"/>
          <line className="rn-edge" x1="18%" y1="48%" x2="8%"  y2="72%" stroke="#2dd4bf" strokeWidth="1"/>
          <line className="rn-edge" x1="88%" y1="28%" x2="92%" y2="58%" stroke="#a78bfa" strokeWidth="1"/>
          <line className="rn-edge" x1="92%" y1="58%" x2="82%" y2="82%" stroke="#2dd4bf" strokeWidth="1"/>
          <line className="rn-edge" x1="8%"  y1="72%" x2="22%" y2="88%" stroke="#2dd4bf" strokeWidth="1"/>
          <line className="rn-edge" x1="22%" y1="88%" x2="52%" y2="82%" stroke="#3b82f6" strokeWidth="1"/>
          <line className="rn-edge" x1="52%" y1="82%" x2="82%" y2="82%" stroke="#a78bfa" strokeWidth="1"/>
          <line className="rn-edge" x1="18%" y1="48%" x2="48%" y2="22%" stroke="#3b82f6" strokeWidth=".8" opacity=".5"/>
          <line className="rn-edge" x1="48%" y1="22%" x2="52%" y2="82%" stroke="#a78bfa" strokeWidth=".8" opacity=".4"/>
        </g>
        <g>
          {[
            { cx:"12%", cy:"18%", r:7,  c:"#3b82f6" },
            { cx:"28%", cy:"8%",  r:5,  c:"#a78bfa" },
            { cx:"48%", cy:"22%", r:9,  c:"#3b82f6" },
            { cx:"72%", cy:"12%", r:6,  c:"#a78bfa" },
            { cx:"88%", cy:"28%", r:7,  c:"#a78bfa" },
            { cx:"18%", cy:"48%", r:5,  c:"#2dd4bf" },
            { cx:"8%",  cy:"72%", r:6,  c:"#2dd4bf" },
            { cx:"92%", cy:"58%", r:5,  c:"#a78bfa" },
            { cx:"82%", cy:"82%", r:7,  c:"#2dd4bf" },
            { cx:"22%", cy:"88%", r:5,  c:"#3b82f6" },
            { cx:"52%", cy:"82%", r:8,  c:"#3b82f6" },
          ].map((n, i) => (
            <g key={i} className="rn-node">
              <circle cx={n.cx} cy={n.cy} r={n.r+6} fill={n.c} opacity=".07"/>
              <circle cx={n.cx} cy={n.cy} r={n.r+2} fill={n.c} opacity=".12"/>
              <circle cx={n.cx} cy={n.cy} r={n.r}   fill={n.c} opacity=".7"/>
              <circle cx={n.cx} cy={n.cy} r={n.r*.4} fill="#fff" opacity=".6"/>
            </g>
          ))}
        </g>
      </svg>

      {/* ── Panel izquierdo: claim ── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "60px 64px",
        position: "relative",
        zIndex: 1,
      }}>
        <div style={{ animation: "fadeUp .5s ease both" }}>
          <img
            src="/rednexo-logo.webp"
            alt="RedNexo"
            style={{
              display: "block",
              width: "min(500px, 100%)",
              height: "auto",
              marginLeft: -16,
              filter: "drop-shadow(0 0 28px rgba(59,130,246,0.30))",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
          <div style={{ marginTop: 8, fontSize: 48, fontWeight: 900, lineHeight: 1.1, color: "#fff", letterSpacing: "-2px" }}>
            Entiende<br/>
            <span style={{ background: "linear-gradient(90deg,#38bdf8 0%,#3b82f6 50%,#a78bfa 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "#3b82f6" }}>las conexiones</span><br/>
            de tu aula.
          </div>
          <div style={{ marginTop: 20, fontSize: 15, color: "#9498ae", lineHeight: 1.7, maxWidth: 380 }}>
            RedNexo analiza las relaciones sociales entre estudiantes mediante sociometría, detecta líderes, aislados y subgrupos en tiempo real.
          </div>
          <div style={{ marginTop: 36, display: "flex", gap: 24 }}>
            {[
              { v: "100%", l: "Web" },
              { v: "Tiempo real", l: "Análisis" },
              { v: "PDF", l: "Reportes" },
            ].map((s) => (
              <div key={s.l} style={{ animation: "fadeUp .7s ease both" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#38bdf8" }}>{s.v}</div>
                <div style={{ fontSize: 11, color: "#555770", textTransform: "uppercase", letterSpacing: "1px" }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 11, color: "#555770", textTransform: "uppercase", letterSpacing: "1.5px" }}>Plataforma institucional</span>
          </div>
        </div>
      </div>

      {/* ── Divisor vertical ── */}
      <div style={{
        width: 1,
        background: "linear-gradient(to bottom, transparent, #3b82f630 30%, #3b82f630 70%, transparent)",
        alignSelf: "stretch",
        flexShrink: 0,
        position: "relative",
        zIndex: 1,
      }}/>

      {/* ── Panel derecho: formulario ── */}
      <div style={{
        width: 440,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        position: "relative",
        zIndex: 1,
      }}>
        <div className="rn-login-card" style={{ width: "100%" }}>
          {/* Card con glassmorphism */}
          <div style={{
            background: "rgba(22,23,31,0.85)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(59,130,246,0.2)",
            borderRadius: 20,
            padding: 36,
            boxShadow: "0 0 80px rgba(59,130,246,.08), 0 24px 64px rgba(0,0,0,.5)",
          }}>
            {/* Header del card */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#eaedf6", marginBottom: 6 }}>
                Iniciar sesión
              </div>
              <div style={{ fontSize: 13, color: "#9498ae", lineHeight: 1.6 }}>
                Usa tu cuenta de Google institucional para acceder al panel de RedNexo.
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: "#f8717115",
                border: "1px solid #f8717130",
                borderRadius: 10,
                padding: "10px 14px",
                marginBottom: 20,
                fontSize: 12,
                color: "#f87171",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span>⚠️</span><span>{error}</span>
              </div>
            )}

            {/* Botón Google */}
            <button
              className="rn-google-btn"
              onClick={onGoogleLogin}
              disabled={loading}
              style={{
                width: "100%",
                padding: "14px 20px",
                borderRadius: 12,
                border: "1.5px solid #dadce040",
                background: loading ? "#1a1b2a" : "rgba(255,255,255,0.96)",
                color: loading ? "#9498ae" : "#3c4043",
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                transition: "all .25s",
                opacity: loading ? 0.6 : 1,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {loading ? (
                <div style={{ width: 20, height: 20, border: "2.5px solid #dadce0", borderTopColor: "#4285F4", borderRadius: "50%", animation: "spin .7s linear infinite" }}/>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              {loading ? "Verificando..." : "Continuar con Google"}
            </button>

            {/* Info */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, padding: "10px 14px", background: "#ffffff06", borderRadius: 8, border: "1px solid #ffffff0a" }}>
              <span style={{ fontSize: 16 }}>🔐</span>
              <span style={{ fontSize: 11, color: "#555770", lineHeight: 1.5 }}>
                Solo cuentas autorizadas por el administrador pueden acceder al panel.
              </span>
            </div>

            {/* Divisor */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
              <div style={{ flex: 1, height: 1, background: "#ffffff10" }}/>
              <span style={{ fontSize: 10, color: "#555770", letterSpacing: "1px" }}>SIN CUENTA</span>
              <div style={{ flex: 1, height: 1, background: "#ffffff10" }}/>
            </div>

            {/* Solicitar acceso */}
            <button
              className="rn-req-btn"
              onClick={onRegister}
              style={{
                width: "100%",
                padding: "11px 20px",
                borderRadius: 10,
                border: "1.5px solid #ffffff15",
                background: "transparent",
                color: "#9498ae",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all .2s",
              }}
            >
              + Solicitar acceso
            </button>
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <button onClick={() => abrirSoporte({ type: "acceso" })} style={{ background: "none", border: "none", color: "#7a7e99", fontSize: 12, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>¿No puedes entrar? Contacta a soporte</button>
            </div>
          </div>

          {/* Footer */}
          <div style={{ textAlign: "center", marginTop: 20, fontSize: 10, color: "#333550", letterSpacing: ".5px" }}>
            REDNEXO · INTELIGENCIA SOCIOMÉTRICA
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════ REGISTRATION PAGE ════════

function RegistrationPage({ onBack }) {
  const [formData, setFormData] = useState({ name: "", email: "", role: "psychologist" });
  const [submitted, setSubmitted] = useState(false);

  // La solicitud viaja por el formulario de Soporte (la app no puede escribir en la base sin una sesión).
  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.email.trim()) return;
    const rol = formData.role === "readonly" ? "Solo lectura" : "Psicólogo escolar";
    const ok = await abrirSoporte({
      type: "acceso", subject: `Solicitud de acceso a RedNexo: ${formData.name.trim()}`.slice(0, 120), email: formData.email.trim(),
      description: `Solicito acceso a RedNexo.\nNombre: ${formData.name.trim()}\nCorreo de Google: ${formData.email.trim()}\nRol: ${rol}\nColegio: (escríbalo aquí)`,
    });
    if (ok) setSubmitted(true);
  };

  if (submitted)
    return (
      <div style={{ fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif", minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, background: tint(C.amber, "20"), display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 40, marginBottom: 20 }}>⏳</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: C.text }}>Solicitud preparada</div>
          <div style={{ fontSize: 13, color: C.t2, marginBottom: 24, lineHeight: 1.6 }}>
            Se abrió el formulario de soporte con tus datos. Escribe el nombre de tu colegio y pulsa <b>Enviar</b> allí para que la solicitud llegue. También puedes pedirle a la persona administradora de tu colegio que te autorice desde «Usuarios» con tu correo de Google.
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20, textAlign: "left" }}>
            <div style={{ fontSize: 11, color: C.t3, marginBottom: 2 }}>Correo de la solicitud:</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.teal }}>{formData.email}</div>
          </div>
          <Btn v="ghost" onClick={handleSubmit} style={{ width: "100%", justifyContent: "center", marginBottom: 8 }}>Abrir el formulario de nuevo</Btn>
          <Btn v="pri" onClick={onBack} style={{ width: "100%", justifyContent: "center" }}>Volver al inicio</Btn>
        </div>
      </div>
    );

  return (
    <div style={{ fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif", minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", padding: 24 }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 25% 25%,${tint(C.rx, "06")} 0%,transparent 60%),radial-gradient(ellipse at 75% 75%,${tint(C.teal, "04")} 0%,transparent 60%)` }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${tint(C.border, "40")} 1px,transparent 1px)`, backgroundSize: "32px 32px" }} />
      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 30, display: "flex", justifyContent: "center" }}>
          <Logo size="lg" />
        </div>
        <Card style={{ padding: 30, background: `${tint(C.card, "ee")}`, backdropFilter: "blur(20px)" }}>
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Crear cuenta</div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>Solicita acceso a RedNexo</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Inp label="Nombre completo" value={formData.name} onChange={(v) => setFormData({ ...formData, name: v })} placeholder="Tu nombre" />
            <Inp label="Correo institucional" value={formData.email} onChange={(v) => setFormData({ ...formData, email: v })} placeholder="tu@institucion.edu" />
            <Sel label="Rol solicitado" value={formData.role} onChange={(v) => setFormData({ ...formData, role: v })} options={[{ v: "psychologist", l: "Psicólogo Escolar" }, { v: "readonly", l: "Solo Lectura" }]} />
            <div style={{ fontSize: 11, color: C.t3, background: C.bgSub, border: `1px solid ${C.border}`, borderRadius: 8, padding: 11, lineHeight: 1.55 }}>
              ℹ️ La solicitud se envía por el formulario de soporte de Iskonex. No podrás ingresar hasta que el administrador de tu colegio te autorice.
            </div>
          </div>
          <Btn v="pri" onClick={handleSubmit} disabled={!formData.name.trim() || !formData.email.trim()} style={{ width: "100%", justifyContent: "center", marginTop: 16 }}>
            Continuar con la solicitud
          </Btn>
          <Btn v="ghost" onClick={onBack} style={{ width: "100%", justifyContent: "center", marginTop: 8 }}>
            ← Volver al login
          </Btn>
        </Card>
      </div>
    </div>
  );
}

// ════════ USERS PANEL (Firestore) ════════

function UsersPanel({ authorizeUser, revokeUser, reactivateUser, deleteUser, me }) {
  const [users, setUsers] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("psychologist");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [restore, setRestore] = useState({});   // rol elegido al reactivar a cada persona (correo → rol)

  useEffect(() => {
    const q = query(ccol("miembros"), orderBy("email"));
    const unsub = onSnapshot(q, (snap) => { setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); }, (err) => console.log("Users listener error", err));
    return () => unsub();
  }, []);

  const authorize = async () => {
    if (!newEmail.trim() || !newEmail.includes("@")) return;
    // Autorizar de nuevo a alguien que ya existe cambia su rol: no se permite a uno mismo ni al único administrador (el colegio se quedaría sin acceso).
    const ya = users.find((u) => String(u.email).toLowerCase() === newEmail.trim().toLowerCase());
    if (ya) {
      const ac = userActions(users, ya, me);
      if ((ac.esYo || ac.ultimoAdmin) && newRole !== "admin") { flash(`❌ ${ac.esYo ? "Ese correo eres tú: no puedes cambiar tu propio rol." : ac.motivo}`); return; }
    }
    setSaving(true);
    setMsg("");
    const ok = await authorizeUser(newEmail.trim().toLowerCase(), newRole);
    setMsg(ok ? "✅ Usuario autorizado correctamente" : "❌ Error al autorizar");
    setNewEmail("");
    setSaving(false);
    setTimeout(() => setMsg(""), 3500);
  };

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3500); };
  const revoke = async (u) => {
    if (!window.confirm(`¿Revocar el acceso de ${u.email}? Perderá el acceso al instante; podrás reactivarlo después con el mismo rol.`)) return;
    flash((await revokeUser(u)) ? "✅ Acceso revocado" : "❌ No se pudo revocar");
  };
  const reactivate = async (u) => {
    const role = reactivateRole(u, restore[u.email]);
    flash((await reactivateUser(u.email, role)) ? `✅ Acceso reactivado como ${ROLE_NAMES[role]}` : "❌ No se pudo reactivar");
  };
  const remove = async (u) => {
    if (!window.confirm(`¿Eliminar a ${u.email}? Desaparece de esta lista y no podrá entrar. Si más adelante lo necesitas, puedes volver a autorizarlo.`)) return;
    flash((await deleteUser(u.email)) ? "✅ Usuario eliminado" : "❌ No se pudo eliminar");
  };

  const roleColor = { superadmin: C.rx, admin: C.rx, psychologist: C.violet, readonly: C.sky };
  const roleLabel = { superadmin: "⚡ Super Admin", admin: "🏫 Administrador", psychologist: "🧠 Psicólogo", readonly: "👤 Solo lectura" };
  const activeUsers = users.filter((u) => u.status === "active");
  const revokedUsers = users.filter((u) => u.status === "revoked");

  return (
    <div>
      <PageHeader title="Gestión de Usuarios" subtitle="Autoriza acceso por correo de Google. Los cambios se sincronizan en tiempo real." />
      {msg && (
        <div style={{ padding: "9px 14px", borderRadius: 8, marginBottom: 14, fontSize: 12, background: msg.startsWith("✅") ? tint(C.ok, "15") : tint(C.err, "15"), color: msg.startsWith("✅") ? C.ok : C.err, border: `1px solid ${msg.startsWith("✅") ? tint(C.ok, "30") : tint(C.err, "30")}` }}>
          {msg}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 14, marginBottom: 14 }}>
        <Card glow={C.violet}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: C.violet }}>➕ Autorizar usuario</div>
          <div style={{ fontSize: 11, color: C.t2, marginBottom: 14 }}>Ingresa el correo Google del usuario y asigna su rol</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <Inp label="Correo Google" value={newEmail} onChange={setNewEmail} placeholder="correo@gmail.com" />
            <Sel label="Rol" value={newRole} onChange={setNewRole} options={[{ v: "psychologist", l: "🧠 Psicólogo Escolar" }, { v: "readonly", l: "👤 Solo Lectura" }, { v: "admin", l: "🏫 Administrador del colegio" }]} />
          </div>
          <Btn v="sec" onClick={authorize} disabled={saving || !newEmail.trim() || !newEmail.includes("@")} style={{ width: "100%", justifyContent: "center", marginTop: 12 }}>
            {saving ? "Guardando..." : "✓ Autorizar acceso"}
          </Btn>
        </Card>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>📊 Resumen</div>
          {[
            { l: "Usuarios activos", v: activeUsers.length, c: C.ok },
            { l: "Psicólogos", v: users.filter((u) => u.role === "psychologist" && u.status === "active").length, c: C.violet },
            { l: "Solo lectura", v: users.filter((u) => u.role === "readonly" && u.status === "active").length, c: C.sky },
            { l: "Revocados", v: revokedUsers.length, c: C.err },
          ].map((s) => (
            <div key={s.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 12, color: C.t2 }}>{s.l}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: s.c }}>{s.v}</span>
            </div>
          ))}
        </Card>
      </div>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Todos los usuarios registrados ({users.length})</div>
        {users.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: C.t3, fontSize: 12 }}>Los usuarios aparecerán aquí al iniciar sesión con Google</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Correo", "Rol", "Estado", "Acción"].map((h) => (
                    <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10, color: C.t3, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const ac = userActions(users, u, me);
                  const activo = u.status === "active";
                  return (
                    <tr key={u.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "8px 10px", color: C.text }}>{u.email}{ac.esYo && <span style={{ marginLeft: 6, fontSize: 10, color: C.t2 }}>(tú)</span>}</td>
                      <td style={{ padding: "8px 10px" }}>
                        <Badge color={roleColor[u.role] || C.sky}>{roleLabel[u.role] || u.role}</Badge>
                        {!activo && ROLE_NAMES[u.rolAnterior] && u.rolAnterior !== u.role && <div style={{ fontSize: 10, color: C.t2, marginTop: 3 }}>Antes: {ROLE_NAMES[u.rolAnterior]}</div>}
                      </td>
                      <td style={{ padding: "8px 10px" }}><Badge color={activo ? C.ok : u.status === "pending" ? C.amber : C.err}>{activo ? "● " : "○ "}{statusLabel(u.status)}</Badge></td>
                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          {activo ? (
                            <Btn sm v="dan" disabled={!ac.puedeRevocar} title={ac.motivo || "Quita el acceso; se puede reactivar"} onClick={() => revoke(u)}>Revocar</Btn>
                          ) : (
                            <>
                              <select aria-label={`Rol al reactivar a ${u.email}`} value={restore[u.email] || reactivateRole(u)} onChange={(e) => setRestore((r) => ({ ...r, [u.email]: e.target.value }))} style={{ background: C.bgSub, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 6px", color: C.text, fontSize: 11, fontFamily: "inherit" }}>
                                <option value="psychologist">Psicólogo</option><option value="readonly">Solo lectura</option><option value="admin">Administrador</option>
                              </select>
                              <Btn sm v="ok" disabled={!ac.puedeReactivar} onClick={() => reactivate(u)}>Reactivar</Btn>
                              <Btn sm v="dan" disabled={!ac.puedeEliminar} title="Elimina a la persona de la lista (primero hay que revocarla)" onClick={() => remove(u)}>Eliminar</Btn>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ════════ SOCIOGRAM CANVAS ════════

function SociogramCanvas({ filter, selNode, setSelNode, students, conns }) {
  const cvRef = useRef(null);
  const nodesRef = useRef([]);
  const afRef = useRef(null);
  const dragRef = useRef(null);
  const tickRef = useRef(0);
  const [hov, setHov] = useState(null);
  const [dims, setDims] = useState({ w: 600, h: 420 });

  useEffect(() => {
    const el = cvRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver((e) => {
      const w = e[0].contentRect.width;
      const h = e[0].contentRect.height || 420;
      setDims({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Inicializar nodos con clustering por grupo
  useEffect(() => {
    const cx = dims.w / 2, cy = dims.h / 2;
    const groups = [...new Set(students.map(s => s.group))];
    const groupCenters = {};
    groups.forEach((g, gi) => {
      const a = (gi / groups.length) * Math.PI * 2 - Math.PI / 2;
      const cr = Math.min(cx, cy) * (groups.length === 1 ? 0 : 0.42);
      groupCenters[g] = { x: cx + Math.cos(a) * cr, y: cy + Math.sin(a) * cr };
    });
    nodesRef.current = students.map((p, i) => {
      const gc = groupCenters[p.group] || { x: cx, y: cy };
      const groupMembers = students.filter(s => s.group === p.group);
      const idxInGroup = groupMembers.findIndex(s => s.id === p.id);
      const spread = Math.min(cx, cy) * 0.52;
      const a = (idxInGroup / Math.max(groupMembers.length, 1)) * Math.PI * 2;
      const tx = gc.x + Math.cos(a) * spread * 0.75;
      const ty = gc.y + Math.sin(a) * spread * 0.75;
      return {
        ...p,
        x: tx + (Math.random() - 0.5) * 20,
        y: ty + (Math.random() - 0.5) * 20,
        vx: 0, vy: 0,
        tx, ty,
        // pinned=true cuando el usuario suelta el nodo — no vuelve a su posición original
        pinned: false,
        gcx: gc.x, gcy: gc.y,
        trail: [],
        pulse: Math.random() * Math.PI * 2,
      };
    });
  }, [dims, students]);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");

    const draw = () => {
      tickRef.current++;
      const tick = tickRef.current;

      cv.width = dims.w * 2;
      cv.height = dims.h * 2;
      ctx.scale(2, 2);

      // ── Fondo oscuro con viñeta
      ctx.fillStyle = "#07070f";
      ctx.fillRect(0, 0, dims.w, dims.h);
      const vignette = ctx.createRadialGradient(dims.w/2, dims.h/2, dims.h*0.3, dims.w/2, dims.h/2, dims.h*0.85);
      vignette.addColorStop(0, "transparent");
      vignette.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, dims.w, dims.h);

      // ── Grid hexagonal sutil
      ctx.strokeStyle = "rgba(255,255,255,0.025)";
      ctx.lineWidth = 0.5;
      const hex = 36;
      for (let row = 0; row < dims.h / hex + 1; row++) {
        for (let col = 0; col < dims.w / hex + 1; col++) {
          const xo = row % 2 === 0 ? 0 : hex / 2;
          ctx.beginPath();
          ctx.arc(col * hex + xo, row * hex, 0.7, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.03)";
          ctx.fill();
        }
      }

      const N = nodesRef.current;
      const dragging = dragRef.current;
      const fC = filterConns(conns, filter);

      // ── Física: spring hacia target + repulsión entre nodos
      N.forEach((n) => {
        if (dragging && n.id === dragging.id) return;
        // Solo aplicar spring si NO está pinned (fue arrastrado por el usuario)
        if (!n.pinned) {
          n.vx += (n.tx - n.x) * 0.014;
          n.vy += (n.ty - n.y) * 0.014;
        } else {
          // Nodo pinned: solo amortiguación, se queda donde está
          n.vx *= 0.92;
          n.vy *= 0.92;
          n.x += n.vx;
          n.y += n.vy;
          return;
        }
        // Repulsión entre nodos
        N.forEach((o) => {
          if (o.id === n.id) return;
          const dx = n.x - o.x, dy = n.y - o.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < 75) {
            const f = (75 - dist) / 75 * 0.55;
            n.vx += (dx / dist) * f;
            n.vy += (dy / dist) * f;
          }
        });
        n.vx *= 0.88;
        n.vy *= 0.88;
        n.x += n.vx;
        n.y += n.vy;
        // Mantener dentro del canvas
        const pad = 30;
        if (n.x < pad) { n.x = pad; n.vx *= -0.5; }
        if (n.x > dims.w - pad) { n.x = dims.w - pad; n.vx *= -0.5; }
        if (n.y < pad) { n.y = pad; n.vy *= -0.5; }
        if (n.y > dims.h - pad) { n.y = dims.h - pad; n.vy *= -0.5; }
        // Trail
        if (tick % 3 === 0) {
          n.trail.push({ x: n.x, y: n.y, t: tick });
          if (n.trail.length > 8) n.trail.shift();
        }
        n.pulse += 0.04;
      });

      // Imán al arrastrar
      if (dragging) {
        const dn = N.find(n => n.id === dragging.id);
        if (dn) {
          N.forEach((n) => {
            if (n.id === dn.id) return;
            const isNeighbor = conns.some(c => (c.f === dn.id && c.t === n.id) || (c.t === dn.id && c.f === n.id));
            if (!isNeighbor) return;
            const dx = dn.x - n.x, dy = dn.y - n.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 140 && dist > 35) {
              const force = 0.2 * (1 - dist / 140);
              n.vx += dx * force * 0.5;
              n.vy += dy * force * 0.5;
            }
          });
        }
      }

      // ── Auras de grupo (manchas de color por cluster)
      const groups = [...new Set(students.map(s => s.group))];
      groups.forEach(g => {
        const gNodes = N.filter(n => n.group === g);
        if (!gNodes.length) return;
        const gcx = gNodes.reduce((a, n) => a + n.x, 0) / gNodes.length;
        const gcy = gNodes.reduce((a, n) => a + n.y, 0) / gNodes.length;
        const gcColor = GC[g] || "#3b82f6";
        const aura = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, 90);
        aura.addColorStop(0, tint(gcColor, "12"));
        aura.addColorStop(1, "transparent");
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(gcx, gcy, 90, 0, Math.PI * 2);
        ctx.fill();
      });

      // ── Conexiones con glow y partícula viajera
      fC.forEach((cn) => {
        const f = N.find(n => n.id === cn.f);
        const t = N.find(n => n.id === cn.t);
        if (!f || !t) return;
        const hl = !selNode || selNode === f.id || selNode === t.id;
        const col = cn.tp === "pos" ? cc("teal") : cn.tp === "neg" ? cc("err") : cc("amber");
        const cpx = (f.x + t.x) / 2 + (t.y - f.y) * 0.22;
        const cpy = (f.y + t.y) / 2 - (t.x - f.x) * 0.22;

        if (hl) {
          // Halo exterior
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.quadraticCurveTo(cpx, cpy, t.x, t.y);
          ctx.strokeStyle = tint(col, "18");
          ctx.lineWidth = cn.s * 5;
          ctx.stroke();
          // Línea principal con gradiente
          const grad = ctx.createLinearGradient(f.x, f.y, t.x, t.y);
          grad.addColorStop(0, tint(col, "55"));
          grad.addColorStop(0.5, tint(col, "ee"));
          grad.addColorStop(1, tint(col, "55"));
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.quadraticCurveTo(cpx, cpy, t.x, t.y);
          ctx.strokeStyle = grad;
          ctx.lineWidth = cn.s * 1.5;
          ctx.stroke();
          // Partícula viajera animada
          const tParam = ((tick * 0.008 + cn.s * 0.3) % 1);
          const px = (1-tParam)*(1-tParam)*f.x + 2*(1-tParam)*tParam*cpx + tParam*tParam*t.x;
          const py = (1-tParam)*(1-tParam)*f.y + 2*(1-tParam)*tParam*cpy + tParam*tParam*t.y;
          const pGlow = ctx.createRadialGradient(px, py, 0, px, py, 5);
          pGlow.addColorStop(0, tint(col, "ff"));
          pGlow.addColorStop(1, "transparent");
          ctx.fillStyle = pGlow;
          ctx.beginPath();
          ctx.arc(px, py, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(px, py, 1.5, 0, Math.PI * 2);
          ctx.fill();
          // Flecha
          const tt2 = 0.75;
          const ax = (1-tt2)*(1-tt2)*f.x + 2*(1-tt2)*tt2*cpx + tt2*tt2*t.x;
          const ay = (1-tt2)*(1-tt2)*f.y + 2*(1-tt2)*tt2*cpy + tt2*tt2*t.y;
          const ang = Math.atan2(t.y - ay, t.x - ax);
          ctx.beginPath();
          ctx.moveTo(ax + Math.cos(ang)*6, ay + Math.sin(ang)*6);
          ctx.lineTo(ax + Math.cos(ang+2.4)*4, ay + Math.sin(ang+2.4)*4);
          ctx.lineTo(ax + Math.cos(ang-2.4)*4, ay + Math.sin(ang-2.4)*4);
          ctx.fillStyle = tint(col, "99");
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.quadraticCurveTo(cpx, cpy, t.x, t.y);
          ctx.strokeStyle = tint(col, "0e");
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      });

      // ── Nodos
      N.forEach((nd) => {
        const isSel = selNode === nd.id;
        const isHov = hov === nd.id;
        const isDrag = dragging && nd.id === dragging.id;
        const conn = !selNode || isSel || fC.some(c => (c.f === selNode && c.t === nd.id) || (c.t === selNode && c.f === nd.id));
        const gc = GC[nd.group] || cc("rx");
        const baseR = 20;
        const pulseOffset = Math.sin(nd.pulse) * 1.5;
        const nr = isDrag ? 27 : isSel ? 25 + pulseOffset : isHov ? 23 : baseR + (conn ? 0 : 0);
        const al = conn ? 1 : 0.08;
        const alH = Math.round(al * 255).toString(16).padStart(2, "0");

        // Trail del nodo
        if (isDrag && nd.trail.length > 1) {
          nd.trail.forEach((pt, i) => {
            const ta = (i / nd.trail.length) * 0.12;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, nr * 0.4 * (i / nd.trail.length), 0, Math.PI * 2);
            ctx.fillStyle = gc + Math.round(ta * 255).toString(16).padStart(2, "0");
            ctx.fill();
          });
        }

        // Anillo de pulso exterior (nodos seleccionados)
        if (isSel) {
          const pulseR = nr + 8 + Math.sin(nd.pulse) * 4;
          ctx.beginPath();
          ctx.arc(nd.x, nd.y, pulseR, 0, Math.PI * 2);
          ctx.strokeStyle = tint(gc, "30");
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(nd.x, nd.y, pulseR + 5, 0, Math.PI * 2);
          ctx.strokeStyle = tint(gc, "12");
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Glow exterior
        if (isDrag || isSel || isHov) {
          const glR = isDrag ? nr * 4 : nr * 2.8;
          const glow = ctx.createRadialGradient(nd.x, nd.y, nr * 0.3, nd.x, nd.y, glR);
          glow.addColorStop(0, gc + (isDrag ? "50" : "28"));
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(nd.x, nd.y, glR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Sombra
        if (isDrag || isSel) { ctx.shadowColor = tint(gc, "80"); ctx.shadowBlur = isDrag ? 22 : 12; }

        // Fondo del nodo (gradiente + borde)
        const nGrad = ctx.createRadialGradient(nd.x - nr*0.3, nd.y - nr*0.3, 0, nd.x, nd.y, nr);
        nGrad.addColorStop(0, "#1e202e" + alH);
        nGrad.addColorStop(1, "#0d0e16" + alH);
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, nr, 0, Math.PI * 2);
        ctx.fillStyle = nGrad;
        ctx.fill();

        // Borde con gradiente
        const borderGrad = ctx.createLinearGradient(nd.x - nr, nd.y - nr, nd.x + nr, nd.y + nr);
        borderGrad.addColorStop(0, gc + (isDrag ? "ff" : isSel ? "ee" : alH));
        borderGrad.addColorStop(1, gc + (isDrag ? "aa" : isSel ? "66" : "44"));
        ctx.strokeStyle = borderGrad;
        ctx.lineWidth = isDrag ? 3 : isSel ? 2.5 : isHov ? 2 : 1.5;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Brillo interior (especular)
        const shine = ctx.createRadialGradient(nd.x - nr*0.35, nd.y - nr*0.4, 0, nd.x - nr*0.1, nd.y - nr*0.1, nr*0.7);
        shine.addColorStop(0, "rgba(255,255,255,0.12)");
        shine.addColorStop(1, "transparent");
        ctx.fillStyle = shine;
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, nr, 0, Math.PI * 2);
        ctx.fill();

        // Avatar
        ctx.fillStyle = gc + (conn ? "ff" : "33");
        ctx.font = `800 ${Math.round(nr * 0.52)}px 'Outfit',system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(nd.av, nd.x, nd.y);

        // Label con píldora
        if (isSel || isHov || isDrag) {
          ctx.font = `600 10px 'Outfit',system-ui`;
          const nw = ctx.measureText(nd.name).width;
          const pw = nw + 16, ph = 17;
          const px2 = nd.x - pw/2, py2 = nd.y + nr + 8;
          // Fondo píldora
          ctx.fillStyle = "rgba(7,7,15,0.88)";
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(px2, py2, pw, ph, 5);
          else ctx.rect(px2, py2, pw, ph);
          ctx.fill();
          ctx.strokeStyle = tint(gc, "50");
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.fillStyle = "#eaedf6";
          ctx.fillText(nd.name, nd.x, py2 + ph/2);
          // Grupo
          ctx.fillStyle = tint(gc, "bb");
          ctx.font = `9px 'Outfit',system-ui`;
          ctx.fillText(nd.group, nd.x, py2 + ph + 10);
        }
      });

      afRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(afRef.current);
  }, [dims, filter, selNode, hov, students, conns]);

  const getPos = (e, cv) => {
    const r = cv.getBoundingClientRect();
    if (e.touches) return { mx: e.touches[0].clientX - r.left, my: e.touches[0].clientY - r.top };
    return { mx: e.clientX - r.left, my: e.clientY - r.top };
  };

  const findNode = (mx, my) => {
    for (const n of nodesRef.current) if (Math.hypot(n.x - mx, n.y - my) < 28) return n;
    return null;
  };

  const onMouseDown = useCallback((e) => {
    const cv = cvRef.current; if (!cv) return;
    const { mx, my } = getPos(e, cv);
    const found = findNode(mx, my);
    if (found) {
      dragRef.current = { id: found.id, offsetX: mx - found.x, offsetY: my - found.y };
      setSelNode(found.id);
      cv.style.cursor = "grabbing";
      e.preventDefault();
    }
  }, [setSelNode]);

  const onMouseMove = useCallback((e) => {
    const cv = cvRef.current; if (!cv) return;
    const { mx, my } = getPos(e, cv);
    if (dragRef.current) {
      const node = nodesRef.current.find(n => n.id === dragRef.current.id);
      if (node) { node.x = mx - dragRef.current.offsetX; node.y = my - dragRef.current.offsetY; node.vx = 0; node.vy = 0; node.tx = node.x; node.ty = node.y; }
      cv.style.cursor = "grabbing";
    } else {
      const found = findNode(mx, my);
      setHov(found ? found.id : null);
      cv.style.cursor = found ? "grab" : "default";
    }
  }, []);

  const onMouseUp = useCallback((e) => {
    const cv = cvRef.current; if (!cv) return;
    if (dragRef.current) {
      const { mx, my } = getPos(e, cv);
      // Marcar el nodo como pinned — queda exactamente donde lo soltaron
      const node = nodesRef.current.find(n => n.id === dragRef.current.id);
      if (node) {
        node.pinned = true;
        node.tx = node.x;
        node.ty = node.y;
        node.vx = 0;
        node.vy = 0;
      }
      const found = findNode(mx, my);
      cv.style.cursor = found ? "grab" : "default";
      dragRef.current = null;
    }
  }, []);

  const onClick = useCallback((e) => {
    if (dragRef.current) return;
    const cv = cvRef.current; if (!cv) return;
    const { mx, my } = getPos(e, cv);
    const found = findNode(mx, my);
    if (!found) setSelNode(null);
  }, [setSelNode]);

  return (
    <canvas
      ref={cvRef}
      style={{ width: "100%", height: "100%", display: "block", cursor: "default" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClick={onClick}
    />
  );
}

// ════════ SOCIOMETRIC MATRIX — Neural Edition ════════

// Con muchos estudiantes la tabla (n × n celdas) se vuelve imposible de dibujar: se empieza por un solo grupo y
// por encima de MATRIZ_MAX no se dibuja, se pide elegir menos grupos.
const MATRIZ_AUTO = 80, MATRIZ_MAX = 120;
function SocioMatrix({ students, conns }) {
  const [selSel, setSelGroups] = useState(null);   // null = automático
  const selGroups = selSel ?? (students.length > MATRIZ_AUTO ? GROUPS.slice(0, 1) : GROUPS.slice());
  const [hovRow, setHovRow] = useState(null);
  const [hovCol, setHovCol] = useState(null);
  const [selCell, setSelCell] = useState(null);
  const [tick, setTick] = useState(0);

  const toggleG = (g) => setSelGroups(selGroups.includes(g) ? (selGroups.length > 1 ? selGroups.filter(x => x !== g) : selGroups) : [...selGroups, g]);
  const allSel = selGroups.length === GROUPS.length;
  const fs = students.filter(s => selGroups.includes(s.group));

  // Ticker para animaciones CSS (pulsos cada 2s)
  // Solo con matrices pequeñas: redibujar cientos de celdas cada 2 s haría lenta la página.
  const animar = fs.length <= 60;
  useEffect(() => {
    if (!animar) return;
    const id = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(id);
  }, [animar]);

  const demasiado = fs.length > MATRIZ_MAX;
  const cellSize = 36;

  // Conexiones activas para el efecto de "pulso" animado
  const idsFs = new Set(fs.map((s) => String(s.id)));
  const activeConns = conns.filter(c => idsFs.has(String(c.f)) && idsFs.has(String(c.t)));

  return (
    <div>
      <style>{`
        @keyframes neuron-pulse {
          0%   { opacity: 0; transform: scale(0.4); }
          40%  { opacity: 1; transform: scale(1.2); }
          100% { opacity: 0; transform: scale(0.4); }
        }
        @keyframes travel-h {
          0%   { left: 0%;  opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
        @keyframes travel-v {
          0%   { top: 0%;  opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .nm-cell:hover { filter: brightness(1.3); }
      `}</style>

      {/* Filtros de grupo */}
      <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.t2 }}>Grupos:</span>
        <button onClick={() => setSelGroups(allSel ? [GROUPS[0]] : GROUPS.slice())}
          style={{ padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${allSel ? tint(C.rx, "50") : C.border}`, background: allSel ? tint(C.rx, "15") : "transparent", color: allSel ? C.rx : C.t3, transition: "all .2s" }}>
          {allSel ? "✓ Todos" : "Todos"}
        </button>
        {GROUPS.map(g => {
          const on = selGroups.includes(g);
          return (
            <button key={g} onClick={() => toggleG(g)}
              style={{ padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${on ? tint(GC[g], "80") : C.border}`, background: on ? tint(GC[g], "18") : "transparent", color: on ? GC[g] : C.t3, transition: "all .2s", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: on ? GC[g] : tint(C.t3, "40") }} />{g}
            </button>
          );
        })}
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 500, color: C.t2 }}>{fs.length} participantes · {activeConns.length} conexiones</span>
      </div>

      {/* Título */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Matriz Sociométrica Neural</div>
        <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>
          Celdas iluminadas = conexión activa · Haz clic para ver detalle
        </div>
      </div>

      {demasiado && (
        <div style={{ padding: 18, borderRadius: 12, border: `1px solid ${tint(C.amber, "50")}`, background: tint(C.amber, "12"), fontSize: 13, lineHeight: 1.6, color: C.text }}>
          ⚠ Con <b>{fs.length}</b> estudiantes la matriz es demasiado grande para mostrarse (máximo {MATRIZ_MAX}). Elige uno o varios grupos con los botones de arriba. Para ver a todo el colegio usa el Dashboard o descarga el Excel de resultados en Reportes.
        </div>
      )}

      {/* Tabla */}
      {!demasiado && <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface, width: "fit-content", maxWidth: "100%" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 10, width: "max-content" }}>
          <thead>
            <tr>
              <th style={{ width: 120, minWidth: 120, padding: "8px 10px", background: C.cardAlt, border: `1px solid ${C.border}`, position: "sticky", left: 0, zIndex: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.t2, textAlign: "center", lineHeight: 1.5 }}>De ↓<br/>Para →</div>
              </th>
              {fs.map(s => {
                const isHov = hovCol === s.id;
                const gc = GC[s.group] || C.rx;
                return (
                  <th key={s.id}
                    onMouseEnter={() => setHovCol(s.id)}
                    onMouseLeave={() => setHovCol(null)}
                    style={{ width: cellSize, minWidth: cellSize, padding: "6px 2px", background: isHov ? mixOn(gc, 16) : C.cardAlt, border: `1px solid ${isHov ? tint(gc, "80") : C.border}`, textAlign: "center", transition: "background .15s, border-color .15s" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: mixOn(gc, 20, "var(--c-surface)"), border: `1.5px solid ${tint(gc, "99")}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 10, color: C.text, margin: "0 auto" }}>{s.av}</div>
                    <div style={{ fontSize: 8, fontWeight: 600, lineHeight: 1.15, color: C.t2, marginTop: 3 }}>{s.group}</div>
                  </th>
                );
              })}
              <th style={{ width: 52, minWidth: 52, padding: "6px 8px", background: tint(C.teal, "26"), border: `1px solid ${C.border}`, fontSize: 12, color: ink(C.teal), fontWeight: 800, textAlign: "center" }}>Σ+</th>
              <th style={{ width: 52, minWidth: 52, padding: "6px 8px", background: tint(C.err, "26"), border: `1px solid ${C.border}`, fontSize: 12, color: ink(C.err), fontWeight: 800, textAlign: "center" }}>Σ−</th>
            </tr>
          </thead>
          <tbody>
            {fs.map((from, ri) => {
              let pos = 0, neg = 0;
              const isHovRow = hovRow === from.id;
              const gcFrom = GC[from.group] || C.rx;
              return (
                <tr key={from.id} className="nm-row"
                  onMouseEnter={() => setHovRow(from.id)}
                  onMouseLeave={() => setHovRow(null)}>
                  <td style={{ padding: "5px 10px", background: isHovRow ? mixOn(gcFrom, 14) : C.cardAlt, border: `1px solid ${isHovRow ? tint(gcFrom, "80") : C.border}`, fontWeight: 700, color: C.text, position: "sticky", left: 0, zIndex: 3, fontSize: 11, whiteSpace: "nowrap", transition: "background .15s, border-color .15s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 5, background: mixOn(gcFrom, 20, "var(--c-surface)"), border: `1px solid ${tint(gcFrom, "99")}`, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 8, flexShrink: 0 }}>{from.av}</div>
                      <span title={from.name} style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{from.name.split(" ")[0]}</span>
                    </div>
                  </td>
                  {fs.map((to, ci) => {
                    if (from.id === to.id) {
                      return (
                        <td key={to.id} style={{ width: cellSize, height: cellSize, background: "repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in srgb, var(--c-t3) 30%, transparent) 5px 6px), var(--c-bgSub)", border: `1px solid ${C.border}`, textAlign: "center" }}>
                          <span style={{ fontSize: 13, color: tint(C.t3, "aa") }}>◇</span>
                        </td>
                      );
                    }
                    const conn   = conns.find(c => c.f === from.id && c.t === to.id);
                    const rev    = conns.find(c => c.f === to.id   && c.t === from.id);
                    const mutual = conn && rev;
                    const isHov  = hovRow === from.id || hovCol === to.id;
                    const isSel  = selCell && selCell.f === from.id && selCell.t === to.id;
                    if (hasType(conn, "pos")) pos++;
                    if (hasType(conn, "neg")) neg++;

                    const col    = conn ? (conn.tp === "pos" ? (mutual ? C.ok : C.teal) : conn.tp === "neg" ? C.err : C.amber) : null;
                    const bgCell = isSel ? tint(col, "59") : isHov && conn ? tint(col, "40") : conn ? tint(col, "26") : isHov ? tint(C.t3, "14") : "transparent";
                    const sym    = conn ? (conn.tp === "pos" ? (mutual ? "⬥" : "▲") : conn.tp === "neg" ? "▼" : "◯") : "";

                    // Pulso CSS animado en celdas con conexión
                    const isPulsing = conn && (tick + ri * 3 + ci) % 7 === 0;

                    return (
                      <td key={to.id} className="nm-cell"
                        onClick={() => setSelCell(isSel ? null : conn ? { f: from.id, t: to.id, conn, mutual, from, to } : null)}
                        onMouseEnter={() => { setHovRow(from.id); setHovCol(to.id); }}
                        onMouseLeave={() => { setHovRow(null); setHovCol(null); }}
                        title={conn ? `${from.name} → ${to.name}: ${(conn.types || [conn.tp]).map((t) => TIPO_INFO[t].l.toLowerCase()).join(" + ")}${mutual ? " (mutuo)" : ""}` : "Sin conexión"}
                        style={{ padding: 0, width: cellSize, height: cellSize, background: bgCell, border: `1px solid ${isSel ? tint(col, "cc") : isHov && conn ? tint(col, "80") : C.border}`, textAlign: "center", cursor: conn ? "pointer" : "default", transition: "background .12s, border-color .12s", position: "relative", overflow: "hidden" }}>

                        {/* Pulso neural CSS — no usa canvas */}
                        {conn && isPulsing && (
                          <div style={{
                            position: "absolute", inset: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            pointerEvents: "none",
                          }}>
                            <div style={{
                              width: 20, height: 20, borderRadius: "50%",
                              background: tint(col, "60"),
                              animation: "neuron-pulse 1.2s ease-out forwards",
                            }} />
                          </div>
                        )}

                        {/* Glow hover */}
                        {isHov && conn && (
                          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle, ${tint(col, "20")}, transparent)`, pointerEvents: "none" }} />
                        )}

                        {conn && conn.types && conn.types.length > 1 && (
                          <div style={{ position: "absolute", left: 0, right: 0, bottom: 2, display: "flex", justifyContent: "center", gap: 2, pointerEvents: "none" }}>
                            {conn.types.map((t) => <span key={t} style={{ width: 5, height: 5, borderRadius: "50%", background: t === "pos" ? C.teal : t === "neg" ? C.err : C.amber }} />)}
                          </div>
                        )}
                        {conn && (
                          <span style={{ fontSize: mutual ? 14 : 12, color: ink(col), fontWeight: mutual ? 800 : 600, position: "relative", zIndex: 1, textShadow: isHov ? `0 0 8px ${col}` : "none", transition: "text-shadow .15s" }}>
                            {sym}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ padding: "4px 8px", background: tint(C.teal, "14"), border: `1px solid ${C.border}`, textAlign: "center", fontWeight: 800, color: pos > 0 ? ink(C.teal) : C.t2, fontSize: 12 }}>{pos}</td>
                  <td style={{ padding: "4px 8px", background: tint(C.err, "14"), border: `1px solid ${C.border}`, textAlign: "center", fontWeight: 800, color: neg > 0 ? ink(C.err) : C.t2, fontSize: 12 }}>{neg}</td>
                </tr>
              );
            })}

            {/* Fila de recibidas con barras */}
            <tr>
              <td style={{ padding: "6px 10px", background: C.cardAlt, border: `1px solid ${C.border}`, fontWeight: 800, fontSize: 10, color: C.t2, position: "sticky", left: 0, zIndex: 3, letterSpacing: ".6px" }}>RECIBIDAS</td>
              {fs.map(to => {
                const rec  = conns.filter(c => c.t === to.id && hasType(c, "pos")).length;
                const maxR = Math.max(...fs.map(s => conns.filter(c => c.t === s.id && hasType(c, "pos")).length), 1);
                const pct  = rec / maxR;
                const gc   = GC[to.group] || C.teal;
                return (
                  <td key={to.id} style={{ padding: "3px 2px", background: "transparent", border: `1px solid ${C.border}`, textAlign: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: cellSize - 6, gap: 1 }}>
                      <div style={{ width: "65%", height: `${Math.max(pct * 100, 4)}%`, background: rec > 0 ? `linear-gradient(to top, ${gc}, ${tint(gc, "88")})` : C.borderLit, borderRadius: "2px 2px 0 0", minHeight: 3, boxShadow: pct > 0.5 ? `0 0 6px ${tint(gc, "60")}` : "none", transition: "height .4s" }} />
                      <span style={{ fontSize: 10, fontWeight: 800, color: rec > 0 ? ink(gc) : C.t2 }}>{rec}</span>
                    </div>
                  </td>
                );
              })}
              <td colSpan={2} style={{ background: C.cardAlt, border: `1px solid ${C.border}` }} />
            </tr>
          </tbody>
        </table>
      </div>}

      {/* Detalle de celda seleccionada */}
      {selCell && (
        <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 10, background: C.cardAlt, border: `1px solid ${tint(selCell.conn.tp === "pos" ? C.teal : selCell.conn.tp === "neg" ? C.err : C.amber, "40")}`, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: tint(GC[selCell.from.group] || C.rx, "20"), border: `1.5px solid ${GC[selCell.from.group] || C.rx}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: GC[selCell.from.group] || C.rx }}>{selCell.from.av}</div>
          <div style={{ fontSize: 20, color: selCell.conn.tp === "pos" ? C.teal : selCell.conn.tp === "neg" ? C.err : C.amber }}>→</div>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: tint(GC[selCell.to.group] || C.rx, "20"), border: `1.5px solid ${GC[selCell.to.group] || C.rx}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: GC[selCell.to.group] || C.rx }}>{selCell.to.av}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{selCell.from.name} → {selCell.to.name}</div>
            <div style={{ fontSize: 11, color: selCell.conn.tp === "pos" ? C.teal : selCell.conn.tp === "neg" ? C.err : C.amber }}>
              {(selCell.conn.types || [selCell.conn.tp]).map((t) => (t === "pos" ? "✓ Elección positiva" : t === "neg" ? "✗ Rechazo" : "○ Neutral")).join("  ·  ")}
              {selCell.mutual && <span style={{ color: C.ok, marginLeft: 8 }}>⬥ Mutua</span>}
            </div>
          </div>
          <button onClick={() => setSelCell(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.t3, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* Leyenda */}
      <div style={{ display: "flex", gap: 18, marginTop: 14, fontSize: 11, fontWeight: 500, color: C.t2, flexWrap: "wrap" }}>
        {[
          { sym: "▲", col: C.teal,  lab: "Positiva" },
          { sym: "⬥", col: C.ok,    lab: "Mutua" },
          { sym: "▼", col: C.err,   lab: "Rechazo" },
          { sym: "◯", col: C.amber, lab: "Neutral" },
        ].map(l => (
          <span key={l.lab} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 13, color: ink(l.col) }}>{l.sym}</span>{l.lab}
          </span>
        ))}
      </div>
    </div>
  );
}


// ════════ SURVEY EXECUTION ════════

// ════════ GROUP MANAGEMENT ════════

function GroupMgmt({ students, setStudents, groups, setGroups, GC, GROUPS, saveStudentFS, deleteStudentFS, saveGroupFS, deleteGroupFS, canEdit }) {
  const [addingTo, setAddingTo] = useState(null);
  const [addMode, setAddMode] = useState("single");
  const [newName, setNewName] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  // Grupos guardados + los que ya usan estudiantes aunque no tengan documento (así nunca quedan "invisibles").
  const names = allGroupNames(groups, students);
  // Importación masiva desde la plantilla CSV (grupos con sus estudiantes).
  const [imp, setImp] = useState(null);   // { plan, errores, ignoradas, nombreArchivo }
  const [importing, setImporting] = useState(false);
  const impRef = useRef(null);
  const onPickImport = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    const r = parsearImportacion(await f.text());
    setImp({ plan: planImportacion(r.filas, names, students), errores: r.errores, ignoradas: r.ignoradas, nombreArchivo: f.name });
  };
  const confirmImport = async () => {
    if (!imp || importing) return;
    setImporting(true);
    const { gruposNuevos, estudiantesNuevos } = imp.plan;
    const gs = gruposNuevos.map((name, i) => ({ id: groupIdFor(name), name, color: GROUP_COLORS[(groups.length + i) % GROUP_COLORS.length] }));
    const ss = estudiantesNuevos.map((x, i) => ({ id: Date.now() + i + Math.random(), name: x.nombre, group: x.grupo, av: initials(x.nombre) }));
    setGroups((p) => [...p, ...gs]); setStudents((p) => [...p, ...ss]);
    const rg = await Promise.all(gs.map((g) => saveGroupFS(g)));
    const rs = await Promise.all(ss.map((x) => saveStudentFS(x)));
    const malG = gs.filter((_, i) => !rg[i]), malS = ss.filter((_, i) => !rs[i]);
    if (malG.length) setGroups((p) => p.filter((x) => !malG.some((b) => b.id === x.id)));
    if (malS.length) setStudents((p) => p.filter((x) => !malS.some((b) => b.id === x.id)));
    setNotice(malG.length || malS.length ? `❌ Se importaron ${ss.length - malS.length} de ${ss.length} estudiantes; ${malS.length + malG.length} no se pudieron guardar. Revisa tu conexión e inténtalo de nuevo.` : `✅ Importación lista: ${gs.length} grupo(s) y ${ss.length} estudiante(s).`);
    if (ss.length - malS.length > 0) logActivity("group", `importó ${ss.length - malS.length} estudiante(s) y ${gs.length} grupo(s) desde archivo`, imp.nombreArchivo);
    setImp(null); setImporting(false);
  };

  const createGroup = async () => {
    const name = newGroup.trim();
    if (!name) return;
    if (groupExists(names, name)) { setNotice(`❌ Ya existe un grupo llamado «${name}».`); return; }
    const g = { id: groupIdFor(name), name, color: GROUP_COLORS[groups.length % GROUP_COLORS.length] };
    setNewGroup(""); setAddingGroup(false);
    const ok = await saveGroupFS(g);
    setNotice(ok ? `✅ Grupo «${name}» creado. Agrega estudiantes con «+ Agregar».` : `❌ No se pudo guardar el grupo «${name}». Revisa tu conexión o tus permisos e inténtalo de nuevo.`);
    if (!ok) setGroups((p) => p.filter((x) => x.id !== g.id)); else logActivity("group", "creó el grupo", name);
  };

  const addStudent = async () => {
    if (!newName.trim()) return;
    const id = Date.now() + Math.random();
    const av = initials(newName);
    const s = { id, name: newName.trim(), group: addingTo, av };
    setStudents((prev) => [...prev, s]);
    const ok = await saveStudentFS(s);
    if (!ok) { setStudents((prev) => prev.filter((x) => x.id !== id)); setNotice("❌ No se pudo guardar el estudiante. Inténtalo de nuevo."); return; }
    logActivity("group", "agregó un estudiante al grupo", addingTo);
    setNewName("");
  };

  const addBulk = async () => {
    if (!bulkText.split("\n").some((l) => l.trim())) return;
    const newStudents = parseBulkStudents(bulkText, addingTo);
    setStudents((s) => [...s, ...newStudents]);
    const res = await Promise.all(newStudents.map((s) => saveStudentFS(s)));
    const bad = newStudents.filter((_, i) => !res[i]);
    if (bad.length) { setStudents((s) => s.filter((x) => !bad.some((b) => b.id === x.id))); setNotice(`❌ No se pudieron guardar ${bad.length} de ${newStudents.length} estudiantes. Inténtalo de nuevo.`); }
    else setNotice(`✅ ${newStudents.length} estudiantes agregados.`);
    if (newStudents.length - bad.length > 0) logActivity("group", `agregó ${newStudents.length - bad.length} estudiante(s) al grupo`, addingTo);
    setBulkText("");
    setAddingTo(null);
  };

  const removeStudent = async (id) => {
    const g = students.find((x) => x.id === id)?.group;
    setStudents((s) => s.filter((x) => x.id !== id));
    await deleteStudentFS(id);
    logActivity("group", "eliminó un estudiante del grupo", g || "");
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <div><PageHeader title="Gestión de Grupos" subtitle="Administra grupos y participantes" /></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Btn v="ghost" onClick={() => downloadFile(PLANTILLA_NOMBRE, plantillaCSV(), "text/csv;charset=utf-8")} title="Archivo para diligenciar en Excel: una fila por estudiante con su grupo">⬇ Plantilla</Btn>
          {canEdit && <Btn v="ghost" onClick={() => impRef.current?.click()} title="Sube la plantilla diligenciada (CSV)">⬆ Importar estudiantes</Btn>}
          {canEdit && <input ref={impRef} type="file" accept=".csv,.txt,text/csv" onChange={onPickImport} style={{ display: "none" }} data-testid="import-grupos" />}
          <Btn v="sec" onClick={() => setAddingGroup(!addingGroup)}>+ Nuevo Grupo</Btn>
        </div>
      </div>
      {notice && (
        <div onClick={() => setNotice("")} style={{ padding: "9px 14px", borderRadius: 8, marginBottom: 12, fontSize: 12, cursor: "pointer", background: notice.startsWith("✅") ? tint(C.ok, "15") : tint(C.err, "15"), color: notice.startsWith("✅") ? C.ok : C.err, border: `1px solid ${tint(notice.startsWith("✅") ? C.ok : C.err, "30")}` }}>{notice}</div>
      )}
      {imp && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📥 Vista previa de la importación · {imp.nombreArchivo}</div>
          <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.7 }}>
            Se crearán <b>{imp.plan.gruposNuevos.length}</b> grupo(s) nuevo(s){imp.plan.gruposNuevos.length ? `: ${imp.plan.gruposNuevos.join(", ")}` : ""} y se agregarán <b>{imp.plan.estudiantesNuevos.length}</b> estudiante(s).
            {imp.plan.repetidos > 0 && <> Se omiten <b>{imp.plan.repetidos}</b> que ya existen o están repetidos.</>}
            {imp.ignoradas > 0 && <> Se ignoraron {imp.ignoradas} fila(s) de ejemplo.</>}
          </div>
          {imp.errores.length > 0 && <div style={{ fontSize: 11, color: C.err, marginTop: 6 }}>{imp.errores.slice(0, 6).map((x) => <div key={x}>⚠ {x}</div>)}{imp.errores.length > 6 && <div>…y {imp.errores.length - 6} más.</div>}<div style={{ color: C.t3 }}>Esas filas no se importarán.</div></div>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Btn v="pri" disabled={importing || !imp.plan.estudiantesNuevos.length} onClick={confirmImport}>{importing ? "Importando..." : "✓ Confirmar importación"}</Btn>
            <Btn v="ghost" disabled={importing} onClick={() => setImp(null)}>Cancelar</Btn>
          </div>
        </Card>
      )}
      {addingGroup && (
        <Card style={{ marginBottom: 14, display: "flex", alignItems: "flex-end", gap: 10 }}>
          <Inp label="Nombre del grupo" value={newGroup} onChange={setNewGroup} placeholder="Ej: 7° B" style={{ flex: 1 }} />
          <Btn v="pri" onClick={createGroup} disabled={!newGroup.trim()}>Crear</Btn>
          <Btn onClick={() => setAddingGroup(false)}>Cancelar</Btn>
        </Card>
      )}

      {/* ── Buscador global de estudiantes ── */}
      <div style={{ marginBottom: 14, position: "relative" }}>
        <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={search ? C.rx : C.t3} strokeWidth="2.5" strokeLinecap="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar estudiante o grupo..."
          style={{ width: "100%", background: C.surface, border: `1.5px solid ${search ? tint(C.rx, "70") : C.border}`, borderRadius: 10, padding: "10px 36px 10px 36px", color: C.text, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", transition: "all .2s", boxShadow: search ? `0 0 0 3px ${tint(C.rx, "15")}` : "none" }}
        />
        {search && (
          <button onClick={() => setSearch("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: C.border, border: "none", color: C.t2, cursor: "pointer", fontSize: 11, width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>✕</button>
        )}
        {search && (
          <div style={{ position: "absolute", right: 40, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: C.rx, fontWeight: 700 }}>
            {searchGroups(students, names, search).reduce((n, r) => n + r.members.length, 0)} estudiantes
          </div>
        )}
      </div>

      {/* ── Resultados de búsqueda: por nombre de estudiante o por nombre de grupo ── */}
      {search.trim() && (() => {
        const res = searchGroups(students, names, search);
        const total = res.reduce((n, r) => n + r.members.length, 0);
        const highlight = (text) => {
          const r = highlightRange(text, search);
          if (!r) return text;
          return (
            <span>
              {text.slice(0, r[0])}
              <span style={{ background: tint(C.rx, "35"), color: C.rx, borderRadius: 2, padding: "0 1px" }}>{text.slice(r[0], r[1])}</span>
              {text.slice(r[1])}
            </span>
          );
        };
        return (
          <Card style={{ marginBottom: 14, border: `1px solid ${tint(C.rx, "30")}`, background: C.cardAlt }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.rx, display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                {res.length} grupo{res.length !== 1 ? "s" : ""} · {total} estudiante{total !== 1 ? "s" : ""} · "{search}"
              </div>
            </div>
            {res.length === 0 ? (
              <div style={{ textAlign: "center", padding: "16px 0", color: C.t3, fontSize: 12 }}>
                <div style={{ fontSize: 28, opacity: .3, marginBottom: 6 }}>🔍</div>
                No se encontró ningún estudiante ni grupo con ese nombre
              </div>
            ) : (
              res.map(({ group: grp, members, groupMatched }) => {
                const gc = GC[grp] || C.rx;
                return (
                  <div key={grp} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: gc }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: gc }}>{groupMatched ? highlight(grp) : grp}</span>
                      <span style={{ fontSize: 10, color: C.t3 }}>({members.length})</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingLeft: 14 }}>
                      {members.length === 0 && <div style={{ fontSize: 11, color: C.t3, padding: "4px 2px" }}>Este grupo todavía no tiene estudiantes.</div>}
                      {members.map(s => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}` }}>
                          <div style={{ width: 30, height: 30, borderRadius: 7, background: tint(gc, "18"), color: gc, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 10, flexShrink: 0 }}>{s.av || initials(s.name)}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{highlight(s.name)}</div>
                            <div style={{ fontSize: 10, color: gc }}>{s.group}</div>
                          </div>
                          <button
                            onClick={() => { if (window.confirm(`¿Eliminar a ${s.name}?`)) { setStudents(p => p.filter(x => x.id !== s.id)); deleteStudentFS(s.id); logActivity("group", "eliminó un estudiante del grupo", s.group); } }}
                            title="Eliminar"
                            style={{ background: "none", border: "none", color: C.t3, cursor: "pointer", padding: "3px 5px", borderRadius: 5, display: "flex", alignItems: "center", transition: "all .15s" }}
                            onMouseEnter={e => { e.currentTarget.style.color = C.err; e.currentTarget.style.background = tint(C.err, "15"); }}
                            onMouseLeave={e => { e.currentTarget.style.color = C.t3; e.currentTarget.style.background = "none"; }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </Card>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,300px),1fr))", gap: 14 }}>
        {names.length === 0 && (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "36px 12px", color: C.t2, fontSize: 13 }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>👥</div>
            Todavía no hay grupos. Pulsa <b>+ Nuevo Grupo</b> para crear el primero y luego agrega estudiantes.
          </div>
        )}
        {names.map((g) => {
          const members = students.filter((s) => s.group === g);
          const hit = search.trim() ? searchGroups(students, [g], search)[0] : null;
          const visibleMembers = search.trim() ? (hit ? hit.members : []) : members;
          const gc = GC[g] || C.violet;
          return (
            <Card key={g} glow={gc} style={{ opacity: search.trim() && visibleMembers.length === 0 ? 0.4 : 1, transition: "opacity .2s" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: gc }} />
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{g}</span>
                  <Badge color={gc}>
                    {search.trim() && visibleMembers.length !== members.length
                      ? `${visibleMembers.length}/${members.length}`
                      : members.length}
                  </Badge>
                </div>
                <Btn sm onClick={() => setAddingTo(addingTo === g ? null : g)}>+ Agregar</Btn>
              </div>
              {addingTo === g && (
                <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: C.bgSub, border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                    {["single", "bulk"].map((m) => (
                      <button key={m} onClick={() => setAddMode(m)} style={{ flex: 1, padding: "4px", borderRadius: 5, border: `1px solid ${addMode === m ? (m === "single" ? C.teal : C.violet) : C.border}`, background: addMode === m ? tint(m === "single" ? C.teal : C.violet, "15") : "transparent", color: addMode === m ? (m === "single" ? C.teal : C.violet) : C.t3, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        {m === "single" ? "Un estudiante" : "Lista (copiar/pegar)"}
                      </button>
                    ))}
                  </div>
                  {addMode === "single" ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <Inp value={newName} onChange={setNewName} placeholder="Nombre completo" style={{ flex: 1 }} />
                      <Btn v="pri" sm onClick={addStudent} disabled={!newName.trim()}>+ Agregar</Btn>
                    </div>
                  ) : (
                    <div>
                      <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"Pega o escribe un nombre por línea:\nAna García\nCarlos Ruiz\n..."} style={{ width: "100%", minHeight: 90, background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 10px", color: C.text, fontSize: 12, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                        <span style={{ fontSize: 10, color: C.t3 }}>{bulkText.split("\n").filter((l) => l.trim()).length} nombres detectados</span>
                        <Btn v="sec" sm onClick={addBulk} disabled={!bulkText.trim()}>✓ Agregar todos</Btn>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {visibleMembers.map((s) => {
                  const name = s.name;
                  const rng = highlightRange(name, search);
                  const idx = rng ? rng[0] : -1;
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 7, background: idx >= 0 ? tint(gc, "10") : C.surface, border: `1px solid ${idx >= 0 ? tint(gc, "40") : C.border}`, transition: "all .15s" }}>
                      <span style={{ width: 26, height: 26, borderRadius: 6, background: tint(gc, "18"), color: gc, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 9, flexShrink: 0 }}>{s.av}</span>
                      <span style={{ fontSize: 12, flex: 1, color: C.text }}>
                        {idx >= 0 ? (
                          <span>
                            {name.slice(0, rng[0])}
                            <span style={{ background: tint(C.rx, "35"), color: C.rx, borderRadius: 2, padding: "0 1px", fontWeight: 700 }}>{name.slice(rng[0], rng[1])}</span>
                            {name.slice(rng[1])}
                          </span>
                        ) : name}
                      </span>
                      <button
                        onClick={() => removeStudent(s.id)}
                        title="Eliminar"
                        style={{ background: "none", border: "none", color: C.t3, cursor: "pointer", padding: "2px 4px", borderRadius: 5, display: "flex", alignItems: "center", transition: "all .15s", flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.color = C.err; e.currentTarget.style.background = tint(C.err, "15"); }}
                        onMouseLeave={e => { e.currentTarget.style.color = C.t3; e.currentTarget.style.background = "none"; }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </div>
                  );
                })}
                {!visibleMembers.length && !search.trim() && <div style={{ textAlign: "center", padding: 12, color: C.t3, fontSize: 11 }}>Sin participantes</div>}
                {!visibleMembers.length && search.trim() && <div style={{ textAlign: "center", padding: 8, color: C.t3, fontSize: 10 }}>Sin coincidencias</div>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ════════ AVANCE DE ENCUESTAS ════════
// Sale de las respuestas reales guardadas; no hay datos de ejemplo.

function SurveyProgress({ surveys, students, responses }) {
  const active = surveys.filter((sv) => sv.status === "active" && !sv.deleted);
  if (active.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      {active.map((sv) => {
        const p = surveyProgress(sv, students, responses);
        return (
          <Card key={sv.id} glow={C.rx} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>📊 Avance: {sv.title}</div>
              <Badge color={p.total > 0 && p.pct === 100 ? C.ok : C.amber}>{p.pct}% completado</Badge>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: C.border, marginBottom: 12, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${p.pct}%`, borderRadius: 4, background: `linear-gradient(90deg,${C.rx},#a78bfa)`, transition: "width .5s" }} />
            </div>
            {p.total === 0 ? (
              <div style={{ fontSize: 11, color: C.t3 }}>Esta encuesta no tiene estudiantes en sus grupos todavía.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 6 }}>
                {p.items.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 7, background: s.done ? tint(C.ok, "10") : C.surface, border: `1px solid ${s.done ? tint(C.ok, "30") : C.border}` }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.done ? C.ok : tint(C.t3, "50"), flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: s.done ? C.ok : C.t3, fontWeight: s.done ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 12, marginTop: 12, fontSize: 11, color: C.t2 }}>
              <span>✅ {p.completed} de {p.total} completadas</span>
              <span>⏳ {p.pending} pendientes</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ════════ ACTIVITY LOG ════════

function ActivityLog() {
  const icons = { create: "📋", report: "📊", system: "⚙", survey: "✅", user: "👤", export: "📄", group: "👥" };
  const colors = { create: C.rx, report: C.violet, system: C.t2, survey: C.teal, user: C.amber, export: C.sky, group: C.rx };
  const [log, setLog] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(query(ccol("activity"), orderBy("createdAt", "desc"), limit(200)),
      (snap) => { if (snap.empty) { setLog([]); } else { setLog(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }))); } setLoading(false); },
      (err) => { console.log("Activity offline:", err); setLog([]); setLoading(false); }
    );
    return () => unsub();
  }, []);

  const clear = async () => {
    setConfirming(false);
    try {
      const snap = await getDocs(ccol("activity"));
      await Promise.all(snap.docs.map((d) => deleteDoc(cdoc("activity", d.id))));
    } catch (e) { console.error("Error vaciando actividad:", e); }
    setLog([]);
  };

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>📜 Actividad Reciente <span style={{ fontSize: 10, color: C.t2, fontWeight: 400 }}>({log.length >= 200 ? "últimas 200" : `${log.length} entradas`})</span></div>
        {log.length > 0 && (confirming ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.err }}>¿Vaciar todo?</span>
            <Btn v="dan" sm onClick={clear}>Sí, vaciar</Btn>
            <Btn sm onClick={() => setConfirming(false)}>Cancelar</Btn>
          </div>
        ) : (<Btn sm v="dan" onClick={() => setConfirming(true)}>🗑 Vaciar</Btn>))}
      </div>
      {loading ? (
        <div style={{ textAlign: "center", padding: 30, color: C.t3, fontSize: 12 }}>Cargando actividad...</div>
      ) : !log.length ? (
        <div style={{ textAlign: "center", padding: 30 }}>
          <div style={{ fontSize: 28, opacity: 0.2, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 12, color: C.t3 }}>No hay actividad registrada</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {log.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, transition: "all .15s" }}>
              <span style={{ fontSize: 14 }}>{icons[a.type] || "📌"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: colors[a.type] || C.text }}>{a.user}</span>{" "}
                  <span style={{ color: C.t2 }}>{a.action}</span>
                </div>
                <div style={{ fontSize: 10, color: C.t2 }}>{a.detail}</div>
              </div>
              <span title={a.email || ""} style={{ fontSize: 10, color: C.t2, whiteSpace: "nowrap" }}>{a.createdAt ? formatWhen(a.createdAt) : (a.time || "")}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ════════ ADD QUESTION TO SURVEY ════════

function AddQToSurvey({ onAdd }) {
  const [text, setText] = useState("");
  const [tp, setTp] = useState("pos");
  const add = () => { if (!text.trim()) return; onAdd({ text: text.trim(), tp }); setText(""); setTp("pos"); };
  return (
    <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: C.card, border: `1px dashed ${C.borderLit}` }}>
      <div style={{ fontSize: 10, color: C.t3, marginBottom: 7, fontWeight: 600 }}>➕ NUEVA PREGUNTA</div>
      <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Escribe la pregunta y pulsa Enter..." style={{ flex: 1, background: C.bgSub, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", color: C.text, fontSize: 12, outline: "none", fontFamily: "inherit" }} />
        <select value={tp} onChange={(e) => setTp(e.target.value)} style={{ background: C.bgSub, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", color: tp === "pos" ? C.teal : tp === "neg" ? C.err : C.amber, fontSize: 11, fontWeight: 700, cursor: "pointer", outline: "none", fontFamily: "inherit" }}>
          <option value="pos">+ Positiva</option>
          <option value="neg">− Negativa</option>
          <option value="neu">○ Neutral</option>
        </select>
        <Btn v="pri" sm onClick={add} disabled={!text.trim()}>+ Agregar</Btn>
      </div>
    </div>
  );
}

// ════════ ESTADO VACÍO ════════

function EmptyState({ canEdit, onGo }) {
  return (
    <div style={{ maxWidth: 520, margin: "60px auto", textAlign: "center", padding: 24 }}>
      <div style={{ fontSize: 44, marginBottom: 12 }}>🌱</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Aún no hay estudiantes</div>
      <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, marginBottom: 20 }}>
        {canEdit
          ? "Crea tus grupos y agrega estudiantes uno por uno o pega una lista completa para importarlos. Cuando apliques una encuesta, aquí verás el sociograma."
          : "Todavía no se han cargado grupos ni estudiantes. Cuando el psicólogo los cree, aparecerán aquí."}
      </div>
      {canEdit && <Btn v="pri" onClick={onGo}>👥 Crear grupos / importar estudiantes</Btn>}
      <div style={{ fontSize: 11, color: C.t3, marginTop: 18 }}>¿Solo quieres explorar? Agrega <code>?demo</code> al final de la dirección para ver datos ficticios.</div>
    </div>
  );
}

// ════════ SURVEY BUILDER ════════

function SurveyBuilder({ role, students, GROUPS }) {
  const canEdit = role !== "readonly";
  const [surveys, setSurveys] = useState([]);
  const [loadingS, setLoadingS] = useState(true);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null), [creating, setCreating] = useState(false), [showTrash, setShowTrash] = useState(false);
  const [responses, setResponses] = useState([]);
  const [nS, setNS] = useState(blankSurvey);
  const [importPreview, setImportPreview] = useState(null);
  const fileInputRef = useRef(null);
  const [nQ, setNQ] = useState({ text: "", tp: "pos" });

  useEffect(() => {
    const q = query(ccol("surveys"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => { setSurveys(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoadingS(false); }, (err) => { console.log("Surveys offline:", err); setLoadingS(false); });
    return () => unsub();
  }, []);

  // Respuestas reales del colegio, para mostrar el avance de cada encuesta activa.
  useEffect(() => {
    const unsub = onSnapshot(ccol("responses"), (snap) => setResponses(snap.docs.map((d) => d.data())), () => {});
    return () => unsub();
  }, []);

  const addQ = () => { if (!nQ.text.trim()) return; setNS((s) => ({ ...s, questions: [...s.questions, { id: "q_" + Date.now(), ...nQ }] })); setNQ({ text: "", tp: "pos" }); };

  const flash = (m, ms = 4500) => { setMsg(m); setTimeout(() => setMsg(""), ms); };

  // Crea una encuesta en borrador (formulario, plantilla o archivo importado).
  const addSurvey = async (data, origen = "") => {
    const id = "sv_" + Date.now();
    // Las respuestas se guardan por identificador de pregunta: toda pregunta nueva debe tener uno propio.
    const questions = (data.questions || []).map((q, i) => ({ ...q, id: q.id || `q_${Date.now()}_${i}` }));
    try {
      await setDoc(cdoc("surveys", id), { ...data, questions, id, status: "draft", createdAt: serverTimestamp() });
      logActivity("create", origen === "plantilla" ? "creó la encuesta de prueba" : origen === "importada" ? "importó la encuesta" : origen === "duplicada" ? "duplicó la encuesta" : "creó la encuesta", `${data.title} · ${questions.length} preguntas`);
      return id;
    } catch (e) {
      console.error("Error guardando encuesta:", e);
      flash("❌ No se pudo guardar la encuesta: " + e.message);
      return null;
    }
  };

  const save = async () => {
    if (!nS.title.trim() || !nS.questions.length) return;
    const id = await addSurvey(nS);
    if (id) flash("✅ Encuesta guardada como borrador. Actívala cuando quieras aplicarla.");
    setCreating(false);
    setNS(blankSurvey());
  };

  const openCreate = () => {
    if ((GROUPS || []).length === 0) { flash("⚠ Primero crea un grupo en la pestaña Grupos: la encuesta se aplica a uno o más grupos."); return; }
    setNS(blankSurvey()); setCreating(true);
  };

  const useTemplate = async () => {
    if ((GROUPS || []).length === 0) { flash("⚠ Primero crea un grupo y agrega estudiantes en la pestaña Grupos; la encuesta de prueba se aplica a tus grupos."); return; }
    const id = await addSurvey(buildTemplateSurvey(GROUPS), "plantilla");
    if (id) flash("✅ Encuesta de prueba creada en borrador, con preguntas positivas, neutrales y negativas. Pulsa «Borrador» para activarla y «Aplicar» para abrirla.", 7000);
  };

  const onPickFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (f.size > 200000) { setImportPreview({ fileName: f.name, result: { ok: false, errors: ["El archivo es demasiado grande (máximo 200 KB)."], warnings: [], survey: null } }); return; }
    let text = ""; try { text = await f.text(); } catch (err) { text = ""; }
    const result = parseSurveyImport(text, f.name);
    setImportPreview({ fileName: f.name, result, title: result.survey?.title || "" });
  };

  const confirmImport = async () => {
    const r = importPreview?.result; if (!r?.ok) return;
    const groups = (GROUPS || []).slice();
    const id = await addSurvey({ title: (importPreview.title || r.survey.title).trim() || r.survey.title, group: groups[0] || "", groups, maxSel: r.survey.maxSel, questions: r.survey.questions.map((q, i) => ({ id: "q_" + Date.now() + "_" + i, text: q.text, tp: q.tp })) }, "importada");
    if (id) flash(`✅ Encuesta importada en borrador con ${r.survey.questions.length} preguntas.`);
    setImportPreview(null);
  };

  // Copia una encuesta (mismas preguntas y grupos, sin respuestas) para volver a aplicarla: otro grupo, otro periodo o el mismo grupo más adelante.
  const duplicateSurvey = async (sv) => {
    const gs = surveyGroups(sv);
    const base = `Copia de ${sv.title}`;
    const n = surveys.filter((x) => !x.deleted && (x.title === base || x.title.startsWith(base + " ("))).length;
    const id = await addSurvey({ title: n ? `${base} (${n + 1})` : base, group: gs[0] || "", groups: gs, maxSel: sv.maxSel, questions: (sv.questions || []).map((q) => ({ text: q.text, tp: q.tp })) }, "duplicada");
    if (id) { setEditing(id); flash("✅ Copia creada en borrador, sin respuestas. Cambia el título y los grupos, y actívala cuando quieras aplicarla.", 8000); }
  };

  // Resultados de una encuesta a Excel (.xlsx): hojas con índices, conexiones, matriz y una fila por respuesta.
  const exportResults = (sv) => {
    const res = buildResultsSheets({ students, surveys, responses, surveyId: sv.id, group: "Todos", colegio: SCHOOL.nombre });
    downloadBytes(resultsFileName({ colegio: SCHOOL.nombre, surveyTitle: sv.title }), buildXlsx(res.sheets), XLSX_MIME);
    logActivity("export", "exportó los resultados de la encuesta (Excel)", sv.title);
    flash(`✅ Excel descargado: ${res.resumen.respuestas} respuestas, ${res.resumen.elecciones} elecciones. Contiene datos de menores: guárdalo con cuidado.`, 7000);
  };

  const exportSurvey = (sv, kind) => {
    logActivity("export", `exportó la encuesta (${kind.toUpperCase()})`, sv.title);
    if (kind === "json") downloadFile(surveyFileName(sv, "json"), JSON.stringify(exportSurveyJSON(sv), null, 2), "application/json");
    else downloadFile(surveyFileName(sv, "csv"), surveyToCSV(sv), "text/csv;charset=utf-8");
  };

  const tituloDe = (id) => surveys.find((x) => x.id === id)?.title || "";
  const deleteSurvey = async (id) => {
    logActivity("survey", "movió a la papelera la encuesta", tituloDe(id));
    try {
      await updateDoc(cdoc("surveys", id), { deleted: true, deletedAt: serverTimestamp() });
    } catch (e) { setSurveys((s) => s.map((x) => x.id === id ? { ...x, deleted: true } : x)); }
  };
  const restoreSurvey = async (id) => {
    logActivity("survey", "restauró la encuesta", tituloDe(id));
    try {
      await updateDoc(cdoc("surveys", id), { deleted: false, deletedAt: null });
    } catch (e) { setSurveys((s) => s.map((x) => x.id === id ? { ...x, deleted: false } : x)); }
  };
  const deletePermanent = async (id) => {
    logActivity("survey", "eliminó definitivamente la encuesta", tituloDe(id));
    try {
      // Eliminar «para siempre» también borra lo que los estudiantes respondieron en esa encuesta (son datos de menores).
      for (const col of ["responses", "responseMarks"]) {
        const snap = await getDocs(query(ccol(col), where("surveyId", "==", id)));
        for (const part of chunk(snap.docs, 400)) { const b = writeBatch(db); part.forEach((d) => b.delete(d.ref)); await b.commit(); }
      }
      await deleteDoc(cdoc("surveys", id));
    } catch (e) { console.error(e); alert("No se pudo eliminar por completo la encuesta. Inténtalo de nuevo."); }
  };
  // Cambia los grupos de una encuesta: guarda la lista y el primero JUNTOS y, si está activa, renueva la lista de nombres de la encuesta pública.
  const updateSurveyGroups = async (id, groups) => {
    const cur = surveys.find((x) => x.id === id);
    if (!cur || groups.length === 0) return;
    const next = { ...cur, groups, group: groups[0] };
    const extra = next.status === "active" ? publicSurveyInfo(next, students) : {};
    setSurveys((s) => s.map((x) => (x.id === id ? { ...x, groups, group: groups[0], ...extra } : x)));
    try { await updateDoc(cdoc("surveys", id), { groups, group: groups[0], ...extra }); } catch (e) { console.error(e); return; }
    logActivity("survey", "cambió los grupos de la encuesta", `${cur.title} → ${groups.join(", ")}`);
  };
  const updateSurveyField = async (id, field, value) => {
    const cur = surveys.find((x) => x.id === id);
    const next = { ...cur, [field]: value };
    // Al activar (o cambiar los grupos de una encuesta activa) se refresca la lista de nombres.
    const extra = next.status === "active" && (field === "status" || field === "groups" || field === "group") ? publicSurveyInfo(next, students) : {};
    setSurveys((s) => s.map((x) => (x.id === id ? { ...x, [field]: value, ...extra } : x)));
    try { await updateDoc(cdoc("surveys", id), { [field]: value, ...extra }); } catch (e) { console.error(e); return; }
    // Solo el cambio de estado: título y máximo se editan tecla a tecla y llenarían el registro.
    if (field === "status") logActivity("survey", value === "active" ? "activó la encuesta" : "pasó a borrador la encuesta", cur?.title || "");
  };
  const updateSurveyQuestions = async (id, questions) => { setSurveys((s) => s.map((x) => (x.id === id ? { ...x, questions } : x))); try { await updateDoc(cdoc("surveys", id), { questions }); logActivity("survey", "modificó las preguntas de la encuesta", tituloDe(id)); } catch (e) { console.error(e); } };

  if (creating) return (
    <div style={{ animation: "slideIn .3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Btn v="ghost" onClick={() => setCreating(false)}>← Volver</Btn>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Crear Nueva Encuesta</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 16 }}>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: C.rx }}>⚙ Configuración</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Inp label="Título" value={nS.title} onChange={(v) => setNS((s) => ({ ...s, title: v }))} placeholder="Ej: Sociograma Q2" />
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.t2, display: "block", marginBottom: 6 }}>Grupos incluidos</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(GROUPS || []).map(g => {
                  const on = (nS.groups?.length > 0 ? nS.groups : [nS.group]).includes(g);
                  const gc = GC[g] || "#3b82f6";
                  return (
                    <button key={g} onClick={() => {
                      const cur = nS.groups?.length > 0 ? nS.groups : [nS.group];
                      const next = cur.includes(g) ? (cur.length > 1 ? cur.filter(x => x !== g) : cur) : [...cur, g];
                      setNS(s => ({ ...s, groups: next, group: next[0] }));
                    }} style={{
                      padding: "4px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit", transition: "all .2s",
                      border: `1.5px solid ${on ? gc : C.border}`,
                      background: on ? tint(gc, "20") : "transparent",
                      color: on ? gc : C.t3,
                    }}>{g}</button>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: C.t3, marginTop: 5 }}>
                Grupos: {(nS.groups?.length > 0 ? nS.groups : [nS.group]).join(", ")}
              </div>
            </div>
            <Inp label="Máx. selecciones" type="number" value={nS.maxSel} onChange={(v) => setNS((s) => ({ ...s, maxSel: parseInt(v) || 1 }))} />
            <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "9px 11px", borderRadius: 8, background: tint(C.teal, "12"), border: `1px solid ${tint(C.teal, "30")}` }}>
              <span>🔒</span>
              <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.5 }}><b style={{ color: C.text }}>Confidencial.</b> Los estudiantes no ven lo que responden los demás; solo el equipo del colegio ve las respuestas. Se guarda quién respondió, porque el sociograma lo necesita.</div>
            </div>
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: C.rx }}>📝 Preguntas ({nS.questions.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, maxHeight: 160, overflowY: "auto" }}>
            {nS.questions.map((q, i) => (
              <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: C.t3, width: 22 }}>#{i + 1}</span>
                <span style={{ fontSize: 12, color: C.text, flex: 1 }}>{q.text}</span>
                <Badge color={q.tp === "pos" ? C.teal : q.tp === "neg" ? C.err : C.amber}>{q.tp === "pos" ? "+" : q.tp === "neg" ? "−" : "○"}</Badge>
                <button onClick={() => setNS((s) => ({ ...s, questions: s.questions.filter((x) => x.id !== q.id) }))} style={{ background: "none", border: "none", color: C.err, cursor: "pointer", fontSize: 13 }}>✕</button>
              </div>
            ))}
            {!nS.questions.length && <div style={{ textAlign: "center", padding: 16, color: C.t3, fontSize: 11 }}>Agrega preguntas</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 8, background: C.bgSub, border: `1px solid ${C.border}` }}>
            <Inp placeholder="Escribe la pregunta..." value={nQ.text} onChange={(v) => setNQ((q) => ({ ...q, text: v }))} />
            <div style={{ display: "flex", gap: 8 }}>
              <Sel value={nQ.tp} onChange={(v) => setNQ((q) => ({ ...q, tp: v }))} options={[{ v: "pos", l: "+ Positiva" }, { v: "neg", l: "− Negativa" }, { v: "neu", l: "○ Neutral" }]} />
              <Btn v="pri" onClick={addQ} disabled={!nQ.text.trim()}>+ Agregar</Btn>
            </div>
          </div>
        </Card>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
        <Btn onClick={() => setCreating(false)}>Cancelar</Btn>
        <Btn v="pri" onClick={save} disabled={!nS.title.trim() || !nS.questions.length}>💾 Guardar</Btn>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <div><PageHeader title="Gestión de Encuestas" subtitle="Crea, edita, ejecuta encuestas sociométricas" /></div>
        {canEdit && <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Btn v="ghost" onClick={() => setShowTrash(!showTrash)} style={{ position: "relative" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            Papelera
            {surveys.filter(s => s.deleted).length > 0 && (
              <span style={{ position: "absolute", top: -4, right: -4, background: C.err, color: "#fff", borderRadius: "50%", width: 16, height: 16, fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {surveys.filter(s => s.deleted).length}
              </span>
            )}
          </Btn>
          <Btn v="ghost" onClick={useTemplate}>📋 Encuesta de prueba</Btn>
          <Btn v="ghost" onClick={() => downloadFile(PLANTILLA_ENCUESTA_NOMBRE, plantillaEncuestaCSV(), "text/csv;charset=utf-8")} title="Archivo para diligenciar en Excel: una fila por pregunta (pregunta; tipo)">⬇ Plantilla</Btn>
          <Btn v="ghost" onClick={() => fileInputRef.current?.click()}>⬆ Importar</Btn>
          <input ref={fileInputRef} type="file" accept=".json,.csv,.txt,application/json,text/csv" onChange={onPickFile} style={{ display: "none" }} data-testid="import-file" />
          <Btn v="pri" onClick={openCreate}>+ Nueva Encuesta</Btn>
        </div>}
      </div>
      {msg && <div style={{ padding: "8px 12px", borderRadius: 8, marginBottom: 10, background: msg.startsWith("✅") ? tint(C.ok, "15") : tint(C.amber, "15"), color: msg.startsWith("✅") ? C.ok : C.amber, fontSize: 12 }}>{msg}</div>}
      {loadingS && <div style={{ textAlign: "center", padding: 30, color: C.t3 }}>Cargando encuestas...</div>}

      {/* ── Vista previa de la importación ── */}
      {importPreview && (() => {
        const r = importPreview.result;
        return (
          <Card style={{ marginBottom: 14, border: `1px solid ${r.ok ? C.teal : C.err}50` }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: r.ok ? C.teal : C.err }}>{r.ok ? "⬆ Vista previa de la importación" : "❌ No se pudo importar el archivo"}</div>
            <div style={{ fontSize: 11, color: C.t3, marginBottom: 10 }}>{importPreview.fileName}</div>
            {r.errors.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {r.errors.slice(0, 8).map((e, i) => <div key={i} style={{ fontSize: 12, color: C.err, marginBottom: 3 }}>• {e}</div>)}
                {r.errors.length > 8 && <div style={{ fontSize: 11, color: C.t3 }}>… y {r.errors.length - 8} más.</div>}
                <div style={{ fontSize: 11, color: C.t2, marginTop: 6 }}>Corrige el archivo y vuelve a subirlo. No se creó nada.</div>
              </div>
            )}
            {r.ok && (
              <>
                <Inp label="Título de la encuesta" value={importPreview.title} onChange={(v) => setImportPreview((p) => ({ ...p, title: v }))} />
                <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "10px 0" }}>
                  {r.survey.questions.map((q, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, padding: "5px 8px", borderRadius: 7, background: C.surface, border: `1px solid ${C.border}` }}>
                      <span style={{ minWidth: 20, color: C.t3 }}>{i + 1}.</span>
                      <span style={{ flex: 1 }}>{q.text}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: TIPO_INFO[q.tp].c() }}>{TIPO_INFO[q.tp].s} {TIPO_INFO[q.tp].l}</span>
                    </div>
                  ))}
                </div>
                {r.warnings.map((w, i) => <div key={i} style={{ fontSize: 11, color: C.amber }}>⚠ {w}</div>)}
                <div style={{ fontSize: 11, color: C.t2, margin: "6px 0 10px" }}>Se creará en borrador para {(GROUPS || []).length > 0 ? `todos tus grupos (${GROUPS.join(", ")})` : "…(primero crea un grupo)"}. Podrás cambiar los grupos al editarla.</div>
              </>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              {r.ok && <Btn v="pri" onClick={confirmImport} disabled={(GROUPS || []).length === 0}>✓ Crear encuesta</Btn>}
              <Btn v="ghost" onClick={() => setImportPreview(null)}>{r.ok ? "Cancelar" : "Cerrar"}</Btn>
            </div>
          </Card>
        );
      })()}

      {/* ── Papelera ── */}
      {showTrash && (
        <Card style={{ marginBottom: 16, border: `1px solid ${tint(C.err, "30")}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.err, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            🗑 Papelera ({surveys.filter(s => s.deleted).length} encuestas)
          </div>
          {surveys.filter(s => s.deleted).length === 0 ? (
            <div style={{ fontSize: 12, color: C.t3, textAlign: "center", padding: 16 }}>La papelera está vacía</div>
          ) : surveys.filter(s => s.deleted).map(sv => (
            <div key={sv.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, marginBottom: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.t2 }}>{sv.title}</div>
                <div style={{ fontSize: 10, color: C.t2 }}>{surveyGroups(sv).join(", ")} · {sv.questions?.length} preguntas</div>
              </div>
              <Btn sm v="ok" onClick={() => restoreSurvey(sv.id)}>↩ Restaurar</Btn>
              <Btn sm v="dan" onClick={() => { if (window.confirm("¿Eliminar permanentemente?")) deletePermanent(sv.id); }}>✕ Eliminar</Btn>
            </div>
          ))}
        </Card>
      )}

      {!loadingS && surveys.filter((sv) => !sv.deleted).length === 0 && (
        <Card style={{ marginBottom: 14, textAlign: "center", padding: "28px 16px" }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>📝</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Todavía no hay encuestas</div>
          <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.6, marginBottom: 14 }}>
            {students.length === 0
              ? "Primero crea tus grupos y agrega estudiantes en la pestaña Grupos; después podrás crear y aplicar encuestas."
              : canEdit ? "Crea una encuesta, actívala y comparte su enlace con los estudiantes. Aquí verás quién ya respondió." : "Cuando el psicólogo cree una encuesta, aparecerá aquí."}
          </div>
          {canEdit && students.length > 0 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <Btn v="pri" onClick={openCreate}>+ Nueva Encuesta</Btn>
              <Btn v="ghost" onClick={useTemplate}>📋 Crear encuesta de prueba</Btn>
              <Btn v="ghost" onClick={() => fileInputRef.current?.click()}>⬆ Importar desde archivo</Btn>
            </div>
          )}
        </Card>
      )}
      <SurveyProgress surveys={surveys} students={students} responses={responses} />
      {surveys.filter(sv => !sv.deleted).map((sv) => (
        <Card key={sv.id} style={{ marginBottom: 12 }} glow={C.rx}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{sv.title}</span>
                <button onClick={() => canEdit && updateSurveyField(sv.id, "status", sv.status === "active" ? "draft" : "active")} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 20, fontSize: 10, fontWeight: 700, border: `1px solid ${sv.status === "active" ? tint(C.ok, "40") : tint(C.amber, "40")}`, background: sv.status === "active" ? tint(C.ok, "15") : tint(C.amber, "15"), color: sv.status === "active" ? C.ok : C.amber, cursor: canEdit ? "pointer" : "default", fontFamily: "inherit", transition: "all .2s" }}>
                  {sv.status === "active" ? "● Activa" : "◌ Borrador"}
                  {canEdit && <span style={{ fontSize: 9, opacity: 0.6 }}>{sv.status === "active" ? " ▼" : " ▲"}</span>}
                </button>
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: C.t2 }}>
                <span>📋 {sv.questions.length} preguntas ({(() => { const c = countTipos(sv.questions); return `${c.pos} + · ${c.neu} ○ · ${c.neg} −`; })()})</span>
                <span title="Grupos a los que se aplica">👥 {surveyGroups(sv).join(", ") || "Todos los grupos"}</span>
                <span>🎯 Máx: {sv.maxSel}</span>
                <span title="Los estudiantes no ven las respuestas de los demás; solo el equipo del colegio las ve. Se guarda quién respondió.">🔒 Confidencial</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Btn sm v="ghost" onClick={() => exportSurvey(sv, "json")} title="Descargar la encuesta como JSON (para importarla en otro colegio)">⬇ JSON</Btn>
              <Btn sm v="ghost" onClick={() => exportSurvey(sv, "csv")} title="Descargar las preguntas en CSV (se abre en Excel)">⬇ CSV</Btn>
              {canEdit && <Btn sm v="ghost" onClick={() => duplicateSurvey(sv)} title="Crea una copia sin respuestas para aplicarla a otro grupo o en otro periodo">⧉ Duplicar</Btn>}
              {canEdit && <Btn sm v="teal" disabled={!responses.some((r) => r.surveyId === sv.id)} onClick={() => exportResults(sv)} title={responses.some((r) => r.surveyId === sv.id) ? "Descarga los resultados en Excel (.xlsx) para hacer tus propios gráficos" : "Aún no hay respuestas para exportar"}>⬇ Resultados (Excel)</Btn>}
              {canEdit && (<>
              <Btn sm v="ok" onClick={() => { if (sv.status !== "active") { setMsg("⚠ Activa la encuesta (pulsa «Borrador») para poder aplicarla."); setTimeout(() => setMsg(""), 4000); return; } window.open(`${window.location.origin}${window.location.pathname}?c=${CID}&survey=${sv.id}`, "_blank", "noopener"); logActivity("survey", "abrió para aplicar la encuesta", sv.title); }}>▶ Aplicar</Btn>
              <Btn sm v="teal" onClick={() => { const url = `${window.location.origin}${window.location.pathname}?c=${CID}&survey=${sv.id}`; navigator.clipboard.writeText(url).then(() => alert("✅ Link copiado:\n\n" + url)).catch(() => prompt("Copia este link:", url)); }}>🔗 Link</Btn>
              </>)}
              {canEdit && (<><Btn sm onClick={() => setEditing(editing === sv.id ? null : sv.id)}>{editing === sv.id ? "Cerrar" : "✎ Editar"}</Btn><Btn sm v="dan" onClick={() => deleteSurvey(sv.id)}>🗑</Btn></>)}
            </div>
          </div>
          {editing === sv.id && (
            <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: C.bgSub, border: `1px solid ${C.border}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                <Inp label="Título" value={sv.title} onChange={(v) => updateSurveyField(sv.id, "title", v)} />
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.t2, display: "block", marginBottom: 6 }}>Grupos de la encuesta</label>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {(GROUPS || []).map((g) => {
                      const cur = surveyGroups(sv), on = cur.includes(g), gc = GC[g] || "#3b82f6";
                      return (
                        <button key={g} aria-pressed={on} title={on && cur.length === 1 ? "La encuesta necesita al menos un grupo" : on ? `Quitar ${g}` : `Agregar ${g}`} onClick={() => updateSurveyGroups(sv.id, on ? (cur.length > 1 ? cur.filter((x) => x !== g) : cur) : [...cur, g])} style={{ padding: "4px 11px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `1.5px solid ${on ? gc : C.border}`, background: on ? tint(gc, "26") : "transparent", color: on ? C.text : C.t2 }}>{on ? "✓ " : ""}{g}</button>
                      );
                    })}
                  </div>
                </div>
                <Inp label="Máx. selecciones" type="number" value={sv.maxSel} onChange={(v) => updateSurveyField(sv.id, "maxSel", parseInt(v) || 1)} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.teal, marginBottom: 8 }}>📝 Preguntas ({sv.questions.length})</div>
              {sv.questions.map((q, i) => (
                <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, padding: "7px 10px", borderRadius: 7, background: C.card, border: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 10, color: C.t3, width: 22, fontWeight: 700 }}>#{i + 1}</span>
                  <input value={q.text} onChange={(e) => { const val = e.target.value; const newQs = sv.questions.map((qq) => qq.id === q.id ? { ...qq, text: val } : qq); updateSurveyQuestions(sv.id, newQs); }} style={{ flex: 1, background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 12, outline: "none", fontFamily: "inherit", padding: "2px 0" }} />
                  <select value={q.tp} onChange={(e) => { const val = e.target.value; const newQs = sv.questions.map((qq) => qq.id === q.id ? { ...qq, tp: val } : qq); updateSurveyQuestions(sv.id, newQs); }} style={{ background: C.bgSub, border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 6px", color: q.tp === "pos" ? C.teal : q.tp === "neg" ? C.err : C.amber, fontSize: 10, fontWeight: 700, cursor: "pointer", outline: "none", fontFamily: "inherit" }}>
                    <option value="pos">+ Positiva</option><option value="neg">− Negativa</option><option value="neu">○ Neutral</option>
                  </select>
                  <button onClick={() => { const newQs = sv.questions.filter((qq) => qq.id !== q.id); updateSurveyQuestions(sv.id, newQs); }} style={{ background: "none", border: "none", color: tint(C.err, "80"), cursor: "pointer", fontSize: 12, padding: "0 3px" }}>✕</button>
                </div>
              ))}
              <AddQToSurvey onAdd={(q) => { const newQs = [...sv.questions, { id: Date.now(), ...q }]; updateSurveyQuestions(sv.id, newQs); }} />
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ════════ REPORTS PANEL ════════

function ReportsPanel({ students, conns, responses = [], surveys = [], surveyFilter = "all" }) {
  const grupos = ["Todos", ...Array.from(new Set(students.map((s) => s.group)))];
  const [selectedGroup, setSelectedGroup] = useState("Todos");
  const [reportType, setReportType] = useState("individual");
  const [active, setActive] = useState(null);

  const filteredStudents = selectedGroup === "Todos" ? students : students.filter((s) => s.group === selectedGroup);
  const filteredConns = conns.filter((c) => {
    const fromOk = filteredStudents.some((s) => String(s.id) === String(c.f));
    const toOk = filteredStudents.some((s) => String(s.id) === String(c.t));
    return fromOk && toOk;
  });

  const dl = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  // Un único generador para la vista previa, el HTML descargado y el PDF: lo que ves es lo que se exporta.
  const report = useMemo(() => computeReport(filteredStudents, filteredConns), [filteredStudents, filteredConns]);
  const groupLabel = selectedGroup === "Todos" ? "Todos los grupos" : selectedGroup;
  const dateStr = new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });
  const build = (mode) => renderReportHTML(report, { type: reportType, groupLabel, date: dateStr, mode, colors: GC });
  const exportHTML = () => { dl(build("html"), reportFileName(groupLabel, reportType, "html"), "text/html;charset=utf-8;"); logActivity("report", `descargó el reporte ${REPORT_TYPES[reportType]} (HTML)`, groupLabel); };
  const sinRespuestas = !(surveyFilter === "all" ? responses : responses.filter((r) => r.surveyId === surveyFilter)).some((r) => filteredStudents.some((s) => String(s.id) === String(r.respondentId)));
  const exportExcel = () => {
    const titulo = surveyFilter === "all" ? "" : (surveys.find((x) => x.id === surveyFilter) || {}).title || "";
    const res = buildResultsSheets({ students, surveys, responses, surveyId: surveyFilter, group: selectedGroup, colegio: SCHOOL.nombre });
    downloadBytes(resultsFileName({ colegio: SCHOOL.nombre, group: selectedGroup, surveyTitle: titulo }), buildXlsx(res.sheets), XLSX_MIME);
    logActivity("export", "exportó los resultados a Excel", `${groupLabel}${titulo ? " · " + titulo : " · todas las encuestas"}`);
  };
  const exportPDF = () => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { alert("El navegador bloqueó la ventana del PDF. Permite las ventanas emergentes para este sitio e inténtalo de nuevo."); return; }
    win.document.write(build("pdf"));
    win.document.close();
    logActivity("report", `abrió el reporte ${REPORT_TYPES[reportType]} para imprimir (PDF)`, groupLabel);
  };
  const TYPE_HELP = {
    individual: "Índices de cada estudiante y una ficha por persona: quién la eligió, quién la rechazó y a quién eligió. Incluye nombres.",
    grupal: "Solo cifras del grupo: densidad, roles en conteos y tabla de grupos. Sin nombres de estudiantes ni quién eligió a quién.",
    ambos: "Todo: resumen, índices, grupos, matriz sociométrica con nombres y fichas por estudiante.",
  };

  const renderPreview = () => (
    <Card style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.sky }}>
          👁 Vista Previa — Reporte {REPORT_TYPES[reportType]}
          <span style={{ fontSize: 10, color: C.t2, fontWeight: 400, marginLeft: 8 }}>{groupLabel} · {filteredStudents.length} participantes</span>
        </div>
        <Btn sm v="ghost" onClick={() => setActive(null)}>✕ Cerrar</Btn>
      </div>
      <iframe title="Vista previa del reporte" sandbox="" srcDoc={build("preview")} style={{ width: "100%", height: 700, border: `1px solid ${C.border}`, borderRadius: 10, background: "#f5f6fa" }} />
    </Card>
  );

  return (
    <div>
      <PageHeader title="Reportes y Análisis" subtitle="Genera reportes del análisis sociométrico filtrados por grupo" />
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 12, textTransform: "uppercase", letterSpacing: ".5px" }}>Configurar reporte</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.t2, display: "block", marginBottom: 5 }}>Grupo a analizar</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {grupos.map((g) => { const on = selectedGroup === g; const gc = g === "Todos" ? "#3b82f6" : GC[g] || "#3b82f6"; return (<button key={g} onClick={() => setSelectedGroup(g)} style={{ padding: "5px 13px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${on ? tint(gc, "80") : C.border}`, background: on ? tint(gc, "18") : "transparent", color: on ? gc : C.t3, transition: "all .2s" }}>{g === "Todos" ? "🌐 Todos" : g}</button>); })}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.t2, display: "block", marginBottom: 5 }}>Tipo de reporte</label>
            <div style={{ display: "flex", gap: 6 }}>
              {[{ v: "individual", l: "👤 Individual" }, { v: "grupal", l: "👥 Grupal" }, { v: "ambos", l: "📊 Completo" }].map((opt) => { const on = reportType === opt.v; return (<button key={opt.v} onClick={() => setReportType(opt.v)} style={{ padding: "5px 13px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${on ? tint(C.violet, "80") : C.border}`, background: on ? tint(C.violet, "18") : "transparent", color: on ? C.violet : C.t3, transition: "all .2s" }}>{opt.l}</button>); })}
            </div>
            <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.5, marginTop: 7 }}>{TYPE_HELP[reportType]}</div>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: C.bgSub, border: `1px solid ${C.border}`, fontSize: 11, color: C.t2 }}>
          📌 {filteredStudents.length} participantes · {filteredConns.length} conexiones{selectedGroup !== "Todos" && <span style={{ color: GC[selectedGroup] || C.rx, fontWeight: 700, marginLeft: 6 }}>· {selectedGroup}</span>}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 16 }}>
        <Card glow={C.sky} style={{ cursor: "pointer" }}>
          <div onClick={() => setActive(active === "preview" ? null : "preview")}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>👁</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Vista Previa</div>
            <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.5, marginBottom: 12 }}>Explora los datos en pantalla antes de exportar</div>
            <Btn v="teal" sm style={{ width: "100%", justifyContent: "center", pointerEvents: "none" }}>{active === "preview" ? "Cerrar ✕" : "Ver ahora"}</Btn>
          </div>
        </Card>
        <Card glow={C.rx} style={{ cursor: "pointer" }}>
          <div onClick={exportPDF}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Exportar PDF</div>
            <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.5, marginBottom: 12 }}>Abre una ventana lista para imprimir con formato profesional</div>
            <Btn v="pri" sm style={{ width: "100%", justifyContent: "center", pointerEvents: "none" }}>Generar PDF ↓</Btn>
          </div>
        </Card>
        <Card glow={C.violet} style={{ cursor: "pointer" }}>
          <div onClick={exportHTML}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🌐</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Descargar HTML</div>
            <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.5, marginBottom: 12 }}>Archivo HTML completo para abrir en navegador e imprimir</div>
            <Btn v="sec" sm style={{ width: "100%", justifyContent: "center", pointerEvents: "none" }}>Descargar ↓</Btn>
          </div>
        </Card>
        <Card glow={C.teal} style={{ cursor: sinRespuestas ? "not-allowed" : "pointer", opacity: sinRespuestas ? 0.6 : 1 }}>
          <div onClick={sinRespuestas ? undefined : exportExcel}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📗</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Excel (.xlsx)</div>
            <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.5, marginBottom: 12 }}>{sinRespuestas ? "Aún no hay respuestas de este grupo para exportar" : "Índices, conexiones, matriz y una fila por respuesta, para hacer tus propios gráficos"}</div>
            <Btn v="teal" sm disabled={sinRespuestas} style={{ width: "100%", justifyContent: "center", pointerEvents: "none" }}>Descargar Excel ↓</Btn>
          </div>
        </Card>
      </div>
      {active === "preview" && renderPreview()}
    </div>
  );
}

// ════════ SETTINGS PANEL ════════

function LicenciaCard({ licencia, nEstudiantes }) {
  const est = estadoLicencia(licencia);
  if (est.fase === "sin_licencia") return null;
  const plan = PLANES[licencia.plan];
  const f = (ms) => new Date(ms).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  const costo = licencia.plan === "piloto" ? "Gratis (piloto)" : plan?.precio ? `$${plan.precio.toLocaleString("es-CO")} COP + IVA` : "A convenir";
  const filas = [["Plan", plan ? plan.label : "—"], ["Estudiantes", `${nEstudiantes}${licencia.maxEstudiantes ? ` de ${licencia.maxEstudiantes}` : " (sin tope)"}`], ["Costo anual", costo], ["Vigencia", `hasta el ${f(est.vence)}`]];
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🔑 Licencia</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
        {filas.map(([k, v]) => <div key={k}><div style={{ fontSize: 10, color: C.t3, textTransform: "uppercase", letterSpacing: ".05em" }}>{k}</div><div style={{ fontSize: 13, fontWeight: 600 }}>{v}</div></div>)}
      </div>
      <div style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>Para cambiar de plan o renovar, comunícate con Iskonex.</div>
    </Card>
  );
}

function SettingsPanel({ licencia, nEstudiantes }) {
  const [cfg, setCfg] = useState({ colegio: "", ciudad: "", periodo: "", dominio: "all", registro: "no", notifEncuesta: "yes", notifResultados: "psy", logo: "", idioma: "es" });
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(cdoc("settings", "global"), (snap) => { if (snap.exists()) { setCfg((prev) => ({ ...prev, ...snap.data() })); } setLoading(false); }, (err) => { console.log("Settings offline:", err); setLoading(false); });
    return () => unsub();
  }, []);

  const upd = (k, v) => { setCfg((p) => ({ ...p, [k]: v })); setDirty(true); setSaved(false); };
  const save = async () => {
    try {
      await setDoc(cdoc("settings", "global"), { ...cfg, updatedAt: serverTimestamp() });
      // La encuesta pública no puede leer los ajustes: se copian el nombre y el logo a las encuestas activas.
      try {
        const act = await getDocs(query(ccol("surveys"), where("status", "==", "active")));
        await Promise.all(act.docs.map((d) => updateDoc(d.ref, { colegioNombre: cfg.colegio || "", logo: cfg.logo || deleteField() })));
      } catch (e) { console.log("No se pudieron actualizar encuestas activas", e); }
      logActivity("system", "actualizó la configuración del colegio", "");
      setSaved(true); setDirty(false); setTimeout(() => setSaved(false), 3000); } catch (e) { console.error(e); }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <PageHeader title="Configuración" subtitle="Ajustes globales de RedNexo" />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {dirty && <span style={{ fontSize: 11, color: C.amber }}>● Cambios sin guardar</span>}
          {saved && <span style={{ fontSize: 11, color: C.ok }}>✓ Guardado</span>}
          <Btn v="pri" onClick={save} disabled={!dirty}>💾 Guardar cambios</Btn>
        </div>
      </div>
      <LicenciaCard licencia={licencia} nEstudiantes={nEstudiantes} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 14 }}>
        <Card glow={C.rx}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: C.rx }}>🏫 Institución</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Inp label="Colegio" value={cfg.colegio} onChange={(v) => upd("colegio", v)} placeholder="Nombre del colegio" />
            <Inp label="Ciudad" value={cfg.ciudad} onChange={(v) => upd("ciudad", v)} placeholder="Ciudad" />
            <Sel label="Período" value={cfg.periodo} onChange={(v) => upd("periodo", v)} options={[{ v: "", l: "Sin definir" }, { v: "2026-1", l: "2026 — Sem. 1" }, { v: "2026-2", l: "2026 — Sem. 2" }, { v: "2025-2", l: "2025 — Sem. 2" }, { v: "2025-1", l: "2025 — Sem. 1" }]} />
          </div>
        </Card>
        <Card glow={C.teal}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: C.teal }}>🔐 Seguridad <span style={{ fontSize: 10, fontWeight: 600, color: C.t3 }}>· aún sin efecto</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Sel disabled label="Dominio Google permitido (próximamente)" value={cfg.dominio} onChange={(v) => upd("dominio", v)} options={[{ v: "all", l: "Cualquier correo" }, { v: "edu.co", l: "@edu.co" }]} />
            <Sel disabled label="Registro de nuevos usuarios (próximamente)" value={cfg.registro} onChange={(v) => upd("registro", v)} options={[{ v: "no", l: "Solo invitación (recomendado)" }, { v: "approval", l: "Libre con aprobación admin" }, { v: "yes", l: "Completamente abierto" }]} />
          </div>
        </Card>
        <Card glow={C.amber}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: C.amber }}>📧 Notificaciones <span style={{ fontSize: 10, fontWeight: 600, color: C.t3 }}>· aún sin efecto</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Sel disabled label="Notificar encuestas nuevas (próximamente)" value={cfg.notifEncuesta} onChange={(v) => upd("notifEncuesta", v)} options={[{ v: "yes", l: "Sí" }, { v: "no", l: "No" }]} />
            <Sel disabled label="Enviar resultados a (próximamente)" value={cfg.notifResultados} onChange={(v) => upd("notifResultados", v)} options={[{ v: "psy", l: "Solo psicólogos" }, { v: "all", l: "Todos los usuarios" }, { v: "admin", l: "Solo administradores" }]} />
          </div>
        </Card>
        <Card glow={C.violet}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: C.violet }}>🎨 Marca</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: C.t2, marginBottom: 6 }}>Logo del colegio</div>
              {cfg.logo && (<div style={{ display: "flex", justifyContent: "center", padding: 8, background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 8 }}><img src={cfg.logo} alt="Logo del colegio" style={{ maxHeight: 64, maxWidth: "100%", objectFit: "contain" }} /></div>)}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { upd("logo", await resizeLogo(f)); } catch (err) { alert("No se pudo leer la imagen. Prueba con otro archivo PNG o JPG."); } e.target.value = ""; }} style={{ fontSize: 11, color: C.t2, maxWidth: "100%" }} />
                {cfg.logo && <Btn sm v="ghost" onClick={() => upd("logo", "")}>Quitar</Btn>}
              </div>
              <div style={{ fontSize: 10, color: C.t3, marginTop: 6 }}>Se redimensiona automáticamente. Aparece en la cabecera y en las encuestas de este colegio.</div>
            </div>
            <Sel disabled label="Idioma de la interfaz (próximamente)" value={cfg.idioma} onChange={(v) => upd("idioma", v)} options={[{ v: "es", l: "Español" }, { v: "en", l: "English" }]} />
          </div>
        </Card>
      </div>
      <Card style={{ marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📦 Datos del colegio</div>
        <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.5, marginBottom: 10 }}>Descarga una copia completa de los datos de este colegio (estudiantes, grupos, encuestas, respuestas, usuarios y ajustes) en un archivo JSON. Guárdala en un lugar seguro: contiene datos de menores.</div>
        <Btn v="sec" disabled={exporting} onClick={async () => { setExporting(true); setExportMsg(""); try { const c = await exportColegio({ id: CID, nombre: cfg.colegio }, SESSION_EMAIL); setExportMsg(`✅ Descargado: ${c.students} estudiantes, ${c.groups} grupos, ${c.surveys} encuestas, ${c.responses} respuestas.`); logActivity("export", "exportó los datos del colegio", `${c.students} estudiantes, ${c.groups} grupos, ${c.surveys} encuestas, ${c.responses} respuestas`); } catch (e) { setExportMsg("❌ No se pudo exportar: " + e.message); } setExporting(false); }}>{exporting ? "Exportando..." : "⬇ Exportar datos del colegio"}</Btn>
        {exportMsg && <div style={{ fontSize: 11, marginTop: 8, color: C.t2 }}>{exportMsg}</div>}
      </Card>
      {dirty && (<div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}><Btn v="pri" onClick={save}>💾 Guardar todos los cambios</Btn></div>)}
    </div>
  );
}

// ════════ PUBLIC SURVEY ════════

// ════════ LOGO DEL COLEGIO ════════
// El logo de cada colegio vive en sus ajustes (colegios/{id}/settings/global.logo); no hay ninguno incrustado en el código.

/** Reduce la imagen a un máximo de 256 px y la devuelve como data URL (cabe en los límites de las reglas). */
function resizeLogo(file, max = 256) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/webp", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imagen inválida")); };
    img.src = url;
  });
}

function SchoolLogo({ src, name = "", size = 40, style = {} }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={name || "Logo del colegio"}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.15)", flexShrink: 0, ...style }}
    />
  );
}

function PublicSurvey({ surveyId, colegioId }) {
  const [survey, setSurvey] = useState(null);
  const [students, setStudents] = useState([]);
  const [step, setStep] = useState("loading");
  const [respondent, setRespondent] = useState(null);
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);
  // Grupos que el respondente puede ver al seleccionar su nombre
  const [selectedGroups, setSelectedGroups] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        if (!colegioId || !surveyId) { setStep("error"); return; }
        setCurrentColegio(colegioId);
        // Solo se lee ESTA encuesta (activa); la lista de nombres viaja dentro de ella.
        const svDoc = await getDoc(cdoc("surveys", surveyId));
        if (!svDoc.exists()) { setStep("error"); return; }
        const svData = { id: svDoc.id, ...svDoc.data() };
        if (svData.status !== "active") { setStep("error"); return; }
        setSurvey(svData);
        const stList = Array.isArray(svData.roster) ? svData.roster : [];
        if (stList.length === 0) { setStep("error"); return; }
        setStudents(stList);
        // Inicializar grupos disponibles según config de la encuesta
        const allGs = [...new Set(stList.map(s => s.group))];
        const surveyGs = surveyGroups(svData).length > 0 ? surveyGroups(svData) : allGs;
        const validGs = surveyGs.filter(g => allGs.includes(g));
        setSelectedGroups(validGs.length > 0 ? validGs : allGs);
        setStep("select");
      } catch (e) { setStep("error"); }
    };
    loadData();
  }, [surveyId, colegioId]);

  const toggleGroup = (g) => setSelectedGroups(p =>
    p.includes(g) ? (p.length > 1 ? p.filter(x => x !== g) : p) : [...p, g]
  );

  const selectRespondent = async (student) => {
    try {
      const respDoc = await getDoc(cdoc("responseMarks", `${surveyId}_${student.id}`));
      if (respDoc.exists()) { setRespondent(student); setAlreadyDone(true); setStep("done"); return; }
    } catch (e) { console.log("Verificación omitida"); }
    setRespondent(student); setAnswers({}); setQIdx(0); setStep("answering");
  };

  const toggleSel = (qId, studentId) => {
    setAnswers(prev => {
      const curr = prev[qId] || [];
      const max = survey?.maxSel || 3;
      if (curr.includes(studentId)) return { ...prev, [qId]: curr.filter(x => x !== studentId) };
      if (curr.length >= max) return prev;
      return { ...prev, [qId]: [...curr, studentId] };
    });
  };

  const submitSurvey = async () => {
    setSaving(true);
    try {
      const rid = `${surveyId}_${respondent.id}`;
      await setDoc(cdoc("responses", rid), {
        surveyId, respondentId: respondent.id, respondentName: respondent.name,
        answers, submittedAt: serverTimestamp(),
      });
      try { await setDoc(cdoc("responseMarks", rid), { surveyId, respondentId: respondent.id }); } catch (e) { /* la marca es solo informativa */ }
      setStep("done"); setAlreadyDone(false);
    } catch (e) { alert("Error al guardar. Intenta de nuevo."); }
    setSaving(false);
  };

  const bg = (
    <div style={{ position: "fixed", inset: 0, background: "#07070f", zIndex: 0 }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 25% 20%, #3b82f60a, transparent 55%), radial-gradient(ellipse at 75% 80%, #a78bfa08, transparent 55%)" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
    </div>
  );

  if (step === "loading") return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif" }}>
      {bg}
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 14 }}>
        <SchoolLogo src={survey?.logo} name={survey?.colegioNombre} size={44} />
        <Logo size="md" />
      </div>
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 10, color: "#9498ae", fontSize: 13 }}>
        <div style={{ width: 16, height: 16, border: "2px solid #252637", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
        Cargando encuesta...
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box}`}</style>
    </div>
  );

  if (step === "error") return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif" }}>
      {bg}
      <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 380 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: "#eaedf6" }}>Encuesta no disponible</div>
        <div style={{ fontSize: 13, color: "#9498ae", lineHeight: 1.6 }}>Este link no es válido o la encuesta no está activa. Contacta a tu psicólogo o profesor.</div>
      </div>
      <style>{`*{box-sizing:border-box}`}</style>
    </div>
  );

  if (step === "done") return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif" }}>
      {bg}
      <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 400 }}>
        <div style={{ width: 80, height: 80, borderRadius: 20, background: alreadyDone ? "#fbbf2420" : "#34d39920", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 36, marginBottom: 20 }}>
          {alreadyDone ? "⚠️" : "✅"}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: alreadyDone ? "#fbbf24" : "#34d399" }}>
          {alreadyDone ? "Ya respondiste esta encuesta" : "¡Gracias por responder!"}
        </div>
        <div style={{ fontSize: 13, color: "#9498ae", lineHeight: 1.7, marginBottom: 6 }}>
          {alreadyDone ? `${respondent?.name}, ya registraste tus respuestas anteriormente.` : `${respondent?.name}, tus respuestas fueron registradas correctamente.`}
        </div>
        <div style={{ fontSize: 11, color: "#555770" }}>Puedes cerrar esta ventana.</div>
        {alreadyDone && (
          <button onClick={() => setStep("select")} style={{ marginTop: 20, padding: "9px 20px", borderRadius: 9, border: "1px solid #252637", background: "#16171f", color: "#9498ae", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            Seleccionar otro estudiante
          </button>
        )}
      </div>
      <style>{`*{box-sizing:border-box}`}</style>
    </div>
  );

  if (step === "select") {
    const filtered = students.filter(s => selectedGroups.includes(s.group));
    const allAvailGroups = [...new Set(students.filter(s =>
      (surveyGroups(survey || {}).length > 0 ? surveyGroups(survey || {}) : [...new Set(students.map(x => x.group))]).includes(s.group)
    ).map(s => s.group))];

    return (
      <div style={{ minHeight: "100vh", padding: 24, fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif" }}>
        {bg}
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap'); *{box-sizing:border-box}`}</style>
        <div style={{ position: "relative", zIndex: 1, maxWidth: 600, margin: "0 auto" }}>

          {/* Header con logos */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, padding: "12px 16px", background: "rgba(22,23,31,0.8)", backdropFilter: "blur(12px)", borderRadius: 14, border: "1px solid rgba(59,130,246,0.15)" }}>
            <SchoolLogo src={survey?.logo} name={survey?.colegioNombre} size={48} />
            <Logo size="md" />
          </div>

          {/* Info de la encuesta */}
          <div style={{ background: "rgba(22,23,31,0.85)", backdropFilter: "blur(12px)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 14, padding: 20, marginBottom: 14 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: "#eaedf6" }}>{survey?.title}</div>
            <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#9498ae" }}>
              <span>📋 {survey?.questions?.length} preguntas</span>
              <span>🎯 Máx. {survey?.maxSel} selecciones</span>
              <span>👥 {filtered.length} participantes</span>
            </div>
            <div style={{ fontSize: 11, color: "#9498ae", marginTop: 10, lineHeight: 1.5 }}>
              🔒 Tus respuestas son confidenciales: solo las ve el equipo del colegio. Tus compañeros no ven lo que respondes.
            </div>
          </div>

          {/* Selector de grupo — solo si hay más de 1 grupo disponible */}
          {allAvailGroups.length > 1 && (
            <div style={{ background: "rgba(22,23,31,0.85)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#9498ae", marginBottom: 10, textTransform: "uppercase", letterSpacing: "1px" }}>
                🏫 Filtrar por grupo
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {allAvailGroups.map(g => {
                  const on = selectedGroups.includes(g);
                  const gc = GC[g] || "#3b82f6";
                  return (
                    <button key={g} onClick={() => toggleGroup(g)} style={{
                      padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit", transition: "all .2s",
                      border: `1.5px solid ${on ? gc : "rgba(255,255,255,0.1)"}`,
                      background: on ? tint(gc, "22") : "transparent",
                      color: on ? gc : "#555770",
                    }}>
                      {g} <span style={{ opacity: .6, fontSize: 10 }}>({students.filter(s => s.group === g).length})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#9498ae" }}>¿Quién eres tú?</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {filtered.map(s => {
              const gc = GC[s.group] || "#3b82f6";
              return (
                <button key={s.id} onClick={() => selectRespondent(s)} style={{
                  background: "rgba(22,23,31,0.85)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12, padding: "12px 14px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10,
                  transition: "all .2s", fontFamily: "inherit", textAlign: "left",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = gc; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.background = tint(gc, "10"); }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "none"; e.currentTarget.style.background = "rgba(22,23,31,0.85)"; }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: tint(gc, "20"), border: `1.5px solid ${tint(gc, "40")}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: gc, flexShrink: 0 }}>{s.av}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#eaedf6" }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: gc }}>{s.group}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (step === "answering") {
    const q = survey.questions[qIdx];
    const sel = answers[q.id] || [];
    const isLast = qIdx === survey.questions.length - 1;
    // Los estudiantes que puede elegir: los de los grupos disponibles, excluyendo al respondente
    const surveyGs = surveyGroups(survey || {}).length > 0 ? surveyGroups(survey || {}) : null;
    const otherStudents = students.filter(s => s.id !== respondent.id && (surveyGs ? surveyGs.includes(s.group) : true));

    return (
      <div style={{ minHeight: "100vh", padding: 24, fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif" }}>
        {bg}
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap'); *{box-sizing:border-box} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto" }}>

          {/* Header mini con logos */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, padding: "8px 14px", background: "rgba(22,23,31,0.8)", backdropFilter: "blur(12px)", borderRadius: 12, border: "1px solid rgba(59,130,246,0.12)" }}>
            <SchoolLogo src={survey?.logo} name={survey?.colegioNombre} size={34} />
            <Logo size="sm" />
          </div>

          {/* Barra de progreso */}
          <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
            {survey.questions.map((_, i) => (
              <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i < qIdx ? "#34d399" : i === qIdx ? "#3b82f6" : "rgba(255,255,255,0.1)", transition: "all .4s", boxShadow: i === qIdx ? "0 0 8px #3b82f660" : undefined }} />
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#eaedf6", marginBottom: 16, textAlign: "center", fontWeight: 600 }}>
            <span style={{ color: "#3b82f6" }}>Pregunta {qIdx + 1}</span>
            <span style={{ color: "#555770" }}> de {survey.questions.length}</span>
          </div>

          {/* Card de pregunta */}
          <div style={{ background: "rgba(22,23,31,0.9)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: (GC[respondent.group] || "#3b82f6") + "20", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 10, color: GC[respondent.group] || "#3b82f6" }}>{respondent.av}</div>
              <span style={{ fontSize: 12, color: "#9498ae" }}>{respondent.name}</span>
              <button onClick={() => setStep("select")} style={{ marginLeft: "auto", background: "none", border: "none", color: "#555770", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>← Cambiar</button>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: q.tp === "neg" ? "#f87171" : "#eaedf6", lineHeight: 1.4 }}>{q.text}</div>
            <div style={{ fontSize: 11, color: "#555770", marginBottom: 14 }}>Selecciona hasta {survey.maxSel} personas</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {otherStudents.map(s => {
                const on = sel.includes(s.id);
                const gc = GC[s.group] || "#3b82f6";
                return (
                  <button key={s.id} onClick={() => toggleSel(q.id, s.id)} style={{
                    background: on ? tint(gc, "12") : "rgba(18,19,26,0.8)", border: `1.5px solid ${on ? gc : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 10, padding: "10px 14px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 10,
                    transition: "all .2s", fontFamily: "inherit",
                  }}>
                    <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${on ? gc : "rgba(255,255,255,0.15)"}`, background: on ? gc : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s" }}>
                      {on && <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>✓</span>}
                    </div>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: tint(gc, "18"), display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 10, color: gc }}>{s.av}</div>
                    <span style={{ fontSize: 13, color: "#eaedf6", flex: 1, textAlign: "left" }}>{s.name}</span>
                    <span style={{ fontSize: 10, color: gc }}>{s.group}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {qIdx > 0 && (
              <button onClick={() => { setQIdx(i => i - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                style={{ flex: 1, padding: "11px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#9498ae", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                ← Anterior
              </button>
            )}
            {!isLast ? (
              <button onClick={() => { setQIdx(i => i + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                style={{ flex: 1, padding: "11px 20px", borderRadius: 10, border: "none", background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Siguiente →
              </button>
            ) : (
              <button onClick={submitSurvey} disabled={saving}
                style={{ flex: 1, padding: "11px 20px", borderRadius: 10, border: "none", background: saving ? "#333" : "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Guardando..." : "✅ Enviar respuestas"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ════════ MAIN APP ════════

// ════════ SELECTOR DE COLEGIO ════════

// Botón «Soporte»: abre el formulario de Iskonex Soporte (se carga la primera vez que se necesita).
const SOPORTE_BASE = urlSoporte({ override: import.meta.env.VITE_SOPORTE_URL, emuladores: import.meta.env.VITE_USE_EMULATORS === "true" });
const VERSION_APP = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";
async function abrirSoporte(prefill) {
  if (esEncuestaPublica(window.location.search)) return false;   // nunca en la encuesta de los estudiantes
  const w = await cargarWidget({ base: SOPORTE_BASE });
  if (w) { w.open(prefill); return true; }
  alert("No se pudo abrir el soporte. Revisa tu conexión e inténtalo de nuevo.");
  return false;
}
const BtnSoporte = ({ prefill, label = "❓ Soporte" }) => (
  <Btn sm v="ghost" onClick={() => abrirSoporte(prefill)} title="Contactar a soporte (no escribas datos de estudiantes)">{label}</Btn>
);

// Abre una ventana con el HTML y lanza la impresión (el navegador permite «Guardar como PDF»).
function imprimirHTML(html) {
  const w = window.open("", "_blank");
  if (!w) { alert("El navegador bloqueó la ventana. Permite las ventanas emergentes para imprimir."); return; }
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => { try { w.print(); } catch (e) {} }, 400);
}
const fechaCorta = (ms) => ms ? new Date(ms).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const copTxt = (n) => "$" + Number(n || 0).toLocaleString("es-CO");
const hoyISO = () => new Date().toISOString().slice(0, 10);

function CamposForm({ campos, valores, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
      {campos.map(([k, label, req]) => <Inp key={k} label={label + (req ? " *" : "")} value={valores[k] || ""} onChange={(v) => onChange({ ...valores, [k]: v })} />)}
    </div>
  );
}

// Datos legales de Iskonex (para el contrato). Se llenan cuando la empresa esté constituida.
function EmpresaForm({ onGuardado }) {
  const [v, setV] = useState({});
  const [msg, setMsg] = useState("");
  // Lo ya escrito no se pisa si la carga tarda.
  useEffect(() => { getDoc(doc(db, "plataforma", "empresa")).then((d) => setV((cur) => ({ ...(d.exists() ? d.data() : {}), ...cur }))).catch(() => {}); }, []);
  const faltan = faltantes(CAMPOS_EMPRESA, v);
  const guardar = async () => {
    try { await setDoc(doc(db, "plataforma", "empresa"), v); setMsg("✅ Datos guardados."); onGuardado && onGuardado(v); } catch (e) { setMsg("❌ No se pudo guardar: " + e.message); }
  };
  return (
    <div style={{ padding: "0 12px 12px", borderTop: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, color: C.t2, margin: "10px 0" }}>Estos datos aparecen en el contrato como «EL PROVEEDOR». Mientras falten, el contrato sale como borrador con marcas «[PENDIENTE]» y no se puede marcar como firmado.</div>
      <CamposForm campos={CAMPOS_EMPRESA} valores={v} onChange={setV} />
      {faltan.length > 0 && <div style={{ fontSize: 11, color: C.amber, marginTop: 8 }}>Pendiente: {faltan.join(", ")}.</div>}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}><Btn v="pri" sm onClick={guardar}>💾 Guardar datos de Iskonex</Btn>{msg && <span style={{ fontSize: 11 }}>{msg}</span>}</div>
    </div>
  );
}

// Cartera: lo pagado por cada colegio y por año.
function CarteraPanel({ colegios }) {
  const [datos, setDatos] = useState(null);
  useEffect(() => {
    (async () => {
      const out = await Promise.all(colegios.map(async (c) => {
        const leer = async (n) => { try { return (await getDocs(collection(db, "colegios", c.id, n))).docs.map((d) => d.data()); } catch (e) { return []; } };
        return { colegio: c, pagos: await leer("pagos"), historial: await leer("historial") };
      }));
      setDatos(carteraGeneral(out));
    })();
  }, [colegios]);
  if (!datos) return <div style={{ padding: "0 12px 12px", fontSize: 12, color: C.t2 }}>Cargando…</div>;
  const anios = Object.keys(datos.porAnio).sort();
  return (
    <div style={{ padding: "0 12px 12px", borderTop: `1px solid ${C.border}`, fontSize: 12 }}>
      <div style={{ margin: "10px 0 6px", fontWeight: 700 }}>Total recibido: {copTxt(datos.total)}{anios.length ? " · " + anios.map((y) => `${y}: ${copTxt(datos.porAnio[y])}`).join(" · ") : ""}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead><tr style={{ textAlign: "left", color: C.t3 }}>{["Colegio", "Plan", "Vence", "Valor del plan", "Pagado", "Último pago"].map((h) => <th key={h} style={{ padding: "4px 6px" }}>{h}</th>)}</tr></thead>
          <tbody>{datos.filas.map((f) => (
            <tr key={f.id} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: "5px 6px" }}>{f.nombre}</td><td style={{ padding: "5px 6px" }}>{PLANES[f.plan]?.label || "—"}</td><td style={{ padding: "5px 6px" }}>{fechaCorta(f.vence)}</td>
              <td style={{ padding: "5px 6px" }}>{f.precio ? copTxt(f.precio) : "—"}</td><td style={{ padding: "5px 6px" }}>{copTxt(f.pagado)}</td><td style={{ padding: "5px 6px" }}>{fechaCorta(f.ultimoPago)}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

// Gestión comercial de UN colegio (solo superadmin): datos legales, contratos, pagos e historial.
function GestionColegio({ colegio, session, onCerrar, onCambio }) {
  const [tab, setTab] = useState("contratos");
  const [legal, setLegal] = useState({});
  const [empresa, setEmpresa] = useState({});
  const [pagos, setPagos] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [msg, setMsg] = useState("");
  const [fc, setFc] = useState({ plan: colegio.licencia?.plan && colegio.licencia.plan !== "piloto" ? colegio.licencia.plan : "basico", descuento: "0", inicio: hoyISO() });
  const [fp, setFp] = useState({ valor: "", fecha: hoyISO(), medio: "transferencia", referencia: "", factura: "", contratoId: "", nota: "" });
  const cdocRef = (sub, id) => doc(db, "colegios", colegio.id, sub, id);
  const cargar = async () => {
    const leer = async (n) => { try { return (await getDocs(collection(db, "colegios", colegio.id, n))).docs.map((d) => ({ id: d.id, ...d.data() })); } catch (e) { return []; } };
    const [l, e, cd] = await Promise.all([getDoc(cdocRef("legal", "datos")).catch(() => null), getDoc(doc(db, "plataforma", "empresa")).catch(() => null), getDoc(doc(db, "colegios", colegio.id)).catch(() => null)]);
    setLegal({ ciudad: (cd && cd.exists() && cd.data().ciudad) || "", ...(l && l.exists() ? l.data() : {}) }); setEmpresa(e && e.exists() ? e.data() : {});
    setPagos((await leer("pagos")).sort((a, b) => (aMs(b.fecha) || 0) - (aMs(a.fecha) || 0)));
    setContratos((await leer("contratos")).sort((a, b) => (b.numero || "").localeCompare(a.numero || "")));
    setHistorial((await leer("historial")).sort((a, b) => (aMs(b.creadoEn) || 0) - (aMs(a.creadoEn) || 0)));
  };
  useEffect(() => { cargar(); }, [colegio.id]);  // eslint-disable-line
  const ok = (t) => setMsg("✅ " + t), mal = (e) => setMsg("❌ " + (e?.message || e));

  const guardarLegal = async () => { try { await setDoc(cdocRef("legal", "datos"), legal); ok("Datos legales guardados."); } catch (e) { mal(e); } };

  const vigenciaInicio = () => Date.parse(fc.inicio + "T12:00:00Z");
  const precioLista = PLANES[fc.plan]?.precio || 0;
  const precioFinal = precioConDescuento(precioLista, fc.descuento);
  const generar = async () => {
    const ms = vigenciaInicio();
    if (!Number.isFinite(ms)) { mal("La fecha de inicio no es válida."); return; }
    try {
      // Datos de Iskonex al día (pudieron guardarse después de abrir esta ventana).
      const empSnap = await getDoc(doc(db, "plataforma", "empresa")).catch(() => null);
      const empresaAct = empSnap && empSnap.exists() ? empSnap.data() : {};
      setEmpresa(empresaAct);
      const numero = numeroContrato(new Date(ms).getUTCFullYear(), contratos.map((c) => c.numero));
      const base = { numero, plan: fc.plan, precio: precioLista, descuentoPct: Number(fc.descuento) || 0, inicio: ms, meses: 12 };
      const r = generarContratoHTML({ empresa: empresaAct, colegio: legal, contrato: base });
      const ref = await addDoc(collection(db, "colegios", colegio.id, "contratos"), {
        numero, version: CONTRATO_VERSION, plan: fc.plan, maxEstudiantes: PLANES[fc.plan]?.maxEstudiantes || 0, precioLista, descuentoPct: base.descuentoPct, precioFinal: r.precioFinal,
        inicio: Timestamp.fromMillis(ms), fin: Timestamp.fromMillis(r.fin), meses: 12, estado: "emitido", datosColegio: legal, datosEmpresa: empresaAct, creadoPor: session.email, creadoEn: serverTimestamp(),
      });
      await logAudit("generar_contrato", colegio.id, session.email, { numero });
      imprimirHTML(r.html); ok(`Contrato ${numero} generado.`); await cargar(); return ref;
    } catch (e) { mal(e); }
  };
  const reimprimir = (c) => imprimirHTML(generarContratoHTML({ empresa: c.datosEmpresa || {}, colegio: c.datosColegio || {}, contrato: { numero: c.numero, plan: c.plan, precio: c.precioLista, descuentoPct: c.descuentoPct, inicio: aMs(c.inicio), meses: c.meses } }).html);
  const pagadoDe = (c) => resumenPagos(pagos.filter((p) => p.contratoId === c.id)).total;
  const firmar = async (c) => {
    const falta = [...faltantes(CAMPOS_EMPRESA, c.datosEmpresa || {}).map((x) => "Iskonex: " + x), ...faltantes(CAMPOS_COLEGIO, c.datosColegio || {}).map((x) => "Colegio: " + x)];
    if (falta.length) { mal("No se puede marcar como firmado: faltan datos (" + falta.join(", ") + "). Complétalos y genera el contrato de nuevo."); return; }
    if (!window.confirm(`¿Confirmas que el contrato ${c.numero} ya fue firmado por ambas partes?`)) return;
    try { await updateDoc(cdocRef("contratos", c.id), { estado: "firmado", firmadoEn: serverTimestamp(), firmadoPor: session.email }); await logAudit("firmar_contrato", colegio.id, session.email, { numero: c.numero }); ok("Contrato marcado como firmado."); await cargar(); } catch (e) { mal(e); }
  };
  const activar = async (c) => {
    const pagado = pagadoDe(c);
    if (pagado < c.precioFinal && !window.confirm(`El pago registrado para este contrato (${copTxt(pagado)}) es menor al valor (${copTxt(c.precioFinal)}). ¿Activar la licencia de todos modos?`)) return;
    try {
      const lic = { plan: c.plan, vence: aMs(c.fin), graciaDias: colegio.licencia?.graciaDias ?? 15, maxEstudiantes: c.maxEstudiantes, precio: c.precioFinal };
      await updateDoc(doc(db, "colegios", colegio.id), { licencia: { ...lic, vence: Timestamp.fromMillis(lic.vence) } });
      await addDoc(collection(db, "colegios", colegio.id, "historial"), { ...entradaHistorial({ accion: "contrato", licencia: lic, por: session.email, contratoId: c.id, descuentoPct: c.descuentoPct }), creadoEn: serverTimestamp() });
      await updateDoc(cdocRef("contratos", c.id), { estado: "activo", activadoEn: serverTimestamp() });
      await logAudit("activar_licencia", colegio.id, session.email, { numero: c.numero });
      ok(`Licencia activada hasta el ${fechaCorta(lic.vence)}.`); await cargar(); onCambio && onCambio();
    } catch (e) { mal(e); }
  };
  const registrarPago = async () => {
    const v = validarPago(fp);
    if (!v.ok) { setMsg("❌ " + v.errores[0]); return; }
    try {
      await addDoc(collection(db, "colegios", colegio.id, "pagos"), { valor: v.pago.valor, fecha: Timestamp.fromMillis(v.pago.fechaMs), medio: v.pago.medio, referencia: v.pago.referencia, factura: v.pago.factura, contratoId: v.pago.contratoId, nota: v.pago.nota, registradoPor: session.email, creadoEn: serverTimestamp() });
      await logAudit("registrar_pago", colegio.id, session.email, { valor: v.pago.valor });
      setFp({ ...fp, valor: "", referencia: "", factura: "", nota: "" }); ok("Pago registrado."); await cargar();
    } catch (e) { mal(e); }
  };

  const faltanLegal = faltantes(CAMPOS_COLEGIO, legal), faltanEmp = faltantes(CAMPOS_EMPRESA, empresa);
  const estadoTxt = { emitido: "Emitido", firmado: "Firmado", activo: "Activo" };
  const tabs = [["contratos", "📄 Contratos"], ["pagos", "💵 Pagos"], ["historial", "🕘 Historial"], ["legal", "🏫 Datos legales"]];
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, padding: 14, background: tint(C.rx, "08") }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>📋 Gestión · {colegio.nombre || colegio.id}</div>
        {tabs.map(([k, l]) => <Btn key={k} sm v={tab === k ? "pri" : "ghost"} onClick={() => { setTab(k); setMsg(""); }}>{l}</Btn>)}
        <Btn sm v="ghost" onClick={onCerrar}>✕</Btn>
      </div>
      {msg && <div style={{ fontSize: 12, marginBottom: 8 }}>{msg}</div>}
      {tab === "legal" && (<div>
        <div style={{ fontSize: 11, color: C.t2, marginBottom: 8 }}>Datos del colegio que aparecen en el contrato como «EL COLEGIO». Solo los ve el equipo de la plataforma.</div>
        <CamposForm campos={CAMPOS_COLEGIO} valores={legal} onChange={setLegal} />
        {faltanLegal.length > 0 && <div style={{ fontSize: 11, color: C.amber, marginTop: 8 }}>Pendiente: {faltanLegal.join(", ")}.</div>}
        <div style={{ marginTop: 10 }}><Btn v="pri" sm onClick={guardarLegal}>💾 Guardar datos legales</Btn></div>
      </div>)}
      {tab === "contratos" && (<div>
        {(faltanLegal.length > 0 || faltanEmp.length > 0) && <div style={{ fontSize: 11, color: C.amber, marginBottom: 8 }}>⚠ Faltan datos: {[...faltanEmp.map((x) => "Iskonex: " + x), ...faltanLegal.map((x) => "Colegio: " + x)].join("; ")}. El contrato sale como borrador y no se puede marcar como firmado.</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, alignItems: "end" }}>
          <Sel label="Plan" value={fc.plan} onChange={(v) => setFc({ ...fc, plan: v })} options={Object.keys(PLANES).map((k) => ({ v: k, l: etiquetaPlan(k) }))} />
          <Inp label="Descuento %" value={fc.descuento} onChange={(v) => setFc({ ...fc, descuento: v })} />
          <Inp label="Inicio de vigencia" type="date" value={fc.inicio} onChange={(v) => setFc({ ...fc, inicio: v })} />
        </div>
        <div style={{ fontSize: 12, margin: "8px 0" }}>Valor del contrato (12 meses): <b>{precioFinal ? copTxt(precioFinal) : "a convenir"}</b>{Number(fc.descuento) > 0 ? ` (lista ${copTxt(precioLista)})` : ""} + IVA</div>
        <Btn v="pri" sm onClick={generar}>📄 Generar e imprimir contrato</Btn>
        <div style={{ marginTop: 12 }}>
          {contratos.length === 0 && <div style={{ fontSize: 12, color: C.t3 }}>Todavía no hay contratos para este colegio.</div>}
          {contratos.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderTop: `1px solid ${C.border}`, fontSize: 12 }}>
              <div style={{ flex: 1, minWidth: 220 }}><b>{c.numero}</b> · {PLANES[c.plan]?.label || c.plan} · {copTxt(c.precioFinal)} <span style={{ color: C.t3 }}>· {fechaCorta(aMs(c.inicio))} → {fechaCorta(aMs(c.fin))}</span>
                <div style={{ fontSize: 11, color: C.t3 }}>Pagado: {copTxt(pagadoDe(c))} de {copTxt(c.precioFinal)} · texto v{c.version}</div></div>
              <Badge color={c.estado === "activo" ? C.ok : c.estado === "firmado" ? C.teal : C.amber}>{estadoTxt[c.estado] || c.estado}</Badge>
              <Btn sm v="ghost" onClick={() => reimprimir(c)}>🖨 Imprimir</Btn>
              {c.estado === "emitido" && <Btn sm v="teal" onClick={() => firmar(c)}>✍ Marcar firmado</Btn>}
              {c.estado === "firmado" && <Btn sm v="ok" onClick={() => activar(c)}>🔑 Activar licencia</Btn>}
            </div>))}
        </div>
      </div>)}
      {tab === "pagos" && (<div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, alignItems: "end" }}>
          <Inp label="Valor (COP) *" value={fp.valor} onChange={(v) => setFp({ ...fp, valor: v })} placeholder="1200000" />
          <Inp label="Fecha *" type="date" value={fp.fecha} onChange={(v) => setFp({ ...fp, fecha: v })} />
          <Sel label="Medio *" value={fp.medio} onChange={(v) => setFp({ ...fp, medio: v })} options={Object.entries(MEDIOS_PAGO).map(([v, l]) => ({ v, l }))} />
          <Inp label="Referencia / comprobante" value={fp.referencia} onChange={(v) => setFp({ ...fp, referencia: v })} />
          <Inp label="N.° de factura" value={fp.factura} onChange={(v) => setFp({ ...fp, factura: v })} />
          <Sel label="Contrato" value={fp.contratoId} onChange={(v) => setFp({ ...fp, contratoId: v })} options={[{ v: "", l: "— sin contrato —" }, ...contratos.map((c) => ({ v: c.id, l: c.numero }))]} />
        </div>
        <div style={{ marginTop: 8 }}><Btn v="pri" sm onClick={registrarPago}>＋ Registrar pago</Btn></div>
        <div style={{ marginTop: 12, fontSize: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Total pagado: {copTxt(resumenPagos(pagos).total)}</div>
          {pagos.length === 0 && <div style={{ color: C.t3 }}>Sin pagos registrados.</div>}
          {pagos.map((p) => <div key={p.id} style={{ padding: "6px 0", borderTop: `1px solid ${C.border}` }}><b>{copTxt(p.valor)}</b> · {fechaCorta(aMs(p.fecha))} · {MEDIOS_PAGO[p.medio] || p.medio}{p.factura ? ` · factura ${p.factura}` : ""}{p.referencia ? ` · ${p.referencia}` : ""}{p.contratoId ? ` · ${contratos.find((c) => c.id === p.contratoId)?.numero || ""}` : ""}<span style={{ color: C.t3 }}> · {p.registradoPor}</span></div>)}
        </div>
      </div>)}
      {tab === "historial" && (<div style={{ fontSize: 12 }}>
        {historial.length === 0 && <div style={{ color: C.t3 }}>Sin movimientos todavía. Cada renovación, cambio de plan o contrato activado queda aquí.</div>}
        {historial.map((h) => <div key={h.id} style={{ padding: "6px 0", borderTop: `1px solid ${C.border}` }}><b>{({ renovar_licencia: "Renovación", cambiar_plan: "Cambio de plan", contrato: "Contrato activado" })[h.accion] || h.accion}</b> · plan {PLANES[h.plan]?.label || h.plan || "—"} · {h.maxEstudiantes ? `hasta ${h.maxEstudiantes} est.` : "sin tope"} · {h.precio ? copTxt(h.precio) : "—"}{h.descuentoPct ? ` (−${h.descuentoPct}%)` : ""} · vence {fechaCorta(h.vence)}<span style={{ color: C.t3 }}> · {fechaCorta(aMs(h.creadoEn))} · {h.por}</span></div>)}
      </div>)}
    </div>
  );
}

// Panel del superadmin: vencimientos por avisar y precios de los planes.
function PanelSuper({ colegios, onGuardarPlanes, onRecordar, busy }) {
  const [abierto, setAbierto] = useState(null);
  const [form, setForm] = useState({});
  const avisar = porAvisar(colegios);
  const abrirPlanes = () => { setForm(Object.fromEntries(Object.keys(PLANES).map((k) => [k, { maxEstudiantes: String(PLANES[k].maxEstudiantes), precio: String(PLANES[k].precio) }]))); setAbierto(abierto === "planes" ? null : "planes"); };
  const v = validarPlanes(form);
  const f = (ms) => new Date(ms).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
  const colorFase = { por_vencer: C.amber, gracia: C.err, bloqueada: C.err };
  const textoFase = { por_vencer: "por vencer", gracia: "en gracia", bloqueada: "bloqueado" };
  return (
    <div style={{ marginBottom: 18, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: 12, alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>⚙ Plataforma</div>
        <Btn sm v="ghost" onClick={() => setAbierto(abierto === "venc" ? null : "venc")}>⏰ Vencimientos{avisar.length ? ` (${avisar.length})` : ""}</Btn>
        <Btn sm v="ghost" onClick={abrirPlanes}>💲 Planes y precios</Btn>
        <Btn sm v="ghost" onClick={() => setAbierto(abierto === "cartera" ? null : "cartera")}>💼 Cartera</Btn>
        <Btn sm v="ghost" onClick={() => setAbierto(abierto === "empresa" ? null : "empresa")}>🏢 Datos de Iskonex</Btn>
      </div>
      {abierto === "cartera" && <CarteraPanel colegios={colegios} />}
      {abierto === "empresa" && <EmpresaForm />}
      {abierto === "venc" && (
        <div style={{ padding: "0 12px 12px" }}>
          {avisar.length === 0 && <div style={{ fontSize: 12, color: C.t2 }}>Ningún colegio está por vencer. 🎉</div>}
          {avisar.map(({ c, est }) => (
            <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 0", borderTop: `1px solid ${C.border}`, fontSize: 12 }}>
              <div style={{ flex: 1 }}><b>{c.nombre || c.id}</b> <span style={{ color: colorFase[est.fase], fontWeight: 700 }}>· {textoFase[est.fase]}</span><div style={{ color: C.t3, fontSize: 11 }}>vence {f(est.vence)}</div></div>
              <Btn sm v="teal" disabled={busy} onClick={() => onRecordar(c, est)} title="Abre tu correo con el mensaje listo para el administrador del colegio">✉ Recordatorio</Btn>
            </div>
          ))}
          <div style={{ fontSize: 10, color: C.t3, marginTop: 6 }}>El envío automático de correos necesita el plan Blaze de Firebase; mientras tanto, el recordatorio se abre en tu correo ya redactado.</div>
        </div>
      )}
      {abierto === "planes" && (
        <div style={{ padding: "0 12px 12px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.t2, margin: "10px 0" }}>Los cambios valen para los colegios que elijas o renueves desde ahora. Los que ya tienen plan conservan su tope y costo hasta que les vuelvas a asignar el plan. 0 estudiantes = sin tope.</div>
          {Object.keys(PLANES).map((k) => (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr", gap: 8, alignItems: "end", marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, paddingBottom: 8 }}>{PLANES[k].label}</div>
              <Inp label="Máx. estudiantes" value={form[k]?.maxEstudiantes ?? ""} onChange={(x) => setForm({ ...form, [k]: { ...form[k], maxEstudiantes: x } })} />
              <Inp label="Precio anual (COP)" value={form[k]?.precio ?? ""} onChange={(x) => setForm({ ...form, [k]: { ...form[k], precio: x } })} />
            </div>
          ))}
          {!v.ok && <div style={{ fontSize: 11, color: C.err, marginBottom: 6 }}>{v.errores[0]}</div>}
          <Btn v="pri" sm disabled={busy || !v.ok} onClick={async () => { if (await onGuardarPlanes(v.planes)) setAbierto(null); }}>💾 Guardar planes</Btn>
        </div>
      )}
    </div>
  );
}

function SchoolPicker({ session, colegios, supers, onPick, onCreate, onMigrate, onLogout, onSuspend, onRenew, onPlan, onGuardarPlanes, onRecordar, onRefrescar, onExport, onDelete, onAddSuper, onToggleSuper, busy, msg }) {
  const [nombre, setNombre] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [planNuevo, setPlanNuevo] = useState("piloto");
  const [legalNuevo, setLegalNuevo] = useState({});
  const [gestionando, setGestionando] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [typed, setTyped] = useState("");
  const [exported, setExported] = useState(false);
  const [newSuper, setNewSuper] = useState("");
  const isSuper = session.isSuper;
  const hasLegacy = colegios.some((c) => c.id === LEGACY_COLEGIO_ID);
  const suspended = (c) => c.estado === "suspendido";
  const licDe = (c) => estadoLicencia(c.licencia);
  const sinLic = (c) => !isSuper && !licDe(c).puedeLeer;
  const etiquetaLic = (c) => { const e = licDe(c); const f = (ms) => new Date(ms).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }); if (e.fase === "sin_licencia") return null; const plan = PLANES[c.licencia?.plan]?.label || "—"; return { texto: `${plan} · ${e.fase === "bloqueada" ? "vencida" : e.fase === "gracia" ? "en gracia" : "vence"} ${f(e.vence)}`, color: e.fase === "vigente" ? C.t3 : e.fase === "por_vencer" ? C.amber : C.err }; };
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif", display: "flex", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 620, margin: "auto 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <Logo size="md" />
          <div style={{ display: "flex", gap: 8 }}><BtnSoporte /><Btn sm v="ghost" onClick={onLogout}>Salir</Btn></div>
        </div>
        {isSuper && <PanelSuper colegios={colegios} onGuardarPlanes={onGuardarPlanes} onRecordar={onRecordar} busy={busy} />}
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Elige tu colegio</div>
        <div style={{ fontSize: 12, color: C.t2, marginBottom: 16 }}>{session.email}{isSuper ? " · Superadmin" : ""}</div>
        {msg && <div style={{ padding: "9px 14px", borderRadius: 8, marginBottom: 14, fontSize: 12, background: C.surface, border: `1px solid ${C.border}` }}>{msg}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {colegios.length === 0 && <div style={{ fontSize: 13, color: C.t2 }}>{isSuper ? "Todavía no hay colegios. Crea el primero o importa los datos existentes." : "Tu correo no pertenece a ningún colegio activo."}</div>}
          {colegios.map((c) => {
            const blocked = (suspended(c) || sinLic(c)) && !isSuper;
            return (
              <div key={c.id} style={{ borderRadius: 10, border: `1px solid ${suspended(c) ? tint(C.amber, "80") : C.border}`, background: C.surface, overflow: "hidden" }}>
                <button disabled={blocked} onClick={() => onPick(c.id)} style={{ width: "100%", textAlign: "left", padding: "12px 14px", border: "none", background: "transparent", color: C.text, cursor: blocked ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: blocked ? 0.6 : 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{c.nombre || c.id} {suspended(c) && <span style={{ fontSize: 10, color: C.amber, fontWeight: 700 }}>· {etiquetaEstado(c.estado).toUpperCase()}</span>}</div>
                  <div style={{ fontSize: 11, color: C.t3 }}>{c.id}{c.role ? ` · ${ROLES[c.role]?.label || c.role}` : ""}</div>
                  {etiquetaLic(c) && <div style={{ fontSize: 11, color: etiquetaLic(c).color, marginTop: 2 }}>🔑 {etiquetaLic(c).texto}</div>}
                  {blocked && <div style={{ fontSize: 11, color: C.amber, marginTop: 4 }}>{sinLic(c) ? "Licencia vencida. Comunícate con Iskonex para renovarla." : "Acceso suspendido. Comunícate con el administrador de la plataforma."}</div>}
                </button>
                {isSuper && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 14px 12px" }}>
                    <Btn sm v="ghost" disabled={busy} onClick={() => onExport(c)}>⬇ Exportar</Btn>
                    <Btn sm v="ghost" onClick={() => setGestionando(gestionando === c.id ? null : c.id)}>📋 Gestión</Btn>
                    <Btn sm v="teal" disabled={busy} onClick={() => onRenew(c)} title="Suma 12 meses a la licencia (si ya venció, cuenta desde hoy)">🔑 Renovar 12 meses</Btn>
                    <select disabled={busy} value={c.licencia?.plan || ""} onChange={(e) => e.target.value && onPlan(c, e.target.value)} title="Al elegir un plan se ajustan solos el máximo de estudiantes y el costo" style={{ padding: "5px 8px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12, fontFamily: "inherit" }}>
                      <option value="">Elegir plan…</option>
                      {Object.keys(PLANES).map((k) => <option key={k} value={k}>{etiquetaPlan(k)}</option>)}
                    </select>
                    <Btn sm v="ghost" disabled={busy} onClick={() => onSuspend(c)}>{suspended(c) ? "▶ Reactivar" : "⏸ Suspender"}</Btn>
                    <Btn sm v="dan" disabled={busy} onClick={() => { setDeleting(deleting === c.id ? null : c.id); setTyped(""); setExported(false); }}>🗑 Eliminar</Btn>
                  </div>
                )}
                {isSuper && gestionando === c.id && <GestionColegio colegio={c} session={session} onCerrar={() => setGestionando(null)} onCambio={onRefrescar} />}
                {isSuper && deleting === c.id && (
                  <div style={{ padding: "10px 14px 14px", borderTop: `1px solid ${C.border}`, background: tint(C.err, "10") }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.err, marginBottom: 6 }}>Eliminar «{c.nombre || c.id}» para siempre</div>
                    <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.5, marginBottom: 8 }}>Borra estudiantes, grupos, encuestas, respuestas, usuarios y ajustes de este colegio. No se puede deshacer. Si el colegio terminó su contrato, entrégale antes su exportación.</div>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, color: C.t2, marginBottom: 8 }}>
                      <input type="checkbox" checked={exported} onChange={(e) => setExported(e.target.checked)} /> Ya descargué la exportación de este colegio
                    </label>
                    <Inp label={`Escribe «${c.id}» para confirmar`} value={typed} onChange={setTyped} placeholder={c.id} />
                    <Btn v="dan" disabled={busy || !exported || !confirmaEliminar(c.id, typed)} onClick={async () => { const ok = await onDelete(c); if (ok) { setDeleting(null); setTyped(""); } }} style={{ width: "100%", justifyContent: "center", marginTop: 10 }}>{busy ? "Eliminando..." : "Eliminar definitivamente"}</Btn>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {isSuper && (
          <>
            <Card glow={C.violet}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: C.violet }}>➕ Crear colegio</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <Inp label="Nombre del colegio" value={nombre} onChange={setNombre} placeholder="Colegio San José" />
                <Inp label="Ciudad" value={ciudad} onChange={setCiudad} placeholder="Ciudad" />
                <Inp label="Correo del administrador del colegio (opcional)" value={adminEmail} onChange={setAdminEmail} placeholder="admin@colegio.edu.co" />
                <details style={{ fontSize: 12 }}>
                  <summary style={{ cursor: "pointer", color: C.t2 }}>Datos legales para el contrato (se pueden completar después)</summary>
                  <div style={{ marginTop: 8 }}><CamposForm campos={CAMPOS_COLEGIO.filter(([k]) => k !== "ciudad")} valores={legalNuevo} onChange={setLegalNuevo} /></div>
                </details>
                <Sel label="Plan (define el máximo de estudiantes y el costo)" value={planNuevo} onChange={setPlanNuevo} options={Object.keys(PLANES).map((k) => ({ v: k, l: etiquetaPlan(k) }))} />
              </div>
              <Btn v="sec" disabled={busy || !slugify(nombre)} onClick={async () => { const ok = await onCreate({ nombre: nombre.trim(), ciudad: ciudad.trim(), adminEmail: adminEmail.trim().toLowerCase(), plan: planNuevo, legal: { ...legalNuevo, ciudad: ciudad.trim() } }); if (ok) { setNombre(""); setCiudad(""); setAdminEmail(""); setLegalNuevo({}); } }} style={{ width: "100%", justifyContent: "center", marginTop: 12 }}>✓ Crear colegio</Btn>
            </Card>
            <Card style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>👑 Superadmins de la plataforma</div>
              <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.5, marginBottom: 10 }}>Cuentas de la empresa con acceso a todos los colegios. Usa correos corporativos con verificación en dos pasos activada en Google. {session.isRoot ? "Solo la cuenta raíz puede agregarlas o desactivarlas." : "Solo la cuenta raíz puede modificar esta lista."}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between" }}><span>{ROOT_EMAIL}</span><span style={{ color: C.t3, fontSize: 11 }}>raíz</span></div>
                {supers.map((u) => (
                  <div key={u.email} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", opacity: u.activo ? 1 : 0.5 }}>
                    <span>{u.email}</span>
                    {session.isRoot ? <Btn sm v="ghost" onClick={() => onToggleSuper(u)}>{u.activo ? "Desactivar" : "Activar"}</Btn> : <span style={{ color: C.t3, fontSize: 11 }}>{u.activo ? "activo" : "inactivo"}</span>}
                  </div>
                ))}
              </div>
              {session.isRoot && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}><Inp label="Agregar superadmin" value={newSuper} onChange={setNewSuper} placeholder="nombre@iskonex.co" /></div>
                  <Btn v="sec" disabled={busy || !newSuper.includes("@")} onClick={async () => { if (await onAddSuper(newSuper.trim().toLowerCase())) setNewSuper(""); }}>Agregar</Btn>
                </div>
              )}
            </Card>
            <Card style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📦 Importar datos existentes</div>
              <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.5, marginBottom: 10 }}>
                Copia los estudiantes, grupos, encuestas, respuestas, actividad, ajustes y usuarios que ya tenías al colegio «{LEGACY_COLEGIO_ID}». <b>No borra nada</b> de lo anterior y se puede repetir sin duplicar datos.
              </div>
              <Btn v="sec" disabled={busy} onClick={() => { if (window.confirm(hasLegacy ? "Ya existe el colegio inicial. ¿Volver a copiar los datos existentes? (no duplica ni borra)" : "¿Copiar los datos existentes al colegio inicial? No se borra nada.")) onMigrate(); }} style={{ width: "100%", justifyContent: "center" }}>{busy ? "Trabajando..." : "📦 Importar datos existentes"}</Btn>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  // ── Detectar encuesta pública PRIMERO con estado (no early return antes de hooks) ──
  // ?c=COLEGIO&survey=ID (sin c → colegio inicial, para los enlaces anteriores)
  const [publicSurvey] = useState(() => (new URLSearchParams(window.location.search).has("survey") ? (parsePublicSurveyUrl(window.location.search) || { invalid: true }) : null));

  // ── TEMA ──────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("rednexo-theme");
    return saved ? saved === "dark" : true;
  });

  useEffect(() => {
    if (isDark) { document.documentElement.classList.remove("light"); localStorage.setItem("rednexo-theme", "dark"); }
    else { document.documentElement.classList.add("light"); localStorage.setItem("rednexo-theme", "light"); }
  }, [isDark]);

  // session: quién es (Google) y a qué colegios pertenece. user: sesión + colegio elegido + rol en ese colegio.
  const [session, setSession] = useState(null);
  const [colegios, setColegios] = useState([]);
  const [colegioId, setColegioId] = useState(null);
  const [licencia, setLicencia] = useState(null);
  const [supers, setSupers] = useState([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerMsg, setPickerMsg] = useState("");
  const [school, setSchool] = useState({ nombre: "", logo: "", loaded: false });
  const current = colegios.find((c) => c.id === colegioId);
  const userRole = session ? (session.isSuper ? "superadmin" : current?.role) : null;
  const user = useMemo(() => (session && colegioId && userRole ? { role: userRole, email: session.email, name: session.name, photo: session.photo } : null), [session, colegioId, userRole]);
  setCurrentColegio(colegioId);
  const [authView, setAuthView] = useState("login");
  const [tab, setTab] = useState("dashboard");
  const [filter, setFilter] = useState("all");
  const [selNode, setSelNode] = useState(null);
  const [responsesRaw, setResponsesRaw] = useState([]);   // todas las respuestas del colegio
  const [surveyFilter, setSurveyFilter] = useState("all"); // qué encuesta alimenta el análisis (todas o una)
  const [rankMode, setRankMode] = useState("pos");        // ranking del dashboard: "pos" = más aceptados, "neg" = más rechazados
  const [rankAll, setRankAll] = useState(false);
  const [expandedNode, setExpandedNode] = useState(null); // nodo cuyo detalle de conexiones está desplegado completo
  const [students, setStudents] = useState(IS_DEMO ? initStudents : []);
  const [groups, setGroups] = useState(
    IS_DEMO ? DEFAULT_GROUPS.map((n, i) => ({ id: "g" + (i + 1), name: n, color: GROUP_COLORS[i] })) : []
  );
  const [conns, setConns] = useState(IS_DEMO ? initConns : []);
  const [surveys, setSurveys] = useState([]);
  const dynGROUPS = groups.map((g) => g.name);
  const dynGC = Object.fromEntries(groups.map((g) => [g.name, g.color]));
  GROUPS = dynGROUPS;
  GC = dynGC;
  const [visibleGroups, setVisibleGroups] = useState(IS_DEMO ? DEFAULT_GROUPS.slice() : []);
  const toggleGroup = (g) => setVisibleGroups((p) => p.includes(g) ? (p.length > 1 ? p.filter((x) => x !== g) : p) : [...p, g]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(ccol("groups"), (snap) => { const data = snap.docs.map((d) => d.data()); if (data.length > 0 || !IS_DEMO) { setGroups(data); setVisibleGroups(data.map((g) => g.name)); } if (!snap.metadata.fromCache || data.length > 0) setGroupsLoaded(true); }, (err) => console.log("Grupos offline"));
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(ccol("students"), (snap) => { const data = snap.docs.map((d) => d.data()); if (data.length > 0 || !IS_DEMO) setStudents(data); if (!snap.metadata.fromCache || data.length > 0) setStudentsLoaded(true); }, (err) => console.log("Estudiantes offline"));
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(ccol("surveys"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => { setSurveys(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); }, () => {});
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(ccol("responses"), (snap) => setResponsesRaw(snap.docs.map((d) => d.data())), () => setResponsesRaw([]));
    return () => unsub();
  }, [user]);

  // Las conexiones del sociograma, la matriz y los reportes salen de las respuestas de TODAS las encuestas o de una sola.
  const activeFilter = surveyFilter !== "all" && surveys.some((sv) => sv.id === surveyFilter && !sv.deleted) ? surveyFilter : "all";
  // Las encuestas en la papelera (o ya eliminadas) no cuentan: sus respuestas no entran al mapa ni a los reportes.
  const responsesVivas = useMemo(() => { const ok = new Set(surveys.filter((sv) => !sv.deleted).map((sv) => sv.id)); return responsesRaw.filter((r) => ok.has(r.surveyId)); }, [responsesRaw, surveys]);
  useEffect(() => {
    const rs = activeFilter === "all" ? responsesVivas : responsesVivas.filter((r) => r.surveyId === activeFilter);
    const built = buildConnections(rs, surveys);
    setConns(built.length > 0 || !IS_DEMO ? built : initConns);
  }, [responsesVivas, surveys, activeFilter]);

  // Al cambiar de colegio no deben quedar datos del anterior en pantalla.
  useEffect(() => {
    setStudents(IS_DEMO ? initStudents : []); setGroups([]); setConns(IS_DEMO ? initConns : []); setSurveys([]); setResponsesRaw([]); setSurveyFilter("all"); setTab("dashboard"); setGroupsLoaded(false); setStudentsLoaded(false);
    setSchool({ nombre: "", logo: "", loaded: false }); SCHOOL = { nombre: "", logo: "" };
  }, [colegioId]);

  // Grupos que ya usan estudiantes pero no tienen documento propio (p. ej. creados con una versión anterior): se guardan una vez.
  // Solo cuando ya cargaron grupos Y estudiantes; el id sale del nombre, así que dos sesiones a la vez no duplican.
  useEffect(() => {
    if (!user || user.role === "readonly" || IS_DEMO || !groupsLoaded || !studentsLoaded) return;
    missingGroups(groups, students).forEach((name, i) => {
      setDoc(cdoc("groups", groupIdFor(name)), { id: groupIdFor(name), name, color: GROUP_COLORS[(groups.length + i) % GROUP_COLORS.length] }).catch((e) => console.log("No se pudo guardar el grupo", name, e));
    });
  }, [user, groups, students, groupsLoaded, studentsLoaded]);

  // Ingreso al colegio: una sola entrada por sesión del navegador (no una por cada recarga).
  useEffect(() => {
    if (!user || !colegioId || user.role === "readonly") return;   // solo lectura no puede escribir en la bitácora
    const key = `rn_ingreso_${colegioId}_${user.email}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch (e) {}
    logActivity("user", "ingresó a RedNexo", "");
  }, [user, colegioId]);

  // Nombre y logo del colegio actual (para la cabecera y para copiarlos a las encuestas activas).
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(cdoc("settings", "global"), (snap) => {
      const d = snap.exists() ? snap.data() : {};
      const nombre = d.colegio || current?.nombre || "";
      SCHOOL = { nombre, logo: d.logo || "" };
      setSchool({ nombre, logo: d.logo || "", loaded: true });
    }, (err) => setSchool((p) => ({ ...p, loaded: true, blocked: err?.code === "permission-denied" })));
    const unsubLic = onSnapshot(doc(db, "colegios", colegioId), (snap) => setLicencia(snap.exists() ? snap.data().licencia || null : null), () => {});
    return () => { unsub(); unsubLic(); setLicencia(null); };
  }, [user]);

  // Mantiene al día lo que la encuesta pública necesita (sin que nadie tenga que acordarse):
  //  · encuestas con `group` y `groups` contradictorios (por el selector antiguo) se corrigen;
  //  · en las activas, la lista de nombres y la marca del colegio se renuevan si faltan o si cambiaron los estudiantes del grupo.
  useEffect(() => {
    if (!user || user.role === "readonly" || !school.loaded || !studentsLoaded) return;
    surveys.filter((sv) => !sv.deleted).forEach((sv) => {
      const fix = needsGroupFix(sv) ? { groups: [sv.group] } : {};
      const base = { ...sv, ...fix };
      const activa = sv.status === "active";
      const refrescar = activa && (!Array.isArray(sv.rosterIds) || sv.colegioNombre === undefined || rosterIsStale(base, students));
      if (!Object.keys(fix).length && !refrescar) return;
      updateDoc(cdoc("surveys", sv.id), { ...fix, ...(refrescar ? publicSurveyInfo(base, students) : {}) }).catch(() => {});
    });
  }, [user, surveys, students, school.loaded, studentsLoaded]);

  const saveGroup = async (g) => { setGroups((p) => { const ex = p.find((x) => x.id === g.id); return ex ? p.map((x) => (x.id === g.id ? g : x)) : [...p, g]; }); try { await setDoc(cdoc("groups", g.id), g); } catch (e) { console.log(e); } };
  const deleteGroup = async (id) => { setGroups((p) => p.filter((x) => x.id !== id)); try { await deleteDoc(cdoc("groups", id)); } catch (e) { console.log(e); } };
  const saveStudent = async (s) => { const sid = s.id.toString(); setStudents((p) => { const ex = p.find((x) => x.id === s.id); return ex ? p.map((x) => (x.id === s.id ? s : x)) : [...p, s]; }); try { await setDoc(cdoc("students", sid), { ...s, id: sid }); } catch (e) { console.log(e); } };
  const deleteStudent = async (id) => { setStudents((p) => p.filter((x) => x.id !== id)); try { await deleteDoc(cdoc("students", id.toString())); } catch (e) { console.log(e); } };
  const authorizeUser = async (email, role = "psychologist") => {
    try {
      const ref = cdoc("miembros", email.toLowerCase());
      const existe = (await getDoc(ref)).exists();
      // Si ya existe se conserva su fecha de alta; el rol anterior (de una revocación) deja de tener sentido.
      await setDoc(ref, { email: email.toLowerCase(), role, status: "active", rolAnterior: deleteField(), ...(existe ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
      logActivity("user", `autorizó el acceso (${ROLES[role]?.label || role})`, email.toLowerCase());
      return true;
    } catch (e) { return false; }
  };
  const revokeUser = async (u) => { try { await updateDoc(cdoc("miembros", u.email.toLowerCase()), revokePatch(u)); logActivity("user", "revocó el acceso", u.email.toLowerCase()); return true; } catch (e) { return false; } };
  const reactivateUser = async (email, role) => { try { await updateDoc(cdoc("miembros", email.toLowerCase()), { status: "active", role, rolAnterior: deleteField() }); logActivity("user", `reactivó el acceso (${ROLE_NAMES[role]})`, email.toLowerCase()); return true; } catch (e) { return false; } };
  const deleteUser = async (email) => { try { await deleteDoc(cdoc("miembros", email.toLowerCase())); logActivity("user", "eliminó al usuario", email.toLowerCase()); return true; } catch (e) { return false; } };
  const saveStudentFS = async (s) => { try { await setDoc(cdoc("students", String(s.id)), { ...s, id: String(s.id) }); return true; } catch (e) { console.error("No se guardó el estudiante", e); return false; } };
  const deleteStudentFS = async (id) => { try { await deleteDoc(cdoc("students", String(id))); } catch (e) {} };
  const saveGroupFS = async (g) => { try { await setDoc(cdoc("groups", g.id), g); return true; } catch (e) { console.error("No se guardó el grupo", e); return false; } };
  const deleteGroupFS = async (id) => { try { await deleteDoc(cdoc("groups", id)); } catch (e) {} };

  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Quién es la persona y a qué colegios pertenece. Las reglas de Firestore validan todo esto de nuevo en el servidor.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { setSession(null); setColegios([]); setColegioId(null); setAuthLoading(false); return; }
      const email = fbUser.email.toLowerCase().trim();
      const isRoot = email === ROOT_EMAIL;
      let isSuper = isRoot;
      if (!isSuper) { try { const sd = await getDoc(doc(db, "superadmins", email)); isSuper = sd.exists() && sd.data().activo === true; } catch (e) {} }
      const deny = async (msg) => { await logout(); setLoginError(msg); setSession(null); setColegios([]); setColegioId(null); };
      try {
        try { const pl = await getDoc(doc(db, "plataforma", "planes")); aplicarPlanes(pl.exists() ? pl.data() : {}); } catch (e) {}
        let list;
        if (isSuper) {
          const snap = await getDocs(collection(db, "colegios"));
          list = snap.docs.map((d) => ({ id: d.id, nombre: d.data().nombre || d.id, estado: d.data().estado || "activo", licencia: d.data().licencia || null }));
          try { setSupers((await getDocs(collection(db, "superadmins"))).docs.map((d) => ({ email: d.id, activo: d.data().activo === true }))); } catch (e) {}
        } else {
          const snap = await getDocs(query(collectionGroup(db, "miembros"), where("email", "==", email)));
          const mine = snap.docs.map((d) => ({ id: d.ref.parent.parent.id, ...d.data() }));
          const act = mine.filter((m) => m.status === "active" && ["admin", "psychologist", "readonly"].includes(m.role));
          if (mine.length > 0 && act.length === 0) { await deny(mine.some((m) => m.status === "pending") ? "Tu cuenta está pendiente de aprobación." : "Tu acceso fue revocado."); setAuthLoading(false); return; }
          list = await Promise.all(act.map(async (m) => { let nombre = m.id, estado = "activo", licencia = null; try { const c = await getDoc(doc(db, "colegios", m.id)); if (c.exists()) { nombre = c.data().nombre || m.id; estado = c.data().estado || "activo"; licencia = c.data().licencia || null; } } catch (e) {} return { id: m.id, nombre, estado, licencia, role: m.role }; }));
          if (list.length === 0) { await deny("Tu correo no está autorizado en ningún colegio. Solicita acceso al administrador."); setAuthLoading(false); return; }
        }
        setColegios(list);
        SESSION_EMAIL = email; SESSION_NAME = fbUser.displayName || email;
        setSession({ email, isSuper, isRoot, name: fbUser.displayName || email, photo: fbUser.photoURL });
        let last = null; try { last = localStorage.getItem("rn_colegio"); } catch (e) {}
        const usable = list.filter((c) => isSuper || (c.estado !== "suspendido" && estadoLicencia(c.licencia).puedeLeer));
        const pick = list.length === 1 && usable.length === 1 ? list[0].id : (usable.find((c) => c.id === last)?.id || null);
        setColegioId(pick);
      } catch (e) { await deny("No se pudo verificar tu acceso. Intenta de nuevo."); }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const chooseColegio = (id) => {
    try { if (id) localStorage.setItem("rn_colegio", id); } catch (e) {}
    // Cuando alguien de la plataforma entra a un colegio del que no es miembro, queda registrado (acceso de soporte).
    if (id && session?.isSuper && !(colegios.find((c) => c.id === id)?.role)) logAudit("acceso_soporte", id, session.email);
    setColegioId(id);
  };
  const doLogout = () => { logout(); setSession(null); setColegios([]); setColegioId(null); };

  const reloadColegios = async () => {
    const snap = await getDocs(collection(db, "colegios"));
    setColegios(snap.docs.map((d) => ({ id: d.id, nombre: d.data().nombre || d.id, estado: d.data().estado || "activo", licencia: d.data().licencia || null })));
  };
  const reloadSupers = async () => { try { setSupers((await getDocs(collection(db, "superadmins"))).docs.map((d) => ({ email: d.id, activo: d.data().activo === true }))); } catch (e) {} };

  const suspendColegio = async (c) => {
    const suspender = c.estado !== "suspendido";
    if (!window.confirm(suspender ? `¿Suspender «${c.nombre}»? Sus usuarios y su encuesta pública dejarán de funcionar. Los datos se conservan.` : `¿Reactivar «${c.nombre}»?`)) return;
    setPickerBusy(true); setPickerMsg("");
    try {
      await updateDoc(doc(db, "colegios", c.id), { estado: suspender ? "suspendido" : "activo", estadoCambiado: serverTimestamp(), estadoPor: session.email });
      await logAudit(suspender ? "suspender" : "reactivar", c.id, session.email);
      await reloadColegios();
      setPickerMsg(suspender ? `⏸ «${c.nombre}» suspendido.` : `▶ «${c.nombre}» reactivado.`);
    } catch (e) { setPickerMsg("❌ No se pudo cambiar el estado: " + e.message); }
    setPickerBusy(false);
  };
  const guardarLicencia = async (c, lic, accion, texto) => {
    setPickerBusy(true); setPickerMsg("");
    try {
      await updateDoc(doc(db, "colegios", c.id), { licencia: { ...lic, vence: Timestamp.fromMillis(aMs(lic.vence)) } });  // las reglas comparan con request.time: debe ser Timestamp
      await addDoc(collection(db, "colegios", c.id, "historial"), { ...entradaHistorial({ accion, licencia: lic, por: session.email }), creadoEn: serverTimestamp() });
      await logAudit(accion, c.id, session.email);
      await reloadColegios();
      setPickerMsg(texto);
    } catch (e) { setPickerMsg("❌ No se pudo actualizar la licencia: " + e.message); }
    setPickerBusy(false);
  };
  const renovarColegio = async (c) => {
    const nueva = c.licencia ? renovar(c.licencia, 12) : licenciaNueva("basico");
    const f = new Date(nueva.vence).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
    if (!window.confirm(`¿Renovar «${c.nombre}» hasta el ${f}?`)) return;
    await guardarLicencia(c, nueva, "renovar_licencia", `🔑 «${c.nombre}» renovado hasta el ${f}.`);
  };
  const cambiarPlan = async (c, clave) => {
    if (!PLANES[clave]) return;
    const nueva = aplicarPlan(c.licencia, clave);
    if (!window.confirm(`¿Cambiar «${c.nombre}» al plan ${etiquetaPlan(clave)}?`)) { await reloadColegios(); return; }
    await guardarLicencia(c, nueva, "cambiar_plan", `🔑 «${c.nombre}» ahora tiene el plan ${etiquetaPlan(clave)}.`);
  };
  const guardarPlanes = async (planes) => {
    setPickerBusy(true); setPickerMsg("");
    try {
      await setDoc(doc(db, "plataforma", "planes"), planes);
      aplicarPlanes(planes);
      await logAudit("editar_planes", "plataforma", session.email);
      setPickerMsg("✅ Planes y precios guardados.");
      setPickerBusy(false); return true;
    } catch (e) { setPickerMsg("❌ No se pudieron guardar los planes: " + e.message); setPickerBusy(false); return false; }
  };
  // Abre el correo del administrador del colegio con el recordatorio ya redactado.
  const recordarColegio = async (c, est) => {
    let correos = [];
    try { correos = (await getDocs(collection(db, "colegios", c.id, "miembros"))).docs.map((d) => d.data()).filter((m) => m.role === "admin" && m.status === "active").map((m) => m.email); } catch (e) {}
    const { asunto, cuerpo } = recordatorio(c.nombre || c.id, est);
    window.location.href = `mailto:${correos.join(",")}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
    if (!correos.length) setPickerMsg("⚠ Este colegio no tiene un administrador activo: escribe el destinatario a mano.");
  };
  const exportFromPicker = async (c) => {
    setPickerBusy(true); setPickerMsg("Exportando...");
    try { const n = await exportColegio(c, session.email); setPickerMsg(`✅ Exportación descargada: ${n.students} estudiantes, ${n.groups} grupos, ${n.surveys} encuestas, ${n.responses} respuestas, ${n.miembros} usuarios.`); }
    catch (e) { setPickerMsg("❌ No se pudo exportar: " + e.message); }
    setPickerBusy(false);
  };
  const deleteFromPicker = async (c) => {
    setPickerBusy(true); setPickerMsg("Eliminando...");
    try {
      const n = await eliminarColegio(c.id, session.email, (k) => setPickerMsg(`Eliminando... ${k} documentos`));
      try { if (localStorage.getItem("rn_colegio") === c.id) localStorage.removeItem("rn_colegio"); } catch (e) {}
      await reloadColegios(); setPickerMsg(`🗑 «${c.nombre}» eliminado (${n} documentos). Queda constancia en la bitácora.`);
      setPickerBusy(false); return true;
    } catch (e) { setPickerMsg("❌ La eliminación se detuvo: " + e.message + ". Es seguro repetirla."); setPickerBusy(false); return false; }
  };
  const addSuper = async (email) => {
    setPickerBusy(true); setPickerMsg("");
    try { await setDoc(doc(db, "superadmins", email), { email, activo: true, creadoPor: session.email, creadoEn: serverTimestamp() }); await logAudit("superadmin_agregar", "-", session.email, { objetivo: email }); await reloadSupers(); setPickerMsg(`✅ ${email} ahora es superadmin.`); setPickerBusy(false); return true; }
    catch (e) { setPickerMsg("❌ No se pudo agregar: " + e.message); setPickerBusy(false); return false; }
  };
  const toggleSuper = async (u) => {
    setPickerBusy(true); setPickerMsg("");
    try { await updateDoc(doc(db, "superadmins", u.email), { activo: !u.activo }); await logAudit(u.activo ? "superadmin_desactivar" : "superadmin_activar", "-", session.email, { objetivo: u.email }); await reloadSupers(); }
    catch (e) { setPickerMsg("❌ No se pudo cambiar: " + e.message); }
    setPickerBusy(false);
  };

  const createColegio = async ({ nombre, ciudad, adminEmail, plan = "piloto", legal = {} }) => {
    const id = slugify(nombre);
    if (!id) return false;
    setPickerBusy(true); setPickerMsg("");
    try {
      if ((await getDoc(doc(db, "colegios", id))).exists()) { setPickerMsg("❌ Ya existe un colegio con ese nombre."); setPickerBusy(false); return false; }
      const batch = writeBatch(db);
      const lic0 = licenciaNueva(plan);
      batch.set(doc(db, "colegios", id), { nombre, ciudad, createdAt: serverTimestamp(), licencia: { ...lic0, vence: Timestamp.fromMillis(lic0.vence) } });
      batch.set(doc(db, "colegios", id, "settings", "global"), { colegio: nombre, ciudad, periodo: "", dominio: "all", registro: "no", notifEncuesta: "yes", notifResultados: "psy", logo: "", idioma: "es" });
      if (Object.values(legal).some((x) => String(x || "").trim())) batch.set(doc(db, "colegios", id, "legal", "datos"), legal);
      if (adminEmail.includes("@")) batch.set(doc(db, "colegios", id, "miembros", adminEmail), { email: adminEmail, role: "admin", status: "active", createdAt: serverTimestamp() });
      await batch.commit();
      await logAudit("crear", id, session.email);
      await reloadColegios();
      setPickerMsg(`✅ Colegio «${nombre}» creado.`);
      setPickerBusy(false); return true;
    } catch (e) { setPickerMsg("❌ No se pudo crear el colegio: " + e.message); setPickerBusy(false); return false; }
  };

  // Copia (sin borrar nada) las colecciones globales anteriores al colegio inicial.
  const migrateLegacy = async () => {
    setPickerBusy(true); setPickerMsg("Leyendo datos existentes...");
    try {
      const read = async (name) => (await getDocs(collection(db, name))).docs.map((d) => ({ id: d.id, ...d.data() }));
      const [students, groups, surveys, responses, activity, users, settingsSnap] = await Promise.all(["students", "groups", "surveys", "responses", "activity", "users"].map(read).concat([getDoc(doc(db, "settings", "global"))]));
      const legacy = { students, groups, surveys, responses, activity, users, settings: settingsSnap.exists() ? settingsSnap.data() : null };
      const ops = planMigration(legacy, LEGACY_COLEGIO_ID, buildRoster);
      let done = 0; const skipped = [];
      for (const part of chunk(ops)) {
        try {
          const batch = writeBatch(db);
          part.forEach((o) => batch.set(doc(db, o.path), o.data));
          await batch.commit();
        } catch (e) {
          // Un documento con formato antiguo no debe frenar a los demás: se reintenta uno por uno y se informa cuáles no se copiaron.
          for (const o of part) { try { await setDoc(doc(db, o.path), o.data); } catch (e2) { skipped.push(o.path); } }
        }
        done += part.length; setPickerMsg(`Copiando... ${done}/${ops.length}`);
      }
      await reloadColegios();
      setPickerMsg(`✅ Listo: ${students.length} estudiantes, ${groups.length} grupos, ${surveys.length} encuestas, ${responses.length} respuestas, ${users.length} usuarios copiados al colegio «${LEGACY_COLEGIO_ID}». Lo anterior no se tocó.` + (skipped.length ? ` ⚠ ${skipped.length} documento(s) no se pudieron copiar: ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "…" : ""}` : ""));
    } catch (e) { setPickerMsg("❌ La importación se detuvo: " + e.message + ". Es seguro repetirla."); }
    setPickerBusy(false);
  };

  const handleGoogleLogin = async () => {
    setLoginLoading(true); setLoginError("");
    try { await loginWithGoogle(); } catch (e) { if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") { setLoginError("Error al iniciar sesión con Google."); } setLoginLoading(false); }
  };

  // Soporte: se configura cuando cambia la sesión (verificada con el token de Firebase). Nunca en la encuesta pública.
  useEffect(() => {
    if (publicSurvey || authLoading || !SOPORTE_BASE) return;
    let vivo = true;
    cargarWidget({ base: SOPORTE_BASE }).then((w) => {
      if (!vivo || !w) return;
      w.configure(configuracionSoporte({
        sesion: session, rol: user?.role || (session?.isSuper ? "superadmin" : ""), colegio: school.nombre || current?.nombre || "",
        getIdToken: () => auth.currentUser?.getIdToken(), version: VERSION_APP,
      }));
    });
    return () => { vivo = false; };
  }, [publicSurvey, authLoading, session, user, school.nombre, current?.nombre]);  // eslint-disable-line

  if (authLoading) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <Logo size="lg" />
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.t2, fontSize: 13 }}>
        <div style={{ width: 16, height: 16, border: `2px solid ${C.border}`, borderTopColor: C.rx, borderRadius: "50%", animation: "spin .7s linear infinite" }} />
        Verificando sesión...
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Encuesta pública — no requiere login ──
  if (publicSurvey) return <PublicSurvey surveyId={publicSurvey.surveyId} colegioId={publicSurvey.colegioId} />;

  const estLic = estadoLicencia(licencia);
  const licBloqueada = estLic.fase === "bloqueada";
  if (user && (school.blocked || licBloqueada) && !session.isSuper) return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif" }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>{licBloqueada ? "🔑" : "⏸"}</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{licBloqueada ? "Licencia vencida" : "Acceso suspendido"}</div>
        <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, marginBottom: 18 }}>{licBloqueada ? mensajeLicencia(estLic) : "El acceso de este colegio está suspendido o ya no tienes permisos. Tus datos se conservan. Comunícate con el administrador de la plataforma."}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}><BtnSoporte /><Btn v="sec" onClick={doLogout}>Salir</Btn></div>
      </div>
    </div>
  );

  if (session && !user) return <SchoolPicker session={session} colegios={colegios} supers={supers} onPick={chooseColegio} onCreate={createColegio} onMigrate={migrateLegacy} onLogout={doLogout} onSuspend={suspendColegio} onRenew={renovarColegio} onPlan={cambiarPlan} onGuardarPlanes={guardarPlanes} onRecordar={recordarColegio} onRefrescar={reloadColegios} onExport={exportFromPicker} onDelete={deleteFromPicker} onAddSuper={addSuper} onToggleSuper={toggleSuper} busy={pickerBusy} msg={pickerMsg} />;

  if (!user) {
    if (authView === "register") return (<RegistrationPage onBack={() => setAuthView("login")} />);
    return (<LoginPage onGoogleLogin={handleGoogleLogin} onRegister={() => setAuthView("register")} loading={loginLoading} error={loginError} />);
  }

  // En gracia (licencia vencida) el colegio queda en solo lectura; la plataforma (superadmin) no se limita.
  const soloLecturaLic = estLic.fase === "gracia" && !session.isSuper;
  const isAdmin = user.role === "superadmin" || user.role === "admin";
  const role = soloLecturaLic ? "readonly" : user.role;
  const ri = ROLES[user.role];
  const canEdit = role !== "readonly";

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "◎" },
    { id: "surveys", label: "Encuestas", icon: "✎" },
    { id: "matrix", label: "Matriz", icon: "⊞" },
    { id: "groups", label: "Grupos", icon: "👥" },
    { id: "reports", label: "Reportes", icon: "📊" },
    ...(isAdmin ? [{ id: "users", label: "Usuarios", icon: "👤" }, { id: "activity", label: "Actividad", icon: "📜" }, { id: "settings", label: "Config", icon: "⚙" }] : []),
  ];
  const filters = [
    { id: "all", l: "Todas", c: C.text },
    { id: "pos", l: "Positivas", c: C.teal },
    { id: "neu", l: "Neutrales", c: C.amber },
    { id: "neg", l: "Negativas", c: C.err },
  ];
  const sp = students.find((p) => p.id === selNode);
  const pC = selNode ? conns.filter((c) => c.f === selNode || c.t === selNode) : [];

  return (
    <div style={{ fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif", background: C.bg, color: C.text, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
        ${THEME_CSS}
        @keyframes slideIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--c-border);border-radius:3px}
        input::placeholder{color:var(--c-t3)}
        select option{background:var(--c-bgSub);color:var(--c-text)}
      `}</style>

      <header style={{ padding: "10px clamp(12px, 3vw, 22px)", borderBottom: `1px solid ${C.border}`, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px", background: `${tint(C.bg, "ee")}`, backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 50, boxShadow: `0 1px 24px rgba(0,0,0,0.25)` }}>
        <Logo size="md" />
        <div style={{ width: 1, height: 36, background: `linear-gradient(to bottom, transparent, ${tint(C.rx, "50")}, transparent)`, flexShrink: 0 }} />
        <SchoolLogo src={school.logo} name={school.nombre} size={44} style={{ boxShadow: `0 0 16px rgba(59,130,246,0.2)` }} />
        {school.nombre && <span style={{ fontSize: 13, fontWeight: 700, color: C.text, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{school.nombre}</span>}
        {(session.isSuper || colegios.length > 1) && <Btn sm v="ghost" onClick={() => chooseColegio(null)}>⇄ Cambiar colegio</Btn>}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 2, background: C.surface, borderRadius: 9, padding: 3, border: `1px solid ${C.border}`, overflowX: "auto", order: 10, flex: "1 1 100%", maxWidth: "100%", WebkitOverflowScrolling: "touch" }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "5px 12px", borderRadius: 7, border: "none", fontFamily: "inherit", background: tab === t.id ? `linear-gradient(135deg,${C.rx},#a78bfa)` : "transparent", color: tab === t.id ? "#fff" : C.t2, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 3, transition: "all .2s", whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 11 }}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
        <BtnSoporte />

        {/* ── TOGGLE MODO CLARO/OSCURO ── */}
        <button
          onClick={() => setIsDark((d) => !d)}
          title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          style={{
            width: 36, height: 36, borderRadius: 9,
            border: `1px solid ${C.border}`,
            background: C.surface,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, transition: "all .25s",
            flexShrink: 0,
            boxShadow: "none",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.rx; e.currentTarget.style.transform = "scale(1.08)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.transform = "scale(1)"; }}
        >
          {isDark ? "☀️" : "🌙"}
        </button>

        <Badge color={ri.color}>{ri.icon} {ri.label}</Badge>
        <Btn sm v="ghost" onClick={doLogout}>Salir</Btn>
      </header>

      {["por_vencer", "gracia"].includes(estLic.fase) && (isAdmin || estLic.fase === "gracia") && (
        <div style={{ background: estLic.fase === "gracia" ? tint(C.err, "18") : tint(C.amber, "18"), borderBottom: `1px solid ${tint(estLic.fase === "gracia" ? C.err : C.amber, "40")}`, padding: "6px 22px", fontSize: 12, color: estLic.fase === "gracia" ? C.err : C.amber, fontWeight: 600 }}>
          🔑 {mensajeLicencia(estLic)}
        </div>
      )}
      {isAdmin && excedeTope(licencia, students.length) && (
        <div style={{ background: tint(C.amber, "18"), borderBottom: `1px solid ${tint(C.amber, "40")}`, padding: "6px 22px", fontSize: 12, color: C.amber, fontWeight: 600 }}>
          ⚠ Tu plan incluye hasta {licencia.maxEstudiantes} estudiantes y hay {students.length}. Comunícate con Iskonex para ampliar tu plan.
        </div>
      )}
      {role === "readonly" && !soloLecturaLic && (
        <div style={{ background: C.skyDim, borderBottom: `1px solid ${tint(C.sky, "20")}`, padding: "5px 22px", fontSize: 11, color: C.sky }}>
          👁 Modo solo lectura
        </div>
      )}

      <main style={{ padding: "clamp(12px, 3vw, 22px)", animation: "slideIn .3s ease" }}>
        {students.length > 0 && ["dashboard", "matrix", "reports"].includes(tab) && surveys.filter((sv) => !sv.deleted).length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <label htmlFor="rn-fuente" style={{ fontSize: 12, fontWeight: 600, color: C.t2 }}>Datos de:</label>
            <select id="rn-fuente" value={activeFilter} onChange={(e) => setSurveyFilter(e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 9px", color: C.text, fontSize: 12, fontFamily: "inherit", maxWidth: "100%" }}>
              <option value="all">Todas las encuestas</option>
              {surveys.filter((sv) => !sv.deleted).map((sv) => <option key={sv.id} value={sv.id}>{sv.title} ({responsesRaw.filter((r) => r.surveyId === sv.id).length} respuestas)</option>)}
            </select>
            {activeFilter !== "all" && <span style={{ fontSize: 11, color: C.amber }}>Se muestra solo esta encuesta</span>}
          </div>
        )}
        {students.length === 0 && ["dashboard", "matrix", "reports"].includes(tab) && <EmptyState canEdit={canEdit} onGo={() => setTab("groups")} />}
        {students.length > 0 && tab === "dashboard" && (() => {
          // ── Cálculos dinámicos del dashboard ──
          const visStudents = students.filter(s => visibleGroups.includes(s.group));
          const visConns = conns.filter(c => visStudents.some(s => s.id === c.f) && visStudents.some(s => s.id === c.t));
          const n = visStudents.length;
          const densidad = density(visConns.length, n);

          // KPIs del nodo seleccionado
          // Solo lo visible: el divisor (n − 1) y lo que se cuenta deben referirse al mismo grupo.
          const ns = nodeStats(selNode, visConns, n);

          return (<>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,150px),1fr))", gap: 10, marginBottom: 14 }}>
              {[
                { i: "👥", v: visStudents.length, l: "Participantes", c: C.rx },
                { i: "🔗", v: visConns.length,    l: "Conexiones",    c: C.teal },
                { i: "📊", v: `${densidad}%`,     l: "Densidad",      c: C.amber },
                { i: "🎯", v: visibleGroups.length, l: "Grupos vis.", c: C.violet },
              ].map((s) => (
                <Card key={s.l} glow={s.c} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: tint(s.c, "12"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{s.i}</div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{s.v}</div>
                    <div style={{ fontSize: 9, color: C.t2, textTransform: "uppercase", letterSpacing: ".4px" }}>{s.l}</div>
                  </div>
                </Card>
              ))}
            </div>
            <div className="rn-dash" style={{ display: "grid", gridTemplateColumns: "2.2fr .8fr", gap: 12, alignItems: "start" }}>
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Sociograma Interactivo</span>
                    <span style={{ fontSize: 10, color: C.t3 }}>Click en nodo</span>
                    <div style={{ display: "flex", gap: 3, marginLeft: 4 }}>
                      {GROUPS.map((g) => (
                        <button key={g} onClick={() => toggleGroup(g)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 5, fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${visibleGroups.includes(g) ? tint(GC[g], "80") : C.border}`, background: visibleGroups.includes(g) ? tint(GC[g], "18") : "transparent", color: visibleGroups.includes(g) ? GC[g] : C.t3, transition: "all .2s" }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: visibleGroups.includes(g) ? GC[g] : tint(C.t3, "50"), display: "inline-block" }} />{g}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 2 }}>
                    {filters.map((f) => (
                      <button key={f.id} title={`${f.id === "all" ? visConns.length : visConns.filter((c) => hasType(c, f.id)).length} conexiones`} onClick={() => setFilter(f.id)} style={{ padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${filter === f.id ? tint(f.c, "40") : C.border}`, background: filter === f.id ? tint(f.c, "12") : "transparent", color: filter === f.id ? f.c : C.t3, transition: "all .2s" }}>{f.l} <span style={{ opacity: 0.7, fontWeight: 500 }}>{f.id === "all" ? visConns.length : visConns.filter((c) => hasType(c, f.id)).length}</span></button>
                    ))}
                  </div>
                </div>
                <div style={{ position: "relative", height: 420, overflow: "hidden" }}>
                  <SociogramCanvas
                    filter={filter} selNode={selNode} setSelNode={setSelNode}
                    students={visStudents}
                    conns={visConns}
                  />
                  {filter !== "all" && visConns.filter((c) => hasType(c, filter)).length === 0 && (
                    <div style={{ position: "absolute", top: 16, left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
                      <span style={{ display: "inline-block", padding: "6px 12px", borderRadius: 8, fontSize: 12, color: C.t2, background: tint(C.bg, "dd"), border: `1px solid ${C.border}` }}>
                        No hay conexiones {filters.find((f) => f.id === filter).l.toLowerCase()} en los grupos visibles
                      </span>
                    </div>
                  )}
                  <div style={{ position: "absolute", bottom: 8, left: 8, display: "flex", gap: 8, background: `${tint(C.bg, "dd")}`, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}` }}>
                    {Object.entries(GC).map(([n, c]) => (
                      <button key={n} onClick={() => toggleGroup(n)} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: visibleGroups.includes(n) ? C.text : C.t3, cursor: "pointer", background: "transparent", border: "none", fontFamily: "inherit", opacity: visibleGroups.includes(n) ? 1 : 0.45, transition: "all .2s" }}>
                        <span style={{ width: 6, height: 6, borderRadius: 2, background: c, opacity: visibleGroups.includes(n) ? 1 : 0.4 }} />{n}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* ── Mini buscador de nodos ── */}
                <Card style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.t2, marginBottom: 7, textTransform: "uppercase", letterSpacing: ".5px" }}>🔍 Buscar nodo</div>
                  <div style={{ position: "relative" }}>
                    <input
                      placeholder="Nombre del estudiante..."
                      onChange={e => {
                        const q = e.target.value.toLowerCase().trim();
                        if (!q) { setSelNode(null); return; }
                        const found = students.find(s => s.name.toLowerCase().includes(q));
                        if (found) setSelNode(found.id);
                      }}
                      style={{ width: "100%", background: C.bgSub, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 10px 6px 28px", color: C.text, fontSize: 11, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                      onFocus={e => e.target.style.borderColor = tint(C.rx, "60")}
                      onBlur={e => e.target.style.borderColor = C.border}
                    />
                    <svg style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                  </div>
                </Card>
                <Card style={{ flex: 1 }}>
                  {sp ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 10, background: (GC[sp.group] || "#3b82f6") + "18", border: `2px solid ${GC[sp.group]}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: GC[sp.group] }}>{sp.av}</div>
                        <div><div style={{ fontSize: 14, fontWeight: 700 }}>{sp.name}</div><div style={{ fontSize: 11, color: GC[sp.group] }}>{sp.group}</div></div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, marginBottom: 5 }}>
                        {[
                          { l: "Elecciones", v: ns.elecciones, c: C.rx, t: "A cuántos compañeros marcó esta persona" },
                          { l: "Recibidas",  v: ns.recibidas,  c: C.teal, t: "Cuántos compañeros la marcaron (en cualquier pregunta)" },
                          { l: "Recíprocas", v: ns.reciprocas, c: C.amber, t: "Compañeros que ella marcó y que también la marcaron" },
                        ].map((m) => (
                          <div key={m.l} title={m.t} style={{ background: C.bgSub, borderRadius: 8, padding: "7px 4px", textAlign: "center" }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: ink(m.c) }}>{m.v}</div>
                            <div style={{ fontSize: 8, fontWeight: 600, color: C.t2, textTransform: "uppercase" }}>{m.l}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 12 }}>
                        {[
                          { l: "Aceptación", v: ns.aceptacion, c: C.teal, t: `Elecciones positivas recibidas (${ns.positivasRecibidas}) ÷ (participantes − 1)` },
                          { l: "Rechazo",    v: ns.rechazo,    c: C.err,  t: `Rechazos recibidos (${ns.negativasRecibidas}) ÷ (participantes − 1)` },
                        ].map((m) => (
                          <div key={m.l} title={m.t} style={{ background: tint(m.c, "14"), border: `1px solid ${tint(m.c, "40")}`, borderRadius: 8, padding: "7px 8px", textAlign: "center" }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: ink(m.c) }}>{m.v}</div>
                            <div style={{ fontSize: 8, fontWeight: 700, color: C.t2, textTransform: "uppercase" }}>{m.l}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.t2, marginBottom: 5 }}>CONEXIONES ({pC.length})</div>
                      {(expandedNode === selNode ? pC : pC.slice(0, 5)).map((c, i) => {
                        const o = students.find((p) => p.id === (c.f === selNode ? c.t : c.f));
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 7px", borderRadius: 6, background: C.bgSub, fontSize: 11, marginBottom: 2 }}>
                            <span style={{ color: C.rx, fontFamily: "monospace" }}>{c.f === selNode ? "→" : "←"}</span>
                            <span style={{ flex: 1 }}>{o?.name}</span>
                            {(c.counts ? ["pos", "neu", "neg"].flatMap((t) => Array(Math.min(c.counts[t] || 0, 3)).fill(t)) : Array(c.s).fill(c.tp)).map((t, j) => (<span key={j} style={{ color: t === "pos" ? C.teal : t === "neg" ? C.err : C.amber, fontSize: 7 }}>●</span>))}
                          </div>
                        );
                      })}
                      {pC.length > 5 && (
                        <button onClick={() => setExpandedNode(expandedNode === selNode ? null : selNode)} style={{ width: "100%", marginTop: 4, padding: "5px 0", borderRadius: 6, border: `1px dashed ${C.border}`, background: "transparent", color: C.t2, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                          {expandedNode === selNode ? "Mostrar menos" : `Ver las ${pC.length - 5} restantes`}
                        </button>
                      )}
                    </>
                  ) : (
                    <div style={{ textAlign: "center", padding: "28px 14px" }}>
                      <div style={{ fontSize: 32, opacity: 0.15, marginBottom: 6 }}>◎</div>
                      <div style={{ fontSize: 11, color: C.t3 }}>Selecciona un nodo</div>
                    </div>
                  )}
                </Card>
                <Card>
                  {(() => {
                    const neg = rankMode === "neg";
                    const { rows, total } = rankStudents(visStudents, visConns, rankMode, rankAll ? 999 : 4);
                    const col = neg ? C.err : C.teal;
                    return (<>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 6, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.rx }}>🏆 Ranking</div>
                        <div style={{ display: "flex", gap: 2 }}>
                          {[{ id: "pos", l: "Más aceptados", c: C.teal }, { id: "neg", l: "Más rechazados", c: C.err }].map((o) => (
                            <button key={o.id} onClick={() => { setRankMode(o.id); setRankAll(false); }} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${rankMode === o.id ? tint(o.c, "66") : C.border}`, background: rankMode === o.id ? tint(o.c, "1f") : "transparent", color: rankMode === o.id ? ink(o.c) : C.t2 }}>{o.l}</button>
                          ))}
                        </div>
                      </div>
                      {rows.length === 0 && (
                        <div style={{ fontSize: 11, color: C.t2, padding: "8px 2px", lineHeight: 1.5 }}>{neg ? "Nadie ha recibido rechazos en los grupos visibles." : "Todavía nadie ha sido elegido positivamente en los grupos visibles."}</div>
                      )}
                      {rows.map((r, i) => (
                        <div key={r.student.id} onClick={() => setSelNode(r.student.id)} title={neg ? `${r.count} compañero(s) lo rechazaron · ${r.ratio} = ${r.count} ÷ (participantes − 1)` : `${r.count} compañero(s) lo eligieron positivamente · ${r.ratio} = ${r.count} ÷ (participantes − 1)`} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 0", cursor: "pointer", borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none" }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: r.rank === 1 ? (neg ? ink(C.err) : C.amber) : C.t2, fontFamily: "monospace", width: 18 }}>#{r.rank}</span>
                          <span style={{ fontSize: 11, flex: 1, fontWeight: selNode === r.student.id ? 700 : 500 }}>{r.student.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 800, color: ink(col) }}>{r.count}</span>
                          <span style={{ fontSize: 9, color: C.t2, width: 30, textAlign: "right" }}>{r.ratio}</span>
                        </div>
                      ))}
                      {total > 4 && (
                        <button onClick={() => setRankAll(!rankAll)} style={{ width: "100%", marginTop: 6, padding: "4px 0", borderRadius: 6, border: `1px dashed ${C.border}`, background: "transparent", color: C.t2, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                          {rankAll ? "Mostrar menos" : `Ver los ${total} del ranking`}
                        </button>
                      )}
                      {rows.length > 0 && <div style={{ fontSize: 9, color: C.t2, marginTop: 6 }}>{neg ? "Rechazos recibidos" : "Elecciones positivas recibidas"} · proporción = cantidad ÷ (participantes − 1)</div>}
                    </>);
                  })()}
                </Card>
              </div>
            </div>
          </>);
        })()}

        {tab === "surveys" && <SurveyBuilder role={role} students={students} GROUPS={dynGROUPS} />}
        {students.length > 0 && tab === "matrix" && <SocioMatrix students={students} conns={conns} />}
        {tab === "groups" && (canEdit ? (
          <GroupMgmt students={students} setStudents={setStudents} groups={groups} setGroups={setGroups} GC={dynGC} GROUPS={dynGROUPS} saveStudentFS={saveStudentFS} deleteStudentFS={deleteStudentFS} saveGroupFS={saveGroupFS} deleteGroupFS={deleteGroupFS} canEdit={canEdit} />
        ) : (
          <div style={{ textAlign: "center", padding: 40, color: C.t3 }}>👁 Solo lectura — No puedes gestionar grupos</div>
        ))}
        {tab === "users" && isAdmin && <UsersPanel authorizeUser={authorizeUser} revokeUser={revokeUser} reactivateUser={reactivateUser} deleteUser={deleteUser} me={user.email} />}
        {students.length > 0 && tab === "reports" && <ReportsPanel students={students} conns={conns} responses={responsesVivas} surveys={surveys} surveyFilter={activeFilter} />}
        {tab === "activity" && isAdmin && (<><PageHeader title="Registro de Actividad" subtitle="Auditoría completa de acciones del sistema" /><ActivityLog /></>)}
        {tab === "settings" && isAdmin && <SettingsPanel licencia={licencia} nEstudiantes={students.length} />}
      </main>
    </div>
  );
}
