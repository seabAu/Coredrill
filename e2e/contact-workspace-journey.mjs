import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** UI writes use actual selected-runtime SQLite; probes only delay/lose acknowledgements. */
export const exerciseContactWorkspace = async (page, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
  await page.evaluate(() => {
    const root = globalThis.coredrillStorageSpike;
    const original = root.contactWorkspace;
    const probe = {
      creates: 0,
      notes: 0,
      mode: "hold_lose",
      notesMode: "success",
      readMode: "success",
      basisMode: "success",
      basisRelease: null,
      basisCompleted: 0,
      release: null,
    };
    globalThis.coredrillContactUiProbe = probe;
    globalThis.coredrillStorageSpike = {
      ...root,
      contactWorkspace: {
        ...original,
        beginCreation: (vaultId, company) => {
          const draft = original.beginCreation(vaultId, company);
          return {
            ...draft,
            save: async (input) => {
              probe.creates += 1;
              const mode = probe.mode;
              if (mode === "hold_lose")
                await new Promise((resolve) => {
                  probe.release = resolve;
                });
              const result = await draft.save(input);
              if (mode === "hold_lose") throw new Error("PRIVATE_CONTACT_ACK_SENTINEL");
              return result;
            },
          };
        },
        updateNotes: async (input) => {
          probe.notes += 1;
          if (probe.notesMode === "fail_before") throw new Error("PRIVATE_CONTACT_NOTE_SENTINEL");
          const result = await original.updateNotes(input);
          if (probe.notesMode === "lose_after")
            throw new Error("PRIVATE_CONTACT_NOTE_ACK_SENTINEL");
          return result;
        },
        read: async (input) => {
          if (probe.readMode === "failure") throw new Error("PRIVATE_CONTACT_READ_SENTINEL");
          const result = await original.read(input);
          if (result.ok && probe.readMode === "unsupported_basis")
            return { ...result, value: { ...result.value, manualCreation: null } };
          if (result.ok && probe.readMode === "archived")
            return {
              ...result,
              value: {
                ...result.value,
                contact: { ...result.value.contact, archivedAt: result.value.contact.updatedAt },
              },
            };
          return result;
        },
        resolveManualFields: async (value) => {
          if (probe.basisMode === "hold")
            await new Promise((resolve) => {
              probe.basisRelease = resolve;
            });
          const result = await original.resolveManualFields(value);
          probe.basisCompleted += 1;
          return result;
        },
      },
    };
  });
  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  const network = page.getByRole("region", { name: "Stored Network", exact: true });
  const companyName = "Synthetic UI contact company";
  await network.getByRole("button", { name: "Create local company", exact: true }).click();
  const companyForm = network.getByRole("form", { name: "Create local company", exact: true });
  await companyForm.getByLabel("Company name", { exact: true }).fill(companyName);
  await companyForm.getByRole("button", { name: "Save local company", exact: true }).click();
  await expect(companyForm).toContainText("Local save acknowledged");
  await companyForm.getByRole("button", { name: "View saved company", exact: true }).click();
  await companyForm.getByRole("button", { name: "Close saved company draft", exact: true }).click();
  const companyDetail = network.getByRole("region", {
    name: "Stored company details",
    exact: true,
  });
  await expect(companyDetail).toContainText(companyName);
  const companyUrl = page.url();
  const companyId = new URL(companyUrl).pathname.split("/").at(-1);
  await companyDetail
    .getByRole("button", { name: "Create local contact for this company", exact: true })
    .click();
  const create = network.getByRole("form", { name: "Create local contact", exact: true });
  const prefix = "  Synthetic <b>Contact</b> ";
  const name = `${prefix}${"x".repeat(512 - prefix.length - 2)}  `;
  const initialNotes = "  Initial contact note\n<script>neverExecute()</script> 🧭  ";
  await expect(create.getByLabel("Contact name", { exact: true })).toBeFocused();
  await expect(create).toContainText(companyName);
  await create.getByLabel("Contact name", { exact: true }).fill(name);
  await create.getByLabel("Role (optional)", { exact: true }).fill("  Literal <role>  ");
  await create.getByLabel("Email (optional)", { exact: true }).fill("manual@synthetic.example");
  await create
    .getByLabel("Profile URL (optional)", { exact: true })
    .fill("https://synthetic.example/person");
  await create.getByLabel("Contact notes", { exact: true }).fill(initialNotes);
  await create.getByRole("button", { name: "Save local contact", exact: true }).click();
  await expect.poll(() => page.evaluate(() => globalThis.coredrillContactUiProbe.creates)).toBe(1);
  await expect(create.getByLabel("Contact notes", { exact: true })).toBeDisabled();
  await expect(
    create.getByRole("button", { name: "Discard contact draft", exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(create.getByLabel("Contact notes", { exact: true })).toHaveValue(initialNotes);
  await network.getByRole("button", { name: "Companies", exact: true }).click();
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(create.getByLabel("Contact name", { exact: true })).toHaveValue(name);
  await page.evaluate(() => {
    globalThis.coredrillContactUiProbe.release();
  });
  await expect(create).toContainText("Save result uncertain");
  await expect(create.getByLabel("Contact notes", { exact: true })).toHaveJSProperty(
    "readOnly",
    true,
  );
  await expect(
    create.getByRole("button", { name: "Save local contact", exact: true }),
  ).toBeDisabled();
  await expect(network).not.toContainText("PRIVATE_CONTACT_ACK_SENTINEL");
  await create.getByRole("button", { name: "Check stored contact state", exact: true }).click();
  await expect(create).toContainText("Stored contact now matches this draft");
  expect(await page.evaluate(() => globalThis.coredrillContactUiProbe.creates)).toBe(1);
  await create.getByRole("button", { name: "View saved contact", exact: true }).click();
  const detail = network.getByRole("region", { name: "Stored contact details", exact: true });
  await expect(detail).toContainText("Contact detail and value basis read from local storage");
  expect(await detail.locator('[data-contact-field="name"]').textContent()).toBe(name);
  expect(await detail.locator('[data-contact-field="role"]').textContent()).toBe(
    "  Literal <role>  ",
  );
  await expect(detail.locator('[data-contact-field="email"]')).toHaveText(
    "manual@synthetic.example",
  );
  await expect(detail.locator('[data-contact-field="phone"]')).toHaveText("Not recorded");
  expect(await detail.locator("p.cd-contact-literal").textContent()).toBe(initialNotes);
  await expect(detail.locator("script")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("company")).toBe(companyId);
  const selectedUrl = page.url();
  await create.getByRole("button", { name: "Close saved contact draft", exact: true }).click();
  const edit = detail.getByRole("button", { name: "Edit contact notes", exact: true });
  await expect(edit).toBeFocused();
  await edit.click();
  const notes = network.getByRole("form", { name: "Edit contact notes", exact: true });
  const replacement = "  Replacement\n<b>literal contact note</b> 🧭  ";
  await expect(notes.getByLabel("Contact notes", { exact: true })).toBeFocused();
  await notes.getByLabel("Contact notes", { exact: true }).fill(replacement);
  await page.setViewportSize({ width: 1440, height: 900 });
  await primary.getByRole("link", { name: "Pipeline", exact: true }).click();
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  await network.getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(notes).toHaveCount(0);
  await network.getByRole("button", { name: "Return to contact draft", exact: true }).click();
  await expect(notes.getByLabel("Contact notes", { exact: true })).toHaveValue(replacement);
  await page.evaluate(() => {
    globalThis.coredrillContactUiProbe.notesMode = "fail_before";
  });
  await notes.getByRole("button", { name: "Save contact notes", exact: true }).click();
  await expect(notes).toContainText("Save result uncertain");
  await notes.getByRole("button", { name: "Check stored contact state", exact: true }).click();
  await expect(notes).toContainText("Stored contact still matches the original view");
  await expect(notes.getByLabel("Contact notes", { exact: true })).toHaveValue(replacement);
  await page.evaluate(() => {
    globalThis.coredrillContactUiProbe.notesMode = "lose_after";
  });
  await notes.getByRole("button", { name: "Save contact notes", exact: true }).click();
  await expect(notes).toContainText("Save result uncertain");
  await page.evaluate(() => {
    globalThis.coredrillContactUiProbe.readMode = "failure";
  });
  await notes.getByRole("button", { name: "Check stored contact state", exact: true }).click();
  await expect(notes).toContainText("Save result uncertain");
  await expect(network).not.toContainText("PRIVATE_CONTACT_READ_SENTINEL");
  await page.evaluate(() => {
    globalThis.coredrillContactUiProbe.readMode = "success";
  });
  await notes.getByRole("button", { name: "Check stored contact state", exact: true }).click();
  await expect(notes).toContainText("Stored contact now matches this draft");
  expect(await page.evaluate(() => globalThis.coredrillContactUiProbe.notes)).toBe(2);
  await notes.getByRole("button", { name: "Close saved contact draft", exact: true }).click();
  await expect.poll(() => detail.locator("p.cd-contact-literal").textContent()).toBe(replacement);
  // Fault after a successful read retains explicitly stale facts and cannot enable edits.
  await page.evaluate(() => {
    globalThis.coredrillContactUiProbe.readMode = "failure";
  });
  await detail.getByRole("button", { name: "Refresh selected contact", exact: true }).click();
  await expect(detail).toContainText("may be stale");
  await expect(edit).toBeDisabled();
  await page.evaluate(() => {
    globalThis.coredrillContactUiProbe.readMode = "success";
  });
  await detail.getByRole("button", { name: "Refresh selected contact", exact: true }).click();
  await expect(edit).toBeEnabled();
  // Synthetic display-basis/archive responses never become stored facts or legacy-SQL proof.
  await page.evaluate(() => {
    globalThis.coredrillContactUiProbe.readMode = "unsupported_basis";
  });
  await detail.getByRole("button", { name: "Refresh selected contact", exact: true }).click();
  await expect(detail.locator('[data-contact-field="email"]')).toHaveText(
    "Value withheld — basis not established.",
  );
  await expect(detail).not.toContainText("manual@synthetic.example");
  await expect(detail.locator('[data-contact-field="phone"]')).toHaveText("Not recorded");
  await expect(edit).toBeEnabled();
  await edit.click();
  await expect(notes.getByRole("textbox")).toHaveCount(1);
  await expect(notes).not.toContainText("manual@synthetic.example");
  await notes.getByRole("button", { name: "Discard contact draft", exact: true }).click();
  await notes.getByRole("button", { name: "Keep contact draft", exact: true }).click();
  await expect(notes.getByLabel("Contact notes", { exact: true })).toHaveValue(replacement);
  await notes.getByRole("button", { name: "Discard contact draft", exact: true }).click();
  await notes.getByRole("button", { name: "Confirm discard contact draft", exact: true }).click();
  await page.evaluate(() => {
    globalThis.coredrillContactUiProbe.readMode = "archived";
  });
  await detail.getByRole("button", { name: "Refresh selected contact", exact: true }).click();
  await expect(detail).toContainText("Archived at");
  await expect(edit).toBeDisabled();
  await page.evaluate(() => {
    globalThis.coredrillContactUiProbe.readMode = "success";
  });
  await detail.getByRole("button", { name: "Refresh selected contact", exact: true }).click();
  await expect(edit).toBeEnabled();
  // A retired asynchronous digest cannot publish private values or steal deliberate focus.
  await page.evaluate(() => {
    globalThis.coredrillContactUiProbe.basisMode = "hold";
  });
  await detail.getByRole("button", { name: "Refresh selected contact", exact: true }).click();
  await page.waitForFunction(() => globalThis.coredrillContactUiProbe.basisRelease !== null);
  await network
    .getByRole("button", { name: "Show contacts for all companies", exact: true })
    .click();
  await expect(detail).toHaveCount(0);
  const deliberate = network.getByRole("button", { name: "Companies", exact: true });
  await deliberate.focus();
  const completedBasis = await page.evaluate(
    () => globalThis.coredrillContactUiProbe.basisCompleted,
  );
  await page.evaluate(() => {
    const probe = globalThis.coredrillContactUiProbe;
    probe.basisMode = "success";
    probe.basisRelease();
  });
  await expect
    .poll(() => page.evaluate(() => globalThis.coredrillContactUiProbe.basisCompleted))
    .toBe(completedBasis + 1);
  await expect(detail).toHaveCount(0);
  await expect(deliberate).toBeFocused();
  await page.goBack();
  await expect(edit).toBeEnabled();
  await detail.getByRole("button", { name: "View linked company", exact: true }).click();
  expect(page.url()).toBe(companyUrl);
  await companyDetail.getByRole("button", { name: "View linked contacts", exact: true }).click();
  await expect(
    network
      .getByRole("list", { name: "Stored contacts on this page", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(1);
  await network.getByRole("button", { name: "View contact details", exact: true }).click();
  expect(page.url()).toBe(selectedUrl);
  await page.goBack();
  await expect(detail).toHaveCount(0);
  await page.goForward();
  await expect(detail.locator('[data-contact-field="name"]')).toHaveText(name);
  await page.reload();
  await expect(detail).toContainText("Contact detail and value basis read from local storage");
  expect(page.url()).toBe(selectedUrl);
  expect(await detail.locator("p.cd-contact-literal").textContent()).toBe(replacement);
  await expect(detail.locator('[data-contact-field="email"]')).toHaveText(
    "manual@synthetic.example",
  );
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const refresh = detail.getByRole("button", { name: "Refresh selected contact", exact: true });
  await refresh.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(refresh).toBeFocused();
  const focus = await refresh.evaluate((element) => ({
    visible: element.matches(":focus-visible"),
    outline: Number.parseFloat(globalThis.getComputedStyle(element).outlineWidth),
  }));
  expect(focus.visible).toBe(true);
  expect(focus.outline).toBeGreaterThanOrEqual(2);
  expect(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
    ),
  ).toBe(true);
  const accessibility = await new AxeBuilder({ page })
    .include('[aria-label="Stored Network"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await network.screenshot({ path: testInfo.outputPath("contact-workspace-320.png") });
  await edit.click();
  const unsaved = `${replacement}\nUNSAVED_SYNTHETIC_CONTACT_DRAFT`;
  await notes.getByLabel("Contact notes", { exact: true }).fill(unsaved);
  const timeOrigin = await page.evaluate(() => globalThis.performance.timeOrigin);
  const warning = page.waitForEvent("dialog");
  const attemptedReload = page.evaluate(() => globalThis.location.reload()).catch(() => null);
  const dialog = await warning;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await attemptedReload;
  expect(await page.evaluate(() => globalThis.performance.timeOrigin)).toBe(timeOrigin);
  await expect(notes.getByLabel("Contact notes", { exact: true })).toHaveValue(unsaved);
  expect(
    (await new AxeBuilder({ page }).include('[aria-label="Stored Network"]').analyze()).violations,
  ).toEqual([]);
  await notes.screenshot({ path: testInfo.outputPath("contact-notes-320.png") });
  await notes.getByRole("button", { name: "Discard contact draft", exact: true }).click();
  await notes.getByRole("button", { name: "Confirm discard contact draft", exact: true }).click();
  await expect(edit).toBeFocused();
  // Invalid and ambiguous URL cohorts must never silently request all contacts.
  await page.goto("/network/contacts?company=&company=not-a-company");
  await expect(network.getByRole("alert")).toContainText("No contact read was submitted");
  await expect(
    network.getByRole("list", { name: "Stored contacts on this page", exact: true }),
  ).toHaveCount(0);
  await expect(detail).toHaveCount(0);
  const proof = {
    normalUiCreation: true,
    fixtureInstaller: false,
    capturedCompanyVersion: true,
    literalBoundsAndNullableMethods: true,
    exactManualBasis: true,
    noRepeatWritesDuringRecovery: true,
    staleReadDisablesEditing: true,
    syntheticUnknownBasisWithheldAndArchivedReadonly: true,
    retiredDigestAndDeliberateFocus: true,
    retainedDraftAcrossNavigationAndReflow: true,
    companyLinksAndScopedHistoryReload: true,
    invalidCohortNoFallback: true,
    forcedColorsReducedMotion320KeyboardAxe: true,
    cancelledUnloadRetainsPrivateDraft: true,
  };
  await testInfo.attach("normal-contact-workspace.json", {
    body: JSON.stringify({ ...proof, focus }),
    contentType: "application/json",
  });
  return proof;
};
