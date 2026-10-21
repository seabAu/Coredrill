import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";
import { exerciseCompanyDirectory } from "./company-directory-journey.mjs";

test("normal company directory paging reads 26 UI-created companies without totals or skipped retry cursors", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  await primary.getByRole("link", { name: "Pipeline", exact: true }).click();
  for (let index = 0; index < 26; index += 1) {
    const suffix = String(index).padStart(2, "0");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: /Add job/u }).click();
    const capture = page.getByRole("dialog");
    await capture.getByLabel(/Job title/u).fill(`Synthetic directory page role ${suffix}`);
    await capture.getByLabel(/Company/u).fill(`Synthetic directory page company ${suffix}`);
    await capture.getByRole("button", { name: "Save to capture inbox" }).click();
    await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
    await capture.getByRole("button", { name: "Close capture dialog" }).click();
    await page.locator('[data-pipeline-view-option="inbox"]').click();
    const review = page.getByTestId("capture-review");
    await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
    await review.getByRole("button", { name: "Save as new job" }).click();
    await expect(review.getByText("No durable captures yet")).toBeVisible();
  }
  await page.evaluate(() => {
    const original = globalThis.coredrillStorageSpike;
    globalThis.coredrillCompanyPageProbe = { failed: false, cursors: [] };
    globalThis.coredrillStorageSpike = {
      ...original,
      companyDirectory: {
        page: async (input) => {
          if (input.after !== null) {
            const probe = globalThis.coredrillCompanyPageProbe;
            probe.cursors.push(input.after);
            if (!probe.failed) {
              probe.failed = true;
              throw new Error("PRIVATE_NEXT_PAGE_PATH");
            }
          }
          return original.companyDirectory.page(input);
        },
      },
    };
  });
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  const network = page.getByRole("region", { name: "Stored Network", exact: true });
  const list = network.getByRole("list", { name: "Stored companies on this page", exact: true });
  await expect(list.getByRole("listitem")).toHaveCount(25);
  expect(await list.getByRole("heading").allTextContents()).toEqual(
    Array.from(
      { length: 25 },
      (_, index) => `Synthetic directory page company ${String(25 - index).padStart(2, "0")}`,
    ),
  );
  await expect(network.getByRole("status")).toContainText(
    "25 companies on this page. Another page is available.",
  );
  await network.getByRole("button", { name: "Next company page", exact: true }).click();
  await expect(network.getByRole("alert")).toContainText("could not be read");
  await expect(list.getByRole("listitem")).toHaveCount(25);
  await expect(network).not.toContainText("PRIVATE_NEXT_PAGE_PATH");
  await page.evaluate(() => {
    const original = globalThis.requestAnimationFrame.bind(globalThis);
    const observations = [];
    globalThis.coredrillCompanyPagingFocus = observations;
    globalThis.requestAnimationFrame = (callback) => {
      const first = globalThis.document.querySelector('[data-company-read="first"]');
      const observation = {
        firstEnabledAtSchedule: first !== null && !first.disabled,
        firstEnabledAtCallback: null,
      };
      observations.push(observation);
      return original((time) => {
        const target = globalThis.document.querySelector('[data-company-read="first"]');
        observation.firstEnabledAtCallback = target !== null && !target.disabled;
        callback(time);
      });
    };
  });
  await network.getByRole("button", { name: "Retry company page", exact: true }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByRole("heading")).toHaveText("Synthetic directory page company 00");
  await expect(network.getByRole("status")).toContainText(
    "1 company on this page. No later page was available when read.",
  );
  await expect(
    network.getByRole("button", { name: "Next company page", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => {
      const cursors = globalThis.coredrillCompanyPageProbe.cursors;
      return cursors.length === 2 && JSON.stringify(cursors[0]) === JSON.stringify(cursors[1]);
    }),
  ).toBe(true);
  const first = network.getByRole("button", { name: "Load first company page", exact: true });
  const focusObservation = await page.evaluate(() => ({
    frames: globalThis.coredrillCompanyPagingFocus,
    firstActive: globalThis.document.activeElement?.matches('[data-company-read="first"]') ?? false,
    documentHasFocus: globalThis.document.hasFocus(),
  }));
  await testInfo.attach("company-paging-focus-commit", {
    body: JSON.stringify(focusObservation),
    contentType: "application/json",
  });
  await expect(first).toBeFocused();
  expect(focusObservation.frames.length).toBeGreaterThan(0);
  expect(focusObservation.frames.every((frame) => frame.firstEnabledAtSchedule)).toBe(true);
  await page.keyboard.press("Enter");
  await expect(list.getByRole("listitem")).toHaveCount(25);
});

test("normal offline Network reads captured companies, honest empty/failure states and owned reflow/reload", async ({
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
  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  await expect(page.getByRole("region", { name: "Stored Network", exact: true })).toContainText(
    "No companies were found in this vault and archive scope",
  );
  const companyName = "Synthetic <b>literal</b> Directory Lab";
  await primary.getByRole("link", { name: "Pipeline", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add job/u }).click();
  const capture = page.getByRole("dialog");
  await capture.getByLabel(/Job title/u).fill("Synthetic directory role");
  await capture.getByLabel(/Company/u).fill(companyName);
  await capture.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
  await capture.getByRole("button", { name: "Close capture dialog" }).click();
  await page.locator('[data-pipeline-view-option="inbox"]').click();
  const review = page.getByTestId("capture-review");
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await review.getByRole("button", { name: "Save as new job" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
  const proof = await exerciseCompanyDirectory(page, testInfo, companyName);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await testInfo.attach("company-directory.json", {
    body: JSON.stringify({ ...proof, offline: true, externalRequests: 0 }),
    contentType: "application/json",
  });
});
