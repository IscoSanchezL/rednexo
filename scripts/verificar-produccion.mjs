// Comprueba que lo publicado está sano: la página abre, todos sus archivos existen y se sirven como JavaScript/CSS,
// y están las funciones clave. Uso: npm run verificar   (opcional: node scripts/verificar-produccion.mjs https://otra-url)
const BASE = (process.argv[2] || "https://rednexo-fd35c.web.app").replace(/\/$/, "");
let fallos = 0;
const ok = (c, m) => { console.log((c ? "ok     " : "FALLÓ  ") + m); if (!c) fallos++; };
const get = async (u) => { const r = await fetch(u, { headers: { "Cache-Control": "no-cache" } }); return { r, t: await r.text() }; };

const { r, t: html } = await get(BASE + "/");
ok(r.ok && /text\/html/.test(r.headers.get("content-type") || ""), `la página principal responde (${r.status})`);
ok(/no-cache/.test(r.headers.get("cache-control") || ""), "index.html no se guarda en caché (siempre llega la versión nueva)");
const archivos = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]))];
ok(archivos.length >= 2, `la página referencia ${archivos.length} archivos`);
const js = [];
for (const a of archivos) {
  const { r: ra, t } = await get(BASE + a);
  const tipo = ra.headers.get("content-type") || "";
  const esperado = a.endsWith(".js") ? /javascript/ : a.endsWith(".css") ? /css/ : /./;
  ok(ra.ok && esperado.test(tipo) && !/^\s*<!doctype html/i.test(t), `${a} · ${ra.status} · ${tipo.split(";")[0]} · ${(t.length / 1024).toFixed(0)} KB`);
  if (a.endsWith(".js")) js.push(t);
}
const todo = js.join("\n");
for (const marca of ["Panorama del grupo", "Comparar aplicaciones", "Cuándo vigilar", "esta pregunta es obligatoria", "Algo no salió como esperábamos", "Guía para leer los indicadores", "Promedio del grupo", "rednexo-logo-oscuro"]) ok(todo.includes(marca), `incluye «${marca}»`);
// Imágenes de marca e iconos de la app: deben ser imágenes reales (no la página de inicio devuelta por error).
for (const img of ["/rednexo-logo-claro.png", "/rednexo-logo-oscuro.png", "/rednexo-simbolo.png", "/favicon.png", "/apple-touch-icon.png", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png"]) {
  const ri = await fetch(BASE + img); const tipo = ri.headers.get("content-type") || ""; const n = (await ri.arrayBuffer()).byteLength;
  ok(ri.ok && /image\//.test(tipo) && n > 1000, `${img} · ${ri.status} · ${tipo.split(";")[0]} · ${(n / 1024).toFixed(0)} KB`);
}
for (const ruta of ["/sw.js", "/manifest.webmanifest"]) { const { r: rr } = await get(BASE + ruta); ok(rr.ok, `${ruta} responde (${rr.status})`); }
console.log(fallos ? `\n${fallos} problema(s): NO des por buena la publicación.` : "\nPublicación verificada.");
process.exit(fallos ? 1 : 0);
