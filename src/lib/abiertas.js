// Respuestas a preguntas abiertas, listas para informes y Excel (lógica pura).
import { esAbierta } from "./justificacion.js";

/**
 * Una fila por respuesta abierta: { encuesta, pregunta, de, grupo, text }.
 * Solo encuestas vivas (no en la papelera) y, si `surveyId` no es "all", solo esa. `students` filtra y da nombre y grupo.
 */
export function listarAbiertas(responses, surveys, students, { surveyId = "all" } = {}) {
  const porId = new Map((students || []).map((s) => [String(s.id), s]));
  const vivas = (surveys || []).filter((sv) => !sv.deleted && (surveyId === "all" || sv.id === surveyId));
  const out = [];
  for (const sv of vivas) {
    const abiertas = (sv.questions || []).filter(esAbierta);
    if (!abiertas.length) continue;
    for (const r of responses || []) {
      if (!r || r.surveyId !== sv.id || !r.abiertas) continue;
      const est = porId.get(String(r.respondentId));
      if (!est) continue;
      for (const q of abiertas) {
        const t = r.abiertas[q.id];
        if (typeof t === "string" && t.trim()) out.push({ encuesta: sv.title || "", pregunta: q.text, de: est.name, grupo: est.group, text: t.trim() });
      }
    }
  }
  return out.sort((a, b) => a.pregunta.localeCompare(b.pregunta, "es") || a.de.localeCompare(b.de, "es"));
}
