// Contrato de licencia de uso de RedNexo: lógica pura (sin Firebase ni React) para poder probarla.
// ⚠ El texto de las cláusulas es un BORRADOR: debe revisarlo un abogado antes de firmar con un colegio.
// Para cambiar el texto, edita CLAUSULAS (cada cláusula admite {{marcadores}}) y sube CONTRATO_VERSION.
import { DIAS_GRACIA, DIAS_RETENCION, PLANES, sumarMeses, aMs } from "./licencia.js";

export const CONTRATO_VERSION = "2026.1-borrador";

/** Datos de Iskonex (se llenan en el panel del superadmin cuando la empresa esté constituida). */
export const CAMPOS_EMPRESA = [
  ["razonSocial", "Razón social", true], ["nit", "NIT", true], ["representante", "Representante legal", true], ["cedulaRep", "Cédula del representante", true],
  ["ciudad", "Ciudad", true], ["direccion", "Dirección", true], ["correo", "Correo para notificaciones y facturación", true], ["telefono", "Teléfono", false],
  ["cuentaPago", "Datos para pagos (banco, tipo y número de cuenta)", false],
];
/** Datos de cada colegio (se piden al crearlo; se pueden completar después). */
export const CAMPOS_COLEGIO = [
  ["razonSocial", "Razón social del colegio", true], ["nit", "NIT", true], ["representante", "Representante legal (rector/a)", true], ["cedulaRep", "Cédula del representante", true],
  ["ciudad", "Ciudad", true], ["direccion", "Dirección", true], ["correo", "Correo para notificaciones y facturación", true], ["telefono", "Teléfono", false],
];

const vacio = (v) => v == null || String(v).trim() === "";
/** Etiquetas de los campos obligatorios que faltan. */
export function faltantes(campos, datos) {
  return campos.filter(([k, , req]) => req && vacio(datos?.[k])).map(([, label]) => label);
}

export function precioConDescuento(precio, pct) {
  const d = Math.min(100, Math.max(0, Number(pct) || 0));
  return Math.round((Number(precio) || 0) * (1 - d / 100));
}
export function numeroContrato(anio, existentes) {
  const prefijo = `RN-${anio}-`;
  const usados = (existentes || []).map((n) => String(n)).filter((n) => n.startsWith(prefijo)).map((n) => parseInt(n.slice(prefijo.length), 10)).filter(Number.isFinite);
  return prefijo + String((usados.length ? Math.max(...usados) : 0) + 1).padStart(3, "0");
}

