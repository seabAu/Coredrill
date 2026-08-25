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
      "persists a stable local device identity with monotonic audit fields",
      "enforces document selection lineage and append-only integrity in SQLite",
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

test("runs the Phase 1 tag and saved-view repository contracts in browser SQLite", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Harness ready");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);

  const result = await page.evaluate(() =>
    globalThis.coredrillStorageSpike.runViewRepositoryContracts(),
  );

  expect(result).toEqual({
    adapterName: "official-sqlite-wasm-opfs-sahpool",
    suiteName: "phase-1-view-repositories",
    completedCases: [
      "assigns active tags idempotently and enforces job relationships",
      "round-trips versioned saved views with optimistic updates",
    ],
  });
});

test("runs the Phase 1 document repository contracts in browser SQLite", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Harness ready");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);

  const result = await page.evaluate(() =>
    globalThis.coredrillStorageSpike.runDocumentRepositoryContracts(),
  );

  expect(result).toEqual({
    adapterName: "official-sqlite-wasm-opfs-sahpool",
    suiteName: "phase-1-document-repositories",
    completedCases: [
      "persists canonical IR versions with explicit immutable lineage",
      "links jobs and content-addressed attachment manifests without storing bytes",
    ],
  });
});

test("runs accelerated and fallback job-search contracts in browser SQLite", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Harness ready");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);

  const result = await page.evaluate(() =>
    globalThis.coredrillStorageSpike.runJobSearchContracts(),
  );

  expect(result).toEqual({
    adapterName: "official-sqlite-wasm-opfs-sahpool",
    suiteName: "phase-1-job-search",
    completedCases: [
      "detects FTS5 and refreshes the accelerated lexical index",
      "keeps normalized-token search functional with FTS5 disabled",
    ],
  });
});
