import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const APP_SHELL_NAVIGATION =
  /^\/(?:app-shell\.html|network\/(?:companies|contacts)(?:\/[^/?#]+)?|network\/interactions|pipeline(?:\/.*)?|jobs\/[^/]+\/[^/?#]+|documents(?:\/[^/?#]+)?|profile(?:\/[^/?#]+)?|insights(?:\/[^/?#]+)?|settings(?:\/[^/?#]+)?)\/?$/u;

const installAppShellHistoryFallback = (server) => {
  server.middlewares.use((request, _response, next) => {
    const acceptsHtml = request.headers.accept?.includes("text/html") === true;
    if (
      request.method === "GET" &&
      acceptsHtml &&
      APP_SHELL_NAVIGATION.test(new URL(request.url ?? "/", "http://coredrill.local").pathname)
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
  plugins: [
    appShellHistoryFallback,
    tailwindcss(),
    VitePWA({
      filename: "service-worker.js",
      includeAssets: ["coredrill-icon.svg"],
      injectRegister: false,
      manifest: {
        background_color: "#f7f4ed",
        description: "Local-first job search workspace",
        display: "standalone",
        icons: [
          {
            purpose: "any maskable",
            sizes: "any",
            src: "/coredrill-icon.svg",
            type: "image/svg+xml",
          },
        ],
        name: "Coredrill",
        scope: "/",
        short_name: "Coredrill",
        start_url: "/app-shell.html",
        theme_color: "#173f35",
      },
      registerType: "prompt",
      strategies: "generateSW",
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        globPatterns: ["**/*.{css,html,js,svg,wasm}"],
        inlineWorkboxRuntime: true,
        navigateFallback: "/app-shell.html",
        skipWaiting: false,
      },
    }),
  ],
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
