import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";

const installAppShellHistoryFallback = (server) => {
  server.middlewares.use((request, _response, next) => {
    const acceptsHtml = request.headers.accept?.includes("text/html") === true;
    if (
      request.method === "GET" &&
      acceptsHtml &&
      /^\/(?:pipeline(?:\/.*)?|jobs\/[^/]+\/[^/?#]+)(?:[?#].*)?$/u.test(request.url ?? "")
    ) {
      request.url = "/app-shell.html";
    }
    next();
  });
};

const appShellHistoryFallback = {
  name: "coredrill-app-shell-history-fallback",
  configurePreviewServer: installAppShellHistoryFallback,
  configureServer: installAppShellHistoryFallback,
};

export default defineConfig({
  plugins: [appShellHistoryFallback, tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        appShell: fileURLToPath(new URL("./app-shell.html", import.meta.url)),
        documents: fileURLToPath(new URL("./document-spike.html", import.meta.url)),
        onboarding: fileURLToPath(new URL("./onboarding.html", import.meta.url)),
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
