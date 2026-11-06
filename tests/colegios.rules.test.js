// Aislamiento entre colegios: npm run test:rules
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, collectionGroup, query, where, serverTimestamp } from "firebase/firestore";

let env;
const SUPER = "franksanlo@gmail.com";
const as = (email) => env.authenticatedContext(email, { email, email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({ projectId: "rednexo-test-colegios", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const cid of ["A", "B"]) {
      await setDoc(doc(db, `colegios/${cid}`), { nombre: "Colegio " + cid });
      await setDoc(doc(db, `colegios/${cid}/miembros/admin@${cid.toLowerCase()}.co`), { email: `admin@${cid.toLowerCase()}.co`, role: "admin", status: "active" });
      await setDoc(doc(db, `colegios/${cid}/miembros/psi@${cid.toLowerCase()}.co`), { email: `psi@${cid.toLowerCase()}.co`, role: "psychologist", status: "active" });
      await setDoc(doc(db, `colegios/${cid}/miembros/ro@${cid.toLowerCase()}.co`), { email: `ro@${cid.toLowerCase()}.co`, role: "readonly", status: "active" });
      await setDoc(doc(db, `colegios/${cid}/miembros/old@${cid.toLowerCase()}.co`), { email: `old@${cid.toLowerCase()}.co`, role: "psychologist", status: "revoked" });
      await setDoc(doc(db, `colegios/${cid}/students/1`), { id: "1", name: "Ana " + cid, group: "5A" });
      await setDoc(doc(db, `colegios/${cid}/groups/g1`), { id: "g1", name: "5A" });
      await setDoc(doc(db, `colegios/${cid}/settings/global`), { colegio: "Colegio " + cid });
      await setDoc(doc(db, `colegios/${cid}/activity/a1`), { text: "x" });
      await setDoc(doc(db, `colegios/${cid}/responses/sv1_1`), { surveyId: "sv1", respondentId: "1", respondentName: "Ana", answers: {} });
      await setDoc(doc(db, `colegios/${cid}/surveys/sv1`), { id: "sv1", status: "active", questions: [], rosterIds: ["1", "2"], colegioNombre: "Colegio " + cid });
      await setDoc(doc(db, `colegios/${cid}/surveys/draft`), { id: "draft", status: "draft", rosterIds: ["1"] });
    }
    // Una persona en dos colegios
    await setDoc(doc(db, "colegios/B/miembros/psi@a.co"), { email: "psi@a.co", role: "readonly", status: "active" });
  });
});

const sub = (over = {}) => ({ surveyId: "sv1", respondentId: "2", respondentName: "Beto", answers: { q: ["1"] }, submittedAt: serverTimestamp(), ...over });
const students = (db, cid) => getDoc(doc(db, `colegios/${cid}/students/1`));

