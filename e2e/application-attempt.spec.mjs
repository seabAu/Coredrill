import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("starts a durable local application from a manually captured job without seeded records", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
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
  const pipeline = await page.evaluate(async (id) => {
    const api = globalThis.coredrillStorageSpike.pipeline;
    return {
      counts: await api.counts(),
      groups: await api.groups(),
      page: await api.page({ limit: 1 }),
      workspace: await api.workspace({ jobId: id }),
    };
  }, jobId);
  expect(pipeline.counts).toMatchObject({ ok: true, value: { all: 1 } });
  expect(pipeline.groups).toMatchObject({
    ok: true,
    value: [
      { statusId: null, jobCount: 0 },
      { statusId: comparison.status.id, jobCount: 1 },
    ],
  });
  expect(pipeline.page).toMatchObject({
    ok: true,
    value: { items: [{ id: jobId }], hasMore: false },
  });
  expect(pipeline.workspace).toMatchObject({
    ok: true,
    value: {
      job: { id: jobId, title: "Offline preparation engineer" },
      application: { id: comparison.applicationId },
      company: { canonicalName: "Synthetic Preparation Lab" },
    },
  });
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
  const appliedStage = page.getByRole("form", { name: "Create local Applied stage", exact: true });
  await expect(appliedStage).toBeVisible();
  await appliedStage.getByLabel("Applied stage name", { exact: true }).fill("My submitted stage");
  // Fault witness only; retry restores the real storage command.
  await page.evaluate(() => {
    const api = globalThis.coredrillStorageSpike;
    globalThis.coredrillStorageSpike = {
      ...api,
      createAppliedStage: async () => {
        globalThis.coredrillStorageSpike = api;
        return {
          ok: false,
          error: {
            code: "unavailable",
            message: "Synthetic local failure; keep the name.",
            retryable: true,
          },
        };
      },
    };
  });
  await appliedStage
    .getByRole("button", { name: "Create Applied stage locally", exact: true })
    .click();
  await expect(appliedStage.getByRole("alert")).toContainText("keep the name");
  await expect(appliedStage.getByLabel("Applied stage name", { exact: true })).toHaveValue(
    "My submitted stage",
  );
  await appliedStage
    .getByRole("button", { name: "Create Applied stage locally", exact: true })
    .click();
  await expect(appliedStage.getByRole("status")).toContainText(
    "Created Applied stage: My submitted stage",
  );
  const stageReview = await page.evaluate(async (id) => {
    const result = await globalThis.coredrillStorageSpike.loadApplicationSubmissionReview(id);
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  }, comparison.applicationId);
  expect(stageReview.appliedStatuses).toHaveLength(1);
  expect(stageReview.appliedStatuses[0].name).toBe("My submitted stage");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const stageScreenshot = testInfo.outputPath("applied-stage-320.png");
  await page.screenshot({ path: stageScreenshot, fullPage: true });
  await testInfo.attach("applied-stage-320.png", {
    path: stageScreenshot,
    contentType: "image/png",
  });
  await page.reload();
  await expect(appliedStage).toBeVisible();
  await appliedStage.getByLabel("Applied stage name", { exact: true }).fill("My submitted stage");
  await appliedStage
    .getByRole("button", { name: "Create Applied stage locally", exact: true })
    .click();
  await expect(appliedStage.getByRole("status")).toContainText(
    "Reused existing Applied stage: My submitted stage",
  );
  const stageAfter = await page.evaluate(
    async ({ jobId, applicationId }) => {
      const job = await globalThis.coredrillStorageSpike.jobComparison.load(jobId);
      const preparation =
        await globalThis.coredrillStorageSpike.loadApplicationDocumentPreparation(applicationId);
      const review =
        await globalThis.coredrillStorageSpike.loadApplicationSubmissionReview(applicationId);
      if (!job.ok || !preparation.ok || !review.ok)
        throw new Error("Stage verification read failed");
      return { job: job.value, preparation: preparation.value, review: review.value };
    },
    { jobId, applicationId: comparison.applicationId },
  );
  expect(stageAfter.job).toEqual(comparison);
  expect(stageAfter.preparation).toEqual(before);
  expect(stageAfter.review.appliedStatuses).toEqual(stageReview.appliedStatuses);
  const copies = [];
  for (const kind of ["resume", "cover_letter"]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Documents" })
      .click();
    await page.getByRole("button", { name: "New document", exact: true }).click();
    const manual = page.getByRole("form", { name: "New reusable document" });
    const title = `Reusable ${kind}`;
    await manual.getByLabel("Document title", { exact: true }).fill(title);
    await manual.getByLabel("Document kind", { exact: true }).selectOption(kind);
    await manual
      .getByLabel("Initial document text", { exact: true })
      .fill(`Synthetic ${kind} evidence`);
    await manual.getByRole("button", { name: "Create document locally", exact: true }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    const baseDocumentId = new URL(page.url()).pathname.split("/").at(-1);
    const source = await page.evaluate(async (id) => {
      const result = await globalThis.coredrillStorageSpike.openDocumentEditor(id);
      if (!result.ok) throw new Error(result.error.code);
      return result.value;
    }, baseDocumentId);
    await page.goto(`/jobs/${jobId}/documents`);
    const form = page.getByRole("form", { name: "Create a job-specific document", exact: true });
    await expect(form).toBeVisible();
    await expect(form.getByLabel("Reusable source version", { exact: true })).toHaveValue("");
    await form
      .getByLabel("Reusable source version", { exact: true })
      .selectOption(source.currentVersion.id);
    const copyTitle = `Job-specific ${kind}`;
    await form.getByLabel("Job-specific document title", { exact: true }).fill(copyTitle);
    await page.setViewportSize({ width: 320, height: 900 });
    await form.getByRole("button", { name: "Create job-specific copy", exact: true }).click();
    await expect(form.getByRole("status")).toContainText("has not been selected");
    const stored = await page.evaluate(async (title) => {
      const documents = await globalThis.coredrillStorageSpike.listDocumentsWorkspace();
      if (!documents.ok) throw new Error(documents.error.code);
      const copy = documents.value.find((item) => item.title === title);
      if (copy === undefined) throw new Error("Copy missing");
      const session = await globalThis.coredrillStorageSpike.openDocumentEditor(copy.id);
      if (!session.ok) throw new Error(session.error.code);
      return { copy, session: session.value };
    }, copyTitle);
    expect(stored.copy).toMatchObject({
      lineageRole: "job_derivative",
      relatedJob: { id: jobId },
      submission: null,
      claimStatus: "not_evaluated",
    });
    expect(stored.session.currentVersion.content).toEqual(source.currentVersion.content);
    expect(stored.session.currentVersion.contentHash).toBe(source.currentVersion.contentHash);
    expect(stored.session.origin).toEqual({
      sourceDocumentId: baseDocumentId,
      sourceVersionId: source.currentVersion.id,
      sourceVersionNumber: 1,
      firstVersionId: stored.session.currentVersion.id,
      contentHash: source.currentVersion.contentHash,
    });
    await page.goto(`/documents/${stored.copy.id}`);
    await expect(page.getByText(/Copied from reusable version 1/u)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Copied from reusable version 1/u)).toBeVisible();
    // Exercise wider native-control font metrics as well as the host's default font.
    await page.evaluate(() => {
      for (const control of document.querySelectorAll(
        ".cd-document-editor-workspace input, .cd-document-editor-workspace select",
      )) {
        control.style.fontFamily = "monospace";
        control.style.fontSize = "20px";
      }
    });
    const copyAxe = await new AxeBuilder({ page }).analyze();
    expect(copyAxe.violations).toEqual([]);
    const editorLayout = await page.evaluate(() => ({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      controls: [
        ...document.querySelectorAll(
          ".cd-document-editor-workspace input, .cd-document-editor-workspace select",
        ),
      ].map((control) => ({
        tag: control.tagName,
        width: control.getBoundingClientRect().width,
        right: control.getBoundingClientRect().right,
      })),
    }));
    expect(editorLayout.scrollWidth, JSON.stringify(editorLayout)).toBeLessThanOrEqual(
      editorLayout.viewport,
    );
    const editorScreenshot = testInfo.outputPath(`job-copy-editor-wide-controls-${kind}-320.png`);
    await page.screenshot({ path: editorScreenshot, fullPage: true });
    await testInfo.attach(`job-copy-editor-wide-controls-${kind}-320.png`, {
      path: editorScreenshot,
      contentType: "image/png",
    });
    copies.push({
      documentId: stored.copy.id,
      sourceVersionId: source.currentVersion.id,
      kind,
      contentHash: source.currentVersion.contentHash,
    });
    await page.getByRole("button", { name: "Back to documents", exact: true }).click();
  }
  await page.goto(`/jobs/${jobId}/documents`);
  await expect(page.locator('[data-preparation-status="missing"]')).toBeVisible();
  const finalPreparation = await page.evaluate(async (id) => {
    const result = await globalThis.coredrillStorageSpike.loadApplicationDocumentPreparation(id);
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  }, comparison.applicationId);
  expect(finalPreparation.selected).toEqual(before.selected);
  expect(finalPreparation.submitted).toBe(false);
  expect(finalPreparation.applicationRowVersion).toBe(before.applicationRowVersion);
  expect(
    finalPreparation.candidates.resumes.filter(
      (candidate) => candidate.lineageRole === "job_derivative",
    ),
  ).toHaveLength(1);
  expect(
    finalPreparation.candidates.coverLetters.filter(
      (candidate) => candidate.lineageRole === "job_derivative",
    ),
  ).toHaveLength(1);
  const copyScreenshot = testInfo.outputPath("job-document-copy-320.png");
  await page.screenshot({ path: copyScreenshot, fullPage: true });
  await testInfo.attach("job-document-copy-320.png", {
    path: copyScreenshot,
    contentType: "image/png",
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  console.info(
    `DOCUMENT_DERIVATION_PROOF ${JSON.stringify({ copies, noSeededRecords: true, offline: true, selectedDocuments: 0, submitted: false })}`,
  );
  expect(externalRequests).toEqual([]);
  console.info(
    `APPLICATION_ATTEMPT_PROOF ${JSON.stringify({ jobId, applicationId: comparison.applicationId, stageId: comparison.status.id, stageName: comparison.status.name, duplicateRejected: true, selectedDocuments: 0, submitted: false, scaffoldInstalled: false, offline: true, externalRequests: 0 })}`,
  );
});
