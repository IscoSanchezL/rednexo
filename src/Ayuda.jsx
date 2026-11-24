import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GLOSARIO } from "./lib/glosario.js";

/** Botón «ⓘ» que abre una explicación corta del indicador (qué es, cómo leerlo y cuándo vigilar). */
export function Ayuda({ clave, align = "left" }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null), pop = useRef(null);
  const [dx, setDx] = useState(0);
  const [fijo, setFijo] = useState(null);   // en pantallas angostas el cuadro ocupa el ancho de la pantalla (si no, ensancha la página)
  const g = GLOSARIO[clave];
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    const tecla = (e) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera); document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto]);
  // Escritorio: si el cuadro se sale por un lado, se corre lo necesario.
  useLayoutEffect(() => {
    if (!abierto || fijo || !pop.current) { setDx(0); return; }
    const r = pop.current.getBoundingClientRect(), W = document.documentElement.clientWidth, m = 8;
    setDx(r.right > W - m ? W - m - r.right : r.left < m ? m - r.left : 0);
  }, [abierto, fijo]);
  if (!g) return null;
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button type="button" aria-label={`Qué es: ${g.titulo}`} aria-expanded={abierto} data-ayuda={clave} onClick={(e) => { e.stopPropagation(); if (!abierto) { const r = e.currentTarget.getBoundingClientRect(); setFijo(window.innerWidth <= 640 ? { top: Math.min(r.bottom + 6, window.innerHeight - 120) } : null); } setAbierto((v) => !v); }}
        style={{ width: 16, height: 16, borderRadius: "50%", border: "1px solid var(--c-borderLit)", background: "transparent", color: "var(--c-t2)", fontSize: 10, fontWeight: 700, lineHeight: "14px", cursor: "pointer", padding: 0, marginLeft: 4, fontFamily: "inherit" }}>i</button>
      {abierto && (
        <span ref={pop} role="dialog" aria-label={g.titulo} style={{ ...(fijo ? { position: "fixed", top: fijo.top, left: 8, right: 8, width: "auto", maxHeight: "70vh", overflowY: "auto" } : { position: "absolute", top: 22, [align]: 0, transform: `translateX(${dx}px)`, width: 270, maxWidth: "80vw" }), zIndex: 80, textAlign: "left", textTransform: "none", letterSpacing: 0, background: "var(--c-surface)", color: "var(--c-text)", border: "1px solid var(--c-borderLit)", borderRadius: 10, padding: "10px 12px", fontSize: 12, fontWeight: 400, lineHeight: 1.45, boxShadow: "0 10px 30px rgba(0,0,0,.35)", display: "block" }}>
          <b style={{ display: "block", marginBottom: 4, fontSize: 13 }}>{g.titulo}</b>
          <span style={{ display: "block", marginBottom: 6 }}>{g.que}</span>
          <span style={{ display: "block", marginBottom: 6, color: "var(--c-t2)" }}><b>Cómo leerlo:</b> {g.como}</span>
          <span style={{ display: "block", color: "var(--c-amber)" }}><b>Cuándo vigilar:</b> {g.vigilar}</span>
          <span style={{ display: "block", marginTop: 6, fontSize: 10, color: "var(--c-t3)" }}>Pauta orientativa: apoya tu criterio profesional, no es un diagnóstico.</span>
        </span>
      )}
    </span>
  );
}
