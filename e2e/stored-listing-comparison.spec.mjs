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
  const proof = await exerciseStoredListingComparison(page, testInfo);
  const source = page.getByRole("region", { name: "Stored job Source", exact: true });
  const compare = source.getByRole("button", {
    name: "Compare retained listing fields",
    exact: true,
  });
  await page.evaluate(() => {
    const original = globalThis.coredrillStorageSpike;
    globalThis.coredrillComparisonFault = {
      mode: "failure",
      calls: 0,
      release: null,
      completed: false,
    };
    globalThis.coredrillStorageSpike = {
      ...original,
      pipeline: {
        ...original.pipeline,
        sourceComparison: async (input) => {
          const probe = globalThis.coredrillComparisonFault;
          probe.calls += 1;
          if (probe.mode === "failure") throw new Error("SYNTHETIC_PRIVATE_COMPARISON_PATH");
          const result = await original.pipeline.sourceComparison(input);
          if (probe.mode === "hold")
            await new Promise((resolve) => {
              probe.release = resolve;
            });
          probe.completed = true;
          return result;
        },
      },
    };
  });
  await compare.click();
  await expect(source.getByRole("alert")).toContainText("Previously loaded evidence remains");
  await expect(source).not.toContainText("SYNTHETIC_PRIVATE_COMPARISON_PATH");
  await expect(
    source.getByRole("heading", { name: "Requirements — Changed retained values", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    globalThis.coredrillComparisonFault.mode = "success";
  });
  await source.getByRole("button", { name: "Retry Source read", exact: true }).click();
  await expect(source.getByRole("alert")).toHaveCount(0);
  await expect(
    source.getByRole("button", { name: "Reload newest history and reset selection", exact: true }),
  ).toBeFocused();
  await page.evaluate(() => {
    globalThis.coredrillComparisonFault.mode = "hold";
  });
  await compare.click();
  await page.waitForFunction(() => globalThis.coredrillComparisonFault.release !== null);
  const calls = await page.evaluate(() => globalThis.coredrillComparisonFault.calls);
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(compare).toBeDisabled();
  expect(await page.evaluate(() => globalThis.coredrillComparisonFault.calls)).toBe(calls);
  const deliberateFocus = source
    .getByRole("article", { name: "Selected retained snapshot", exact: true })
    .locator("summary")
    .first();
  await deliberateFocus.focus();
  await page.evaluate(() => {
    globalThis.coredrillComparisonFault.release();
  });
  await expect(compare).toBeEnabled();
  await expect(deliberateFocus).toBeFocused();
  await page.evaluate(() => {
    globalThis.coredrillComparisonFault.release = null;
    globalThis.coredrillComparisonFault.completed = false;
  });
  await compare.click();
  await page.waitForFunction(() => globalThis.coredrillComparisonFault.release !== null);
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  const reopen = page.getByRole("button", { name: "Structured comparison role", exact: true });
  await expect(reopen).toBeFocused();
  await page.evaluate(() => {
    globalThis.coredrillComparisonFault.release();
  });
  await page.waitForFunction(() => globalThis.coredrillComparisonFault.completed);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(source).toHaveCount(0);
  await expect(reopen).toBeFocused();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await testInfo.attach("stored-listing-comparison-proof.json", {
    body: JSON.stringify({
      ...proof,
      offline: true,
      seededRecords: false,
      externalRequests: 0,
      failureRetryRedacted: true,
      responsiveSingleFlight: true,
      deliberateFocusPreserved: true,
      disposedResultIgnored: true,
    }),
    contentType: "application/json",
  });
});