test("aislamiento: el psicólogo de A lee y escribe en A, y NO lee ni escribe en B", async () => {
  const db = as("psi@a.co");
  await assertSucceeds(students(db, "A"));
  await assertSucceeds(setDoc(doc(db, "colegios/A/students/2"), { name: "Beto", group: "5A" }));
  // psi@a.co es 'readonly' en B (caso de dos colegios) => lee B pero no escribe
  await assertSucceeds(students(db, "B"));
  await assertFails(setDoc(doc(db, "colegios/B/students/2"), { name: "X", group: "5A" }));
});
test("aislamiento: quien solo es de A no ve nada de B (estudiantes, grupos, ajustes, respuestas, actividad, miembros)", async () => {
  const db = as("psi@b.co");
  for (const p of ["students/1", "groups/g1", "settings/global", "responses/sv1_1", "activity/a1", "miembros/admin@a.co"])
    await assertFails(getDoc(doc(db, `colegios/A/${p}`)));
  await assertFails(getDocs(collection(db, "colegios/A/students")));
  await assertFails(getDocs(collection(db, "colegios/A/surveys")));
  await assertFails(setDoc(doc(db, "colegios/A/students/9"), { name: "X", group: "5A" }));
  await assertFails(deleteDoc(doc(db, "colegios/A/students/1")));
  await assertFails(updateDoc(doc(db, "colegios/A/surveys/sv1"), { status: "draft" }));
});
test("el administrador de A NO administra B", async () => {
  const db = as("admin@a.co");
  await assertFails(setDoc(doc(db, "colegios/B/miembros/nuevo@x.co"), { email: "nuevo@x.co", role: "psychologist", status: "active" }));
  await assertFails(setDoc(doc(db, "colegios/B/settings/global"), { colegio: "hack" }));
  await assertFails(getDoc(doc(db, "colegios/B/students/1")));
});
test("el administrador de A gestiona los miembros y ajustes de A", async () => {
  const db = as("admin@a.co");
  await assertSucceeds(setDoc(doc(db, "colegios/A/miembros/nuevo@x.co"), { email: "nuevo@x.co", role: "psychologist", status: "active" }));
  await assertSucceeds(getDocs(collection(db, "colegios/A/miembros")));
  await assertSucceeds(setDoc(doc(db, "colegios/A/settings/global"), { colegio: "Nuevo nombre" }));
  await assertSucceeds(getDocs(collection(db, "colegios/A/activity")));
});
test("miembros: no se puede escalar el rol ni crear roles inventados; psicólogo y solo lectura no administran", async () => {
  await assertFails(setDoc(doc(as("psi@a.co"), "colegios/A/miembros/psi@a.co"), { email: "psi@a.co", role: "admin", status: "active" }));
  await assertFails(setDoc(doc(as("ro@a.co"), "colegios/A/miembros/ro@a.co"), { email: "ro@a.co", role: "admin", status: "active" }));
  await assertFails(setDoc(doc(as("admin@a.co"), "colegios/A/miembros/x@x.co"), { email: "x@x.co", role: "superadmin", status: "active" }));
  await assertFails(setDoc(doc(as("admin@a.co"), "colegios/A/miembros/x@x.co"), { email: "otro@x.co", role: "readonly", status: "active" }));
  await assertFails(setDoc(doc(as("psi@a.co"), "colegios/A/settings/global"), { colegio: "hack" }));
  await assertFails(getDoc(doc(as("psi@a.co"), "colegios/A/activity/a1")));
});
test("solo lectura lee pero no escribe; revocado no accede", async () => {
  await assertSucceeds(students(as("ro@a.co"), "A"));
  await assertFails(setDoc(doc(as("ro@a.co"), "colegios/A/students/2"), { name: "X", group: "5A" }));
  await assertFails(students(as("old@a.co"), "A"));
  await assertFails(getDocs(collection(as("old@a.co"), "colegios/A/students")));
});
test("crear o modificar colegios: solo el superadmin; nadie más lista todos los colegios", async () => {
  await assertSucceeds(setDoc(doc(as(SUPER), "colegios/C"), { nombre: "Nuevo" }));
  await assertFails(setDoc(doc(as("admin@a.co"), "colegios/C"), { nombre: "Nuevo" }));
  await assertFails(updateDoc(doc(as("admin@a.co"), "colegios/A"), { nombre: "hack" }));
  await assertFails(deleteDoc(doc(as("admin@a.co"), "colegios/A")));
  await assertFails(getDocs(collection(as("admin@a.co"), "colegios")));
  await assertSucceeds(getDocs(collection(as(SUPER), "colegios")));
  await assertFails(getDocs(collection(anon(), "colegios")));
});
test("el superadmin accede a todos los colegios", async () => {
  const db = as(SUPER);
  await assertSucceeds(students(db, "A"));
  await assertSucceeds(students(db, "B"));
  await assertSucceeds(setDoc(doc(db, "colegios/B/miembros/nuevo@x.co"), { email: "nuevo@x.co", role: "admin", status: "active" }));
});
test("'¿en qué colegios estoy?': cada quien lista SOLO sus membresías", async () => {
  const mine = (db, email) => getDocs(query(collectionGroup(db, "miembros"), where("email", "==", email)));
  const snap = await assertSucceeds(mine(as("psi@a.co"), "psi@a.co"));
  if (snap.size !== 2) throw new Error("debía ver sus 2 colegios, vio " + snap.size);
  await assertFails(mine(as("psi@a.co"), "admin@a.co"));            // la de otra persona
  await assertFails(getDocs(collectionGroup(as("psi@a.co"), "miembros"))); // todas
  await assertFails(mine(anon(), "psi@a.co"));
});
test("encuesta pública por colegio: lee solo su encuesta activa y crea su respuesta; nada más", async () => {
  const db = anon();
  const ok = await assertSucceeds(getDoc(doc(db, "colegios/A/surveys/sv1")));
  if (ok.data().colegioNombre !== "Colegio A") throw new Error("no trajo el nombre del colegio");
  await assertFails(getDoc(doc(db, "colegios/A/surveys/draft")));
  await assertFails(getDocs(collection(db, "colegios/A/surveys")));
  await assertFails(students(db, "A"));
  await assertFails(getDoc(doc(db, "colegios/A/settings/global")));
  await assertSucceeds(setDoc(doc(db, "colegios/A/responses/sv1_2"), sub()));
  await assertSucceeds(setDoc(doc(db, "colegios/A/responseMarks/sv1_2"), { surveyId: "sv1", respondentId: "2" }));
  await assertSucceeds(getDoc(doc(db, "colegios/A/responseMarks/sv1_2")));
  await assertFails(getDocs(collection(db, "colegios/A/responseMarks")));
});
test("encuesta pública: no sobrescribe, no cruza colegios, rechaza formatos inválidos", async () => {
  const db = anon();
  await assertFails(setDoc(doc(db, "colegios/A/responses/sv1_1"), sub({ respondentId: "1", respondentName: "Ana" })));
  await assertFails(updateDoc(doc(db, "colegios/A/responses/sv1_1"), { answers: {} }));
  await assertFails(setDoc(doc(db, "colegios/A/responses/sv1_2"), sub({ extra: 1 })));
  await assertFails(setDoc(doc(db, "colegios/A/responses/sv1_99"), sub({ respondentId: "99" })));
  await assertFails(setDoc(doc(db, "colegios/A/responses/draft_1"), sub({ surveyId: "draft", respondentId: "1" })));
  await assertFails(setDoc(doc(db, "colegios/ZZ/responses/sv1_2"), sub()));   // colegio inexistente
});
test("logo: los ajustes rechazan imágenes de más de 300 KB", async () => {
  const db = as("admin@a.co");
  await assertSucceeds(setDoc(doc(db, "colegios/A/settings/global"), { colegio: "A", logo: "x".repeat(1000) }));
  await assertFails(setDoc(doc(db, "colegios/A/settings/global"), { colegio: "A", logo: "x".repeat(300001) }));
});

