import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, test } from "@playwright/test";

const appOrigin = "https://app.coredrill.test";
const localAppOrigin = "http://127.0.0.1:4173";
const extensionPath = path.resolve("apps/extension/.output/chrome-mv3");
const sourceUrl = "https://jobs.example.test/openings/q2-canonical-journey";

const launchExtensionContext = (userDataDirectory) =>
  chromium.launchPersistentContext(userDataDirectory, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });

const routeHostedApp = (context) =>
  context.route(`${appOrigin}/**`, async (route) => {
    const requested = new URL(route.request().url());
    const response = await route.fetch({
      url: `${localAppOrigin}${requested.pathname}${requested.search}`,
    });
    await route.fulfill({ response });
  });

const callInbox = (page, method, ...arguments_) =>
  page.evaluate(
    async ({ methodName, values }) => {
      const api = globalThis.coredrillExtensionInbox;
      if (api === undefined) throw new Error("Extension inbox API is unavailable.");
      return api[methodName](...values);
    },
    { methodName: method, values: arguments_ },
  );

const captureDraft = ({ capturedAt, selectedText, correction }) => ({
  specVersion: 1,
  capturedAt,
  snapshot: {
    specVersion: 1,
    url: sourceUrl,
    canonicalUrl: sourceUrl,
    pageTitle: "Canonical Platform Engineer",
    selectedText,
    fields: {
      title: {
        value: "Canonical Platform Engineer",
        pointer: "/document/title",
        method: "selector",
        confidence: 0.99,
      },
      company: {
        value: "Coredrill Labs",
        pointer: "/document/company",
        method: "selector",
        confidence: 0.99,
      },
    },
  },
  ...(correction === undefined ? {} : { corrections: { title: correction } }),
});

const queueDraft = (popup, draft) =>
  popup.evaluate(
    async (value) =>
      globalThis.chrome.runtime.sendMessage({ type: "capture.queue-draft.v1", draft: value }),
    draft,
  );

