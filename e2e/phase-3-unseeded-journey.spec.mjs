import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";

test("an empty normal workspace carries reviewed resume evidence into an exact immutable submitted set offline", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(10_000);
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
  const empty = await page.evaluate(async () => ({
    jobs: await globalThis.coredrillStorageSpike.pipeline.counts(),
    documents: await globalThis.coredrillStorageSpike.listDocumentsWorkspace(),
    career: await globalThis.coredrillStorageSpike.listManualCareerProfileEntries(),
  }));
  expect(empty.jobs).toMatchObject({ ok: true, value: { all: 0 } });
  expect(empty.documents).toEqual({ ok: true, value: [] });
  expect(empty.career).toEqual({ ok: true, value: [] });
  await page.waitForFunction(
    () => globalThis.coredrillOfflineShell?.getState().registered === true,
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  await primary.getByRole("link", { name: "Career Profile", exact: true }).click();
  const career = page.getByTestId("career-profile-workspace");
  const imports = career.locator(".cd-career-import");
  const resumePath = path.join(process.cwd(), "fixtures/imports/synthetic-resume.docx");
  const sourceBytes = await readFile(resumePath);
  const sourceFileHash = createHash("sha256").update(sourceBytes).digest("hex");
  await imports.locator('input[type="file"]').setInputFiles(resumePath);
  await expect(imports.getByRole("status")).toContainText("7 proposals queued for review");
  await expect(imports).toContainText("Proposal only · not verified");
  const imported = await page.evaluate(() =>
    globalThis.coredrillStorageSpike.listPendingResumeImports(),
  );
  expect(imported.ok).toBe(true);
  expect(imported.value).toHaveLength(1);
  expect(imported.value[0].source).toMatchObject({
    sha256: sourceFileHash,
    byteLength: sourceBytes.byteLength,
    format: "docx",
  });
  expect(
    imported.value[0].proposals.every(
      (proposal) => proposal.sourcePointer.length > 0 && proposal.sourceExcerpt.length > 0,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => globalThis.coredrillStorageSpike.listManualCareerProfileEntries()),
  ).toEqual({ ok: true, value: [] });
  const roleDescription =
    "Built an accessible local-first workflow for evidence-backed job decisions.";
  await career.getByRole("tab", { name: /Work/u }).click();
  await career.getByLabel("Organization *").fill("Coredrill Labs");
  await career.getByLabel("Role *").fill("Product Engineer");
  await career.getByRole("tabpanel").getByLabel("Start date").fill("2024-01-01");
  await career.getByRole("tabpanel").getByLabel("End date").fill("2026-12-31");
  await career.getByLabel("Description", { exact: true }).fill(roleDescription);
  await career.getByRole("button", { name: "Save Work", exact: true }).click();
  await expect(career.locator(".cd-career-form").getByRole("status")).toContainText(
    "user-confirmed",
  );
  const confirmed = await page.evaluate(async () => {
    const result = await globalThis.coredrillStorageSpike.listManualCareerProfileEntries();
    if (!result.ok) throw new Error(result.error.code);
    return result.value.find((entry) => entry.primaryLabel === "Product Engineer");
  });
  expect(confirmed).toMatchObject({
    verificationState: "user_confirmed",
    startDate: "2024-01-01",
    endDate: "2026-12-31",
  });
  const duplicate = imports
    .locator(".cd-career-proposals > li")
    .filter({ hasText: "Coredrill Labs" })
    .filter({ hasText: "Product Engineer" });
  await expect(duplicate).toContainText("ambiguous date");
  await duplicate.getByRole("button", { name: /Merge with Product Engineer/u }).click();
  await expect(imports.getByRole("status")).toContainText("without overwriting it");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add job/u }).click();
  const capture = page.getByRole("dialog");
  await capture.getByLabel(/Job title/u).fill("Evidence workflow engineer");
  await capture.getByLabel(/Company/u).fill("Synthetic Opportunity Lab");
  const requirementText = "Accessible local-first workflows";
  const listingText = `Requirements:\n- Required: ${requirementText}`;
  await capture.getByLabel(/Notes or listing details/u).fill(listingText);
  await capture.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
  await capture.getByRole("button", { name: "Close capture dialog" }).click();
  await primary.getByRole("link", { name: "Pipeline", exact: true }).click();
  await page.locator('[data-pipeline-view-option="inbox"]').click();
  const review = page.getByTestId("capture-review");
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await review.getByRole("button", { name: "Save as new job" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
  await page.locator('[data-pipeline-view-option="board"]').click();
  await page
    .getByTestId("pipeline-board")
    .getByRole("button", { name: "Evidence workflow engineer", exact: true })
    .click();
  await page.getByRole("button", { name: "Requirements", exact: true }).click();
  const jobId = new URL(page.url()).pathname.split("/")[2];
  const workspace = page.locator(`[data-job-workspace="${jobId}"]`);
  const proposals = workspace.getByRole("list", { name: "Pending requirement proposals" });
  await expect(
    proposals.getByRole("heading", { name: requirementText, exact: true }),
  ).toBeVisible();
  await proposals.getByRole("button", { name: "Accept requirement", exact: true }).click();
  await expect(proposals.getByRole("heading", { name: requirementText, exact: true })).toHaveCount(
    0,
  );
  const accepted = await page.evaluate(async (id) => {
    const result = await globalThis.coredrillStorageSpike.jobComparison.load(id);
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  }, jobId);
  expect(accepted.requirements).toHaveLength(1);
  expect(accepted.requirements[0]).toMatchObject({
    normalizedText: requirementText,
    sourceExcerpt: `- Required: ${requirementText}`,
    sourcePointer: "/raw_text/lines/2",
    category: "required",
    sourceCategory: "required",
    userConfirmed: true,
  });
  const evidence = workspace.getByLabel(`Evidence for ${requirementText}`, { exact: true });
  await evidence.getByRole("button", { name: /Select Product Engineer/u }).click();
  await evidence
    .getByRole("combobox", { name: `Coverage decision for ${requirementText}`, exact: true })
    .selectOption("partial");
  await expect(evidence).toContainText("You marked this as Partial");
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  const start = workspace.getByRole("form", { name: "Start local application preparation" });
  await start.getByLabel("Preparation stage name").fill("My application preparation");
  await start.getByRole("button", { name: "Start preparation locally" }).click();
  await expect(page.locator('[data-preparation-status="missing"]')).toBeVisible();
  const job = await page.evaluate(async (id) => {
    const result = await globalThis.coredrillStorageSpike.jobComparison.load(id);
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  }, jobId);
  const applicationId = job.applicationId;
  expect(applicationId).not.toBeNull();
  const selectedEvidence = job.evidence[0].selectedEvidence;
  expect(selectedEvidence).toHaveLength(1);
  expect(selectedEvidence[0].evidenceId).toBe(confirmed.id);
  const applied = workspace.getByRole("form", { name: "Create local Applied stage", exact: true });
  await applied.getByLabel("Applied stage name", { exact: true }).fill("My recorded submission");
  await applied.getByRole("button", { name: "Create Applied stage locally", exact: true }).click();
  await expect(applied.getByRole("status")).toContainText("Created Applied stage");

  const documents = {};
  for (const kind of ["resume", "cover_letter"]) {
    await primary.getByRole("link", { name: "Documents", exact: true }).click();
    await page.getByRole("button", { name: "New document", exact: true }).click();
    const form = page.getByRole("form", { name: "New reusable document", exact: true });
    const baseTitle = `Canonical reusable ${kind}`;
    await form.getByLabel("Document title", { exact: true }).fill(baseTitle);
    await form.getByLabel("Document kind", { exact: true }).selectOption(kind);
    await form
      .getByLabel("Initial document text", { exact: true })
      .fill(kind === "resume" ? `Product Engineer at Coredrill Labs. ${roleDescription}` : "");
    await form.getByRole("button", { name: "Create document locally", exact: true }).click();
    await expect(page.getByRole("heading", { name: baseTitle, exact: true })).toBeVisible();
    const baseId = new URL(page.url()).pathname.split("/").at(-1);
    const source = await page.evaluate(
      (id) => globalThis.coredrillStorageSpike.openDocumentEditor(id),
      baseId,
    );
    expect(source.ok).toBe(true);
    await page.goto(`/jobs/${jobId}/documents`);
    const derivation = page.getByRole("form", {
      name: "Create a job-specific document",
      exact: true,
    });
    await derivation
      .getByLabel("Reusable source version", { exact: true })
      .selectOption(source.value.currentVersion.id);
    const title = `Canonical job-specific ${kind}`;
    await derivation.getByLabel("Job-specific document title", { exact: true }).fill(title);
    await derivation.getByRole("button", { name: "Create job-specific copy", exact: true }).click();
    await expect(derivation.getByRole("status")).toContainText("has not been selected");
    documents[kind] = await page.evaluate(async (title) => {
      const list = await globalThis.coredrillStorageSpike.listDocumentsWorkspace();
      if (!list.ok) throw new Error(list.error.code);
      const document = list.value.find((item) => item.title === title);
      const opened = await globalThis.coredrillStorageSpike.openDocumentEditor(document.id);
      if (!opened.ok) throw new Error(opened.error.code);
      return opened.value;
    }, title);
    expect(documents[kind].origin.sourceVersionId).toBe(source.value.currentVersion.id);
    expect(documents[kind].currentVersion.contentHash).toBe(
      source.value.currentVersion.contentHash,
    );
  }

  const preparation = workspace.locator(".cd-job-document-preparation");
  await preparation
    .getByRole("combobox", { name: "Exact cover-letter version", exact: true })
    .selectOption(documents.cover_letter.currentVersion.id);
  await preparation
    .getByRole("button", { name: "Create truthful template-only version", exact: true })
    .click();
  const templateProof = preparation.locator('.cd-job-template-draft [role="status"]');
  await expect(templateProof).toContainText(confirmed.id);
  await expect(templateProof).toContainText("AI disabled");
  const cover = await page.evaluate(async (id) => {
    const result = await globalThis.coredrillStorageSpike.openDocumentEditor(id);
    if (!result.ok) throw new Error(result.error.code);
    return result.value.currentVersion;
  }, documents.cover_letter.documentId);
  expect(cover.versionNumber).toBe(2);
  expect(cover.plainText).toContain(roleDescription);
  expect(cover.plainText).toContain("Evidence workflow engineer");
  expect(cover.plainText).toContain("Synthetic Opportunity Lab");
  await preparation
    .getByRole("combobox", { name: "Exact resume version", exact: true })
    .selectOption(documents.resume.currentVersion.id);
  await preparation
    .getByRole("combobox", { name: "Exact cover-letter version", exact: true })
    .selectOption(cover.id);
  await preparation.getByRole("button", { name: "Save exact selections", exact: true }).click();
  await expect(preparation).toContainText("Ready for export review");
  await preparation
    .getByRole("button", {
      name: "Review export for Canonical job-specific cover_letter version 2",
      exact: true,
    })
    .click();
  const exportReview = preparation.getByRole("region", {
    name: "Export review for Canonical job-specific cover_letter version 2",
    exact: true,
  });
  await expect(exportReview.getByRole("region", { name: "Document preview" })).toContainText(
    roleDescription,
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportReview.getByRole("button", { name: "Download DOCX", exact: true }).click(),
  ]);
  const bytes = await readFile(await download.path());
  const exportHash = createHash("sha256").update(bytes).digest("hex");
  await expect(exportReview.getByRole("status")).toContainText("retained for Mark Applied");
  await exportReview.getByRole("button", { name: "Close export review", exact: true }).click();
  const submissionReview = await page.evaluate(
    (id) => globalThis.coredrillStorageSpike.loadApplicationSubmissionReview(id),
    applicationId,
  );
  expect(submissionReview.ok).toBe(true);
  const artifact = submissionReview.value.documents
    .find((item) => item.role === "cover_letter")
    .artifacts.find((item) => item.contentId === exportHash);
  expect(artifact).toMatchObject({
    logicalName: download.suggestedFilename(),
    byteLength: bytes.byteLength,
    format: "docx",
  });
  const submission = preparation.getByRole("region", { name: "Mark Applied", exact: true });
  const formats = submission
    .getByRole("group", { name: "Exact submitted set", exact: true })
    .locator("select");
  await expect(formats).toHaveCount(2);
  await formats.nth(0).selectOption("plain_text");
  await formats.nth(1).selectOption({
    label: `DOCX · ${artifact.logicalName} · SHA-256 ${exportHash.slice(0, 12)}…${exportHash.slice(-8)}`,
  });
  await submission.getByLabel("Applied status").selectOption({ label: "My recorded submission" });
  await submission.getByLabel("Application channel").fill("Synthetic manual submission");
  await submission
    .getByRole("checkbox", { name: /I confirm that I submitted these exact versions/u })
    .check();
  await submission
    .getByRole("button", { name: "Mark Applied and freeze submitted set", exact: true })
    .click();
  const snapshot = preparation.getByRole("region", {
    name: "Immutable submitted snapshot",
    exact: true,
  });
  await expect(snapshot).toContainText(exportHash.slice(0, 12));
  const submitted = await page.evaluate(
    (id) => globalThis.coredrillStorageSpike.loadApplicationSubmissionReview(id),
    applicationId,
  );
  expect(submitted.ok).toBe(true);
  expect(submitted.value.snapshot.items).toHaveLength(2);
  expect(submitted.value.snapshot.appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/u);

  await primary.getByRole("link", { name: "Documents", exact: true }).click();
  await page
    .getByRole("button", { name: "Canonical job-specific cover_letter", exact: true })
    .click();
  const editor = page.getByRole("textbox", { name: "Document content editor", exact: true });
  await editor.fill(`${cover.plainText}\nLater independent revision.`);
  await expect(page.locator('[data-document-autosave="saved"]')).toBeVisible();
  await page
    .getByLabel("Version label (optional)", { exact: true })
    .fill("Later independent revision");
  await page.getByRole("button", { name: "Create version", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "Version 3 · Later independent revision", exact: true }),
  ).toHaveCount(1);
  const later = await page.evaluate(
    (id) => globalThis.coredrillStorageSpike.openDocumentEditor(id),
    documents.cover_letter.documentId,
  );
  expect(later.ok).toBe(true);
  expect(later.value.currentVersion.id).not.toBe(cover.id);
  expect(later.value.currentVersion.parentVersionId).toBe(cover.id);
  expect(later.value.currentVersion.contentHash).not.toBe(cover.contentHash);
  await page.goto(`/jobs/${jobId}/documents`);
  await page.reload();
  await expect(snapshot).toContainText(cover.id);
  await expect(snapshot).toContainText(exportHash.slice(0, 12));
  await workspace.getByRole("button", { name: "Timeline", exact: true }).click();
  const history = workspace.getByRole("region", { name: "Stored job timeline", exact: true });
  await expect(history.locator("[data-timeline-id]")).toHaveCount(2);
  await expect(history).toContainText("My recorded submission");
  await workspace.getByRole("button", { name: "Documents", exact: true }).click();
  await expect(snapshot).toContainText(cover.id);
  const after = await page.evaluate(
    async ({ applicationId, jobId }) => ({
      submission:
        await globalThis.coredrillStorageSpike.loadApplicationSubmissionReview(applicationId),
      career: await globalThis.coredrillStorageSpike.listManualCareerProfileEntries(),
      comparison: await globalThis.coredrillStorageSpike.jobComparison.load(jobId),
      source: await globalThis.coredrillExtensionInbox.getSavedJobEvidence(jobId),
      jobs: await globalThis.coredrillStorageSpike.pipeline.counts(),
      workspace: await globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
      imports: await globalThis.coredrillStorageSpike.listPendingResumeImports(),
      documents: await globalThis.coredrillStorageSpike.listDocumentsWorkspace(),
    }),
    { applicationId, jobId },
  );
  expect(after.submission.value.snapshot).toEqual(submitted.value.snapshot);
  expect(after.submission.value.snapshot.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        documentVersionId: cover.id,
        contentId: exportHash,
        attachmentPurpose: artifact.attachmentPurpose,
      }),
      expect.objectContaining({
        documentVersionId: documents.resume.currentVersion.id,
        submissionFormat: "plain_text",
      }),
    ]),
  );
  expect(after.career.value.find((entry) => entry.id === confirmed.id)).toEqual(confirmed);
  expect(after.career.value).toHaveLength(1);
  expect(after.comparison.value.evidence[0].selectedEvidence[0].evidenceId).toBe(confirmed.id);
  expect(after.source.snapshots[0].rawText).toBe(listingText);
  expect(after.jobs).toMatchObject({ ok: true, value: { all: 1 } });
  expect(after.workspace).toMatchObject({
    ok: true,
    value: {
      job: { id: jobId, status: { category: "applied", name: "My recorded submission" } },
      application: {
        id: applicationId,
        channel: "Synthetic manual submission",
        appliedAt: submitted.value.snapshot.appliedAt,
        selectedResumeVersionId: documents.resume.currentVersion.id,
        selectedCoverLetterVersionId: cover.id,
      },
    },
  });
  expect(after.imports.ok).toBe(true);
  expect(after.imports.value.find((item) => item.id === imported.value[0].id).source).toEqual(
    imported.value[0].source,
  );
  expect(after.documents.ok).toBe(true);
  expect(after.documents.value).toHaveLength(4);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await testInfo.attach("phase-3-unseeded-canonical.json", {
    body: JSON.stringify(
      {
        sourceFileHash,
        imported: imported.value,
        confirmed,
        jobId,
        applicationId,
        requirement: accepted.requirements[0],
        documents,
        cover,
        exportHash,
        artifact,
        snapshot: after.submission.value.snapshot,
        laterVersionId: later.value.currentVersion.id,
        offline: true,
        fixtureInstalled: false,
        externalRequests: 0,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  await page.screenshot({
    path: testInfo.outputPath("unseeded-submitted-set-320.png"),
    fullPage: true,
  });
});
