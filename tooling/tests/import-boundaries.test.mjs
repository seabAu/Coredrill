import { ESLint } from "eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { checkWorkspace, runCli } from "../architecture/check-boundaries.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("workspace import boundaries", () => {
  it("accepts the production foundation graph", async () => {
    await expect(checkWorkspace(repositoryRoot)).resolves.toEqual([]);
  });

  it("rejects a real fixture workspace with a domain-to-native edge", async () => {
    const fixtureRoot = path.join(repositoryRoot, "tooling/fixtures/invalid-boundary");
    const issues = await checkWorkspace(fixtureRoot);

    expect(issues).toContain(
      "packages/domain/package.json: forbidden manifest edge domain -> storage-native",
    );
    expect(issues).toContain(
      "packages/domain/src/bad.ts: forbidden import domain -> storage-native (@job-workspace/storage-native)",
    );
  });

  it("reports manifest, reference, undeclared, relative, and fixture-edge drift", async () => {
    const fixtureRoot = path.join(repositoryRoot, "tooling/fixtures/mixed-boundaries");
    const issues = await checkWorkspace(fixtureRoot);

    expect(issues).toEqual(
      expect.arrayContaining([
        "packages/domain/package.json: package name must be @job-workspace/domain",
        "packages/application/tsconfig.json: TypeScript reference contracts lacks a declared workspace dependency",
        "packages/application/tsconfig.json: forbidden TypeScript reference application -> ui",
        "packages/application/src/bad.ts: import application -> contracts lacks a declared workspace dependency",
        "packages/application/src/bad.ts: forbidden import application -> storage-native (../../storage-native/src/index.js)",
        "packages/application/src/bad.ts: forbidden import application -> ui (@job-workspace/ui)",
        "packages/storage-core/package.json: forbidden manifest edge storage-core -> test-fixtures",
        "packages/storage-core/package.json: production package cannot depend on test-fixtures",
      ]),
    );
  });

  it("returns explicit CLI status for clean and invalid workspaces", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runCli(repositoryRoot)).resolves.toBe(0);
    await expect(
      runCli(path.join(repositoryRoot, "tooling/fixtures/invalid-boundary")),
    ).resolves.toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Import-boundary check passed"));
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Import-boundary check failed"));
  });

  it("makes ESLint reject the same forbidden domain import", async () => {
    const eslint = new ESLint({
      cwd: repositoryRoot,
      overrideConfigFile: path.join(repositoryRoot, "eslint.config.mjs"),
    });
    const [result] = await eslint.lintText('import "@job-workspace/storage-native";\n', {
      filePath: path.join(repositoryRoot, "packages/domain/src/intentional-violation.ts"),
      warnIgnored: false,
    });

    expect(result?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-restricted-imports",
          severity: 2,
        }),
      ]),
    );
  });
});
