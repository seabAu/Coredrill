import { writeFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const openShell = async (page, options = {}) => {
  const parameters = new URLSearchParams(options).toString();
  await page.goto(`/app-shell.html${parameters.length > 0 ? `?${parameters}` : ""}`);
  await expect(page.getByTestId("page-title")).toHaveText("Keep the next move clear");
  await page.waitForFunction(() => globalThis.coredrillAppShell !== undefined);
};

const attachProof = async (page, testInfo, name) => {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ fullPage: true, path: screenshotPath });
  await testInfo.attach(`${name}.png`, { path: screenshotPath, contentType: "image/png" });
};

const attachAxe = async (page, testInfo, name) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  const axePath = testInfo.outputPath(`${name}-axe.json`);
  await writeFile(axePath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  await testInfo.attach(`${name}-axe.json`, { path: axePath, contentType: "application/json" });
};

const attachAriaSnapshot = async (locator, testInfo, name) => {
  const snapshot = await locator.ariaSnapshot();
  const snapshotPath = testInfo.outputPath(`${name}-aria.yml`);
  await writeFile(snapshotPath, `${snapshot}\n`, "utf8");
  await testInfo.attach(`${name}-aria.yml`, {
    path: snapshotPath,
    contentType: "text/yaml",
  });
};

test("runs and records the complete accountless browser recovery journey", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/app-shell.html?journey=phase-1");
  await page.waitForFunction(
    () =>
      globalThis.coredrillAppShell !== undefined &&
      globalThis.coredrillCanonicalJourney !== undefined,
  );

  await expect(page.getByTestId("page-title")).toHaveText("Accountless recovery journey");
  await expect(page.getByLabel("Journey boundaries")).toContainText("No account");
  await expect(page.getByLabel("Journey boundaries")).toContainText("No network");
  await expect(page.getByLabel("Journey boundaries")).toContainText("AI disabled");
  await page.getByRole("button", { name: "Run local journey" }).click();
  const journeyStatus = page.locator(".cd-canonical-journey").getByRole("status");
  await expect(journeyStatus).toContainText("Writing and verifying", {
    timeout: 10_000,
  });
  await expect(journeyStatus).toContainText("Canonical journey passed", {
    timeout: 120_000,
  });

  const state = await page.evaluate(() => globalThis.coredrillCanonicalJourney?.getState());
  expect(state).toMatchObject({
    status: "passed",
    proof: {
      version: 1,
      runtime: "browser",
      adapterName: "official-sqlite-wasm-opfs-sahpool",
      schemaVersion: 92,
      vaultName: "Canonical local job search",
      jobTitle: "Research Operations Lead",
      finalStage: "Interviewing",
      statusEventCount: 3,
      interviewCount: 1,
      nextActionCount: 1,
      reminderCount: 1,
      deletionStatus: "deleted",
      restoreConflict: "none",
      restoreCommitted: true,
      restoredDatabaseMatchesArchive: true,
      accountRequired: false,
      networkRequired: false,
      aiRequired: false,
    },
  });
  expect(state.proof.steps.map(({ id }) => id)).toEqual([
    "create_vault",
    "add_job",
    "move_stages",
    "schedule_interview",
    "schedule_follow_up",
    "export_archive",
    "delete_vault",
    "restore_archive",
  ]);
  expect(state.proof.contentSha256AfterRestore).toBe(state.proof.contentSha256BeforeDelete);
  expect(externalRequests).toEqual([]);

  const proofPath = testInfo.outputPath("phase-1-canonical-browser.json");
  await writeFile(proofPath, `${JSON.stringify(state.proof, null, 2)}\n`, "utf8");
  await testInfo.attach("phase-1-canonical-browser.json", {
    path: proofPath,
    contentType: "application/json",
  });
  await attachAxe(page, testInfo, "phase-1-canonical-browser");
  await attachProof(page, testInfo, "phase-1-canonical-browser");
});

