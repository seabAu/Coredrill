import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { selectCompanyRoles } from "./company-jobs-journey.mjs";
export const installCompanyOutcomesProbe = (page) =>
  page.evaluate(() => {
    const root = globalThis.coredrillStorageSpike,
      actual = root.companyOutcomes;
    const probe = { calls: [], failNext: false, holdNext: false, release: null, completed: 0 };
    globalThis.__companyOutcomesProbe = probe;
    globalThis.coredrillStorageSpike = {
      ...root,
      companyOutcomes: {
        page: async (input) => {
          const fail = probe.failNext,
            hold = probe.holdNext;
          probe.failNext = false;
          probe.holdNext = false;
          probe.calls.push(JSON.stringify(input));
          const result = await actual.page(input);
          if (fail) throw Error("PRIVATE outcome event notes/path");
          if (hold)
            await new Promise((resolve) => {
              probe.release = resolve;
            });
          probe.completed++;
          return result;
        },
      },
    };
  });
export const companyOutcomeIds = (panel) =>
  panel
    .locator("[data-company-outcome]")
    .evaluateAll((rows) => rows.map((row) => row.dataset.companyOutcome));
/** Same normal controls and actual SQLite results in browser/native modes. */
export const exerciseCompanyOutcomes = async (page, fixture, testInfo) => {
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Network", exact: true })
    .click();
  await installCompanyOutcomesProbe(page);
  await selectCompanyRoles(page, fixture.outcomeCompanyName);
  const panel = page.getByRole("region", { name: "Company recorded outcome history", exact: true });
  await expect.poll(() => companyOutcomeIds(panel)).toEqual(fixture.outcomeFirstIds);
  await expect(panel).not.toContainText("PRIVATE");
  await expect(panel).toContainText("not snapshots of their meaning at event time");
  await expect(
    panel.locator(`[data-company-outcome="${fixture.outcomeFirstIds[0]}"]`),
  ).toContainText("This application record is archived.");
  await expect(
    panel.locator(`[data-company-outcome="${fixture.outcomeFirstIds[1]}"]`),
  ).toContainText("Synthetic current reopening");
  await expect(
    panel.locator(`[data-company-outcome="${fixture.outcomeFirstIds[2]}"]`),
  ).toContainText("No previous stage recorded.");
  await expect(
    panel.locator(`[data-company-outcome="${fixture.outcomeReversedId}"]`),
  ).toContainText("Original change reversed by a recorded undo");
  await expect(panel).toContainText("Job-level change; no application reference recorded.");
  const before = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await page.evaluate(() => {
    globalThis.__companyOutcomesProbe.failNext = true;
  });
  await panel.getByRole("button", { name: "Next recorded outcomes", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("could not be read");
  await expect.poll(() => companyOutcomeIds(panel)).toEqual(fixture.outcomeFirstIds);
  await expect(panel).not.toContainText("PRIVATE");
  await expect(
    panel.getByRole("button", { name: "Next recorded outcomes", exact: true }),
  ).toBeDisabled();
  await panel.getByRole("button", { name: "Retry recorded-outcome page", exact: true }).click();
  await expect.poll(() => companyOutcomeIds(panel)).toEqual(fixture.outcomeSecondIds);
  expect(
    await page.evaluate(() => {
      const calls = globalThis.__companyOutcomesProbe.calls;
      return calls.at(-1) === calls.at(-2);
    }),
  ).toBe(true);
  await page.evaluate(() => {
    globalThis.__companyOutcomesProbe.holdNext = true;
  });
  await panel.getByRole("button", { name: "Next recorded outcomes", exact: true }).click();
  await page.waitForFunction(() => typeof globalThis.__companyOutcomesProbe.release === "function");
  const calls = await page.evaluate(() => globalThis.__companyOutcomesProbe.calls.length);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await expect.poll(() => companyOutcomeIds(panel)).toEqual(fixture.outcomeSecondIds);
  expect(await page.evaluate(() => globalThis.__companyOutcomesProbe.calls.length)).toBe(calls);
  await page.evaluate(() => {
    const probe = globalThis.__companyOutcomesProbe;
    probe.release();
    probe.release = null;
  });
  await expect(panel.locator("[data-company-outcome]")).toHaveCount(7);
  await expect(
    panel.getByRole("button", { name: "Next recorded outcomes", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  expect(
    (
      await new AxeBuilder({ page })
        .include('[aria-label="Company recorded outcome history"]')
        .analyze()
    ).violations,
  ).toEqual([]);
  await panel.getByRole("button", { name: "First recorded outcomes", exact: true }).click();
  await expect.poll(() => companyOutcomeIds(panel)).toEqual(fixture.outcomeFirstIds);
  await expect(
    panel.getByRole("button", { name: "First recorded outcomes", exact: true }),
  ).toBeFocused();
  const record = panel.locator("[data-company-outcome]").first();
  await record.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await record.screenshot({ path: testInfo.outputPath("company-recorded-outcomes-320.png") });
  await panel.getByLabel("Include history for archived linked jobs", { exact: true }).check();
  await expect.poll(() => companyOutcomeIds(panel)).toEqual(fixture.outcomeFirstIds);
  await panel.getByRole("button", { name: "Next recorded outcomes", exact: true }).click();
  await expect.poll(() => companyOutcomeIds(panel)).toEqual(fixture.outcomeSecondIds);
  await panel.getByRole("button", { name: "Next recorded outcomes", exact: true }).click();
  await expect(panel.locator("[data-company-outcome]")).toHaveCount(8);
  await expect(
    panel.locator(`[data-company-outcome="${fixture.outcomeArchivedId}"]`),
  ).toContainText("(archived)");
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(before);
  await page.reload();
  await expect.poll(() => companyOutcomeIds(panel)).toEqual(fixture.outcomeFirstIds);
  await expect(
    panel.getByLabel("Include history for archived linked jobs", { exact: true }),
  ).not.toBeChecked();
  return {
    syntheticArchivePrerequisite: true,
    recordedTransitions: true,
    currentDefinitionLabels: true,
    nullableAndArchivedApplications: true,
    recordedReversalRetained: true,
    exactRetry: true,
    heldReadReflowAxe: true,
    independentArchivedJobs: true,
    readSegmentWrites: 0,
    reloadFreshFirstPage: true,
  };
};
