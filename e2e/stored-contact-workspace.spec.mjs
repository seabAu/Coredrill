import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";
import { exerciseContactWorkspace } from "./contact-workspace-journey.mjs";
import { exerciseContactOwnerLifetimes } from "./contact-owner-lifetime-journey.mjs";
import { exerciseNormalVaultPreparation } from "./normal-vault-export-journey.mjs";

test("contact restore disables the pre-restore draft and retires it after explicit offline reopen", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await page.waitForFunction(
    () => globalThis.coredrillOfflineShell?.getState().registered === true,
  );
  await page.evaluate(() => globalThis.navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => globalThis.navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  const network = page.getByRole("region", { name: "Stored Network", exact: true });
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await network.getByRole("button", { name: "Create local contact", exact: true }).click();
  const create = network.getByRole("form", { name: "Create local contact", exact: true });
  await create.getByLabel("Contact name", { exact: true }).fill("Synthetic restored contact");
  await create
    .getByLabel("Contact notes", { exact: true })
    .fill("Exact original archived contact note");
  await create.getByRole("button", { name: "Save local contact", exact: true }).click();
  await expect(create).toContainText("Local save acknowledged");
  await create.getByRole("button", { name: "View saved contact", exact: true }).click();
  await create.getByRole("button", { name: "Close saved contact draft", exact: true }).click();
  const exportPanel = await exerciseNormalVaultPreparation(page, "browser");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportPanel.getByRole("button", { name: "Download prepared archive", exact: true }).click(),
  ]);
  const buffer = await readFile(await download.path());
  await exportPanel.getByRole("button", { name: "Discard prepared archive", exact: true }).click();
  await page.evaluate(() => {
    const original = globalThis.coredrillStorageSpike;
    const probe = { release: null, notesCompleted: 0, restoreCommits: 0 };
    globalThis.coredrillContactRestoreProbe = probe;
    globalThis.coredrillStorageSpike = {
      ...original,
      contactWorkspace: {
        ...original.contactWorkspace,
        updateNotes: async (input) => {
          await new Promise((resolve) => {
            probe.release = resolve;
          });
          const result = await original.contactWorkspace.updateNotes(input);
          probe.notesCompleted += 1;
          return result;
        },
      },
      vaultRestore: {
        ...original.vaultRestore,
        commit: (input) => {
          probe.restoreCommits += 1;
          return original.vaultRestore.commit(input);
        },
      },
    };
  });
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const restorePanel = page.getByRole("region", { name: "Portable vault restore", exact: true });
  const selectArchive = () =>
    restorePanel.getByLabel("Choose archive to review", { exact: true }).setInputFiles({
      name: "synthetic-contact.coredrill.zip",
      mimeType: "application/zip",
      buffer,
    });
  await selectArchive();
  await expect(
    restorePanel.getByRole("heading", { name: "Review exact restore changes", exact: true }),
  ).toBeVisible();
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await network.getByRole("button", { name: "View contact details", exact: true }).click();
  const detail = network.getByRole("region", { name: "Stored contact details", exact: true });
  await detail.getByRole("button", { name: "Edit contact notes", exact: true }).click();
  const notes = network.getByRole("form", { name: "Edit contact notes", exact: true });
  const privateDraft = "UNSAVED_SYNTHETIC_PRE_RESTORE_CONTACT";
  await notes
    .getByLabel("Contact notes", { exact: true })
    .fill("Actual transient held contact change");
  await notes.getByRole("button", { name: "Save contact notes", exact: true }).click();
  await page.waitForFunction(() => globalThis.coredrillContactRestoreProbe.release !== null);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await restorePanel.getByRole("checkbox").check();
  await restorePanel
    .getByRole("button", { name: "Confirm and restore reviewed archive", exact: true })
    .click();
  await expect(restorePanel.getByRole("status")).toContainText("Restore was not submitted");
  expect(await page.evaluate(() => globalThis.coredrillContactRestoreProbe.restoreCommits)).toBe(0);
  await page.evaluate(() => globalThis.coredrillContactRestoreProbe.release());
  await expect
    .poll(() => page.evaluate(() => globalThis.coredrillContactRestoreProbe.notesCompleted))
    .toBe(1);
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await network.getByRole("button", { name: "Return to contact draft", exact: true }).click();
  await expect(notes).toContainText("Local save acknowledged");
  await notes.getByRole("button", { name: "Close saved contact draft", exact: true }).click();
  await detail.getByRole("button", { name: "Edit contact notes", exact: true }).click();
  await notes.getByLabel("Contact notes", { exact: true }).fill(privateDraft);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  // A committed contact changed the target: discard and explicitly review its fresh fingerprint.
  await restorePanel.getByRole("button", { name: "Discard restore preview", exact: true }).click();
  await selectArchive();
  await expect(
    restorePanel.getByRole("heading", { name: "Review exact restore changes", exact: true }),
  ).toBeVisible();
  await restorePanel.getByRole("checkbox").check();
  await restorePanel
    .getByRole("button", { name: "Confirm and restore reviewed archive", exact: true })
    .click();
  await expect(restorePanel.getByRole("status")).toContainText(
    "Restore committed and its acknowledgement validated",
    { timeout: 30_000 },
  );
  expect(await page.evaluate(() => globalThis.coredrillContactRestoreProbe.restoreCommits)).toBe(1);
  await expect(
    page.getByRole("heading", { name: "Reopen local vault after restore", exact: true }),
  ).toBeVisible();
  await expect(primary).toHaveCount(0);
  await expect(network).toHaveCount(0);
  await expect(page.locator(".cd-contact-editor")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(privateDraft);
  const warning = page.waitForEvent("dialog");
  const reopening = restorePanel
    .getByRole("button", { name: "Reload local vault", exact: true })
    .click();
  const dialog = await warning;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.accept();
  await reopening;
  await expect(primary).toBeVisible();
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(network.getByRole("form")).toHaveCount(0);
  await network.getByRole("button", { name: "View contact details", exact: true }).click();
  await expect(detail.locator("p.cd-contact-literal")).toHaveText(
    "Exact original archived contact note",
  );
  await expect(detail).not.toContainText(privateDraft);
  await expect(detail.locator('[data-contact-field="name"]')).toHaveText(
    "Synthetic restored contact",
  );
  await testInfo.attach("contact-restore-retirement.json", {
    body: JSON.stringify({
      actualUiDownloadedArchive: true,
      actualSameVaultRestore: true,
      pendingContactWritePreventsRestoreSubmission: true,
      restoreCommitsWhileContactPending: 0,
      explicitFreshTargetReviewAfterContactCommit: true,
      noFixtureInstaller: true,
      offline: true,
      preRestoreWorkspaceHidden: true,
      explicitReopenWarned: true,
      reopenedDraftRetired: true,
      originalManualValueBasisRetained: true,
    }),
    contentType: "application/json",
  });
});