test("desktop shell exposes reviewed navigation, routes, local state, and no axe violations", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openShell(page);

  const sidebar = page.getByLabel("Coredrill workspace");
  await expect(sidebar).toBeVisible();
  expect((await sidebar.boundingBox())?.width).toBe(240);
  const primary = page.getByRole("navigation", { name: "Primary" });
  for (const label of ["Home", "Pipeline", "Documents", "Career Profile", "Network", "Insights"]) {
    await expect(primary.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(primary.getByRole("link", { name: "Pipeline" })).toHaveAttribute(
    "href",
    "/pipeline?view=board",
  );
  await expect(page.getByText("Local only", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Browser vault: Job search 2026. Vault healthy/ }),
  ).toBeVisible();

  await primary.getByRole("link", { name: "Pipeline" }).click();
  await expect(page.getByTestId("page-title")).toHaveText("Pipeline");
  await expect(primary.getByRole("link", { name: "Pipeline" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await attachAxe(page, testInfo, "desktop-light-comfortable");
  await attachProof(page, testInfo, "desktop-light-comfortable");
});

test("dark compact shell and backup-due state remain accessible", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openShell(page, { density: "compact", health: "backup-due", theme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.getByRole("button", { name: /Backup due/ })).toBeVisible();
  await attachAxe(page, testInfo, "desktop-dark-compact-backup-due");
  await attachProof(page, testInfo, "desktop-dark-compact-backup-due");
});

test("browser Vault & Backup requests persistence only from the user action and keeps reminders neutral", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await page.addInitScript(() => {
    globalThis.coredrillPersistRequestCount = 0;
    const original = navigator.storage;
    const synthetic = Object.create(original);
    Object.defineProperties(synthetic, {
      estimate: { value: async () => ({ quota: 1_000, usage: 950 }) },
      persist: {
        value: async () => {
          globalThis.coredrillPersistRequestCount += 1;
          return true;
        },
      },
      persisted: { value: async () => false },
    });
    Object.defineProperty(navigator, "storage", { configurable: true, value: synthetic });
  });
  await page.setViewportSize({ width: 1280, height: 960 });
  await openShell(page, { expectedDatabase: "missing" });
  await page.getByRole("link", { name: "Settings" }).click();

  const settings = page.getByTestId("browser-vault-backup-settings");
  await expect(
    settings.getByRole("heading", { name: "Browser vault on this device" }),
  ).toBeVisible();
  await expect(settings).toContainText("http://127.0.0.1:4178");
  await expect(settings.getByText("Best-effort browser storage")).toBeVisible();
  await expect(settings.getByText("Storage space is low")).toBeVisible();
  await expect(settings.getByRole("alert")).toContainText("Expected vault database not found");
  expect(await page.evaluate(() => globalThis.coredrillPersistRequestCount)).toBe(0);
  expect(await page.evaluate(() => globalThis.coredrillAppShell?.getState())).toMatchObject({
    exportReminderState: "due",
    persistenceRequestCount: 0,
    storagePersistence: "denied",
    storageQuota: "low",
  });

  await settings.getByRole("button", { name: "Request persistent storage" }).click();
  await expect(settings.getByText("Persistent storage granted")).toBeVisible();
  expect(await page.evaluate(() => globalThis.coredrillPersistRequestCount)).toBe(1);
  expect(await page.evaluate(() => globalThis.coredrillAppShell?.getState())).toMatchObject({
    persistenceRequestCount: 1,
    storagePersistence: "granted",
  });

  await expect(settings).toContainText(
    "Coredrill will keep working if you choose to do this later",
  );
  await settings.getByRole("button", { name: "Remind me later" }).click();
  await expect(settings).toContainText("next optional export reminder is scheduled");
  await settings.getByRole("button", { name: "Turn off reminders" }).click();
  await expect(settings).toContainText("Export reminders are off");
  await settings.getByRole("button", { name: "Turn on reminders" }).click();
  await settings.getByRole("button", { name: "Export portable archive" }).click();
  await expect(page.getByRole("status")).toContainText(
    "The reminder remains due until an export succeeds",
  );

  await attachAxe(page, testInfo, "browser-vault-backup-explicit-persistence");
  await attachProof(page, testInfo, "browser-vault-backup-explicit-persistence");
  await page.setViewportSize({ width: 320, height: 800 });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await attachAxe(page, testInfo, "browser-vault-backup-mobile");
  expect(externalRequests).toEqual([]);
});

test("typed vault deletion names recovery scope, preserves export choice, and requires an exact phrase", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1280, height: 960 });
  await openShell(page);
  await page.getByRole("link", { name: "Settings" }).click();

  const deletion = page.getByTestId("vault-deletion-settings");
  await expect(deletion.getByRole("heading", { name: "Delete local vault" })).toBeVisible();
  await expect(deletion).toContainText("External portable archives are not changed");
  await deletion.getByRole("button", { name: "Delete local vault" }).click();

  const dialog = page.getByRole("dialog", { name: "Delete Job search 2026?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("There is no in-app undo");
  await expect(dialog).toContainText("Only an external portable archive can restore this vault");
  await expect(dialog).toContainText("Coredrill cannot verify that an exported file still exists");
  await expect(dialog).toContainText("0 attachment files");
  await expect(dialog).toContainText("0 managed automatic backups");
  await expect(dialog).toContainText("0 vault-scoped provider keys");
  await expect(dialog).toContainText("other vaults are preserved");
  expect(
    await page.evaluate(() =>
      document.activeElement?.classList.contains("cd-vault-deletion-warning"),
    ),
  ).toBe(true);

  const confirmation = dialog.getByLabel(/Type DELETE Job search 2026 to continue/);
  const finalDelete = dialog.getByRole("button", { name: "Delete local vault" });
  await expect(finalDelete).toBeDisabled();
  await confirmation.fill("delete Job search 2026");
  await expect(finalDelete).toBeDisabled();
  await confirmation.fill("DELETE Job search 2026 ");
  await expect(finalDelete).toBeDisabled();

  await dialog.getByRole("button", { name: "Export portable archive" }).click();
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => globalThis.coredrillAppShell?.getState())).toMatchObject({
    lastActivity:
      "Portable archive export selected from the deletion warning. Deletion remains pending.",
    vaultDeleted: false,
    vaultDeletionSubmitCount: 0,
  });

  await confirmation.fill("DELETE Job search 2026");
  await expect(finalDelete).toBeEnabled();
  await attachAxe(page, testInfo, "vault-deletion-confirmation");
  await page.setViewportSize({ width: 320, height: 800 });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await attachProof(page, testInfo, "vault-deletion-mobile");
  await finalDelete.click();

  await expect(page.getByRole("heading", { name: "Local vault deleted" })).toBeVisible();
  await expect(
    page.getByText("The local vault was deleted. External portable archives were not changed.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => globalThis.coredrillAppShell?.getState())).toMatchObject({
    vaultDeleted: true,
    vaultDeletionStatus: "deleted",
    vaultDeletionSubmitCount: 1,
  });
  expect(externalRequests).toEqual([]);
});

test("vault deletion failure keeps the target visible and explains credential recovery", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openShell(page, { deletion: "failure" });
  await page.getByRole("link", { name: "Settings" }).click();
  await page
    .getByTestId("vault-deletion-settings")
    .getByRole("button", { name: "Delete local vault" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Delete Job search 2026?" });
  await dialog.getByLabel(/Type DELETE Job search 2026 to continue/).fill("DELETE Job search 2026");
  await dialog.getByRole("button", { name: "Delete local vault" }).click();

  await expect(dialog.getByRole("alert")).toContainText(
    "The vault was restored after local cleanup failed",
  );
  await expect(dialog.getByRole("alert")).toContainText("credentials may need to be entered again");
  expect(await page.evaluate(() => globalThis.coredrillAppShell?.getState())).toMatchObject({
    vaultDeleted: false,
    vaultDeletionSubmitCount: 1,
  });
  await attachAxe(page, testInfo, "vault-deletion-failure");
});

test("vault deletion cleanup-pending state clears the target without claiming a clean purge", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await openShell(page, { deletion: "cleanup" });
  await page.getByRole("link", { name: "Settings" }).click();
  await page
    .getByTestId("vault-deletion-settings")
    .getByRole("button", { name: "Delete local vault" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Delete Job search 2026?" });
  await dialog.getByLabel(/Type DELETE Job search 2026 to continue/).fill("DELETE Job search 2026");
  await dialog.getByRole("button", { name: "Delete local vault" }).click();

  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Local vault deleted; cleanup pending" }),
  ).toBeVisible();
  await expect(page.getByText(/retry the bounded purge when Coredrill starts again/)).toBeVisible();
  expect(await page.evaluate(() => globalThis.coredrillAppShell?.getState())).toMatchObject({
    vaultDeleted: true,
    vaultDeletionStatus: "cleanup_pending",
    vaultDeletionSubmitCount: 1,
  });
  await attachAxe(page, testInfo, "vault-deletion-cleanup-pending");
});

test("Home orders actionable local work, limits Now, and lets users hide the snapshot", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openShell(page);

  const sections = await page
    .locator("[data-home-section]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-home-section")),
    );
  expect(sections).toEqual(["now", "attention", "week", "snapshot", "continue"]);
  await expect(page.getByTestId("home-now-item")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Add job", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Paste listing", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Capture URL", exact: true })).toBeVisible();
  await expect(page.getByText("5 items", { exact: true })).toBeVisible();
  await expect(page.getByText(/private planning aid, not a streak/)).toBeVisible();
  await attachAxe(page, testInfo, "home-attention-queue");
  await attachProof(page, testInfo, "home-attention-queue");

  await page.getByRole("button", { name: "Hide snapshot" }).click();
  await expect(page.locator('[data-home-section="snapshot"]')).toBeHidden();
  const stateAfterHide = await page.evaluate(() => globalThis.coredrillAppShell?.getState());
  expect(stateAfterHide?.homeSnapshotVisible).toBe(false);
  await expect(page.getByRole("status")).toContainText("snapshot hidden");

  await page.getByRole("link", { name: /Northstar Health · Product Operations Lead/ }).click();
  await expect(page.getByRole("status")).toContainText("Opened recent local job");
  expect(externalRequests).toEqual([]);
});

