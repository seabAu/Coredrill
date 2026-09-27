import { expect, test } from "@playwright/test";

test("runs the Career Profile repository contract in browser SQLite", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Harness ready");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);

  const proof = await page.evaluate(() =>
    globalThis.coredrillStorageSpike.runCareerRepositoryContracts(),
  );

  expect(proof.manifest).toEqual({
    schemaVersion: 1,
    suiteName: "phase-3-career-repositories-v1",
    cases: {
      roundTripAll:
        "round-trips employment education project skill accomplishment certification publication volunteer story and preferences",
      rollbackInvalidAggregate:
        "rolls back a career aggregate when a related source document is missing",
    },
    caseNames: [
      "round-trips employment education project skill accomplishment certification publication volunteer story and preferences",
      "rolls back a career aggregate when a related source document is missing",
    ],
  });
  expect(proof.run).toEqual({
    adapterName: "official-sqlite-wasm-opfs-sahpool",
    suiteName: proof.manifest.suiteName,
    completedCases: proof.manifest.caseNames,
  });
});
