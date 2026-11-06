import test from "node:test";
import assert from "node:assert/strict";
import { validarPlanes, aplicarPlanes, porAvisar, recordatorio, PLANES, etiquetaPlan, aplicarPlan, estadoLicencia, renovar, sumarMeses, licenciaNueva, excedeTope, DIAS_GRACIA } from "../src/lib/licencia.js";

const DIA = 86400000, T0 = Date.UTC(2026, 5, 1);
const lic = { plan: "basico", vence: T0, graciaDias: 15, maxEstudiantes: 300 };

test("sin licencia: sin restricciones (colegios anteriores)", () => {
  assert.equal(estadoLicencia(undefined).fase, "sin_licencia");
  assert.equal(estadoLicencia({}).puedeEscribir, true);
});
test("fases según la fecha", () => {
  assert.equal(estadoLicencia(lic, T0 - 60 * DIA).fase, "vigente");
  assert.equal(estadoLicencia(lic, T0 - 10 * DIA).fase, "por_vencer");
  assert.equal(estadoLicencia(lic, T0).fase, "por_vencer");
  const g = estadoLicencia(lic, T0 + 1);
  assert.equal(g.fase, "gracia"); assert.equal(g.puedeLeer, true); assert.equal(g.puedeEscribir, false);
  assert.equal(estadoLicencia(lic, T0 + 15 * DIA).fase, "gracia");
  const b = estadoLicencia(lic, T0 + 15 * DIA + 1);
  assert.equal(b.fase, "bloqueada"); assert.equal(b.puedeLeer, false); assert.equal(b.eliminable, false);
  assert.equal(estadoLicencia(lic, T0 + 15 * DIA + 91 * DIA).eliminable, true);
});
test("gracia por defecto y personalizada", () => {
  assert.equal(estadoLicencia({ vence: T0 }, T0 + (DIAS_GRACIA - 1) * DIA).fase, "gracia");
  assert.equal(estadoLicencia({ vence: T0, graciaDias: 0 }, T0 + 1).fase, "bloqueada");
});
test("acepta Timestamps de Firestore", () => {
  assert.equal(estadoLicencia({ vence: { toMillis: () => T0 } }, T0 - 100 * DIA).fase, "vigente");
  assert.equal(estadoLicencia({ vence: { seconds: T0 / 1000 } }, T0 + 1).fase, "gracia");
});
test("renovar: suma al vencimiento si sigue vigente, desde hoy si ya venció", () => {
  assert.equal(renovar(lic, 12, T0 - 10 * DIA).vence, Date.UTC(2027, 5, 1));
  assert.equal(renovar(lic, 12, Date.UTC(2026, 8, 10)).vence, Date.UTC(2027, 8, 10));
  assert.equal(renovar(lic, 12, T0).plan, "basico");
});
test("sumarMeses respeta fin de mes", () => {
  assert.equal(sumarMeses(Date.UTC(2026, 0, 31), 1), Date.UTC(2026, 1, 28));
  assert.equal(sumarMeses(Date.UTC(2027, 11, 15), 2), Date.UTC(2028, 1, 15));
});
test("licencia nueva: piloto 45 días y plan con tope", () => {
  assert.equal(licenciaNueva("piloto", T0).vence, T0 + 45 * DIA);
  const n = licenciaNueva("estandar", T0);
  assert.equal(n.maxEstudiantes, 800); assert.equal(n.vence, Date.UTC(2027, 5, 1));
});
test("tope de estudiantes solo avisa", () => {
  assert.equal(excedeTope(lic, 301), true); assert.equal(excedeTope(lic, 300), false); assert.equal(excedeTope({ maxEstudiantes: 0 }, 9999), false);
});
test("elegir plan ajusta tope y costo solos y conserva el vencimiento", () => {
  const n = aplicarPlan(lic, "plus");
  assert.equal(n.maxEstudiantes, 1500); assert.equal(n.precio, 4900000); assert.equal(n.vence, lic.vence); assert.equal(n.graciaDias, 15);
  assert.equal(aplicarPlan(lic, "estandar").maxEstudiantes, 800);
  assert.equal(aplicarPlan(undefined, "basico", T0).maxEstudiantes, 300);
  assert.equal(aplicarPlan(lic, "inexistente"), lic);
});
test("etiqueta de plan", () => {
  assert.equal(etiquetaPlan("basico"), "Básico · hasta 300 estudiantes · $1.200.000/año");
  assert.match(etiquetaPlan("piloto"), /gratis 45 días/);
  assert.match(etiquetaPlan("institucional"), /sin tope.*a convenir/);
});
test("planes editables: se validan y se aplican sobre los de fábrica", () => {
  const ok = { basico: { maxEstudiantes: "350", precio: "1300000" }, estandar: { maxEstudiantes: 800, precio: 2800000 }, plus: { maxEstudiantes: 1500, precio: 4900000 }, piloto: { maxEstudiantes: 60, precio: 0 }, institucional: { maxEstudiantes: 0, precio: 0 } };
  const v = validarPlanes(ok); assert.equal(v.ok, true); assert.equal(v.planes.basico.maxEstudiantes, 350);
  assert.equal(validarPlanes({ ...ok, basico: { maxEstudiantes: -1, precio: 5 } }).ok, false);
  assert.equal(validarPlanes({ ...ok, plus: { maxEstudiantes: "abc", precio: 5 } }).ok, false);
  assert.equal(validarPlanes({ ...ok, plus: { maxEstudiantes: 1.5, precio: 5 } }).ok, false);
  aplicarPlanes(v.planes);
  assert.equal(PLANES.basico.precio, 1300000);
  assert.match(etiquetaPlan("basico"), /350 estudiantes · \$1\.300\.000/);
  assert.equal(aplicarPlan(lic, "basico").maxEstudiantes, 350);
  aplicarPlanes({});  // vuelve a los de fábrica
  assert.equal(PLANES.basico.precio, 1200000);
  aplicarPlanes({ basico: { maxEstudiantes: "x", precio: 1 } });  // inválido: se ignora
  assert.equal(PLANES.basico.maxEstudiantes, 300);
});
test("por avisar: solo por vencer, gracia y bloqueados, el más urgente primero", () => {
  const mk = (id, dias) => ({ id, nombre: id, licencia: { vence: T0 + dias * DIA } });
  const r = porAvisar([mk("ok", 90), mk("pv", 10), mk("gr", -5), mk("bl", -40), { id: "sin", nombre: "sin" }], T0);
  assert.deepEqual(r.map((x) => x.c.id), ["bl", "gr", "pv"]);
});
test("recordatorio: asunto y cuerpo según la fase", () => {
  const mk = (d) => estadoLicencia(lic, T0 + d * DIA);
  assert.match(recordatorio("Col X", mk(-10)).asunto, /vence pronto/);
  assert.match(recordatorio("Col X", mk(5)).asunto, /periodo de gracia/);
  assert.match(recordatorio("Col X", mk(60)).asunto, /venció/);
  const c = recordatorio("Col X", mk(5)).cuerpo;
  assert.match(c, /solo lectura/); assert.match(c, /\n/); assert.doesNotMatch(c, /\\n/);
});
