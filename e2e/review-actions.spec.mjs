import { writeFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const openCleanShell = async (page) => {
  await page.goto("/");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);
  await page.evaluate(async () => {
    await globalThis.coredrillStorageSpike.delete();
  });
  await page.goto("/app-shell.html");
  await page.waitForFunction(
    () =>
      globalThis.coredrillAppShell !== undefined &&
      globalThis.coredrillExtensionInbox !== undefined,
  );
};

let captureSequence = 0;

const addManualCapture = async (page, title, company) => {
  captureSequence += 1;
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add job/u }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Job title/u).fill(title);
  await dialog.getByLabel(/Company/u).fill(company);
  await dialog
    .getByLabel(/Source URL/u)
    .fill(`https://jobs.example.test/review-flow/${String(captureSequence)}`);
  await dialog
    .getByLabel(/Notes or listing details/u)
    .fill(`Durable review-flow evidence ${String(captureSequence)}.`);
  await dialog.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(dialog.getByRole("status")).toContainText("Stored in the local capture inbox", {
    timeout: 30_000,
  });
  await dialog.getByRole("button", { name: "Close capture dialog" }).click();
};

const queueItems = (page) =>
  page.evaluate(() => globalThis.coredrillExtensionInbox.listReviewItems());

test("save, merge, snooze, discard, and undo remain explicit local transactions", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await openCleanShell(page);

  await addManualCapture(page, "Local Systems Engineer", "Coredrill Labs");
  const firstQueue = await queueItems(page);
  expect(firstQueue).toHaveLength(1);
  const firstEnvelopeId = firstQueue[0].envelopeId;

  await page.getByRole("button", { name: "Review captures" }).click();
  const review = page.getByTestId("capture-review");
  const saveButton = review.getByRole("button", { name: "Save as new job" });
  await expect(saveButton).toBeDisabled();
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();

  const saved = await page.evaluate(
    (envelopeId) => globalThis.coredrillExtensionInbox.getReviewItem(envelopeId),
    firstEnvelopeId,
  );
  expect(saved).toMatchObject({
    state: "resolved",
    resolutionKind: "save_new",
  });
  expect(saved.resolvedJobId).toMatch(/^[a-f0-9-]{36}$/u);

  await addManualCapture(page, "Local Systems Engineer", "Coredrill Labs");
  const mergeQueue = await queueItems(page);
  expect(mergeQueue).toHaveLength(1);
  expect(mergeQueue[0].mergeTargets).toEqual(
    expect.arrayContaining([expect.objectContaining({ jobId: saved.resolvedJobId })]),
  );
  const mergeEnvelopeId = mergeQueue[0].envelopeId;
  await expect(review.getByText("1 capture awaiting review")).toBeVisible();
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await review.getByRole("button", { name: "Merge into selected job" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
  await expect(
    page.evaluate(
      (envelopeId) => globalThis.coredrillExtensionInbox.getReviewItem(envelopeId),
      mergeEnvelopeId,
    ),
  ).resolves.toMatchObject({
    state: "resolved",
    resolutionKind: "merge_existing",
    resolvedJobId: saved.resolvedJobId,
  });

  await addManualCapture(page, "Review Operations Lead", "Coredrill Labs");
  const lifecycleQueue = await queueItems(page);
  const lifecycleEnvelopeId = lifecycleQueue[0].envelopeId;
  await expect(review.getByText("1 capture awaiting review")).toBeVisible();
  await review.getByRole("button", { name: "Snooze one week" }).click();
  await expect(review.getByText(/Snoozed until/u)).toBeVisible();
  await review.getByRole("button", { name: "Return to inbox" }).click();
  await expect(review.getByRole("button", { name: "Snooze one week" })).toBeVisible();

  await review.getByRole("button", { name: "Discard", exact: true }).click();
  await review.getByRole("button", { name: "Confirm discard" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
  await review.getByRole("button", { name: "Undo discard" }).click();
  await expect(review.getByText("1 capture awaiting review")).toBeVisible();
  await expect(
    page.evaluate(
      (envelopeId) => globalThis.coredrillExtensionInbox.getReviewItem(envelopeId),
      lifecycleEnvelopeId,
    ),
  ).resolves.toMatchObject({ state: "pending", resolutionKind: null });

  expect(externalRequests).toEqual([]);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  const output = testInfo.outputPath("review-actions-axe.json");
  await writeFile(output, `${JSON.stringify(accessibility, null, 2)}\n`, "utf8");
  await testInfo.attach("review-actions-axe.json", {
    path: output,
    contentType: "application/json",
  });

  console.info(
    `REV004_E2E_PROOF ${JSON.stringify({
      schemaVersion: 129,
      saveNew: true,
      mergeExisting: true,
      snoozeAndWake: true,
      discardAndUndo: true,
      networkRequests: externalRequests.length,
      accessibilityViolations: accessibility.violations.length,
    })}`,
  );
});
