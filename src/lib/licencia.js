// Licencias: lógica pura (sin Firebase ni React). Las reglas de Firestore aplican el MISMO calendario en el servidor;
// esto solo sirve para mostrar avisos y para calcular renovaciones.
//   Vigente → (aviso 30 días antes) → Gracia (solo lectura) → Bloqueada → (retención 90 días) → eliminación manual.
export const DIAS_GRACIA = 15;
export const DIAS_AVISO = 30;
export const DIAS_RETENCION = 90;
const DIA = 86400000;

const PLANES_BASE = {
  piloto: { label: "Piloto", maxEstudiantes: 60, precio: 0 },
  basico: { label: "Básico", maxEstudiantes: 300, precio: 1200000 },
  estandar: { label: "Estándar", maxEstudiantes: 800, precio: 2800000 },
  plus: { label: "Plus", maxEstudiantes: 1500, precio: 4900000 },
  institucional: { label: "Institucional", maxEstudiantes: 0, precio: 0 }, // 0 = sin tope; precio a convenir
};
/** Planes vigentes: los de fábrica con los ajustes que guarde el superadmin (plataforma/planes). Se modifica en el sitio. */
export const PLANES = JSON.parse(JSON.stringify(PLANES_BASE));


/** Convierte un Timestamp de Firestore, Date o número a milisegundos (o null). */
export function aMs(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return null;
}

/**
 * Estado de la licencia en el instante `ahora` (ms).
 * Sin licencia registrada = sin restricciones (colegios anteriores a este sistema).
 * fase: sin_licencia | vigente | por_vencer | gracia | bloqueada
 */
export function estadoLicencia(lic, ahora = Date.now()) {
  const vence = aMs(lic?.vence);
  if (!lic || vence == null) return { fase: "sin_licencia", puedeLeer: true, puedeEscribir: true, diasRestantes: null };
  const gracia = Number.isFinite(lic.graciaDias) ? lic.graciaDias : DIAS_GRACIA;
  const diasRestantes = Math.ceil((vence - ahora) / DIA);
  const finGracia = vence + gracia * DIA;
  const base = { vence, finGracia, diasRestantes, plan: lic.plan || null, maxEstudiantes: lic.maxEstudiantes || 0 };
  if (ahora <= vence) return { ...base, fase: diasRestantes <= DIAS_AVISO ? "por_vencer" : "vigente", puedeLeer: true, puedeEscribir: true };
  if (ahora <= finGracia) return { ...base, fase: "gracia", puedeLeer: true, puedeEscribir: false, diasGraciaRestantes: Math.ceil((finGracia - ahora) / DIA) };
  return { ...base, fase: "bloqueada", puedeLeer: false, puedeEscribir: false, diasDesdeBloqueo: Math.floor((ahora - finGracia) / DIA), eliminable: ahora > finGracia + DIAS_RETENCION * DIA };
}

/** Suma `meses` a una fecha (ms) conservando el día cuando es posible. */
export function sumarMeses(ms, meses) {
  const d = new Date(ms);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d.getTime();
}

/**
 * Renovación: si aún no venció se suma al vencimiento actual (no se pierden días pagados);
 * si ya venció, se cuenta desde hoy (no se cobra el tiempo bloqueado de regalo).
 */
export function renovar(lic, meses = 12, ahora = Date.now()) {
  const vence = aMs(lic?.vence);
  const base = vence != null && vence > ahora ? vence : ahora;
  return { ...(lic || {}), vence: sumarMeses(base, meses) };
}

/** Licencia nueva para un plan. `meses` = 0 crea un piloto de 45 días. */
export function licenciaNueva(plan = "piloto", ahora = Date.now(), meses = 12) {
  const p = PLANES[plan] || PLANES.piloto;
  const vence = plan === "piloto" ? ahora + 45 * DIA : sumarMeses(ahora, meses);
  return { plan, vence, graciaDias: DIAS_GRACIA, maxEstudiantes: p.maxEstudiantes, precio: p.precio };
}

/** ¿Se superó el tope de estudiantes? Solo avisa (política: no bloquea). */
export function excedeTope(lic, nEstudiantes) {
  const max = lic?.maxEstudiantes || 0;
  return max > 0 && nEstudiantes > max;
}

