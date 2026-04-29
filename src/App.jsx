import { useState, useEffect, useRef, useCallback } from "react";
import { auth, loginWithGoogle, logout, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";

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
  rx:"#ff4d6a",teal:"#2dd4bf",violet:"#a78bfa",amber:"#fbbf24",
  sky:"#38bdf8",text:"#eaedf6",t2:"#9498ae",t3:"#555770",
  ok:"#34d399",err:"#f87171",
};
// Hex crudos para Canvas (light)
const _L = {
  bg:"#f0f2f8",bgSub:"#e8eaf2",surface:"#ffffff",card:"#ffffff",
  cardHov:"#eef0fa",border:"#dde1f0",borderLit:"#c5cae0",
  rx:"#e8324f",teal:"#0fa89a",violet:"#7c5fe8",amber:"#c98f00",
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
  --c-rx:#ff4d6a;--c-rxDim:#ff4d6a12;--c-rxGlow:#ff4d6a25;
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
  --c-rx:#e8324f;--c-rxDim:#e8324f18;--c-rxGlow:#e8324f30;
  --c-teal:#0fa89a;--c-tealDim:#0fa89a18;
  --c-violet:#7c5fe8;--c-violetDim:#7c5fe818;
  --c-amber:#c98f00;--c-amberDim:#c98f0018;
  --c-sky:#0e8fc0;--c-skyDim:#0e8fc018;
  --c-text:#0d0f1a;--c-t2:#444666;--c-t3:#888aaa;
  --c-ok:#1a9e72;--c-err:#d63c3c;
}
`;

const ROLES = {
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

const initActivity = [
  {
    id: 1,
    time: "Hoy 09:12",
    user: "Dr. Martínez",
    action: "Creó encuesta",
    detail: "Sociograma 5°A Q2",
    type: "create",
  },
  {
    id: 2,
    time: "Hoy 08:45",
    user: "Lic. Rodríguez",
    action: "Completó análisis",
    detail: "Subgrupos 5°B",
    type: "report",
  },
  {
    id: 3,
    time: "Ayer 16:30",
    user: "Sistema",
    action: "Encuesta finalizada",
    detail: "7/10 respuestas recibidas",
    type: "system",
  },
  {
    id: 4,
    time: "Ayer 14:10",
    user: "Ana García",
    action: "Respondió encuesta",
    detail: "Sociograma 5°A",
    type: "survey",
  },
  {
    id: 5,
    time: "Ayer 14:05",
    user: "Carlos Ruiz",
    action: "Respondió encuesta",
    detail: "Sociograma 5°A",
    type: "survey",
  },
  {
    id: 6,
    time: "Hace 2 días",
    user: "Dr. Martínez",
    action: "Invitó usuario",
    detail: "prof.gomez@colegio.edu",
    type: "user",
  },
  {
    id: 7,
    time: "Hace 3 días",
    user: "Lic. Rodríguez",
    action: "Exportó PDF",
    detail: "Reporte completo 5°A",
    type: "export",
  },
];

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
    dan: { bg: C.err + "15", c: C.err, bd: C.err + "30" },
    sec: { bg: C.violet + "15", c: C.violet, bd: C.violet + "30" },
    ok: { bg: C.ok + "15", c: C.ok, bd: C.ok + "30" },
    teal: { bg: C.teal + "15", c: C.teal, bd: C.teal + "30" },
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
        boxShadow: h && glow ? `0 0 30px ${glow}10` : "none",
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
      background: color + "15",
      color,
      border: `1px solid ${color}25`,
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
      onFocus={(e) => (e.target.style.borderColor = "#ff4d6a60")}
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

const LogoIcon = ({ size = 40 }) => {
  const s = size;
  const r = s / 40;
  const cx = s / 2,
    cy = s / 2;
  const pts = [
    [4, 20],
    [9, 20],
    [12, 13],
    [15, 27],
    [17, 7],
    [19, 27],
    [22, 20],
    [32, 20],
    [36, 20],
  ]
    .map(([x, y]) => `${x * r},${y * r}`)
    .join(" ");
  const peakX = 17 * r,
    peakY = 7 * r;
  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      fill="none"
      style={{ display: "block", flexShrink: 0 }}
    >
      <rect width={s} height={s} rx={s * 0.22} fill="#1a0608" />
      <ellipse
        cx={cx}
        cy={cy + 2 * r}
        rx={14 * r}
        ry={5 * r}
        fill="#ff4d6a"
        opacity="0.09"
      />
      <circle cx={6 * r} cy={7 * r} r={1.8 * r} fill="#ff4d6a" opacity="0.4" />
      <circle cx={30 * r} cy={7 * r} r={1.8 * r} fill="#ff4d6a" opacity="0.4" />
      <circle cx={6 * r} cy={33 * r} r={1.4 * r} fill="#ff4d6a" opacity="0.25" />
      <circle cx={30 * r} cy={33 * r} r={1.4 * r} fill="#ff4d6a" opacity="0.25" />
      <line x1={6 * r} y1={7 * r} x2={peakX} y2={peakY} stroke="#ff4d6a" strokeWidth={0.7 * r} opacity="0.2" />
      <line x1={30 * r} y1={7 * r} x2={peakX} y2={peakY} stroke="#ff4d6a" strokeWidth={0.7 * r} opacity="0.2" />
      <polyline points={pts} stroke="#ff4d6a" strokeWidth={1.8 * r} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={peakX} cy={peakY} r={3.5 * r} fill="#ff4d6a" opacity="0.2" />
      <circle cx={peakX} cy={peakY} r={2.2 * r} fill="#ff4d6a" />
      <circle cx={peakX} cy={peakY} r={1 * r} fill="#1a0608" />
    </svg>
  );
};

const Logo = ({ size = "md" }) => {
  const cfg = {
    lg: { iconSize: 58, title: 28, sub: 11, gap: 16, subSpacing: "2.5px" },
    md: { iconSize: 38, title: 17, sub: 9, gap: 10, subSpacing: "1.8px" },
    sm: { iconSize: 28, title: 13, sub: 0, gap: 8, subSpacing: "1.5px" },
  }[size] || { iconSize: 38, title: 17, sub: 9, gap: 10, subSpacing: "1.8px" };

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
          box-shadow: 0 0 0 3px #ff4d6a30, 0 8px 32px rgba(255,77,106,.2) !important;
          transform: translateY(-2px) !important;
        }
        .rn-google-btn:active:not(:disabled) { transform: translateY(0) !important; }
        .rn-req-btn:hover { background: #ff4d6a22 !important; border-color: #ff4d6a60 !important; color: #ff4d6a !important; }
      `}</style>

      {/* ── Fondo: red animada de nodos ── */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="rg1" cx="30%" cy="25%">
            <stop offset="0%" stopColor="#ff4d6a" stopOpacity=".12"/>
            <stop offset="100%" stopColor="#ff4d6a" stopOpacity="0"/>
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
          <line className="rn-edge" x1="12%" y1="18%" x2="28%" y2="8%"  stroke="#ff4d6a" strokeWidth="1.2"/>
          <line className="rn-edge" x1="28%" y1="8%"  x2="48%" y2="22%" stroke="#ff4d6a" strokeWidth="1"/>
          <line className="rn-edge" x1="48%" y1="22%" x2="72%" y2="12%" stroke="#a78bfa" strokeWidth="1"/>
          <line className="rn-edge" x1="72%" y1="12%" x2="88%" y2="28%" stroke="#a78bfa" strokeWidth="1.2"/>
          <line className="rn-edge" x1="12%" y1="18%" x2="18%" y2="48%" stroke="#ff4d6a" strokeWidth="1"/>
          <line className="rn-edge" x1="18%" y1="48%" x2="8%"  y2="72%" stroke="#2dd4bf" strokeWidth="1"/>
          <line className="rn-edge" x1="88%" y1="28%" x2="92%" y2="58%" stroke="#a78bfa" strokeWidth="1"/>
          <line className="rn-edge" x1="92%" y1="58%" x2="82%" y2="82%" stroke="#2dd4bf" strokeWidth="1"/>
          <line className="rn-edge" x1="8%"  y1="72%" x2="22%" y2="88%" stroke="#2dd4bf" strokeWidth="1"/>
          <line className="rn-edge" x1="22%" y1="88%" x2="52%" y2="82%" stroke="#ff4d6a" strokeWidth="1"/>
          <line className="rn-edge" x1="52%" y1="82%" x2="82%" y2="82%" stroke="#a78bfa" strokeWidth="1"/>
          <line className="rn-edge" x1="18%" y1="48%" x2="48%" y2="22%" stroke="#ff4d6a" strokeWidth=".8" opacity=".5"/>
          <line className="rn-edge" x1="48%" y1="22%" x2="52%" y2="82%" stroke="#a78bfa" strokeWidth=".8" opacity=".4"/>
        </g>
        <g>
          {[
            { cx:"12%", cy:"18%", r:7,  c:"#ff4d6a" },
            { cx:"28%", cy:"8%",  r:5,  c:"#ff8a5c" },
            { cx:"48%", cy:"22%", r:9,  c:"#ff4d6a" },
            { cx:"72%", cy:"12%", r:6,  c:"#a78bfa" },
            { cx:"88%", cy:"28%", r:7,  c:"#a78bfa" },
            { cx:"18%", cy:"48%", r:5,  c:"#2dd4bf" },
            { cx:"8%",  cy:"72%", r:6,  c:"#2dd4bf" },
            { cx:"92%", cy:"58%", r:5,  c:"#a78bfa" },
            { cx:"82%", cy:"82%", r:7,  c:"#2dd4bf" },
            { cx:"22%", cy:"88%", r:5,  c:"#ff4d6a" },
            { cx:"52%", cy:"82%", r:8,  c:"#ff4d6a" },
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
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <SchoolLogo size={80} style={{ boxShadow: "0 0 40px rgba(255,77,106,0.3), 0 8px 32px rgba(0,0,0,0.4)" }} />
            <div style={{ width: 1, height: 56, background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.2), transparent)" }} />
            <LogoIcon size={80} />
          </div>
          <div style={{ marginTop: 32, fontSize: 48, fontWeight: 900, lineHeight: 1.1, color: "#fff", letterSpacing: "-2px" }}>
            Entiende<br/>
            <span style={{ color: "#ff4d6a" }}>las conexiones</span><br/>
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
                <div style={{ fontSize: 20, fontWeight: 800, color: "#ff4d6a" }}>{s.v}</div>
                <div style={{ fontSize: 11, color: "#555770", textTransform: "uppercase", letterSpacing: "1px" }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Divisor vertical ── */}
      <div style={{
        width: 1,
        background: "linear-gradient(to bottom, transparent, #ff4d6a30 30%, #ff4d6a30 70%, transparent)",
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
            border: "1px solid rgba(255,77,106,0.2)",
            borderRadius: 20,
            padding: 36,
            boxShadow: "0 0 80px rgba(255,77,106,.08), 0 24px 64px rgba(0,0,0,.5)",
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

function RegistrationPage({ onSubmit, onBack }) {
  const [formData, setFormData] = useState({ name: "", email: "", role: "psychologist" });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!formData.name.trim() || !formData.email.trim()) return;
    onSubmit({ ...formData, status: "pending", submitDate: new Date().toLocaleString() });
    setSubmitted(true);
  };

  if (submitted)
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, background: C.amber + "20", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 40, marginBottom: 20 }}>⏳</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: C.text }}>Solicitud enviada</div>
          <div style={{ fontSize: 13, color: C.t2, marginBottom: 24, lineHeight: 1.6 }}>
            Tu registro fue enviado para revisión. El Super Admin aprobará tu acceso en breve.
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20, textAlign: "left" }}>
            <div style={{ fontSize: 11, color: C.t3, marginBottom: 2 }}>Correo registrado:</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.teal }}>{formData.email}</div>
          </div>
          <Btn v="pri" onClick={onBack} style={{ width: "100%", justifyContent: "center" }}>Volver al inicio</Btn>
        </div>
      </div>
    );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", padding: 24 }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 25% 25%,${C.rx}06 0%,transparent 60%),radial-gradient(ellipse at 75% 75%,${C.teal}04 0%,transparent 60%)` }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${C.border}40 1px,transparent 1px)`, backgroundSize: "32px 32px" }} />
      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 30, display: "flex", justifyContent: "center" }}>
          <Logo size="lg" />
        </div>
        <Card style={{ padding: 30, background: `${C.card}ee`, backdropFilter: "blur(20px)" }}>
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Crear cuenta</div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>Solicita acceso a RedNexo</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Inp label="Nombre completo" value={formData.name} onChange={(v) => setFormData({ ...formData, name: v })} placeholder="Tu nombre" />
            <Inp label="Correo institucional" value={formData.email} onChange={(v) => setFormData({ ...formData, email: v })} placeholder="tu@institucion.edu" />
            <Sel label="Rol solicitado" value={formData.role} onChange={(v) => setFormData({ ...formData, role: v })} options={[{ v: "psychologist", l: "Psicólogo Escolar" }, { v: "readonly", l: "Solo Lectura" }]} />
            <div style={{ fontSize: 11, color: C.t3, background: C.bgSub, border: `1px solid ${C.border}`, borderRadius: 8, padding: 11, lineHeight: 1.55 }}>
              ℹ️ Tu solicitud será revisada por el Super Admin. No podrás ingresar hasta ser aprobado.
            </div>
          </div>
          <Btn v="pri" onClick={handleSubmit} disabled={!formData.name.trim() || !formData.email.trim()} style={{ width: "100%", justifyContent: "center", marginTop: 16 }}>
            Enviar solicitud
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

