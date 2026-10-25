import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export const installCompanyJobsProbe = async (page) =>
  page.evaluate(() => {
    const root = globalThis.coredrillStorageSpike,
      original = root.companyJobs;
    const probe = { calls: [], failNext: false, holdNext: false, release: null, completed: 0 };
    globalThis.__companyJobsProbe = probe;
    globalThis.coredrillStorageSpike = {
      ...root,
      companyJobs: {
        page: async (input) => {
          probe.calls.push(JSON.stringify(input));
          if (probe.failNext) {
            probe.failNext = false;
            throw Error("PRIVATE related-role read path");
          }
          const result = await original.page(input);
          if (probe.holdNext) {
            probe.holdNext = false;
            await new Promise((resolve) => {
              probe.release = resolve;
            });
          }
          probe.completed++;
          return result;
        },
      },
    };
  });
export const companyRoleIds = async (roles) =>
  roles
    .locator("[data-company-job]")
    .evaluateAll((buttons) => buttons.map((button) => button.dataset.companyJob));
export const selectCompanyRoles = async (page, companyName) => {
  const network = page.getByRole("region", { name: "Stored Network", exact: true });
  const row = network
    .getByRole("list", { name: "Stored companies on this page", exact: true })
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: companyName, exact: true }) });
  await row.getByRole("button", { name: "View company details", exact: true }).click();
  return page.getByRole("region", { name: "Company linked roles", exact: true });
};

/** Normal controls and actual runtime reads only; fixture is an explicitly restored synthetic archive. */
export const exerciseCompanyJobs = async (page, fixture) => {
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Network", exact: true })
    .click();
  await installCompanyJobsProbe(page);
  const roles = await selectCompanyRoles(page, fixture.companyName);
  await expect.poll(() => companyRoleIds(roles)).toEqual(fixture.firstIds);
  await expect(roles).toContainText(fixture.literalTitle);
  await expect(roles).toContainText("Current status: Not assigned");
  await expect(roles).not.toContainText("PRIVATE synthetic role body");
  await expect(roles).toContainText("Up to 10 saved roles per page");
  const before = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await page.evaluate(() => {
    globalThis.__companyJobsProbe.failNext = true;
  });
  await roles.getByRole("button", { name: "Next linked roles", exact: true }).click();
  await expect(roles.getByRole("alert")).toContainText("could not be read");
  await expect(roles).not.toContainText("PRIVATE related-role");
  await expect.poll(() => companyRoleIds(roles)).toEqual(fixture.firstIds);
  await expect(roles.locator("[data-company-job]").first()).toBeDisabled();
  await roles.getByRole("button", { name: "Retry linked-role page", exact: true }).click();
  await expect.poll(() => companyRoleIds(roles)).toEqual(fixture.secondIds);
  await expect(roles.getByRole("status")).toBeFocused();
  expect(
    await page.evaluate(() => {
      const calls = globalThis.__companyJobsProbe.calls
        .map((text) => JSON.parse(text))
        .filter((input) => input.after !== null);
      return calls.length === 2 && JSON.stringify(calls[0]) === JSON.stringify(calls[1]);
    }),
  ).toBe(true);
  await roles.getByRole("button", { name: "First linked roles", exact: true }).click();
  await expect.poll(() => companyRoleIds(roles)).toEqual(fixture.firstIds);
  await page.evaluate(() => {
    globalThis.__companyJobsProbe.holdNext = true;
  });
  const next = roles.getByRole("button", { name: "Next linked roles", exact: true });
  await next.click();
  await page.waitForFunction(() => globalThis.__companyJobsProbe.release !== null);
  const calls = await page.evaluate(() => globalThis.__companyJobsProbe.calls.length);
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(next).toBeDisabled();
  expect(await page.evaluate(() => globalThis.__companyJobsProbe.calls.length)).toBe(calls);
  await page.evaluate(() => globalThis.__companyJobsProbe.release());
  await expect.poll(() => companyRoleIds(roles)).toEqual(fixture.secondIds);
  await expect(next).toBeFocused();
  expect(await roles.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
  expect(
    (await new AxeBuilder({ page }).include('[aria-label="Company linked roles"]').analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(before);
  const selected = roles.locator(`[data-company-job="${fixture.selectedJobId}"]`);
  await selected.focus();
  await selected.press("Enter");
  const frame = page.locator(`[data-job-workspace="${fixture.selectedJobId}"]`);
  await expect(
    frame.getByRole("heading", { name: "Synthetic linked role 15", exact: true }),
  ).toBeVisible();
  await expect(frame).toContainText("PRIVATE synthetic role body 115");
  await expect(frame).toContainText("Saved 2026-10-25");
  await page.reload();
  await expect(frame.getByRole("button", { name: "Back to company", exact: true })).toBeVisible();
  await frame.getByRole("button", { name: "Back to company", exact: true }).click();
  await expect.poll(() => companyRoleIds(roles)).toEqual(fixture.secondIds);
  await expect(selected).toBeFocused();
  await page.goForward();
  await expect(frame).toBeVisible();
  await page.goBack();
  await expect.poll(() => companyRoleIds(roles)).toEqual(fixture.secondIds);
  await expect(selected).toBeFocused();
  await roles.getByRole("checkbox", { name: "Include archived linked roles", exact: true }).check();
  await expect.poll(() => companyRoleIds(roles)).toEqual(fixture.firstIds);
  await next.click();
  await expect.poll(() => companyRoleIds(roles)).toEqual(fixture.secondIds);
  await next.click();
  const archived = roles.locator(`[data-company-job="${fixture.archivedJobId}"]`);
  await expect(archived).toBeVisible();
  await archived.click();
  const archivedFrame = page.locator(`[data-job-workspace="${fixture.archivedJobId}"]`);
  await expect(
    archivedFrame.getByRole("heading", { name: "Synthetic linked role 26", exact: true }),
  ).toBeVisible();
  await expect(archivedFrame).toContainText("PRIVATE synthetic role body 126");
  await archivedFrame.getByRole("button", { name: "Back to company", exact: true }).click();
  await expect(archived).toBeFocused();
  await expect(
    roles.getByRole("checkbox", { name: "Include archived linked roles", exact: true }),
  ).toBeChecked();
  await page.reload();
  await expect(archived).toBeVisible();
  return {
    normalControls: true,
    queryWrites: 0,
    exactRetry: true,
    scopedPaging: true,
    reflow: true,
    archivedJobOutsideActivePipelineOpened: true,
    cursorReturnAfterJobReload: true,
    backForward: true,
    sourceFixtureUnchanged: fixture.originalRecoveryFixtureUnchanged,
  };
};
