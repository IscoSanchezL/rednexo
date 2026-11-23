// Editar y eliminar grupos (lógica pura, sin Firebase ni React).
import { groupExists, surveyGroups } from "./sociometry.js";

export const MAX_NOMBRE_GRUPO = 60;
const limpio = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

/**
 * Nombre nuevo de un grupo. `existentes`: todos los nombres de grupo; `actual`: el que se está editando
 * (puede cambiar solo mayúsculas/tildes de su propio nombre, pero no repetir el de otro grupo).
 */
export function validarNombreGrupo(nuevo, existentes, actual) {
  const nombre = limpio(nuevo);
  if (!nombre) return { ok: false, error: "Escribe un nombre para el grupo." };
  if (nombre.length > MAX_NOMBRE_GRUPO) return { ok: false, error: `El nombre pasa de ${MAX_NOMBRE_GRUPO} caracteres.` };
  const otros = (existentes || []).filter((n) => n !== actual);
  if (groupExists(otros, nombre)) return { ok: false, error: `Ya existe un grupo llamado «${nombre}».` };
  return { ok: true, nombre };
}

/** Cambios que hay que guardar en una encuesta cuando un grupo cambia de nombre (null si la encuesta no lo usa). */
export function renombrarEnEncuesta(sv, viejo, nuevo) {
  const gs = surveyGroups(sv || {});
  if (!gs.includes(viejo)) return null;
  const groups = gs.map((g) => (g === viejo ? nuevo : g));
  return { groups, group: groups[0] };
}

/** Qué se pierde al eliminar un grupo: cuántos estudiantes tiene y qué encuestas lo usan. */
export function resumenEliminar(grupo, students, surveys) {
  const estudiantes = (students || []).filter((s) => s.group === grupo).length;
  const encuestas = (surveys || []).filter((sv) => !sv.deleted && surveyGroups(sv).includes(grupo)).map((sv) => sv.title || "(sin título)");
  return { estudiantes, encuestas };
}

/** Texto de la confirmación al eliminar. */
export function textoEliminar(grupo, r) {
  const partes = [`¿Eliminar el grupo «${grupo}»?`];
  if (r.estudiantes > 0) partes.push(r.estudiantes === 1 ? "Se eliminará también su único estudiante." : `Se eliminarán también sus ${r.estudiantes} estudiantes.`);
  else partes.push("Está vacío.");
  if (r.encuestas.length) partes.push(`Lo usan ${r.encuestas.length === 1 ? "la encuesta" : "las encuestas"}: ${r.encuestas.slice(0, 3).map((t) => `«${t}»`).join(", ")}${r.encuestas.length > 3 ? "…" : ""}. Las respuestas ya registradas se conservan.`);
  partes.push("No se puede deshacer.");
  return partes.join("\n\n");
}