export const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cop = (n) => "$" + Number(n || 0).toLocaleString("es-CO") + " COP";
const fecha = (ms) => new Date(ms).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Cláusulas. {{x}} se reemplaza por el dato; si falta se muestra «[PENDIENTE: …]» resaltado. */
export const CLAUSULAS = [
  ["Objeto", ["{{empresa.razonSocial}} (en adelante, EL PROVEEDOR) concede a {{colegio.razonSocial}} (en adelante, EL COLEGIO) una licencia no exclusiva e intransferible para usar la plataforma RedNexo, que permite aplicar encuestas sociométricas a sus estudiantes y analizar los resultados, durante la vigencia de este contrato y conforme al plan contratado.",
    "RedNexo es una herramienta de apoyo para el equipo de orientación. Sus resultados no constituyen un diagnóstico y no sustituyen el criterio profesional de quienes los interpretan."]],
  ["Plan, límite de estudiantes y precio", ["EL COLEGIO contrata el plan {{plan.label}}, que incluye hasta {{plan.tope}}. El valor de la licencia por el periodo es de {{precio.final}}{{precio.descuento}}, más IVA cuando corresponda.",
    "Si el número de estudiantes supera el límite del plan, EL PROVEEDOR avisará a EL COLEGIO, y las partes acordarán el cambio al plan que corresponda. Superar el límite no suspende el servicio por sí solo."]],
  ["Vigencia y renovación", ["El contrato rige desde el {{vigencia.inicio}} hasta el {{vigencia.fin}}.",
    "El contrato NO se renueva automáticamente. Para continuar, EL COLEGIO debe confirmar de forma expresa el plan y el precio de cada periodo, mediante un nuevo contrato o una confirmación escrita. EL PROVEEDOR avisará con anticipación el vencimiento."]],
  ["Forma de pago", ["EL COLEGIO pagará el valor del plan por anticipado, dentro de los {{pago.dias}} días siguientes a la firma, mediante transferencia o el medio que EL PROVEEDOR indique ({{empresa.cuentaPago}}). EL PROVEEDOR expedirá la factura electrónica correspondiente.",
    "La licencia se activa o renueva cuando EL PROVEEDOR confirme el pago."]],
  ["Falta de pago y vencimiento de la licencia", ["Al vencer la licencia sin renovación, EL COLEGIO tendrá {{gracia}} días calendario de gracia en los que podrá consultar y descargar su información, pero no crear encuestas ni recibir respuestas. Terminado ese plazo, el acceso se bloquea.",
    "Los datos de EL COLEGIO se conservan {{retencion}} días más desde el bloqueo, para que pueda renovar y recuperarlos. Pasado ese plazo, EL PROVEEDOR podrá eliminarlos, previo aviso por escrito a EL COLEGIO y entrega de una copia de sus datos si la solicita."]],
  ["Obligaciones de EL PROVEEDOR", ["Mantener la plataforma disponible con un esfuerzo razonable; aplicar medidas técnicas y organizativas de seguridad para proteger la información; separar los datos de cada colegio; brindar soporte por el canal acordado ({{soporte}}); y notificar a EL COLEGIO, sin demora injustificada, cualquier incidente de seguridad que afecte sus datos.",
    "EL PROVEEDOR no garantiza disponibilidad ininterrumpida; podrá realizar mantenimientos y procurará avisarlos."]],
  ["Obligaciones de EL COLEGIO", ["Usar la plataforma conforme a este contrato y a la ley; mantener la confidencialidad de las credenciales y autorizar solo a personal competente; obtener las autorizaciones de los padres, madres o acudientes que la ley exija; informar a los estudiantes y sus familias el propósito de las encuestas; y usar los resultados para el acompañamiento de los estudiantes, nunca para sancionarlos ni estigmatizarlos."]],
  ["Tratamiento de datos personales", ["Para efectos de la Ley 1581 de 2012 y sus normas reglamentarias, EL COLEGIO es el RESPONSABLE del tratamiento de los datos personales de sus estudiantes y personal, y EL PROVEEDOR actúa como ENCARGADO, tratándolos únicamente por cuenta de EL COLEGIO, para prestar el servicio y según sus instrucciones.",
    "Los datos incluyen información de niños, niñas y adolescentes. EL COLEGIO declara que cuenta con la autorización necesaria y que su tratamiento atiende al interés superior del menor. EL PROVEEDOR no usará los datos para otras finalidades, no los venderá ni cederá, y guardará confidencialidad sobre ellos.",
    "EL PROVEEDOR utiliza servicios de infraestructura en la nube de terceros (Google Firebase) para almacenar y procesar la información, lo que puede implicar su procesamiento fuera de Colombia, con las garantías que la ley exija. EL COLEGIO autoriza esa subcontratación.",
    "EL COLEGIO podrá solicitar la exportación de sus datos en cualquier momento y a la terminación del contrato. EL PROVEEDOR atenderá las consultas y reclamos de titulares que EL COLEGIO le traslade, y le ayudará a responderlos."]],
  ["Propiedad intelectual", ["La plataforma, su código, diseño y marca son de EL PROVEEDOR. EL COLEGIO conserva la propiedad de la información que ingresa. Este contrato no transfiere derechos de propiedad intelectual distintos de la licencia de uso aquí concedida."]],
  ["Confidencialidad", ["Cada parte guardará reserva sobre la información no pública de la otra a la que acceda, durante la vigencia del contrato y {{confidencialidad}} años más."]],
  ["Limitación de responsabilidad", ["EL PROVEEDOR no responde por decisiones que EL COLEGIO tome con base en los resultados, ni por daños indirectos o lucro cesante. Su responsabilidad total frente a EL COLEGIO, por cualquier causa, se limita al valor pagado por el periodo en curso, salvo dolo o culpa grave o lo que la ley no permita limitar."]],
  ["Terminación", ["Cualquiera de las partes podrá terminar el contrato por incumplimiento grave de la otra, previo aviso escrito y un plazo de {{cura}} días para subsanar. Si EL COLEGIO termina anticipadamente, no habrá devolución de lo pagado por el periodo, salvo acuerdo escrito.",
    "A la terminación, EL PROVEEDOR entregará una copia de los datos si EL COLEGIO la solicita y aplicará lo previsto sobre eliminación en la cláusula de falta de pago."]],
  ["Notificaciones", ["Las comunicaciones se enviarán por escrito a los correos indicados: EL PROVEEDOR, {{empresa.correo}}; EL COLEGIO, {{colegio.correo}}. Cualquier cambio de dirección se informará por el mismo medio."]],
  ["Ley aplicable y solución de controversias", ["Este contrato se rige por las leyes de la República de Colombia. Las diferencias se buscarán resolver primero por arreglo directo entre las partes y, de no lograrse, ante la jurisdicción competente de {{empresa.ciudad}}."]],
];

