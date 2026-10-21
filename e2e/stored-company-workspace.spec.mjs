import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";
import { exerciseCompanyWorkspace } from "./company-workspace-journey.mjs";

test("normal offline company creation and notes retain owned drafts and recover without repeat writes", async ({
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
  const proof = await exerciseCompanyWorkspace(page, testInfo);
  // Explicit deletion in this isolated browser context must retire private draft state.
  const network = page.getByRole("region", { name: "Stored Network", exact: true });
  await network.getByRole("button", { name: "Create local company", exact: true }).click();
  const form = network.getByRole("form", { name: "Create local company", exact: true });
  await form.getByLabel("Company name", { exact: true }).fill("Unstored company draft");
  await form.getByLabel("Company notes", { exact: true }).fill("UNSAVED_PRIVATE_COMPANY_SENTINEL");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Review vault deletion", exact: true }).click();
  await page.getByRole("button", { name: "Delete local vault", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const phrase = await dialog.locator("code").innerText();
  await dialog.getByRole("textbox").fill(phrase);
  await dialog.getByRole("button", { name: "Delete local vault", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Local vault deleted", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("UNSAVED_PRIVATE_COMPANY_SENTINEL", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Return to an empty workspace", exact: true }).click();
  await initializeDefaultWorkspace(page);
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Network", exact: true })
    .click();
  await expect(network.getByRole("form")).toHaveCount(0);
  await expect(network).toContainText("No companies were found in this vault and archive scope");
  await expect(network).not.toContainText("UNSAVED_PRIVATE_COMPANY_SENTINEL");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await testInfo.attach("normal-company-workspace", {
    body: JSON.stringify({
      ...proof,
      offline: true,
      externalRequests: 0,
      explicitBrowserDeletionRetiresPrivateDraft: true,
    }),
    contentType: "application/json",
  });
});