/** Texto corto para mostrar al usuario. */
export function mensajeLicencia(est) {
  const f = (ms) => new Date(ms).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  if (est.fase === "por_vencer") return `Tu licencia vence el ${f(est.vence)} (${est.diasRestantes <= 0 ? "hoy" : `en ${est.diasRestantes} día${est.diasRestantes === 1 ? "" : "s"}`}). Comunícate con Iskonex para renovarla.`;
  if (est.fase === "gracia") return `Tu licencia venció el ${f(est.vence)}. Estás en periodo de gracia, solo lectura, ${est.diasGraciaRestantes} día${est.diasGraciaRestantes === 1 ? "" : "s"} más. Renueva para seguir creando y aplicando encuestas.`;
  if (est.fase === "bloqueada") return `La licencia de este colegio venció el ${f(est.vence)} y el acceso está bloqueado. Tus datos se conservan; comunícate con Iskonex para renovarla.`;
  return "";
}

const cop = (n) => "$" + Number(n).toLocaleString("es-CO");
/** Texto de un plan para listas: «Básico · hasta 300 estudiantes · $1.200.000/año». */
export function etiquetaPlan(clave) {
  const p = PLANES[clave];
  if (!p) return clave;
  const tope = p.maxEstudiantes ? `hasta ${p.maxEstudiantes} estudiantes` : "sin tope de estudiantes";
  const precio = clave === "piloto" ? "gratis 45 días" : p.precio ? `${cop(p.precio)}/año` : "a convenir";
  return `${p.label} · ${tope} · ${precio}`;
}

/** Cambia de plan: ajusta tope y costo solos; conserva el vencimiento y la gracia (una licencia nueva si no había). */
export function aplicarPlan(lic, clave, ahora = Date.now()) {
  const p = PLANES[clave];
  if (!p) return lic;
  if (!lic || aMs(lic.vence) == null) return licenciaNueva(clave, ahora);
  return { ...lic, plan: clave, maxEstudiantes: p.maxEstudiantes, precio: p.precio };
}

const entero = (v) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isInteger(Number(v)) && Number(v) >= 0;
/** Valida lo que escribe el superadmin: { clave: { maxEstudiantes, precio } }. Solo se editan tope y precio (no las claves ni los nombres). */
export function validarPlanes(entrada) {
  const errores = [], planes = {};
  for (const k of Object.keys(PLANES_BASE)) {
    const e = entrada?.[k] || {};
    if (!entero(e.maxEstudiantes)) errores.push(`${PLANES_BASE[k].label}: el máximo de estudiantes debe ser un número entero (0 = sin tope).`);
    else if (!entero(e.precio)) errores.push(`${PLANES_BASE[k].label}: el precio debe ser un número entero en pesos.`);
    else planes[k] = { maxEstudiantes: Number(e.maxEstudiantes), precio: Number(e.precio) };
  }
  return { ok: errores.length === 0, errores, planes };
}
/** Aplica los ajustes guardados sobre los planes de fábrica (ignora claves o valores inválidos). */
export function aplicarPlanes(ajustes) {
  for (const k of Object.keys(PLANES_BASE)) {
    PLANES[k] = { ...PLANES_BASE[k] };
    const a = ajustes?.[k];
    if (a && entero(a.maxEstudiantes) && entero(a.precio)) { PLANES[k].maxEstudiantes = Number(a.maxEstudiantes); PLANES[k].precio = Number(a.precio); }
  }
}

/** Colegios que conviene avisar: por vencer, en gracia o bloqueados, del más urgente al menos. */
export function porAvisar(colegios, ahora = Date.now()) {
  const orden = { bloqueada: 0, gracia: 1, por_vencer: 2 };
  return colegios
    .map((c) => ({ c, est: estadoLicencia(c.licencia, ahora) }))
    .filter((x) => x.est.fase in orden)
    .sort((a, b) => orden[a.est.fase] - orden[b.est.fase] || a.est.vence - b.est.vence);
}

/** Correo listo para enviar al administrador del colegio. */
export function recordatorio(nombreColegio, est) {
  const f = (ms) => new Date(ms).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  const asunto = est.fase === "bloqueada" ? `RedNexo: la licencia de ${nombreColegio} venció` : est.fase === "gracia" ? `RedNexo: ${nombreColegio} está en periodo de gracia` : `RedNexo: la licencia de ${nombreColegio} vence pronto`;
  const estado = est.fase === "por_vencer" ? `vence el ${f(est.vence)}`
    : est.fase === "gracia" ? `venció el ${f(est.vence)}. Hasta el ${f(est.finGracia)} el acceso es de solo lectura (no se pueden crear encuestas ni recibir respuestas)`
    : `venció el ${f(est.vence)} y el acceso está bloqueado. Sus datos se conservan y se reactivan al renovar`;
  const cuerpo = `Hola,\n\nLa licencia de RedNexo de ${nombreColegio} ${estado}.\n\nPara renovarla, responda este correo y le enviamos los datos de pago. Al confirmar el pago, la licencia se renueva de inmediato.\n\nGracias,\nIskonex`.replace(/\\n/g, "\n");
  return { asunto, cuerpo };
}
