// Pruebas de las reglas de Firestore contra el emulador: npm run test:rules
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, serverTimestamp } from "firebase/firestore";

let env;
const SUPER = "franksanlo@gmail.com";
const ctx = (email, verified = true) => env.authenticatedContext(email, { email, email_verified: verified }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "rednexo-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "users/psi@x.co"), { email: "psi@x.co", role: "psychologist", status: "active" });
    await setDoc(doc(db, "users/ro@x.co"), { email: "ro@x.co", role: "readonly", status: "active" });
    await setDoc(doc(db, "users/old@x.co"), { email: "old@x.co", role: "psychologist", status: "revoked" });
    await setDoc(doc(db, "users/pend@x.co"), { email: "pend@x.co", role: "psychologist", status: "pending" });
    await setDoc(doc(db, "students/1"), { id: "1", name: "Ana", group: "5A" });
    await setDoc(doc(db, "groups/g1"), { id: "g1", name: "5A" });
    await setDoc(doc(db, "settings/global"), { colegio: "X" });
    await setDoc(doc(db, "activity/a1"), { text: "x" });
    await setDoc(doc(db, "responses/sv1_1"), { surveyId: "sv1", respondentId: "1", respondentName: "Ana", answers: { q: ["2"] } });
    await setDoc(doc(db, "surveys/sv1"), { id: "sv1", status: "active", questions: [], rosterIds: ["1", "2"], roster: [] });
    await setDoc(doc(db, "surveys/sv_draft"), { id: "sv_draft", status: "draft", rosterIds: ["1"] });
  });
});

const sub = (over = {}) => ({ surveyId: "sv1", respondentId: "2", respondentName: "Beto", answers: { q1: ["1"] }, submittedAt: serverTimestamp(), ...over });

// ── Acceso anónimo: no ve nada de menores ──
test("anónimo NO lee ni lista estudiantes", async () => {
  await assertFails(getDoc(doc(anon(), "students/1")));
  await assertFails(getDocs(collection(anon(), "students")));
});
test("anónimo NO lee grupos, ajustes, actividad, usuarios ni respuestas", async () => {
  for (const p of ["groups/g1", "settings/global", "activity/a1", "users/psi@x.co", "responses/sv1_1"])
    await assertFails(getDoc(doc(anon(), p)));
});
test("anónimo NO lista encuestas", async () => {
  await assertFails(getDocs(collection(anon(), "surveys")));
});
test("anónimo SÍ lee una encuesta activa por id, pero no un borrador", async () => {
  await assertSucceeds(getDoc(doc(anon(), "surveys/sv1")));
  await assertFails(getDoc(doc(anon(), "surveys/sv_draft")));
});
test("anónimo NO escribe estudiantes, encuestas ni ajustes", async () => {
  await assertFails(setDoc(doc(anon(), "students/9"), { name: "X", group: "5A" }));
  await assertFails(updateDoc(doc(anon(), "surveys/sv1"), { status: "draft" }));
  await assertFails(setDoc(doc(anon(), "settings/global"), { colegio: "hack" }));
  await assertFails(deleteDoc(doc(anon(), "students/1")));
});

// ── Respuesta de la encuesta pública ──
test("anónimo SÍ crea su respuesta válida", async () => {
  await assertSucceeds(setDoc(doc(anon(), "responses/sv1_2"), sub()));
});
test("anónimo NO sobrescribe una respuesta existente", async () => {
  await assertFails(setDoc(doc(anon(), "responses/sv1_1"), sub({ respondentId: "1", respondentName: "Ana" })));
});
test("anónimo NO modifica ni borra respuestas", async () => {
  await assertFails(updateDoc(doc(anon(), "responses/sv1_1"), { answers: {} }));
  await assertFails(deleteDoc(doc(anon(), "responses/sv1_1")));
});
test("respuesta rechazada: campos extra, id que no coincide, estudiante fuera de la lista, encuesta inactiva", async () => {
  await assertFails(setDoc(doc(anon(), "responses/sv1_2"), sub({ extra: 1 })));
  await assertFails(setDoc(doc(anon(), "responses/sv1_otro"), sub()));
  await assertFails(setDoc(doc(anon(), "responses/sv1_99"), sub({ respondentId: "99" })));
  await assertFails(setDoc(doc(anon(), "responses/sv_draft_1"), sub({ surveyId: "sv_draft", respondentId: "1" })));
  await assertFails(setDoc(doc(anon(), "responses/sv1_2"), sub({ submittedAt: new Date("2020-01-01") })));
});
test("marca de 'ya respondió': se puede consultar su existencia, no listar", async () => {
  await assertSucceeds(setDoc(doc(anon(), "responseMarks/sv1_2"), { surveyId: "sv1", respondentId: "2" }));
  await assertSucceeds(getDoc(doc(anon(), "responseMarks/sv1_2")));
  await assertFails(getDocs(collection(anon(), "responseMarks")));
});

