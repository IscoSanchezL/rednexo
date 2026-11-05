// Gestión de la plataforma: superadmins, suspensión de colegios, borrado completo y auditoría.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, addDoc, serverTimestamp, writeBatch } from "firebase/firestore";

let env;
const ROOT = "franksanlo@gmail.com";
const SA = "dueno@iskonex.co";          // superadmin adicional (cuenta corporativa)
const as = (email) => env.authenticatedContext(email, { email, email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({ projectId: "rednexo-test-plataforma", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, `superadmins/${SA}`), { email: SA, activo: true });
    await setDoc(doc(db, "superadmins/baja@iskonex.co"), { email: "baja@iskonex.co", activo: false });
    for (const cid of ["a", "b"]) {
      await setDoc(doc(db, `colegios/${cid}`), { nombre: "Colegio " + cid });
      await setDoc(doc(db, `colegios/${cid}/miembros/admin@${cid}.co`), { email: `admin@${cid}.co`, role: "admin", status: "active" });
      await setDoc(doc(db, `colegios/${cid}/miembros/psi@${cid}.co`), { email: `psi@${cid}.co`, role: "psychologist", status: "active" });
      await setDoc(doc(db, `colegios/${cid}/students/1`), { id: "1", name: "Ana", group: "5A" });
      await setDoc(doc(db, `colegios/${cid}/groups/g1`), { id: "g1", name: "5A" });
      await setDoc(doc(db, `colegios/${cid}/settings/global`), { colegio: "Colegio " + cid, logo: "x" });
      await setDoc(doc(db, `colegios/${cid}/activity/a1`), { text: "x" });
      await setDoc(doc(db, `colegios/${cid}/responses/sv1_1`), { surveyId: "sv1", respondentId: "1", respondentName: "Ana", answers: {} });
      await setDoc(doc(db, `colegios/${cid}/responseMarks/sv1_1`), { surveyId: "sv1", respondentId: "1" });
      await setDoc(doc(db, `colegios/${cid}/surveys/sv1`), { id: "sv1", status: "active", questions: [], rosterIds: ["1", "2"] });
    }
  });
});
const sub = () => ({ surveyId: "sv1", respondentId: "2", respondentName: "Beto", answers: { q: ["1"] }, submittedAt: serverTimestamp() });

// ── 1. Superadmins ──
test("un superadmin adicional accede a todos los colegios y puede crear colegios", async () => {
  const db = as(SA);
  await assertSucceeds(getDoc(doc(db, "colegios/a/students/1")));
  await assertSucceeds(getDoc(doc(db, "colegios/b/students/1")));
  await assertSucceeds(setDoc(doc(db, "colegios/c"), { nombre: "Nuevo" }));
  await assertSucceeds(getDocs(collection(db, "colegios")));
});
test("solo la raíz administra superadmins: ni un superadmin adicional ni un admin de colegio pueden crear, activar ni borrar", async () => {
  // Primero las negativas, con el superadmin adicional todavía activo (si no, fallarían por otro motivo).
  await assertFails(setDoc(doc(as(SA), "superadmins/otro@iskonex.co"), { email: "otro@iskonex.co", activo: true }));
  await assertFails(updateDoc(doc(as(SA), "superadmins/baja@iskonex.co"), { activo: true }));
  await assertFails(deleteDoc(doc(as(SA), `superadmins/${SA}`)));
  await assertFails(setDoc(doc(as("admin@a.co"), "superadmins/admin@a.co"), { email: "admin@a.co", activo: true }));
  await assertFails(setDoc(doc(as("intruso@x.co"), "superadmins/intruso@x.co"), { email: "intruso@x.co", activo: true }));
  await assertFails(setDoc(doc(as(ROOT), "superadmins/malo@x.co"), { email: "otro@x.co", activo: true }));   // el id debe coincidir con el correo
  // La raíz sí puede.
  await assertSucceeds(setDoc(doc(as(ROOT), "superadmins/nuevo@iskonex.co"), { email: "nuevo@iskonex.co", activo: true }));
  await assertSucceeds(updateDoc(doc(as(ROOT), "superadmins/baja@iskonex.co"), { activo: true }));
  await assertSucceeds(deleteDoc(doc(as(ROOT), "superadmins/nuevo@iskonex.co")));
});
test("un superadmin desactivado o inexistente pierde el acceso", async () => {
  await assertFails(getDoc(doc(as("baja@iskonex.co"), "colegios/a/students/1")));
  await assertFails(setDoc(doc(as("baja@iskonex.co"), "colegios/c"), { nombre: "x" }));
  await assertSucceeds(updateDoc(doc(as(ROOT), `superadmins/${SA}`), { activo: false }));
  await assertFails(getDoc(doc(as(SA), "colegios/a/students/1")));
});
test("la raíz no puede quedarse sin acceso desde la aplicación", async () => {
  await assertSucceeds(setDoc(doc(as(ROOT), `superadmins/${ROOT}`), { email: ROOT, activo: false }));
  await assertSucceeds(getDoc(doc(as(ROOT), "colegios/a/students/1")));
});
test("cada cuenta puede consultar si es superadmin; nadie lista la lista salvo un superadmin", async () => {
  await assertSucceeds(getDoc(doc(as("admin@a.co"), "superadmins/admin@a.co")));
  await assertFails(getDoc(doc(as("admin@a.co"), `superadmins/${SA}`)));
  await assertFails(getDocs(collection(as("admin@a.co"), "superadmins")));
  await assertFails(getDocs(collection(anon(), "superadmins")));
  await assertSucceeds(getDocs(collection(as(SA), "superadmins")));
});
test("correo sin verificar no es superadmin", async () => {
  const db = env.authenticatedContext(SA, { email: SA, email_verified: false }).firestore();
  await assertFails(getDoc(doc(db, "colegios/a/students/1")));
});

