import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";
import { exerciseStoredListingComparison } from "./listing-comparison-journey.mjs";

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

/** Simulated host IPC only: every database operation runs in the actual Rust process. */
const attachNativeHost = async (page, invoke) => {
  await page.exposeFunction("coredrillNativeProofInvoke", invoke);
  await page.addInitScript(() => {
    globalThis.isTauri = true;
    const documentId = crypto.randomUUID();
    globalThis.__TAURI_INTERNALS__ = {
      invoke: (command, args) => globalThis.coredrillNativeProofInvoke(command, args, documentId),
    };
    const calls = { opfs: 0, persistent: 0, serviceWorker: 0, worker: 0 };
    globalThis.coredrillBrowserCapabilityProbe = calls;
    navigator.storage.getDirectory = async () => {
      calls.opfs += 1;
      throw new Error("OPFS forbidden in native proof");
    };
    navigator.storage.persist = async () => {
      calls.persistent += 1;
      throw new Error("Browser persistence forbidden");
    };
    navigator.serviceWorker.register = async () => {
      calls.serviceWorker += 1;
      throw new Error("Browser SW forbidden");
    };
    globalThis.Worker = class {
      constructor() {
        calls.worker += 1;
        throw new Error("Browser worker forbidden");
      }
    };
  });
};

test("normal root uses real native SQLite for capture and documents without OPFS fallback", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "coredrill-native-ui-"));
  const child = spawn(executable, [temporaryRoot], { windowsHide: true, stdio: "pipe" });
  const stopped = once(child, "exit");
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let queue = Promise.resolve();
  let invocations = 0;
  let activeDocumentId;
  const retiredDocuments = new Set();
  let holdNextBegin = false;
  let heldAcknowledgements = 0;
  let releaseHeldBegin = () => undefined;
  const send = async (request) => {
    invocations += 1;
    child.stdin.write(`${JSON.stringify(request)}\n`);
    const line = await lines.next();
    if (line.done) throw new Error("Native proof process stopped");
    const envelope = JSON.parse(line.value);
    if (!envelope.ok) throw envelope.error;
    return envelope.response;
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
    await attachNativeHost(page, (command, args, documentId) => {
      if (!["native_storage_invoke", "native_archive_invoke"].includes(command))
        throw new Error("Unexpected native command");
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
    const statusActions = page.getByRole("region", { name: "Local status changes", exact: true });
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
    await page.getByRole("button", { name: "Synthetic native movable role", exact: true }).click();
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
    await expect(history.locator("[data-timeline-id]")).toHaveCount(1);
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
      const snapshots = await globalThis.coredrillStorageSpike.pipeline.sourceSnapshots({ jobId });
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
    await derivative.getByRole("button", { name: "Create job-specific copy", exact: true }).click();
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
        path.join(temporaryRoot, "attachments", "sha256", hash.slice(0, 2), hash.slice(2, 4), hash),
      ),
    ).toEqual(bytes);
    await page.reload();
    await expect(preparation).toContainText("Ready for export review");
    const listingComparison = await exerciseStoredListingComparison(page);
    const capabilities = await page.evaluate(() => ({
      calls: globalThis.coredrillBrowserCapabilityProbe,
      offline: globalThis.coredrillOfflineShell.getState(),
    }));
    expect(capabilities.calls).toEqual({ opfs: 0, persistent: 0, serviceWorker: 0, worker: 0 });
    expect(capabilities.offline.registered).toBe(false);
    expect(invocations).toBeGreaterThan(100);
    expect((await stat(path.join(temporaryRoot, "databases", "coredrill.sqlite3"))).isFile()).toBe(
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
          seededRecords: false,
          invocations,
          nativeRetainedDocxSha256: hash,
          listingComparison,
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
});

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
