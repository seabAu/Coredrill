import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";
import { exerciseStoredJobNote } from "./job-note-journey.mjs";
import { exerciseStoredJobNoteLifetime } from "./job-note-lifetime.mjs";

const capture = async (page, title) => {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add job/u }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Job title/u).fill(title);
  await dialog.getByLabel(/Company/u).fill("Synthetic Notes Lab");
  await dialog.getByLabel(/Notes or listing details/u).fill("Local note integration fixture.");
  await dialog.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(dialog.getByRole("status")).toContainText("Stored in the local capture inbox");
  await dialog.getByRole("button", { name: "Close capture dialog" }).click();
  await page.locator('[data-pipeline-view-option="inbox"]').click();
  const review = page.getByTestId("capture-review");
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await review.getByRole("button", { name: "Save as new job" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
};

test("normal Timeline records exact notes offline and preserves bounded draft ownership", async ({
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
  await page.waitForFunction(
    () => globalThis.coredrillOfflineShell?.getState().registered === true,
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Pipeline", exact: true })
    .click();
  await capture(page, "First note role");
  await capture(page, "Other note role");
  await page.locator('[data-pipeline-view-option="table"]').click();
  await page.getByRole("button", { name: "First note role", exact: true }).click();
  const proof = await exerciseStoredJobNote(page, testInfo);
  const lifetime = await exerciseStoredJobNoteLifetime(page, testInfo);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await testInfo.attach("stored-job-notes-proof.json", {
    body: JSON.stringify({
      ...proof,
      lifetime,
      offline: true,
      seededRecords: false,
      externalRequests: 0,
    }),
    contentType: "application/json",
  });
});
