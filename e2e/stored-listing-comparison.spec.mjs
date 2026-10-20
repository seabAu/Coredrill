import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";
import { exerciseStoredListingComparison } from "./listing-comparison-journey.mjs";

test("compares structured original captures through the real offline runtime without mutating jobs", async ({
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
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  const proof = await exerciseStoredListingComparison(page);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await testInfo.attach("stored-listing-comparison-proof.json", {
    body: JSON.stringify({ ...proof, offline: true, seededRecords: false, externalRequests: 0 }),
    contentType: "application/json",
  });
});
