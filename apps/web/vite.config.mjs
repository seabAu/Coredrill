import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        appShell: fileURLToPath(new URL("./app-shell.html", import.meta.url)),
        documents: fileURLToPath(new URL("./document-spike.html", import.meta.url)),
        storage: fileURLToPath(new URL("./index.html", import.meta.url)),
        uiFoundations: fileURLToPath(new URL("./ui-foundations.html", import.meta.url)),
      },
    },
    target: "es2023",
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  server: {
    host: "127.0.0.1",
  },
});