test("contact directory revision retains deliberate first-page focus before its read busy commit", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await exerciseContactOwnerLifetimes(page, testInfo, "directory");
});

test("normal offline contact screens create, recover and reload exact owned manual facts", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
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
  await page.waitForFunction(
    () => globalThis.coredrillOfflineShell?.getState().registered === true,
  );
  await page.evaluate(() => globalThis.navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => globalThis.navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await exerciseContactWorkspace(page, testInfo);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("contact owner changes, late acknowledgements and actual deletion preserve private lifetime boundaries", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const errors = [];
  const external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:4181/")) return route.continue();
    external.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await page.waitForFunction(
    () => globalThis.coredrillOfflineShell?.getState().registered === true,
  );
  await page.evaluate(() => globalThis.navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => globalThis.navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await exerciseContactOwnerLifetimes(page, testInfo);
  const network = page.getByRole("region", { name: "Stored Network", exact: true });
  await network.getByRole("button", { name: "Create local contact", exact: true }).click();
  const form = network.getByRole("form", { name: "Create local contact", exact: true });
  await form.getByLabel("Contact name", { exact: true }).fill("Synthetic never-stored contact");
  await form
    .getByLabel("Contact notes", { exact: true })
    .fill("PRIVATE_UNSAVED_SYNTHETIC_CONTACT_DELETION");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Review vault deletion", exact: true }).click();
  await page.getByRole("button", { name: "Delete local vault", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill(await dialog.locator("code").innerText());
  await dialog.getByRole("button", { name: "Delete local vault", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Local vault deleted", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".cd-contact-editor")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    "PRIVATE_UNSAVED_SYNTHETIC_CONTACT_DELETION",
  );
  await page.getByRole("button", { name: "Return to an empty workspace", exact: true }).click();
  await initializeDefaultWorkspace(page);
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Network", exact: true })
    .click();
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(network.getByRole("form")).toHaveCount(0);
  await expect(network).toContainText(
    "No contacts were found in this vault, archive and company scope",
  );
  await expect(network).not.toContainText("PRIVATE_UNSAVED_SYNTHETIC_CONTACT_DELETION");
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await testInfo.attach("contact-deletion-retirement.json", {
    body: JSON.stringify({
      actualBrowserVaultDeletion: true,
      offline: true,
      externalRequests: 0,
      unsavedContactDraftRetired: true,
      newVaultNoOldContactsOrDraft: true,
    }),
    contentType: "application/json",
  });
});
