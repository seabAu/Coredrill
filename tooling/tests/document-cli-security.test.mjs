import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const documentRequire = createRequire(path.join(root, "packages/documents/package.json"));
const mammothPackage = documentRequire.resolve("mammoth/package.json");
const mammothRequire = createRequire(mammothPackage);
const cli = path.join(path.dirname(mammothPackage), "bin/mammoth");

describe("Mammoth CLI security dependency compatibility", () => {
  it("preserves the accepted CLI with a parser that has no sprintf-js dependency", () => {
    expect(mammothRequire("argparse/package.json").version).toBe("2.0.1");
    expect(mammothRequire("argparse/package.json").dependencies ?? {}).not.toHaveProperty(
      "sprintf-js",
    );
    const run = (args) =>
      execFileSync(process.execPath, [cli, ...args], {
        cwd: root,
        encoding: "utf8",
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      });
    expect(run(["--help"])).toContain("usage:");
    const html = run(["fixtures/imports/synthetic-resume.docx"]);
    expect(html).toContain("Coredrill Labs");
    expect(html).toContain("Product Engineer");
    expect(html).toContain(
      "Built an <strong>accessible</strong> local-first workflow for <em>evidence-backed</em> job decisions.",
    );
  }, 30_000);
});
