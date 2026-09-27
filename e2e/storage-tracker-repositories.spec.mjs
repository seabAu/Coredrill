import { expect, test } from "@playwright/test";

test("runs the versioned Phase 1 repository contract manifest in browser SQLite", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Harness ready");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);

  const proof = await page.evaluate(() =>
    globalThis.coredrillStorageSpike.runPhase1RepositoryContracts(),
  );

  expect(proof.manifest.schemaVersion).toBe(5);
  expect(proof.manifest.suiteName).toBe("phase-1-repository-contracts-v5");
  expect(Object.keys(proof.manifest.components)).toEqual([
    "tracker",
    "pipeline",
    "view",
    "document",
    "jobSearch",
    "diagnostic",
    "requirementEvidence",
  ]);
  const reviewedCases = proof.manifest.caseNames;
  expect(reviewedCases).toHaveLength(21);
  expect(proof.run).toEqual({
    adapterName: "official-sqlite-wasm-opfs-sahpool",
    suiteName: proof.manifest.suiteName,
    completedCases: reviewedCases,
  });
});
