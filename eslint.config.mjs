import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));
const restrictedApplicationPackages = [
  "@coredrill/ui",
  "@coredrill/storage-core",
  "@coredrill/storage-browser",
  "@coredrill/storage-native",
  "@coredrill/capture-core",
  "@coredrill/extractors",
  "@coredrill/extension-bridge",
  "@coredrill/career-evidence",
  "@coredrill/prompt-engine",
  "@coredrill/ai-adapters",
  "@coredrill/labor-data",
  "@coredrill/documents",
  "@coredrill/source-policy",
  "@coredrill/search-filter",
  "@coredrill/test-fixtures",
];

const restrictedPaths = (packages, message) =>
  packages.flatMap((name) => [
    { name, message },
    { name: `${name}/*`, message },
  ]);

export default tseslint.config(
  {
    ignores: [
      ".turbo/**",
      "coverage/**",
      "dist/**",
      "docs/design/**",
      "node_modules/**",
      "tooling/fixtures/**",
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: {
        Buffer: "readonly",
        URL: "readonly",
        console: "readonly",
        process: "readonly",
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ["packages/domain/src/intentional-violation.ts"],
        },
        tsconfigRootDir: repositoryRoot,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports", prefer: "type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["packages/*/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: restrictedPaths(
            ["@coredrill/test-fixtures"],
            "Production packages cannot import shared test fixtures.",
          ),
          patterns: [
            {
              group: ["apps", "apps/*", "**/apps", "**/apps/*"],
              message: "Packages cannot import an application composition root.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/domain/src/**/*.{ts,tsx}", "packages/contracts/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@coredrill/*", "@tauri-apps/*"],
              message:
                "Domain and contracts are leaf packages and cannot import workspace adapters or runtimes.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/application/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: restrictedPaths(
            restrictedApplicationPackages,
            "Application may depend only on domain, contracts, and observability workspace packages.",
          ),
          patterns: [
            {
              group: ["@tauri-apps/*", "wxt", "openai", "@anthropic-ai/*"],
              message: "Concrete runtime and provider SDKs belong behind adapters.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/ui/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@coredrill/storage-*",
                "@coredrill/ai-adapters",
                "@coredrill/extractors",
                "@coredrill/source-policy",
                "@tauri-apps/*",
              ],
              message:
                "UI uses application-facing types and commands, never concrete adapters or privileged APIs.",
            },
          ],
        },
      ],
    },
  },
);
