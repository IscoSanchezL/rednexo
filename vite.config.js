import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  base: "/",
  plugins: [react()],
  // Versión que se adjunta a los tickets de soporte: «1.0.0 · 2026-11-07».
  define: { __APP_VERSION__: JSON.stringify(`${pkg.version} · ${new Date().toISOString().slice(0, 10)}`) },
});
