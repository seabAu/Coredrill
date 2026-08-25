import { expect, test } from "@playwright/test";

test("runs the Phase 1 tracker repository contracts in browser SQLite", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Harness ready");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);

  const result = await page.evaluate(() =>
    globalThis.coredrillStorageSpike.runTrackerRepositoryContracts(),
  );

  expect(result).toEqual({
    adapterName: "official-sqlite-wasm-opfs-sahpool",
    suiteName: "phase-1-tracker-repositories",
    completedCases: [
      "migrates vault settings and preserves typed JSON",
      "persists company contact job source snapshot and provenance with bound values",
      "retains field candidates and requires explicit confirmed replacement",
      "enforces foreign keys and rolls back an invalid aggregate",
    ],
  });
});

test("runs the Phase 1 pipeline repository contracts in browser SQLite", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Harness ready");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);

  const result = await page.evaluate(() =>
    globalThis.coredrillStorageSpike.runPipelineRepositoryContracts(),
  );

  expect(result).toEqual({
    adapterName: "official-sqlite-wasm-opfs-sahpool",
    suiteName: "phase-1-pipeline-repositories",
    completedCases: [
      "stores custom stages without selecting default display vocabulary",
      "changes job and application status with atomic append-only history",
      "persists interactions actions interviews and local reminders transactionally",
    ],
  });
});
