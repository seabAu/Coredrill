import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2023",
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  server: {
    host: "127.0.0.1",
  },
});
