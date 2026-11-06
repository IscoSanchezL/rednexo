// Gestión de usuarios del colegio: qué se puede hacer con cada persona (lógica pura).

export const VALID_ROLES = ["admin", "psychologist", "readonly"];
export const ROLE_NAMES = { admin: "Administrador", psychologist: "Psicólogo", readonly: "Solo lectura" };
const low = (s) => String(s || "").toLowerCase();
const okRole = (r) => VALID_ROLES.includes(r);

/** Al revocar se baja a «solo lectura» pero se recuerda el rol que tenía, para poder restaurarlo. */
export function revokePatch(u) {
  return { status: "revoked", role: "readonly", rolAnterior: okRole(u.rolAnterior) && u.role === "readonly" ? u.rolAnterior : okRole(u.role) ? u.role : "readonly" };
}

/** Rol con el que vuelve una persona al reactivarla: el que se elija, si no el que tenía antes de revocarla, si no «solo lectura». */
export function reactivateRole(u, elegido) {
  if (okRole(elegido)) return elegido;
  if (okRole(u.rolAnterior)) return u.rolAnterior;
  return "readonly";
}

/**
 * Qué acciones se ofrecen para `u`:
 *  - nadie se revoca ni se elimina a sí mismo;
 *  - el único administrador activo no se puede revocar (el colegio no se queda sin quien lo administre);
 *  - solo se elimina a quien ya no tiene acceso (revocado o pendiente): primero se revoca.
 */
export function userActions(users, u, miCorreo) {
  const esYo = !!miCorreo && low(u.email) === low(miCorreo);
  const activo = u.status === "active";
  const adminsActivos = users.filter((x) => x.status === "active" && x.role === "admin");
  const ultimoAdmin = activo && u.role === "admin" && adminsActivos.length <= 1;
  const motivo = esYo ? "No puedes revocarte a ti mismo" : ultimoAdmin ? "Es el único administrador activo: nombra a otro antes" : "";
  return {
    esYo, ultimoAdmin, motivo,
    puedeRevocar: activo && !esYo && !ultimoAdmin,
    puedeReactivar: !activo && !esYo,
    puedeEliminar: !activo && !esYo,
  };
}
export const statusLabel = (s) => (s === "active" ? "Activo" : s === "pending" ? "Pendiente" : "Revocado");
