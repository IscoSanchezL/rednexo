// Ayudantes de color. Los colores del tema son variables CSS (var(--c-ok)), que NO admiten el truco de
// añadir transparencia al final ("var(--c-ok)14" no es un valor válido y el navegador lo descarta).

/** El color con la transparencia indicada (hex 00-ff). Con #rrggbb conserva el comportamiento de siempre. */
export const tint = (c, a) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c + a : `color-mix(in srgb, ${c} ${Math.round(parseInt(a, 16) / 255 * 100)}%, transparent)`);

/** El color al pct % sobre un fondo OPACO (para celdas fijas que no deben dejar ver lo que hay detrás). */
export const mixOn = (c, pct, base = "var(--c-cardAlt)") => `color-mix(in srgb, ${c} ${pct}%, ${base})`;

/** El color algo más oscuro (modo claro) o más claro (modo oscuro), para que el texto se lea sobre su propio fondo tenue. */
export const ink = (c) => mixOn(c, 60, "var(--c-text)");
