import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { selectCompanyRoles } from "./company-jobs-journey.mjs";

export const installCompanyInteractionsProbe = (page) =>
  page.evaluate(() => {
    const root = globalThis.coredrillStorageSpike,
      actual = root.companyInteractions;
    const probe = {
      pages: [],
      summaries: [],
      failPage: false,
      failSummary: false,
      holdSummary: false,
      release: null,
    };
    globalThis.__companyInteractionsProbe = probe;
    globalThis.coredrillStorageSpike = {
      ...root,
      companyInteractions: {
        page: async (input) => {
          probe.pages.push(JSON.stringify(input));
          const result = await actual.page(input);
          if (probe.failPage) {
            probe.failPage = false;
            throw Error("PRIVATE company history page path");
          }
          return result;
        },
        summary: async (input) => {
          probe.summaries.push(JSON.stringify(input));
          const result = await actual.summary(input);
          if (probe.failSummary) {
            probe.failSummary = false;
            throw Error("PRIVATE company summary path");
          }
          if (probe.holdSummary) {
            probe.holdSummary = false;
            await new Promise((resolve) => {
              probe.release = resolve;
            });
          }
          return result;
        },
      },
    };
  });
export const companyInteractionIds = (panel) =>
  panel
    .locator("[data-company-interaction]")
    .evaluateAll((rows) => rows.map((row) => row.dataset.companyInteraction));

/** Actual normal controls and actual results; restored synthetic archive is a disclosed prerequisite. */
export const exerciseCompanyInteractions = async (page, fixture, testInfo) => {
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Network", exact: true })
    .click();
  await installCompanyInteractionsProbe(page);
  await selectCompanyRoles(page, fixture.historyCompanyName);
  const panel = page.getByRole("region", { name: "Company recorded interactions", exact: true });
  await expect.poll(() => companyInteractionIds(panel)).toEqual(fixture.historyFirstIds);
  await expect(panel).toContainText("Current linked job: Synthetic history job 400");
  await expect(panel).toContainText("Summary preview is partial.");
  await expect(panel).not.toContainText("PRIVATE");
  const before = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await page.evaluate(() => {
    globalThis.__companyInteractionsProbe.failPage = true;
  });
  await panel.getByRole("button", { name: "Next company interactions", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("could not be read");
  await expect.poll(() => companyInteractionIds(panel)).toEqual(fixture.historyFirstIds);
  await expect(panel.getByRole("button", { name: /^Read summary for/u }).first()).toBeDisabled();
  await expect(panel).not.toContainText("PRIVATE");
  await panel.getByRole("button", { name: "Retry company history page", exact: true }).click();
  await expect.poll(() => companyInteractionIds(panel)).toEqual(fixture.historySecondIds);
  expect(
    await page.evaluate(() => {
      const calls = globalThis.__companyInteractionsProbe.pages;
      return calls.at(-1) === calls.at(-2);
    }),
  ).toBe(true);
  await panel.getByRole("button", { name: "First company interactions", exact: true }).click();
  await expect.poll(() => companyInteractionIds(panel)).toEqual(fixture.historyFirstIds);
  await page.evaluate(() => {
    globalThis.__companyInteractionsProbe.holdSummary = true;
  });
  const open = panel.getByRole("button", { name: /^Read summary for/u }).first();
  await open.focus();
  await open.press("Enter");
  await page.waitForFunction(
    () => typeof globalThis.__companyInteractionsProbe.release === "function",
  );
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await expect(open).toBeDisabled();
  expect(await page.evaluate(() => globalThis.__companyInteractionsProbe.summaries.length)).toBe(1);
  await page.evaluate(() => {
    const probe = globalThis.__companyInteractionsProbe;
    probe.release();
    probe.release = null;
  });
  const summary = panel.getByRole("region", {
    name: "Selected company interaction summary",
    exact: true,
  });
  await expect(
    summary.getByRole("heading", { name: "Recorded summary", exact: true }),
  ).toBeFocused();
  await expect(summary).toContainText("Partial retained summary");
  await page.evaluate(() => {
    globalThis.__companyInteractionsProbe.failSummary = true;
  });
  await summary.getByRole("button", { name: "Read next summary part", exact: true }).click();
  await expect(summary.getByRole("alert")).toContainText("could not be read");
  await expect(summary).not.toContainText("PRIVATE");
  await summary.getByRole("button", { name: "Retry company summary part", exact: true }).click();
  await expect(summary).toContainText("Complete retained summary read.");
  expect(await summary.locator("p.cd-company-literal").textContent()).toBe(fixture.historySummary);
  const text = summary.getByRole("region", {
    name: "Retained company interaction summary text",
    exact: true,
  });
  await text.focus();
  await text.press("End");
  await expect.poll(() => text.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect((await text.boundingBox()).height).toBeLessThanOrEqual(384);
  expect(
    await page.evaluate(() => {
      const calls = globalThis.__companyInteractionsProbe.summaries;
      return calls.at(-1) === calls.at(-2);
    }),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  expect(
    (
      await new AxeBuilder({ page })
        .include('[aria-label="Company recorded interactions"]')
        .analyze()
    ).violations,
  ).toEqual([]);
  await panel.screenshot({ path: testInfo.outputPath("company-interactions-320.png") });
  await summary.getByRole("button", { name: "Close company summary", exact: true }).click();
  await expect(panel.locator("[data-company-history-status]")).toBeFocused();
  await panel.getByLabel("Include interactions for archived linked jobs", { exact: true }).check();
  await expect.poll(() => companyInteractionIds(panel)).toEqual(fixture.historyFirstIds);
  await panel.getByRole("button", { name: "Next company interactions", exact: true }).click();
  await expect.poll(() => companyInteractionIds(panel)).toEqual(fixture.historySecondIds);
  await panel.getByRole("button", { name: "Next company interactions", exact: true }).click();
  await expect(panel.locator("[data-company-interaction]")).toHaveCount(8);
  expect(await companyInteractionIds(panel)).toContain(fixture.historyArchivedId);
  await expect(panel).toContainText("Current linked job: Synthetic history job 401 (archived)");
  await expect(
    panel.getByRole("button", { name: "Next company interactions", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(before);
  await page.reload();
  await expect.poll(() => companyInteractionIds(panel)).toEqual(fixture.historyFirstIds);
  await expect(
    panel.getByLabel("Include interactions for archived linked jobs", { exact: true }),
  ).not.toBeChecked();
  return {
    syntheticArchivePrerequisite: true,
    literalSummaryReconstructed: true,
    exactPageAndPartRetries: true,
    archivedJobScope: true,
    reflowAxe: true,
    readSegmentWrites: 0,
    reloadStartsNewLivePage: true,
  };
};
