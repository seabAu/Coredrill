import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";
import { exerciseStoredListingComparison } from "./listing-comparison-journey.mjs";
import { exerciseStoredJobNote } from "./job-note-journey.mjs";
import { exerciseNextActionRuntime } from "./next-action-runtime-journey.mjs";
import { exerciseVaultExportPreparation } from "./vault-export-runtime-journey.mjs";
import { exerciseNormalVaultPreparation } from "./normal-vault-export-journey.mjs";
import { expectRestoredPortableContent } from "./portable-archive-content-proof.mjs";
import { expectReviewedSchemaRestoreUpgrade } from "./schema-160-restore-proof.mjs";
import { inspectPortableArchiveV1 } from "../packages/storage-core/dist/index.js";
import { exerciseNormalTaskEntry } from "./task-entry-journey.mjs";
import { exerciseScheduledTaskEntry } from "./scheduled-task-entry-journey.mjs";
import { exerciseTaskEntryLifetime } from "./task-entry-lifetime.mjs";
import { exerciseCompanyDirectory } from "./company-directory-journey.mjs";
import { exerciseCompanyWorkspace } from "./company-workspace-journey.mjs";
import { exerciseContactRuntime } from "./contact-runtime-journey.mjs";
import { exerciseInteractionRecordingRuntime } from "./interaction-recording-runtime-journey.mjs";
import { exerciseNormalInteractionEntry } from "./normal-interaction-entry-journey.mjs";
import { exerciseNormalContactDeletion } from "./normal-contact-deletion-journey.mjs";
import { exerciseInteractionEntryFaults } from "./interaction-entry-faults.mjs";
import { exerciseContactWorkspace } from "./contact-workspace-journey.mjs";
import { exerciseContactOwnerLifetimes } from "./contact-owner-lifetime-journey.mjs";
import { createContactHistoryFixture } from "./contact-history-fixture.mjs";
import { exerciseContactHistory } from "./contact-history-journey.mjs";
import { createContactEvidenceFixture } from "./contact-evidence-fixture.mjs";
import { exerciseContactEvidence } from "./contact-evidence-journey.mjs";
import { attachNativeHost } from "./native-proof-host.mjs";
import {
  createNativeRestoreOperationRecorder,
  observeNativeRestoreReview,
} from "./native-restore-stage-proof.mjs";

const root = path.resolve(import.meta.dirname, "..");
const executable = path.join(
  root,
  "apps/desktop/src-tauri/target/debug",
  process.platform === "win32"
    ? "coredrill-native-storage-probe.exe"
    : "coredrill-native-storage-probe",
);

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const build = spawn(
    "cargo",
    [
      "build",
      "--manifest-path",
      "apps/desktop/src-tauri/Cargo.toml",
      "--locked",
      "--no-default-features",
      "--features",
      "native-storage-probe",
      "--bin",
      "coredrill-native-storage-probe",
    ],
    { cwd: root, windowsHide: true, stdio: "ignore", timeout: 180_000 },
  );
  expect((await once(build, "exit"))[0]).toBe(0);
});