test("retains the complete Phase 2 extension capture and correction journey", async ({
  browserName: _browserName,
}, testInfo) => {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), "coredrill-q2-journey-"));
  const context = await launchExtensionContext(userDataDirectory);
  try {
    await routeHostedApp(context);
    const unexpectedRequests = [];
    context.on("request", (request) => {
      const url = request.url();
      if (!url.startsWith(appOrigin) && !url.startsWith("chrome-extension://")) {
        unexpectedRequests.push(url);
      }
    });

    let serviceWorker = context.serviceWorkers()[0];
    serviceWorker ??= await context.waitForEvent("serviceworker");
    const extensionId = new URL(serviceWorker.url()).host;
    expect(extensionId).toMatch(/^[a-p]{32}$/u);
    console.info("Q2 journey stage: extension ready");

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const root = await context.newPage();
    await root.goto(`${appOrigin}/`);
    await root.waitForFunction(
      () =>
        globalThis.coredrillStorageSpike !== undefined &&
        globalThis.coredrillExtensionInbox !== undefined,
    );
    await root.evaluate(async () => {
      await globalThis.coredrillStorageSpike.delete();
      await globalThis.coredrillStorageSpike.openAndMigrate();
    });
    console.info("Q2 journey stage: clean vault ready");

    const firstCapturedAt = new Date().toISOString();
    await expect(
      queueDraft(
        popup,
        captureDraft({
          capturedAt: firstCapturedAt,
          selectedText: "Own the local-first capture pipeline and immutable evidence trail.",
        }),
      ),
    ).resolves.toMatchObject({ success: true, type: "capture.queued.v1", outboxCount: 1 });
    const firstTransfer = await callInbox(root, "pullAndStore", extensionId);
    expect(firstTransfer).toMatchObject({
      status: "stored",
      duplicate: false,
      acknowledged: true,
      remainingCount: 0,
    });
    console.info("Q2 journey stage: first transfer acknowledged");
    await root.close();

    const app = await context.newPage();
    await app.goto(`${appOrigin}/app-shell.html`);
    await app.waitForFunction(
      () =>
        globalThis.coredrillAppShell !== undefined &&
        globalThis.coredrillExtensionInbox !== undefined,
    );
    await app.getByRole("button", { name: "Review captures" }).click();
    console.info("Q2 journey stage: inbox opened");
    const review = app.getByTestId("capture-review");
    await expect(review.getByText("1 capture awaiting review")).toBeVisible();
    await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
    await review.getByRole("button", { name: "Save as new job" }).click();
    await expect(review.getByText("No durable captures yet")).toBeVisible();
    const firstResolved = await callInbox(app, "getReviewItem", firstTransfer.envelopeId);
    expect(firstResolved).toMatchObject({ state: "resolved", resolutionKind: "save_new" });
    const jobId = firstResolved.resolvedJobId;
    console.info("Q2 journey stage: first capture saved");

    await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
    const secondCapturedAt = new Date().toISOString();
    await expect(
      queueDraft(
        popup,
        captureDraft({
          capturedAt: secondCapturedAt,
          selectedText:
            "Own the local-first capture pipeline, immutable evidence trail, and offline recovery.",
          correction: "Principal Canonical Platform Engineer",
        }),
      ),
    ).resolves.toMatchObject({ success: true, type: "capture.queued.v1", outboxCount: 1 });
    const changedTransfer = await callInbox(app, "pullAndStore", extensionId);
    expect(changedTransfer).toMatchObject({
      status: "stored",
      duplicate: false,
      acknowledged: true,
      remainingCount: 0,
      duplicateSuggestions: expect.arrayContaining([
        expect.objectContaining({ jobId, reasons: expect.arrayContaining(["canonical_url"]) }),
      ]),
    });
    console.info("Q2 journey stage: changed transfer acknowledged");

    await app.goto(`${appOrigin}/app-shell.html`);
    await app.waitForFunction(
      () =>
        globalThis.coredrillAppShell !== undefined &&
        globalThis.coredrillExtensionInbox !== undefined,
    );
    await app.getByRole("button", { name: "Review captures" }).click();
    await expect(review.getByRole("heading", { name: "Source content changed" })).toBeVisible();
    await expect(review.getByText(/Unresolved conflict · 2 candidates/u).first()).toBeVisible();
    console.info("Q2 journey stage: changed source and conflict visible");
    await review.getByRole("button", { name: "Merge into selected job" }).click();
    await expect(review.getByText("No durable captures yet")).toBeVisible();
    const changedResolved = await callInbox(app, "getReviewItem", changedTransfer.envelopeId);
    expect(changedResolved).toMatchObject({
      state: "resolved",
      resolutionKind: "merge_existing",
      resolvedJobId: jobId,
    });
    console.info("Q2 journey stage: changed source merged");

    const followUp = app.getByTestId("capture-resolution-follow-up");
    await expect(followUp.getByRole("heading", { name: "Source content changed" })).toBeVisible();
    await expect(followUp.getByText("1 retained source change.", { exact: false })).toBeVisible();
    await expect(
      followUp.getByText("Own the local-first capture pipeline and immutable evidence trail.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      followUp.getByText(
        "Own the local-first capture pipeline, immutable evidence trail, and offline recovery.",
        { exact: true },
      ),
    ).toBeVisible();

    const beforeCorrection = await callInbox(app, "getSavedJobEvidence", jobId);
    expect(beforeCorrection).toMatchObject({ title: "Canonical Platform Engineer" });
    expect(beforeCorrection.snapshots).toHaveLength(2);
    expect(
      beforeCorrection.titleValues.filter(
        (value) => value.userConfirmed && value.supersededById === null,
      ),
    ).toHaveLength(1);
    const sourceComparison = await callInbox(app, "compareSavedJobSourceSnapshots", jobId);
    expect(sourceComparison).toMatchObject({
      jobId,
      baselineText: "Own the local-first capture pipeline and immutable evidence trail.",
      currentText:
        "Own the local-first capture pipeline, immutable evidence trail, and offline recovery.",
      diff: {
        changed: true,
        changeCount: 1,
        content: { kind: "changed" },
        refreshPerformed: false,
        trustedFieldMutationPerformed: false,
      },
    });
    console.info("Q2 journey stage: source diff verified");

    await followUp
      .getByLabel("Correct confirmed title")
      .fill("Principal Canonical Platform Engineer");
    await followUp.getByRole("button", { name: "Apply manual correction" }).click();
    await expect(
      followUp.getByText(
        "Correction saved. The prior confirmed title and provenance remain in history.",
      ),
    ).toBeVisible();
    await expect(
      followUp.getByRole("heading", { name: "Principal Canonical Platform Engineer" }),
    ).toBeVisible();
    const correctedEvidence = await callInbox(app, "getSavedJobEvidence", jobId);
    expect(correctedEvidence.title).toBe("Principal Canonical Platform Engineer");
    const previousConfirmedTitle = correctedEvidence.titleValues.find(
      ({ userConfirmed, value }) => userConfirmed && value === "Canonical Platform Engineer",
    );
    const replacementConfirmedTitle = correctedEvidence.titleValues.find(
      ({ userConfirmed, value }) =>
        userConfirmed && value === "Principal Canonical Platform Engineer",
    );
    expect(previousConfirmedTitle).toMatchObject({
      value: "Canonical Platform Engineer",
      userConfirmed: true,
    });
    expect(replacementConfirmedTitle).toMatchObject({
      value: "Principal Canonical Platform Engineer",
      userConfirmed: true,
      supersededById: null,
      extractionMethod: "user",
    });
    expect(previousConfirmedTitle.supersededById).toBe(replacementConfirmedTitle.id);
    expect(previousConfirmedTitle.provenanceId).not.toBe(replacementConfirmedTitle.provenanceId);
    const screenshot = testInfo.outputPath("phase-2-canonical-capture-review.png");
    await followUp.screenshot({ path: screenshot });
    await testInfo.attach("phase-2-canonical-capture-review.png", {
      path: screenshot,
      contentType: "image/png",
    });
    const accessibility = await new AxeBuilder({ page: app }).analyze();
    expect(accessibility.violations).toEqual([]);
    console.info("Q2 journey stage: manual correction verified");

    await app.goto(`${appOrigin}/app-shell.html`);
    await app.waitForFunction(() => globalThis.coredrillExtensionInbox !== undefined);
    const afterReload = await callInbox(app, "getSavedJobEvidence", jobId);
    expect(afterReload.title).toBe("Principal Canonical Platform Engineer");
    expect(afterReload.snapshots).toHaveLength(2);
    expect(unexpectedRequests).toEqual([]);
    console.info("Q2 journey stage: reload durability verified");

    const proof = {
      browser: context.browser()?.version(),
      extensionId,
      appOrigin,
      extensionCaptureQueued: true,
      outboxAcknowledged: true,
      inboxConflictExposed: true,
      savedAndMerged: true,
      sourceDiffChangeCount: sourceComparison.diff.changeCount,
      confirmedFieldPreservedBeforeCorrection: beforeCorrection.title,
      explicitManualCorrection: afterReload.title,
      priorConfirmedValueSuperseded: true,
      finalRecordSurvivedReload: true,
      sourceSnapshotCount: afterReload.snapshots.length,
      unapprovedNetworkRequests: unexpectedRequests.length,
      accessibilityViolations: accessibility.violations.length,
    };
    const output = testInfo.outputPath("phase-2-canonical-capture-review.json");
    await writeFile(output, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
    await testInfo.attach("phase-2-canonical-capture-review.json", {
      path: output,
      contentType: "application/json",
    });
    console.info(`Q2_CANONICAL_CAPTURE_REVIEW_PROOF ${JSON.stringify(proof)}`);
  } finally {
    await context.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});
