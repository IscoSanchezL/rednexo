// Licencias: vigente → gracia (solo lectura) → bloqueada. Calendario aplicado por las reglas del servidor.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, serverTimestamp, Timestamp } from "firebase/firestore";

let env;
const ROOT = "franksanlo@gmail.com";
const as = (email) => env.authenticatedContext(email, { email, email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const DIA = 86400000;
before(async () => { env = await initializeTestEnvironment({ projectId: "rednexo-test-licencia", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } }); });
after(async () => { await env.cleanup(); });

// Un colegio por escenario, con distinto vencimiento (relativo a hoy).
const ESCENARIOS = { vigente: 100, gracia: -5, bloqueado: -40 };
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const [cid, dias] of Object.entries(ESCENARIOS)) {
      await setDoc(doc(db, `colegios/${cid}`), { nombre: cid, licencia: { plan: "basico", vence: Timestamp.fromMillis(Date.now() + dias * DIA), graciaDias: 15 } });
      await setDoc(doc(db, `colegios/${cid}/miembros/admin@${cid}.co`), { email: `admin@${cid}.co`, role: "admin", status: "active" });
      await setDoc(doc(db, `colegios/${cid}/miembros/psi@${cid}.co`), { email: `psi@${cid}.co`, role: "psychologist", status: "active" });
      await setDoc(doc(db, `colegios/${cid}/students/1`), { id: "1", name: "Ana", group: "5A" });
      await setDoc(doc(db, `colegios/${cid}/surveys/sv1`), { id: "sv1", status: "active", questions: [], rosterIds: ["1", "2"] });
    }
    // Colegio anterior al sistema de licencias: sin campo.
    await setDoc(doc(db, "colegios/antiguo"), { nombre: "antiguo" });
    await setDoc(doc(db, "colegios/antiguo/miembros/psi@antiguo.co"), { email: "psi@antiguo.co", role: "psychologist", status: "active" });
    await setDoc(doc(db, "colegios/antiguo/students/1"), { id: "1", name: "Ana", group: "5A" });
  });
});
const sub = () => ({ surveyId: "sv1", respondentId: "2", respondentName: "Beto", answers: { q: ["1"] }, submittedAt: serverTimestamp() });
const nuevoEst = { id: "9", name: "Zoe", group: "5A" };

test("vigente: lee y escribe; la encuesta pública recibe respuestas", async () => {
  await assertSucceeds(getDoc(doc(as("psi@vigente.co"), "colegios/vigente/students/1")));
  await assertSucceeds(setDoc(doc(as("psi@vigente.co"), "colegios/vigente/students/9"), nuevoEst));
  await assertSucceeds(setDoc(doc(anon(), "colegios/vigente/responses/sv1_2"), sub()));
});
test("gracia: puede leer pero NO escribir; la encuesta pública deja de recibir", async () => {
  await assertSucceeds(getDoc(doc(as("psi@gracia.co"), "colegios/gracia/students/1")));
  await assertFails(setDoc(doc(as("psi@gracia.co"), "colegios/gracia/students/9"), nuevoEst));
  await assertFails(updateDoc(doc(as("admin@gracia.co"), "colegios/gracia/students/1"), { name: "X" }));
  await assertFails(setDoc(doc(as("admin@gracia.co"), "colegios/gracia/miembros/n@gracia.co"), { email: "n@gracia.co", role: "readonly", status: "active" }));
  await assertFails(setDoc(doc(anon(), "colegios/gracia/responses/sv1_2"), sub()));
  await assertFails(getDoc(doc(anon(), "colegios/gracia/surveys/sv1")));
});
test("bloqueado: ni leer ni escribir; el miembro aún puede ver su colegio (para el aviso)", async () => {
  await assertFails(getDoc(doc(as("psi@bloqueado.co"), "colegios/bloqueado/students/1")));
  await assertFails(setDoc(doc(as("psi@bloqueado.co"), "colegios/bloqueado/students/9"), nuevoEst));
  await assertFails(setDoc(doc(anon(), "colegios/bloqueado/responses/sv1_2"), sub()));
  const c = await assertSucceeds(getDoc(doc(as("psi@bloqueado.co"), "colegios/bloqueado")));
  if (!c.data().licencia) throw new Error("debe ver su licencia");
});
test("un miembro no puede alargar su propia licencia", async () => {
  for (const cid of ["vigente", "gracia", "bloqueado"]) {
    await assertFails(updateDoc(doc(as(`admin@${cid}.co`), `colegios/${cid}`), { licencia: { vence: Timestamp.fromMillis(Date.now() + 999 * DIA) } }));
  }
});
test("superadmin: entra siempre y renovar reabre al instante", async () => {
  await assertSucceeds(getDoc(doc(as(ROOT), "colegios/bloqueado/students/1")));
  await assertFails(getDoc(doc(as("psi@bloqueado.co"), "colegios/bloqueado/students/1")));
  await assertSucceeds(updateDoc(doc(as(ROOT), "colegios/bloqueado"), { "licencia.vence": Timestamp.fromMillis(Date.now() + 365 * DIA) }));
  await assertSucceeds(getDoc(doc(as("psi@bloqueado.co"), "colegios/bloqueado/students/1")));
  await assertSucceeds(setDoc(doc(as("psi@bloqueado.co"), "colegios/bloqueado/students/9"), nuevoEst));
});
test("sin licencia registrada: sin restricciones", async () => {
  await assertSucceeds(setDoc(doc(as("psi@antiguo.co"), "colegios/antiguo/students/9"), nuevoEst));
});
test("graciaDias personalizada: 0 días bloquea al vencer", async () => {
  await env.withSecurityRulesDisabled(async (c) => { await updateDoc(doc(c.firestore(), "colegios/gracia"), { "licencia.graciaDias": 0 }); });
  await assertFails(getDoc(doc(as("psi@gracia.co"), "colegios/gracia/students/1")));
});
test("plataforma/planes: cualquier sesión lee, solo el superadmin escribe", async () => {
  await assertSucceeds(setDoc(doc(as(ROOT), "plataforma/planes"), { basico: { maxEstudiantes: 350, precio: 1300000 } }));
  await assertSucceeds(getDoc(doc(as("psi@vigente.co"), "plataforma/planes")));
  await assertFails(getDoc(doc(anon(), "plataforma/planes")));
  await assertFails(setDoc(doc(as("admin@vigente.co"), "plataforma/planes"), { basico: { maxEstudiantes: 1, precio: 1 } }));
});
