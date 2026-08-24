import { defineConfig } from "wxt";

import { COREDRILL_PHASE0_APP_ORIGIN } from "./src/transfer-policy";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
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
