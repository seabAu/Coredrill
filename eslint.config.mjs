import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));
const restrictedApplicationPackages = [
  "@job-workspace/ui",
  "@job-workspace/storage-core",
  "@job-workspace/storage-browser",
  "@job-workspace/storage-native",
  "@job-workspace/capture-core",
  "@job-workspace/extractors",
  "@job-workspace/extension-bridge",
  "@job-workspace/career-evidence",
  "@job-workspace/prompt-engine",
  "@job-workspace/ai-adapters",
  "@job-workspace/labor-data",
  "@job-workspace/documents",
  "@job-workspace/source-policy",
  "@job-workspace/search-filter",
  "@job-workspace/observability",
  "@job-workspace/test-fixtures",
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
            ["@job-workspace/test-fixtures"],
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
              group: ["@job-workspace/*", "@tauri-apps/*"],
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
            "Application may depend only on domain and contracts workspace packages.",
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
                "@job-workspace/storage-*",
                "@job-workspace/ai-adapters",
                "@job-workspace/extractors",
                "@job-workspace/source-policy",
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
