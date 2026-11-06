import test from "node:test";
import assert from "node:assert/strict";
import { generarContratoHTML, faltantes, CAMPOS_EMPRESA, CAMPOS_COLEGIO, numeroContrato, precioConDescuento, escapeHtml, CLAUSULAS, CONTRATO_VERSION } from "../src/lib/contrato.js";
import { validarPago, resumenPagos, carteraGeneral, entradaHistorial } from "../src/lib/gestion.js";

const empresa = { razonSocial: "Iskonex S.A.S.", nit: "900.123.456-7", representante: "Ana Pérez", cedulaRep: "123", ciudad: "Medellín", direccion: "Calle 1", correo: "legal@iskonex.co" };
const colegio = { razonSocial: "Colegio San José", nit: "800.111.222-3", representante: "Luis Gómez", cedulaRep: "456", ciudad: "Bogotá", direccion: "Cra 2", correo: "rectoria@sj.edu.co" };
const contrato = { numero: "RN-2026-001", plan: "basico", precio: 1200000, descuentoPct: 0, inicio: Date.UTC(2026, 0, 15), meses: 12 };

test("contrato completo: sin pendientes y con los datos de plan, precio y vigencia", () => {
  const r = generarContratoHTML({ empresa, colegio, contrato });
  assert.deepEqual(r.faltan, []);
  assert.doesNotMatch(r.html, /PENDIENTE/);
  for (const t of ["Iskonex S.A.S.", "Colegio San José", "Básico", "300 estudiantes", "$1.200.000 COP", "15 de enero de 2026", "15 de enero de 2027", "RN-2026-001", CONTRATO_VERSION, "NO se renueva automáticamente", "RESPONSABLE", "ENCARGADO", "calendario de gracia", "más desde el bloqueo"])
    assert.ok(r.html.includes(t), "falta: " + t);
});
test("sin datos de Iskonex: queda como borrador con marcas pendientes y lo dice", () => {
  const r = generarContratoHTML({ empresa: {}, colegio, contrato });
  assert.ok(r.faltan.includes("Iskonex: NIT") && r.faltan.includes("Iskonex: Representante legal"));
  assert.match(r.html, /BORRADOR — datos pendientes/);
  assert.match(r.html, /\[PENDIENTE/);
});
test("descuento: precio final y texto del descuento", () => {
  const r = generarContratoHTML({ empresa, colegio, contrato: { ...contrato, descuentoPct: 10 } });
  assert.equal(r.precioFinal, 1080000);
  assert.ok(r.html.includes("$1.080.000 COP") && r.html.includes("descuento del 10%"));
});
test("el HTML escapa lo que escribe el usuario (sin inyección)", () => {
  const r = generarContratoHTML({ empresa, colegio: { ...colegio, razonSocial: '<script>alert(1)</script>"' }, contrato });
  assert.doesNotMatch(r.html, /<script>alert/);
  assert.match(r.html, /&lt;script&gt;/);
  assert.equal(escapeHtml(`<&>"'`), "&lt;&amp;&gt;&quot;&#39;");
});
test("faltantes solo cuenta los obligatorios", () => {
  assert.deepEqual(faltantes(CAMPOS_COLEGIO, colegio), []);
  assert.equal(faltantes(CAMPOS_COLEGIO, { ...colegio, telefono: "" }).length, 0);
  assert.deepEqual(faltantes(CAMPOS_COLEGIO, { ...colegio, nit: "  " }), ["NIT"]);
  assert.ok(faltantes(CAMPOS_EMPRESA, {}).length >= 7);
});
test("número de contrato consecutivo por año", () => {
  assert.equal(numeroContrato(2026, []), "RN-2026-001");
  assert.equal(numeroContrato(2026, ["RN-2026-001", "RN-2026-007", "RN-2025-050"]), "RN-2026-008");
  assert.equal(numeroContrato(2027, ["RN-2026-007"]), "RN-2027-001");
});
test("precio con descuento acota el porcentaje", () => {
  assert.equal(precioConDescuento(1000000, 15), 850000);
  assert.equal(precioConDescuento(1000000, -5), 1000000);
  assert.equal(precioConDescuento(1000000, 150), 0);
});
test("todas las cláusulas usan solo marcadores conocidos", () => {
  const r = generarContratoHTML({ empresa, colegio, contrato });
  assert.doesNotMatch(r.html, /\{\{/); assert.ok(CLAUSULAS.length >= 14);
});

test("validar pago", () => {
  const ok = validarPago({ valor: "1.200.000", fecha: "2026-03-01", medio: "transferencia", referencia: "ABC" });
  assert.equal(ok.ok, true); assert.equal(ok.pago.valor, 1200000);
  assert.equal(validarPago({ valor: "0", fecha: "2026-03-01", medio: "transferencia" }).ok, false);
  assert.equal(validarPago({ valor: "abc", fecha: "2026-03-01", medio: "transferencia" }).ok, false);
  assert.equal(validarPago({ valor: "100", fecha: "", medio: "transferencia" }).ok, false);
  assert.equal(validarPago({ valor: "100", fecha: "2999-01-01", medio: "transferencia" }).ok, false);
  assert.equal(validarPago({ valor: "100", fecha: "2026-03-01", medio: "bitcoin" }).ok, false);
});
test("resumen y cartera: totales por colegio y por año", () => {
  const p = [{ valor: 1200000, fecha: Date.UTC(2025, 2, 1) }, { valor: 2800000, fecha: Date.UTC(2026, 2, 1) }];
  const r = resumenPagos(p);
  assert.equal(r.total, 4000000); assert.deepEqual(r.porAnio, { 2025: 1200000, 2026: 2800000 }); assert.equal(r.ultimo, Date.UTC(2026, 2, 1));
  const c = carteraGeneral([{ colegio: { id: "a", nombre: "A", licencia: { plan: "basico", vence: 5, precio: 1 } }, pagos: p, historial: [] }, { colegio: { id: "b" }, pagos: [{ valor: 500, fecha: Date.UTC(2026, 0, 1) }], historial: [{}] }]);
  assert.equal(c.total, 4000500); assert.equal(c.porAnio[2026], 2800500); assert.equal(c.filas[0].plan, "basico");
});
test("entrada de historial", () => {
  const e = entradaHistorial({ accion: "renovar", licencia: { plan: "plus", maxEstudiantes: 1500, precio: 4900000, vence: { toMillis: () => 99 } }, por: "x@y.co", descuentoPct: 10 });
  assert.deepEqual(e, { accion: "renovar", plan: "plus", maxEstudiantes: 1500, precio: 4900000, descuentoPct: 10, vence: 99, contratoId: null, por: "x@y.co" });
});
