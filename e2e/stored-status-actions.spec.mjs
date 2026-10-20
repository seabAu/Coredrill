import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";
import { exerciseWorkspaceStatusLifetime } from "./workspace-status-lifetime.mjs";

test.use({ trace: "retain-on-failure" });

const expectOwnedEditFocus = async (target) => {
  try {
    await expect(target).toBeFocused();
  } catch (error) {
    const witness = await target
      .evaluate((element) => {
        const active = document.activeElement;
        return {
          expectedConnected: element.isConnected,
          expectedIsActive: active === element,
          documentHasFocus: document.hasFocus(),
          activeIsBody: active === document.body,
          activeInTable: (active?.closest('[data-testid="pipeline-table"]') ?? null) !== null,
          activeIsInput: active instanceof HTMLInputElement,
          activeIsButton: active instanceof HTMLButtonElement,
        };
      })
      .catch(() => ({ witnessUnavailable: true }));
    console.info(`STATUS_EDIT_FOCUS_FAILURE_WITNESS ${JSON.stringify(witness)}`);
    throw error;
  }
};

const workOffline = async (page, context) => {
  await page.waitForFunction(
    () => globalThis.coredrillOfflineShell?.getState().registered === true,
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
};

const addJob = async (page, title) => {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add job/u }).click();
  const capture = page.getByRole("dialog");
  await capture.getByLabel(/Job title/u).fill(title);
  await capture.getByLabel(/Company/u).fill("Synthetic Status Lab");
  await capture
    .getByLabel(/Notes or listing details/u)
    .fill("Synthetic offline status integration fixture.");
  await capture.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
  await capture.getByRole("button", { name: "Close capture dialog" }).click();
  await page.locator('[data-pipeline-view-option="inbox"]').click();
  const review = page.getByTestId("capture-review");
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await review.getByRole("button", { name: "Save as new job" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
  await page.locator('[data-pipeline-view-option="board"]').click();
};

test("header status drafts retain ownership and focus across pending writes and job navigation", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await workOffline(page, context);
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Pipeline", exact: true })
    .click();
  const proof = await exerciseWorkspaceStatusLifetime(page, addJob, testInfo);
  expect(errors).toEqual([]);
  await testInfo.attach("header-status-lifetime-proof.json", {
    body: JSON.stringify({ ...proof, offline: true, seededRecords: false }),
    contentType: "application/json",
  });
});

