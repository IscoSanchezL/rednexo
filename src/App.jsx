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
  const bg = (
    <div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at 25% 25%,${C.rx}06 0%,transparent 60%),radial-gradient(ellipse at 75% 75%,${C.teal}04 0%,transparent 60%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `radial-gradient(${C.border}40 1px,transparent 1px)`,
          backgroundSize: "32px 32px",
        }}
      />
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.06 }}
        viewBox="0 0 800 600"
      >
        {[
          { x1: 100, y1: 80, x2: 300, y2: 150 },
          { x1: 300, y1: 150, x2: 500, y2: 90 },
          { x1: 500, y1: 90, x2: 700, y2: 200 },
          { x1: 150, y1: 400, x2: 350, y2: 480 },
          { x1: 350, y1: 480, x2: 600, y2: 420 },
          { x1: 300, y1: 150, x2: 350, y2: 480 },
        ].map((l, i) => (
          <line key={i} {...l} stroke="#ff4d6a" strokeWidth="1" />
        ))}
        {[
          { cx: 100, cy: 80 },
          { cx: 300, cy: 150 },
          { cx: 500, cy: 90 },
          { cx: 700, cy: 200 },
          { cx: 150, cy: 400 },
          { cx: 350, cy: 480 },
          { cx: 600, cy: 420 },
        ].map((c, i) => (
          <circle key={i} {...c} r="4" fill="#ff4d6a" />
        ))}
      </svg>
    </div>
  );
  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {bg}
      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 420, padding: 24 }}>
        <div style={{ textAlign: "center", marginBottom: 36, display: "flex", justifyContent: "center" }}>
          <Logo size="lg" />
        </div>
        <Card style={{ padding: 30, background: `${C.card}ee`, backdropFilter: "blur(20px)" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
              Bienvenido a RedNexo
            </div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 5, lineHeight: 1.6 }}>
              Accede con tu cuenta institucional de Google.
              <br />
              Solo cuentas aprobadas por el administrador.
            </div>
          </div>

          {error && (
            <div
              style={{
                background: C.err + "15",
                border: `1px solid ${C.err}30`,
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 16,
                fontSize: 12,
                color: C.err,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={onGoogleLogin}
            disabled={loading}
            style={{
              width: "100%",
              padding: "13px 20px",
              borderRadius: 10,
              border: "1px solid #dadce0",
              background: loading ? "#f5f5f5" : "#fff",
              color: "#3c4043",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              transition: "all .2s",
              opacity: loading ? 0.7 : 1,
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.boxShadow = "0 2px 12px rgba(66,133,244,.25)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.transform = "none";
            }}
          >
            {loading ? (
              <div
                style={{
                  width: 18,
                  height: 18,
                  border: "2px solid #dadce0",
                  borderTopColor: "#4285F4",
                  borderRadius: "50%",
                  animation: "spin .7s linear infinite",
                }}
              />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            {loading ? "Verificando cuenta..." : "Continuar con Google"}
          </button>

          <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: C.t3 }}>
            Se abrirá el selector de cuenta de Google
          </div>
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.t2, marginBottom: 9 }}>
              ¿No tienes acceso aprobado?
            </div>
            <Btn v="sec" onClick={onRegister} style={{ width: "100%", justifyContent: "center" }}>
              + Solicitar acceso
            </Btn>
          </div>
        </Card>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
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
  const [hov, setHov] = useState(null);
  const [dims, setDims] = useState({ w: 600, h: 380 });

  useEffect(() => {
    const el = cvRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver((e) =>
      setDims({ w: e[0].contentRect.width, h: Math.max(320, e[0].contentRect.height) })
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cx = dims.w / 2, cy = dims.h / 2, r = Math.min(cx, cy) * 0.6;
    nodesRef.current = students.map((p, i) => {
      const a = (i / students.length) * Math.PI * 2 - Math.PI / 2;
      const tx = cx + Math.cos(a) * r, ty = cy + Math.sin(a) * r;
      return { ...p, x: tx + (Math.random() - 0.5) * 25, y: ty + (Math.random() - 0.5) * 25, vx: 0, vy: 0, tx, ty };
    });
  }, [dims, students]);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");

    const draw = () => {
      cv.width = dims.w * 2;
      cv.height = dims.h * 2;
      ctx.scale(2, 2);
      ctx.clearRect(0, 0, dims.w, dims.h);
      const N = nodesRef.current;
      const dragging = dragRef.current;

      N.forEach((n) => {
        if (dragging && n.id === dragging.id) return;
        n.vx += (n.tx - n.x) * 0.025;
        n.vy += (n.ty - n.y) * 0.025;
        n.vx *= 0.88;
        n.vy *= 0.88;
        n.x += n.vx;
        n.y += n.vy;
      });

      if (dragging) {
        const dragNode = N.find((n) => n.id === dragging.id);
        if (dragNode) {
          const MAGNET_STRENGTH = 0.18, MAGNET_DIST = 120;
          N.forEach((n) => {
            if (n.id === dragNode.id) return;
            const isNeighbor = conns.some((c) => (c.f === dragNode.id && c.t === n.id) || (c.t === dragNode.id && c.f === n.id));
            if (!isNeighbor) return;
            const dx = dragNode.x - n.x, dy = dragNode.y - n.y;
            const dist = Math.hypot(dx, dy);
            if (dist < MAGNET_DIST && dist > 40) {
              const force = MAGNET_STRENGTH * (1 - dist / MAGNET_DIST);
              n.vx += dx * force * 0.4;
              n.vy += dy * force * 0.4;
            }
          });
        }
      }

      const fC = conns.filter((c) => filter === "all" || c.tp === filter);

      fC.forEach((cn) => {
        const f = N.find((n) => n.id === cn.f);
        const t = N.find((n) => n.id === cn.t);
        if (!f || !t) return;
        const hl = !selNode || selNode === f.id || selNode === t.id;
        // Use cc() for canvas raw colors
        const col = cn.tp === "pos" ? cc("teal") : cn.tp === "neg" ? cc("err") : cc("t3");
        const mx = (f.x + t.x) / 2 + (t.y - f.y) * 0.18;
        const my = (f.y + t.y) / 2 - (t.x - f.x) * 0.18;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.quadraticCurveTo(mx, my, t.x, t.y);
        ctx.strokeStyle = col + (hl ? "70" : "12");
        ctx.lineWidth = cn.s * (hl ? 1.3 : 0.4);
        ctx.stroke();
        if (hl) {
          const tt = 0.78;
          const ax = (1 - tt) * (1 - tt) * f.x + 2 * (1 - tt) * tt * mx + tt * tt * t.x;
          const ay = (1 - tt) * (1 - tt) * f.y + 2 * (1 - tt) * tt * my + tt * tt * t.y;
          const ang = Math.atan2(t.y - ay, t.x - ax);
          ctx.beginPath();
          ctx.moveTo(ax + Math.cos(ang) * 5, ay + Math.sin(ang) * 5);
          ctx.lineTo(ax + Math.cos(ang + 2.5) * 4, ay + Math.sin(ang + 2.5) * 4);
          ctx.lineTo(ax + Math.cos(ang - 2.5) * 4, ay + Math.sin(ang - 2.5) * 4);
          ctx.fillStyle = col + "55";
          ctx.fill();
        }
      });

      N.forEach((nd) => {
        const isSel = selNode === nd.id;
        const isHov = hov === nd.id;
        const isDrag = dragging && nd.id === dragging.id;
        const conn = !selNode || isSel || fC.some((c) => (c.f === selNode && c.t === nd.id) || (c.t === selNode && c.f === nd.id));
        const gc = GC[nd.group] || cc("rx");
        const nr = isDrag ? 26 : isSel ? 24 : isHov ? 22 : 19;
        const al = conn ? 1 : 0.12;
        const alH = Math.round(al * 255).toString(16).padStart(2, "0");

        if (isDrag) {
          const gr = ctx.createRadialGradient(nd.x, nd.y, nr, nd.x, nd.y, nr * 3.5);
          gr.addColorStop(0, gc + "35");
          gr.addColorStop(1, "transparent");
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(nd.x, nd.y, nr * 3.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (isSel || isHov) {
          const gr = ctx.createRadialGradient(nd.x, nd.y, nr, nd.x, nd.y, nr * 2.5);
          gr.addColorStop(0, gc + "20");
          gr.addColorStop(1, "transparent");
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(nd.x, nd.y, nr * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        if (isDrag) { ctx.shadowColor = gc + "60"; ctx.shadowBlur = 16; }

        ctx.beginPath();
        ctx.arc(nd.x, nd.y, nr, 0, Math.PI * 2);
        ctx.fillStyle = cc("card") + alH;
        ctx.fill();
        ctx.strokeStyle = isDrag ? gc : gc + alH;
        ctx.lineWidth = isDrag ? 3 : isSel ? 2.5 : 1.5;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = gc + alH;
        ctx.font = `bold ${nr * 0.58}px 'Outfit',system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(nd.av, nd.x, nd.y);

        if (isSel || isHov || isDrag) {
          ctx.fillStyle = cc("text");
          ctx.font = `600 11px 'Outfit',system-ui`;
          ctx.fillText(nd.name, nd.x, nd.y + nr + 14);
          ctx.fillStyle = gc + "aa";
          ctx.font = `10px 'Outfit',system-ui`;
          ctx.fillText(nd.group, nd.x, nd.y + nr + 26);
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
    for (const n of nodesRef.current) if (Math.hypot(n.x - mx, n.y - my) < 26) return n;
    return null;
  };

  const onMouseDown = useCallback((e) => {
    const cv = cvRef.current;
    if (!cv) return;
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
    const cv = cvRef.current;
    if (!cv) return;
    const { mx, my } = getPos(e, cv);
    if (dragRef.current) {
      const node = nodesRef.current.find((n) => n.id === dragRef.current.id);
      if (node) { node.x = mx - dragRef.current.offsetX; node.y = my - dragRef.current.offsetY; node.vx = 0; node.vy = 0; node.tx = node.x; node.ty = node.y; }
      cv.style.cursor = "grabbing";
    } else {
      const found = findNode(mx, my);
      setHov(found ? found.id : null);
      cv.style.cursor = found ? "grab" : "default";
    }
  }, []);

  const onMouseUp = useCallback((e) => {
    const cv = cvRef.current;
    if (!cv) return;
    if (dragRef.current) {
      const { mx, my } = getPos(e, cv);
      const found = findNode(mx, my);
      cv.style.cursor = found ? "grab" : "default";
      dragRef.current = null;
    }
  }, []);

  const onClick = useCallback((e) => {
    if (dragRef.current) return;
    const cv = cvRef.current;
    if (!cv) return;
    const { mx, my } = getPos(e, cv);
    const found = findNode(mx, my);
    if (!found) setSelNode(null);
  }, [setSelNode]);

  return (
    <canvas
      ref={cvRef}
      style={{ width: "100%", height: dims.h, borderRadius: 10, cursor: "default" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClick={onClick}
    />
  );
}

// ════════ SOCIOMETRIC MATRIX ════════

function SocioMatrix({ students, conns }) {
  const [selGroups, setSelGroups] = useState(GROUPS.slice());
  const toggleG = (g) => setSelGroups((p) => p.includes(g) ? (p.length > 1 ? p.filter((x) => x !== g) : p) : [...p, g]);
  const allSel = selGroups.length === GROUPS.length;
  const filteredStudents = students.filter((s) => selGroups.includes(s.group));
  return (
    <div>
      <div style={{ marginBottom: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.t2 }}>Grupos visibles:</span>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button onClick={() => setSelGroups(allSel ? [GROUPS[0]] : GROUPS.slice())} style={{ padding: "4px 11px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${allSel ? C.rx + "50" : C.border}`, background: allSel ? C.rx + "15" : "transparent", color: allSel ? C.rx : C.t3, transition: "all .2s" }}>
            {allSel ? "✓ Todos" : "Todos"}
          </button>
          {GROUPS.map((g) => {
            const on = selGroups.includes(g);
            return (
              <button key={g} onClick={() => toggleG(g)} style={{ padding: "4px 11px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${on ? GC[g] + "80" : C.border}`, background: on ? GC[g] + "18" : "transparent", color: on ? GC[g] : C.t3, transition: "all .2s", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: on ? GC[g] : C.t3 + "40", display: "inline-block", transition: "all .2s" }} />
                {g}
              </button>
            );
          })}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {!allSel && <span style={{ fontSize: 10, color: C.amber, fontWeight: 600 }}>Nivel: {selGroups.join(" + ")}</span>}
          <span style={{ fontSize: 10, color: C.t3 }}>{filteredStudents.length} participante(s)</span>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Matriz Sociométrica</div>
        <div style={{ fontSize: 12, color: C.t2, marginBottom: 14 }}>Visualización de elecciones cruzadas entre participantes</div>
        <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 8px", background: C.surface, border: `1px solid ${C.border}`, position: "sticky", left: 0, zIndex: 2, fontSize: 10, color: C.t3 }}>De ↓ / Para →</th>
              {filteredStudents.map((s) => (
                <th key={s.id} style={{ padding: "6px 4px", background: C.surface, border: `1px solid ${C.border}`, fontSize: 10, color: GC[s.group] || C.t2, fontWeight: 700, minWidth: 36, textAlign: "center" }}>{s.av}</th>
              ))}
              <th style={{ padding: "6px 8px", background: C.rx + "12", border: `1px solid ${C.border}`, fontSize: 10, color: C.rx, fontWeight: 700 }}>Σ+</th>
              <th style={{ padding: "6px 8px", background: C.err + "12", border: `1px solid ${C.border}`, fontSize: 10, color: C.err, fontWeight: 700 }}>Σ−</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((from) => {
              let posCount = 0, negCount = 0;
              return (
                <tr key={from.id}>
                  <td style={{ padding: "6px 8px", background: C.surface, border: `1px solid ${C.border}`, fontWeight: 700, color: GC[from.group] || C.text, position: "sticky", left: 0, zIndex: 1, fontSize: 11 }}>
                    {from.av} <span style={{ fontWeight: 400, color: C.t3, fontSize: 9 }}>{from.name.split(" ")[0]}</span>
                  </td>
                  {filteredStudents.map((to) => {
                    if (from.id === to.id) return (<td key={to.id} style={{ padding: "4px", background: C.t3 + "15", border: `1px solid ${C.border}`, textAlign: "center" }}><span style={{ fontSize: 10, color: C.t3 }}>—</span></td>);
                    const conn = conns.find((c) => c.f === from.id && c.t === to.id);
                    const reverse = conns.find((c) => c.f === to.id && c.t === from.id);
                    const mutual = conn && reverse;
                    if (conn && conn.tp === "pos") posCount++;
                    if (conn && conn.tp === "neg") negCount++;
                    const bg = mutual ? C.ok + "20" : conn ? conn.tp === "pos" ? C.teal + "15" : conn.tp === "neg" ? C.err + "15" : C.amber + "10" : "transparent";
                    const symbol = conn ? conn.tp === "pos" ? mutual ? "⬥" : "＋" : conn.tp === "neg" ? "−" : "○" : "";
                    const col = conn ? conn.tp === "pos" ? mutual ? C.ok : C.teal : conn.tp === "neg" ? C.err : C.amber : C.t3;
                    return (<td key={to.id} style={{ padding: "4px", background: bg, border: `1px solid ${C.border}`, textAlign: "center", cursor: "default", transition: "all .15s" }} title={conn ? `${from.name} → ${to.name}: ${conn.tp}${mutual ? " (mutuo)" : ""}` : "Sin conexión"}><span style={{ fontSize: 12, color: col, fontWeight: mutual ? 800 : 400 }}>{symbol}</span></td>);
                  })}
                  <td style={{ padding: "4px 8px", background: C.rx + "08", border: `1px solid ${C.border}`, textAlign: "center", fontWeight: 700, color: C.teal, fontSize: 12 }}>{posCount}</td>
                  <td style={{ padding: "4px 8px", background: C.err + "08", border: `1px solid ${C.border}`, textAlign: "center", fontWeight: 700, color: C.err, fontSize: 12 }}>{negCount}</td>
                </tr>
              );
            })}
            <tr>
              <td style={{ padding: "6px 8px", background: C.surface, border: `1px solid ${C.border}`, fontWeight: 700, fontSize: 10, color: C.t2, position: "sticky", left: 0 }}>Recibidas ↓</td>
              {filteredStudents.map((to) => {
                const received = conns.filter((c) => c.t === to.id && c.tp === "pos").length;
                const maxR = Math.max(...filteredStudents.map((s) => conns.filter((c) => c.t === s.id && c.tp === "pos").length));
                const intensity = maxR > 0 ? received / maxR : 0;
                return (<td key={to.id} style={{ padding: "4px", background: `rgba(45,212,191,${intensity * 0.3})`, border: `1px solid ${C.border}`, textAlign: "center", fontWeight: 700, color: C.teal, fontSize: 11 }}>{received}</td>);
              })}
              <td colSpan={2} style={{ background: C.surface, border: `1px solid ${C.border}` }} />
            </tr>
          </tbody>
        </table>
        <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 10, color: C.t2 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: C.teal }}>＋</span> Elección positiva</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: C.ok, fontWeight: 800 }}>⬥</span> Elección mutua</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: C.err }}>−</span> Rechazo</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: C.amber }}>○</span> Neutral</span>
        </div>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {GROUPS.map((g) => {
          const members = students.filter((s) => s.group === g);
          const gc = GC[g] || C.violet;
          return (
            <Card key={g} glow={gc}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: gc }} />
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{g}</span>
                  <Badge color={gc}>{members.length}</Badge>
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
                {members.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 7, background: C.surface, border: `1px solid ${C.border}` }}>
                    <span style={{ width: 26, height: 26, borderRadius: 6, background: gc + "18", color: gc, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 9 }}>{s.av}</span>
                    <span style={{ fontSize: 12, flex: 1 }}>{s.name}</span>
                    <button onClick={() => removeStudent(s.id)} style={{ background: "none", border: "none", color: C.err + "80", cursor: "pointer", fontSize: 11 }}>✕</button>
                  </div>
                ))}
                {!members.length && <div style={{ textAlign: "center", padding: 12, color: C.t3, fontSize: 11 }}>Sin participantes</div>}
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
  const [editing, setEditing] = useState(null), [creating, setCreating] = useState(false), [executing, setExecuting] = useState(null);
  const [nS, setNS] = useState({ title: "", group: GROUPS?.[0] || "5° A", maxSel: 3, anon: true, questions: [] });
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

  const deleteSurvey = async (id) => { try { await deleteDoc(doc(db, "surveys", id)); } catch (e) { setSurveys((s) => s.filter((x) => x.id !== id)); } };
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
            <Sel label="Grupo" value={nS.group} onChange={(v) => setNS((s) => ({ ...s, group: v }))} options={GROUPS.map((g) => ({ v: g, l: g }))} />
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
        {canEdit && <div style={{ display: "flex", gap: 8 }}><Btn v="pri" onClick={() => setCreating(true)}>+ Nueva Encuesta</Btn></div>}
      </div>
      {msg && <div style={{ padding: "8px 12px", borderRadius: 8, marginBottom: 10, background: msg.startsWith("✅") ? C.ok + "15" : C.amber + "15", color: msg.startsWith("✅") ? C.ok : C.amber, fontSize: 12 }}>{msg}</div>}
      {loadingS && <div style={{ textAlign: "center", padding: 30, color: C.t3 }}>Cargando encuestas...</div>}
      <ProgressTracker students={students} />
      <div style={{ marginTop: 14 }} />
      {surveys.map((sv) => (
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

function PublicSurvey({ surveyId }) {
  const [survey, setSurvey] = useState(null);
  const [students, setStudents] = useState([]);
  const [step, setStep] = useState("loading");
  const [respondent, setRespondent] = useState(null);
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [svDoc, stSnap] = await Promise.all([getDoc(doc(db, "surveys", surveyId)), getDocs(collection(db, "students"))]);
        if (!svDoc.exists()) { setStep("error"); return; }
        const svData = { id: svDoc.id, ...svDoc.data() };
        if (svData.status !== "active") { setStep("error"); return; }
        setSurvey(svData);
        setStudents(stSnap.docs.map((d) => d.data()));
        setStep("select");
      } catch (e) { setStep("error"); }
    };
    loadData();
  }, [surveyId]);

  const selectRespondent = async (student) => {
    try {
      const respDoc = await getDoc(doc(db, "responses", `${surveyId}_${student.id}`));
      if (respDoc.exists()) { setRespondent(student); setAlreadyDone(true); setStep("done"); return; }
    } catch (e) { console.log("Verificación previa omitida"); }
    setRespondent(student); setAnswers({}); setQIdx(0); setStep("answering");
  };

  const toggleSel = (qId, studentId) => {
    setAnswers((prev) => { const curr = prev[qId] || []; const max = survey?.maxSel || 3; if (curr.includes(studentId)) return { ...prev, [qId]: curr.filter((x) => x !== studentId) }; if (curr.length >= max) return prev; return { ...prev, [qId]: [...curr, studentId] }; });
  };

  const submitSurvey = async () => {
    setSaving(true);
    try { await setDoc(doc(db, "responses", `${surveyId}_${respondent.id}`), { surveyId, respondentId: respondent.id, respondentName: respondent.name, answers, submittedAt: serverTimestamp() }); setStep("done"); setAlreadyDone(false); } catch (e) { alert("Error al guardar. Intenta de nuevo."); }
    setSaving(false);
  };

  const bg = (<div style={{ position: "fixed", inset: 0, background: `radial-gradient(ellipse at 20% 20%,${C.rx}08,transparent 60%),radial-gradient(ellipse at 80% 80%,${C.teal}05,transparent 60%)`, backgroundImage: `radial-gradient(${C.border}35 1px,transparent 1px)`, backgroundSize: "28px 28px", zIndex: 0 }} />);

  if (step === "loading") return (<div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>{bg}<Logo size="lg" /><div style={{ display: "flex", alignItems: "center", gap: 10, color: C.t2, fontSize: 13, position: "relative", zIndex: 1 }}><div style={{ width: 16, height: 16, border: `2px solid ${C.border}`, borderTopColor: C.rx, borderRadius: "50%", animation: "spin .7s linear infinite" }} />Cargando encuesta...</div><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>);
  if (step === "error") return (<div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>{bg}<div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 380 }}><div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div><div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Encuesta no disponible</div><div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6 }}>Este link no es válido o la encuesta no está activa.</div></div></div>);
  if (step === "done") return (<div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>{bg}<div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 400 }}><div style={{ width: 80, height: 80, borderRadius: 20, background: alreadyDone ? C.amber + "20" : C.ok + "20", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 36, marginBottom: 20 }}>{alreadyDone ? "⚠️" : "✅"}</div><div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: alreadyDone ? C.amber : C.ok }}>{alreadyDone ? "Ya respondiste esta encuesta" : "¡Gracias por responder!"}</div><div style={{ fontSize: 13, color: C.t2, lineHeight: 1.7, marginBottom: 6 }}>{alreadyDone ? `${respondent?.name}, ya registraste tus respuestas anteriormente.` : `${respondent?.name}, tus respuestas fueron registradas.`}</div><div style={{ fontSize: 11, color: C.t3 }}>Puedes cerrar esta ventana.</div>{alreadyDone && (<Btn onClick={() => setStep("select")} style={{ marginTop: 20 }}>Seleccionar otro estudiante</Btn>)}</div></div>);

  if (step === "select") {
    const filtered = survey?.group ? students.filter((s) => s.group === survey.group) : students;
    return (
      <div style={{ minHeight: "100vh", background: C.bg, padding: 24 }}>
        {bg}
        <div style={{ position: "relative", zIndex: 1, maxWidth: 540, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}><Logo size="lg" /></div>
          <Card style={{ marginBottom: 14, padding: 20 }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{survey?.title}</div>
            <div style={{ display: "flex", gap: 10, fontSize: 11, color: C.t2 }}>
              <span>📋 {survey?.questions?.length} preguntas</span><span>•</span>
              <span>👥 {survey?.group || "Todos"}</span><span>•</span>
              <span>🎯 Máx. {survey?.maxSel}</span>
            </div>
          </Card>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: C.t2 }}>¿Quién eres tú?</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {filtered.map((s) => { const gc = GC[s.group] || "#ff4d6a"; return (<button key={s.id} onClick={() => selectRespondent(s)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "all .2s", fontFamily: "inherit", textAlign: "left" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = gc; e.currentTarget.style.transform = "translateY(-1px)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.transform = "none"; }}><div style={{ width: 36, height: 36, borderRadius: 9, background: gc + "18", border: `1.5px solid ${gc}30`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: gc, flexShrink: 0 }}>{s.av}</div><div><div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.name}</div><div style={{ fontSize: 10, color: gc }}>{s.group}</div></div></button>); })}
          </div>
        </div>
      </div>
    );
  }

  if (step === "answering") {
    const q = survey.questions[qIdx];
    const sel = answers[q.id] || [];
    const isLast = qIdx === survey.questions.length - 1;
    const otherStudents = students.filter((s) => s.id !== respondent.id && (survey.group ? s.group === survey.group : true));
    return (
      <div style={{ minHeight: "100vh", background: C.bg, padding: 24 }}>
        {bg}
        <div style={{ position: "relative", zIndex: 1, maxWidth: 540, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}><Logo /></div>
          <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
            {survey.questions.map((_, i) => (<div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i < qIdx ? C.ok : i === qIdx ? C.rx : C.border, transition: "all .4s", boxShadow: i === qIdx ? `0 0 8px ${C.rx}60` : undefined }} />))}
          </div>
          <div style={{ fontSize: 11, color: C.text, marginBottom: 16, textAlign: "center", fontWeight: 600 }}>
            <span style={{ color: C.rx }}>Pregunta {qIdx + 1}</span><span style={{ color: C.t3 }}> de {survey.questions.length}</span>
          </div>
          <Card style={{ marginBottom: 14, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: (GC[respondent.group] || "#ff4d6a") + "18", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 10, color: GC[respondent.group] || "#ff4d6a" }}>{respondent.av}</div>
              <span style={{ fontSize: 12, color: C.t2 }}>{respondent.name}</span>
              <button onClick={() => setStep("select")} style={{ marginLeft: "auto", background: "none", border: "none", color: C.t3, fontSize: 11, cursor: "pointer" }}>← Cambiar</button>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: q.tp === "neg" ? C.err : C.text, lineHeight: 1.4 }}>{q.text}</div>
            <div style={{ fontSize: 11, color: C.t3, marginBottom: 14 }}>Selecciona hasta {survey.maxSel} personas</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {otherStudents.map((s) => { const on = sel.includes(s.id); const gc = GC[s.group] || "#ff4d6a"; return (<button key={s.id} onClick={() => toggleSel(q.id, s.id)} style={{ background: on ? gc + "12" : C.surface, border: `1.5px solid ${on ? gc : C.border}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "all .2s", fontFamily: "inherit" }}><div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${on ? gc : C.border}`, background: on ? gc : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s" }}>{on && <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>✓</span>}</div><div style={{ width: 28, height: 28, borderRadius: 7, background: gc + "15", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 10, color: gc }}>{s.av}</div><span style={{ fontSize: 13, color: C.text, flex: 1, textAlign: "left" }}>{s.name}</span><span style={{ fontSize: 10, color: gc }}>{s.group}</span></button>); })}
            </div>
          </Card>
          <div style={{ display: "flex", gap: 8 }}>
            {qIdx > 0 && (<Btn onClick={() => { setQIdx((i) => i - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ flex: 1, justifyContent: "center" }}>← Anterior</Btn>)}
            {!isLast ? (<Btn v="pri" onClick={() => { setQIdx((i) => i + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ flex: 1, justifyContent: "center" }}>Siguiente →</Btn>) : (<Btn v="pri" onClick={submitSurvey} disabled={saving} style={{ flex: 1, justifyContent: "center" }}>{saving ? "Guardando..." : "✅ Enviar respuestas"}</Btn>)}
          </div>
        </div>
      </div>
    );
  }
  return null;
}

// ════════ MAIN APP ════════

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const publicSurveyId = urlParams.get("survey");
  if (publicSurveyId) return <PublicSurvey surveyId={publicSurveyId} />;

  // ── TEMA ──────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
    }
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

      <header style={{ padding: "10px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 14, background: `${C.bg}dd`, backdropFilter: "blur(16px)", position: "sticky", top: 0, zIndex: 50 }}>
        <Logo />
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
                <div style={{ position: "relative" }}>
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
