import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
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
  },
});