// ── Migración: el superadmin debe poder escribir TODO lo que genera planMigration ──
import { planMigration, chunk } from "../src/lib/colegio.js";
import { buildRoster } from "../src/lib/sociometry.js";
import { writeBatch, Timestamp } from "firebase/firestore";

test("migración: el superadmin puede copiar estudiantes, encuestas, respuestas, marcas, actividad, ajustes y miembros; nadie más", async () => {
  const legacy = {
    settings: { colegio: "Colegio X", ciudad: "Bogotá", logoUrl: "" },
    groups: [{ id: "g1", name: "5A", color: "#fff" }],
    students: [{ id: "1", name: "Ana", group: "5A", av: "A" }, { id: "2", name: "Beto", group: "5A", av: "B" }],
    surveys: [{ id: "sv1", status: "active", group: "5A", questions: [{ id: "q1", tp: "pos" }], createdAt: Timestamp.now() }, { id: "sv2", status: "draft" }],
    responses: [{ id: "sv1_1", surveyId: "sv1", respondentId: "1", respondentName: "Ana", answers: { q1: ["2"] }, submittedAt: Timestamp.fromDate(new Date("2026-03-01")) }],
    activity: [{ id: "a1", text: "x", createdAt: Timestamp.now() }],
    users: [{ id: "psi@x.co", email: "psi@x.co", role: "psychologist", status: "active" }],
  };
  const ops = planMigration(legacy, "inicial", buildRoster);
  const run = async (db) => { for (const part of chunk(ops)) { const b = writeBatch(db); part.forEach((o) => b.set(doc(db, o.path), o.data)); await b.commit(); } };
  await assertFails(run(as("admin@a.co")));
  await assertFails(run(as("intruso@x.co")));
  await assertSucceeds(run(as(SUPER)));
  await assertSucceeds(run(as(SUPER)));                          // repetirla no falla (idempotente)
  // y el colegio migrado queda funcional: el psicólogo migrado lee sus estudiantes
  await assertSucceeds(getDoc(doc(as("psi@x.co"), "colegios/inicial/students/1")));
  await assertSucceeds(getDoc(doc(anon(), "colegios/inicial/surveys/sv1")));      // encuesta activa con roster
  await assertFails(getDoc(doc(anon(), "colegios/inicial/surveys/sv2")));
});

test("la encuesta pública sigue sin poder actualizar respuestas ni marcas (solo el superadmin al migrar)", async () => {
  await assertFails(updateDoc(doc(anon(), "colegios/a/responses/sv1_1"), { answers: {} }));
  await assertFails(updateDoc(doc(as("admin@a.co"), "colegios/a/responses/sv1_1"), { answers: {} }));
  await assertFails(updateDoc(doc(as("psi@a.co"), "colegios/a/responses/sv1_1"), { answers: {} }));
});