test("empty Home offers three non-account paths without inventing goals", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1000, height: 760 });
  await openShell(page, { home: "empty" });

  await expect(
    page.getByRole("heading", { name: "Add the first opportunity when you are ready" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a job" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import existing tracker" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Explore sample data" })).toBeVisible();
  await expect(
    page.getByText(/No account, AI connection, or application target is required/),
  ).toBeVisible();
  await expect(page.locator("[data-home-section]")).toHaveCount(0);
  expect((await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.homeMode).toBe(
    "empty",
  );
  await attachAxe(page, testInfo, "home-empty");
  await attachProof(page, testInfo, "home-empty");

  await page.getByRole("button", { name: "Add a job" }).click();
  await expect(page.getByRole("status")).toContainText("Home action selected: add-job");
});

test("Phase 1 state catalog distinguishes every local state and exposes bounded recovery", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1180, height: 900 });

  const states = [
    ["loading", "Opening your local workspace", "Cancel and return"],
    ["empty", "No opportunities are in this vault yet", "Add a job"],
    ["partial", "Most of this view is available", "Retry missing details"],
    ["error", "This view could not finish loading", "Retry local load"],
    ["offline", "You are offline — local work is available", "Continue locally"],
    ["permission-denied", "File access was not granted", "Choose a file again"],
  ];

  for (const [kind, heading, primaryAction] of states) {
    await openShell(page, { workspaceState: kind });
    const state = page.getByTestId("phase-one-workspace-state");
    await expect(state).toHaveAttribute("data-workspace-state", kind);
    await expect(state.getByRole("heading", { name: heading })).toBeVisible();
    await expect(state.getByRole("note")).toBeVisible();
    await expect(state.getByRole("button", { name: primaryAction })).toBeVisible();
    expect(
      (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.workspaceState,
    ).toBe(kind);
    await attachAxe(page, testInfo, `phase-one-state-${kind}`);

    await state.getByRole("button", { name: primaryAction }).click();
    await expect(page.getByRole("status")).toContainText("Existing work remains local");
    await expect(page.getByRole("status")).toContainText("no external request was made");
  }

  await openShell(page, { workspaceState: "loading" });
  await expect(page.getByTestId("phase-one-workspace-state")).toHaveAttribute("aria-busy", "true");
  await expect(
    page.getByRole("progressbar", { name: "Reading local job records" }),
  ).toHaveAttribute("value", "2");

  await openShell(page, { workspaceState: "partial" });
  await expect(page.getByRole("heading", { name: "Available now" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Unavailable right now" })).toBeVisible();
  await expect(
    page.getByText("Your current filters, selection, and unsaved note remain in place."),
  ).toBeVisible();

  await openShell(page, { workspaceState: "error" });
  await expect(page.getByRole("button", { name: "Copy redacted diagnostics" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open export fallback" })).toBeVisible();
  await expect(page.getByText(/No raw error text, path, or record content/)).toBeVisible();
  await attachProof(page, testInfo, "phase-one-state-error-recovery");

  await openShell(page, { workspaceState: "offline" });
  await expect(page.getByRole("button", { name: /Offline · local work available/ })).toBeVisible();
  await expect(
    page.getByText(/Only actions that explicitly need a network will wait/),
  ).toBeVisible();

  await openShell(page, { workspaceState: "permission-denied" });
  await expect(page.getByText("Exact access", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Read the single tracker file you choose in the system picker."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue manually" })).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test("offline and permission recovery reflow at 320 CSS pixels in forced colors", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openShell(page, { workspaceState: "offline" });

  const offline = page.getByTestId("phase-one-workspace-state");
  await expect(offline.getByRole("button", { name: "Continue locally" })).toBeVisible();
  expect(
    await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
  ).toEqual({ clientWidth: 320, scrollWidth: 320 });
  await attachAxe(page, testInfo, "phase-one-state-offline-320");
  await attachProof(page, testInfo, "phase-one-state-offline-320");

  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openShell(page, { workspaceState: "permission-denied" });
  const manual = page.getByRole("button", { name: "Continue manually" });
  await manual.focus();
  await expect(manual).toBeFocused();
  expect((await manual.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
  ).toEqual({ clientWidth: 320, scrollWidth: 320 });
  await attachAxe(page, testInfo, "phase-one-state-permission-forced-colors-320");
  await attachProof(page, testInfo, "phase-one-state-permission-forced-colors-320");
});

test("Pipeline switches peer presentations while saved views, filters, search, and scope stay local", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await openShell(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const pipeline = page.getByTestId("pipeline-shell");
  await expect(pipeline).toBeVisible();
  await expect(pipeline.getByRole("button", { name: "Inbox 3" })).toBeVisible();
  await expect(pipeline.getByRole("button", { name: "Board" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(pipeline.getByText(/8 matching of 8/)).toBeVisible();

  await pipeline.getByRole("button", { name: "Table" }).click();
  await expect(pipeline.locator('[data-pipeline-view="table"]')).toBeVisible();
  await expect(pipeline.getByText(/8 matching of 8/)).toBeVisible();
  expect((await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.pipelineView).toBe(
    "table",
  );

  await pipeline.getByRole("combobox", { name: "Saved view" }).selectOption("interview-prep");
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.pipelineSavedViewId,
  ).toBe("interview-prep");

  await pipeline.getByRole("searchbox", { name: "Search jobs" }).fill("Northstar");
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.pipelineSearchQuery,
  ).toBe("Northstar");

  await pipeline.getByRole("button", { name: /Remove filter Status/ }).click();
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.pipelineFilterCount,
  ).toBe(1);
  await pipeline.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("open-filters");
  await pipeline.getByRole("button", { name: "Sort · Recently updated" }).click();
  await expect(page.getByRole("status").first()).toContainText("open-sort");
  await pipeline.getByRole("button", { name: "More Pipeline actions" }).click();
  await expect(page.getByRole("status").first()).toContainText("open-more");

  await attachAxe(page, testInfo, "pipeline-peer-views-and-filters");
  await attachProof(page, testInfo, "pipeline-peer-views-and-filters");
  expect(externalRequests).toEqual([]);
});

test("Pipeline selection exposes a non-mutating bulk shell and reflows at 320 pixels", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openShell(page, { pipeline: "selected" });
  await page
    .getByRole("navigation", { name: "Mobile" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const pipeline = page.getByTestId("pipeline-shell");
  const bulk = pipeline.getByRole("region", { name: "Bulk actions" });
  await expect(bulk).toContainText("2 jobs selected");
  for (const name of ["Change status", "Add tags", "Archive", "Clear selection"]) {
    await expect(bulk.getByRole("button", { name })).toBeVisible();
  }
  await attachAxe(page, testInfo, "pipeline-mobile-selected-forced-colors-320");
  await attachProof(page, testInfo, "pipeline-mobile-selected-forced-colors-320");
  await bulk.getByRole("button", { name: "Change status" }).click();
  await expect(page.getByText(/Bulk action prepared.*No records changed/)).toBeVisible();
  await bulk.getByRole("button", { name: "Clear selection" }).click();
  await expect(bulk).toBeHidden();
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.pipelineSelectedCount,
  ).toBe(0);

  await pipeline.getByRole("button", { name: "Table" }).click();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await attachAxe(page, testInfo, "pipeline-mobile-after-clear");
});

test("Table keeps semantic pinned columns and remembers each saved view's configuration", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await openShell(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();
  await page.getByTestId("pipeline-shell").getByRole("button", { name: "Table" }).click();

  const tableView = page.getByTestId("pipeline-table");
  const table = tableView.getByRole("table");
  const scrollRegion = tableView.getByRole("region", { name: "Pipeline Table for Active search" });
  await expect(table).toBeVisible();
  await expect(scrollRegion).toHaveAttribute("data-table-total", "8");
  await expect(scrollRegion).toHaveAttribute("data-table-rendered", "8");
  await expect(table.getByRole("columnheader", { name: "Title" })).toHaveCSS("position", "sticky");
  await expect(table.getByRole("columnheader", { name: "Company" })).toHaveCSS(
    "position",
    "sticky",
  );

  await tableView.getByText("Columns", { exact: true }).click();
  const statusSetting = tableView.locator('[data-column-setting="status"]');
  await statusSetting.getByRole("checkbox", { name: "Pinned" }).check();
  await expect(table.getByRole("columnheader", { name: "Status" })).toHaveAttribute(
    "data-table-pinned",
    "true",
  );
  await statusSetting.getByRole("spinbutton", { name: "Status width in pixels" }).fill("192");
  await expect(table.getByRole("columnheader", { name: "Status" })).toHaveCSS("width", "192px");

  const tagsSetting = tableView.locator('[data-column-setting="tags"]');
  await tagsSetting.getByRole("button", { name: "Move Tags earlier" }).click();
  const sourceSetting = tableView.locator('[data-column-setting="source"]');
  await sourceSetting.getByRole("checkbox", { name: "Visible" }).uncheck();
  await expect(table.getByRole("columnheader", { name: "Source" })).toHaveCount(0);

  const pipeline = page.getByTestId("pipeline-shell");
  await pipeline.getByRole("combobox", { name: "Saved view" }).selectOption("interview-prep");
  await expect(table.getByRole("columnheader", { name: "Source" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Status" })).toHaveAttribute(
    "data-table-pinned",
    "false",
  );
  await pipeline.getByRole("combobox", { name: "Saved view" }).selectOption("active-search");
  await expect(table.getByRole("columnheader", { name: "Source" })).toHaveCount(0);
  await expect(table.getByRole("columnheader", { name: "Status" })).toHaveAttribute(
    "data-table-pinned",
    "true",
  );
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.tableColumnSaveCount,
  ).toBeGreaterThanOrEqual(4);

  await tableView.getByText("Columns", { exact: true }).click();
  await attachAriaSnapshot(tableView, testInfo, "table-semantic-and-configurable");
  await attachAxe(page, testInfo, "table-semantic-and-configurable");
  await attachProof(page, testInfo, "table-semantic-and-configurable");
  expect(externalRequests).toEqual([]);
});

test("Table validates low-risk edits, confirms reopening, and opens complex fields", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await openShell(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();
  await page.getByTestId("pipeline-shell").getByRole("button", { name: "Table" }).click();

  const tableView = page.getByTestId("pipeline-table");
  const northstar = tableView.locator('[data-table-job="board-northstar"]');
  await northstar.getByRole("button", { name: "Product Operations Lead", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText(
    "Opened contextual local Job workspace",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-job-workspace="board-northstar"]')).toHaveCount(0);
  await expect(tableView).toBeVisible();

  await northstar
    .getByRole("button", { name: "Edit priority for Product Operations Lead" })
    .click();
  await northstar.getByLabel("Priority for Product Operations Lead").selectOption("low");
  await northstar.getByRole("button", { name: "Save" }).click();
  await expect(northstar.getByText("low", { exact: true })).toBeVisible();

  await northstar.getByRole("button", { name: "Edit tags for Product Operations Lead" }).click();
  await northstar.getByLabel("Tags for Product Operations Lead").fill("research, Research");
  await northstar.getByRole("button", { name: "Save" }).click();
  await expect(northstar.getByRole("alert")).toContainText("unique comma-separated tags");
  await northstar.getByRole("button", { name: "Cancel" }).click();

  await northstar
    .getByRole("button", { name: "Edit next action for Product Operations Lead" })
    .click();
  await northstar.getByLabel("Next action for Product Operations Lead").fill("2026-09-10");
  await northstar.getByRole("button", { name: "Save" }).click();
  await expect(northstar.getByText("2026-09-10", { exact: true })).toBeVisible();

  const closed = tableView.locator('[data-table-job="board-harbor"]');
  await closed.getByRole("button", { name: "Edit status for Product Manager" }).click();
  await closed.getByLabel("Status for Product Manager").selectOption("saved");
  await expect(
    closed.getByRole("checkbox", { name: "Confirm reopening this closed job" }),
  ).toBeVisible();
  await closed.getByRole("button", { name: "Save" }).click();
  await expect(closed.getByRole("alert")).toContainText("Confirm reopening");
  await expect(closed.getByLabel("Status for Product Manager")).toHaveValue("saved");
  await closed.getByRole("checkbox", { name: "Confirm reopening this closed job" }).check();
  await closed.getByRole("button", { name: "Save" }).click();
  await expect(closed.getByText("Saved", { exact: true })).toBeVisible();

  const state = await page.evaluate(() => globalThis.coredrillAppShell?.getState());
  expect(state?.tableEditCount).toBe(3);
  expect(state?.boardTimelineEventCount).toBe(1);
});

test("Table rejects a stale row version without changing the previous value", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openShell(page, { table: "conflict" });
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const row = page.getByTestId("pipeline-table").locator('[data-table-job="board-northstar"]');
  await row.getByRole("button", { name: "Edit priority for Product Operations Lead" }).click();
  await row.getByLabel("Priority for Product Operations Lead").selectOption("low");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByRole("alert")).toContainText("changed before the edit could commit");
  await expect(row.getByLabel("Priority for Product Operations Lead")).toHaveValue("low");
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.tableEditCount,
  ).toBe(0);
});

test("Table windows 2,000 rows within budget and owns narrow-screen overflow", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openShell(page, { table: "large" });
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const tableView = page.getByTestId("pipeline-table");
  const scrollRegion = tableView.getByRole("region", { name: "Pipeline Table for Active search" });
  await expect(scrollRegion).toHaveAttribute("data-table-total", "2000");
  await expect(scrollRegion).toHaveAttribute("data-table-rendered", "12");
  await expect(tableView.locator('[data-table-job="table-volume-1992"]')).toHaveCount(0);
  const start = Date.now();
  await scrollRegion.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(tableView.locator('[data-table-job="table-volume-1992"]')).toBeVisible();
  expect(Date.now() - start).toBeLessThan(2_500);
  await expect(scrollRegion).toHaveAttribute("data-table-rendered", "12");
  await attachProof(page, testInfo, "table-2000-row-window");

  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const documentDimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(documentDimensions.scrollWidth).toBeLessThanOrEqual(documentDimensions.clientWidth);
  const tableDimensions = await scrollRegion.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(tableDimensions.scrollWidth).toBeGreaterThan(tableDimensions.clientWidth);
  await attachAxe(page, testInfo, "table-mobile-forced-colors");
  await attachProof(page, testInfo, "table-mobile-forced-colors");
});

test("wide Pipeline opens a contextual Job route and restores exact Board context and focus", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openShell(page, { board: "large", pipeline: "selected" });
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const pipeline = page.getByTestId("pipeline-shell");
  await pipeline.getByRole("searchbox", { name: "Search jobs" }).fill("Lead");
  const savedScroll = pipeline.getByRole("list", { name: "Saved jobs" });
  const verticalScroll = await savedScroll.evaluate((element) => {
    element.scrollTop = 520;
    element.dispatchEvent(new Event("scroll"));
    return element.scrollTop;
  });
  const boardColumns = pipeline.locator(".cd-board-columns");
  const horizontalScroll = await boardColumns.evaluate((element) => {
    element.scrollLeft = 300;
    return element.scrollLeft;
  });
  const opener = pipeline
    .locator('[data-board-job="board-arc"]')
    .getByRole("button", { name: "Design Systems Lead", exact: true });
  await opener.evaluate((button) => {
    button.click();
  });

  await expect(page).toHaveURL(/\/jobs\/board-arc\/overview$/u);
  const workspace = page.locator('[data-job-workspace="board-arc"]');
  await expect(workspace).toHaveAttribute("data-workspace-mode", "contextual");
  await expect(pipeline).toBeVisible();
  await expect(workspace.getByRole("heading", { name: "Design Systems Lead" })).toBeFocused();
  await expect(workspace.getByText("Arc Studio", { exact: true })).toBeVisible();
  await expect(workspace.getByRole("button", { name: "Change status" })).toBeVisible();
  await expect(workspace.getByRole("button", { name: "Set next action" })).toBeVisible();
  await expect(workspace.getByRole("button", { name: "Prepare application" })).toBeVisible();
  await workspace.getByRole("slider", { name: "Job workspace width" }).fill("720");
  await expect(workspace).toHaveCSS("width", "720px");
  await attachAxe(page, testInfo, "job-workspace-contextual-wide");
  await attachProof(page, testInfo, "job-workspace-contextual-wide");

  await page.keyboard.press("Escape");
  await expect(workspace).toHaveCount(0);
  await expect(page).toHaveURL(/\/pipeline\?savedView=active-search&view=board$/u);
  await expect(pipeline.getByRole("searchbox", { name: "Search jobs" })).toHaveValue("Lead");
  await expect(pipeline.getByRole("region", { name: "Bulk actions" })).toContainText(
    "1 job selected",
  );
  await expect(opener).toBeFocused();
  await expect
    .poll(() => savedScroll.evaluate((element) => element.scrollTop))
    .toBe(verticalScroll);
  await expect
    .poll(() => boardColumns.evaluate((element) => element.scrollLeft))
    .toBe(horizontalScroll);

  await page.goForward();
  await expect(page).toHaveURL(/\/jobs\/board-arc\/overview$/u);
  await expect(workspace).toHaveAttribute("data-workspace-mode", "contextual");
  expect((await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.workspaceMode).toBe(
    "contextual",
  );
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(workspace).toHaveAttribute("data-workspace-mode", "full-page");
  await expect(pipeline).toHaveCount(0);
  const responsiveDimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(responsiveDimensions.scrollWidth).toBeLessThanOrEqual(responsiveDimensions.clientWidth);
});

test("refresh converts a contextual Job entry to the full route and Back restores Pipeline", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openShell(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();
  await page
    .locator('[data-board-job="board-northstar"]')
    .getByRole("button", { name: "Product Operations Lead", exact: true })
    .click();
  await expect(page.locator('[data-job-workspace="board-northstar"]')).toHaveAttribute(
    "data-workspace-mode",
    "contextual",
  );

  await page.reload();
  await page.waitForFunction(() => globalThis.coredrillAppShell !== undefined);
  const workspace = page.locator('[data-job-workspace="board-northstar"]');
  await expect(workspace).toHaveAttribute("data-workspace-mode", "full-page");
  await expect(page.getByTestId("pipeline-shell")).toHaveCount(0);
  await expect(workspace.getByRole("button", { name: "Back to Pipeline" })).toBeVisible();
  await attachAxe(page, testInfo, "job-workspace-refresh-full-page");
  await attachProof(page, testInfo, "job-workspace-refresh-full-page");

  await workspace.getByRole("button", { name: "Back to Pipeline" }).click();
  await expect(page.getByTestId("pipeline-shell")).toBeVisible();
  await expect(page).toHaveURL(/\/pipeline\?savedView=active-search&view=board$/u);
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.workspaceMode,
  ).toBeNull();
});

test("a deep-linked Job tab opens full-page and keeps tab history without a server account", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/jobs/board-northstar/timeline");
  await page.waitForFunction(() => globalThis.coredrillAppShell !== undefined);

  const workspace = page.locator('[data-job-workspace="board-northstar"]');
  await expect(workspace).toHaveAttribute("data-workspace-mode", "full-page");
  await expect(workspace.getByRole("button", { name: "Timeline" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await workspace.getByRole("button", { name: "Source" }).click();
  await expect(page).toHaveURL(/\/jobs\/board-northstar\/source$/u);
  await expect(workspace.getByRole("button", { name: "Source" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.goBack();
  await expect(page).toHaveURL(/\/jobs\/board-northstar\/timeline$/u);
  await expect(workspace.getByRole("button", { name: "Timeline" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await workspace.getByRole("button", { name: "Back to Pipeline" }).click();
  await expect(page).toHaveURL(/\/pipeline\?savedView=active-search&view=board$/u);
  await expect(page.getByTestId("pipeline-shell")).toBeVisible();
});

test("Job core tabs expose normalized facts, chronology, company context, and provenance locally", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openShell(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();
  await page
    .locator('[data-board-job="board-northstar"]')
    .getByRole("button", { name: "Product Operations Lead", exact: true })
    .click();

  const workspace = page.locator('[data-job-workspace="board-northstar"]');
  await expect(workspace.locator('[data-job-content-tab="overview"]')).toBeVisible();
  await expect(workspace.getByText("Normalized local record", { exact: true })).toBeVisible();
  await expect(workspace.getByText("$120k–$145k disclosed", { exact: true })).toBeVisible();
  await expect(workspace.getByText("Application deadline", { exact: true })).toBeVisible();
  await expect(workspace.getByText("Review source fields", { exact: true })).toBeVisible();

  const privateNote = "Private question about portfolio ownership";
  await workspace.getByRole("textbox", { name: "Add a local note" }).fill(privateNote);
  await workspace.getByRole("button", { name: "Add timeline note" }).click();
  const activity = page.getByRole("status").first();
  await expect(activity).toContainText(`${privateNote.length}-character local timeline note`);
  await expect(activity).toContainText("No durable write occurs in this proof host");
  await expect(activity).not.toContainText(privateNote);
  await expect(workspace.getByRole("textbox", { name: "Add a local note" })).toHaveValue("");

  await workspace.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/board-northstar\/timeline$/u);
  await expect(workspace.getByText(/status and outcome history is append-only/u)).toBeVisible();
  await expect(workspace.getByRole("list", { name: "Job timeline items" })).toBeVisible();
  await expect(workspace.getByRole("button", { name: "Edit note" })).toHaveCount(1);
  await expect(workspace.getByText("Immutable history event", { exact: true })).toHaveCount(2);
  for (const action of ["Log interaction", "Schedule interview", "Add follow-up"]) {
    await expect(workspace.getByRole("button", { name: action })).toBeVisible();
  }

  await workspace.getByRole("button", { name: "Company", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/board-northstar\/company$/u);
  await expect(workspace.getByRole("heading", { name: "Northstar Health" })).toBeVisible();
  await expect(workspace.getByText("Other active roles", { exact: true })).toBeVisible();
  await expect(workspace.getByText(/never guesses an email address/u)).toBeVisible();

  await workspace.getByRole("button", { name: "Source", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/board-northstar\/source$/u);
  await expect(workspace.getByRole("region", { name: "Field provenance" })).toBeVisible();
  await expect(workspace.getByText("Stored source record · unconfirmed").first()).toBeVisible();
  await expect(workspace.getByText(/never silently replace user-confirmed values/u)).toBeVisible();
  for (const action of ["View snapshot", "Compare changes", "Refresh manually"]) {
    await expect(workspace.getByRole("button", { name: action })).toBeVisible();
  }

  await attachAxe(page, testInfo, "job-workspace-core-tabs");
  await attachAriaSnapshot(workspace, testInfo, "job-workspace-core-tabs");
  await attachProof(page, testInfo, "job-workspace-core-tabs");
  expect(externalRequests).toEqual([]);
});

test("narrow Source keeps provenance and manual controls reachable without page overflow", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 360, height: 900 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/jobs/board-northstar/source");
  await page.waitForFunction(() => globalThis.coredrillAppShell !== undefined);

  const workspace = page.locator('[data-job-workspace="board-northstar"]');
  await expect(workspace).toHaveAttribute("data-workspace-mode", "full-page");
  await expect(workspace.getByRole("button", { name: "Refresh manually" })).toBeVisible();
  const provenance = workspace.getByRole("region", { name: "Field provenance" });
  await expect(provenance).toBeVisible();
  const documentDimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(documentDimensions.scrollWidth).toBeLessThanOrEqual(documentDimensions.clientWidth);
  const provenanceDimensions = await provenance.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(provenanceDimensions.scrollWidth).toBeGreaterThan(provenanceDimensions.clientWidth);

  await workspace.getByRole("button", { name: "Refresh manually" }).click();
  await expect(page.getByRole("status").first()).toContainText(
    "No durable write or external request occurred",
  );
  await attachAxe(page, testInfo, "job-workspace-source-mobile-forced-colors");
  await attachProof(page, testInfo, "job-workspace-source-mobile-forced-colors");
  expect(externalRequests).toEqual([]);
});

test("Network relates companies, provenance-bound contacts, and local interaction logs", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openShell(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Network" })
    .click();

  const network = page.getByTestId("network-workspace");
  await expect(page).toHaveURL(/\/network\/companies$/u);
  await expect(network.getByRole("button", { name: "Companies" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(network.getByRole("heading", { name: "Northstar Health" })).toBeVisible();
  await expect(network.getByRole("region", { name: "Company fact provenance" })).toBeVisible();
  await expect(network.getByRole("heading", { name: "Salary observations" })).toBeVisible();
  await expect(network.getByText("Outcome history", { exact: true })).toBeVisible();
  await expect(network.getByRole("button", { name: "Open job" })).toHaveCount(2);

  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(page).toHaveURL(/\/network\/contacts$/u);
  await expect(network.getByRole("heading", { name: "Maya Chen" })).toBeVisible();
  await expect(network.getByRole("region", { name: "Contact point provenance" })).toBeVisible();
  await expect(network.getByText(/never guesses them/u)).toBeVisible();
  await network.locator('[data-network-contact="contact-jonah"]').click();
  await expect(network.getByRole("heading", { name: "Jonah Reed" })).toBeVisible();
  await expect(network.getByText("No contact methods recorded.", { exact: true })).toBeVisible();

  await network.getByRole("button", { name: "Log interaction" }).click();
  await expect(page).toHaveURL(/\/network\/interactions$/u);
  await expect(network.getByRole("list", { name: "Network interaction history" })).toBeVisible();
  await expect(network.getByRole("complementary", { name: "Relationship reminder" })).toBeVisible();
  await expect(network.getByText(/cannot send email, messages, or outreach/u)).toBeVisible();

  const privateSummary = "Private follow-up context for the hiring conversation";
  await network.getByRole("combobox", { name: "Interaction type" }).selectOption("email-logged");
  await network
    .getByRole("combobox", { name: "Interaction company" })
    .selectOption("company-northstar");
  await network.getByRole("combobox", { name: "Interaction contact" }).selectOption("contact-maya");
  await network.getByRole("textbox", { name: "Interaction summary" }).fill(privateSummary);
  await network.getByRole("button", { name: "Log locally" }).click();
  const activity = page.getByRole("status").first();
  await expect(activity).toContainText(
    `${privateSummary.length}-character email-logged interaction for local logging`,
  );
  await expect(activity).toContainText("No durable write or message send occurs");
  await expect(activity).not.toContainText(privateSummary);
  await expect(network.getByRole("textbox", { name: "Interaction summary" })).toHaveValue("");
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))
      ?.networkInteractionDraftCount,
  ).toBe(1);

  await network.getByRole("button", { name: "Snooze" }).click();
  await expect(activity).toContainText("Prepared a local reminder snooze");
  await network.getByRole("button", { name: "Turn off reminder" }).click();
  await expect(activity).toContainText("Prepared a local reminder opt-out");
  await attachAxe(page, testInfo, "network-interactions-local-log");
  await attachProof(page, testInfo, "network-interactions-local-log");

  await page.goBack();
  await expect(page).toHaveURL(/\/network\/contacts\/contact-jonah$/u);
  await expect(network.getByRole("button", { name: "Contacts" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(network.getByRole("heading", { name: "Jonah Reed" })).toBeVisible();
  await attachAxe(page, testInfo, "network-companies-contacts-interactions");
  await attachAriaSnapshot(network, testInfo, "network-companies-contacts-interactions");
  await attachProof(page, testInfo, "network-companies-contacts-interactions");
  expect(externalRequests).toEqual([]);
});

test("narrow Network contact provenance owns overflow and remains keyboard reachable", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 360, height: 900 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/network/contacts");
  await page.waitForFunction(() => globalThis.coredrillAppShell !== undefined);

  const network = page.getByTestId("network-workspace");
  await expect(page.getByTestId("page-title")).toHaveText("Network");
  await expect(network.getByRole("button", { name: "Contacts" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const provenance = network.getByRole("region", { name: "Contact point provenance" });
  await expect(provenance).toBeVisible();
  const documentDimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(documentDimensions.scrollWidth).toBeLessThanOrEqual(documentDimensions.clientWidth);
  const provenanceDimensions = await provenance.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(provenanceDimensions.scrollWidth).toBeGreaterThan(provenanceDimensions.clientWidth);
  await provenance.focus();
  await expect(provenance).toBeFocused();
  await attachAxe(page, testInfo, "network-contact-mobile-forced-colors");
  await attachProof(page, testInfo, "network-contact-mobile-forced-colors");
  expect(externalRequests).toEqual([]);
});

test("narrow Table opens full-page and restores local selection, scroll, and opener focus", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await openShell(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();
  const pipeline = page.getByTestId("pipeline-shell");
  await pipeline.getByRole("button", { name: "Table" }).click();
  await pipeline.getByRole("searchbox", { name: "Search jobs" }).fill("Product");
  const row = pipeline.locator('[data-table-job="board-northstar"]');
  await row.getByRole("checkbox", { name: "Select Product Operations Lead" }).check();
  const tableScroll = pipeline.getByRole("region", { name: "Pipeline Table for Active search" });
  const horizontalScroll = await tableScroll.evaluate((element) => {
    element.scrollLeft = 700;
    return element.scrollLeft;
  });
  const opener = row.getByRole("button", { name: "Product Operations Lead", exact: true });
  await opener.evaluate((button) => {
    button.click();
  });

  const workspace = page.locator('[data-job-workspace="board-northstar"]');
  await expect(workspace).toHaveAttribute("data-workspace-mode", "full-page");
  await expect(pipeline).toHaveCount(0);
  await expect(page).toHaveURL(/\/jobs\/board-northstar\/overview$/u);
  await workspace.getByRole("button", { name: "Back to Pipeline" }).click();

  await expect(pipeline).toBeVisible();
  await expect(pipeline.getByRole("button", { name: "Table" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(pipeline.getByRole("searchbox", { name: "Search jobs" })).toHaveValue("Product");
  await expect(pipeline.getByRole("region", { name: "Bulk actions" })).toContainText(
    "1 job selected",
  );
  await expect(opener).toBeFocused();
  await expect
    .poll(() => tableScroll.evaluate((element) => element.scrollLeft))
    .toBe(horizontalScroll);
  await attachAxe(page, testInfo, "job-workspace-narrow-return");
  await attachProof(page, testInfo, "job-workspace-narrow-return");
});

test("Board cards expose semantic context, keyboard moves, durable-event intent, and undo", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await openShell(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const board = page.getByTestId("pipeline-board");
  await expect(board).toBeVisible();
  for (const stage of ["Saved", "Preparing", "Applied", "Interviewing", "Offer", "Closed"]) {
    await expect(board.getByRole("heading", { name: stage, exact: true })).toBeVisible();
  }
  await expect(board.getByText("response · interview")).toBeVisible();
  await expect(board.getByText("rejected · withdrawn · archived")).toBeVisible();

  const northstar = board.locator('[data-board-job="board-northstar"]');
  await expect(northstar.getByRole("button", { name: "Product Operations Lead" })).toBeVisible();
  await expect(northstar.getByText("Northstar Health", { exact: true })).toBeVisible();
  await expect(northstar.getByText(/remote · United States/)).toBeVisible();
  await expect(northstar.getByText(/Review source fields · Saved today/)).toBeVisible();
  await expect(northstar.getByText("Unreviewed source", { exact: true })).toBeVisible();
  await expect(northstar.getByRole("list", { name: "Job warnings" })).toHaveCSS(
    "overflow-x",
    "hidden",
  );

  await northstar
    .getByRole("combobox", { name: "Move Product Operations Lead to stage" })
    .selectOption("preparing");
  await expect(board.locator('[data-board-stage="preparing"]')).toContainText(
    "Product Operations Lead",
  );
  await expect(board.getByRole("status")).toContainText(
    "Timeline event recorded; undo is available",
  );
  let state = await page.evaluate(() => globalThis.coredrillAppShell?.getState());
  expect(state?.boardTimelineEventCount).toBe(1);
  expect(state?.boardUndoAvailable).toBe(true);

  await board.getByRole("button", { name: "Undo move" }).click();
  await expect(board.locator('[data-board-stage="saved"]')).toContainText(
    "Product Operations Lead",
  );
  await expect(board.getByRole("status")).toContainText("original timeline event remains");
  state = await page.evaluate(() => globalThis.coredrillAppShell?.getState());
  expect(state?.boardTimelineEventCount).toBe(2);
  expect(state?.boardUndoAvailable).toBe(false);

  await attachAriaSnapshot(board, testInfo, "board-keyboard-and-screen-reader-facing");
  await attachAxe(page, testInfo, "board-keyboard-move-and-undo");
  await attachProof(page, testInfo, "board-keyboard-move-and-undo");
  expect(externalRequests).toEqual([]);
});

test("Board supports pointer drag while terminal-stage reopen requests fail closed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await openShell(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const board = page.getByTestId("pipeline-board");
  await board
    .locator('[data-board-job="board-canvas"] [data-board-drag-handle]')
    .dragTo(board.locator('[data-board-stage="applied"]'));
  await expect(board.locator('[data-board-stage="applied"]')).toContainText("Platform Engineer");
  await expect(board.getByRole("status")).toContainText("by drag");
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.boardTimelineEventCount,
  ).toBe(1);

  const closedJob = board.locator('[data-board-job="board-harbor"]');
  await closedJob
    .getByRole("combobox", { name: "Move Product Manager to stage" })
    .selectOption("saved");
  await expect(board.getByRole("status")).toContainText("requires explicit confirmation");
  await expect(board.locator('[data-board-stage="closed"]')).toContainText("Product Manager");
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.boardTimelineEventCount,
  ).toBe(1);
});

test("Board virtualizes a large synthetic column and keeps mobile overflow local", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openShell(page, { board: "large" });
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const board = page.getByTestId("pipeline-board");
  const savedColumn = board.locator('[data-board-stage="saved"]');
  const scrollRegion = savedColumn.getByRole("list", { name: "Saved jobs" });
  await expect(scrollRegion).toHaveAttribute("data-board-total", "72");
  await expect(scrollRegion).toHaveAttribute("data-board-rendered", "8");
  await expect(savedColumn.locator('[data-board-job="board-volume-70"]')).toHaveCount(0);
  await scrollRegion.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(savedColumn.locator('[data-board-job="board-volume-70"]')).toBeVisible();
  await attachProof(page, testInfo, "board-large-column-windowed");

  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  const boardDimensions = await board.locator(".cd-board-columns").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(boardDimensions.scrollWidth).toBeGreaterThan(boardDimensions.clientWidth);
  await attachAxe(page, testInfo, "board-mobile-forced-colors");
  await attachProof(page, testInfo, "board-mobile-forced-colors");
});

test("search, command, and Add surfaces restore focus and stay local", async ({ page }) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await openShell(page);

  const searchTrigger = page.getByRole("button", { name: /Search local vault/ });
  await searchTrigger.click();
  const searchInput = page.getByRole("searchbox", { name: "Search local vault" });
  await expect(searchInput).toBeFocused();
  await expect(page.getByText("All local records", { exact: true })).toBeVisible();
  await searchInput.fill("acme research");
  const companyResult = page.getByRole("link", { name: /Acme Research/ });
  await expect(companyResult).toHaveAttribute("href", "/network/companies/company-acme");
  await searchInput.press("ArrowDown");
  await expect(companyResult).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(searchTrigger).toBeFocused();

  await page.keyboard.press("Control+/");
  await searchInput.fill("northstar lead");
  const jobResult = page.getByRole("link", { name: /Product Operations Lead/ });
  await expect(jobResult).toHaveAttribute("href", "/jobs/board-northstar/overview");
  await searchInput.press("ArrowDown");
  await expect(jobResult).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/jobs\/board-northstar\/overview$/u);
  await expect(page.getByTestId("page-title")).toHaveText("Product Operations Lead");

  await page.keyboard.press("Control+/");
  await page.getByRole("searchbox", { name: "Search local vault" }).fill("maya chen");
  await page.getByRole("link", { name: /Maya Chen/ }).click();
  await expect(page).toHaveURL(/\/network\/contacts\/contact-maya$/u);
  await expect(page.getByRole("heading", { name: "Maya Chen" })).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => globalThis.coredrillAppShell !== undefined);
  await expect(page.getByRole("heading", { name: "Maya Chen" })).toBeVisible();

  await page.keyboard.press("Control+/");
  await page.getByRole("searchbox", { name: "Search local vault" }).fill("product leadership");
  await page.getByRole("link", { name: /Product leadership base/ }).click();
  await expect(page).toHaveURL(/\/documents\/document-product-base$/u);
  await expect(page.getByTestId("page-title")).toHaveText("Documents");
  await page.reload();
  await page.waitForFunction(() => globalThis.coredrillAppShell !== undefined);
  await expect(page.getByTestId("page-title")).toHaveText("Documents");

  const commandTrigger = page.getByRole("button", { name: "Open command menu" });
  await page.keyboard.press("Control+k");
  const commandInput = page.getByRole("searchbox", { name: "Filter commands" });
  await expect(commandInput).toBeFocused();
  await commandInput.fill("back up");
  await page.getByRole("button", { name: /Export or back up vault/ }).click();
  await expect(page.getByRole("status")).toContainText("export-backup");
  await expect(commandTrigger).toBeFocused();

  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("c");
  await expect(page.getByRole("menuitem", { name: /Add job/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const pasteListing = page.getByRole("menuitem", { name: /Paste listing/ });
  await expect(pasteListing).toBeFocused();
  await pasteListing.click();
  await expect(page.getByRole("status")).toContainText("paste-listing");
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeFocused();

  expect(externalRequests).toEqual([]);
});

test("Pipeline search filters the current jobs and companies with exact local counts", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await openShell(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const pipeline = page.getByTestId("pipeline-shell");
  const search = pipeline.getByRole("searchbox", { name: "Search jobs and companies" });
  await expect(search).toHaveAttribute("maxlength", "512");
  await expect(pipeline.getByText("Current Pipeline · jobs and companies")).toBeVisible();
  await search.fill("canvas engineer");
  await expect(pipeline.getByTestId("pipeline-board")).toContainText("Platform Engineer");
  await expect(pipeline.getByTestId("pipeline-board")).not.toContainText("Product Operations Lead");
  await expect(pipeline.locator(".cd-pipeline-presentation-heading")).toContainText(
    /1 matching of \d+/u,
  );

  await pipeline.getByRole("button", { name: "Table" }).click();
  await expect(pipeline.locator('[data-table-job="board-canvas"]')).toBeVisible();
  await expect(pipeline.locator('[data-table-job="board-northstar"]')).toHaveCount(0);
  await expect(pipeline.locator(".cd-pipeline-presentation-heading")).toContainText(
    /1 matching of \d+/u,
  );

  await search.fill("missing local company");
  await expect(pipeline.locator(".cd-pipeline-presentation-heading")).toContainText(
    /0 matching of \d+/u,
  );
  await expect(pipeline.locator("[data-table-job]")).toHaveCount(0);

  await search.fill("");
  await expect(pipeline.locator('[data-table-job="board-northstar"]')).toBeVisible();
  await attachAxe(page, testInfo, "pipeline-scoped-local-search");
  await attachProof(page, testInfo, "pipeline-scoped-local-search");
  expect(externalRequests).toEqual([]);
});

test("compact rail keeps every destination and vault state named", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await openShell(page, { health: "offline" });
  const sidebar = page.getByLabel("Coredrill workspace");
  expect((await sidebar.boundingBox())?.width).toBe(64);
  const primary = page.getByRole("navigation", { name: "Primary" });
  await expect(primary.getByRole("link", { name: "Career Profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Offline · local work available/ })).toBeVisible();
  await attachProof(page, testInfo, "compact-rail-offline");
});

test("mobile bottom navigation, More, forced colors, and 320 pixel reflow remain usable", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openShell(page, { health: "storage-risk" });

  await expect(page.getByLabel("Coredrill workspace")).toBeHidden();
  const mobile = page.getByRole("navigation", { name: "Mobile" });
  await expect(mobile).toBeVisible();
  for (const name of ["Home", "Pipeline", "Add", "Documents", "More"]) {
    await expect(
      mobile.getByRole(name === "Add" || name === "More" ? "button" : "link", { name }),
    ).toBeVisible();
  }
  await mobile.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("menuitem", { name: /Career Profile/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Storage risk/ })).toBeVisible();
  await page.keyboard.press("Escape");

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await attachAxe(page, testInfo, "mobile-forced-colors-320");
  await attachProof(page, testInfo, "mobile-forced-colors-320");
});

const PHASE_ONE_CORE_ROUTE_CASES = Object.freeze([
  ["home", "/app-shell.html"],
  ["pipeline-board", "/pipeline?view=board"],
  ["pipeline-table", "/pipeline?view=table"],
  ["documents", "/documents"],
  ["career-profile", "/profile/basics"],
  ["network-companies", "/network/companies"],
  ["network-contacts", "/network/contacts"],
  ["network-interactions", "/network/interactions"],
  ["insights", "/insights/pipeline"],
  ["settings", "/settings/vault-backup"],
  ["job-overview", "/jobs/board-northstar/overview"],
  ["job-requirements", "/jobs/board-northstar/requirements"],
  ["job-documents", "/jobs/board-northstar/documents"],
  ["job-timeline", "/jobs/board-northstar/timeline"],
  ["job-company", "/jobs/board-northstar/company"],
  ["job-source", "/jobs/board-northstar/source"],
  ["company-detail", "/network/companies/company-acme"],
  ["contact-detail", "/network/contacts/contact-maya"],
  ["document-detail", "/documents/document-product-base"],
]);

for (const [name, route] of PHASE_ONE_CORE_ROUTE_CASES) {
  test(`Phase 1 core route ${name} has no automated axe violations`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(route);
    await page.waitForFunction(() => globalThis.coredrillAppShell !== undefined);
    await expect(page.locator("main")).toBeVisible();
    await attachAxe(page, testInfo, `phase-one-core-route-${name}`);
  });
}

for (const appearance of [
  { density: "comfortable", theme: "light" },
  { density: "compact", theme: "light" },
  { density: "comfortable", theme: "dark" },
  { density: "compact", theme: "dark" },
]) {
  test(`Phase 1 shell ${appearance.theme} ${appearance.density} appearance has no automated axe violations`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openShell(page, appearance);
    await expect(page.locator("html")).toHaveAttribute("data-theme", appearance.theme);
    await expect(page.locator("html")).toHaveAttribute("data-density", appearance.density);
    await attachAxe(
      page,
      testInfo,
      `phase-one-appearance-${appearance.theme}-${appearance.density}`,
    );
  });
}

for (const viewport of [
  { height: 800, id: "mobile", width: 360 },
  { height: 1024, id: "tablet-portrait", width: 768 },
  { height: 768, id: "tablet-landscape", width: 1024 },
  { height: 900, id: "desktop", width: 1440 },
  { height: 1080, id: "wide", width: 1920 },
]) {
  test(`Phase 1 responsive checkpoint ${viewport.id} retains reflow and keyboard navigation`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await page.goto("/pipeline?view=board");
    await page.waitForFunction(() => globalThis.coredrillAppShell !== undefined);

    expect(
      await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      })),
    ).toEqual({ clientWidth: viewport.width, scrollWidth: viewport.width });

    const navigation = page.getByRole("navigation", {
      name: viewport.width < 640 ? "Mobile" : "Primary",
    });
    const home = navigation.getByRole("link", { name: "Home" });
    await home.focus();
    await expect(home).toBeFocused();
    await home.press("Enter");
    await expect(page.getByTestId("page-title")).toHaveText("Keep the next move clear");
    await attachAxe(page, testInfo, `phase-one-responsive-${viewport.id}`);
  });
}
