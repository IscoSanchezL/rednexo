import { Component } from "react";

/** Solo para pruebas con emuladores: provoca un error de dibujo para comprobar que la pantalla de aviso funciona. */
export const Boom = () => { throw new Error("error de prueba"); };

/** Evita la pantalla en blanco: si algo falla al dibujar, se muestra un aviso con opción de recargar y el resto de la app sigue viva. */
export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Error de pantalla:", error, info && info.componentStack); }
  componentDidUpdate(prev) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }); }   // al cambiar de sección se vuelve a intentar
  render() {
    if (!this.state.error) return this.props.children;
    const compacto = this.props.compacto;
    return (
      <div role="alert" data-error-pantalla style={{ maxWidth: 520, margin: compacto ? "40px auto" : "20vh auto", padding: 24, textAlign: "center", fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif", color: "var(--c-text, #111)", border: compacto ? "1px solid var(--c-border, #ccc)" : "none", borderRadius: 14, background: compacto ? "var(--c-card, #fff)" : "transparent" }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Algo no salió como esperábamos</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--c-t2, #555)", marginBottom: 16 }}>
          {compacto ? "Esta sección no se pudo mostrar. Tus datos están a salvo. Puedes volver a intentarlo o recargar la página." : "La página no se pudo mostrar. Tus datos están a salvo. Recarga la página para continuar."}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {compacto && <button type="button" onClick={() => this.setState({ error: null })} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--c-border, #ccc)", background: "transparent", color: "inherit", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Reintentar</button>}
          <button type="button" onClick={() => window.location.reload()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--c-rx, #2563eb)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Recargar la página</button>
        </div>
      </div>
    );
  }
}
