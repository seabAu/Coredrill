import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Normal UI consent/writes over the selected real adapter. Only acknowledgement delivery is faulted. */
export const exerciseNormalContactDeletion = async (page, testInfo) => {
  const network = page.getByRole("region", { name: "Stored Network", exact: true });
  const details = page.getByRole("region", { name: "Stored contact details", exact: true });
  const review = page.getByRole("region", { name: "Review local contact deletion", exact: true });
  const contactId = new URL(page.url()).pathname.split("/").at(-1);
  const before = await page.evaluate(async (contactId) => {
    const api = globalThis.coredrillStorageSpike;
    const identity = await api.vault.inspect();
    if (!identity.ok || !identity.value.vault) throw new Error("Synthetic owner unavailable");
    const vaultId = identity.value.vault.id;
    const history = await api.contactHistory.page({
      specVersion: 1,
      expectedVaultId: vaultId,
      contactId,
    });
    if (!history.ok || history.value.items.length === 0)
      throw new Error("Synthetic history unavailable");
    const jobId = history.value.items[0].currentJob.id;
    const timeline = await api.pipeline.timeline({ jobId });
    if (!timeline.ok) throw new Error("Synthetic timeline unavailable");
    const probe = { calls: 0, inspections: 0, committed: false, release: null };
    globalThis.contactDeletionUiProbe = probe;
    globalThis.coredrillStorageSpike = {
      ...api,
      contactDeletion: {
        begin: (viewed) => {
          const action = api.contactDeletion.begin(viewed);
          return {
            ...action,
            remove: async (consent) => {
              probe.calls++;
              const result = await action.remove(consent);
              if (!result.ok) return result;
              probe.committed = true;
              await new Promise((resolve) => {
                probe.release = resolve;
              });
              return {
                ok: false,
                error: { code: "internal", message: "PRIVATE_DELETE_ACK", retryable: false },
              };
            },
            inspect: async () => {
              probe.inspections++;
              return action.inspect();
            },
          };
        },
      },
    };
    return { vaultId, jobId, timeline: timeline.value, originalApiInstalled: true };
  }, contactId);
  // Navigation composes the new test-only acknowledgement wrapper before starting the review.
  await network.getByRole("button", { name: "Back to contacts", exact: true }).click();
  await network
    .getByRole("listitem")
    .filter({
      has: page.getByRole("heading", { name: "Synthetic interaction entry contact", exact: true }),
    })
    .getByRole("button", { name: "View contact details", exact: true })
    .click();
  await network.getByRole("button", { name: "Review contact deletion", exact: true }).click();
  await expect(review.getByRole("status")).toBeFocused();
  expect(await review.innerText()).not.toContain("Synthetic interaction entry contact");
  await expect(review).toContainText("historical interview contact IDs");
  await expect(review).toContainText("not an all-copies erasure guarantee");
  const consent = review.getByLabel("Type DELETE CONTACT to confirm this local deletion", {
    exact: true,
  });
  const remove = review.getByRole("button", { name: "Delete this local contact", exact: true });
  await consent.fill("delete contact");
  await expect(remove).toBeDisabled();
  await consent.fill("DELETE CONTACT");
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await expect(consent).toHaveValue("DELETE CONTACT");
  expect(
    (
      await new AxeBuilder({ page })
        .include('[aria-label="Review local contact deletion"]')
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await remove.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => globalThis.contactDeletionUiProbe.committed);
  await expect(remove).toBeDisabled();
  await expect(consent).toBeDisabled();
  await expect(
    review.getByRole("button", { name: "Close contact deletion review", exact: true }),
  ).toBeDisabled();
  await network.getByRole("button", { name: "Create local contact", exact: true }).focus();
  // Navigation hides the original review fields without rebinding the pending target.
  await network.getByRole("button", { name: "Back to contacts", exact: true }).click();
  await expect(review).toContainText("retained for another selection");
  await expect(consent).toHaveCount(0);
  await review
    .getByRole("button", { name: "Return to contact deletion review", exact: true })
    .click();
  const deliberateFocus = network.getByRole("button", { name: "Contacts", exact: true });
  await deliberateFocus.focus();
  await page.evaluate(() => globalThis.contactDeletionUiProbe.release());
  await expect(review.getByRole("status")).toContainText("Deletion may have committed");
  await expect(deliberateFocus).toBeFocused();
  await expect(remove).toBeDisabled();
  expect(await page.evaluate(() => globalThis.contactDeletionUiProbe.calls)).toBe(1);
  expect(await page.evaluate(() => globalThis.contactDeletionUiProbe.inspections)).toBe(0);
  expect(await page.locator("body").innerText()).not.toContain("PRIVATE_DELETE_ACK");
  await review.getByRole("button", { name: "Check contact deletion state", exact: true }).click();
  await expect(review.getByRole("status")).toContainText("does not establish who removed them");
  await expect(details).toHaveCount(0);
  await review.screenshot({ path: testInfo.outputPath("normal-contact-deletion-320.png") });
  expect(
    await page.evaluate(() => ({
      writes: globalThis.contactDeletionUiProbe.calls,
      reads: globalThis.contactDeletionUiProbe.inspections,
    })),
  ).toEqual({ writes: 1, reads: 1 });
  const after = await page.evaluate(
    async ({ vaultId, jobId, contactId }) => {
      const api = globalThis.coredrillStorageSpike;
      const contact = await api.contactWorkspace.read({
        specVersion: 1,
        expectedVaultId: vaultId,
        contactId,
      });
      const timeline = await api.pipeline.timeline({ jobId });
      return { contact, timeline };
    },
    { ...before, contactId },
  );
  expect(after.contact).toMatchObject({ ok: false, error: { code: "not_found" } });
  expect(after.timeline.ok).toBe(true);
  expect(Date.parse(after.timeline.value.asOf)).toBeGreaterThanOrEqual(
    Date.parse(before.timeline.asOf),
  );
  expect(after.timeline.value).toEqual({
    ...before.timeline,
    asOf: after.timeline.value.asOf,
    items: before.timeline.items.map((item) =>
      item.kind === "interaction" && item.contactId === contactId
        ? { ...item, contactId: null }
        : item,
    ),
  });
  await review.getByRole("button", { name: "Close contact deletion review", exact: true }).click();
  await expect(
    network.getByRole("button", { name: "Create local contact", exact: true }),
  ).toBeFocused();
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(network).toBeVisible();
  await expect(review).toHaveCount(0);
  await expect(
    network.getByRole("heading", { name: "Synthetic interaction entry contact", exact: true }),
  ).toHaveCount(0);
  // A second ordinary form exercises acknowledged deletion without the delivery fault wrapper.
  await network.getByRole("button", { name: "Create local contact", exact: true }).click();
  const create = network.getByRole("form", { name: "Create local contact", exact: true });
  await create.getByLabel("Contact name", { exact: true }).fill("Synthetic acknowledged deletion");
  await create.getByRole("button", { name: "Save local contact", exact: true }).click();
  await expect(create).toContainText("Local save acknowledged");
  await create.getByRole("button", { name: "View saved contact", exact: true }).click();
  await create.getByRole("button", { name: "Close saved contact draft", exact: true }).click();
  await network.getByRole("button", { name: "Edit contact notes", exact: true }).click();
  await expect(
    network.getByRole("button", { name: "Review contact deletion", exact: true }),
  ).toBeDisabled();
  const notes = network.getByRole("form", { name: "Edit contact notes", exact: true });
  await notes.getByLabel("Contact notes", { exact: true }).fill("Synthetic retained unsaved notes");
  await expect(
    network.getByRole("button", { name: "Review contact deletion", exact: true }),
  ).toBeDisabled();
  await expect(notes.getByLabel("Contact notes", { exact: true })).toHaveValue(
    "Synthetic retained unsaved notes",
  );
  await notes.getByRole("button", { name: "Discard contact draft", exact: true }).click();
  await notes.getByRole("button", { name: "Confirm discard contact draft", exact: true }).click();
  const entry = page.getByRole("region", { name: "Record local interaction", exact: true });
  await entry.getByLabel("Linked stored job", { exact: true }).selectOption(before.jobId);
  await entry.getByRole("button", { name: "New interaction", exact: true }).click();
  await entry
    .getByLabel("Interaction summary", { exact: true })
    .fill("Synthetic retained unsaved interaction");
  await expect(
    network.getByRole("button", { name: "Review contact deletion", exact: true }),
  ).toBeDisabled();
  await expect(entry.getByLabel("Interaction summary", { exact: true })).toHaveValue(
    "Synthetic retained unsaved interaction",
  );
  await entry.getByRole("button", { name: "Discard interaction draft", exact: true }).click();
  await entry
    .getByRole("button", { name: "Confirm discard interaction draft", exact: true })
    .click();
  await network.getByRole("button", { name: "Review contact deletion", exact: true }).click();
  await consent.fill("DELETE CONTACT");
  await remove.click();
  await expect(review.getByRole("status")).toContainText("Local deletion was acknowledged");
  await expect(review.getByRole("status")).toBeFocused();
  await expect(details).toHaveCount(0);
  await review.getByRole("button", { name: "Close contact deletion review", exact: true }).click();
  await expect(
    network.getByRole("button", { name: "Create local contact", exact: true }),
  ).toBeFocused();
  const proof = {
    normalUiConsent: true,
    selectedRealAdapter: true,
    actualCommittedLostAcknowledgement: true,
    explicitReadOnlyAbsence: true,
    noCausalOverclaim: true,
    faultWrapperWrites: 1,
    acknowledgedWrites: 1,
    normalUiDeletionWrites: 2,
    acknowledgedNormalUiDeletion: true,
    existingNotesDraftProtected: true,
    existingInteractionDraftProtected: true,
    deliberateFocusPreserved: true,
    inspections: 1,
    preservedTimeline: true,
    offlineReload: true,
    pendingNavigation: true,
    keyboard320ForcedColorsAxe: true,
    packagedWebviewProven: false,
  };
  await testInfo.attach("normal-contact-deletion.json", {
    body: JSON.stringify(proof),
    contentType: "application/json",
  });
  return proof;
};