// ── Usuarios con sesión ──
test("psicólogo activo lee y escribe estudiantes, grupos y encuestas", async () => {
  const db = ctx("psi@x.co");
  await assertSucceeds(getDoc(doc(db, "students/1")));
  await assertSucceeds(getDocs(collection(db, "surveys")));
  await assertSucceeds(setDoc(doc(db, "students/2"), { id: "2", name: "Beto", group: "5A" }));
  await assertSucceeds(setDoc(doc(db, "groups/g2"), { id: "g2", name: "5B" }));
  await assertSucceeds(getDocs(collection(db, "responses")));
});
test("solo lectura puede leer pero NO escribir", async () => {
  const db = ctx("ro@x.co");
  await assertSucceeds(getDoc(doc(db, "students/1")));
  await assertFails(setDoc(doc(db, "students/2"), { name: "B", group: "5A" }));
  await assertFails(deleteDoc(doc(db, "students/1")));
  await assertFails(updateDoc(doc(db, "surveys/sv1"), { status: "draft" }));
});
test("usuario revocado, pendiente o sin documento NO accede a nada", async () => {
  for (const e of ["old@x.co", "pend@x.co", "intruso@gmail.com"]) {
    await assertFails(getDoc(doc(ctx(e), "students/1")));
    await assertFails(getDocs(collection(ctx(e), "students")));
    await assertFails(getDocs(collection(ctx(e), "responses")));
    await assertFails(setDoc(doc(ctx(e), "students/7"), { name: "X", group: "5A" }));
  }
});
test("correo sin verificar no accede aunque esté autorizado", async () => {
  await assertFails(getDoc(doc(ctx("psi@x.co", false), "students/1")));
  await assertFails(getDoc(doc(ctx(SUPER, false), "students/1")));
});
test("no se puede escalar el rol: nadie salvo el superadmin escribe en users", async () => {
  await assertFails(setDoc(doc(ctx("psi@x.co"), "users/psi@x.co"), { email: "psi@x.co", role: "superadmin", status: "active" }));
  await assertFails(setDoc(doc(ctx("intruso@gmail.com"), "users/intruso@gmail.com"), { email: "intruso@gmail.com", role: "psychologist", status: "active" }));
  await assertFails(updateDoc(doc(ctx("old@x.co"), "users/old@x.co"), { status: "active" }));
  await assertFails(getDocs(collection(ctx("psi@x.co"), "users")));
  await assertFails(getDoc(doc(ctx("psi@x.co"), "users/ro@x.co")));
});
test("cada usuario puede leer su propio documento (para el login)", async () => {
  await assertSucceeds(getDoc(doc(ctx("psi@x.co"), "users/psi@x.co")));
});
test("ajustes y actividad: psicólogo no escribe ajustes ni lee actividad", async () => {
  await assertFails(setDoc(doc(ctx("psi@x.co"), "settings/global"), { colegio: "hack" }));
  await assertFails(getDoc(doc(ctx("psi@x.co"), "activity/a1")));
  await assertSucceeds(getDoc(doc(ctx("psi@x.co"), "settings/global")));
});
test("superadmin gestiona usuarios, ajustes y actividad", async () => {
  const db = ctx(SUPER);
  await assertSucceeds(setDoc(doc(db, "users/nuevo@x.co"), { email: "nuevo@x.co", role: "psychologist", status: "active" }));
  await assertSucceeds(getDocs(collection(db, "users")));
  await assertSucceeds(setDoc(doc(db, "settings/global"), { colegio: "Y" }));
  await assertSucceeds(getDocs(collection(db, "activity")));
  await assertSucceeds(deleteDoc(doc(db, "activity/a1")));
});
test("colecciones desconocidas están denegadas", async () => {
  await assertFails(getDoc(doc(ctx(SUPER), "otra/x")));
  await assertFails(setDoc(doc(ctx(SUPER), "otra/x"), { a: 1 }));
});