// ── Registro de actividad: no se puede falsificar ──
const entrada = (email, over = {}) => ({ type: "group", action: "creó el grupo", detail: "5A", user: "Ana", email, createdAt: serverTimestamp(), ...over });
test("actividad: un psicólogo registra su propia acción; el solo lectura no", async () => {
  await assertSucceeds(setDoc(doc(as("psi@a.co"), "colegios/A/activity/n1"), entrada("psi@a.co")));
  { const { detail, ...sinDetalle } = entrada("admin@a.co"); await assertSucceeds(setDoc(doc(as("admin@a.co"), "colegios/A/activity/n2"), sinDetalle)); }   // el detalle es opcional
  await assertFails(setDoc(doc(as("ro@a.co"), "colegios/A/activity/n3"), entrada("ro@a.co")));
  await assertFails(setDoc(doc(anon(), "colegios/A/activity/n4"), entrada("x@x.co")));
});
test("actividad: no se puede firmar a nombre de otra persona, ni falsear la hora, ni añadir campos o tipos", async () => {
  const db = as("psi@a.co");
  await assertFails(setDoc(doc(db, "colegios/A/activity/f1"), entrada("admin@a.co")));                                   // a nombre de otro
  await assertFails(setDoc(doc(db, "colegios/A/activity/f2"), entrada("psi@a.co", { createdAt: new Date("2020-01-01") }))); // hora inventada
  await assertFails(setDoc(doc(db, "colegios/A/activity/f3"), entrada("psi@a.co", { extra: 1 })));                          // campo extra
  await assertFails(setDoc(doc(db, "colegios/A/activity/f4"), entrada("psi@a.co", { type: "borrado" })));                   // tipo desconocido
  await assertFails(setDoc(doc(db, "colegios/A/activity/f5"), entrada("psi@a.co", { action: "x".repeat(201) })));           // demasiado largo
  await assertFails(setDoc(doc(db, "colegios/A/activity/f6"), entrada("psi@a.co", { detail: "x".repeat(301) })));
  await assertFails(setDoc(doc(db, "colegios/A/activity/f7"), entrada("PSI@A.CO")));                                        // el correo debe coincidir exacto en minúsculas
});
test("actividad: no se escribe en otro colegio; solo el administrador la lee y ni él puede editar una entrada", async () => {
  await assertFails(setDoc(doc(as("psi@b.co"), "colegios/A/activity/o1"), entrada("psi@b.co")));
  await assertSucceeds(setDoc(doc(as("psi@a.co"), "colegios/A/activity/l1"), entrada("psi@a.co")));
  await assertFails(getDoc(doc(as("psi@a.co"), "colegios/A/activity/l1")));                   // el psicólogo no lee el registro
  await assertSucceeds(getDoc(doc(as("admin@a.co"), "colegios/A/activity/l1")));
  await assertSucceeds(getDocs(collection(as("admin@a.co"), "colegios/A/activity")));
  await assertFails(updateDoc(doc(as("admin@a.co"), "colegios/A/activity/l1"), { action: "otra" }));
  await assertFails(updateDoc(doc(as("psi@a.co"), "colegios/A/activity/l1"), { action: "otra" }));
});

// ── Eliminar usuarios ──
test("eliminar un miembro: solo el administrador de ese colegio (o el superadmin); y quien se elimina pierde todo acceso", async () => {
  await assertFails(deleteDoc(doc(as("psi@a.co"), "colegios/A/miembros/ro@a.co")));        // un psicólogo no administra usuarios
  await assertFails(deleteDoc(doc(as("ro@a.co"), "colegios/A/miembros/psi@a.co")));
  await assertFails(deleteDoc(doc(as("admin@b.co"), "colegios/A/miembros/ro@a.co")));      // el administrador de otro colegio, tampoco
  await assertSucceeds(students(as("ro@a.co"), "A"));
  await assertSucceeds(deleteDoc(doc(as("admin@a.co"), "colegios/A/miembros/ro@a.co")));
  await assertFails(students(as("ro@a.co"), "A"));                                          // ya no lee nada
  await assertFails(getDoc(doc(as("ro@a.co"), "colegios/A")));
  await assertSucceeds(students(as("psi@b.co"), "B"));                                      // el otro colegio no se afecta
});
test("revocar guarda el rol anterior y reactivar lo restaura (campo rolAnterior permitido); el rol sigue validándose", async () => {
  const adm = as("admin@a.co");
  await assertSucceeds(updateDoc(doc(adm, "colegios/A/miembros/psi@a.co"), { status: "revoked", role: "readonly", rolAnterior: "psychologist" }));
  await assertFails(students(as("psi@a.co"), "A"));                                         // revocado: sin acceso
  await assertSucceeds(updateDoc(doc(adm, "colegios/A/miembros/psi@a.co"), { status: "active", role: "psychologist" }));
  await assertSucceeds(students(as("psi@a.co"), "A"));
  await assertFails(updateDoc(doc(adm, "colegios/A/miembros/psi@a.co"), { role: "superadmin" }));   // roles inventados, no
});
