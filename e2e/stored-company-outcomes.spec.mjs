import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";
import { createCompanyJobsFixture } from "./company-jobs-fixture.mjs";
import { selectCompanyRoles } from "./company-jobs-journey.mjs";
import {
  exerciseCompanyOutcomes,
  installCompanyOutcomesProbe,
} from "./company-outcomes-journey.mjs";
const prepare = async (page, context, fixture) => {
  const external = [],
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:4181/")) return route.continue();
    external.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  await page.clock.setFixedTime(new Date("2026-10-25T16:00:00.000Z"));
  await page.goto("/");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  if (fixture === undefined) {
    await initializeDefaultWorkspace(page);
    return { external, errors };
  }
  await page.getByRole("button", { name: /Quick start/u }).click();
  await page
    .getByRole("button", { name: "Restore an existing archive instead", exact: true })
    .click();
  const restore = page.getByRole("region", { name: "Portable vault restore", exact: true });
  await restore.getByLabel("Choose archive to review", { exact: true }).setInputFiles({
    name: "synthetic-company-outcomes.coredrill.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(fixture.bytes),
  });
  await expect(
    restore.getByRole("heading", { name: "Review exact restore changes", exact: true }),
  ).toBeVisible();
  await restore.getByRole("checkbox").check();
  await restore
    .getByRole("button", { name: "Confirm and restore reviewed archive", exact: true })
    .click();
  await expect(restore.getByRole("status")).toContainText(
    "Restore committed and its acknowledgement validated",
  );
  await restore.getByRole("button", { name: "Reload local vault", exact: true }).click();
  return { external, errors };
};
test("normal company history displays a manually recorded preparation transition offline after reload", async ({
  page,
  context,
}) => {
  const { external, errors } = await prepare(page, context);
  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  await primary.getByRole("link", { name: "Pipeline", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add job/u }).click();
  const capture = page.getByRole("dialog"),
    company = "Synthetic manually recorded outcome company",
    title = "Synthetic manual outcome role";
  await capture.getByLabel(/Job title/u).fill(title);
  await capture.getByLabel(/Company/u).fill(company);
  await capture.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
  await capture.getByRole("button", { name: "Close capture dialog" }).click();
  await page.locator('[data-pipeline-view-option="inbox"]').click();
  const review = page.getByTestId("capture-review");
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await review.getByRole("button", { name: "Save as new job" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  const roles = await selectCompanyRoles(page, company);
  const panel = page.getByRole("region", { name: "Company recorded outcome history", exact: true });
  await expect(panel).toContainText(
    "No recorded stage changes for linked jobs in this archive scope.",
  );
  await roles.getByRole("button", { name: title, exact: true }).click();
  await page
    .locator("[data-job-workspace]")
    .getByRole("button", { name: "Documents", exact: true })
    .click();
  const preparation = page.getByRole("form", {
    name: "Start local application preparation",
    exact: true,
  });
  await preparation.getByLabel("Preparation stage name").fill("Synthetic outcome drafting");
  await preparation.getByRole("button", { name: "Start preparation locally" }).click();
  await expect(page.locator('[data-preparation-status="missing"]')).toBeVisible();
  await page
    .locator("[data-job-workspace]")
    .getByRole("button", { name: "Back to company", exact: true })
    .click();
  await expect(panel.locator("[data-company-outcome]")).toHaveCount(1);
  await expect(panel).toContainText("Synthetic outcome drafting");
  await expect(panel).toContainText("No previous stage recorded.");
  await expect(panel).toContainText("Recorded application reference:");
  await page.reload();
  await expect(panel.locator("[data-company-outcome]")).toHaveCount(1);
  await expect(panel).toContainText("Synthetic outcome drafting");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
test("normal company outcome history preserves recorded transitions, exact retry, archive scope and reflow offline", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120000);
  const fixture = await createCompanyJobsFixture(testInfo, { withOutcomes: true }),
    { external, errors } = await prepare(page, context, fixture);
  await exerciseCompanyOutcomes(page, fixture, testInfo);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
test("a late actual outcome page cannot publish or steal focus under another company's empty scope", async ({
  page,
  context,
}, testInfo) => {
  const fixture = await createCompanyJobsFixture(testInfo, { withOutcomes: true }),
    { external, errors } = await prepare(page, context, fixture);
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Network", exact: true })
    .click();
  await installCompanyOutcomesProbe(page);
  await selectCompanyRoles(page, fixture.outcomeCompanyName);
  const panel = page.getByRole("region", { name: "Company recorded outcome history", exact: true });
  await expect(panel.locator("[data-company-outcome]")).toHaveCount(10);
  await page.evaluate(() => {
    globalThis.__companyOutcomesProbe.holdNext = true;
  });
  await panel.getByRole("button", { name: "Next recorded outcomes", exact: true }).click();
  await page.waitForFunction(() => typeof globalThis.__companyOutcomesProbe.release === "function");
  await selectCompanyRoles(page, "Synthetic empty linked-role company");
  await expect(panel).toContainText(
    "No recorded stage changes for linked jobs in this archive scope.",
  );
  const deliberate = panel.getByRole("button", { name: "First recorded outcomes", exact: true });
  await deliberate.focus();
  await page.evaluate(() => {
    const probe = globalThis.__companyOutcomesProbe;
    probe.release();
    probe.release = null;
  });
  await expect(panel.locator("[data-company-outcome]")).toHaveCount(0);
  await expect(deliberate).toBeFocused();
  await expect(panel).not.toContainText("Synthetic current rejection");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
