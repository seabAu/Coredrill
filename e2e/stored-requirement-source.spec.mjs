import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";

test("reviews retained requirement sources offline without seeded job or requirement records", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const external = [];
  await page.route("**/*", (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:4181/")) return route.continue();
    external.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  await page.goto("/app-shell.html");
  await initializeDefaultWorkspace(page);
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
  await capture.getByLabel(/Job title/u).fill("Source review engineer");
  await capture.getByLabel(/Company/u).fill("Synthetic Source Lab");
  const sourceText =
    "Requirements:\n- Required: TypeScript\n- Preferred: SQLite\n\nResponsibilities:\n- You will deliver reliable offline workflows.";
  await capture.getByLabel(/Notes or listing details/u).fill(sourceText);
  await capture.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
  await capture.getByRole("button", { name: "Close capture dialog" }).click();
  const queue = await page.evaluate(() => globalThis.coredrillExtensionInbox.listReviewItems());
  await page.getByRole("button", { name: "Review captures" }).click();
  const review = page.getByTestId("capture-review");
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await review.getByRole("button", { name: "Save as new job" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
  const saved = await page.evaluate(
    (id) => globalThis.coredrillExtensionInbox.getReviewItem(id),
    queue[0].envelopeId,
  );
  const jobId = saved.resolvedJobId;
  const load = () =>
    page.evaluate(async (id) => {
      const result = await globalThis.coredrillStorageSpike.jobComparison.load(id);
      if (!result.ok) throw new Error(result.error.code);
      return result.value;
    }, jobId);
  const before = await load();
  expect(before.requirements).toEqual([]);
  expect(before.requirementProposals).toHaveLength(3);
  expect(before.requirementProposals[0]).not.toHaveProperty("provenanceId");
  await page.goto(`/jobs/${jobId}/requirements`);
  const proposals = page.getByRole("list", { name: "Pending requirement proposals" });
  await expect(proposals.getByRole("heading", { name: "TypeScript", exact: true })).toBeVisible();
  const required = proposals
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: "TypeScript", exact: true }) });
  await required.getByLabel("Category to record").selectOption("desired");
  await required.getByRole("button", { name: "Accept requirement" }).click();
  await expect(proposals.getByRole("heading", { name: "TypeScript", exact: true })).toHaveCount(0);
  const after = await load();
  expect(after.requirements).toHaveLength(1);
  expect(after.requirements[0]).toMatchObject({
    normalizedText: "TypeScript",
    rawText: "- Required: TypeScript",
    category: "desired",
    sourceCategory: "required",
    sourceExcerpt: "- Required: TypeScript",
    sourcePointer: "/raw_text/lines/2",
    extractionMethod: "heuristic",
    userConfirmed: true,
  });
  const duplicate = await page.evaluate(
    ({ jobId, proposalId }) =>
      globalThis.coredrillStorageSpike.jobComparison.accept({
        jobId,
        proposalId,
        category: "required",
      }),
    { jobId, proposalId: before.requirementProposals[0].id },
  );
  expect(duplicate).toMatchObject({ ok: false, error: { code: "conflict" } });
  const forged = await page.evaluate(
    ({ jobId, proposalId }) =>
      globalThis.coredrillStorageSpike.jobComparison.accept({
        jobId,
        proposalId,
        category: "required",
      }),
    { jobId, proposalId: "0199a710-0000-7000-8000-000000000009/requirement-proposal-1" },
  );
  expect(forged).toMatchObject({ ok: false, error: { code: "conflict" } });
  const preferred = proposals
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: "SQLite", exact: true }) });
  await preferred.getByRole("button", { name: "Reject proposal" }).click();
  await expect(proposals.getByRole("heading", { name: "SQLite", exact: true })).toHaveCount(0);
  expect((await load()).requirements).toEqual(after.requirements);
  await page.reload();
  await expect(proposals.getByRole("heading", { name: "SQLite", exact: true })).toBeVisible();
  await expect(proposals.getByRole("heading", { name: "TypeScript", exact: true })).toHaveCount(0);
  expect((await load()).requirements).toEqual(after.requirements);
  const retained = await page.evaluate(
    (id) => globalThis.coredrillExtensionInbox.getSavedJobEvidence(id),
    jobId,
  );
  expect(retained.snapshots[0].rawText).toBe(sourceText);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  expect(external).toEqual([]);
  const screenshot = testInfo.outputPath("stored-requirement-source-320.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach("stored-requirement-source-320.png", {
    path: screenshot,
    contentType: "image/png",
  });
  console.info(
    `STORED_REQUIREMENT_SOURCE_PROOF ${JSON.stringify({ seededRecords: false, offline: true, proposals: 3, recorded: 1, exactLineProvenance: true, sourceUnchanged: true, rejectedProjectionReturnsOnReload: true, acceptedIdentitySurvivesReload: true, duplicateRejected: true, forgedSnapshotRejected: true, externalRequests: external.length, axeViolations: axe.violations.length })}`,
  );
});
