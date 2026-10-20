import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";
import { exerciseNormalTaskEntry } from "./task-entry-journey.mjs";
import {
  exerciseTaskEntryCrossJob,
  exerciseTaskEntryLifetime,
  exerciseTaskEntryReadbackFailure,
} from "./task-entry-lifetime.mjs";

test("normal header creates and undoes an unscheduled task offline with owned draft and canonical readback", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const external = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:4181/")) return route.continue();
    external.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Pipeline", exact: true })
    .click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add job/u }).click();
  const capture = page.getByRole("dialog");
  await capture.getByLabel(/Job title/u).fill("Synthetic task entry role");
  await capture.getByLabel(/Company/u).fill("Synthetic Task Lab");
  await capture.getByLabel(/Notes or listing details/u).fill("Normal task entry fixture.");
  await capture.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
  await capture.getByRole("button", { name: "Close capture dialog" }).click();
  await page.locator('[data-pipeline-view-option="inbox"]').click();
  const review = page.getByTestId("capture-review");
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await review.getByRole("button", { name: "Save as new job" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
  await page.locator('[data-pipeline-view-option="table"]').click();
  await page.getByRole("button", { name: "Synthetic task entry role", exact: true }).click();
  const proof = await exerciseNormalTaskEntry(page, testInfo);
  const lifetime = await exerciseTaskEntryLifetime(page);
  const crossJob = await exerciseTaskEntryCrossJob(page);
  const readbackFailure = await exerciseTaskEntryReadbackFailure(page);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await testInfo.attach("normal-task-entry-proof.json", {
    body: JSON.stringify({
      ...proof,
      lifetime,
      crossJob,
      readbackFailure,
      offline: true,
      externalRequests: 0,
      seededIdentity: false,
    }),
    contentType: "application/json",
  });
});
