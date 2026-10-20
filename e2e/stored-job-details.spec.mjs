import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";

test("normal stored Overview and Company read real offline facts, retain failed refresh and discard late cross-job reads", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(10_000);
  const errors = [];
  const external = [];
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
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Pipeline", exact: true })
    .click();
  for (const label of ["First", "Second"]) {
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: /Add job/u }).click();
    const capture = page.getByRole("dialog");
    await capture.getByLabel(/Job title/u).fill(`${label} stored detail role`);
    await capture.getByLabel(/Company/u).fill(`${label} Detail Lab`);
    await capture
      .getByLabel(/Notes or listing details/u)
      .fill(`${label} retained description.\n<script>neverExecute()</script>`);
    await capture.getByRole("button", { name: "Save to capture inbox" }).click();
    await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
    await capture.getByRole("button", { name: "Close capture dialog" }).click();
    await page.locator('[data-pipeline-view-option="inbox"]').click();
    const review = page.getByTestId("capture-review");
    await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
    await review.getByRole("button", { name: "Save as new job" }).click();
    await expect(review.getByText("No durable captures yet")).toBeVisible();
  }
  await page.locator('[data-pipeline-view-option="table"]').click();
  await page.getByRole("button", { name: "First stored detail role", exact: true }).click();
  const overview = page.getByRole("region", { name: "Stored job overview", exact: true });
  await expect(overview).toContainText("First stored detail role");
  await expect(overview).toContainText("No job description recorded.");
  await expect(overview).toContainText("No unarchived application attempt recorded.");
  const firstUrl = page.url();
  const witness = await page.evaluate(async () => {
    const jobId = location.pathname.split("/")[2];
    return globalThis.coredrillStorageSpike.pipeline.workspace({ jobId });
  });
  expect(witness.ok).toBe(true);
  expect(witness.value.company.canonicalName).toBe("First Detail Lab");
  // Listing notes are retained source input, not an accepted normalized description.
  expect(witness.value.descriptionText).toBe("");
  await page.getByRole("button", { name: "Company", exact: true }).click();
  const company = page.getByRole("region", { name: "Stored job company", exact: true });
  await expect(company).toContainText("First Detail Lab");
  await expect(company).toContainText("No company notes recorded.");
  await expect(company).toContainText("not verified people");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.evaluate(() => {
    const original = globalThis.coredrillStorageSpike;
    globalThis.coredrillDetailsProbe = { original, mode: "success", calls: 0, release: null };
    globalThis.coredrillStorageSpike = {
      ...original,
      pipeline: {
        ...original.pipeline,
        workspace: async (input) => {
          const probe = globalThis.coredrillDetailsProbe;
          probe.calls += 1;
          if (probe.mode === "failure") throw new Error("private adapter path");
          if (probe.mode === "hold") {
            probe.mode = "success";
            await new Promise((resolve) => {
              probe.release = resolve;
            });
          }
          const result = await original.pipeline.workspace(input);
          probe.lastCompletedJobId = input.jobId;
          return result;
        },
      },
    };
  });
  // Trigger a refresh only after React has adopted the replacement API.
  await page.getByRole("button", { name: "Company", exact: true }).click();
  await page.waitForFunction(() => globalThis.coredrillDetailsProbe.calls > 0);
  await expect(
    company.getByRole("button", { name: "Refresh job details", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    globalThis.coredrillDetailsProbe.mode = "failure";
  });
  await company.getByRole("button", { name: "Refresh job details", exact: true }).click();
  await expect(company.getByRole("alert")).toContainText("could not be refreshed");
  await expect(company).toContainText("Previously loaded facts");
  await expect(page.getByText("private adapter path", { exact: false })).toHaveCount(0);
  await page.evaluate(() => {
    globalThis.coredrillDetailsProbe.mode = "success";
  });
  await company.getByRole("button", { name: "Retry job details", exact: true }).click();
  await expect(company.getByRole("alert")).toHaveCount(0);
  await expect(
    company.getByRole("button", { name: "Refresh job details", exact: true }),
  ).toBeFocused();
  await page.evaluate(() => {
    globalThis.coredrillDetailsProbe.mode = "hold";
  });
  await company.getByRole("button", { name: "Refresh job details", exact: true }).click();
  await page.waitForFunction(() => globalThis.coredrillDetailsProbe.release !== null);
  const callsBeforeReflow = await page.evaluate(() => globalThis.coredrillDetailsProbe.calls);
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(
    company.getByRole("button", { name: "Refresh job details", exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => globalThis.coredrillDetailsProbe.calls)).toBe(callsBeforeReflow);
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  await page.getByRole("button", { name: "Second stored detail role", exact: true }).click();
  await expect(overview).toContainText("Second stored detail role");
  await page.evaluate(() => globalThis.coredrillDetailsProbe.release());
  await page.waitForFunction(
    (jobId) => globalThis.coredrillDetailsProbe.lastCompletedJobId === jobId,
    witness.value.job.id,
  );
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(overview).not.toContainText("First stored detail role");
  await expect(overview).toContainText("Second Detail Lab");
  await page.reload();
  await expect(overview).toContainText("Second stored detail role");
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("stored-overview-320.png"), fullPage: true });
  await page.getByRole("button", { name: "Company", exact: true }).click();
  await expect(company).toContainText("Second Detail Lab");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("stored-company-320.png"), fullPage: true });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await testInfo.attach("stored-details.json", {
    body: JSON.stringify({ firstUrl, witness, offline: true, externalRequests: external, errors }),
    contentType: "application/json",
  });
});
