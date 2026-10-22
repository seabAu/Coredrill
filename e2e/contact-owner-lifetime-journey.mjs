import { expect } from "@playwright/test";

/** Actual UI-created records/writes; only held acknowledgement and observed owner are synthetic. */
export const exerciseContactOwnerLifetimes = async (page, testInfo, focusTarget = "detail") => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  const network = page.getByRole("region", { name: "Stored Network", exact: true });
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  const create = network.getByRole("form", { name: "Create local contact", exact: true });
  const selected = network.getByRole("region", { name: "Stored contact details", exact: true });
  const ids = [];
  for (const suffix of ["A", "B"]) {
    await network.getByRole("button", { name: "Create local contact", exact: true }).click();
    await create
      .getByLabel("Contact name", { exact: true })
      .fill(`Synthetic owned contact ${suffix}`);
    await create.getByLabel("Contact notes", { exact: true }).fill(`Original ${suffix} local note`);
    await create.getByRole("button", { name: "Save local contact", exact: true }).click();
    await expect(create).toContainText("Local save acknowledged");
    await create.getByRole("button", { name: "View saved contact", exact: true }).click();
    ids.push(new URL(page.url()).pathname.split("/").at(-1));
    await create.getByRole("button", { name: "Close saved contact draft", exact: true }).click();
    await expect(selected.locator("p.cd-contact-literal")).toHaveText(
      `Original ${suffix} local note`,
    );
  }
  await page.evaluate(() => {
    const original = globalThis.coredrillStorageSpike;
    const probe = {
      original,
      foreign: false,
      notes: 0,
      completed: 0,
      release: null,
      deletionReviews: 0,
    };
    globalThis.coredrillContactOwnerProbe = probe;
    // Model engines that blur a focused control immediately when React disables it.
    const originalSetAttribute = globalThis.Element.prototype.setAttribute;
    probe.restoreSetAttribute = () => {
      globalThis.Element.prototype.setAttribute = originalSetAttribute;
    };
    globalThis.Element.prototype.setAttribute = function (name, value) {
      const blurDisabledRead =
        name === "disabled" &&
        this === globalThis.document.activeElement &&
        this.matches("[data-contact-detail-refresh], [data-contact-read=first]");
      originalSetAttribute.call(this, name, value);
      if (blurDisabledRead) this.blur();
    };
    globalThis.coredrillStorageSpike = {
      ...original,
      vault: {
        ...original.vault,
        inspect: async () => {
          const result = await original.vault.inspect();
          if (!probe.foreign || !result.ok || result.value.vault === null) return result;
          return {
            ...result,
            value: {
              ...result.value,
              vault: {
                ...result.value.vault,
                id: "0199b363-0000-7000-8000-000000000099",
                name: "Synthetic observed foreign vault",
              },
            },
          };
        },
      },
      contactWorkspace: {
        ...original.contactWorkspace,
        updateNotes: async (input) => {
          probe.notes += 1;
          await new Promise((resolve) => {
            probe.release = resolve;
          });
          const result = await original.contactWorkspace.updateNotes(input);
          probe.completed += 1;
          return result;
        },
      },
      prepareVaultDeletion: (...args) => {
        probe.deletionReviews += 1;
        return original.prepareVaultDeletion(...args);
      },
    };
  });
  const list = network.getByRole("list", { name: "Stored contacts on this page", exact: true });
  const row = (suffix) =>
    list.getByRole("listitem").filter({
      has: page.getByRole("heading", { name: `Synthetic owned contact ${suffix}`, exact: true }),
    });
  await row("A").getByRole("button", { name: "View contact details", exact: true }).click();
  await selected.getByRole("button", { name: "Edit contact notes", exact: true }).click();
  const notes = network.getByRole("form", { name: "Edit contact notes", exact: true });
  const committed = "  Original A's held update\n<b>literal</b>  ";
  await notes.getByLabel("Contact notes", { exact: true }).fill(committed);
  await notes.getByRole("button", { name: "Save contact notes", exact: true }).click();
  await page.waitForFunction(() => globalThis.coredrillContactOwnerProbe.release !== null);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const deletionReview = page.getByRole("button", { name: "Review vault deletion", exact: true });
  await expect(deletionReview).toBeDisabled();
  const exportPanel = page.getByRole("region", { name: "Portable vault export", exact: true });
  await expect(exportPanel.getByRole("checkbox")).toBeDisabled();
  await expect(
    exportPanel.getByRole("button", { name: "Prepare portable archive", exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => globalThis.coredrillContactOwnerProbe.deletionReviews)).toBe(0);
  const restorePanel = page.getByRole("region", { name: "Portable vault restore", exact: true });
  if (await page.evaluate(() => globalThis.coredrillStorageSpike.runtimeKind === "native"))
    await expect(
      restorePanel.getByRole("button", { name: "Choose archive to review", exact: true }),
    ).toBeEnabled();
  else
    await expect(
      restorePanel.getByLabel("Choose archive to review", { exact: true }),
    ).toBeEnabled();
  await expect(restorePanel).toContainText("Selection and inspection do not restore data");
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await row("B").getByRole("button", { name: "View contact details", exact: true }).click();
  await expect(selected.locator("p.cd-contact-literal")).toHaveText("Original B local note");
  await expect(notes).toHaveCount(0);
  const deliberate =
    focusTarget === "detail"
      ? selected.getByRole("button", { name: "Refresh selected contact", exact: true })
      : network.getByRole("button", { name: "Load first contact page", exact: true });
  await deliberate.focus();
  await page.evaluate(() => globalThis.coredrillContactOwnerProbe.release());
  await expect
    .poll(() => page.evaluate(() => globalThis.coredrillContactOwnerProbe.completed))
    .toBe(1);
  await expect(
    selected.getByRole("button", { name: "Edit contact notes", exact: true }),
  ).toBeDisabled();
  await expect(selected.locator("p.cd-contact-literal")).toHaveText("Original B local note");
  await expect(selected).not.toContainText(committed);
  await expect(deliberate).toBeFocused();
  await page.evaluate(() => globalThis.coredrillContactOwnerProbe.restoreSetAttribute());
  await network.getByRole("button", { name: "Return to contact draft", exact: true }).click();
  await expect(notes).toContainText("Local save acknowledged");
  await notes.getByRole("button", { name: "Close saved contact draft", exact: true }).click();
  await expect(selected.locator("p.cd-contact-literal")).toHaveText(committed);
  const actual = await page.evaluate(async (contactIds) => {
    const api = globalThis.coredrillContactOwnerProbe.original;
    const inspected = await api.vault.inspect();
    if (!inspected.ok || inspected.value.vault === null)
      throw new Error("Original vault unavailable");
    return Promise.all(
      contactIds.map((contactId) =>
        api.contactWorkspace.read({
          specVersion: 1,
          expectedVaultId: inspected.value.vault.id,
          contactId,
        }),
      ),
    );
  }, ids);
  expect(actual[0]).toMatchObject({
    ok: true,
    value: { contact: { notes: committed, rowVersion: 2 } },
  });
  expect(actual[1]).toMatchObject({
    ok: true,
    value: { contact: { notes: "Original B local note", rowVersion: 1 } },
  });
  // Synthetic observed session is not a stored vault or a claim of a multi-vault feature.
  await selected.getByRole("button", { name: "Edit contact notes", exact: true }).click();
  const privateDraft = "UNSAVED_SYNTHETIC_CONTACT_FOREIGN_OWNER";
  await notes.getByLabel("Contact notes", { exact: true }).fill(privateDraft);
  await page.evaluate(() => {
    globalThis.coredrillContactOwnerProbe.foreign = true;
  });
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Refresh storage health", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Local vault settings", exact: true }),
  ).toContainText("Synthetic observed foreign vault");
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(network).toContainText("A contact draft is retained for another vault");
  await expect(network.getByRole("form")).toHaveCount(0);
  await expect(network.getByRole("textbox", { name: "Contact notes", exact: true })).toHaveCount(0);
  await expect(network).not.toContainText(privateDraft);
  await expect(
    network.getByRole("button", { name: "Create local contact", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => {
    globalThis.coredrillContactOwnerProbe.foreign = false;
  });
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Refresh storage health", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Local storage health refreshed" }),
  ).toBeVisible();
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await network.getByRole("button", { name: "Return to contact draft", exact: true }).click();
  await expect(notes.getByLabel("Contact notes", { exact: true })).toHaveValue(privateDraft);
  expect(await page.evaluate(() => globalThis.coredrillContactOwnerProbe.notes)).toBe(1);
  await notes.getByRole("button", { name: "Discard contact draft", exact: true }).click();
  await notes.getByRole("button", { name: "Confirm discard contact draft", exact: true }).click();
  await expect(selected.locator("p.cd-contact-literal")).toHaveText(committed);
  const proof = {
    actualUiCreatedRecords: true,
    originalNotesWriteOnly: true,
    otherContactUnchanged: true,
    lateAcknowledgementPreservesSelectionAndFocus: true,
    syntheticObservedForeignOwnerHidesAndRetainsPrivateDraft: true,
    noStoredForeignVaultCreated: true,
    pendingContactMutationDisablesDeletionAndExport: true,
    restoreSelectionIsReadOnlyAndRemainsAvailable: true,
    deletionReviewsWhilePending: 0,
    notesWrites: 1,
    earlyDisabledBlurModel: true,
    focusTarget,
  };
  await testInfo.attach("contact-owner-lifetimes.json", {
    body: JSON.stringify(proof),
    contentType: "application/json",
  });
  return proof;
};
