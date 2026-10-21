import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";

for (const pending of [false, true]) {
  test(`single-vault settings deletion clears private views and retains ${pending ? "pending cleanup" : "successful deletion"} notice`, async ({
    page,
  }) => {
    await page.goto("/");
    await initializeDefaultWorkspace(page);
    const primary = page.getByRole("navigation", { name: "Primary", exact: true });
    await primary.getByRole("link", { name: "Documents", exact: true }).click();
    await page.getByRole("button", { name: "New document", exact: true }).click();
    const form = page.getByRole("form", { name: "New reusable document" });
    await form.getByLabel("Document title", { exact: true }).fill("Synthetic deletion resume");
    await form
      .getByLabel("Initial document text", { exact: true })
      .fill("Synthetic private deletion evidence");
    await form.getByRole("button", { name: "Create document locally", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Synthetic deletion resume", exact: true }),
    ).toBeVisible();
    if (pending) {
      // UI-only fault projection: actual deletion runs; only cleanup result is substituted.
      await page.evaluate(() => {
        const api = globalThis.coredrillStorageSpike;
        globalThis.coredrillStorageSpike = {
          ...api,
          deleteCurrentVault: async (input) => {
            const result = await api.deleteCurrentVault(input);
            return result.ok
              ? { ok: true, value: { ...result.value, status: "cleanup_pending" } }
              : result;
          },
        };
      });
    }
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Browser vault", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Review vault deletion", exact: true }).click();
    await expect(page.getByTestId("vault-deletion-settings")).toBeVisible();
    await page.getByRole("button", { name: "Delete local vault", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const phrase = await dialog.locator("code").innerText();
    await expect(
      dialog.getByRole("button", { name: "Delete local vault", exact: true }),
    ).toBeDisabled();
    await dialog.getByRole("textbox").fill(phrase);
    await dialog.getByRole("button", { name: "Delete local vault", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: pending ? "Local vault deleted; cleanup pending" : "Local vault deleted",
        exact: true,
      }),
    ).toBeVisible();
    await expect(primary).toHaveCount(0);
    await expect(page.locator(".cd-document-editor-workspace")).toHaveCount(0);
    await expect(
      page.getByText("Synthetic private deletion evidence", { exact: false }),
    ).toHaveCount(0);
    if (pending) {
      await expect(page.getByRole("status")).toContainText("Automatic cleanup is not claimed");
      await expect(page.getByRole("status")).not.toContainText("retry");
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole("button", { name: "Return to an empty workspace", exact: true }).click();
    await initializeDefaultWorkspace(page);
    await primary.getByRole("link", { name: "Documents", exact: true }).click();
    await expect(page.locator(".cd-document-card")).toHaveCount(0);
  });
}

test("deletion warning hands off to owned export controls without deletion, implicit consent or saving", async ({
  page,
}, testInfo) => {
  const external = [];
  const errors = [];
  let downloads = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("download", () => {
    downloads += 1;
  });
  await page.route("**/*", (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:4181/")) return route.continue();
    external.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  const before = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await page.evaluate(() => {
    const api = globalThis.coredrillStorageSpike;
    globalThis.coredrillWarningExportCalls = { prepare: 0, save: 0, delete: 0 };
    globalThis.coredrillStorageSpike = {
      ...api,
      vaultExport: {
        ...api.vaultExport,
        prepare: (input) => {
          globalThis.coredrillWarningExportCalls.prepare += 1;
          return api.vaultExport.prepare(input);
        },
        save: (input) => {
          globalThis.coredrillWarningExportCalls.save += 1;
          return api.vaultExport.save(input);
        },
      },
      deleteCurrentVault: (input) => {
        globalThis.coredrillWarningExportCalls.delete += 1;
        return api.deleteCurrentVault(input);
      },
    };
  });
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const panel = page.getByRole("region", { name: "Portable vault export", exact: true });
  const review = page.getByRole("button", { name: "Review vault deletion", exact: true });
  await review.click();
  await page.getByRole("button", { name: "Delete local vault", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill(await dialog.locator("code").innerText());
  await expect(
    dialog.getByRole("button", { name: "Delete local vault", exact: true }),
  ).toBeEnabled();
  const exportFromWarning = dialog.getByRole("button", {
    name: "Export portable archive",
    exact: true,
  });
  await exportFromWarning.focus();
  await exportFromWarning.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(panel.getByRole("checkbox")).toBeFocused();
  await expect(panel.getByRole("checkbox")).not.toBeChecked();
  await expect(
    panel.getByRole("button", { name: "Prepare portable archive", exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => globalThis.coredrillWarningExportCalls)).toEqual({
    prepare: 0,
    save: 0,
    delete: 0,
  });
  await panel.getByRole("checkbox").press("Space");
  await panel.getByRole("button", { name: "Prepare portable archive", exact: true }).click();
  const prepared = panel.getByRole("heading", { name: "Prepared archive snapshot", exact: true });
  await expect(prepared).toBeVisible();
  const identity = await panel.locator("code").allTextContents();
  await page.setViewportSize({ width: 320, height: 900 });
  await review.click();
  await page.getByRole("button", { name: "Delete local vault", exact: true }).click();
  await expect(dialog.getByRole("textbox")).toHaveValue("");
  await expect(
    dialog.getByRole("button", { name: "Delete local vault", exact: true }),
  ).toBeDisabled();
  await expect(dialog).toHaveCSS("opacity", "1");
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  );
  await exportFromWarning.focus();
  await exportFromWarning.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(prepared).toBeFocused();
  expect(await panel.locator("code").allTextContents()).toEqual(identity);
  await page.setViewportSize({ width: 1440, height: 900 });
  await review.click();
  await page.getByRole("button", { name: "Delete local vault", exact: true }).click();
  // The modal intentionally aria-hides the surrounding shell until it closes.
  const search = page.locator(".cd-global-search-trigger");
  const searchHandle = await search.elementHandle();
  await exportFromWarning.evaluate(async (button, target) => {
    button.click();
    await Promise.resolve();
    target?.focus();
  }, searchHandle);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(search).toBeFocused();
  expect(await page.evaluate(() => globalThis.coredrillWarningExportCalls)).toEqual({
    prepare: 1,
    save: 0,
    delete: 0,
  });
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(before);
  expect(downloads).toBe(0);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).include('[aria-label="Local vault settings"]').analyze())
      .violations,
  ).toEqual([]);
  await testInfo.attach("deletion-export-handoff-proof.json", {
    body: JSON.stringify({
      coldConsentFocused: true,
      consentNotGranted: true,
      warmSnapshotFocused: true,
      samePreparedIdentity: true,
      explicitPrepareCalls: 1,
      saveCalls: 0,
      deleteCalls: 0,
      browserDownloads: 0,
      unchangedSqlite: true,
      freshTypedConfirmationRequired: true,
      deliberateFocusNotStolen: true,
      keyboardNarrowAxe: true,
      externalRequests: 0,
    }),
    contentType: "application/json",
  });
});
