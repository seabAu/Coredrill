import { createHash } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";

test("creates reusable documents from an empty local library offline and retains exact first versions", async ({
  page,
  context,
}, testInfo) => {
  const externalRequests = [];
  await page.route("**/*", async (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:4181/")) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  await page.goto("/app-shell.html");
  await initializeDefaultWorkspace(page);
  await page.waitForFunction(
    () => globalThis.coredrillOfflineShell?.getState().registered === true,
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(
    () => globalThis.coredrillAppShell !== undefined && navigator.serviceWorker.controller !== null,
  );
  await context.setOffline(true);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Documents" })
    .click();
  await expect(page.locator(".cd-document-card")).toHaveCount(0);
  const witnesses = [];
  for (const [kind, title, text] of [
    [
      "resume",
      "Manually authored resume",
      "Literal <script>inert text</script>\n\nReviewed work history",
    ],
    ["cover_letter", "Reusable letter", ""],
  ]) {
    await page.getByRole("button", { name: "New document", exact: true }).click();
    const form = page.getByRole("form", { name: "New reusable document" });
    await form.getByLabel("Document title", { exact: true }).fill(title);
    await form.getByRole("combobox", { name: "Document kind", exact: true }).selectOption(kind);
    await form.getByLabel("Initial document text", { exact: true }).fill(text);
    if (kind === "resume") {
      // A UI fault witness only: the next retry restores and invokes the real command.
      await page.evaluate(() => {
        const api = globalThis.coredrillStorageSpike;
        globalThis.coredrillStorageSpike = {
          ...api,
          createReusableDocument: async () => {
            globalThis.coredrillStorageSpike = api;
            return {
              ok: false,
              error: {
                code: "unavailable",
                retryable: true,
                message: "Synthetic local write failure; text retained.",
              },
            };
          },
        };
      });
      await form.getByRole("button", { name: "Create document locally", exact: true }).click();
      await expect(form.getByRole("alert")).toContainText("text retained");
      await expect(form.getByLabel("Document title", { exact: true })).toHaveValue(title);
      await expect(form.getByLabel("Initial document text", { exact: true })).toHaveValue(text);
      await expect(page.locator(".cd-document-card")).toHaveCount(0);
      await page.setViewportSize({ width: 320, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const accessibility = await new AxeBuilder({ page }).analyze();
      expect(accessibility.violations).toEqual([]);
      const screenshotPath = testInfo.outputPath("new-document-320.png");
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await testInfo.attach("new-document-320.png", {
        path: screenshotPath,
        contentType: "image/png",
      });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await form.getByRole("button", { name: "Create document locally", exact: true }).click();
    const editor = page.locator(".cd-document-editor-workspace");
    await expect(editor.getByRole("heading", { name: title, exact: true })).toBeVisible();
    const id = new URL(page.url()).pathname.split("/").at(-1);
    const before = await page.evaluate(async (documentId) => {
      const result = await globalThis.coredrillStorageSpike.openDocumentEditor(documentId);
      if (!result.ok) throw new Error(result.error.code);
      return result.value;
    }, id);
    expect(before.versions).toHaveLength(1);
    expect(before.currentVersion).toMatchObject({
      versionNumber: 1,
      parentVersionId: null,
      plainText: text,
    });
    expect(before.draft).toBeNull();
    expect(before.currentVersion.contentHash).toBe(
      createHash("sha256").update(JSON.stringify(before.currentVersion.content)).digest("hex"),
    );
    await page.reload();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    const after = await page.evaluate(async (documentId) => {
      const result = await globalThis.coredrillStorageSpike.openDocumentEditor(documentId);
      if (!result.ok) throw new Error(result.error.code);
      return result.value;
    }, id);
    expect(after).toEqual(before);
    witnesses.push({
      documentId: id,
      kind,
      versionId: after.currentVersion.id,
      contentHash: after.currentVersion.contentHash,
    });
    await page.getByRole("button", { name: "Back to documents", exact: true }).click();
    await expect(page.locator(".cd-document-card")).toHaveCount(witnesses.length);
    await expect(page.locator(".cd-document-card").filter({ hasText: title })).toContainText(
      "Reusable base",
    );
  }
  const stored = await page.evaluate(() =>
    globalThis.coredrillStorageSpike.listDocumentsWorkspace(),
  );
  expect(stored.ok).toBe(true);
  expect(stored.value).toHaveLength(2);
  expect(
    stored.value.every(
      (item) =>
        item.claimStatus === "not_evaluated" &&
        item.submission === null &&
        item.relatedJob === null,
    ),
  ).toBe(true);
  expect(externalRequests).toEqual([]);
  console.info(
    `DOCUMENT_CREATION_PROOF ${JSON.stringify({ witnesses, scaffoldInstalled: false, offline: true, failedInputRetained: true, externalRequests: 0 })}`,
  );
  await testInfo.attach("document-creation-proof.json", {
    body: JSON.stringify(witnesses, null, 2),
    contentType: "application/json",
  });
});