// ── 3. Suspensión ──
test("colegio suspendido: sus miembros no leen ni escriben; el otro colegio no se afecta", async () => {
  await env.withSecurityRulesDisabled(async (c) => { await updateDoc(doc(c.firestore(), "colegios/a"), { estado: "suspendido" }); });
  for (const e of ["admin@a.co", "psi@a.co"]) {
    await assertFails(getDoc(doc(as(e), "colegios/a/students/1")));
    await assertFails(getDocs(collection(as(e), "colegios/a/students")));
    await assertFails(setDoc(doc(as(e), "colegios/a/students/2"), { name: "X", group: "5A" }));
    await assertFails(getDoc(doc(as(e), "colegios/a/settings/global")));
  }
  await assertSucceeds(getDoc(doc(as("psi@b.co"), "colegios/b/students/1")));
});
test("colegio suspendido: el miembro aún ve el documento del colegio (para mostrar el aviso) y su membresía; el superadmin entra", async () => {
  await env.withSecurityRulesDisabled(async (c) => { await updateDoc(doc(c.firestore(), "colegios/a"), { estado: "suspendido" }); });
  const snap = await assertSucceeds(getDoc(doc(as("psi@a.co"), "colegios/a")));
  if (snap.data().estado !== "suspendido") throw new Error("no ve el estado");
  await assertSucceeds(getDoc(doc(as("psi@a.co"), "colegios/a/miembros/psi@a.co")));
  await assertSucceeds(getDoc(doc(as(SA), "colegios/a/students/1")));
  await assertSucceeds(getDoc(doc(as(ROOT), "colegios/a/students/1")));
  await assertFails(getDoc(doc(as("psi@b.co"), "colegios/a")));      // ni siquiera ve el colegio de otro
});
test("colegio suspendido: la encuesta pública deja de leerse y de recibir respuestas", async () => {
  await assertSucceeds(getDoc(doc(anon(), "colegios/a/surveys/sv1")));
  await env.withSecurityRulesDisabled(async (c) => { await updateDoc(doc(c.firestore(), "colegios/a"), { estado: "suspendido" }); });
  await assertFails(getDoc(doc(anon(), "colegios/a/surveys/sv1")));
  await assertFails(setDoc(doc(anon(), "colegios/a/responses/sv1_2"), sub()));
  await assertFails(setDoc(doc(anon(), "colegios/a/responseMarks/sv1_2"), { surveyId: "sv1", respondentId: "2" }));
  await assertSucceeds(setDoc(doc(anon(), "colegios/b/responses/sv1_2"), sub()));   // otro colegio sigue funcionando
});
test("solo el superadmin suspende o reactiva; el administrador del colegio no puede reactivarse", async () => {
  await assertFails(updateDoc(doc(as("admin@a.co"), "colegios/a"), { estado: "suspendido" }));
  await assertSucceeds(updateDoc(doc(as(SA), "colegios/a"), { estado: "suspendido" }));
  await assertFails(updateDoc(doc(as("admin@a.co"), "colegios/a"), { estado: "activo" }));
  await assertFails(setDoc(doc(as("admin@a.co"), "colegios/a/settings/global"), { colegio: "x" }));
  await assertSucceeds(updateDoc(doc(as(SA), "colegios/a"), { estado: "activo" }));
  await assertSucceeds(getDoc(doc(as("psi@a.co"), "colegios/a/students/1")));        // reactivado: vuelve todo
  await assertSucceeds(setDoc(doc(anon(), "colegios/a/responses/sv1_2"), sub()));
});

