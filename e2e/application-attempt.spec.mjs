import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("starts a durable local application from a manually captured job without seeded records", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  const externalRequests = [];
  await page.route("**/*", async (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:4181/")) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  await page.goto("/app-shell.html");
  await page.waitForFunction(
    () => globalThis.coredrillOfflineShell?.getState().registered === true,
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(
    () => globalThis.coredrillAppShell !== undefined && navigator.serviceWorker.controller !== null,
  );
  await context.setOffline(true);

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add job/u }).click();
  const capture = page.getByRole("dialog");
  await capture.getByLabel(/Job title/u).fill("Offline preparation engineer");
  await capture.getByLabel(/Company/u).fill("Synthetic Preparation Lab");
  await capture.getByLabel(/Notes or listing details/u).fill("Build reliable local workflows.");
  await capture.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
  await capture.getByRole("button", { name: "Close capture dialog" }).click();
  const queue = await page.evaluate(() => globalThis.coredrillExtensionInbox.listReviewItems());
  expect(queue).toHaveLength(1);
  await page.getByRole("button", { name: "Review captures" }).click();
  const review = page.getByTestId("capture-review");
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await review.getByRole("button", { name: "Save as new job" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
  const saved = await page.evaluate(
    (id) => globalThis.coredrillExtensionInbox.getReviewItem(id),
    queue[0].envelopeId,
  );
  expect(saved.resolutionKind).toBe("save_new");
  const jobId = saved.resolvedJobId;
  await page.goto(`/jobs/${jobId}/documents`);
  const start = page.getByRole("form", { name: "Start local application preparation" });
  await expect(start).toBeVisible();
  await start.getByLabel("Preparation stage name").fill("My drafting stage");
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await testInfo.attach("application-start-axe.json", {
    body: JSON.stringify(axe),
    contentType: "application/json",
  });
  const screenshot = testInfo.outputPath("application-start-320.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach("application-start-320.png", {
    path: screenshot,
    contentType: "image/png",
  });
  await start.getByRole("button", { name: "Start preparation locally" }).click();
  await expect(page.locator('[data-preparation-status="missing"]')).toBeVisible();
  await expect(start).toHaveCount(0);

  const comparison = await page.evaluate(async (id) => {
    const result = await globalThis.coredrillStorageSpike.jobComparison.load(id);
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  }, jobId);
  expect(comparison.status.name).toBe("My drafting stage");
  expect(comparison.applicationId).not.toBeNull();
  const before = await page.evaluate(async (id) => {
    const result = await globalThis.coredrillStorageSpike.loadApplicationDocumentPreparation(id);
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  }, comparison.applicationId);
  expect(before.selected).toMatchObject({ resume: null, coverLetter: null, answers: [] });
  expect(before.submitted).toBe(false);
  const duplicate = await page.evaluate(
    (job) =>
      globalThis.coredrillStorageSpike.startApplicationAttempt({
        jobId: job.jobId,
        expectedJobRowVersion: job.rowVersion,
        preparationStageName: "My drafting stage",
      }),
    comparison,
  );
  expect(duplicate).toMatchObject({ ok: false, error: { code: "conflict" } });
  await page.reload();
  await expect(page.locator('[data-preparation-status="missing"]')).toBeVisible();
  await expect(page.getByText(/All displayed records are synthetic/u)).toHaveCount(0);
  const after = await page.evaluate(async (id) => {
    const result = await globalThis.coredrillStorageSpike.loadApplicationDocumentPreparation(id);
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  }, comparison.applicationId);
  expect(after).toEqual(before);
  expect(externalRequests).toEqual([]);
  console.info(
    `APPLICATION_ATTEMPT_PROOF ${JSON.stringify({ jobId, applicationId: comparison.applicationId, stageId: comparison.status.id, stageName: comparison.status.name, duplicateRejected: true, selectedDocuments: 0, submitted: false, scaffoldInstalled: false, offline: true, externalRequests: 0 })}`,
  );
});
