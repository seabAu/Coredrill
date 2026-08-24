import path from "node:path";

import { defineConfig } from "wxt";

import { COREDRILL_PHASE0_APP_ORIGIN } from "./src/transfer-policy";

const repositoryRoot = path.resolve(process.cwd(), "../..");

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  zip: {
    sourcesRoot: repositoryRoot,
    includeSources: [
      "LICENSE",
      "README.md",
      "SOURCE_CODE_REVIEW.md",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "tsconfig.json",
      "tooling/typescript/base.json",
      "apps/extension/README.md",
      "apps/extension/package.json",
      "apps/extension/tsconfig.json",
      "apps/extension/wxt.config.ts",
      "apps/extension/entrypoints/**",
      "apps/extension/src/**",
      "packages/contracts/package.json",
      "packages/contracts/tsconfig.json",
      "packages/contracts/schemas/**",
      "packages/contracts/src/**",
      "packages/capture-core/package.json",
      "packages/capture-core/tsconfig.json",
      "packages/capture-core/src/**",
      "packages/extension-bridge/package.json",
      "packages/extension-bridge/tsconfig.json",
      "packages/extension-bridge/src/**",
    ],
  },
  manifest: ({ browser }) => ({
    name: "Coredrill Capture",
    description: "Capture the job page you choose for review in your local Coredrill workspace.",
    permissions: ["activeTab", "scripting", "storage"],
    host_permissions: [],
    optional_permissions: [],
    optional_host_permissions: [],
    incognito: "not_allowed",
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
    ...(browser === "chrome"
      ? { externally_connectable: { matches: [`${COREDRILL_PHASE0_APP_ORIGIN}/*`] } }
      : {
          browser_specific_settings: {
            gecko: {
              id: "capture@coredrill.local",
              data_collection_permissions: { required: ["none"] },
            },
          },
        }),
  }),
});
