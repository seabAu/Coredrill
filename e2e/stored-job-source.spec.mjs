import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";

test("normal Source inspects exact retained evidence and explicit snapshot pairs offline without mutations", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
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
  const title = `Stored source role ${"x".repeat(280)}`;
  const changedTitle = `Changed retained title ${"y".repeat(280)}`;
  const longText = `SOURCE_START\n${"é中🙂 <script>globalThis.neverExecute()</script> ".repeat(1200)}\nSOURCE_END`;
  const capture = async (name, text, merge = false) => {
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: /Add job/u }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Job title/u).fill(name);
    await dialog.getByLabel(/Company/u).fill("Synthetic Source Lab");
    await dialog
      .getByLabel("Source URL (optional)")
      .fill(
        name === "Other source role"
          ? "https://jobs.example.test/other-source"
          : "https://jobs.example.test/source-role",
      );
    await dialog.getByLabel(/Notes or listing details/u).fill(text);
    await dialog.getByRole("button", { name: "Save to capture inbox" }).click();
    await expect(dialog.getByRole("status")).toContainText("Stored in the local capture inbox");
    await dialog.getByRole("button", { name: "Close capture dialog" }).click();
    await page.locator('[data-pipeline-view-option="inbox"]').click();
    const review = page.getByTestId("capture-review");
    if (merge)
      await review.getByRole("button", { name: "Merge into selected job", exact: true }).click();
    else {
      await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
      await review.getByRole("button", { name: "Save as new job" }).click();
    }
    await expect(review.getByText("No durable captures yet")).toBeVisible();
  };
  await capture(title, longText);
  await capture(changedTitle, `${longText}\nCHANGED_RETAINED_SOURCE`, true);
  await capture("Other source role", "OTHER_SOURCE_ONLY");
  await page.locator('[data-pipeline-view-option="table"]').click();
  await page.getByRole("button", { name: title, exact: true }).click();
  const jobId = new URL(page.url()).pathname.split("/")[2];
  const before = await page.evaluate(
    (id) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId: id }),
    jobId,
  );
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const source = page.getByRole("region", { name: "Stored job Source", exact: true });
  await expect(source.getByRole("status")).toHaveCount(0);
  const snapshots = await page.evaluate(
    (id) => globalThis.coredrillStorageSpike.pipeline.sourceSnapshots({ jobId: id }),
    jobId,
  );
  expect(snapshots.ok).toBe(true);
  expect(snapshots.value.items).toHaveLength(2);
  const [latest, older] = snapshots.value.items;
  const selected = source.getByRole("article", { name: "Selected retained snapshot", exact: true });
  await expect(selected).toHaveAttribute("data-source-snapshot", latest.id);
  await expect(
    selected.getByRole("region", { name: "primary literal retained content", exact: true }),
  ).toContainText("SOURCE_START");
  await expect(selected).toContainText("one bounded part");
  await selected.getByRole("button", { name: "Next content part", exact: true }).click();
  await expect(source.getByRole("status")).toHaveCount(0);
  await expect(
    selected.getByRole("region", { name: "primary literal retained content", exact: true }),
  ).not.toContainText("SOURCE_START");
  for (
    let count = 0;
    count < 20 &&
    (await selected.getByRole("button", { name: "Next content part", exact: true }).isEnabled());
    count += 1
  ) {
    await selected.getByRole("button", { name: "Next content part", exact: true }).click();
    await expect(source.getByRole("status")).toHaveCount(0);
  }
  await expect(
    selected.getByRole("region", { name: "primary literal retained content", exact: true }),
  ).toContainText("CHANGED_RETAINED_SOURCE");
  await selected.getByRole("button", { name: "First content part", exact: true }).click();
  await selected
    .getByLabel("primary retained content kind", { exact: true })
    .selectOption("markup");
  await expect(
    selected.getByText("No retained value for this part.", { exact: true }),
  ).toBeVisible();
  await selected.getByLabel("primary retained content kind", { exact: true }).selectOption("text");
  const titleEvidence = selected
    .locator("[data-source-evidence]")
    .filter({ has: page.getByText(/^Field candidate: title/u) });
  await titleEvidence.locator("summary").click();
  await expect(titleEvidence).toContainText("Incomplete preview");
  await expect(titleEvidence).toContainText("Source pointer");
  await titleEvidence
    .getByRole("button", { name: "Inspect normalized value", exact: true })
    .click();
  await expect(
    selected.getByRole("region", { name: "primary full value literal part", exact: true }),
  ).toHaveText(JSON.stringify(changedTitle));
  await source.getByLabel("Second snapshot to inspect", { exact: true }).selectOption(older.id);
  await expect(
    source.getByRole("article", { name: "Paired retained snapshot", exact: true }),
  ).toHaveAttribute("data-source-snapshot", older.id);
  await expect(
    source.getByRole("complementary", {
      name: "Retained snapshot fingerprint inspection",
      exact: true,
    }),
  ).toContainText("Recorded capture fingerprints differ");
  await expect(source).toContainText(
    "Structured field-by-field Listing changes is not connected yet",
  );
  expect(await page.evaluate(() => globalThis.neverExecute)).toBeUndefined();
  expect(
    await page
      .locator(
        ".cd-stored-job-source script, .cd-stored-job-source iframe, .cd-stored-job-source img",
      )
      .count(),
  ).toBe(0);
  const after = await page.evaluate(
    (id) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId: id }),
    jobId,
  );
  expect(after).toEqual(before);
  await page.setViewportSize({ width: 320, height: 900 });
  const sourceFits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  if (!sourceFits) {
    console.info(
      "SOURCE_REFLOW_OVERFLOW",
      await page.evaluate(() =>
        Array.from(document.querySelectorAll(".cd-stored-job-source, .cd-stored-job-source *"))
          .map((element) => ({
            tag: element.tagName,
            className: element.getAttribute("class"),
            right: element.getBoundingClientRect().right,
            width: element.getBoundingClientRect().width,
          }))
          .filter(({ right }) => right > innerWidth + 1)
          .slice(0, 12),
      ),
    );
    await page.screenshot({
      path: testInfo.outputPath("stored-source-overflow.png"),
      fullPage: true,
    });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("stored-source-paired-320.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const original = globalThis.coredrillStorageSpike;
    globalThis.coredrillSourceProbe = {
      original,
      mode: "failure",
      calls: 0,
      release: null,
      completed: false,
    };
    globalThis.coredrillStorageSpike = {
      ...original,
      pipeline: {
        ...original.pipeline,
        sourceContent: async (input) => {
          const probe = globalThis.coredrillSourceProbe;
          probe.calls += 1;
          if (probe.mode === "failure") throw new Error("SYNTHETIC_PRIVATE_SOURCE_PATH");
          if (probe.mode === "hold") {
            probe.mode = "success";
            await new Promise((resolve) => {
              probe.release = resolve;
            });
          }
          const value = await original.pipeline.sourceContent(input);
          probe.completed = true;
          return value;
        },
      },
    };
  });
  await selected
    .getByLabel("primary retained content kind", { exact: true })
    .selectOption("structured");
  await expect(source.getByRole("alert")).toContainText("Previously loaded evidence remains");
  await expect(source).not.toContainText("SYNTHETIC_PRIVATE_SOURCE_PATH");
  await page.evaluate(() => {
    globalThis.coredrillSourceProbe.mode = "success";
  });
  await source.getByRole("button", { name: "Retry Source read", exact: true }).click();
  await expect(source.getByRole("alert")).toHaveCount(0);
  await expect(
    source.getByRole("button", { name: "Reload newest history and reset selection", exact: true }),
  ).toBeFocused();
  await page.evaluate(() => {
    globalThis.coredrillSourceProbe.mode = "hold";
  });
  await selected.getByLabel("primary retained content kind", { exact: true }).selectOption("text");
  await page.waitForFunction(() => globalThis.coredrillSourceProbe.release !== null);
  const calls = await page.evaluate(() => globalThis.coredrillSourceProbe.calls);
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(
    source.getByRole("button", { name: "Reload newest history and reset selection", exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => globalThis.coredrillSourceProbe.calls)).toBe(calls);
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  await page.getByRole("button", { name: "Other source role", exact: true }).click();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(
    source.getByRole("region", { name: "primary literal retained content", exact: true }),
  ).toContainText("OTHER_SOURCE_ONLY");
  await page.evaluate(() => {
    globalThis.coredrillSourceProbe.completed = false;
    globalThis.coredrillSourceProbe.release();
  });
  await page.waitForFunction(() => globalThis.coredrillSourceProbe.completed === true);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(source).not.toContainText("CHANGED_RETAINED_SOURCE");
  await expect(
    source.getByRole("region", { name: "primary literal retained content", exact: true }),
  ).toContainText("OTHER_SOURCE_ONLY");
  await page.reload();
  await expect(
    source.getByRole("region", { name: "primary literal retained content", exact: true }),
  ).toContainText("OTHER_SOURCE_ONLY");
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("stored-source-320.png"), fullPage: true });
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await testInfo.attach("stored-source.json", {
    body: JSON.stringify({
      jobId,
      snapshotIds: snapshots.value.items.map(({ id }) => id),
      pairedInspection: true,
      semanticComparisonComplete: false,
      privateMutations: 0,
      offline: true,
      externalRequests: external.length,
      errors,
    }),
    contentType: "application/json",
  });
});
