// Importación de grupos y estudiantes desde un archivo CSV (plantilla descargable). Lógica pura, sin Firebase ni React.
import { groupExists } from "./sociometry.js";

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const MARCA_EJEMPLO = "(ejemplo)";

/** Plantilla CSV (con BOM para que Excel respete las tildes). Separador «;», el que usa Excel en español. */
export function plantillaCSV() {
  const filas = [
    ["Grupo", "Estudiante"],
    ["5° A", "(Ejemplo) Ana María Pérez"],
    ["5° A", "(Ejemplo) Juan Carlos Gómez"],
    ["5° B", "(Ejemplo) Laura Sofía Ruiz"],
  ];
  return "﻿" + filas.map((f) => f.join(";")).join("\r\n") + "\r\n";
}
export const PLANTILLA_NOMBRE = "plantilla-grupos-y-estudiantes.csv";

/** Separa una línea CSV respetando comillas. */
function celdas(linea, sep) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (q) { if (ch === '"' && linea[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * Lee el archivo. Devuelve { filas: [{ grupo, nombre, linea }], errores: [texto], ignoradas } .
 * Acepta separador «;», «,» o tabulación, con o sin encabezado, y salta las filas de ejemplo de la plantilla.
 */
export function parsearImportacion(texto) {
  const lineas = String(texto || "").replace(/^﻿/, "").split(/\r?\n/);
  const primera = lineas.find((l) => l.trim()) || "";
  const sep = [";", "\t", ","].map((s) => [s, primera.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const filas = [], errores = [];
  let ignoradas = 0, vistoEncabezado = false;
  lineas.forEach((l, i) => {
    if (!l.trim()) return;
    const c = celdas(l, sep);
    if (!vistoEncabezado) {
      vistoEncabezado = true;
      if (["grupo", "curso"].includes(norm(c[0])) && ["estudiante", "nombre", "estudiantes"].includes(norm(c[1]))) return;
    }
    const [grupo, nombre] = [c[0] || "", c[1] || ""];
    if (norm(nombre).startsWith(MARCA_EJEMPLO)) { ignoradas++; return; }
    if (!grupo || !nombre) { errores.push(`Línea ${i + 1}: falta ${!grupo ? "el grupo" : "el nombre del estudiante"}.`); return; }
    if (grupo.length > 60 || nombre.length > 120) { errores.push(`Línea ${i + 1}: texto demasiado largo.`); return; }
    filas.push({ grupo, nombre, linea: i + 1 });
  });
  if (!filas.length && !errores.length) errores.push("El archivo no tiene estudiantes. Usa la plantilla: una fila por estudiante, con su grupo.");
  return { filas, errores, ignoradas };
}

/**
 * Qué se crearía: grupos nuevos y estudiantes nuevos. No duplica grupos (sin importar mayúsculas o tildes)
 * ni estudiantes que ya están en ese grupo ni repetidos dentro del archivo.
 */
export function planImportacion(filas, nombresGrupos, estudiantes) {
  const grupos = [...nombresGrupos];
  const gruposNuevos = [], nuevos = [];
  const existe = new Set((estudiantes || []).map((s) => norm(s.group) + "|" + norm(s.name)));
  const nombreDe = (g) => grupos.find((x) => norm(x) === norm(g)) || g;
  let repetidos = 0;
  for (const f of filas) {
    if (!groupExists(grupos, f.grupo)) { grupos.push(f.grupo); gruposNuevos.push(f.grupo); }
    const grupo = nombreDe(f.grupo);
    const k = norm(grupo) + "|" + norm(f.nombre);
    if (existe.has(k)) { repetidos++; continue; }
    existe.add(k);
    nuevos.push({ grupo, nombre: f.nombre });
  }
  return { gruposNuevos, estudiantesNuevos: nuevos, repetidos };
}
