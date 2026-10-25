import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { selectCompanyRoles } from "./company-jobs-journey.mjs";

export const installCompanySourcesProbe = (page) =>
  page.evaluate(() => {
    const root = globalThis.coredrillStorageSpike,
      actual = root.companySources;
    const probe = { calls: [], failNext: false, holdNext: false, release: null, completed: 0 };
    globalThis.__companySourcesProbe = probe;
    globalThis.coredrillStorageSpike = {
      ...root,
      companySources: {
        page: async (input) => {
          const fail = probe.failNext,
            hold = probe.holdNext;
          probe.failNext = false;
          probe.holdNext = false;
          probe.calls.push(JSON.stringify(input));
          const result = await actual.page(input);
          if (fail) throw Error("PRIVATE company source path/body");
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
export const companySourceIds = (panel) =>
  panel
    .locator("[data-company-source]")
    .evaluateAll((rows) => rows.map((row) => row.dataset.companySource));

/** Actual normal controls and SQLite results; archive restoration is a disclosed synthetic prerequisite. */
export const exerciseCompanySources = async (page, fixture, testInfo) => {
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Network", exact: true })
    .click();
  await installCompanySourcesProbe(page);
  await selectCompanyRoles(page, fixture.sourceCompanyName);
  const panel = page.getByRole("region", { name: "Company listing sources", exact: true });
  await expect.poll(() => companySourceIds(panel)).toEqual(fixture.sourceFirstIds);
  await expect(panel).not.toContainText("PRIVATE");
  const first = panel.locator(`[data-company-source="${fixture.sourceFirstIds[0]}"]`);
  await expect(first).toContainText(fixture.sourceUrl);
  await expect(
    first.getByRole("link", { name: "Open listing url externally", exact: true }),
  ).toHaveAttribute("href", "https://example.test/%7eRole?q=%2f");
  await expect(first.getByRole("link")).toHaveAttribute("rel", "noopener noreferrer");
  await expect(first).toContainText(`Stored current source hash: ${"a".repeat(64)}`);
  await expect(first).toContainText(`Stored snapshot hash: ${"b".repeat(64)}`);
  await expect(panel.locator(`[data-company-source="${fixture.sourceOnlyId}"]`)).toContainText(
    "No retained snapshot recorded for this source.",
  );
  const before = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await page.evaluate(() => {
    globalThis.__companySourcesProbe.failNext = true;
  });
  await panel.getByRole("button", { name: "Next listing sources", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("could not be read");
  await expect.poll(() => companySourceIds(panel)).toEqual(fixture.sourceFirstIds);
  await expect(panel.getByRole("link")).toHaveCount(0);
  await expect(panel.locator("[data-company-source-open]").first()).toBeDisabled();
  await panel.getByRole("button", { name: "Retry listing-source page", exact: true }).click();
  await expect.poll(() => companySourceIds(panel)).toEqual(fixture.sourceSecondIds);
  expect(
    await page.evaluate(() => {
      const calls = globalThis.__companySourcesProbe.calls;
      return calls.at(-1) === calls.at(-2);
    }),
  ).toBe(true);
  await page.evaluate(() => {
    globalThis.__companySourcesProbe.holdNext = true;
  });
  await panel.getByRole("button", { name: "Next listing sources", exact: true }).click();
  await page.waitForFunction(() => typeof globalThis.__companySourcesProbe.release === "function");
  const calls = await page.evaluate(() => globalThis.__companySourcesProbe.calls.length);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await expect.poll(() => companySourceIds(panel)).toEqual(fixture.sourceSecondIds);
  expect(await page.evaluate(() => globalThis.__companySourcesProbe.calls.length)).toBe(calls);
  await page.evaluate(() => {
    const probe = globalThis.__companySourcesProbe;
    probe.release();
    probe.release = null;
  });
  await expect(panel.locator("[data-company-source]")).toHaveCount(7);
  await expect(
    panel.getByRole("button", { name: "Next listing sources", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  expect(
    (await new AxeBuilder({ page }).include('[aria-label="Company listing sources"]').analyze())
      .violations,
  ).toEqual([]);
  await panel.screenshot({ path: testInfo.outputPath("company-listing-sources-320.png") });
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(before);
  await panel.getByRole("button", { name: "First listing sources", exact: true }).click();
  await expect.poll(() => companySourceIds(panel)).toEqual(fixture.sourceFirstIds);
  await panel.getByRole("button", { name: "Next listing sources", exact: true }).click();
  await expect.poll(() => companySourceIds(panel)).toEqual(fixture.sourceSecondIds);
  const selected = panel.locator(`[data-company-source-open="${fixture.selectedSourceId}"]`);
  await selected.focus();
  await selected.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/jobs/${fixture.sourceActiveJobId}/source$`, "u"));
  const evidence = page.getByRole("region", { name: "Stored job Source", exact: true });
  await expect(
    evidence.getByRole("region", { name: "primary literal retained content", exact: true }),
  ).toContainText("PRIVATE synthetic listing capture 25001");
  await page.reload();
  await expect(evidence).toContainText("PRIVATE synthetic listing capture 25001");
  await page
    .locator("[data-job-workspace]")
    .getByRole("button", { name: "Back to company", exact: true })
    .click();
  await expect.poll(() => companySourceIds(panel)).toEqual(fixture.sourceSecondIds);
  await expect(selected).toBeFocused();
  expect(await page.evaluate(() => JSON.stringify(history.state))).not.toMatch(
    /EXAMPLE|PRIVATE|href|synthetic\.source/u,
  );
  await page.goForward();
  await expect(evidence).toContainText("PRIVATE synthetic listing capture 25001");
  await page.goBack();
  await expect.poll(() => companySourceIds(panel)).toEqual(fixture.sourceSecondIds);
  await panel.getByLabel("Include sources for archived linked jobs", { exact: true }).check();
  await expect.poll(() => companySourceIds(panel)).toEqual(fixture.sourceFirstIds);
  await panel.getByRole("button", { name: "Next listing sources", exact: true }).click();
  await expect.poll(() => companySourceIds(panel)).toEqual(fixture.sourceSecondIds);
  await panel.getByRole("button", { name: "Next listing sources", exact: true }).click();
  await expect(panel.locator("[data-company-source]")).toHaveCount(8);
  const archived = panel.locator(`[data-company-source-open="${fixture.sourceArchivedId}"]`);
  await archived.click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${fixture.sourceArchivedJobId}/source$`, "u"));
  await expect(evidence).toContainText("PRIVATE synthetic listing capture 26000");
  await page
    .locator("[data-job-workspace]")
    .getByRole("button", { name: "Back to company", exact: true })
    .click();
  await expect(panel.locator("[data-company-source]")).toHaveCount(8);
  await expect(archived).toBeFocused();
  await expect(
    panel.getByLabel("Include sources for archived linked jobs", { exact: true }),
  ).toBeChecked();
  await page.reload();
  await expect(panel.locator("[data-company-source]")).toHaveCount(8);
  await expect(
    panel.getByLabel("Include sources for archived linked jobs", { exact: true }),
  ).toBeChecked();
  await expect(archived).toBeFocused();
  return {
    syntheticArchivePrerequisite: true,
    sourceOnlyRows: true,
    literalUrlPreserved: true,
    metadataOnlyCompanyList: true,
    exactRetry: true,
    heldReadReflowAxe: true,
    activeAndArchivedJobSource: true,
    companyPageCursorFocusReturn: true,
    readSegmentWrites: 0,
  };
};
