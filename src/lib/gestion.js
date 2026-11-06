// Registro comercial de los colegios: pagos, historial de licencias y cartera. Lógica pura (sin Firebase ni React).
import { aMs } from "./licencia.js";

export const MEDIOS_PAGO = { transferencia: "Transferencia", link: "Link de pago / tarjeta", efectivo: "Efectivo / consignación", otro: "Otro" };

/** Valida el formulario de un pago. Devuelve { ok, errores, pago } con el valor y la fecha ya normalizados. */
export function validarPago(f) {
  const errores = [];
  const valor = Number(String(f?.valor ?? "").replace(/[.\s$]/g, "").replace(",", "."));
  if (!Number.isFinite(valor) || valor <= 0 || !Number.isInteger(valor)) errores.push("El valor debe ser un número entero mayor que cero (pesos).");
  const ms = f?.fecha ? Date.parse(f.fecha + "T12:00:00Z") : NaN;
  if (!Number.isFinite(ms)) errores.push("La fecha del pago no es válida.");
  else if (ms > Date.now() + 86400000) errores.push("La fecha del pago no puede ser futura.");
  if (!MEDIOS_PAGO[f?.medio]) errores.push("Elige el medio de pago.");
  return { ok: errores.length === 0, errores, pago: { valor, fechaMs: ms, medio: f?.medio, referencia: String(f?.referencia || "").trim().slice(0, 80), factura: String(f?.factura || "").trim().slice(0, 40), contratoId: f?.contratoId || null, nota: String(f?.nota || "").trim().slice(0, 300) } };
}

/** Resumen de un colegio: total pagado, último pago y pagado por año. */
export function resumenPagos(pagos) {
  const porAnio = {};
  let total = 0, ultimo = null;
  for (const p of pagos || []) {
    const ms = aMs(p.fecha);
    total += Number(p.valor) || 0;
    if (ms != null) { const y = new Date(ms).getUTCFullYear(); porAnio[y] = (porAnio[y] || 0) + (Number(p.valor) || 0); if (ultimo == null || ms > ultimo) ultimo = ms; }
  }
  return { total, ultimo, porAnio };
}

/** Cartera: una fila por colegio y totales por año. `datos` = [{ colegio, pagos, historial }]. */
export function carteraGeneral(datos) {
  const porAnio = {};
  const filas = datos.map(({ colegio, pagos, historial }) => {
    const r = resumenPagos(pagos);
    for (const [y, v] of Object.entries(r.porAnio)) porAnio[y] = (porAnio[y] || 0) + v;
    const plan = (historial || []).slice().sort((a, b) => (aMs(b.creadoEn) || 0) - (aMs(a.creadoEn) || 0))[0];
    return { id: colegio.id, nombre: colegio.nombre || colegio.id, plan: colegio.licencia?.plan || null, vence: aMs(colegio.licencia?.vence), precio: colegio.licencia?.precio || 0, pagado: r.total, ultimoPago: r.ultimo, movimientos: (historial || []).length, ultimoMovimiento: plan || null };
  });
  const total = filas.reduce((a, f) => a + f.pagado, 0);
  return { filas, porAnio, total };
}

/** Entrada del historial de licencia (una por cada renovación, cambio de plan o contrato). */
export function entradaHistorial({ accion, licencia, por, contratoId = null, descuentoPct = 0 }) {
  return { accion, plan: licencia?.plan || null, maxEstudiantes: licencia?.maxEstudiantes || 0, precio: licencia?.precio || 0, descuentoPct: Number(descuentoPct) || 0, vence: aMs(licencia?.vence), contratoId, por };
}
