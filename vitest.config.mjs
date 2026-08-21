import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      all: true,
      clean: true,
      include: ["tooling/architecture/check-boundaries.mjs"],
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
    include: ["tooling/tests/**/*.test.mjs"],
    passWithNoTests: false,
    restoreMocks: true,
  },
});
