// Exportación y borrado completo de un colegio (lógica pura, sin Firebase).

/** Subcolecciones de colegios/{id}: se exportan y se borran todas. */
export const COLEGIO_SUBCOLLECTIONS = ["students", "groups", "surveys", "responses", "responseMarks", "activity", "settings", "miembros"];

/** Convierte valores de Firestore (Timestamp) a texto ISO para poder guardarlos como JSON. */
export function toPlain(v) {
  if (v === null || v === undefined) return v === undefined ? undefined : null;
  if (typeof v === "object" && typeof v.toDate === "function") { try { return v.toDate().toISOString(); } catch (e) { return null; } }
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(toPlain);
  if (typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) { const y = toPlain(x); if (y !== undefined) out[k] = y; }
    return out;
  }
  return v;
}

/** Paquete de exportación: todo lo del colegio, con conteos para verificar que nada se perdió. */
export function buildExport(colegio, collections, now = new Date()) {
  const datos = {}, conteos = {};
  for (const name of COLEGIO_SUBCOLLECTIONS) {
    const docs = collections[name] || [];
    datos[name] = docs.map((d) => toPlain(d));
    conteos[name] = docs.length;
  }
  return { formato: "rednexo-export-v1", colegio: { id: colegio.id, nombre: colegio.nombre || colegio.id, estado: colegio.estado || "activo" }, exportadoEn: now.toISOString(), conteos, datos };
}

export function exportFileName(colegioId, now = new Date()) {
  return `rednexo-${colegioId}-${now.toISOString().slice(0, 10)}.json`;
}

/** Eliminar un colegio exige escribir su identificador exacto. */
export function confirmaEliminar(colegioId, escrito) {
  return !!colegioId && String(escrito || "").trim() === colegioId;
}

/** Texto legible de un colegio suspendido. */
export function etiquetaEstado(estado) {
  return estado === "suspendido" ? "Suspendido" : "Activo";
}
