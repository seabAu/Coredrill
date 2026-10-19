import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("flushes local document navigation, blocks failed Back, and ignores abandoned loads offline", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const external = [];
  await page.route("**/*", async (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:4181/")) return route.continue();
    external.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  await page.goto("/app-shell.html");
  await page.waitForFunction(
    () => globalThis.coredrillOfflineShell?.getState().registered === true,
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  const primary = page.getByRole("navigation", { name: "Primary" });
  await primary.getByRole("link", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  const form = page.getByRole("form", { name: "New reusable document" });
  await form.getByLabel("Document title", { exact: true }).fill("Navigation resume");
  await form.getByLabel("Initial document text", { exact: true }).fill("Initial saved text");
  await form.getByRole("button", { name: "Create document locally", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Document content editor", exact: true });
  await expect(editor).toBeVisible();
  const documentId = new URL(page.url()).pathname.split("/").at(-1);
  await page.evaluate(() => {
    const api = globalThis.coredrillStorageSpike;
    globalThis.coredrillNavigationTest = { api, saves: 0, release: null };
    globalThis.coredrillStorageSpike = {
      ...api,
      saveDocumentEditorDraft: async (input) => {
        globalThis.coredrillNavigationTest.saves += 1;
        await new Promise((resolve) => {
          globalThis.coredrillNavigationTest.release = resolve;
        });
        return api.saveDocumentEditorDraft(input);
      },
    };
  });
  await editor.fill("Draft saved by navigation");
  const unloadPrompt = page.waitForEvent("dialog");
  const reloadAttempt = page.reload({ timeout: 5_000 }).catch(() => null);
  const prompt = await unloadPrompt;
  expect(prompt.type()).toBe("beforeunload");
  await prompt.dismiss();
  await reloadAttempt;
  await expect(editor).toHaveText("Draft saved by navigation");
  await primary.getByRole("link", { name: "Pipeline", exact: true }).click();
  await primary.getByRole("link", { name: "Documents", exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await expect(page).toHaveURL(new RegExp(`/documents/${documentId}$`, "u"));
  await page.waitForFunction(() => globalThis.coredrillNavigationTest.release !== null);
  await page.evaluate(() => globalThis.coredrillNavigationTest.release());
  await expect(page.locator(".cd-document-card")).toHaveCount(1);
  expect(await page.evaluate(() => globalThis.coredrillNavigationTest.saves)).toBe(1);
  await page.evaluate(() => {
    globalThis.coredrillStorageSpike = globalThis.coredrillNavigationTest.api;
  });
  const stored = await page.evaluate(
    (id) => globalThis.coredrillStorageSpike.openDocumentEditor(id),
    documentId,
  );
  expect(stored).toMatchObject({
    ok: true,
    value: {
      draft: { plainText: "Draft saved by navigation" },
      currentVersion: { versionNumber: 1, plainText: "Initial saved text" },
    },
  });
  await page.goBack();
  await expect(editor).toHaveText("Draft saved by navigation");
  await page.evaluate(() => {
    const api = globalThis.coredrillStorageSpike;
    globalThis.coredrillStorageSpike = {
      ...api,
      saveDocumentEditorDraft: async () => ({
        ok: false,
        error: {
          code: "unavailable",
          retryable: true,
          message: "Synthetic local save failure; keep text.",
        },
      }),
    };
  });
  await editor.fill("Keep this text after failed Back");
  const historyLength = await page.evaluate(() => history.length);
  await page.goBack();
  await expect(page.getByRole("alert")).toContainText("keep text");
  await expect(page).toHaveURL(new RegExp(`/documents/${documentId}$`, "u"));
  await expect(editor).toHaveText("Keep this text after failed Back");
  await expect(editor).toBeFocused();
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await page.getByRole("button", { name: "Retry local save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("keep text");
  await expect(editor).toHaveText("Keep this text after failed Back");
  await page.evaluate(() => {
    globalThis.coredrillStorageSpike = globalThis.coredrillNavigationTest.api;
  });
  await page.getByRole("button", { name: "Retry local save", exact: true }).click();
  await expect(page.locator('[data-document-autosave="saved"]')).toBeVisible();
  await page.goBack();
  await expect(page.locator(".cd-document-card")).toHaveCount(1);
  await page.goForward();
  await expect(editor).toHaveText("Keep this text after failed Back");
  await page.reload();
  await expect(editor).toHaveText("Keep this text after failed Back");
  await editor.fill("Saved before global search navigation");
  await page.getByRole("button", { name: /Search local vault/u }).click();
  await page
    .getByRole("searchbox", { name: "Search local vault", exact: true })
    .fill("acme research");
  await page.getByRole("link", { name: /Acme Research/u }).click();
  await expect(page).toHaveURL(/\/network\/companies\/company-acme$/u);
  const afterSearch = await page.evaluate(
    (id) => globalThis.coredrillStorageSpike.openDocumentEditor(id),
    documentId,
  );
  expect(afterSearch).toMatchObject({
    ok: true,
    value: { draft: { plainText: "Saved before global search navigation" } },
  });
  await primary.getByRole("link", { name: "Documents", exact: true }).click();
  await expect(page.locator(".cd-document-card")).toHaveCount(1);
  await page.evaluate(() => {
    const api = globalThis.coredrillStorageSpike;
    globalThis.coredrillNavigationTest = { api, release: null, completed: false };
    globalThis.coredrillStorageSpike = {
      ...api,
      openDocumentEditor: async (id) => {
        await new Promise((resolve) => {
          globalThis.coredrillNavigationTest.release = resolve;
        });
        const result = await api.openDocumentEditor(id);
        globalThis.coredrillNavigationTest.completed = true;
        return result;
      },
    };
  });
  await page.getByRole("button", { name: "Navigation resume", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Opening local document...", exact: true }),
  ).toBeVisible();
  await primary.getByRole("link", { name: "Home", exact: true }).click();
  await page.waitForFunction(() => globalThis.coredrillNavigationTest.release !== null);
  await page.evaluate(() => globalThis.coredrillNavigationTest.release());
  await page.waitForFunction(() => globalThis.coredrillNavigationTest.completed === true);
  await primary.getByRole("link", { name: "Documents", exact: true }).click();
  await expect(page.locator(".cd-document-card")).toHaveCount(1);
  await expect(page.locator(".cd-document-editor-workspace")).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(external).toEqual([]);
  console.info(
    `DOCUMENT_NAVIGATION_PROOF ${JSON.stringify({ offline: true, unseededDocument: true, savesDuringHeldNavigation: 1, failedBackPreservedText: true, forwardPreserved: true, reloadRecovered: true, searchNavigationSavedDraft: true, abandonedLoadIgnored: true, externalRequests: 0 })}`,
  );
});