// ── 4. Exportar y eliminar un colegio completo ──
const SUBS = ["students", "groups", "surveys", "responses", "responseMarks", "activity", "settings", "miembros"];
const wipe = async (db, cid) => {
  for (const name of SUBS) {
    const snap = await getDocs(collection(db, `colegios/${cid}/${name}`));
    const b = writeBatch(db); snap.docs.forEach((d) => b.delete(d.ref)); await b.commit();
  }
  await deleteDoc(doc(db, `colegios/${cid}`));
};
test("el superadmin elimina un colegio completo (todas las subcolecciones, ajustes incluidos) sin tocar el otro", async () => {
  await assertSucceeds(wipe(as(SA), "a"));
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const n of SUBS) if ((await getDocs(collection(db, `colegios/a/${n}`))).size !== 0) throw new Error("quedaron documentos en " + n);
    if ((await getDoc(doc(db, "colegios/a"))).exists()) throw new Error("quedó el colegio");
    if (!(await getDoc(doc(db, "colegios/b/students/1"))).exists()) throw new Error("se borró el otro colegio");
  });
});
test("nadie más elimina un colegio ni sus datos: administradores, psicólogos, otros colegios, anónimos", async () => {
  await assertFails(deleteDoc(doc(as("admin@a.co"), "colegios/a")));
  await assertFails(wipe(as("admin@b.co"), "a"));
  await assertFails(deleteDoc(doc(as("psi@a.co"), "colegios/a/miembros/psi@a.co")));   // un psicólogo no administra miembros
  await assertFails(deleteDoc(doc(as("psi@a.co"), "colegios/a/activity/a1")));         // ni la bitácora
  await assertFails(deleteDoc(doc(anon(), "colegios/a/students/1")));
});
test("el administrador de un colegio puede leer todo lo necesario para exportar su propio colegio; el psicólogo no ve miembros ni actividad", async () => {
  const db = as("admin@a.co");
  for (const n of SUBS) await assertSucceeds(getDocs(collection(db, `colegios/a/${n}`)));
  await assertFails(getDocs(collection(as("psi@a.co"), "colegios/a/miembros")));
  await assertFails(getDocs(collection(as("psi@a.co"), "colegios/a/activity")));
  await assertFails(getDocs(collection(db, "colegios/b/students")));
});

// ── Auditoría ──
const aud = (por, over = {}) => ({ accion: "suspender", colegio: "a", por, en: serverTimestamp(), ...over });
test("auditoría: el superadmin registra; solo se puede registrar a nombre propio", async () => {
  await assertSucceeds(addDoc(collection(as(SA), "auditoria"), aud(SA)));
  await assertSucceeds(addDoc(collection(as(ROOT), "auditoria"), aud(ROOT)));
  await assertFails(addDoc(collection(as(SA), "auditoria"), aud(ROOT)));          // no se suplanta a otra persona
  await assertFails(addDoc(collection(as(SA), "auditoria"), { accion: 5, colegio: "a", por: SA }));
});
test("auditoría: el administrador de un colegio solo registra sobre su colegio; psicólogos y anónimos no", async () => {
  await assertSucceeds(addDoc(collection(as("admin@a.co"), "auditoria"), aud("admin@a.co", { accion: "exportar" })));
  await assertFails(addDoc(collection(as("admin@a.co"), "auditoria"), aud("admin@a.co", { colegio: "b" })));
  await assertFails(addDoc(collection(as("psi@a.co"), "auditoria"), aud("psi@a.co")));
  await assertFails(addDoc(collection(anon(), "auditoria"), aud("x@x.co")));
});
test("auditoría: solo los superadmins leen, y nadie edita ni borra (ni siquiera la raíz)", async () => {
  let id;
  await env.withSecurityRulesDisabled(async (c) => { id = (await addDoc(collection(c.firestore(), "auditoria"), aud(SA))).id; });
  await assertSucceeds(getDocs(collection(as(SA), "auditoria")));
  await assertFails(getDocs(collection(as("admin@a.co"), "auditoria")));
  await assertFails(getDoc(doc(anon(), `auditoria/${id}`)));
  await assertFails(updateDoc(doc(as(ROOT), `auditoria/${id}`), { accion: "otra" }));
  await assertFails(deleteDoc(doc(as(ROOT), `auditoria/${id}`)));
});
