import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "../../packages/storage-core/src/repository-contract-manifest.ts";

const targets = [
  {
    name: "Firefox WebDriver",
    url: new URL("../scripts/run-storage-firefox-webdriver.mjs", import.meta.url),
    version: /proof\.repositoryContractVersion\s*!==\s*(\d+)/u,
    count: /proof\.repositoryContractCases\s*!==\s*(\d+)/u,
  },
  {
    name: "Chromium browser SQLite",
    url: new URL("../../e2e/storage-tracker-repositories.spec.mjs", import.meta.url),
    version: /expect\(proof\.manifest\.schemaVersion\)\.toBe\((\d+)\)/u,
    count: /expect\(reviewedCases\)\.toHaveLength\((\d+)\)/u,
  },
  {
    name: "actual native SQLite",
    url: new URL("../../packages/storage-native/test/native-database.test.ts", import.meta.url),
    version: /expect\(PHASE_1_REPOSITORY_CONTRACT_MANIFEST\.schemaVersion\)\.toBe\((\d+)\)/u,
    count: /expect\(PHASE_1_REPOSITORY_CONTRACT_CASE_NAMES\)\.toHaveLength\((\d+)\)/u,
  },
];

describe.each(targets)("reviewed repository execution inventory: $name", (target) => {
  const source = readFileSync(target.url, "utf8");

  it("retains an explicit reviewed version pin matching the shared manifest", () => {
    const match = target.version.exec(source);
    expect(match, "The execution target must retain an explicit version assertion").not.toBeNull();
    expect(Number(match?.[1])).toBe(PHASE_1_REPOSITORY_CONTRACT_MANIFEST.schemaVersion);
  });

  it("retains an explicit reviewed case-count pin matching the shared manifest", () => {
    const match = target.count.exec(source);
    expect(
      match,
      "The execution target must retain an explicit inventory-count assertion",
    ).not.toBeNull();
    expect(Number(match?.[1])).toBe(PHASE_1_REPOSITORY_CONTRACT_MANIFEST.caseNames.length);
  });
});
