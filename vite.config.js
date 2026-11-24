import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  base: "/",
  plugins: [react()],
  build: { rollupOptions: { output: { manualChunks: (id) => (id.includes("node_modules/firebase") || id.includes("node_modules/@firebase") ? "firebase" : id.includes("node_modules/react") ? "react" : undefined) } } },
  // Versión que se adjunta a los tickets de soporte: «1.0.0 · 2026-11-07».
  define: { __APP_VERSION__: JSON.stringify(`${pkg.version} · ${new Date().toISOString().slice(0, 10)}`) },
});
