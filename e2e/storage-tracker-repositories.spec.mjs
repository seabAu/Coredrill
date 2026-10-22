import { expect, test } from "@playwright/test";

test("runs the versioned Phase 1 repository contract manifest in browser SQLite", async ({
  page,
}) => {
  await page.goto("/storage-verification.html");
  await expect(page.getByRole("status")).toHaveText("Harness ready");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);

  const proof = await page.evaluate(() =>
    globalThis.coredrillStorageSpike.runPhase1RepositoryContracts(),
  );

  expect(proof.manifest.schemaVersion).toBe(15);
  expect(proof.manifest.suiteName).toBe("phase-1-repository-contracts-v15");
  expect(Object.keys(proof.manifest.components)).toEqual([
    "tracker",
    "pipeline",
    "view",
    "document",
    "jobSearch",
    "diagnostic",
    "requirementEvidence",
    "companyDirectory",
    "companyWorkspace",
    "contactDirectory",
    "contactWorkspace",
    "contactHistory",
  ]);
  const reviewedCases = proof.manifest.caseNames;
  expect(reviewedCases).toHaveLength(34);
  expect(proof.run).toEqual({
    adapterName: "official-sqlite-wasm-opfs-sahpool",
    suiteName: proof.manifest.suiteName,
    completedCases: reviewedCases,
  });
});