function UsersPanel({ authorizeUser, revokeUser }) {
  const [users, setUsers] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("psychologist");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("email"));
    const unsub = onSnapshot(q, (snap) => { setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); }, (err) => console.log("Users listener error", err));
    return () => unsub();
  }, []);

  const authorize = async () => {
    if (!newEmail.trim() || !newEmail.includes("@")) return;
    setSaving(true);
    setMsg("");
    const ok = await authorizeUser(newEmail.trim().toLowerCase(), newRole);
    setMsg(ok ? "✅ Usuario autorizado correctamente" : "❌ Error al autorizar");
    setNewEmail("");
    setSaving(false);
    setTimeout(() => setMsg(""), 3500);
  };

  const revoke = async (email) => {
    if (!window.confirm("¿Revocar acceso de " + email + "?")) return;
    await revokeUser(email);
    setMsg("✅ Acceso revocado");
    setTimeout(() => setMsg(""), 3000);
  };

  const roleColor = { superadmin: C.rx, psychologist: C.violet, readonly: C.sky };
  const roleLabel = { superadmin: "⚡ Super Admin", psychologist: "🧠 Psicólogo", readonly: "👤 Estándar" };
  const activeUsers = users.filter((u) => u.status === "active");
  const revokedUsers = users.filter((u) => u.status === "revoked");

  return (
    <div>
      <PageHeader title="Gestión de Usuarios" subtitle="Autoriza acceso por correo de Google. Los cambios se sincronizan en tiempo real." />
      {msg && (
        <div style={{ padding: "9px 14px", borderRadius: 8, marginBottom: 14, fontSize: 12, background: msg.startsWith("✅") ? C.ok + "15" : C.err + "15", color: msg.startsWith("✅") ? C.ok : C.err, border: `1px solid ${msg.startsWith("✅") ? C.ok + "30" : C.err + "30"}` }}>
          {msg}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card glow={C.violet}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: C.violet }}>➕ Autorizar usuario</div>
          <div style={{ fontSize: 11, color: C.t2, marginBottom: 14 }}>Ingresa el correo Google del usuario y asigna su rol</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <Inp label="Correo Google" value={newEmail} onChange={setNewEmail} placeholder="correo@gmail.com" />
            <Sel label="Rol" value={newRole} onChange={setNewRole} options={[{ v: "psychologist", l: "🧠 Psicólogo Escolar" }, { v: "readonly", l: "👤 Solo Lectura" }]} />
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
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "8px 10px", color: C.text }}>{u.email}</td>
                    <td style={{ padding: "8px 10px" }}><Badge color={roleColor[u.role] || C.sky}>{roleLabel[u.role] || u.role}</Badge></td>
                    <td style={{ padding: "8px 10px" }}><Badge color={u.status === "active" ? C.ok : C.err}>{u.status === "active" ? "● Activo" : "○ Revocado"}</Badge></td>
                    <td style={{ padding: "8px 10px" }}>
                      {u.status === "active" ? (
                        <Btn sm v="dan" onClick={() => revoke(u.email)}>Revocar</Btn>
                      ) : (
                        <Btn sm v="ok" onClick={() => authorizeUser(u.email, u.role || "readonly")}>Reactivar</Btn>
                      )}
                    </td>
                  </tr>
                ))}
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
      const fC = conns.filter((c) => filter === "all" || c.tp === filter);

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
        const gcColor = GC[g] || "#ff4d6a";
        const aura = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, 90);
        aura.addColorStop(0, gcColor + "12");
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
        const col = cn.tp === "pos" ? cc("teal") : cn.tp === "neg" ? cc("err") : cc("t3");
        const cpx = (f.x + t.x) / 2 + (t.y - f.y) * 0.22;
        const cpy = (f.y + t.y) / 2 - (t.x - f.x) * 0.22;

        if (hl) {
          // Halo exterior
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.quadraticCurveTo(cpx, cpy, t.x, t.y);
          ctx.strokeStyle = col + "18";
          ctx.lineWidth = cn.s * 5;
          ctx.stroke();
          // Línea principal con gradiente
          const grad = ctx.createLinearGradient(f.x, f.y, t.x, t.y);
          grad.addColorStop(0, col + "55");
          grad.addColorStop(0.5, col + "ee");
          grad.addColorStop(1, col + "55");
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
          pGlow.addColorStop(0, col + "ff");
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
          ctx.fillStyle = col + "99";
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.quadraticCurveTo(cpx, cpy, t.x, t.y);
          ctx.strokeStyle = col + "0e";
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
          ctx.strokeStyle = gc + "30";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(nd.x, nd.y, pulseR + 5, 0, Math.PI * 2);
          ctx.strokeStyle = gc + "12";
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
        if (isDrag || isSel) { ctx.shadowColor = gc + "80"; ctx.shadowBlur = isDrag ? 22 : 12; }

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
          ctx.strokeStyle = gc + "50";
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.fillStyle = "#eaedf6";
          ctx.fillText(nd.name, nd.x, py2 + ph/2);
          // Grupo
          ctx.fillStyle = gc + "bb";
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

function SocioMatrix({ students, conns }) {
  const [selGroups, setSelGroups] = useState(GROUPS.slice());
  const [hovRow, setHovRow] = useState(null);
  const [hovCol, setHovCol] = useState(null);
  const [selCell, setSelCell] = useState(null);
  const cvRef = useRef(null);
  const afRef = useRef(null);
  const tickRef = useRef(0);
  const particlesRef = useRef([]);

  const toggleG = (g) => setSelGroups(p => p.includes(g) ? (p.length > 1 ? p.filter(x => x !== g) : p) : [...p, g]);
  const allSel = selGroups.length === GROUPS.length;
  const fs = students.filter(s => selGroups.includes(s.group));

  // Partículas neurales que viajan por las conexiones activas
  useEffect(() => {
    particlesRef.current = [];
  }, [fs.length, conns.length]);

  // Canvas animado para las partículas de fondo
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const W = cv.offsetWidth, H = cv.offsetHeight;
    cv.width = W * 2; cv.height = H * 2;
    ctx.scale(2, 2);

    const draw = () => {
      tickRef.current++;
      ctx.clearRect(0, 0, W, H);

      // Pulsos de fondo que viajan aleatoriamente
      if (tickRef.current % 8 === 0 && particlesRef.current.length < 40) {
        const randConn = conns[Math.floor(Math.random() * conns.length)];
        if (randConn) {
          const fi = fs.findIndex(s => s.id === randConn.f);
          const ti = fs.findIndex(s => s.id === randConn.t);
          if (fi >= 0 && ti >= 0) {
            particlesRef.current.push({
              fi, ti, t: 0,
              color: randConn.tp === "pos" ? "#2dd4bf" : randConn.tp === "neg" ? "#f87171" : "#fbbf24",
              speed: 0.008 + Math.random() * 0.012,
            });
          }
        }
      }

      // Actualizar y dibujar partículas
      particlesRef.current = particlesRef.current.filter(p => p.t < 1);
      particlesRef.current.forEach(p => {
        p.t += p.speed;
        const cellSize = 36;
        const startX = (p.fi + 1.5) * cellSize;
        const startY = (p.ti + 0.5) * cellSize;
        const endX = (p.ti + 1.5) * cellSize;
        const endY = (p.fi + 0.5) * cellSize;
        const x = startX + (endX - startX) * p.t;
        const y = startY + (endY - startY) * p.t;
        const alpha = Math.sin(p.t * Math.PI);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 6);
        glow.addColorStop(0, p.color + Math.round(alpha * 200).toString(16).padStart(2, "0"));
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.globalAlpha = alpha * 0.9;
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      });

      afRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(afRef.current);
  }, [fs, conns]);

  const cellSize = 36;

  return (
    <div>
      {/* Filtros de grupo */}
      <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.t2 }}>Grupos:</span>
        <button onClick={() => setSelGroups(allSel ? [GROUPS[0]] : GROUPS.slice())} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${allSel ? C.rx + "50" : C.border}`, background: allSel ? C.rx + "15" : "transparent", color: allSel ? C.rx : C.t3, transition: "all .2s" }}>
          {allSel ? "✓ Todos" : "Todos"}
        </button>
        {GROUPS.map(g => {
          const on = selGroups.includes(g);
          return (
            <button key={g} onClick={() => toggleG(g)} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${on ? GC[g] + "80" : C.border}`, background: on ? GC[g] + "18" : "transparent", color: on ? GC[g] : C.t3, transition: "all .2s", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: on ? GC[g] : C.t3 + "40" }} />{g}
            </button>
          );
        })}
        <span style={{ marginLeft: "auto", fontSize: 10, color: C.t3 }}>{fs.length} participantes · {conns.length} conexiones</span>
      </div>

      {/* Título */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Matriz Sociométrica Neural</div>
        <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>Las partículas viajan por las conexiones reales · Haz clic en cualquier celda para ver detalle</div>
      </div>

      {/* Contenedor de la matriz */}
      <div style={{ position: "relative", overflowX: "auto" }}>
        {/* Canvas de partículas (overlay) */}
        <canvas
          ref={cvRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 2, borderRadius: 10 }}
        />

        <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 10, position: "relative", zIndex: 1 }}>
          <thead>
            <tr>
              {/* Corner cell */}
              <th style={{ width: cellSize * 2, minWidth: cellSize * 2, padding: "8px 10px", background: "#0a0a14", border: `1px solid ${C.border}`, position: "sticky", left: 0, zIndex: 4, borderRadius: "8px 0 0 0" }}>
                <div style={{ fontSize: 9, color: C.t3, textAlign: "center", lineHeight: 1.4 }}>De ↓<br/>Para →</div>
              </th>
              {fs.map((s, ci) => {
                const isHov = hovCol === s.id;
                const gc = GC[s.group] || C.rx;
                return (
                  <th key={s.id} onMouseEnter={() => setHovCol(s.id)} onMouseLeave={() => setHovCol(null)}
                    style={{ width: cellSize, minWidth: cellSize, padding: "6px 2px", background: isHov ? gc + "20" : "#0c0c18", border: `1px solid ${isHov ? gc + "60" : C.border}`, textAlign: "center", transition: "all .15s", cursor: "default" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: gc + "22", border: `1.5px solid ${gc}60`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 9, color: gc, margin: "0 auto" }}>{s.av}</div>
                    <div style={{ fontSize: 7, color: gc + "aa", marginTop: 2, letterSpacing: ".3px" }}>{s.group}</div>
                  </th>
                );
              })}
              <th style={{ padding: "6px 8px", background: C.rx + "18", border: `1px solid ${C.border}`, fontSize: 10, color: C.rx, fontWeight: 700, textAlign: "center" }}>Σ+</th>
              <th style={{ padding: "6px 8px", background: C.err + "18", border: `1px solid ${C.border}`, fontSize: 10, color: C.err, fontWeight: 700, textAlign: "center" }}>Σ−</th>
            </tr>
          </thead>
          <tbody>
            {fs.map((from, ri) => {
              let pos = 0, neg = 0;
              const isHovRow = hovRow === from.id;
              const gcFrom = GC[from.group] || C.rx;
              return (
                <tr key={from.id} onMouseEnter={() => setHovRow(from.id)} onMouseLeave={() => setHovRow(null)}>
                  <td style={{ padding: "5px 10px", background: isHovRow ? gcFrom + "18" : "#0c0c18", border: `1px solid ${isHovRow ? gcFrom + "60" : C.border}`, fontWeight: 700, color: gcFrom, position: "sticky", left: 0, zIndex: 3, fontSize: 10, whiteSpace: "nowrap", transition: "all .15s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 5, background: gcFrom + "22", border: `1px solid ${gcFrom}50`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 8, flexShrink: 0 }}>{from.av}</div>
                      <span style={{ fontSize: 9, color: C.t2, fontWeight: 400 }}>{from.name.split(" ")[0]}</span>
                    </div>
                  </td>
                  {fs.map((to, ci) => {
                    if (from.id === to.id) {
                      return (
                        <td key={to.id} style={{ padding: 0, width: cellSize, height: cellSize, background: "#0a0a14", border: `1px solid ${C.border}`, textAlign: "center" }}>
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #1a1a2a 25%, #0a0a14 75%)" }}>
                            <span style={{ fontSize: 14, color: C.t3 + "40" }}>◇</span>
                          </div>
                        </td>
                      );
                    }
                    const conn = conns.find(c => c.f === from.id && c.t === to.id);
                    const rev  = conns.find(c => c.f === to.id  && c.t === from.id);
                    const mutual = conn && rev;
                    const isHov = (hovRow === from.id || hovCol === to.id);
                    const isSel = selCell && selCell.f === from.id && selCell.t === to.id;
                    if (conn?.tp === "pos") pos++;
                    if (conn?.tp === "neg") neg++;

                    const col = conn ? (conn.tp === "pos" ? (mutual ? C.ok : C.teal) : conn.tp === "neg" ? C.err : C.amber) : null;
                    const bgBase = conn ? (conn.tp === "pos" ? (mutual ? C.ok : C.teal) : conn.tp === "neg" ? C.err : C.amber) + "18" : "transparent";
                    const bgHov  = conn ? col + "30" : C.t3 + "08";
                    const sym = conn ? (conn.tp === "pos" ? (mutual ? "⬥" : "▲") : conn.tp === "neg" ? "▼" : "◯") : "";

                    return (
                      <td key={to.id}
                        onClick={() => setSelCell(isSel ? null : conn ? { f: from.id, t: to.id, conn, mutual, from, to } : null)}
                        onMouseEnter={() => { setHovRow(from.id); setHovCol(to.id); }}
                        onMouseLeave={() => { setHovRow(null); setHovCol(null); }}
                        title={conn ? `${from.name} → ${to.name}: ${conn.tp}${mutual ? " (mutuo)" : ""}` : "Sin conexión"}
                        style={{ padding: 0, width: cellSize, height: cellSize, background: isSel ? col + "40" : isHov ? bgHov : bgBase, border: `1px solid ${isSel ? col + "80" : isHov && conn ? col + "60" : C.border + "80"}`, textAlign: "center", cursor: conn ? "pointer" : "default", transition: "all .12s", position: "relative" }}>
                        {conn && (
                          <>
                            {/* Glow interior */}
                            {isHov && <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle, ${col}25, transparent)`, pointerEvents: "none" }} />}
                            <span style={{ fontSize: mutual ? 14 : 12, color: col, fontWeight: mutual ? 800 : 600, position: "relative", zIndex: 1, textShadow: isHov ? `0 0 8px ${col}` : "none", transition: "text-shadow .15s" }}>{sym}</span>
                          </>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ padding: "4px 8px", background: C.rx + "0a", border: `1px solid ${C.border}`, textAlign: "center", fontWeight: 800, color: pos > 0 ? C.teal : C.t3, fontSize: 12 }}>{pos}</td>
                  <td style={{ padding: "4px 8px", background: C.err + "0a", border: `1px solid ${C.border}`, textAlign: "center", fontWeight: 800, color: neg > 0 ? C.err : C.t3, fontSize: 12 }}>{neg}</td>
                </tr>
              );
            })}
            {/* Fila de recibidas */}
            <tr>
              <td style={{ padding: "6px 10px", background: "#0c0c18", border: `1px solid ${C.border}`, fontWeight: 700, fontSize: 9, color: C.t2, position: "sticky", left: 0, zIndex: 3, letterSpacing: ".3px" }}>RECIBIDAS</td>
              {fs.map(to => {
                const rec = conns.filter(c => c.t === to.id && c.tp === "pos").length;
                const maxR = Math.max(...fs.map(s => conns.filter(c => c.t === s.id && c.tp === "pos").length), 1);
                const pct = rec / maxR;
                const gc = GC[to.group] || C.teal;
                return (
                  <td key={to.id} style={{ padding: "2px", background: "transparent", border: `1px solid ${C.border}`, textAlign: "center" }}>
                    <div style={{ position: "relative", height: cellSize - 8, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 2 }}>
                      <div style={{ width: "70%", height: `${Math.max(pct * 100, 4)}%`, background: `linear-gradient(to top, ${gc}, ${gc}44)`, borderRadius: "2px 2px 0 0", minHeight: 3, transition: "height .3s", boxShadow: pct > 0.5 ? `0 0 6px ${gc}60` : "none" }} />
                      <span style={{ fontSize: 9, fontWeight: 800, color: rec > 0 ? gc : C.t3 }}>{rec}</span>
                    </div>
                  </td>
                );
              })}
              <td colSpan={2} style={{ background: "#0a0a14", border: `1px solid ${C.border}` }} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tooltip de celda seleccionada */}
      {selCell && (
        <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 10, background: C.cardAlt, border: `1px solid ${selCell.conn.tp === "pos" ? C.teal : selCell.conn.tp === "neg" ? C.err : C.amber}40`, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: (GC[selCell.from.group] || C.rx) + "20", border: `1.5px solid ${GC[selCell.from.group] || C.rx}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: GC[selCell.from.group] || C.rx }}>{selCell.from.av}</div>
          <div style={{ fontSize: 20, color: selCell.conn.tp === "pos" ? C.teal : selCell.conn.tp === "neg" ? C.err : C.amber }}>→</div>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: (GC[selCell.to.group] || C.rx) + "20", border: `1.5px solid ${GC[selCell.to.group] || C.rx}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: GC[selCell.to.group] || C.rx }}>{selCell.to.av}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{selCell.from.name} → {selCell.to.name}</div>
            <div style={{ fontSize: 11, color: selCell.conn.tp === "pos" ? C.teal : selCell.conn.tp === "neg" ? C.err : C.amber }}>
              {selCell.conn.tp === "pos" ? "✓ Elección positiva" : selCell.conn.tp === "neg" ? "✗ Rechazo" : "○ Neutral"}
              {selCell.mutual && <span style={{ color: C.ok, marginLeft: 8 }}>⬥ Mutua</span>}
            </div>
          </div>
          <button onClick={() => setSelCell(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.t3, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* Leyenda */}
      <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 10, color: C.t2, flexWrap: "wrap" }}>
        {[
          { sym: "▲", col: C.teal,  lab: "Positiva" },
          { sym: "⬥", col: C.ok,    lab: "Mutua" },
          { sym: "▼", col: C.err,   lab: "Rechazo" },
          { sym: "◯", col: C.amber, lab: "Neutral" },
        ].map(l => (
          <span key={l.lab} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 13, color: l.col }}>{l.sym}</span>{l.lab}
          </span>
        ))}
        <span style={{ marginLeft: "auto", color: C.t3, fontSize: 9 }}>Las partículas animan conexiones reales en tiempo real</span>
      </div>
    </div>
  );
}

// ════════ SURVEY EXECUTION ════════

function SurveyExec({ students, onComplete }) {
  const [respondent, setRespondent] = useState(null);
  const [qIdx, setQIdx] = useState(0);
  const [sel, setSel] = useState([]);
  const [done, setDone] = useState(false);
  const questions = [
    "¿Con quién prefieres trabajar en equipo?",
    "¿A quién acudes cuando necesitas ayuda?",
    "¿Con quién pasas más tiempo en el recreo?",
    "¿A quién consideras un líder?",
    "¿Con quién NO te sientes cómodo(a)?",
  ];

  if (done) return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: C.ok + "20", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 28, marginBottom: 14 }}>✓</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.ok, marginBottom: 6 }}>¡Encuesta completada!</div>
      <div style={{ fontSize: 13, color: C.t2, marginBottom: 20 }}>Respuestas registradas exitosamente</div>
      <Btn v="pri" onClick={() => { setDone(false); setRespondent(null); setQIdx(0); }}>Nueva encuesta</Btn>
    </div>
  );

  if (!respondent) return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>¿Quién responde?</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {students.map((p) => (
          <button key={p.id} onClick={() => setRespondent(p)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "all .2s", fontFamily: "inherit" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = GC[p.group] || "#ff4d6a")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}>
            <span style={{ width: 30, height: 30, borderRadius: 7, background: (GC[p.group] || "#ff4d6a") + "18", color: GC[p.group] || "#ff4d6a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 10 }}>{p.av}</span>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{p.name}</div>
              <div style={{ fontSize: 10, color: C.t3 }}>{p.group}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const q = questions[qIdx];
  const isLast = qIdx === questions.length - 1;
  const toggle = (id) => setSel((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev);
  const next = () => { setSel([]); if (isLast) { setDone(true); onComplete?.(); } else setQIdx((i) => i + 1); };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 26, height: 26, borderRadius: 6, background: (GC[respondent.group] || "#ff4d6a") + "18", color: GC[respondent.group], display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 9 }}>{respondent.av}</span>
        <span style={{ fontSize: 12, color: C.t2 }}>Respondiendo: <b style={{ color: C.text }}>{respondent.name}</b></span>
        <Btn sm v="ghost" onClick={() => { setRespondent(null); setQIdx(0); setSel([]); }}>Cambiar</Btn>
      </div>
      <div style={{ display: "flex", gap: 3, marginBottom: 14 }}>
        {questions.map((_, i) => (<div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= qIdx ? C.rx : C.border, transition: "all .3s" }} />))}
      </div>
      <div style={{ fontSize: 10, color: C.t3, marginBottom: 3 }}>Pregunta {qIdx + 1} de {questions.length}</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: qIdx === 4 ? C.err : C.text }}>{q}</div>
      <div style={{ fontSize: 10, color: C.t2, marginBottom: 8 }}>Selecciona hasta 3 personas</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {students.filter((p) => p.id !== respondent.id).map((p) => {
          const s = sel.includes(p.id);
          return (
            <button key={p.id} onClick={() => toggle(p.id)} style={{ background: s ? (GC[p.group] || "#ff4d6a") + "12" : C.surface, border: `1px solid ${s ? GC[p.group] || "#ff4d6a" : C.border}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.text, transition: "all .2s", fontFamily: "inherit" }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${s ? GC[p.group] || "#ff4d6a" : C.border}`, background: s ? GC[p.group] || "#ff4d6a" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", transition: "all .2s" }}>{s && "✓"}</span>
              {p.name}
              <span style={{ marginLeft: "auto", fontSize: 10, color: C.t3 }}>{p.group}</span>
            </button>
          );
        })}
      </div>
      <Btn v="pri" onClick={next} disabled={!sel.length} style={{ width: "100%", marginTop: 12, justifyContent: "center" }}>
        {isLast ? "Finalizar ✓" : "Siguiente →"}
      </Btn>
    </div>
  );
}

// ════════ GROUP MANAGEMENT ════════

function GroupMgmt({ students, setStudents, groups, setGroups, GC, GROUPS, saveStudentFS, deleteStudentFS, saveGroupFS, deleteGroupFS, canEdit }) {
  const [addingTo, setAddingTo] = useState(null);
  const [addMode, setAddMode] = useState("single");
  const [newName, setNewName] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [search, setSearch] = useState("");

  const addStudent = async () => {
    if (!newName.trim()) return;
    const id = Date.now() + Math.random();
    const av = newName.trim().split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
    const s = { id, name: newName.trim(), group: addingTo, av };
    setStudents((prev) => [...prev, s]);
    await saveStudentFS(s);
    setNewName("");
  };

  const addBulk = async () => {
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const newStudents = lines.map((name, i) => {
      const id = Date.now() + i + Math.random();
      const av = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
      return { id, name, group: addingTo, av };
    });
    setStudents((s) => [...s, ...newStudents]);
    await Promise.all(newStudents.map((s) => saveStudentFS(s)));
    setBulkText("");
    setAddingTo(null);
  };

  const removeStudent = async (id) => {
    setStudents((s) => s.filter((x) => x.id !== id));
    await deleteStudentFS(id);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div><PageHeader title="Gestión de Grupos" subtitle="Administra grupos y participantes" /></div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn v="sec" onClick={() => setAddingGroup(!addingGroup)}>+ Nuevo Grupo</Btn>
        </div>
      </div>
      {addingGroup && (
        <Card style={{ marginBottom: 14, display: "flex", alignItems: "flex-end", gap: 10 }}>
          <Inp label="Nombre del grupo" value={newGroup} onChange={setNewGroup} placeholder="Ej: 7° B" style={{ flex: 1 }} />
          <Btn v="pri" onClick={() => { if (newGroup.trim()) { GROUPS.push(newGroup.trim()); setNewGroup(""); setAddingGroup(false); } }}>Crear</Btn>
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
          placeholder="Buscar estudiante en todos los grupos..."
          style={{ width: "100%", background: C.surface, border: `1.5px solid ${search ? C.rx + "70" : C.border}`, borderRadius: 10, padding: "10px 36px 10px 36px", color: C.text, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", transition: "all .2s", boxShadow: search ? `0 0 0 3px ${C.rx}15` : "none" }}
        />
        {search && (
          <button onClick={() => setSearch("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: C.border, border: "none", color: C.t2, cursor: "pointer", fontSize: 11, width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>✕</button>
        )}
        {search && (
          <div style={{ position: "absolute", right: 40, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: C.rx, fontWeight: 700 }}>
            {students.filter(s => s.name.toLowerCase().includes(search.toLowerCase())).length} encontrados
          </div>
        )}
      </div>

      {/* ── Resultados de búsqueda ── */}
      {search.trim() && (() => {
        const q = search.toLowerCase();
        const results = students.filter(s => s.name.toLowerCase().includes(q));
        // Función para resaltar el texto buscado
        const highlight = (text) => {
          const idx = text.toLowerCase().indexOf(q);
          if (idx === -1) return text;
          return (
            <span>
              {text.slice(0, idx)}
              <span style={{ background: C.rx + "35", color: C.rx, borderRadius: 2, padding: "0 1px" }}>{text.slice(idx, idx + q.length)}</span>
              {text.slice(idx + q.length)}
            </span>
          );
        };
        // Agrupar resultados por grupo
        const byGroup = {};
        results.forEach(s => { if (!byGroup[s.group]) byGroup[s.group] = []; byGroup[s.group].push(s); });
        return (
          <Card style={{ marginBottom: 14, border: `1px solid ${C.rx}30`, background: C.cardAlt }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.rx, display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                {results.length} resultado{results.length !== 1 ? "s" : ""} · "{search}"
              </div>
              {results.length > 0 && <span style={{ fontSize: 10, color: C.t3 }}>{Object.keys(byGroup).length} grupo{Object.keys(byGroup).length !== 1 ? "s" : ""}</span>}
            </div>
            {results.length === 0 ? (
              <div style={{ textAlign: "center", padding: "16px 0", color: C.t3, fontSize: 12 }}>
                <div style={{ fontSize: 28, opacity: .3, marginBottom: 6 }}>🔍</div>
                No se encontró ningún estudiante con ese nombre
              </div>
            ) : (
              Object.entries(byGroup).map(([grp, members]) => {
                const gc = GC[grp] || C.rx;
                return (
                  <div key={grp} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: gc }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: gc }}>{grp}</span>
                      <span style={{ fontSize: 10, color: C.t3 }}>({members.length})</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingLeft: 14 }}>
                      {members.map(s => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}` }}>
                          <div style={{ width: 30, height: 30, borderRadius: 7, background: gc + "18", color: gc, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 10, flexShrink: 0 }}>{s.av}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{highlight(s.name)}</div>
                            <div style={{ fontSize: 10, color: gc }}>{s.group}</div>
                          </div>
                          <button
                            onClick={() => { if (window.confirm(`¿Eliminar a ${s.name}?`)) { setStudents(p => p.filter(x => x.id !== s.id)); deleteStudentFS(s.id); } }}
                            title="Eliminar"
                            style={{ background: "none", border: "none", color: C.t3, cursor: "pointer", padding: "3px 5px", borderRadius: 5, display: "flex", alignItems: "center", transition: "all .15s" }}
                            onMouseEnter={e => { e.currentTarget.style.color = C.err; e.currentTarget.style.background = C.err + "15"; }}
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {GROUPS.map((g) => {
          const members = students.filter((s) => s.group === g);
          const visibleMembers = search.trim()
            ? members.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
            : members;
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
                      <button key={m} onClick={() => setAddMode(m)} style={{ flex: 1, padding: "4px", borderRadius: 5, border: `1px solid ${addMode === m ? (m === "single" ? C.teal : C.violet) : C.border}`, background: addMode === m ? (m === "single" ? C.teal : C.violet) + "15" : "transparent", color: addMode === m ? (m === "single" ? C.teal : C.violet) : C.t3, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
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
                  const q = search.toLowerCase();
                  const name = s.name;
                  const idx = q ? name.toLowerCase().indexOf(q) : -1;
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 7, background: idx >= 0 ? gc + "10" : C.surface, border: `1px solid ${idx >= 0 ? gc + "40" : C.border}`, transition: "all .15s" }}>
                      <span style={{ width: 26, height: 26, borderRadius: 6, background: gc + "18", color: gc, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 9, flexShrink: 0 }}>{s.av}</span>
                      <span style={{ fontSize: 12, flex: 1, color: C.text }}>
                        {idx >= 0 ? (
                          <span>
                            {name.slice(0, idx)}
                            <span style={{ background: C.rx + "35", color: C.rx, borderRadius: 2, padding: "0 1px", fontWeight: 700 }}>{name.slice(idx, idx + q.length)}</span>
                            {name.slice(idx + q.length)}
                          </span>
                        ) : name}
                      </span>
                      <button
                        onClick={() => removeStudent(s.id)}
                        title="Eliminar"
                        style={{ background: "none", border: "none", color: C.t3, cursor: "pointer", padding: "2px 4px", borderRadius: 5, display: "flex", alignItems: "center", transition: "all .15s", flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.color = C.err; e.currentTarget.style.background = C.err + "15"; }}
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

// ════════ PROGRESS TRACKER ════════

function ProgressTracker({ students }) {
  const completed = [1, 2, 5, 9, 3, 8, 4];
  const total = students.length;
  const pct = Math.round((completed.length / total) * 100);
  return (
    <Card glow={C.rx}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>📊 Progreso de Encuesta Activa</div>
        <Badge color={pct === 100 ? C.ok : C.amber}>{pct}% completado</Badge>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: C.border, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 4, background: `linear-gradient(90deg,${C.rx},#ff8a5c)`, transition: "width .5s" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
        {students.map((s) => {
          const done = completed.includes(s.id);
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 7, background: done ? C.ok + "10" : C.surface, border: `1px solid ${done ? C.ok + "30" : C.border}` }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: done ? C.ok : C.t3 + "50" }} />
              <span style={{ fontSize: 10, color: done ? C.ok : C.t3, fontWeight: done ? 600 : 400 }}>{s.name.split(" ")[0]}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 12, fontSize: 11, color: C.t2 }}>
        <span>✅ {completed.length} completadas</span>
        <span>⏳ {total - completed.length} pendientes</span>
      </div>
    </Card>
  );
}

// ════════ ACTIVITY LOG ════════

function ActivityLog() {
  const icons = { create: "📋", report: "📊", system: "⚙", survey: "✅", user: "👤", export: "📄" };
  const colors = { create: C.rx, report: C.violet, system: C.t2, survey: C.teal, user: C.amber, export: C.sky };
  const [log, setLog] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "activity"), orderBy("createdAt", "desc")),
      (snap) => { if (snap.empty) { setLog([]); } else { setLog(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); } setLoading(false); },
      (err) => { console.log("Activity offline:", err); setLog([]); setLoading(false); }
    );
    return () => unsub();
  }, []);

  const clear = async () => {
    setConfirming(false);
    try {
      const snap = await getDocs(collection(db, "activity"));
      await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "activity", d.id))));
    } catch (e) { console.error("Error vaciando actividad:", e); }
    setLog([]);
  };

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>📜 Actividad Reciente <span style={{ fontSize: 10, color: C.t3, fontWeight: 400 }}>({log.length} entradas)</span></div>
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
                <div style={{ fontSize: 10, color: C.t3 }}>{a.detail}</div>
              </div>
              <span style={{ fontSize: 10, color: C.t3, whiteSpace: "nowrap" }}>{a.time}</span>
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

