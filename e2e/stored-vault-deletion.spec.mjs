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
