import { readFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { inspectPortableArchiveV1 } from "../packages/storage-core/dist/index.js";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";
import { exerciseNormalVaultPreparation } from "./normal-vault-export-journey.mjs";
import { expectRestoredPortableContent } from "./portable-archive-content-proof.mjs";
import { expectReviewedSchemaRestoreUpgrade } from "./schema-160-restore-proof.mjs";

const offlineReady = async (page, context) => {
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
};
const downloadArchive = async (page) => {
  const panel = await exerciseNormalVaultPreparation(page, "browser");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    panel.getByRole("button", { name: "Download prepared archive", exact: true }).click(),
  ]);
  const buffer = await readFile(await download.path());
  const archive = await inspectPortableArchiveV1({
    bytes: new Uint8Array(buffer),
    expectedSchemaVersion: 182,
  });
  await panel.getByRole("button", { name: "Discard prepared archive", exact: true }).click();
  return { buffer, archive };
};
const retainSyntheticResume = async (page) => {
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Career Profile", exact: true })
    .click();
  const imports = page.getByTestId("career-profile-workspace").locator(".cd-career-import");
  await imports
    .locator('input[type="file"]')
    .setInputFiles(path.resolve("fixtures/imports/synthetic-resume.docx"));
  await expect(imports.getByRole("status")).toContainText("7 proposals queued for review");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add job/u }).click();
  const capture = page.getByRole("dialog");
  await capture.getByLabel(/Job title/u).fill("Synthetic restore role");
  await capture.getByLabel(/Company/u).fill("Synthetic Restore Lab");
  await capture.getByLabel(/Notes or listing details/u).fill("Synthetic retained restore fixture");
  await capture.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
  await capture.getByRole("button", { name: "Close capture dialog" }).click();
  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  await primary.getByRole("link", { name: "Pipeline", exact: true }).click();
  await page.locator('[data-pipeline-view-option="inbox"]').click();
  const review = page.getByTestId("capture-review");
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await review.getByRole("button", { name: "Save as new job" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
  await page.locator('[data-pipeline-view-option="table"]').click();
  await page.getByRole("button", { name: "Synthetic restore role", exact: true }).click();
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  const start = page.getByRole("form", { name: "Start local application preparation" });
  await start.getByLabel("Preparation stage name").fill("Synthetic restore drafting");
  await start.getByRole("button", { name: "Start preparation locally" }).click();
  await expect(page.locator('[data-preparation-status="missing"]')).toBeVisible();
  const preparationUrl = page.url();
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  await primary.getByRole("link", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  const form = page.getByRole("form", { name: "New reusable document" });
  await form.getByLabel("Document title", { exact: true }).fill("Synthetic restore resume");
  await form
    .getByLabel("Initial document text", { exact: true })
    .fill("Synthetic retained evidence");
  await form.getByRole("button", { name: "Create document locally", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic restore resume", exact: true }),
  ).toBeVisible();
  const documentId = new URL(page.url()).pathname.split("/").at(-1);
  const document = await page.evaluate(
    (id) => globalThis.coredrillStorageSpike.openDocumentEditor(id),
    documentId,
  );
  expect(document.ok).toBe(true);
  await page.goto(preparationUrl);
  const derivative = page.getByRole("form", {
    name: "Create a job-specific document",
    exact: true,
  });
  await derivative
    .getByLabel("Reusable source version", { exact: true })
    .selectOption(document.value.currentVersion.id);
  await derivative
    .getByLabel("Job-specific document title", { exact: true })
    .fill("Synthetic restore application resume");
  await derivative.getByRole("button", { name: "Create job-specific copy", exact: true }).click();
  await expect(derivative.getByRole("status")).toContainText("has not been selected");
  const preparation = page.locator(".cd-job-document-preparation");
  const version = await preparation
    .getByLabel("Exact resume version *")
    .locator("option")
    .filter({ hasText: "Synthetic restore application resume" })
    .getAttribute("value");
  await preparation.getByLabel("Exact resume version *").selectOption(version);
  await preparation.getByRole("button", { name: "Save exact selections" }).click();
  await expect(preparation).toContainText("Ready for export review");
  await preparation
    .getByRole("button", {
      name: "Review export for Synthetic restore application resume version 1",
    })
    .click();
  const exported = preparation.getByRole("region", {
    name: "Export review for Synthetic restore application resume version 1",
  });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exported.getByRole("button", { name: "Download DOCX" }).click(),
  ]);
  expect((await readFile(await download.path())).length).toBeGreaterThan(0);
  await expect(exported.getByRole("status")).toContainText("retained for Mark Applied");
};
const restorePanel = (page) =>
  page.getByRole("region", { name: "Portable vault restore", exact: true });
const select = async (panel, buffer) => {
  const input = panel.getByLabel("Choose archive to review", { exact: true });
  await input.focus();
  await input.setInputFiles({
    name: "synthetic.coredrill.zip",
    mimeType: "application/zip",
    buffer,
  });
};
const confirm = async (panel) => {
  const button = panel.getByRole("button", {
    name: "Confirm and restore reviewed archive",
    exact: true,
  });
  await expect(button).toBeDisabled();
  await panel.getByRole("checkbox").focus();
  await panel.getByRole("checkbox").press("Space");
  await button.focus();
  await button.press("Enter");
  await expect(panel.getByRole("status")).toContainText(
    "Restore committed and its acknowledgement validated",
    { timeout: 30_000 },
  );
};

for (const sourceVersion of [160, 164, 165, 167, 182]) {
  test(`normal clean offline restore preserves a schema${sourceVersion} backup and deliberately reopens at182 without invented contact evidence`, async ({
    page,
    context,
  }) => {
    const bytes = await readFile(
      path.resolve(`fixtures/recovery/phase-1-vault-schema-${sourceVersion}-v1.coredrill.zip`),
    );
    const archive = await inspectPortableArchiveV1({
      bytes: new Uint8Array(bytes),
      expectedSchemaVersion: sourceVersion,
    });
    await page.goto("/");
    await offlineReady(page, context);
    await page.getByRole("button", { name: /Quick start/u }).click();
    await page
      .getByRole("button", { name: "Restore an existing archive instead", exact: true })
      .click();
    const panel = restorePanel(page);
    await select(panel, bytes);
    await expect(
      panel.getByRole("heading", { name: "Review exact restore changes", exact: true }),
    ).toBeVisible();
    await expect(panel).toContainText(archive.archiveSha256);
    await expect(panel).toContainText("Empty target (no vault identity)");
    expect(
      (await page.evaluate(() => globalThis.coredrillStorageSpike.vault.inspect())).value.vault,
    ).toBeNull();
    await confirm(panel);
    const openedAfter = Date.now();
    await panel.getByRole("button", { name: "Reload local vault", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();
    const identity = await page.evaluate(() => globalThis.coredrillStorageSpike.vault.inspect());
    expect(identity.value.vault.id).toBe(archive.manifest.vault.id);
    expect(identity.value.vault.schemaVersion).toBe(182);
    await expectReviewedSchemaRestoreUpgrade(
      (await downloadArchive(page)).archive,
      archive,
      [openedAfter, Date.now()],
      sourceVersion,
    );
  });
}

test("normal offline Settings restores exact prior content after explicit same-vault review across navigation and reflow", async ({
  page,
  context,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await offlineReady(page, context);
  await retainSyntheticResume(page);
  const { buffer, archive } = await downloadArchive(page);
  expect(archive.attachments.length).toBeGreaterThan(0);
  const history = page.getByRole("region", { name: "Verified export history", exact: true });
  await history.getByRole("button", { name: "Turn off export reminders", exact: true }).click();
  await expect(
    history.getByRole("button", { name: "Turn on export reminders", exact: true }),
  ).toBeVisible();
  const changed = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  expect(changed).not.toBe(archive.database.sha256);
  const panel = restorePanel(page);
  await select(panel, Buffer.from("not a valid archive but over twenty-two bytes"));
  await expect(panel.getByRole("alert")).toContainText("No restore was submitted");
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(changed);
  await select(panel, buffer);
  const review = panel.getByRole("heading", { name: "Review exact restore changes", exact: true });
  await expect(review).toBeVisible();
  await expect(review).toBeFocused();
  await expect(panel).toContainText("Later edits not in the archive will be lost");
  await expect(panel).toContainText(archive.archiveSha256);
  await expect(panel.getByRole("checkbox")).not.toBeChecked();
  const tuple = await panel.locator("dl").textContent();
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Pipeline", exact: true })
    .click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(panel.locator("dl")).toHaveText(tuple);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).include('[aria-label="Portable vault restore"]').analyze())
      .violations,
  ).toEqual([]);
  await panel.screenshot({ path: testInfo.outputPath("normal-restore-review-320.png") });
  await confirm(panel);
  await expect(
    page.getByRole("heading", { name: "Reopen local vault after restore", exact: true }),
  ).toBeVisible();
  const openedAfter = Date.now();
  await panel.getByRole("button", { name: "Reload local vault", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();
  const restored = await page.evaluate(async () => ({
    vault: await globalThis.coredrillStorageSpike.vault.inspect(),
    sha256: (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  }));
  expect(restored.vault.value.vault.id).toBe(archive.manifest.vault.id);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    history.getByRole("button", { name: "Turn off export reminders", exact: true }),
  ).toBeVisible();
  await expect(
    restorePanel(page).getByLabel("Choose archive to review", { exact: true }),
  ).toBeVisible();
  expectRestoredPortableContent((await downloadArchive(page)).archive, archive, [
    openedAfter,
    Date.now(),
  ]);
  expect(errors).toEqual([]);
});

test("clean browser restores an archive offline without creating an account or setup vault", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await retainSyntheticResume(page);
  const { buffer, archive } = await downloadArchive(page);
  expect(archive.attachments.length).toBeGreaterThan(0);
  const clean = await browser.newContext();
  try {
    const target = await clean.newPage();
    await target.goto("/");
    await offlineReady(target, clean);
    const setup = target.getByRole("heading", {
      name: "Start with one job, or set up the whole workspace",
      exact: true,
    });
    await expect(setup).toBeVisible();
    await target.getByRole("button", { name: /Quick start/u }).click();
    await target.getByLabel("Vault name", { exact: true }).fill("Synthetic unsaved setup draft");
    await target
      .getByRole("button", { name: "Restore an existing archive instead", exact: true })
      .click();
    await expect(setup).not.toBeVisible();
    const panel = restorePanel(target);
    await select(panel, buffer);
    await expect(
      panel.getByRole("heading", { name: "Review exact restore changes", exact: true }),
    ).toBeVisible();
    await expect(panel).toContainText("Empty target (no vault identity)");
    expect((await new AxeBuilder({ page: target }).analyze()).violations).toEqual([]);
    const empty = await target.evaluate(async () =>
      globalThis.coredrillStorageSpike.vault.inspect(),
    );
    expect(empty.value.vault).toBeNull();
    await target.getByRole("button", { name: "Back without restoring", exact: true }).click();
    await expect(target.getByLabel("Vault name", { exact: true })).toHaveValue(
      "Synthetic unsaved setup draft",
    );
    await target
      .getByRole("button", { name: "Restore an existing archive instead", exact: true })
      .click();
    await expect(panel.getByLabel("Choose archive to review", { exact: true })).toBeVisible();
    await select(panel, buffer);
    await expect(
      panel.getByRole("heading", { name: "Review exact restore changes", exact: true }),
    ).toBeVisible();
    await confirm(panel);
    expect((await new AxeBuilder({ page: target }).analyze()).violations).toEqual([]);
    const openedAfter = Date.now();
    await panel.getByRole("button", { name: "Reload local vault", exact: true }).click();
    await expect(target.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();
    const actual = await target.evaluate(async () => ({
      vault: await globalThis.coredrillStorageSpike.vault.inspect(),
      sha256: (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    }));
    expect(actual.vault.value.vault.id).toBe(archive.manifest.vault.id);
    expectRestoredPortableContent((await downloadArchive(target)).archive, archive, [
      openedAfter,
      Date.now(),
    ]);
  } finally {
    await clean.close();
  }
});

test("normal Settings rejects a target changed after review without overwriting newer local data", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await offlineReady(page, context);
  const { buffer } = await downloadArchive(page);
  const panel = restorePanel(page);
  await select(panel, buffer);
  await expect(
    panel.getByRole("heading", { name: "Review exact restore changes", exact: true }),
  ).toBeVisible();
  const history = page.getByRole("region", { name: "Verified export history", exact: true });
  await history.getByRole("button", { name: "Turn off export reminders", exact: true }).click();
  await expect(
    history.getByRole("button", { name: "Turn on export reminders", exact: true }),
  ).toBeVisible();
  const changed = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await panel.getByRole("checkbox").check();
  await panel
    .getByRole("button", { name: "Confirm and restore reviewed archive", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("stale, retired or no longer belongs");
  await expect(panel.getByRole("status")).toContainText("no automatic retry");
  await expect(
    panel.getByRole("button", { name: "Confirm and restore reviewed archive", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(changed);
  await panel.getByRole("button", { name: "Reload local vault", exact: true }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    history.getByRole("button", { name: "Turn on export reminders", exact: true }),
  ).toBeVisible();
});

test("normal Settings explicitly replaces a different vault only after its distinct warning and confirmation", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  const { buffer, archive } = await downloadArchive(page);
  const other = await browser.newContext();
  try {
    const target = await other.newPage();
    await target.goto("/");
    await initializeDefaultWorkspace(target);
    await offlineReady(target, other);
    await target.getByRole("link", { name: "Settings", exact: true }).click();
    const original = await target.evaluate(async () =>
      globalThis.coredrillStorageSpike.vault.inspect(),
    );
    expect(original.value.vault.id).not.toBe(archive.manifest.vault.id);
    const panel = restorePanel(target);
    await select(panel, buffer);
    await expect(
      panel.getByRole("heading", { name: "Review exact restore changes", exact: true }),
    ).toBeVisible();
    await expect(panel).toContainText("DIFFERENT vault");
    await expect(panel).toContainText(original.value.vault.id);
    await expect(panel).toContainText(archive.manifest.vault.id);
    await expect(panel.getByRole("checkbox")).toHaveAccessibleName(
      /replacement of this different vault/,
    );
    await confirm(panel);
    const openedAfter = Date.now();
    await panel.getByRole("button", { name: "Reload local vault", exact: true }).click();
    await expect(target.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();
    expectRestoredPortableContent((await downloadArchive(target)).archive, archive, [
      openedAfter,
      Date.now(),
    ]);
  } finally {
    await other.close();
  }
});

test("a failed local archive read ends its progress status, preserves data and permits a fresh explicit review", async ({
  page,
}) => {
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const before = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      File.prototype.arrayBuffer = original;
      return Promise.reject(new Error("synthetic-private-path"));
    };
  });
  const panel = restorePanel(page);
  await select(panel, Buffer.alloc(32));
  await expect(panel.getByRole("alert")).toContainText("No restore was submitted");
  await expect(panel.getByRole("alert")).not.toContainText("synthetic-private-path");
  await expect(panel.getByRole("status")).toHaveText(
    "Archive review stopped. No restore was submitted.",
  );
  await expect(panel.getByLabel("Choose archive to review", { exact: true })).toBeEnabled();
  await expect(
    panel.getByRole("button", { name: "Confirm and restore reviewed archive", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(before);
  const { buffer } = await downloadArchive(page);
  await select(panel, buffer);
  await expect(
    panel.getByRole("heading", { name: "Review exact restore changes", exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Discard restore preview", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText(
    "Restore preview discarded. No restore was submitted.",
  );
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(before);
});
