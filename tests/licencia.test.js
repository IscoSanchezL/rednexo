import test from "node:test";
import assert from "node:assert/strict";
import { etiquetaPlan, aplicarPlan, estadoLicencia, renovar, sumarMeses, licenciaNueva, excedeTope, DIAS_GRACIA } from "../src/lib/licencia.js";

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