test("normal Job header changes status with owned draft, canonical readback and reachable undo offline", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await workOffline(page, context);
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Pipeline", exact: true })
    .click();
  await addJob(page, "Header stage owner");
  await page.getByRole("button", { name: "Header stage owner", exact: true }).click();
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  const preparation = page.getByRole("form", { name: "Start local application preparation" });
  await preparation.getByLabel("Preparation stage name").fill("Header drafting");
  await preparation.getByRole("button", { name: "Start preparation locally" }).click();
  await expect(page.locator('[data-preparation-status="missing"]')).toBeVisible();
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  await addJob(page, "Header movable job");
  await page.getByRole("button", { name: "Header movable job", exact: true }).click();
  const jobId = new URL(page.url()).pathname.split("/")[2];
  const header = page.locator(".cd-job-workspace-header");
  const change = header.getByRole("button", { name: "Change status", exact: true });
  const form = page.getByRole("form", { name: "Change local job status", exact: true });
  const stage = form.getByLabel("New local stage", { exact: true });
  await change.click();
  await expect(stage).toBeFocused();
  await stage.selectOption({ label: "Header drafting" });
  // A peer-view write may invalidate, but must never rebase, an open header draft.
  await page
    .getByRole("combobox", { name: "Move Header movable job to stage", exact: true })
    .selectOption({ label: "Header drafting" });
  await expect(form.getByRole("alert")).toContainText("This job changed since this draft opened");
  await expect(form.getByRole("button", { name: "Save local status", exact: true })).toBeDisabled();
  await form.getByRole("button", { name: "Cancel status draft", exact: true }).click();
  await page
    .getByRole("button", { name: "Undo status change for Header movable job", exact: true })
    .click();
  await expect(header.locator(".cd-job-workspace-context")).toContainText("Unassigned");
  await change.click();
  await stage.selectOption({ label: "Header drafting" });
  await page.evaluate(() => {
    const original = globalThis.coredrillStorageSpike;
    globalThis.headerStatusOriginal = original;
    globalThis.coredrillStorageSpike = {
      ...original,
      pipelineMutations: {
        ...original.pipelineMutations,
        changeStatus: async () => {
          throw new Error("SYNTHETIC_PRIVATE_STATUS_PATH");
        },
      },
    };
  });
  await form.getByRole("button", { name: "Save local status", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("could not be confirmed");
  await expect(form.getByRole("alert")).toBeFocused();
  await expect(stage.locator("option:checked")).toHaveText("Header drafting");
  await expect(header.locator(".cd-job-workspace-context")).toContainText("Unassigned");
  await expect(page.getByText("SYNTHETIC_PRIVATE_STATUS_PATH", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry status move", exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    globalThis.coredrillStorageSpike = globalThis.headerStatusOriginal;
  });
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(stage.locator("option:checked")).toHaveText("Header drafting");
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(stage.locator("option:checked")).toHaveText("Header drafting");
  await form.getByRole("button", { name: "Save local status", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(change).toBeFocused();
  await expect(header.locator(".cd-job-workspace-context")).toContainText("Header drafting");
  const changes = page.getByRole("region", { name: "Local status changes", exact: true });
  await expect(changes).toHaveCount(1);
  await expect(changes.getByRole("status")).toContainText("Saved Header movable job");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Stored job overview", exact: true }),
  ).toContainText("Header drafting");
  const saved = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
    jobId,
  );
  expect(saved.ok).toBe(true);
  expect(saved.value.job.status.name).toBe("Header drafting");
  await changes
    .getByRole("button", { name: "Undo status change for Header movable job", exact: true })
    .click();
  await expect(changes.getByRole("status")).toContainText("Restored Header movable job");
  await expect(header.locator(".cd-job-workspace-context")).toContainText("Unassigned");
  await expect(
    page.getByRole("region", { name: "Stored job overview", exact: true }),
  ).not.toContainText("Header drafting");
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  expect(
    (await new AxeBuilder({ page }).include(".cd-job-workspace").analyze()).violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("header-status-undo-320.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(header.locator(".cd-job-workspace-context")).toContainText("Unassigned");
  const reloaded = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
    jobId,
  );
  expect(reloaded.value.job.status).toBeNull();
  expect(errors).toEqual([]);
});

test("reviewed submission survives normal terminal moves, reopen cancellation, confirmation and undo", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(10_000);
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  // Explicit synthetic documents/stages only. The separate job and its sole
  // application are created below through normal capture/preparation actions.
  await page.evaluate(() =>
    globalThis.coredrillStorageSpike.installDocumentsWorkspaceReferenceFixture(),
  );
  await workOffline(page, context);
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Pipeline", exact: true })
    .click();
  await addJob(page, "Synthetic submission status role");
  await page
    .getByTestId("pipeline-board")
    .getByRole("button", { name: "Synthetic submission status role", exact: true })
    .click();
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  const jobId = new URL(page.url()).pathname.split("/")[2];
  const start = page.getByRole("form", { name: "Start local application preparation" });
  await start.getByLabel("Preparation stage name").fill("Preparing application");
  await start.getByRole("button", { name: "Start preparation locally" }).click();
  const preparation = page.locator(".cd-job-document-preparation");
  await preparation
    .getByLabel("Exact resume version *")
    .selectOption("0199b300-0000-7000-8000-00000000000b");
  await preparation.getByRole("button", { name: "Save exact selections", exact: true }).click();
  await expect(preparation).toContainText("Ready for export review");
  const submission = preparation.getByRole("region", { name: "Mark Applied", exact: true });
  await submission
    .getByRole("group", { name: "Exact submitted set" })
    .locator("select")
    .selectOption("plain_text");
  await submission.getByLabel("Applied status").selectOption({ label: "Reference applied" });
  await submission.getByLabel("Application channel").fill("Synthetic manual submission");
  await submission
    .getByRole("checkbox", { name: /I confirm that I submitted these exact versions/u })
    .check();
  await submission
    .getByRole("button", { name: "Mark Applied and freeze submitted set", exact: true })
    .click();
  await expect(
    preparation.getByRole("region", { name: "Immutable submitted snapshot" }),
  ).toBeVisible();
  const original = await page.evaluate(async (id) => {
    const workspace = await globalThis.coredrillStorageSpike.pipeline.workspace({ jobId: id });
    const application = workspace.value.application;
    const review = await globalThis.coredrillStorageSpike.loadApplicationSubmissionReview(
      application.id,
    );
    return { application, snapshot: review.value.snapshot };
  }, jobId);
  // This workspace still holds the older submission review. The header must
  // follow acknowledged canonical status, not that cached review's label.
  await page.getByRole("button", { name: "Change status", exact: true }).click();
  const headerEditor = page.getByRole("form", { name: "Change local job status", exact: true });
  await headerEditor
    .getByLabel("New local stage", { exact: true })
    .selectOption({ label: "Reference closed" });
  await headerEditor.getByRole("button", { name: "Save local status", exact: true }).click();
  await expect(headerEditor).toHaveCount(0);
  await expect(page.locator(".cd-job-workspace-context")).toContainText("Reference closed");
  await page.getByRole("button", { name: "Change status", exact: true }).click();
  await headerEditor
    .getByLabel("New local stage", { exact: true })
    .selectOption({ label: "Preparing application" });
  await expect(
    headerEditor.getByRole("button", { name: "Save local status", exact: true }),
  ).toBeDisabled();
  await headerEditor.getByRole("checkbox", { name: /I explicitly confirm reopening/u }).check();
  await expect(
    headerEditor.getByRole("button", { name: "Save local status", exact: true }),
  ).toBeEnabled();
  await headerEditor.getByRole("button", { name: "Cancel status draft", exact: true }).click();
  await expect(page.locator(".cd-job-workspace-context")).toContainText("Reference closed");
  await page
    .getByRole("button", {
      name: "Undo status change for Synthetic submission status role",
      exact: true,
    })
    .click();
  await expect(page.locator(".cd-job-workspace-context")).toContainText("Reference applied");
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  const board = page.getByTestId("pipeline-board");
  const move = board.getByRole("combobox", {
    name: "Move Synthetic submission status role to stage",
  });
  const changes = page.getByRole("region", { name: "Local status changes", exact: true });
  await move.selectOption({ label: "Reference closed" });
  await expect(changes.getByRole("status")).toContainText("Saved Synthetic submission status role");
  await expect(move).toBeFocused();
  await move.selectOption({ label: "Preparing application" });
  const reopen = changes.getByRole("region", { name: "Review reopening this job", exact: true });
  await expect(reopen.getByRole("heading")).toBeFocused();
  await expect(move.locator("option:checked")).toHaveText("Reference closed");
  await reopen.getByRole("button", { name: "Cancel reopening", exact: true }).click();
  await expect(move).toBeFocused();
  await expect(move.locator("option:checked")).toHaveText("Reference closed");
  await move.selectOption({ label: "Preparing application" });
  await expect(reopen.getByRole("heading")).toBeFocused();
  await page.locator('[data-pipeline-view-option="table"]').click();
  await reopen.getByRole("button", { name: "Cancel reopening", exact: true }).click();
  await expect(changes.getByRole("status")).toBeFocused();
  await page.locator('[data-pipeline-view-option="board"]').click();
  await expect(move.locator("option:checked")).toHaveText("Reference closed");
  await move.selectOption({ label: "Preparing application" });
  await reopen.getByRole("button", { name: "Confirm reopen and move", exact: true }).click();
  await expect(changes.getByRole("status")).toContainText(
    "Saved Synthetic submission status role in Preparing application",
  );
  await changes
    .getByRole("button", {
      name: "Undo status change for Synthetic submission status role",
      exact: true,
    })
    .first()
    .click();
  await expect(changes.getByRole("status")).toContainText(
    "Restored Synthetic submission status role",
  );
  await expect(move.locator("option:checked")).toHaveText("Reference closed");
  await move.selectOption({ label: "Reference applied" });
  await page.locator('[data-pipeline-view-option="table"]').click();
  await reopen.getByRole("button", { name: "Confirm reopen and move", exact: true }).click();
  await expect(changes.getByRole("status")).toContainText(
    "Saved Synthetic submission status role in Reference applied",
  );
  await expect(changes.getByRole("status")).toBeFocused();
  const current = await page.evaluate(
    async (id) => ({
      workspace: await globalThis.coredrillStorageSpike.pipeline.workspace({ jobId: id.jobId }),
      review: await globalThis.coredrillStorageSpike.loadApplicationSubmissionReview(
        id.applicationId,
      ),
    }),
    { jobId, applicationId: original.application.id },
  );
  expect(current.review.value.snapshot).toEqual(original.snapshot);
  for (const key of [
    "appliedAt",
    "channel",
    "selectedResumeVersionId",
    "selectedCoverLetterVersionId",
  ]) {
    expect(current.workspace.value.application[key]).toEqual(original.application[key]);
  }
});

test("normal user-created stages support durable Board/Table status changes and undo offline", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await workOffline(page, context);
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Pipeline", exact: true })
    .click();
  await addJob(page, "Synthetic stage owner");
  await page
    .getByTestId("pipeline-board")
    .getByRole("button", { name: "Synthetic stage owner", exact: true })
    .click();
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  const preparation = page.getByRole("form", { name: "Start local application preparation" });
  await preparation.getByLabel("Preparation stage name").fill("My deliberate drafting stage");
  await preparation.getByRole("button", { name: "Start preparation locally" }).click();
  await expect(page.locator('[data-preparation-status="missing"]')).toBeVisible();
  const appliedStage = page.getByRole("form", { name: "Create local Applied stage", exact: true });
  await appliedStage
    .getByLabel("Applied stage name", { exact: true })
    .fill("My reviewed submission stage");
  await appliedStage
    .getByRole("button", { name: "Create Applied stage locally", exact: true })
    .click();
  await expect(appliedStage).toContainText("Created Applied stage: My reviewed submission stage");
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  await addJob(page, "Synthetic movable role");
  const board = page.getByTestId("pipeline-board");
  const move = board.getByRole("combobox", { name: "Move Synthetic movable role to stage" });
  const changes = page.getByRole("region", { name: "Local status changes", exact: true });
  await move.selectOption({ label: "My reviewed submission stage" });
  await expect(changes.getByRole("alert")).toContainText("No status was changed");
  await expect(board.locator('[data-board-unassigned="true"] [data-board-job]')).toHaveCount(1);
  await changes.getByRole("button", { name: "Review Mark Applied", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]{36}\/documents$/u);
  await expect(preparation).toBeVisible();
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  await move.selectOption({ label: "My deliberate drafting stage" });
  await expect(changes.getByRole("status")).toContainText("Saved Synthetic movable role");
  await expect(board.locator('[data-board-unassigned="true"] [data-board-job]')).toHaveCount(0);
  await page.locator('[data-pipeline-view-option="table"]').click();
  const table = page.getByTestId("pipeline-table");
  await expect(
    table.getByRole("button", { name: "Edit priority for Synthetic movable role" }),
  ).toHaveCount(0);
  await expect(
    changes.getByRole("button", {
      name: "Undo status change for Synthetic movable role",
      exact: true,
    }),
  ).toBeVisible();
  // A later user action, not an automatic timeout, consumes the durable token.
  await page.waitForTimeout(10_100);
  await changes
    .getByRole("button", { name: "Undo status change for Synthetic movable role", exact: true })
    .click();
  await expect(changes.getByRole("status")).toContainText("Restored Synthetic movable role");
  const row = table
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name: "Synthetic movable role", exact: true }) });
  await expect(row).toContainText("Unassigned");
  await row.getByRole("button", { name: "Synthetic movable role", exact: true }).click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  const history = page.getByRole("region", { name: "Stored job timeline", exact: true });
  await expect(history).toContainText("My deliberate drafting stage");
  await expect(history).toContainText("Reversed by a recorded undo");
  await expect(history.locator("[data-timeline-id]")).toHaveCount(1);
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  await table
    .getByRole("button", { name: "Edit status for Synthetic movable role", exact: true })
    .click();
  await table
    .getByLabel("Status for Synthetic movable role", { exact: true })
    .selectOption({ label: "My deliberate drafting stage" });
  await table.getByRole("button", { name: "Save", exact: true }).click();
  await expect(changes.getByRole("status")).toContainText("Saved Synthetic movable role");
  await expect(row).toContainText("My deliberate drafting stage");
  await changes
    .getByRole("button", { name: "Undo status change for Synthetic movable role", exact: true })
    .click();
  await expect(changes.getByRole("status")).toContainText("Restored Synthetic movable role");
  await expect(row).toContainText("Unassigned");
  // Fault injection only: normal UI above creates every canonical job and stage.
  await page.evaluate(() => {
    const api = globalThis.coredrillStorageSpike;
    globalThis.coredrillStatusFault = { api, calls: 0, release: null };
    globalThis.coredrillStorageSpike = {
      ...api,
      pipelineMutations: {
        ...api.pipelineMutations,
        changeStatus: async () => {
          globalThis.coredrillStatusFault.calls += 1;
          await new Promise((resolve) => {
            globalThis.coredrillStatusFault.release = resolve;
          });
          return {
            ok: false,
            error: {
              code: "unavailable",
              message: "Synthetic write temporarily unavailable.",
              retryable: true,
            },
          };
        },
      },
    };
  });
  await table
    .getByRole("button", { name: "Edit status for Synthetic movable role", exact: true })
    .click();
  const editor = table.getByLabel("Status for Synthetic movable role", { exact: true });
  await editor.selectOption({ label: "My deliberate drafting stage" });
  await table.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => globalThis.coredrillStatusFault.release !== null);
  await expect(editor).toBeDisabled();
  await expect(table.getByRole("button", { name: "Saving locally…", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => globalThis.coredrillStatusFault.calls)).toBe(1);
  const heldJobId = await row.getAttribute("data-table-job");
  const heldState = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
    heldJobId,
  );
  expect(heldState.ok).toBe(true);
  expect(heldState.value.job.status).toBeNull();
  await page.evaluate(() => {
    globalThis.coredrillStorageSpike = globalThis.coredrillStatusFault.api;
    globalThis.coredrillStatusFault.release();
  });
  await expect(editor).toBeEnabled();
  await expect(row.getByRole("alert")).toContainText("Synthetic write temporarily unavailable.");
  await expect(editor.locator("option:checked")).toHaveText("My deliberate drafting stage");
  await table.getByRole("button", { name: "Save", exact: true }).click();
  await expect(changes.getByRole("status")).toContainText("Saved Synthetic movable role");
  await expect(table.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  // A fresh SQLite projection must not silently rebind an already-open draft.
  await table
    .getByRole("button", { name: "Edit status for Synthetic movable role", exact: true })
    .click();
  await changes
    .getByRole("button", { name: "Undo status change for Synthetic movable role", exact: true })
    .click();
  await expect(changes.getByRole("status")).toContainText("Restored Synthetic movable role");
  await expect(row.getByRole("note")).toContainText("changed since editing began");
  await expect(table.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await table.getByRole("button", { name: "Cancel", exact: true }).click();
  await expectOwnedEditFocus(
    table.getByRole("button", { name: "Edit status for Synthetic movable role", exact: true }),
  );
  await expect(row).toContainText("Unassigned");
  await table
    .getByRole("button", { name: "Edit status for Synthetic movable role", exact: true })
    .click();
  await editor.selectOption({ label: "My deliberate drafting stage" });
  await table.getByRole("button", { name: "Save", exact: true }).click();
  await expect(changes.getByRole("status")).toContainText("Saved Synthetic movable role");
  // Verify the interaction before axe opens/closes its separate finishRun page.
  await expectOwnedEditFocus(
    table.getByRole("button", { name: "Edit status for Synthetic movable role", exact: true }),
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  // A delayed acknowledgement must not pull focus out of an intentional search.
  await changes
    .getByRole("button", { name: "Undo status change for Synthetic movable role", exact: true })
    .click();
  await expect(changes.getByRole("status")).toContainText("Restored Synthetic movable role");
  await page.evaluate(() => {
    const api = globalThis.coredrillStorageSpike;
    globalThis.coredrillHeldStatusSuccess = { api, release: null };
    globalThis.coredrillStorageSpike = {
      ...api,
      pipelineMutations: {
        ...api.pipelineMutations,
        changeStatus: async (input) => {
          await new Promise((resolve) => {
            globalThis.coredrillHeldStatusSuccess.release = resolve;
          });
          return api.pipelineMutations.changeStatus(input);
        },
      },
    };
  });
  await table
    .getByRole("button", { name: "Edit status for Synthetic movable role", exact: true })
    .click();
  await editor.selectOption({ label: "My deliberate drafting stage" });
  await table.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => globalThis.coredrillHeldStatusSuccess.release !== null);
  const search = page.getByRole("searchbox", { name: "Search jobs and companies", exact: true });
  await search.fill("Synthetic");
  await expect(search).toBeFocused();
  await page.evaluate(() => {
    globalThis.coredrillStorageSpike = globalThis.coredrillHeldStatusSuccess.api;
    globalThis.coredrillHeldStatusSuccess.release();
  });
  await expect(changes.getByRole("status")).toContainText("Saved Synthetic movable role");
  await expect(search).toBeFocused();
  await expect(row).toContainText("My deliberate drafting stage");
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ forcedColors: "active" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("stored-status-undo-320-forced-colors.png"),
    fullPage: true,
  });
  await page.emulateMedia({ forcedColors: "none" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(
    () => globalThis.coredrillOfflineShell?.getState().registered === true,
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(
    table.getByRole("button", { name: "Synthetic movable role", exact: true }),
  ).toBeVisible();
  await expect(row).toContainText("My deliberate drafting stage");
  await page.locator('[data-pipeline-view-option="board"]').click();
  await expect(board.locator('[data-board-unassigned="true"] [data-board-job]')).toHaveCount(0);
  await expect(move).toHaveValue(
    await move
      .locator("option")
      .filter({ hasText: "My deliberate drafting stage" })
      .getAttribute("value"),
  );
  expect(errors).toEqual([]);
});
