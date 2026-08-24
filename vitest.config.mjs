import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      all: true,
      clean: true,
      include: [
        "packages/contracts/src/**/*.ts",
        "packages/domain/src/**/*.ts",
        "packages/application/src/**/*.ts",
        "packages/observability/src/**/*.ts",
        "packages/storage-core/src/**/*.ts",
        "tooling/architecture/check-boundaries.mjs",
      ],
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "coverage",
      thresholds: {
        branches: 70,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    include: ["packages/**/test/**/*.test.ts", "tooling/tests/**/*.test.mjs"],
    passWithNoTests: false,
    restoreMocks: true,
  },
});
