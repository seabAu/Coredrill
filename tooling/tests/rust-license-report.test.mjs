import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const checkerPath = path.join(repositoryRoot, "tooling/scripts/check-rust-licenses.mjs");
const inventoryPath = path.join(repositoryRoot, "docs/proof/foundation-dependency-inventory.json");

describe("Rust license report CLI", () => {
  it("keeps --json out of the positional repository argument", () => {
    const output = execFileSync(process.execPath, [checkerPath, "--json", repositoryRoot], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, CARGO_TERM_COLOR: "never" },
      maxBuffer: 64 * 1024 * 1024,
    });
    const report = JSON.parse(output);
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));

    expect(report).toMatchObject({ schemaVersion: 1 });
    expect(report.packages).toHaveLength(inventory.cargo.licenseReview.resolvedPackageRecords);
  });
});
