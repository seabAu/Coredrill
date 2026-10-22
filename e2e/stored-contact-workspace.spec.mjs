import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";
import { exerciseContactWorkspace } from "./contact-workspace-journey.mjs";

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