// ════════ SURVEY BUILDER ════════

function SurveyBuilder({ role, students, GROUPS }) {
  const canEdit = role !== "readonly";
  const [surveys, setSurveys] = useState([]);
  const [loadingS, setLoadingS] = useState(true);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null), [creating, setCreating] = useState(false), [executing, setExecuting] = useState(null), [showTrash, setShowTrash] = useState(false);
  const [nS, setNS] = useState({ title: "", group: GROUPS?.[0] || "5° A", groups: [], maxSel: 3, anon: true, questions: [] });
  const [nQ, setNQ] = useState({ text: "", tp: "pos" });

  useEffect(() => {
    const q = query(collection(db, "surveys"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => { setSurveys(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoadingS(false); }, (err) => { console.log("Surveys offline:", err); setLoadingS(false); });
    return () => unsub();
  }, []);

  const addQ = () => { if (!nQ.text.trim()) return; setNS((s) => ({ ...s, questions: [...s.questions, { id: "q_" + Date.now(), ...nQ }] })); setNQ({ text: "", tp: "pos" }); };

  const save = async () => {
    if (!nS.title.trim() || !nS.questions.length) return;
    const id = "sv_" + Date.now();
    const forFirestore = { ...nS, id, status: "draft", createdAt: serverTimestamp() };
    const forLocal = { ...nS, id, status: "draft", createdAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, "surveys", id), forFirestore);
      setMsg("✅ Encuesta guardada en Firebase");
    } catch (e) {
      console.error("Error guardando encuesta:", e);
      setSurveys((s) => [...s, forLocal]);
      setMsg("❌ Error al guardar: " + e.message);
    }
    setCreating(false);
    setNS({ title: "", group: GROUPS?.[0] || "5° A", maxSel: 3, anon: true, questions: [] });
    setTimeout(() => setMsg(""), 4000);
  };

  const deleteSurvey = async (id) => {
    try {
      await updateDoc(doc(db, "surveys", id), { deleted: true, deletedAt: serverTimestamp() });
    } catch (e) { setSurveys((s) => s.map((x) => x.id === id ? { ...x, deleted: true } : x)); }
  };
  const restoreSurvey = async (id) => {
    try {
      await updateDoc(doc(db, "surveys", id), { deleted: false, deletedAt: null });
    } catch (e) { setSurveys((s) => s.map((x) => x.id === id ? { ...x, deleted: false } : x)); }
  };
  const deletePermanent = async (id) => {
    try { await deleteDoc(doc(db, "surveys", id)); } catch (e) { setSurveys((s) => s.filter((x) => x.id !== id)); }
  };
  const updateSurveyField = async (id, field, value) => { setSurveys((s) => s.map((x) => (x.id === id ? { ...x, [field]: value } : x))); try { await updateDoc(doc(db, "surveys", id), { [field]: value }); } catch (e) { console.error(e); } };
  const updateSurveyQuestions = async (id, questions) => { setSurveys((s) => s.map((x) => (x.id === id ? { ...x, questions } : x))); try { await updateDoc(doc(db, "surveys", id), { questions }); } catch (e) { console.error(e); } };

  if (executing) return (
    <div style={{ maxWidth: 540, margin: "0 auto", animation: "slideIn .3s ease" }}>
      <Btn v="ghost" onClick={() => setExecuting(null)} style={{ marginBottom: 14 }}>← Volver a encuestas</Btn>
      <Card><SurveyExec students={students} onComplete={() => {}} /></Card>
    </div>
  );

  if (creating) return (
    <div style={{ animation: "slideIn .3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Btn v="ghost" onClick={() => setCreating(false)}>← Volver</Btn>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Crear Nueva Encuesta</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: C.rx }}>⚙ Configuración</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Inp label="Título" value={nS.title} onChange={(v) => setNS((s) => ({ ...s, title: v }))} placeholder="Ej: Sociograma Q2" />
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.t2, display: "block", marginBottom: 6 }}>Grupos incluidos</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(GROUPS || []).map(g => {
                  const on = (nS.groups?.length > 0 ? nS.groups : [nS.group]).includes(g);
                  const gc = GC[g] || "#ff4d6a";
                  return (
                    <button key={g} onClick={() => {
                      const cur = nS.groups?.length > 0 ? nS.groups : [nS.group];
                      const next = cur.includes(g) ? (cur.length > 1 ? cur.filter(x => x !== g) : cur) : [...cur, g];
                      setNS(s => ({ ...s, groups: next, group: next[0] }));
                    }} style={{
                      padding: "4px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit", transition: "all .2s",
                      border: `1.5px solid ${on ? gc : C.border}`,
                      background: on ? gc + "20" : "transparent",
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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div onClick={() => setNS((s) => ({ ...s, anon: !s.anon }))} style={{ width: 38, height: 20, borderRadius: 10, cursor: "pointer", background: nS.anon ? C.rx : C.border, display: "flex", alignItems: "center", padding: 2, transition: "all .2s" }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "all .2s", transform: nS.anon ? "translateX(18px)" : "translateX(0)" }} />
              </div>
              <span style={{ fontSize: 12, color: C.t2 }}>Anónima</span>
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div><PageHeader title="Gestión de Encuestas" subtitle="Crea, edita, ejecuta encuestas sociométricas" /></div>
        {canEdit && <div style={{ display: "flex", gap: 8 }}>
          <Btn v="ghost" onClick={() => setShowTrash(!showTrash)} style={{ position: "relative" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            Papelera
            {surveys.filter(s => s.deleted).length > 0 && (
              <span style={{ position: "absolute", top: -4, right: -4, background: C.err, color: "#fff", borderRadius: "50%", width: 16, height: 16, fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {surveys.filter(s => s.deleted).length}
              </span>
            )}
          </Btn>
          <Btn v="pri" onClick={() => setCreating(true)}>+ Nueva Encuesta</Btn>
        </div>}
      </div>
      {msg && <div style={{ padding: "8px 12px", borderRadius: 8, marginBottom: 10, background: msg.startsWith("✅") ? C.ok + "15" : C.amber + "15", color: msg.startsWith("✅") ? C.ok : C.amber, fontSize: 12 }}>{msg}</div>}
      {loadingS && <div style={{ textAlign: "center", padding: 30, color: C.t3 }}>Cargando encuestas...</div>}

      {/* ── Papelera ── */}
      {showTrash && (
        <Card style={{ marginBottom: 16, border: `1px solid ${C.err}30` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.err, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            🗑 Papelera ({surveys.filter(s => s.deleted).length} encuestas)
          </div>
          {surveys.filter(s => s.deleted).length === 0 ? (
            <div style={{ fontSize: 12, color: C.t3, textAlign: "center", padding: 16 }}>La papelera está vacía</div>
          ) : surveys.filter(s => s.deleted).map(sv => (
            <div key={sv.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, marginBottom: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.t2 }}>{sv.title}</div>
                <div style={{ fontSize: 10, color: C.t3 }}>{sv.group} · {sv.questions?.length} preguntas</div>
              </div>
              <Btn sm v="ok" onClick={() => restoreSurvey(sv.id)}>↩ Restaurar</Btn>
              <Btn sm v="dan" onClick={() => { if (window.confirm("¿Eliminar permanentemente?")) deletePermanent(sv.id); }}>✕ Eliminar</Btn>
            </div>
          ))}
        </Card>
      )}

      <ProgressTracker students={students} />
      <div style={{ marginTop: 14 }} />
      {surveys.filter(sv => !sv.deleted).map((sv) => (
        <Card key={sv.id} style={{ marginBottom: 12 }} glow={C.rx}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{sv.title}</span>
                <button onClick={() => canEdit && updateSurveyField(sv.id, "status", sv.status === "active" ? "draft" : "active")} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 20, fontSize: 10, fontWeight: 700, border: `1px solid ${sv.status === "active" ? C.ok + "40" : C.amber + "40"}`, background: sv.status === "active" ? C.ok + "15" : C.amber + "15", color: sv.status === "active" ? C.ok : C.amber, cursor: canEdit ? "pointer" : "default", fontFamily: "inherit", transition: "all .2s" }}>
                  {sv.status === "active" ? "● Activa" : "◌ Borrador"}
                  {canEdit && <span style={{ fontSize: 9, opacity: 0.6 }}>{sv.status === "active" ? " ▼" : " ▲"}</span>}
                </button>
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: C.t2 }}>
                <span>📋 {sv.questions.length} preguntas</span>
                <span>👥 {sv.group}</span>
                <span>🎯 Máx: {sv.maxSel}</span>
                <span>{sv.anon ? "🔒 Anónima" : "👤 Identificada"}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn sm v="ok" onClick={() => setExecuting(sv.id)}>▶ Ejecutar</Btn>
              <Btn sm v="teal" onClick={() => { const url = `${window.location.origin}${window.location.pathname}?survey=${sv.id}`; navigator.clipboard.writeText(url).then(() => alert("✅ Link copiado:\n\n" + url)).catch(() => prompt("Copia este link:", url)); }}>🔗 Link</Btn>
              {canEdit && (<><Btn sm onClick={() => setEditing(editing === sv.id ? null : sv.id)}>{editing === sv.id ? "Cerrar" : "✎ Editar"}</Btn><Btn sm v="dan" onClick={() => deleteSurvey(sv.id)}>🗑</Btn></>)}
            </div>
          </div>
          {editing === sv.id && (
            <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: C.bgSub, border: `1px solid ${C.border}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                <Inp label="Título" value={sv.title} onChange={(v) => updateSurveyField(sv.id, "title", v)} />
                <Sel label="Grupo" value={sv.group} onChange={(v) => updateSurveyField(sv.id, "group", v)} options={(GROUPS || []).map((g) => ({ v: g, l: g }))} />
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
                  <button onClick={() => { const newQs = sv.questions.filter((qq) => qq.id !== q.id); updateSurveyQuestions(sv.id, newQs); }} style={{ background: "none", border: "none", color: C.err + "80", cursor: "pointer", fontSize: 12, padding: "0 3px" }}>✕</button>
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

function ReportsPanel({ students, conns }) {
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

  const calcIdx = (s, stList, cnList) => {
    const t = stList.length - 1 || 1;
    const hechas = cnList.filter((c) => String(c.f) === String(s.id)).length;
    const recibidas = cnList.filter((c) => String(c.t) === String(s.id)).length;
    const posR = cnList.filter((c) => String(c.t) === String(s.id) && c.tp === "pos").length;
    const negR = cnList.filter((c) => String(c.t) === String(s.id) && c.tp === "neg").length;
    const mutuas = cnList.filter((c) => String(c.f) === String(s.id) && cnList.some((r) => String(r.f) === String(c.t) && String(r.t) === String(s.id))).length;
    return { hechas, recibidas, posR, negR, mutuas, popularidad: ((posR / t) * 100).toFixed(1), rechazo: ((negR / t) * 100).toFixed(1), expansion: ((hechas / t) * 100).toFixed(1), rol: posR >= 3 ? "⭐ Líder" : negR >= 2 ? "⚠️ Rechazado" : recibidas === 0 && hechas === 0 ? "🔴 Aislado" : mutuas >= 2 ? "🔗 Integrado" : "Regular" };
  };

  const dl = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const sharedCSS = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;background:#f5f6fa;color:#1a1a2e;font-size:13px}.page{max-width:1050px;margin:0 auto;padding:28px 20px}.header{background:#1a0608;color:#fff;padding:24px 28px;border-radius:14px;margin-bottom:22px;display:flex;justify-content:space-between;align-items:center}.header h1{font-size:26px;font-weight:800;letter-spacing:-1px}.header h1 span{color:#ff4d6a}.header .meta{text-align:right;font-size:12px;color:#9498ae;line-height:2}.section{background:#fff;border-radius:10px;padding:20px;margin-bottom:18px;box-shadow:0 1px 8px rgba(0,0,0,.07)}.section h2{font-size:15px;font-weight:700;margin-bottom:3px;display:flex;align-items:center;gap:7px;color:#1a1a2e}.section .sub{font-size:11px;color:#888;margin-bottom:14px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}.kpi{background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 8px rgba(0,0,0,.07);text-align:center}.kpi .val{font-size:28px;font-weight:800}.kpi .lbl{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-top:3px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #e5e7eb;padding:6px 9px;text-align:center}th{background:#f9fafb;font-weight:700;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.3px}td:first-child{text-align:left}tr:hover td{background:#fafafa}.pos{color:#2dd4bf;font-weight:700}.neg{color:#f87171;font-weight:700}.mut{color:#34d399}.badge{display:inline-block;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700}.alert{border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:12px;border-left:4px solid}.alert-ok{background:#d1fae5;border-color:#10b981;color:#065f46}.alert-warn{background:#fef3c7;border-color:#f59e0b;color:#92400e}.alert-info{background:#dbeafe;border-color:#3b82f6;color:#1e40af}.footer{text-align:center;font-size:10px;color:#aaa;margin-top:24px;padding:12px;border-top:1px solid #e5e7eb}@media print{body{background:#fff}.section{box-shadow:none;border:1px solid #e5e7eb;break-inside:avoid}.kpis{break-inside:avoid}}`;
  const logoSVG = `<div style="width:44px;height:44px;background:#1a0608;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="32" height="32" viewBox="0 0 40 40" fill="none"><ellipse cx="20" cy="22" rx="14" ry="5" fill="#ff4d6a" opacity="0.09"/><circle cx="6" cy="7" r="1.8" fill="#ff4d6a" opacity="0.4"/><circle cx="30" cy="7" r="1.8" fill="#ff4d6a" opacity="0.4"/><line x1="6" y1="7" x2="17" y2="7" stroke="#ff4d6a" stroke-width="0.7" opacity="0.2"/><line x1="30" y1="7" x2="17" y2="7" stroke="#ff4d6a" stroke-width="0.7" opacity="0.2"/><polyline points="4,20 9,20 12,13 15,27 17,7 19,27 22,20 32,20 36,20" stroke="#ff4d6a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="17" cy="7" r="3.5" fill="#ff4d6a" opacity="0.2"/><circle cx="17" cy="7" r="2.2" fill="#ff4d6a"/><circle cx="17" cy="7" r="1" fill="#1a0608"/></svg></div>`;

  const buildReportBody = (stList, cnList) => {
    const date = new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });
    const grupoLabel = selectedGroup === "Todos" ? "Todos los grupos" : selectedGroup;
    const t = stList.length - 1 || 1;
    const totalConns = cnList.length;
    const posConns = cnList.filter((c) => c.tp === "pos").length;
    const negConns = cnList.filter((c) => c.tp === "neg").length;
    const mutuasTotal = Math.round(cnList.filter((c) => cnList.some((r) => String(r.f) === String(c.t) && String(r.t) === String(c.f))).length / 2);
    const lideres = stList.filter((s) => cnList.filter((c) => String(c.t) === String(s.id) && c.tp === "pos").length >= 3);
    const aislados = stList.filter((s) => cnList.filter((c) => String(c.f) === String(s.id) || String(c.t) === String(s.id)).length === 0);
    const densidad = stList.length > 1 ? ((totalConns / (stList.length * (stList.length - 1))) * 100).toFixed(1) : 0;
    const grupos = [...new Set(stList.map((s) => s.group))];
    const indivRows = stList.map((s) => { const idx = calcIdx(s, stList, cnList); const gc = GC[s.group] || "#ff4d6a"; return `<tr><td><b>${s.name}</b></td><td><span class="badge" style="background:${gc}20;color:${gc}">${s.group}</span></td><td>${idx.hechas}</td><td>${idx.recibidas}</td><td class="pos">${idx.posR}</td><td class="neg">${idx.negR}</td><td class="mut">${idx.mutuas}</td><td class="pos">${idx.popularidad}%</td><td class="neg">${idx.rechazo}%</td><td style="color:#a78bfa;font-weight:700">${idx.expansion}%</td><td><b>${idx.rol}</b></td></tr>`; }).join("");
    const grupoRows = grupos.map((g) => { const miembros = stList.filter((s) => s.group === g); const connInt = cnList.filter((c) => { const f = stList.find((s) => String(s.id) === String(c.f)); const t2 = stList.find((s) => String(s.id) === String(c.t)); return f?.group === g && t2?.group === g; }); const connExt = cnList.filter((c) => { const f = stList.find((s) => String(s.id) === String(c.f)); const t2 = stList.find((s) => String(s.id) === String(c.t)); return f && t2 && f.group !== t2.group && (f.group === g || t2.group === g); }); const dens = miembros.length > 1 ? ((connInt.length / (miembros.length * (miembros.length - 1))) * 100).toFixed(1) + "%" : "N/A"; const lider = miembros.map((s) => ({ s, posR: cnList.filter((c) => String(c.t) === String(s.id) && c.tp === "pos").length })).sort((a, b) => b.posR - a.posR)[0]; const gc = GC[g] || "#ff4d6a"; return `<tr><td><span class="badge" style="background:${gc}20;color:${gc}">${g}</span></td><td>${miembros.length}</td><td class="pos">${connInt.length}</td><td style="color:#a78bfa">${connExt.length}</td><td><b>${dens}</b></td><td>${lider ? `<b>${lider.s.name}</b> <span style="color:#888">(${lider.posR} elec.)</span>` : "—"}</td></tr>`; }).join("");
    const matrizTH = `<th style="min-width:90px">De ↓ / Para →</th>` + stList.map((s) => `<th title="${s.name}" style="min-width:32px">${s.av}</th>`).join("") + `<th class="pos">Σ+</th><th class="neg">Σ−</th>`;
    const matrizRows = stList.map((from) => { let pos = 0, neg = 0; const cells = stList.map((to) => { if (String(from.id) === String(to.id)) return `<td style="background:#f3f4f6">—</td>`; const c = cnList.find((c) => String(c.f) === String(from.id) && String(c.t) === String(to.id)); const rev = cnList.find((c) => String(c.f) === String(to.id) && String(c.t) === String(from.id)); if (c?.tp === "pos") pos++; if (c?.tp === "neg") neg++; const sym = c ? c.tp === "pos" ? rev ? "⬥" : "+" : c.tp === "neg" ? "−" : "○" : ""; const col = c ? c.tp === "pos" ? rev ? "#34d399" : "#2dd4bf" : c.tp === "neg" ? "#f87171" : "#fbbf24" : "#ccc"; return `<td style="color:${col};font-weight:${rev ? "800" : "500"}">${sym}</td>`; }).join(""); return `<tr><td style="font-weight:700;white-space:nowrap">${from.av} ${from.name}</td>${cells}<td class="pos">${pos}</td><td class="neg">${neg}</td></tr>`; }).join("");
    return { date, grupoLabel, totalConns, posConns, negConns, mutuasTotal, lideres, aislados, densidad, indivRows, grupoRows, matrizTH, matrizRows };
  };

  const exportHTML = () => {
    const { date, grupoLabel, totalConns, posConns, negConns, mutuasTotal, lideres, aislados, densidad, indivRows, grupoRows, matrizTH, matrizRows } = buildReportBody(filteredStudents, filteredConns);
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte RedNexo — ${grupoLabel}</title><style>${sharedCSS}</style></head><body><div class="page"><div class="header"><div style="display:flex;align-items:center;gap:14px">${logoSVG}<div><div style="font-size:10px;color:#9498ae;letter-spacing:2px;margin-bottom:3px">INTELIGENCIA SOCIOMÉTRICA</div><h1>Red<span>Nexo</span></h1><div style="font-size:12px;color:#9498ae;margin-top:3px">Reporte ${reportType === "individual" ? "Individual" : "Grupal"} · ${grupoLabel}</div></div></div><div class="meta"><div>📅 ${date}</div><div>👥 ${filteredStudents.length} participantes</div><div>🔗 ${totalConns} conexiones</div><div>📋 ${grupoLabel}</div></div></div><div class="kpis"><div class="kpi"><div class="val" style="color:#ff4d6a">${filteredStudents.length}</div><div class="lbl">Participantes</div></div><div class="kpi"><div class="val" style="color:#2dd4bf">${posConns}</div><div class="lbl">Elecciones positivas</div></div><div class="kpi"><div class="val" style="color:#f87171">${negConns}</div><div class="lbl">Rechazos</div></div><div class="kpi"><div class="val" style="color:#34d399">${mutuasTotal}</div><div class="lbl">Relaciones mutuas</div></div></div><div class="section"><h2>📋 Resumen ejecutivo</h2><div class="sub">Hallazgos clave — ${grupoLabel}</div>${lideres.length > 0 ? `<div class="alert alert-ok">⭐ <b>Líderes (${lideres.length}):</b> ${lideres.map((s) => s.name).join(", ")}</div>` : ""}${aislados.length > 0 ? `<div class="alert alert-warn">⚠️ <b>Aislados (${aislados.length}):</b> ${aislados.map((s) => s.name).join(", ")}</div>` : ""}${negConns >= 5 ? `<div class="alert alert-warn">🔴 <b>Alto nivel de rechazos:</b> ${negConns} elecciones negativas.</div>` : ""}<div class="alert alert-info">📊 <b>Densidad:</b> ${densidad}%</div></div>${reportType === "individual" || reportType === "ambos" ? `<div class="section"><h2>👤 Índices individuales</h2><div class="sub">Métricas por participante</div><div style="overflow-x:auto"><table><thead><tr><th>Nombre</th><th>Grupo</th><th>Elige</th><th>Recibe</th><th class="pos">Pos.</th><th class="neg">Neg.</th><th class="mut">Mutuas</th><th class="pos">Popular.</th><th class="neg">Rechazo</th><th style="color:#a78bfa">Expansión</th><th>Rol</th></tr></thead><tbody>${indivRows}</tbody></table></div></div>` : ""}${reportType === "grupal" || reportType === "ambos" ? `<div class="section"><h2>👥 Análisis por grupo</h2><table><thead><tr><th>Grupo</th><th>Miembros</th><th class="pos">Conn. internas</th><th style="color:#a78bfa">Conn. externas</th><th>Densidad</th><th>Líder del grupo</th></tr></thead><tbody>${grupoRows}</tbody></table></div>` : ""}<div class="section"><h2>⊞ Matriz sociométrica</h2><div class="sub">+ positiva · ⬥ mutua · − rechazo · ○ neutral</div><div style="overflow-x:auto"><table style="font-size:10px"><thead><tr>${matrizTH}</tr></thead><tbody>${matrizRows}</tbody></table></div></div><div class="footer">RedNexo — ${date} · ${grupoLabel}</div></div></body></html>`;
    dl(html, `reporte_rednexo_${grupoLabel.replace(/ /g, "_")}.html`, "text/html;charset=utf-8;");
  };

  const exportPDF = () => {
    const { date, grupoLabel, totalConns, posConns, negConns, mutuasTotal, lideres, aislados, densidad, indivRows, grupoRows, matrizTH, matrizRows } = buildReportBody(filteredStudents, filteredConns);
    const win = window.open("", "_blank", "width=900,height=700");
    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte PDF — ${grupoLabel}</title><style>${sharedCSS}@page{size:A4;margin:15mm 12mm}body{background:#fff;font-size:11px}.no-print{display:none}@media print{.no-print{display:none}}</style></head><body><div class="no-print" style="position:fixed;top:0;left:0;right:0;background:#1a0608;color:#fff;padding:10px 16px;display:flex;align-items:center;gap:12px;z-index:999;font-family:'Segoe UI',Arial,sans-serif;font-size:13px"><span style="flex:1">RedNexo · Reporte ${grupoLabel}</span><button onclick="window.print()" style="background:#ff4d6a;color:#fff;border:none;padding:7px 18px;border-radius:7px;font-weight:700;cursor:pointer">🖨 Imprimir / PDF</button><button onclick="window.close()" style="background:transparent;color:#9498ae;border:1px solid #555;padding:7px 14px;border-radius:7px;cursor:pointer">Cerrar</button></div><div style="height:44px" class="no-print"></div><div class="page"><div class="header"><div style="display:flex;align-items:center;gap:12px">${logoSVG}<div><h1>Red<span>Nexo</span></h1></div></div><div class="meta"><div>📅 ${date}</div><div>👥 ${filteredStudents.length} participantes</div></div></div><div class="kpis"><div class="kpi"><div class="val" style="color:#ff4d6a">${filteredStudents.length}</div><div class="lbl">Participantes</div></div><div class="kpi"><div class="val" style="color:#2dd4bf">${posConns}</div><div class="lbl">Positivas</div></div><div class="kpi"><div class="val" style="color:#f87171">${negConns}</div><div class="lbl">Rechazos</div></div><div class="kpi"><div class="val" style="color:#34d399">${mutuasTotal}</div><div class="lbl">Mutuas</div></div></div><div class="section"><h2>📋 Resumen</h2>${lideres.length > 0 ? `<div class="alert alert-ok">⭐ Líderes: ${lideres.map((s) => s.name).join(", ")}</div>` : ""}${aislados.length > 0 ? `<div class="alert alert-warn">⚠️ Aislados: ${aislados.map((s) => s.name).join(", ")}</div>` : ""}<div class="alert alert-info">📊 Densidad: ${densidad}%</div></div>${reportType === "individual" || reportType === "ambos" ? `<div class="section"><h2>👤 Índices individuales</h2><div style="overflow-x:auto"><table><thead><tr><th>Nombre</th><th>Grupo</th><th>Elige</th><th>Recibe</th><th class="pos">Pos.</th><th class="neg">Neg.</th><th class="mut">Mutuas</th><th class="pos">Popular.</th><th class="neg">Rechazo</th><th style="color:#a78bfa">Expansión</th><th>Rol</th></tr></thead><tbody>${indivRows}</tbody></table></div></div>` : ""}${reportType === "grupal" || reportType === "ambos" ? `<div class="section"><h2>👥 Grupos</h2><table><thead><tr><th>Grupo</th><th>Miembros</th><th class="pos">Conn. int.</th><th style="color:#a78bfa">Conn. ext.</th><th>Densidad</th><th>Líder</th></tr></thead><tbody>${grupoRows}</tbody></table></div>` : ""}<div class="section"><h2>⊞ Matriz sociométrica</h2><div style="overflow-x:auto"><table style="font-size:9px"><thead><tr>${matrizTH}</tr></thead><tbody>${matrizRows}</tbody></table></div></div><div class="footer">RedNexo — ${date} · ${grupoLabel}</div></div><script>setTimeout(()=>window.print(),600)</script></body></html>`);
    win.document.close();
  };

  const renderPreview = () => {
    const stList = filteredStudents;
    const cnList = filteredConns;
    return (
      <Card style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.sky }}>
            👁 Vista Previa — {reportType === "individual" ? "Índices Individuales" : reportType === "grupal" ? "Análisis Grupal" : "Reporte Completo"}
            <span style={{ fontSize: 10, color: C.t3, fontWeight: 400, marginLeft: 8 }}>{selectedGroup === "Todos" ? "Todos los grupos" : selectedGroup} · {stList.length} participantes</span>
          </div>
          <Btn sm v="ghost" onClick={() => setActive(null)}>✕ Cerrar</Btn>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
          {[{ l: "Participantes", v: stList.length, c: C.rx }, { l: "Elec. positivas", v: cnList.filter((c) => c.tp === "pos").length, c: C.teal }, { l: "Rechazos", v: cnList.filter((c) => c.tp === "neg").length, c: C.err }, { l: "Mutuas", v: Math.round(cnList.filter((c) => cnList.some((r) => String(r.f) === String(c.t) && String(r.t) === String(c.f))).length / 2), c: C.ok }].map((k) => (
            <div key={k.l} style={{ background: C.bgSub, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: k.c }}>{k.v}</div>
              <div style={{ fontSize: 9, color: C.t3, textTransform: "uppercase", letterSpacing: ".4px", marginTop: 2 }}>{k.l}</div>
            </div>
          ))}
        </div>
        {(reportType === "individual" || reportType === "ambos") && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.t2, marginBottom: 8 }}>ÍNDICES INDIVIDUALES</div>
            <div style={{ overflowX: "auto", marginBottom: 16 }}>
              <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
                <thead><tr>{["Nombre","Grupo","Elige","Recibe","Pos.","Neg.","Mutuas","Popular.","Rechazo","Expansión","Rol"].map((h) => (<th key={h} style={{ padding: "5px 8px", background: C.surface, border: `1px solid ${C.border}`, fontSize: 9, color: C.t2, fontWeight: 700, textAlign: "left", textTransform: "uppercase" }}>{h}</th>))}</tr></thead>
                <tbody>
                  {stList.map((s) => { const idx = calcIdx(s, stList, cnList); const gc = GC[s.group] || C.t2; return (<tr key={s.id}><td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, fontWeight: 600, color: C.text }}>{s.name}</td><td style={{ padding: "5px 8px", border: `1px solid ${C.border}` }}><span style={{ background: gc + "18", color: gc, padding: "2px 7px", borderRadius: 6, fontSize: 9, fontWeight: 700 }}>{s.group}</span></td><td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, textAlign: "center" }}>{idx.hechas}</td><td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, textAlign: "center" }}>{idx.recibidas}</td><td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, textAlign: "center", color: C.teal, fontWeight: 700 }}>{idx.posR}</td><td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, textAlign: "center", color: C.err, fontWeight: 700 }}>{idx.negR}</td><td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, textAlign: "center", color: C.ok }}>{idx.mutuas}</td><td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, textAlign: "center", color: C.teal, fontWeight: 700 }}>{idx.popularidad}%</td><td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, textAlign: "center", color: C.err }}>{idx.rechazo}%</td><td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, textAlign: "center", color: C.violet }}>{idx.expansion}%</td><td style={{ padding: "5px 8px", border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10 }}>{idx.rol}</td></tr>); })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    );
  };

  return (
    <div>
      <PageHeader title="Reportes y Análisis" subtitle="Genera reportes del análisis sociométrico filtrados por grupo" />
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 12, textTransform: "uppercase", letterSpacing: ".5px" }}>Configurar reporte</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.t2, display: "block", marginBottom: 5 }}>Grupo a analizar</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {grupos.map((g) => { const on = selectedGroup === g; const gc = g === "Todos" ? "#ff4d6a" : GC[g] || "#ff4d6a"; return (<button key={g} onClick={() => setSelectedGroup(g)} style={{ padding: "5px 13px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${on ? gc + "80" : C.border}`, background: on ? gc + "18" : "transparent", color: on ? gc : C.t3, transition: "all .2s" }}>{g === "Todos" ? "🌐 Todos" : g}</button>); })}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.t2, display: "block", marginBottom: 5 }}>Tipo de reporte</label>
            <div style={{ display: "flex", gap: 6 }}>
              {[{ v: "individual", l: "👤 Individual" }, { v: "grupal", l: "👥 Grupal" }, { v: "ambos", l: "📊 Completo" }].map((opt) => { const on = reportType === opt.v; return (<button key={opt.v} onClick={() => setReportType(opt.v)} style={{ padding: "5px 13px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${on ? C.violet + "80" : C.border}`, background: on ? C.violet + "18" : "transparent", color: on ? C.violet : C.t3, transition: "all .2s" }}>{opt.l}</button>); })}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: C.bgSub, border: `1px solid ${C.border}`, fontSize: 11, color: C.t2 }}>
          📌 {filteredStudents.length} participantes · {filteredConns.length} conexiones{selectedGroup !== "Todos" && <span style={{ color: GC[selectedGroup] || C.rx, fontWeight: 700, marginLeft: 6 }}>· {selectedGroup}</span>}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
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
      </div>
      {active === "preview" && renderPreview()}
    </div>
  );
}

// ════════ SETTINGS PANEL ════════

function SettingsPanel() {
  const [cfg, setCfg] = useState({ colegio: "Colegio Demo", ciudad: "Bogotá", periodo: "2026-1", dominio: "colegio.edu", registro: "no", notifEncuesta: "yes", notifResultados: "psy", logoUrl: "", idioma: "es" });
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (snap) => { if (snap.exists()) { setCfg((prev) => ({ ...prev, ...snap.data() })); } setLoading(false); }, (err) => { console.log("Settings offline:", err); setLoading(false); });
    return () => unsub();
  }, []);

  const upd = (k, v) => { setCfg((p) => ({ ...p, [k]: v })); setDirty(true); setSaved(false); };
  const save = async () => {
    try { await setDoc(doc(db, "settings", "global"), { ...cfg, updatedAt: serverTimestamp() }); setSaved(true); setDirty(false); setTimeout(() => setSaved(false), 3000); } catch (e) { console.error(e); }
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card glow={C.rx}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: C.rx }}>🏫 Institución</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Inp label="Colegio" value={cfg.colegio} onChange={(v) => upd("colegio", v)} placeholder="Nombre del colegio" />
            <Inp label="Ciudad" value={cfg.ciudad} onChange={(v) => upd("ciudad", v)} placeholder="Ciudad" />
            <Sel label="Período" value={cfg.periodo} onChange={(v) => upd("periodo", v)} options={[{ v: "2026-1", l: "2026 — Sem. 1" }, { v: "2026-2", l: "2026 — Sem. 2" }, { v: "2025-2", l: "2025 — Sem. 2" }, { v: "2025-1", l: "2025 — Sem. 1" }]} />
          </div>
        </Card>
        <Card glow={C.teal}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: C.teal }}>🔐 Seguridad</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Sel label="Dominio Google permitido" value={cfg.dominio} onChange={(v) => upd("dominio", v)} options={[{ v: "colegio.edu", l: "@colegio.edu" }, { v: "edu.co", l: "@edu.co" }, { v: "all", l: "Cualquier correo" }]} />
            <Sel label="Registro de nuevos usuarios" value={cfg.registro} onChange={(v) => upd("registro", v)} options={[{ v: "no", l: "Solo invitación (recomendado)" }, { v: "approval", l: "Libre con aprobación admin" }, { v: "yes", l: "Completamente abierto" }]} />
          </div>
        </Card>
        <Card glow={C.amber}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: C.amber }}>📧 Notificaciones</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Sel label="Notificar encuestas nuevas" value={cfg.notifEncuesta} onChange={(v) => upd("notifEncuesta", v)} options={[{ v: "yes", l: "Sí" }, { v: "no", l: "No" }]} />
            <Sel label="Enviar resultados a" value={cfg.notifResultados} onChange={(v) => upd("notifResultados", v)} options={[{ v: "psy", l: "Solo psicólogos" }, { v: "all", l: "Todos los usuarios" }, { v: "admin", l: "Solo administradores" }]} />
          </div>
        </Card>
        <Card glow={C.violet}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: C.violet }}>🎨 Marca</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Inp label="URL del logo" value={cfg.logoUrl} onChange={(v) => upd("logoUrl", v)} placeholder="https://tu-colegio.edu/logo.png" />
            {cfg.logoUrl && (<div style={{ display: "flex", justifyContent: "center", padding: 8, background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}><img src={cfg.logoUrl} alt="logo" style={{ maxHeight: 48, maxWidth: "100%", objectFit: "contain" }} onError={(e) => (e.target.style.display = "none")} /></div>)}
            <Sel label="Idioma de la interfaz" value={cfg.idioma} onChange={(v) => upd("idioma", v)} options={[{ v: "es", l: "Español" }, { v: "en", l: "English" }]} />
          </div>
        </Card>
      </div>
      {dirty && (<div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}><Btn v="pri" onClick={save}>💾 Guardar todos los cambios</Btn></div>)}
    </div>
  );
}