// Each journey owns a fresh process. Initial tracking records use normal UI;
// contact API and preserved legacy archive proof explicitly disclose their different paths.
// Keep tracking/task/source regressions separate from document/archive work so
// neither borrows another test's state or an ever-growing shared timeout budget.
const exerciseNativeJourney = async (page, testInfo, journey) => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "coredrill-native-ui-"));
  const managedRoot = path.join(temporaryRoot, "managed");
  const selectedArchive = path.join(temporaryRoot, "selected.coredrill.zip");
  let child = spawn(executable, [managedRoot, selectedArchive, selectedArchive], {
    windowsHide: true,
    stdio: "pipe",
  });
  let stopped = once(child, "exit");
  let lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let queue = Promise.resolve();
  let invocations = 0;
  let activeDocumentId;
  let lastVaultPreview;
  const retiredDocuments = new Set();
  let holdNextBegin = false;
  let heldAcknowledgements = 0;
  let releaseHeldBegin = () => undefined;
  let loseInteractionId = null;
  let loseInteractionSession = null;
  let lostInteractionCommits = 0;
  let failInteractionId = null;
  const restoreOperations = createNativeRestoreOperationRecorder();
  const send = async (request) => {
    const finishObservation = restoreOperations.measure(request.operation?.type);
    try {
      invocations += 1;
      child.stdin.write(`${JSON.stringify(request)}\n`);
      const line = await lines.next();
      if (line.done) throw new Error("Native proof process stopped");
      const envelope = JSON.parse(line.value);
      if (!envelope.ok) throw envelope.error;
      return envelope.response;
    } finally {
      finishObservation();
    }
  };
  const errors = [];
  const external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:4181/")) return route.continue();
    external.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  try {
    await page.exposeFunction("coredrillArmInteractionAckLoss", (id) => {
      loseInteractionId = id;
    });
    await page.exposeFunction("coredrillArmInteractionWriteFailure", (id) => {
      failInteractionId = id;
    });
    await attachNativeHost(page, (command, args, documentId) => {
      if (
        !["native_storage_invoke", "native_archive_invoke", "native_vault_invoke"].includes(command)
      )
        throw new Error("Unexpected native command");
      if (command === "native_vault_invoke" && args.request.operation.type === "preview_deletion")
        lastVaultPreview = args.request;
      if (
        command === "native_storage_invoke" &&
        args.request.operation.type === "execute" &&
        args.request.operation.statement.sql.includes("INSERT INTO interaction(") &&
        args.request.operation.statement.parameters[0]?.value === failInteractionId
      ) {
        failInteractionId = null;
        throw new Error("Synthetic refusal before interaction insert");
      }
      const result = queue.then(async () => {
        if (retiredDocuments.has(documentId)) throw new Error("Retired proof document");
        if (activeDocumentId !== documentId) {
          if (activeDocumentId !== undefined) retiredDocuments.add(activeDocumentId);
          await send({ proofOperation: "retire_webview_sessions" });
          activeDocumentId = documentId;
        }
        return send(args.request);
      });
      queue = result.catch(() => {});
      const operation = args.request.operation;
      if (
        command === "native_storage_invoke" &&
        operation.type === "execute" &&
        operation.statement.sql.includes("INSERT INTO interaction(") &&
        operation.statement.parameters[0]?.value === loseInteractionId
      )
        loseInteractionSession = operation.sessionId;
      if (
        command === "native_storage_invoke" &&
        operation.type === "commit" &&
        operation.sessionId === loseInteractionSession
      ) {
        loseInteractionId = null;
        loseInteractionSession = null;
        return result.then((response) => {
          expect(response.data).toEqual({ type: "transaction_state", active: false });
          lostInteractionCommits++;
          throw new Error("Synthetic lost interaction commit acknowledgement");
        });
      }
      if (holdNextBegin && args.request.operation.type === "begin") {
        holdNextBegin = false;
        return result.then((response) => {
          expect(response.data).toEqual({ type: "transaction_state", active: true });
          heldAcknowledgements += 1;
          return new Promise((resolve) => {
            releaseHeldBegin = () => resolve(response);
          });
        });
      }
      return result;
    });
    await page.goto("/");
    await page.waitForFunction(() => globalThis.coredrillStorageSpike?.runtimeKind === "native");
    await initializeDefaultWorkspace(page);
    await expect(
      page.getByRole("button", {
        name: "Desktop vault: My job search. Vault healthy",
      }),
    ).toBeVisible();
    const primary = page.getByRole("navigation", { name: "Primary", exact: true });
    await primary.getByRole("link", { name: "Pipeline", exact: true }).click();
    await expect(page.getByText("No stored jobs yet.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: /Add job/u }).click();
    const capture = page.getByRole("dialog");
    await capture.getByLabel(/Job title/u).fill("Synthetic native runtime role");
    await capture.getByLabel(/Company/u).fill("Synthetic Runtime Lab");
    await capture.getByLabel(/Notes or listing details/u).fill("Build reliable offline systems.");
    await capture.getByRole("button", { name: "Save to capture inbox" }).click();
    await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
    await capture.getByRole("button", { name: "Close capture dialog" }).click();
    await page.locator('[data-pipeline-view-option="inbox"]').click();
    const review = page.getByTestId("capture-review");
    await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
    await review.getByRole("button", { name: "Save as new job" }).click();
    await expect(review.getByText("No durable captures yet")).toBeVisible();
    await page.locator('[data-pipeline-view-option="board"]').click();
    await expect(page.getByTestId("pipeline-board")).toContainText("Synthetic native runtime role");
    // Force the lifecycle race: Rust has entered a transaction but its document
    // never receives BEGIN's acknowledgement and cannot send COMMIT/ROLLBACK.
    holdNextBegin = true;
    const abandonedRead = page
      .evaluate(() => globalThis.coredrillStorageSpike.pipeline.counts())
      .catch(() => undefined);
    await expect.poll(() => heldAcknowledgements).toBe(1);
    await page.reload();
    releaseHeldBegin();
    await abandonedRead;
    await expect(page.getByTestId("pipeline-board")).toContainText("Synthetic native runtime role");
    await page.locator('[data-pipeline-view-option="table"]').click();
    await page.getByRole("button", { name: "Synthetic native runtime role", exact: true }).click();
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    const start = page.getByRole("form", { name: "Start local application preparation" });
    await start.getByLabel("Preparation stage name").fill("Native drafting");
    await start.getByRole("button", { name: "Start preparation locally" }).click();
    await expect(page.locator('[data-preparation-status="missing"]')).toBeVisible();
    const jobDocumentsUrl = page.url();
    await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
    const journeyProof = {};
    if (journey === "network") {
      Object.assign(journeyProof, {
        companyDirectory: await exerciseCompanyDirectory(page, testInfo, "Synthetic Runtime Lab"),
        companyWorkspace: await exerciseCompanyWorkspace(page, testInfo),
        contactRuntime: await exerciseContactRuntime(page, testInfo),
        contactWorkspace: await exerciseContactWorkspace(page, testInfo),
        contactOwnerLifetimes: await exerciseContactOwnerLifetimes(page, testInfo),
        interactionRecording: await exerciseInteractionRecordingRuntime(page, testInfo),
        interactionEntry: await exerciseNormalInteractionEntry(page, testInfo),
        interactionEntryFaults: await exerciseInteractionEntryFaults(page, testInfo),
        contactDeletion: await exerciseNormalContactDeletion(page, testInfo),
      });
      expect(lostInteractionCommits).toBe(2);
    } else if (journey === "tracking") {
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await page.getByRole("menuitem", { name: /Add job/u }).click();
      await capture.getByLabel(/Job title/u).fill("Synthetic native movable role");
      await capture.getByLabel(/Company/u).fill("Synthetic Runtime Lab");
      await capture.getByLabel(/Notes or listing details/u).fill("Native status and undo fixture.");
      await capture.getByRole("button", { name: "Save to capture inbox" }).click();
      await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
      await capture.getByRole("button", { name: "Close capture dialog" }).click();
      await page.locator('[data-pipeline-view-option="inbox"]').click();
      await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
      await review.getByRole("button", { name: "Save as new job" }).click();
      await expect(review.getByText("No durable captures yet")).toBeVisible();
      await page.locator('[data-pipeline-view-option="board"]').click();
      await page
        .getByRole("combobox", { name: "Move Synthetic native movable role to stage" })
        .selectOption({ label: "Native drafting" });
      const statusActions = page.getByRole("region", {
        name: /^Local status(?: and task)? changes$/u,
      });
      await expect(statusActions.getByRole("status")).toContainText(
        "Saved Synthetic native movable role",
      );
      await page.locator('[data-pipeline-view-option="table"]').click();
      await statusActions
        .getByRole("button", {
          name: "Undo status change for Synthetic native movable role",
          exact: true,
        })
        .click();
      await expect(statusActions.getByRole("status")).toContainText(
        "Restored Synthetic native movable role",
      );
      await page
        .getByRole("button", { name: "Synthetic native movable role", exact: true })
        .click();
      await page.getByRole("button", { name: "Change status", exact: true }).click();
      const headerStatus = page.getByRole("form", { name: "Change local job status", exact: true });
      await headerStatus
        .getByLabel("New local stage", { exact: true })
        .selectOption({ label: "Native drafting" });
      await headerStatus.getByRole("button", { name: "Save local status", exact: true }).click();
      await expect(headerStatus).toHaveCount(0);
      await expect(page.locator(".cd-job-workspace-context")).toContainText("Native drafting");
      await expect(statusActions).toHaveCount(1);
      await statusActions
        .getByRole("button", {
          name: "Undo status change for Synthetic native movable role",
          exact: true,
        })
        .click();
      await expect(statusActions.getByRole("status")).toContainText(
        "Restored Synthetic native movable role",
      );
      await expect(page.locator(".cd-job-workspace-context")).toContainText("Unassigned");
      const nextActionRuntime = await exerciseNextActionRuntime(page, testInfo);
      await testInfo.attach("native-next-action-runtime-proof.json", {
        body: JSON.stringify({
          ...nextActionRuntime,
          actualRustSqlite: true,
          simulatedTauriHost: true,
        }),
        contentType: "application/json",
      });
      const taskEntry = await exerciseNormalTaskEntry(page, testInfo);
      const scheduling = await exerciseScheduledTaskEntry(page, testInfo);
      const scheduledLifetime = await exerciseTaskEntryLifetime(page, { scheduled: true });
      await testInfo.attach("native-task-entry-proof.json", {
        body: JSON.stringify({
          ...taskEntry,
          scheduling,
          scheduledLifetime,
          actualRustSqlite: true,
          simulatedTauriHost: true,
        }),
        contentType: "application/json",
      });
      const storedOverview = page.getByRole("region", { name: "Stored job overview", exact: true });
      await expect(storedOverview).toContainText("Synthetic native movable role");
      await expect(storedOverview).toContainText("No unarchived application attempt recorded.");
      await page.getByRole("button", { name: "Company", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "Stored job company", exact: true }),
      ).toContainText("Synthetic Runtime Lab");
      await page.getByRole("button", { name: "Timeline", exact: true }).click();
      const history = page.getByRole("region", { name: "Stored job timeline", exact: true });
      await expect(history).toContainText("Native drafting");
      await expect(history).toContainText("Reversed by a recorded undo");
      // Board and header each append their own event; undo preserves both.
      await expect(history.locator("[data-timeline-id]")).toHaveCount(2);
      await expect(history.getByText(/Reversed by a recorded undo/u)).toHaveCount(2);
      const sourceJobId = new URL(page.url()).pathname.split("/")[2];
      const beforeSource = await page.evaluate(
        (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
        sourceJobId,
      );
      await page.getByRole("button", { name: "Source", exact: true }).click();
      const source = page.getByRole("region", { name: "Stored job Source", exact: true });
      await expect(
        source.getByRole("region", { name: "primary literal retained content", exact: true }),
      ).toHaveText("Native status and undo fixture.");
      const titleSource = source
        .locator("[data-source-evidence]")
        .filter({ has: page.getByText(/^Field candidate: title/u) });
      await titleSource.locator("summary").click();
      await titleSource
        .getByRole("button", { name: "Inspect normalized value", exact: true })
        .click();
      await expect(
        source.getByRole("region", { name: "primary full value literal part", exact: true }),
      ).toHaveText(JSON.stringify("Synthetic native movable role"));
      const afterSource = await page.evaluate(
        (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
        sourceJobId,
      );
      expect(afterSource).toEqual(beforeSource);
      const originalCapture = await page.evaluate(async (jobId) => {
        const snapshots = await globalThis.coredrillStorageSpike.pipeline.sourceSnapshots({
          jobId,
        });
        if (!snapshots.ok) throw new Error("Source snapshot unavailable");
        return globalThis.coredrillStorageSpike.pipeline.sourceCapture({
          jobId,
          snapshotId: snapshots.value.items[0].id,
        });
      }, sourceJobId);
      expect(originalCapture.ok).toBe(true);
      expect(originalCapture.value.availability).toBe("retained");
      expect(
        originalCapture.value.capture.fieldCandidates.find(({ fieldName }) => fieldName === "title")
          .value,
      ).toBe("Synthetic native movable role");
      await page.reload();
      await expect(
        source.getByRole("region", { name: "primary literal retained content", exact: true }),
      ).toHaveText("Native status and undo fixture.");
      await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
      await page
        .getByRole("button", { name: "Edit status for Synthetic native movable role", exact: true })
        .click();
      await page
        .getByLabel("Status for Synthetic native movable role", { exact: true })
        .selectOption({ label: "Native drafting" });
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(statusActions.getByRole("status")).toContainText(
        "Saved Synthetic native movable role",
      );
      const listingComparison = await exerciseStoredListingComparison(page, testInfo);
      const localNote = await exerciseStoredJobNote(page, testInfo);
      Object.assign(journeyProof, { listingComparison, localNote });
    } else if (journey === "history" || journey === "evidence") {
      const fixture =
        journey === "history"
          ? await createContactHistoryFixture(testInfo)
          : await createContactEvidenceFixture(testInfo);
      await writeFile(selectedArchive, fixture.bytes);
      await page.getByRole("link", { name: "Settings", exact: true }).click();
      const restore = page.getByRole("region", { name: "Portable vault restore", exact: true });
      await restore.getByRole("button", { name: "Choose archive to review", exact: true }).click();
      await expect(
        restore.getByRole("heading", { name: "Review exact restore changes", exact: true }),
      ).toBeVisible();
      await expect(restore).toContainText("DIFFERENT vault");
      await restore.getByRole("checkbox").check();
      await restore
        .getByRole("button", { name: "Confirm and restore reviewed archive", exact: true })
        .click();
      await expect(restore.getByRole("status")).toContainText(
        "Restore committed and its acknowledgement validated",
      );
      await restore.getByRole("button", { name: "Reload local vault", exact: true }).click();
      Object.assign(
        journeyProof,
        journey === "history"
          ? {
              contactHistory: await exerciseContactHistory(page, testInfo, fixture, "native"),
            }
          : {
              contactEvidence: await exerciseContactEvidence(page, testInfo, fixture, "native"),
            },
      );
    } else if (["legacy", "legacy164", "legacy165", "legacy167", "current182"].includes(journey)) {
      const sourceVersion = {
        legacy: 160,
        legacy164: 164,
        legacy165: 165,
        legacy167: 167,
        current182: 182,
      }[journey];
      const bytes = await readFile(
        path.join(root, `fixtures/recovery/phase-1-vault-schema-${sourceVersion}-v1.coredrill.zip`),
      );
      const archive = await inspectPortableArchiveV1({
        bytes: new Uint8Array(bytes),
        expectedSchemaVersion: sourceVersion,
      });
      await writeFile(selectedArchive, bytes);
      await page.getByRole("link", { name: "Settings", exact: true }).click();
      const panel = page.getByRole("region", { name: "Portable vault restore", exact: true });
      await observeNativeRestoreReview(
        panel,
        testInfo,
        restoreOperations,
        "legacy_source",
        async () => {
          await panel
            .getByRole("button", { name: "Choose archive to review", exact: true })
            .click();
          await expect(
            panel.getByRole("heading", { name: "Review exact restore changes", exact: true }),
          ).toBeVisible();
        },
      );
      await expect(panel).toContainText(archive.archiveSha256);
      await expect(panel).toContainText("DIFFERENT vault");
      await expect(panel.getByRole("checkbox")).toHaveAccessibleName(
        /replacement of this different vault/u,
      );
      await panel.getByRole("checkbox").check();
      await panel
        .getByRole("button", { name: "Confirm and restore reviewed archive", exact: true })
        .click();
      await expect(panel.getByRole("status")).toContainText(
        "Restore committed and its acknowledgement validated",
      );
      const openedAfter = Date.now();
      await panel.getByRole("button", { name: "Reload local vault", exact: true }).click();
      await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Settings", exact: true }).click();
      const exported = await exerciseNormalVaultPreparation(page, "native");
      await exported.getByRole("button", { name: "Save prepared archive", exact: true }).click();
      await expect(exported.getByRole("status")).toContainText("confirmed the exact archive bytes");
      const actual = await inspectPortableArchiveV1({
        bytes: new Uint8Array(await readFile(selectedArchive)),
        expectedSchemaVersion: 182,
      });
      await expectReviewedSchemaRestoreUpgrade(
        actual,
        archive,
        [openedAfter, Date.now()],
        sourceVersion,
      );
      Object.assign(journeyProof, {
        normalPriorSchemaRestore: true,
        sourceSchemaVersion: sourceVersion,
        reopenedSchemaVersion: 182,
        explicitDifferentVaultConfirmation: true,
        syntheticPreservedArchive: true,
        noReceiptBackfill: true,
        existingReceiptPreserved: sourceVersion >= 164,
      });
    } else {
      await primary.getByRole("link", { name: "Documents", exact: true }).click();
      await page.getByRole("button", { name: "New document", exact: true }).click();
      const form = page.getByRole("form", { name: "New reusable document" });
      await form.getByLabel("Document title", { exact: true }).fill("Synthetic native resume");
      await form
        .getByLabel("Initial document text", { exact: true })
        .fill("Synthetic native evidence");
      await form.getByRole("button", { name: "Create document locally", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Synthetic native resume", exact: true }),
      ).toBeVisible();
      const documentId = new URL(page.url()).pathname.split("/").at(-1);
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Synthetic native resume", exact: true }),
      ).toBeVisible();
      const stored = await page.evaluate(
        (id) => globalThis.coredrillStorageSpike.openDocumentEditor(id),
        documentId,
      );
      expect(stored).toMatchObject({
        ok: true,
        value: { currentVersion: { plainText: "Synthetic native evidence", versionNumber: 1 } },
      });
      await page.goto(jobDocumentsUrl);
      const derivative = page.getByRole("form", {
        name: "Create a job-specific document",
        exact: true,
      });
      await derivative
        .getByLabel("Reusable source version", { exact: true })
        .selectOption(stored.value.currentVersion.id);
      await derivative
        .getByLabel("Job-specific document title", { exact: true })
        .fill("Synthetic native job resume");
      await derivative
        .getByRole("button", { name: "Create job-specific copy", exact: true })
        .click();
      await expect(derivative.getByRole("status")).toContainText("has not been selected");
      const preparation = page.locator(".cd-job-document-preparation");
      const version = await preparation
        .getByLabel("Exact resume version *")
        .locator("option")
        .filter({ hasText: "Synthetic native job resume" })
        .getAttribute("value");
      await preparation.getByLabel("Exact resume version *").selectOption(version);
      await preparation.getByRole("button", { name: "Save exact selections" }).click();
      await expect(preparation).toContainText("Ready for export review");
      await preparation
        .getByRole("button", { name: "Review export for Synthetic native job resume version 1" })
        .click();
      const exportReview = preparation.getByRole("region", {
        name: "Export review for Synthetic native job resume version 1",
      });
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        exportReview.getByRole("button", { name: "Download DOCX" }).click(),
      ]);
      const bytes = await readFile(await download.path());
      const hash = createHash("sha256").update(bytes).digest("hex");
      await expect(exportReview.getByRole("status")).toContainText("retained for Mark Applied");
      expect(
        await readFile(
          path.join(managedRoot, "attachments", "sha256", hash.slice(0, 2), hash.slice(2, 4), hash),
        ),
      ).toEqual(bytes);
      await page.reload();
      await expect(preparation).toContainText("Ready for export review");
      const vaultExportPreparation = await exerciseVaultExportPreparation(page, testInfo, 1);
      await page.getByRole("link", { name: "Settings", exact: true }).click();
      const verificationHistory = page.getByRole("region", {
        name: "Verified export history",
        exact: true,
      });
      await expect(verificationHistory).toContainText("No export verification observations");
      await verificationHistory
        .getByRole("button", { name: "Turn off export reminders", exact: true })
        .click();
      await expect(
        verificationHistory.getByRole("button", { name: "Turn on export reminders", exact: true }),
      ).toBeVisible();
      const beforeWarningHandoff = await page.evaluate(
        async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
      );
      await page.getByRole("button", { name: "Review vault deletion", exact: true }).click();
      await page.getByRole("button", { name: "Delete local vault", exact: true }).click();
      const deletionWarning = page.getByRole("dialog");
      const confirmation = await deletionWarning.locator("code").innerText();
      await deletionWarning
        .getByRole("button", { name: "Export portable archive", exact: true })
        .click();
      await expect(deletionWarning).toHaveCount(0);
      const consent = page
        .getByRole("region", { name: "Portable vault export", exact: true })
        .getByRole("checkbox");
      await expect(consent).toBeFocused();
      await expect(consent).not.toBeChecked();
      if (lastVaultPreview === undefined) throw new Error("Missing real native deletion preview");
      const forbiddenDelete = queue.then(() =>
        send({
          protocolVersion: lastVaultPreview.protocolVersion,
          requestId: randomUUID(),
          operation: {
            ...lastVaultPreview.operation,
            type: "delete",
            deletionId: randomUUID(),
            confirmation,
          },
        }),
      );
      queue = forbiddenDelete.catch(() => undefined);
      await expect(forbiddenDelete).rejects.toMatchObject({ code: "invalid_request" });
      expect(
        await page.evaluate(
          async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
        ),
      ).toBe(beforeWarningHandoff);
      await expect(stat(selectedArchive)).rejects.toMatchObject({ code: "ENOENT" });
      const vaultExportPanel = await exerciseNormalVaultPreparation(page, "native");
      await expect(vaultExportPanel).toContainText("Retained attachments");
      await page.setViewportSize({ width: 320, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      expect(
        (await new AxeBuilder({ page }).include(".cd-vault-export").analyze()).violations,
      ).toEqual([]);
      const beforeSaveHash = await page.evaluate(
        async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
      );
      const nativeSaveButton = vaultExportPanel.getByRole("button", {
        name: "Save prepared archive",
        exact: true,
      });
      const cancelledSelection = queue.then(() =>
        send({ proofOperation: "cancel_next_portable_save" }),
      );
      queue = cancelledSelection.then(() => undefined);
      await cancelledSelection;
      await nativeSaveButton.click();
      await expect(vaultExportPanel.getByRole("status")).toContainText("Saving was cancelled", {
        timeout: 30_000,
      });
      await expect(stat(selectedArchive)).rejects.toMatchObject({ code: "ENOENT" });
      expect(
        await page.evaluate(
          async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
        ),
      ).toBe(beforeSaveHash);
      await expect(verificationHistory).toContainText("No export verification observations");
      await writeFile(selectedArchive, "synthetic prior target bytes");
      let fullArchiveDownloads = 0;
      page.on("download", () => {
        fullArchiveDownloads += 1;
      });
      await nativeSaveButton.click();
      await expect(vaultExportPanel.getByRole("status")).toContainText(
        "confirmed the exact archive bytes",
        { timeout: 30_000 },
      );
      const savedBytes = new Uint8Array(await readFile(selectedArchive));
      const savedSha256 = createHash("sha256").update(savedBytes).digest("hex");
      await expect(vaultExportPanel).toContainText(savedSha256);
      await expect(vaultExportPanel).toContainText("Historical byte verification recorded");
      await expect(verificationHistory).toContainText(savedSha256);
      const savedArchive = await inspectPortableArchiveV1({
        bytes: savedBytes,
        expectedSchemaVersion: 182,
        expectedArchiveSha256: savedSha256,
      });
      expect(savedArchive.dataFiles).toHaveLength(122);
      expect(savedArchive.attachments.length).toBeGreaterThanOrEqual(1);
      expect(fullArchiveDownloads).toBe(0);
      await vaultExportPanel.screenshot({
        path: testInfo.outputPath("native-portable-save-320.png"),
      });
      const observed = await page.evaluate(
        async (vaultId) =>
          globalThis.coredrillStorageSpike.vaultExport.readVerifications({ vaultId }),
        savedArchive.manifest.vault.id,
      );
      expect(observed).toMatchObject({
        ok: true,
        value: {
          history: {
            observations: [
              {
                archiveId: savedArchive.manifest.archiveId,
                archiveCreatedAt: savedArchive.manifest.createdAt,
                schemaVersion: 182,
                byteLength: savedBytes.length,
                sha256: savedSha256,
                method: "native_readback",
              },
            ],
          },
          reminder: { enabled: false },
        },
      });
      expect(observed.value.history.observations).toHaveLength(1);
      const recordedWarning = await page.evaluate(async () =>
        globalThis.coredrillStorageSpike.prepareVaultDeletion(),
      );
      expect(recordedWarning).toMatchObject({
        ok: true,
        value: {
          lastSuccessfulPortableExportAt: observed.value.history.observations[0].verifiedAt,
        },
      });
      await page.getByRole("button", { name: "Review vault deletion", exact: true }).click();
      await page.getByRole("button", { name: "Delete local vault", exact: true }).click();
      await expect(deletionWarning).toContainText("Recorded portable export time:");
      await expect(deletionWarning).toContainText("does not prove current-vault freshness");
      await deletionWarning
        .getByRole("button", { name: "Close deletion warning", exact: true })
        .click();
      await vaultExportPanel
        .getByRole("button", { name: "Discard prepared archive", exact: true })
        .click();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.reload();
      await page.getByRole("link", { name: "Settings", exact: true }).click();
      await expect(verificationHistory).toContainText(savedSha256);
      await expect(verificationHistory.getByRole("listitem")).toHaveCount(1);
      await expect(verificationHistory).toContainText("Native saved-byte readback");
      await expect(
        verificationHistory.getByRole("button", { name: "Turn on export reminders", exact: true }),
      ).toBeVisible();
      await page.setViewportSize({ width: 320, height: 900 });
      expect(
        (await new AxeBuilder({ page }).include('[aria-label="Verified export history"]').analyze())
          .violations,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      await verificationHistory.screenshot({
        path: testInfo.outputPath("native-export-verification-history-320.png"),
      });
      const restore = page.getByRole("region", { name: "Portable vault restore", exact: true });
      await expect(restore.locator('input[type="file"]')).toHaveCount(0);
      await observeNativeRestoreReview(
        restore,
        testInfo,
        restoreOperations,
        "same_vault",
        async () => {
          await restore
            .getByRole("button", { name: "Choose archive to review", exact: true })
            .click();
          await expect(
            restore.getByRole("heading", { name: "Review exact restore changes", exact: true }),
          ).toBeVisible();
        },
      );
      await expect(restore).toContainText(savedSha256);
      await expect(restore).toContainText("Later edits not in the archive will be lost");
      expect(
        (await new AxeBuilder({ page }).include('[aria-label="Portable vault restore"]').analyze())
          .violations,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      const commitRestore = restore.getByRole("button", {
        name: "Confirm and restore reviewed archive",
        exact: true,
      });
      await expect(commitRestore).toBeDisabled();
      await restore.getByRole("checkbox").check();
      await commitRestore.click();
      await expect(restore.getByRole("status")).toContainText(
        "Restore committed and its acknowledgement validated",
      );
      const restoredOpenedAfter = Date.now();
      await restore.getByRole("button", { name: "Reload local vault", exact: true }).click();
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();
      const readRestoredArchive = async () => {
        const restoreReadback = await page.evaluate(async () => {
          const identity = await globalThis.coredrillStorageSpike.vault.inspect();
          if (!identity.ok || identity.value.vault === null)
            throw new Error("Missing restored identity");
          const result = await globalThis.coredrillStorageSpike.vaultExport.prepare({
            vaultId: identity.value.vault.id,
            acknowledgeUnencrypted: true,
          });
          if (!result.ok) throw new Error("Cannot inspect restored archive");
          return Array.from(result.value.bytes);
        });
        return inspectPortableArchiveV1({
          bytes: new Uint8Array(restoreReadback),
          expectedSchemaVersion: 182,
        });
      };
      const restoredArchive = await readRestoredArchive();
      expectRestoredPortableContent(restoredArchive, savedArchive, [
        restoredOpenedAfter,
        Date.now(),
      ]);
      // Keep the diagnostic host's explicit no-vault-deletion policy. A second
      // actual Rust process uses a new empty managed root; the source vault remains intact.
      await page.route("**/__native_restore_host_switch__", (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><html lang='en'><title>Synthetic native host switch</title></html>",
        }),
      );
      await page.goto("/__native_restore_host_switch__");
      await queue;
      child.stdin.end();
      await stopped;
      const sourceDatabasePath = path.join(managedRoot, "databases", "coredrill.sqlite3");
      const preservedSourceDatabaseSha256 = createHash("sha256")
        .update(await readFile(sourceDatabasePath))
        .digest("hex");
      const cleanManagedRoot = path.join(temporaryRoot, "clean-managed");
      child = spawn(executable, [cleanManagedRoot, selectedArchive, selectedArchive], {
        windowsHide: true,
        stdio: "pipe",
      });
      stopped = once(child, "exit");
      lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
      if (activeDocumentId !== undefined) retiredDocuments.add(activeDocumentId);
      activeDocumentId = undefined;
      expect(
        createHash("sha256")
          .update(await readFile(selectedArchive))
          .digest("hex"),
      ).toBe(savedSha256);
      await page.goto("/");
      await page
        .getByRole("button", { name: "Restore an existing archive instead", exact: true })
        .click();
      await observeNativeRestoreReview(
        restore,
        testInfo,
        restoreOperations,
        "empty_target",
        async () => {
          await restore
            .getByRole("button", { name: "Choose archive to review", exact: true })
            .click();
          await expect(
            restore.getByRole("heading", { name: "Review exact restore changes", exact: true }),
          ).toBeVisible();
        },
      );
      await expect(restore).toContainText("Empty target (no vault identity)");
      expect(
        (await page.evaluate(async () => globalThis.coredrillStorageSpike.vault.inspect())).value
          .vault,
      ).toBeNull();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expect(commitRestore).toBeDisabled();
      await restore.getByRole("checkbox").check();
      await commitRestore.click();
      await expect(restore.getByRole("status")).toContainText(
        "Restore committed and its acknowledgement validated",
      );
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      const cleanOpenedAfter = Date.now();
      await restore.getByRole("button", { name: "Reload local vault", exact: true }).click();
      await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();
      expectRestoredPortableContent(await readRestoredArchive(), savedArchive, [
        cleanOpenedAfter,
        Date.now(),
      ]);
      expect(
        (await stat(path.join(cleanManagedRoot, "databases", "coredrill.sqlite3"))).isFile(),
      ).toBe(true);
      expect(
        createHash("sha256")
          .update(await readFile(sourceDatabasePath))
          .digest("hex"),
      ).toBe(preservedSourceDatabaseSha256);
      Object.assign(journeyProof, {
        normalNativeCleanArchiveRestoreProven: true,
        nativeSourceVaultPreserved: true,
        nativeCleanTarget: "fresh managed root in a second real Rust host; source vault preserved",
        normalNativeArchiveRestoreProven: true,
        nativeRestoreExactDataFiles: restoredArchive.dataFiles.length,
        nativeRestoreExactAttachments: restoredArchive.attachments.length,
        nativeRestorePicker:
          "simulated host selection; actual Rust bounded read and atomic native commit",
        nativeRetainedDocxSha256: hash,
        vaultExportPreparation,
        normalSettingsPreparation: true,
        normalNativeArchiveSaveProven: true,
        nativePortableSavedSha256: savedSha256,
        nativeSaveCancellationProven: true,
        nativeSavePicker: "simulated host selection; real Rust file publication/readback",
        nativeSaveUsedBrowserDownload: false,
        nativeSaveNarrowReflow: true,
        nativeSaveAutomatedAxeViolations: 0,
        nativeVerificationHistoryPersisted: true,
        nativeDisabledReminderPreserved: true,
        nativeDeletionWarningExportHandoff: true,
        diagnosticVaultDeleteDispatchDenied: true,
        nativeWarningReadsCanonicalRecordedInstant: true,
      });
    }
    const capabilities = await page.evaluate(() => ({
      calls: globalThis.coredrillBrowserCapabilityProbe,
      offline: globalThis.coredrillOfflineShell.getState(),
    }));
    expect(capabilities.calls).toEqual({ opfs: 0, persistent: 0, serviceWorker: 0, worker: 0 });
    expect(capabilities.offline.registered).toBe(false);
    expect(invocations).toBeGreaterThan(100);
    expect((await stat(path.join(managedRoot, "databases", "coredrill.sqlite3"))).isFile()).toBe(
      true,
    );
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
    await testInfo.attach("native-runtime-proof.json", {
      body: JSON.stringify(
        {
          host: "simulated Tauri IPC",
          backend: "real Rust SQLite process",
          packagedWebviewProven: false,
          seededRecords: [
            "legacy",
            "legacy164",
            "legacy165",
            "legacy167",
            "current182",
            "history",
            "evidence",
          ].includes(journey),
          journey,
          invocations,
          ...journeyProof,
          heldBeginAcknowledgements: heldAcknowledgements,
          retiredDocuments: retiredDocuments.size,
          capabilities,
          externalRequests: external.length,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
  } finally {
    releaseHeldBegin();
    await page.close();
    await queue;
    child.stdin.end();
    await stopped;
    const actual = await realpath(temporaryRoot);
    const temp = await realpath(tmpdir());
    if (
      !actual.startsWith(`${temp}${path.sep}`) ||
      !path.basename(actual).startsWith("coredrill-native-ui-")
    )
      throw new Error("Unsafe native proof cleanup target");
    await rm(actual, { recursive: true });
  }
};

for (const [journey, description] of [
  ["network", "stored company directory, creation, notes, contact APIs and owned recovery"],
  ["tracking", "capture, tasks, status, source comparison and notes"],
  ["documents", "documents and complete archive cancellation/save"],
  ["legacy", "reviewed schema160 archive restore and deliberate schema182 reopen"],
  ["legacy164", "reviewed schema164 archive restore and deliberate schema182 reopen"],
  ["legacy165", "reviewed schema165 archive restore and deliberate schema182 reopen"],
  ["legacy167", "reviewed schema167 archive restore and deliberate schema182 reopen"],
  ["current182", "reviewed schema182 archive restore and deliberate schema182 reopen"],
  ["history", "recorded contact history from a disclosed synthetic archive"],
  ["evidence", "contact field source evidence from a disclosed synthetic archive"],
]) {
  test(`normal root uses real native SQLite for ${description} without OPFS fallback`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await exerciseNativeJourney(page, testInfo, journey);
  });
}

test("native IPC failure shows retry without browser storage fallback", async ({ page }) => {
  await attachNativeHost(page, () => {
    throw new Error("synthetic private native detail");
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Local vault unavailable", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry local vault", exact: true })).toBeVisible();
  await expect(page.getByText("synthetic private native detail", { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.coredrillBrowserCapabilityProbe)).toEqual({
    opfs: 0,
    persistent: 0,
    serviceWorker: 0,
    worker: 0,
  });
});
