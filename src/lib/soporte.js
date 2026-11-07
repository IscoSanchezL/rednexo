// Botón «Soporte»: conexión con la plataforma central de tickets (Iskonex Soporte). Lógica sin React para poder probarla.
// RedNexo maneja datos de menores: al soporte solo viaja el rol y el nombre del colegio (lista cerrada, ver contextoSoporte).
export const SOPORTE_APP = "rednexo";
export const SOPORTE_AVISO = "No escriba nombres de estudiantes ni datos personales de menores en este mensaje.";
export const SOPORTE_URL_PRODUCCION = "https://soporte.iskonex.com";

/** ¿Es la encuesta pública que responden los estudiantes? Ahí el botón de soporte no existe. */
export function esEncuestaPublica(search) {
  return new URLSearchParams(search || "").has("survey");
}

/** Dirección del widget. En pruebas con emuladores NO se carga el real salvo que se indique otra dirección. */
export function urlSoporte({ override, emuladores } = {}) {
  if (override) return String(override).replace(/\/+$/, "");
  return emuladores ? null : SOPORTE_URL_PRODUCCION;
}

const corto = (v, n) => String(v ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, n);
/**
 * Contexto que se adjunta al ticket. LISTA CERRADA: solo rol y colegio, aunque quien llame pase más campos.
 * Nunca estudiantes, respuestas, ids, correos de otros ni datos de pago.
 */
export function contextoSoporte(datos) {
  return { rol: corto(datos?.rol, 30) || "sin sesión", colegio: corto(datos?.colegio, 80) };
}

/** Carga el script una sola vez. Devuelve window.IskonexSoporte o null si no se pudo (sin red, bloqueado…). */
export function cargarWidget({ base, app = SOPORTE_APP, doc = globalThis.document, win = globalThis.window } = {}) {
  if (!base) return Promise.resolve(null);
  if (win.IskonexSoporte) return Promise.resolve(win.IskonexSoporte);
  if (win.__soporteCarga) return win.__soporteCarga;
  win.__soporteCarga = new Promise((resolve) => {
    const s = doc.createElement("script");
    s.src = `${base}/widget.js`; s.async = true;
    s.dataset.app = app; s.dataset.button = "false";   // el botón lo ponemos nosotros, en la cabecera
    s.onload = () => resolve(win.IskonexSoporte || null);
    s.onerror = () => { win.__soporteCarga = null; s.remove(); resolve(null); };
    doc.head.appendChild(s);
  });
  return win.__soporteCarga;
}

/** Datos que se entregan al widget: con sesión (verificado) o sin ella (solo «No puedo entrar»). */
export function configuracionSoporte({ sesion, rol, colegio, getIdToken, version }) {
  const base = { notice: SOPORTE_AVISO, version: version || "" };
  if (!sesion) return { ...base, user: null, getIdToken: null, context: () => contextoSoporte({ rol: "sin sesión" }) };
  return { ...base, user: { email: sesion.email, name: sesion.name || "" }, getIdToken, context: () => contextoSoporte({ rol, colegio }) };
}
