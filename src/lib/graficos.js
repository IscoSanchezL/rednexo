// Datos para los gráficos del modo «Gráficos» (psicólogos). Lógica pura: sin React ni Firebase.
import { hasType } from "./sociometry.js";

export const ROLES_ORDEN = ["lider", "integrado", "regular", "controvertido", "aislado", "rechazado"];
export const ROL_COLOR = { lider: "#14b8a6", integrado: "#3b82f6", regular: "#94a3b8", controvertido: "#f59e0b", aislado: "#a78bfa", rechazado: "#ef4444" };

/** Roles por grupo: una barra por grupo con cuántos estudiantes tiene en cada rol (y quiénes). */
export function rolesPorGrupo(report) {
  const grupos = [...new Set(report.rows.map((r) => r.student.group))];
  return grupos.map((g) => {
    const miembros = report.rows.filter((r) => r.student.group === g);
    const porRol = Object.fromEntries(ROLES_ORDEN.map((k) => [k, miembros.filter((r) => r.rol === k)]));
    return { group: g, total: miembros.length, porRol };
  });
}

/** Un punto por estudiante: x = aceptación, y = rechazo (en %). */
export function puntosDispersion(report) {
  return report.rows.map((r) => ({ id: String(r.student.id), name: r.student.name, group: r.student.group, x: Number(r.popularidad), y: Number(r.rechazo), expansion: Number(r.expansion), rol: r.rol, row: r }));
}

/** Mapa de calor entre grupos: cuántas conexiones del tipo pedido van de un grupo (fila) a otro (columna). */
export function mapaCalorGrupos(stList, cnList, tipo = "pos") {
  const grupoDe = new Map(stList.map((s) => [String(s.id), s.group]));
  const grupos = [...new Set(stList.map((s) => s.group))];
  const celdas = Object.fromEntries(grupos.map((g) => [g, Object.fromEntries(grupos.map((h) => [h, 0]))]));
  let max = 0;
  for (const c of cnList) {
    const a = grupoDe.get(String(c.f)), b = grupoDe.get(String(c.t));
    if (a == null || b == null || !hasType(c, tipo)) continue;
    celdas[a][b]++;
    if (celdas[a][b] > max) max = celdas[a][b];
  }
  return { grupos, celdas, max };
}

/** Ranking de estudiantes por relaciones mutuas (positivas o negativas), de más a menos. */
export function rankingMutuas(report, tipo = "pos", limite = 10) {
  const key = tipo === "neg" ? "rechazosMutuos" : "mutuasPos";
  return report.rows.filter((r) => r[key] > 0).map((r) => ({ id: String(r.student.id), name: r.student.name, group: r.student.group, valor: r[key], row: r }))
    .sort((a, b) => b.valor - a.valor || a.name.localeCompare(b.name, "es")).slice(0, limite);
}

/** Red de un estudiante: a quién eligió, quién lo eligió y qué relaciones son mutuas. */
export function redIndividual(id, stList, cnList) {
  const sid = String(id);
  const byId = new Map(stList.map((s) => [String(s.id), s]));
  const nodos = new Map();
  const nodo = (otherId) => {
    const o = byId.get(String(otherId));
    if (!o) return null;
    if (!nodos.has(String(otherId))) nodos.set(String(otherId), { id: String(otherId), name: o.name, group: o.group, da: { pos: 0, neg: 0, neu: 0 }, recibe: { pos: 0, neg: 0, neu: 0 }, notas: [] });
    return nodos.get(String(otherId));
  };
  for (const c of cnList) {
    const f = String(c.f), t = String(c.t);
    if (f !== sid && t !== sid) continue;
    const otro = f === sid ? t : f;
    if (otro === sid) continue;
    const n = nodo(otro);
    if (!n) continue;
    for (const ty of ["pos", "neg", "neu"]) if (hasType(c, ty)) (f === sid ? n.da : n.recibe)[ty]++;
    if (t === sid && c.notas) n.notas.push(...c.notas);
  }
  const lista = [...nodos.values()].map((n) => ({ ...n, mutuaPos: n.da.pos > 0 && n.recibe.pos > 0, mutuaNeg: n.da.neg > 0 && n.recibe.neg > 0 }));
  return lista.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Comparación de dos aplicaciones (A = antes, B = después): cambios de rol y de indicadores por estudiante. */
export function compararAplicaciones(repA, repB) {
  const a = new Map(repA.rows.map((r) => [String(r.student.id), r]));
  const cambios = [];
  for (const rb of repB.rows) {
    const ra = a.get(String(rb.student.id));
    if (!ra) continue;
    cambios.push({ id: String(rb.student.id), name: rb.student.name, group: rb.student.group, rolA: ra.rol, rolB: rb.rol, aceptacionA: ra.popularidad, aceptacionB: rb.popularidad, rechazoA: ra.rechazo, rechazoB: rb.rechazo, dAceptacion: +(rb.popularidad - ra.popularidad).toFixed(1), dRechazo: +(rb.rechazo - ra.rechazo).toFixed(1), cambioRol: ra.rol !== rb.rol });
  }
  return { cambios, kpiA: repA.kpis, kpiB: repB.kpis };
}

/** Escala lineal simple (0..max → 0..size). */
export const escala = (v, max, size) => (max > 0 ? (v / max) * size : 0);

/** Valor máximo «redondo» para un eje (10, 20, 25, 50, 100...). */
export function maxEje(v) {
  for (const t of [10, 20, 25, 40, 50, 75, 100]) if (v <= t) return t;
  return 100;
}