const PARAMS = { pagoDias: 15, soporte: "correo electrónico, en horario hábil", confidencialidadAnios: 2, curaDias: 15 };

function llenar(texto, datos) {
  return escapeHtml(texto).replace(/\{\{([\w.]+)\}\}/g, (_, k) => {
    const v = datos[k];
    if (k === "precio.descuento") return escapeHtml(v || "");   // opcional: sin descuento no hay nada que mostrar
    return vacio(v) ? `<mark class="pend">[PENDIENTE: ${escapeHtml(k)}]</mark>` : `<b>${escapeHtml(v)}</b>`;
  });
}

/**
 * Arma el contrato (HTML completo, listo para imprimir).
 * contrato: { numero, plan, precio (de lista), descuentoPct, inicio (ms), meses }
 */
export function generarContratoHTML({ empresa = {}, colegio = {}, contrato }) {
  const plan = PLANES[contrato.plan] || { label: contrato.plan, maxEstudiantes: 0 };
  const inicio = aMs(contrato.inicio), fin = sumarMeses(inicio, contrato.meses || 12);
  const final = precioConDescuento(contrato.precio, contrato.descuentoPct);
  const d = {
    "empresa.razonSocial": empresa.razonSocial, "empresa.nit": empresa.nit, "empresa.representante": empresa.representante, "empresa.cedulaRep": empresa.cedulaRep,
    "empresa.ciudad": empresa.ciudad, "empresa.direccion": empresa.direccion, "empresa.correo": empresa.correo, "empresa.cuentaPago": empresa.cuentaPago || "datos de pago indicados en la factura",
    "colegio.razonSocial": colegio.razonSocial, "colegio.nit": colegio.nit, "colegio.representante": colegio.representante, "colegio.cedulaRep": colegio.cedulaRep,
    "colegio.ciudad": colegio.ciudad, "colegio.direccion": colegio.direccion, "colegio.correo": colegio.correo,
    "plan.label": plan.label, "plan.tope": plan.maxEstudiantes ? `${plan.maxEstudiantes} estudiantes` : "un número de estudiantes sin tope (según lo pactado)",
    "precio.final": final ? cop(final) : "el valor que las partes acuerden por escrito",
    "precio.descuento": contrato.descuentoPct > 0 ? ` (precio de lista ${cop(contrato.precio)} con descuento del ${contrato.descuentoPct}%)` : "",
    "vigencia.inicio": fecha(inicio), "vigencia.fin": fecha(fin),
    "pago.dias": PARAMS.pagoDias, gracia: DIAS_GRACIA, retencion: DIAS_RETENCION, soporte: PARAMS.soporte, confidencialidad: PARAMS.confidencialidadAnios, cura: PARAMS.curaDias,
  };
  const faltan = [...faltantes(CAMPOS_EMPRESA, empresa).map((x) => "Iskonex: " + x), ...faltantes(CAMPOS_COLEGIO, colegio).map((x) => "Colegio: " + x)];
  const clausulas = CLAUSULAS.map(([titulo, parrafos], i) => `<h2>CLÁUSULA ${i + 1}. ${escapeHtml(titulo.toUpperCase())}</h2>${parrafos.map((p, j) => `<p><b>${i + 1}.${j + 1}</b> ${llenar(p, d)}</p>`).join("")}`).join("");
  const fila = (a, b) => `<tr><td>${escapeHtml(a)}</td><td>${vacio(b) ? '<mark class="pend">[PENDIENTE]</mark>' : escapeHtml(b)}</td></tr>`;
  const parte = (t, x) => `<table class="p"><tr><th colspan="2">${t}</th></tr>${fila("Razón social", x.razonSocial)}${fila("NIT", x.nit)}${fila("Representante legal", x.representante)}${fila("Cédula", x.cedulaRep)}${fila("Dirección", x.direccion)}${fila("Ciudad", x.ciudad)}${fila("Correo", x.correo)}</table>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Contrato ${escapeHtml(contrato.numero)}</title><style>
    @page{size:A4;margin:20mm 18mm}body{font-family:Georgia,'Times New Roman',serif;font-size:11pt;line-height:1.5;color:#111}
    h1{font-size:15pt;text-align:center;margin:0 0 4pt}h2{font-size:11pt;margin:14pt 0 4pt}p{margin:4pt 0;text-align:justify}
    .sub{text-align:center;color:#555;font-size:10pt;margin-bottom:12pt}table.p{width:100%;border-collapse:collapse;margin:8pt 0;font-size:10pt}
    table.p th{background:#eee;text-align:left;padding:3pt 6pt;border:1px solid #999}table.p td{border:1px solid #999;padding:3pt 6pt}table.p td:first-child{width:35%}
    mark.pend{background:#fde68a;padding:0 2px}.borrador{border:2px solid #b91c1c;color:#b91c1c;padding:6pt 10pt;margin:8pt 0;font-size:10pt;font-family:Arial,sans-serif}
    .firmas{display:flex;gap:30pt;margin-top:46pt;break-inside:avoid}.firmas div{flex:1;border-top:1px solid #000;padding-top:4pt;font-size:10pt}
    .pie{margin-top:18pt;font-size:8.5pt;color:#666;text-align:center;font-family:Arial,sans-serif}</style></head><body>
    <h1>CONTRATO DE LICENCIA DE USO DE LA PLATAFORMA REDNEXO</h1><div class="sub">N.° ${escapeHtml(contrato.numero)} · Plan ${escapeHtml(plan.label)}</div>
    ${faltan.length ? `<div class="borrador"><b>BORRADOR — datos pendientes:</b> ${faltan.map(escapeHtml).join("; ")}. No debe firmarse hasta completarlos.</div>` : ""}
    <div class="borrador" style="border-color:#555;color:#555"><b>Texto sujeto a revisión jurídica</b> (versión ${escapeHtml(CONTRATO_VERSION)}). Consulte con un abogado antes de firmar.</div>
    ${parte("EL PROVEEDOR", empresa)}${parte("EL COLEGIO", colegio)}${clausulas}
    <p>Para constancia, se firma en dos ejemplares del mismo tenor, en ${llenar("{{empresa.ciudad}}", d)}, a los ______ días del mes de ____________ de ________.</p>
    <div class="firmas"><div>EL PROVEEDOR<br><b>${escapeHtml(empresa.representante || "[PENDIENTE]")}</b><br>C.C. ${escapeHtml(empresa.cedulaRep || "[PENDIENTE]")}</div><div>EL COLEGIO<br><b>${escapeHtml(colegio.representante || "[PENDIENTE]")}</b><br>C.C. ${escapeHtml(colegio.cedulaRep || "[PENDIENTE]")}</div></div>
    <div class="pie">Contrato ${escapeHtml(contrato.numero)} · versión del texto ${escapeHtml(CONTRATO_VERSION)}</div></body></html>`;
  return { html, faltan, precioFinal: final, fin };
}