// ════════ PUBLIC SURVEY ════════

// ════════ LOGO DEL COLEGIO ════════
const GI_SCHOOL_LOGO = "data:image/png;base64,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";

function SchoolLogo({ size = 40, style = {} }) {
  return (
    <img
      src={GI_SCHOOL_LOGO}
      alt="GI School"
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.15)", flexShrink: 0, ...style }}
    />
  );
}

function PublicSurvey({ surveyId }) {
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
        const [svDoc, stSnap] = await Promise.all([
          getDoc(doc(db, "surveys", surveyId)),
          getDocs(collection(db, "students")),
        ]);
        if (!svDoc.exists()) { setStep("error"); return; }
        const svData = { id: svDoc.id, ...svDoc.data() };
        if (svData.status !== "active") { setStep("error"); return; }
        setSurvey(svData);
        const stList = stSnap.docs.map(d => d.data());
        setStudents(stList);
        // Inicializar grupos disponibles según config de la encuesta
        const allGs = [...new Set(stList.map(s => s.group))];
        const surveyGs = svData.groups?.length > 0 ? svData.groups : svData.group ? [svData.group] : allGs;
        const validGs = surveyGs.filter(g => allGs.includes(g));
        setSelectedGroups(validGs.length > 0 ? validGs : allGs);
        setStep("select");
      } catch (e) { setStep("error"); }
    };
    loadData();
  }, [surveyId]);

  const toggleGroup = (g) => setSelectedGroups(p =>
    p.includes(g) ? (p.length > 1 ? p.filter(x => x !== g) : p) : [...p, g]
  );

  const selectRespondent = async (student) => {
    try {
      const respDoc = await getDoc(doc(db, "responses", `${surveyId}_${student.id}`));
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
      await setDoc(doc(db, "responses", `${surveyId}_${respondent.id}`), {
        surveyId, respondentId: respondent.id, respondentName: respondent.name,
        answers, submittedAt: serverTimestamp(),
      });
      setStep("done"); setAlreadyDone(false);
    } catch (e) { alert("Error al guardar. Intenta de nuevo."); }
    setSaving(false);
  };

  const bg = (
    <div style={{ position: "fixed", inset: 0, background: "#07070f", zIndex: 0 }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 25% 20%, #ff4d6a0a, transparent 55%), radial-gradient(ellipse at 75% 80%, #a78bfa08, transparent 55%)" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
    </div>
  );

  if (step === "loading") return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif" }}>
      {bg}
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 14 }}>
        <SchoolLogo size={44} />
        <Logo size="md" />
      </div>
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 10, color: "#9498ae", fontSize: 13 }}>
        <div style={{ width: 16, height: 16, border: "2px solid #252637", borderTopColor: "#ff4d6a", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
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
      (survey?.groups?.length > 0 ? survey.groups : survey?.group ? [survey.group] : [...new Set(students.map(x => x.group))]).includes(s.group)
    ).map(s => s.group))];

    return (
      <div style={{ minHeight: "100vh", padding: 24, fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif" }}>
        {bg}
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap'); *{box-sizing:border-box}`}</style>
        <div style={{ position: "relative", zIndex: 1, maxWidth: 600, margin: "0 auto" }}>

          {/* Header con logos */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, padding: "12px 16px", background: "rgba(22,23,31,0.8)", backdropFilter: "blur(12px)", borderRadius: 14, border: "1px solid rgba(255,77,106,0.15)" }}>
            <SchoolLogo size={48} />
            <Logo size="md" />
          </div>

          {/* Info de la encuesta */}
          <div style={{ background: "rgba(22,23,31,0.85)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,77,106,0.2)", borderRadius: 14, padding: 20, marginBottom: 14 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: "#eaedf6" }}>{survey?.title}</div>
            <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#9498ae" }}>
              <span>📋 {survey?.questions?.length} preguntas</span>
              <span>🎯 Máx. {survey?.maxSel} selecciones</span>
              <span>👥 {filtered.length} participantes</span>
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
                  const gc = GC[g] || "#ff4d6a";
                  return (
                    <button key={g} onClick={() => toggleGroup(g)} style={{
                      padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit", transition: "all .2s",
                      border: `1.5px solid ${on ? gc : "rgba(255,255,255,0.1)"}`,
                      background: on ? gc + "22" : "transparent",
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
              const gc = GC[s.group] || "#ff4d6a";
              return (
                <button key={s.id} onClick={() => selectRespondent(s)} style={{
                  background: "rgba(22,23,31,0.85)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12, padding: "12px 14px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10,
                  transition: "all .2s", fontFamily: "inherit", textAlign: "left",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = gc; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.background = gc + "10"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "none"; e.currentTarget.style.background = "rgba(22,23,31,0.85)"; }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: gc + "20", border: `1.5px solid ${gc}40`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: gc, flexShrink: 0 }}>{s.av}</div>
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
    const surveyGs = survey?.groups?.length > 0 ? survey.groups : survey?.group ? [survey.group] : null;
    const otherStudents = students.filter(s => s.id !== respondent.id && (surveyGs ? surveyGs.includes(s.group) : true));

    return (
      <div style={{ minHeight: "100vh", padding: 24, fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif" }}>
        {bg}
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap'); *{box-sizing:border-box} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto" }}>

          {/* Header mini con logos */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, padding: "8px 14px", background: "rgba(22,23,31,0.8)", backdropFilter: "blur(12px)", borderRadius: 12, border: "1px solid rgba(255,77,106,0.12)" }}>
            <SchoolLogo size={34} />
            <Logo size="sm" />
          </div>

          {/* Barra de progreso */}
          <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
            {survey.questions.map((_, i) => (
              <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i < qIdx ? "#34d399" : i === qIdx ? "#ff4d6a" : "rgba(255,255,255,0.1)", transition: "all .4s", boxShadow: i === qIdx ? "0 0 8px #ff4d6a60" : undefined }} />
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#eaedf6", marginBottom: 16, textAlign: "center", fontWeight: 600 }}>
            <span style={{ color: "#ff4d6a" }}>Pregunta {qIdx + 1}</span>
            <span style={{ color: "#555770" }}> de {survey.questions.length}</span>
          </div>

          {/* Card de pregunta */}
          <div style={{ background: "rgba(22,23,31,0.9)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: (GC[respondent.group] || "#ff4d6a") + "20", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 10, color: GC[respondent.group] || "#ff4d6a" }}>{respondent.av}</div>
              <span style={{ fontSize: 12, color: "#9498ae" }}>{respondent.name}</span>
              <button onClick={() => setStep("select")} style={{ marginLeft: "auto", background: "none", border: "none", color: "#555770", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>← Cambiar</button>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: q.tp === "neg" ? "#f87171" : "#eaedf6", lineHeight: 1.4 }}>{q.text}</div>
            <div style={{ fontSize: 11, color: "#555770", marginBottom: 14 }}>Selecciona hasta {survey.maxSel} personas</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {otherStudents.map(s => {
                const on = sel.includes(s.id);
                const gc = GC[s.group] || "#ff4d6a";
                return (
                  <button key={s.id} onClick={() => toggleSel(q.id, s.id)} style={{
                    background: on ? gc + "12" : "rgba(18,19,26,0.8)", border: `1.5px solid ${on ? gc : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 10, padding: "10px 14px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 10,
                    transition: "all .2s", fontFamily: "inherit",
                  }}>
                    <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${on ? gc : "rgba(255,255,255,0.15)"}`, background: on ? gc : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s" }}>
                      {on && <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>✓</span>}
                    </div>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: gc + "18", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 10, color: gc }}>{s.av}</div>
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
                style={{ flex: 1, padding: "11px 20px", borderRadius: 10, border: "none", background: "#ff4d6a", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Siguiente →
              </button>
            ) : (
              <button onClick={submitSurvey} disabled={saving}
                style={{ flex: 1, padding: "11px 20px", borderRadius: 10, border: "none", background: saving ? "#333" : "#ff4d6a", color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.6 : 1 }}>
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

export default function App() {
  // ── Detectar encuesta pública PRIMERO con estado (no early return antes de hooks) ──
  const [publicSurveyId] = useState(() => new URLSearchParams(window.location.search).get("survey"));

  // ── TEMA ──────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("rednexo-theme");
    return saved ? saved === "dark" : true;
  });

  useEffect(() => {
    if (isDark) { document.documentElement.classList.remove("light"); localStorage.setItem("rednexo-theme", "dark"); }
    else { document.documentElement.classList.add("light"); localStorage.setItem("rednexo-theme", "light"); }
  }, [isDark]);

  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState("login");
  const [tab, setTab] = useState("dashboard");
  const [filter, setFilter] = useState("all");
  const [selNode, setSelNode] = useState(null);
  const [students, setStudents] = useState(initStudents);
  const [groups, setGroups] = useState(
    DEFAULT_GROUPS.map((n, i) => ({ id: "g" + (i + 1), name: n, color: GROUP_COLORS[i] }))
  );
  const [conns, setConns] = useState(initConns);
  const [surveys, setSurveys] = useState([]);
  const dynGROUPS = groups.map((g) => g.name);
  const dynGC = Object.fromEntries(groups.map((g) => [g.name, g.color]));
  GROUPS = dynGROUPS;
  GC = dynGC;
  const [visibleGroups, setVisibleGroups] = useState(DEFAULT_GROUPS.slice());
  const toggleGroup = (g) => setVisibleGroups((p) => p.includes(g) ? (p.length > 1 ? p.filter((x) => x !== g) : p) : [...p, g]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, "groups"), (snap) => { const data = snap.docs.map((d) => d.data()); if (data.length > 0) { setGroups(data); setVisibleGroups(data.map((g) => g.name)); } }, (err) => console.log("Grupos offline"));
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, "students"), (snap) => { const data = snap.docs.map((d) => d.data()); if (data.length > 0) setStudents(data); }, (err) => console.log("Estudiantes offline"));
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "surveys"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => { setSurveys(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); }, () => {});
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, "responses"), (snap) => {
      if (snap.empty) { setConns(initConns); return; }
      const acc = {};
      snap.docs.forEach((d) => {
        const r = d.data();
        const sv = surveys.find((s) => s.id === r.surveyId);
        if (!r.answers) return;
        Object.entries(r.answers).forEach(([qId, selected]) => {
          const q = sv?.questions?.find((x) => String(x.id) === String(qId));
          const tp = q?.tp || "pos";
          (selected || []).forEach((toId) => {
            const key = `${r.respondentId}_${toId}`;
            if (!acc[key]) acc[key] = { f: r.respondentId, t: toId, tpCounts: { pos: 0, neg: 0, neu: 0 }, count: 0 };
            acc[key].tpCounts[tp] = (acc[key].tpCounts[tp] || 0) + 1;
            acc[key].count++;
          });
        });
      });
      const built = Object.values(acc).map((c) => { const tp = Object.entries(c.tpCounts).sort((a, b) => b[1] - a[1])[0][0]; return { f: c.f, t: c.t, s: Math.min(c.count, 3), tp }; });
      setConns(built.length > 0 ? built : initConns);
    }, () => setConns(initConns));
    return () => unsub();
  }, [user, surveys]);

  const saveGroup = async (g) => { setGroups((p) => { const ex = p.find((x) => x.id === g.id); return ex ? p.map((x) => (x.id === g.id ? g : x)) : [...p, g]; }); try { await setDoc(doc(db, "groups", g.id), g); } catch (e) { console.log(e); } };
  const deleteGroup = async (id) => { setGroups((p) => p.filter((x) => x.id !== id)); try { await deleteDoc(doc(db, "groups", id)); } catch (e) { console.log(e); } };
  const saveStudent = async (s) => { const sid = s.id.toString(); setStudents((p) => { const ex = p.find((x) => x.id === s.id); return ex ? p.map((x) => (x.id === s.id ? s : x)) : [...p, s]; }); try { await setDoc(doc(db, "students", sid), { ...s, id: sid }); } catch (e) { console.log(e); } };
  const deleteStudent = async (id) => { setStudents((p) => p.filter((x) => x.id !== id)); try { await deleteDoc(doc(db, "students", id.toString())); } catch (e) { console.log(e); } };
  const authorizeUser = async (email, role = "psychologist") => { try { await setDoc(doc(db, "users", email.toLowerCase()), { email: email.toLowerCase(), role, status: "active", createdAt: serverTimestamp() }); return true; } catch (e) { return false; } };
  const revokeUser = async (email) => { try { await updateDoc(doc(db, "users", email.toLowerCase()), { status: "revoked", role: "readonly" }); return true; } catch (e) { return false; } };
  const saveStudentFS = async (s) => { try { await setDoc(doc(db, "students", String(s.id)), s); } catch (e) {} };
  const deleteStudentFS = async (id) => { try { await deleteDoc(doc(db, "students", String(id))); } catch (e) {} };
  const saveGroupFS = async (g) => { try { await setDoc(doc(db, "groups", g.id), g); } catch (e) {} };
  const deleteGroupFS = async (id) => { try { await deleteDoc(doc(db, "groups", id)); } catch (e) {} };

  const ADMIN_EMAIL = "franksanlo@gmail.com";
  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const email = fbUser.email.toLowerCase().trim();
        if (email === ADMIN_EMAIL.toLowerCase()) {
          setUser({ role: "superadmin", email, name: fbUser.displayName || "Super Admin", photo: fbUser.photoURL });
        } else {
          try {
            const uDoc = await getDoc(doc(db, "users", email));
            if (uDoc.exists()) {
              const data = uDoc.data();
              if (data.status === "pending") { await logout(); setLoginError("Tu cuenta está pendiente de aprobación."); setUser(null); } else { setUser({ role: data.role || "readonly", email, name: fbUser.displayName || email, photo: fbUser.photoURL }); }
            } else { setUser({ role: "readonly", email, name: fbUser.displayName || email, photo: fbUser.photoURL }); }
          } catch (e) { setUser({ role: "readonly", email, name: fbUser.displayName || email, photo: fbUser.photoURL }); }
        }
      } else { setUser(null); }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const handleGoogleLogin = async () => {
    setLoginLoading(true); setLoginError("");
    try { await loginWithGoogle(); } catch (e) { if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") { setLoginError("Error al iniciar sesión con Google."); } setLoginLoading(false); }
  };

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
  if (publicSurveyId) return <PublicSurvey surveyId={publicSurveyId} />;

  if (!user) {
    if (authView === "register") return (<RegistrationPage onSubmit={() => {}} onBack={() => setAuthView("login")} />);
    return (<LoginPage onGoogleLogin={handleGoogleLogin} onRegister={() => setAuthView("register")} loading={loginLoading} error={loginError} />);
  }

  const { role } = user;
  const ri = ROLES[role];
  const isAdmin = role === "superadmin";
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

      <header style={{ padding: "12px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 14, background: `${C.bg}ee`, backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 50, boxShadow: `0 1px 24px rgba(0,0,0,0.25)` }}>
        <Logo size="md" />
        <div style={{ width: 1, height: 36, background: `linear-gradient(to bottom, transparent, ${C.rx}50, transparent)`, flexShrink: 0 }} />
        <SchoolLogo size={44} style={{ boxShadow: `0 0 16px rgba(255,77,106,0.2)` }} />
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 2, background: C.surface, borderRadius: 9, padding: 3, border: `1px solid ${C.border}`, overflowX: "auto" }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "5px 12px", borderRadius: 7, border: "none", fontFamily: "inherit", background: tab === t.id ? `linear-gradient(135deg,${C.rx},#ff8a5c)` : "transparent", color: tab === t.id ? "#fff" : C.t2, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 3, transition: "all .2s", whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 11 }}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />

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
        <Btn sm v="ghost" onClick={() => { logout(); setUser(null); }}>Salir</Btn>
      </header>

      {role === "readonly" && (
        <div style={{ background: C.skyDim, borderBottom: `1px solid ${C.sky}20`, padding: "5px 22px", fontSize: 11, color: C.sky }}>
          👁 Modo solo lectura
        </div>
      )}

      <main style={{ padding: 22, animation: "slideIn .3s ease" }}>
        {tab === "dashboard" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
              {[
                { i: "👥", v: students.length, l: "Participantes", c: C.rx, t: "+12%" },
                { i: "🔗", v: conns.length, l: "Conexiones", c: C.teal, t: "+8%" },
                { i: "📊", v: "3.2", l: "Densidad", c: C.amber, t: "-2%" },
                { i: "🎯", v: GROUPS.length, l: "Grupos", c: C.violet, t: "+5%" },
              ].map((s) => (
                <Card key={s.l} glow={s.c} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: s.c + "12", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{s.i}</div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{s.v}</div>
                    <div style={{ fontSize: 9, color: C.t2, textTransform: "uppercase", letterSpacing: ".4px" }}>{s.l}</div>
                    <div style={{ fontSize: 9, color: s.t.startsWith("+") ? C.ok : C.err }}>{s.t.startsWith("+") ? `↑ ${s.t}` : `↓ ${s.t}`}</div>
                  </div>
                </Card>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2.2fr .8fr", gap: 12 }}>
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Sociograma Interactivo</span>
                    <span style={{ fontSize: 10, color: C.t3 }}>Click en nodo</span>
                    <div style={{ display: "flex", gap: 3, marginLeft: 4 }}>
                      {GROUPS.map((g) => (
                        <button key={g} onClick={() => toggleGroup(g)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 5, fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${visibleGroups.includes(g) ? GC[g] + "80" : C.border}`, background: visibleGroups.includes(g) ? GC[g] + "18" : "transparent", color: visibleGroups.includes(g) ? GC[g] : C.t3, transition: "all .2s" }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: visibleGroups.includes(g) ? GC[g] : C.t3 + "50", display: "inline-block" }} />{g}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 2 }}>
                    {filters.map((f) => (
                      <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${filter === f.id ? f.c + "40" : C.border}`, background: filter === f.id ? f.c + "12" : "transparent", color: filter === f.id ? f.c : C.t3, transition: "all .2s" }}>{f.l}</button>
                    ))}
                  </div>
                </div>
                <div style={{ position: "relative", height: 420, overflow: "hidden" }}>
                  <SociogramCanvas
                    filter={filter} selNode={selNode} setSelNode={setSelNode}
                    students={students.filter((s) => visibleGroups.includes(s.group))}
                    conns={conns.filter((c) => { const vs = students.filter((s) => visibleGroups.includes(s.group)); return vs.some((s) => s.id === c.f) && vs.some((s) => s.id === c.t); })}
                  />
                  <div style={{ position: "absolute", bottom: 8, left: 8, display: "flex", gap: 8, background: `${C.bg}dd`, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}` }}>
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
                      onFocus={e => e.target.style.borderColor = C.rx + "60"}
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
                        <div style={{ width: 42, height: 42, borderRadius: 10, background: (GC[sp.group] || "#ff4d6a") + "18", border: `2px solid ${GC[sp.group]}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: GC[sp.group] }}>{sp.av}</div>
                        <div><div style={{ fontSize: 14, fontWeight: 700 }}>{sp.name}</div><div style={{ fontSize: 11, color: GC[sp.group] }}>{sp.group}</div></div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 12 }}>
                        {[{ l: "Elecciones", v: pC.filter((c) => c.f === selNode).length, c: C.rx }, { l: "Recibidas", v: pC.filter((c) => c.t === selNode).length, c: C.teal }, { l: "Recíprocas", v: 2, c: C.amber }, { l: "Índice", v: "0.72", c: C.violet }].map((m) => (
                          <div key={m.l} style={{ background: C.bgSub, borderRadius: 8, padding: "7px 8px", textAlign: "center" }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: m.c }}>{m.v}</div>
                            <div style={{ fontSize: 8, color: C.t3, textTransform: "uppercase" }}>{m.l}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, marginBottom: 5 }}>CONEXIONES</div>
                      {pC.slice(0, 5).map((c, i) => {
                        const o = students.find((p) => p.id === (c.f === selNode ? c.t : c.f));
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 7px", borderRadius: 6, background: C.bgSub, fontSize: 11, marginBottom: 2 }}>
                            <span style={{ color: C.rx, fontFamily: "monospace" }}>{c.f === selNode ? "→" : "←"}</span>
                            <span style={{ flex: 1 }}>{o?.name}</span>
                            {[...Array(c.s)].map((_, j) => (<span key={j} style={{ color: c.tp === "pos" ? C.teal : c.tp === "neg" ? C.err : C.amber, fontSize: 7 }}>●</span>))}
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div style={{ textAlign: "center", padding: "28px 14px" }}>
                      <div style={{ fontSize: 32, opacity: 0.15, marginBottom: 6 }}>◎</div>
                      <div style={{ fontSize: 11, color: C.t3 }}>Selecciona un nodo</div>
                    </div>
                  )}
                </Card>
                <Card>
                  <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: C.rx }}>🏆 Top Conexiones</div>
                  {students.slice(0, 4).map((p, i) => {
                    const cnt = conns.filter((c) => c.f === p.id || c.t === p.id).length;
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0", borderBottom: i < 3 ? `1px solid ${C.border}` : "none" }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: i === 0 ? C.amber : C.t3, fontFamily: "monospace", width: 16 }}>#{i + 1}</span>
                        <span style={{ fontSize: 11, flex: 1 }}>{p.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.rx }}>{cnt}</span>
                      </div>
                    );
                  })}
                </Card>
              </div>
            </div>
          </>
        )}

        {tab === "surveys" && <SurveyBuilder role={role} students={students} GROUPS={dynGROUPS} />}
        {tab === "matrix" && <SocioMatrix students={students} conns={conns} />}
        {tab === "groups" && (canEdit ? (
          <GroupMgmt students={students} setStudents={setStudents} groups={groups} setGroups={setGroups} GC={dynGC} GROUPS={dynGROUPS} saveStudentFS={saveStudentFS} deleteStudentFS={deleteStudentFS} saveGroupFS={saveGroupFS} deleteGroupFS={deleteGroupFS} canEdit={canEdit} />
        ) : (
          <div style={{ textAlign: "center", padding: 40, color: C.t3 }}>👁 Solo lectura — No puedes gestionar grupos</div>
        ))}
        {tab === "users" && isAdmin && <UsersPanel authorizeUser={authorizeUser} revokeUser={revokeUser} />}
        {tab === "reports" && <ReportsPanel students={students} conns={conns} />}
        {tab === "activity" && isAdmin && (<><PageHeader title="Registro de Actividad" subtitle="Auditoría completa de acciones del sistema" /><ActivityLog /></>)}
        {tab === "settings" && isAdmin && <SettingsPanel />}
      </main>
    </div>
  );
}
