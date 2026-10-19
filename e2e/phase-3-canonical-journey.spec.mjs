import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";

test("Phase 3 carries reviewed resume evidence through a durable submitted set", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const jobId = "0199b300-0000-7000-8000-000000000002";
  const applicationId = "0199b300-0000-7000-8000-000000000017";
  const resumeVersionId = "0199b300-0000-7000-8000-00000000000e";
  const roleDescription =
    "Built an accessible local-first workflow for evidence-backed job decisions.";
  const externalRequests = [];
  await page.route("**/*", async (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:4181/")) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/app-shell.html");
  await initializeDefaultWorkspace(page);
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);
  await page.waitForFunction(
    () => globalThis.coredrillOfflineShell?.getState().registered === true,
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(
    () => globalThis.coredrillAppShell !== undefined && navigator.serviceWorker.controller !== null,
  );
  await context.setOffline(true);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  // Only initial job/document scaffolding is seeded. Import, review, selection,
  // generation, export, and submission use the production UI and application API.
  await page.evaluate(() =>
    globalThis.coredrillStorageSpike.installDocumentsWorkspaceReferenceFixture(),
  );
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Career Profile" })
    .click();
  const career = page.getByTestId("career-profile-workspace");
  const imports = career.locator(".cd-career-import");
  await imports
    .locator('input[type="file"]')
    .setInputFiles(path.join(process.cwd(), "fixtures/imports/synthetic-resume.docx"));
  await expect(imports.getByRole("status")).toContainText("7 proposals queued for review");
  const imported = await page.evaluate(() =>
    globalThis.coredrillStorageSpike.listPendingResumeImports(),
  );
  expect(imported.ok).toBe(true);
  await expect(imports).toContainText(roleDescription);
  await expect(imports).toContainText("Proposal only · not verified");

  // Deliberately confirm the facts in the manual editor, then attach the imported
  // role to that confirmed entry. The imported ambiguous year range cannot replace it.
  await career.getByRole("tab", { name: /Work/u }).click();
  await career.getByLabel("Organization *").fill("Coredrill Labs");
  await career.getByLabel("Role *").fill("Product Engineer");
  await career.getByRole("tabpanel").getByLabel("Start date").fill("2024-01-01");
  await career.getByRole("tabpanel").getByLabel("End date").fill("2026-12-31");
  await career.getByLabel("Description", { exact: true }).fill(roleDescription);
  await career.getByRole("button", { name: "Save Work" }).click();
  await expect(career.locator(".cd-career-form").getByRole("status")).toContainText(
    "Work saved locally as user-confirmed information.",
  );
  const beforeMerge = await page.evaluate(() =>
    globalThis.coredrillStorageSpike.listManualCareerProfileEntries(),
  );
  const confirmedRole = beforeMerge.value.find(
    ({ primaryLabel }) => primaryLabel === "Product Engineer",
  );
  expect(confirmedRole).toMatchObject({
    verificationState: "user_confirmed",
    startDate: "2024-01-01",
    endDate: "2026-12-31",
  });
  const duplicate = imports
    .locator(".cd-career-proposals > li")
    .filter({ hasText: "Coredrill Labs" })
    .filter({ hasText: "Product Engineer" });
  await expect(duplicate).toContainText("Source excerpts");
  await expect(duplicate).toContainText("ambiguous date");
  await duplicate.getByRole("button", { name: /Merge with Product Engineer/u }).click();
  await expect(imports.getByRole("status")).toContainText("without overwriting it");

  await page.goto(`/jobs/${jobId}/requirements`);
  const workspace = page.locator(`[data-job-workspace="${jobId}"]`);
  await expect(workspace).toBeVisible();
  const evidence = workspace.getByLabel(
    "Evidence for lead resilient local first product operations",
    { exact: true },
  );
  await evidence.getByRole("button", { name: /Remove Durable evidence steward/u }).click();
  await expect(evidence.getByText("No evidence selected.", { exact: true })).toBeVisible();
  await evidence.getByRole("button", { name: /Select Product Engineer/u }).click();
  await expect(
    evidence.getByLabel("Selected evidence for lead resilient local first product operations"),
  ).toContainText("Product Engineer");
  const decision = evidence.getByRole("combobox", {
    name: "Coverage decision for lead resilient local first product operations",
  });
  await decision.selectOption("partial");
  await expect(evidence).toContainText("You marked this as Partial");
  await page.reload();
  await expect(
    workspace.getByLabel("Selected evidence for lead resilient local first product operations"),
  ).toContainText("Product Engineer");
  await expect(decision).toHaveValue("partial");
  const comparison = await page.evaluate(
    (id) => globalThis.coredrillStorageSpike.jobComparison.load(id),
    jobId,
  );
  expect(comparison).toMatchObject({
    ok: true,
    value: {
      evidence: [
        {
          selectedEvidence: [{ evidenceId: confirmedRole.id }],
          coverage: { state: "partial", source: "user-confirmed" },
        },
      ],
    },
  });
  expect(comparison.value.evidence[0].selectedEvidence).toHaveLength(1);
  const staleDecision = await page.evaluate(
    (requirementId) =>
      globalThis.coredrillStorageSpike.jobComparison.setCoverage({
        requirementId,
        expectedRowVersion: null,
        state: "strength",
      }),
    comparison.value.requirements[0].id,
  );
  expect(staleDecision).toMatchObject({ ok: false, error: { code: "conflict" } });
  await evidence.getByRole("button", { name: "Re-run and compare" }).click();
  await expect(evidence).toContainText("No evidence, source-document, or coverage fields changed.");

  await workspace.getByRole("button", { name: "Documents", exact: true }).click();
  const preparation = workspace.locator(".cd-job-document-preparation");
  await preparation
    .getByLabel("Exact cover-letter version")
    .selectOption("0199b300-0000-7000-8000-000000000010");
  await preparation.getByRole("button", { name: "Create truthful template-only version" }).click();
  const templateProof = preparation.locator('.cd-job-template-draft [role="status"]');
  await expect(templateProof).toContainText(confirmedRole.id);
  await expect(templateProof).toContainText("AI disabled");
  const cover = await page.evaluate(async () => {
    const result = await globalThis.coredrillStorageSpike.openDocumentEditor(
      "0199b300-0000-7000-8000-000000000009",
    );
    return result.ok ? result.value.currentVersion : result;
  });
  expect(cover.plainText).toContain(roleDescription);
  expect(cover.plainText).not.toContain(
    "Led durable local-first product operations with verified recovery practices.",
  );
  await preparation.getByLabel("Exact resume version *").selectOption(resumeVersionId);
  await preparation.getByLabel("Exact cover-letter version").selectOption(cover.id);
  await preparation.getByRole("checkbox", { name: /Why Northstar\?.*version 1.*latest/u }).check();
  await preparation.getByRole("button", { name: "Save exact selections" }).click();
  await expect(preparation).toContainText("Ready for export review");
  await preparation
    .getByRole("button", { name: "Review export for Northstar cover letter version 2" })
    .click();
  const exportReview = preparation.getByRole("region", {
    name: "Export review for Northstar cover letter version 2",
  });
  await expect(exportReview.getByRole("region", { name: "Document preview" })).toContainText(
    roleDescription,
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportReview.getByRole("button", { name: "Download DOCX" }).click(),
  ]);
  const bytes = await readFile(await download.path());
  const exportHash = createHash("sha256").update(bytes).digest("hex");
  await expect(exportReview.getByRole("status")).toContainText("retained for Mark Applied");
  await exportReview.getByRole("button", { name: "Close export review" }).click();
  const review = await page.evaluate(
    (id) => globalThis.coredrillStorageSpike.loadApplicationSubmissionReview(id),
    applicationId,
  );
  const artifact = review.value.documents
    .find(({ role }) => role === "cover_letter")
    .artifacts.find(({ contentId }) => contentId === exportHash);
  expect(artifact).toMatchObject({
    logicalName: download.suggestedFilename(),
    byteLength: bytes.byteLength,
    format: "docx",
  });
  const submission = preparation.getByRole("region", { name: "Mark Applied" });
  const forms = submission.getByRole("group", { name: "Exact submitted set" }).locator("select");
  await expect(forms).toHaveCount(3);
  await forms.nth(0).selectOption("plain_text");
  await forms.nth(1).selectOption({
    label: `DOCX · ${artifact.logicalName} · SHA-256 ${exportHash.slice(0, 12)}…${exportHash.slice(-8)}`,
  });
  await forms.nth(2).selectOption("plain_text");
  await submission.getByLabel("Applied status").selectOption({ label: "Reference applied" });
  await submission.getByLabel("Application channel").fill("Synthetic manual submission");
  await submission
    .getByRole("checkbox", { name: /I confirm that I submitted these exact versions/u })
    .check();
  await submission.getByRole("button", { name: "Mark Applied and freeze submitted set" }).click();
  const snapshot = preparation.getByRole("region", { name: "Immutable submitted snapshot" });
  await expect(snapshot).toContainText(exportHash.slice(0, 12));
  await expect(snapshot).toContainText(cover.id);
  await expect(workspace).toContainText("Reference applied");
  const beforeReload = await page.evaluate(
    (id) => globalThis.coredrillStorageSpike.loadApplicationSubmissionReview(id),
    applicationId,
  );

  // A later current version must leave the submitted set unchanged.
  const later = await page.evaluate(async () => {
    const api = globalThis.coredrillStorageSpike;
    const opened = await api.openDocumentEditor("0199b300-0000-7000-8000-000000000009");
    const input = {
      documentId: opened.value.documentId,
      baseVersionId: opened.value.currentVersion.id,
      content: opened.value.currentVersion.content,
    };
    const saved = await api.saveDocumentEditorDraft({ ...input, expectedRowVersion: null });
    return api.createDocumentEditorVersion({
      ...input,
      expectedDraftRowVersion: saved.value.draft.rowVersion,
      label: "Later independent revision",
    });
  });
  expect(later.ok).toBe(true);
  await page.reload();
  await expect(snapshot).toContainText(exportHash.slice(0, 12));
  const afterReload = await page.evaluate(
    async ({ applicationId, jobId }) => ({
      submission:
        await globalThis.coredrillStorageSpike.loadApplicationSubmissionReview(applicationId),
      comparison: await globalThis.coredrillStorageSpike.jobComparison.load(jobId),
      career: await globalThis.coredrillStorageSpike.listManualCareerProfileEntries(),
    }),
    { applicationId, jobId },
  );
  expect(afterReload.submission.value.snapshot).toEqual(beforeReload.value.snapshot);
  expect(afterReload.career.value.find(({ id }) => id === confirmedRole.id)).toEqual(confirmedRole);
  expect(afterReload.comparison.value.evidence[0].selectedEvidence[0].evidenceId).toBe(
    confirmedRole.id,
  );
  expect(afterReload.submission.value.snapshot.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        documentVersionId: cover.id,
        contentId: exportHash,
        attachmentPurpose: artifact.attachmentPurpose,
      }),
    ]),
  );
  expect(later.value.currentVersion.id).not.toBe(cover.id);
  await page.setViewportSize({ width: 320, height: 900 });
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  expect(externalRequests).toEqual([]);
  const proof = {
    aiMode: "disabled",
    browserOffline: await page.evaluate(() => !navigator.onLine),
    externalRequests,
    imported: imported.value,
    confirmedRole,
    comparison: comparison.value,
    cover,
    exportHash,
    artifact,
    snapshot: afterReload.submission.value.snapshot,
    laterVersionId: later.value.currentVersion.id,
  };
  await testInfo.attach("phase-3-canonical-journey.json", {
    body: JSON.stringify(proof, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("phase-3-canonical-journey-axe.json", {
    body: JSON.stringify(axe, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("phase-3-canonical-journey-aria.yml", {
    body: await snapshot.ariaSnapshot(),
    contentType: "text/yaml",
  });
  await page.screenshot({ path: testInfo.outputPath("submitted-set-320.png"), fullPage: true });
  console.info(
    `Q3_005_E2E_PROOF ${JSON.stringify({ evidenceId: confirmedRole.id, coverVersionId: cover.id, exportHash, snapshotId: afterReload.submission.value.snapshot.id, externalRequests: 0 })}`,
  );
});
