import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const heldWrite = async (page) => {
  await page.evaluate(() => {
    const api = globalThis.coredrillStorageSpike;
    globalThis.headerHeldWrite = { api, calls: 0, release: null };
    globalThis.coredrillStorageSpike = {
      ...api,
      pipelineMutations: {
        ...api.pipelineMutations,
        changeStatus: async (input) => {
          globalThis.headerHeldWrite.calls += 1;
          await new Promise((resolve) => {
            globalThis.headerHeldWrite.release = resolve;
          });
          return api.pipelineMutations.changeStatus(input);
        },
      },
    };
  });
};
const releaseWrite = (page) =>
  page.evaluate(() => {
    globalThis.coredrillStorageSpike = globalThis.headerHeldWrite.api;
    globalThis.headerHeldWrite.release();
  });

/** Every successful write delegates to the real runtime; only its delivery is held. */
export const exerciseWorkspaceStatusLifetime = async (page, addJob, testInfo) => {
  const drafting = "Deliberately named preparation stage for narrow workspace review";
  await addJob(page, "Header lifetime owner");
  await page.getByRole("button", { name: "Header lifetime owner", exact: true }).click();
  const otherId = new URL(page.url()).pathname.split("/")[2];
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  const start = page.getByRole("form", {
    name: "Start local application preparation",
    exact: true,
  });
  await start.getByLabel("Preparation stage name").fill(drafting);
  await start.getByRole("button", { name: "Start preparation locally", exact: true }).click();
  await expect(page.locator('[data-preparation-status="missing"]')).toBeVisible();
  const createApplied = page.getByRole("form", { name: "Create local Applied stage", exact: true });
  await createApplied
    .getByLabel("Applied stage name", { exact: true })
    .fill("Explicit reviewed submission");
  await createApplied
    .getByRole("button", { name: "Create Applied stage locally", exact: true })
    .click();
  await expect(createApplied).toContainText("Created Applied stage");
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  await addJob(page, "Header lifetime subject");
  await page.getByRole("button", { name: "Header lifetime subject", exact: true }).click();
  const jobId = new URL(page.url()).pathname.split("/")[2];
  const otherBefore = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
    otherId,
  );
  const header = page.locator(".cd-job-workspace-header");
  const change = header.getByRole("button", { name: "Change status", exact: true });
  const form = page.getByRole("form", { name: "Change local job status", exact: true });
  const stage = form.getByLabel("New local stage", { exact: true });
  const changes = page.getByRole("region", { name: "Local status changes", exact: true });
  await change.click();
  await stage.selectOption({ label: "Explicit reviewed submission" });
  await form.getByRole("button", { name: "Save local status", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("No status was changed");
  await expect(header.locator(".cd-job-workspace-context")).toContainText("Unassigned");
  await changes.getByRole("button", { name: "Review Mark Applied", exact: true }).click();
  await expect(start).toBeVisible();
  const unsubmitted = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
    jobId,
  );
  expect(unsubmitted.value.job.status).toBeNull();
  expect(unsubmitted.value.application).toBeNull();
  expect(unsubmitted.value.timelineItemCount).toBe(0);
  await form.getByRole("button", { name: "Cancel status draft", exact: true }).click();
  await change.click();
  await stage.selectOption({ label: drafting });
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  await page.getByRole("button", { name: "Header lifetime owner", exact: true }).click();
  const foreign = page.getByRole("region", { name: "Status draft for another job", exact: true });
  await expect(foreign).toContainText("Header lifetime subject");
  await expect(form).toHaveCount(0);
  await change.click();
  await expect(foreign).toBeVisible();
  await expect(form).toHaveCount(0);
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  await page.getByRole("button", { name: "Header lifetime subject", exact: true }).click();
  await expect(stage.locator("option:checked")).toHaveText(drafting);
  await heldWrite(page);
  await form.getByRole("button", { name: "Save local status", exact: true }).click();
  await page.waitForFunction(() => globalThis.headerHeldWrite.release !== null);
  await expect(stage).toBeDisabled();
  await expect(change).toBeDisabled();
  await expect(
    form.getByRole("button", { name: "Cancel status draft", exact: true }),
  ).toBeDisabled();
  await form.evaluate((node) => node.requestSubmit());
  expect(await page.evaluate(() => globalThis.headerHeldWrite.calls)).toBe(1);
  const pending = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
    jobId,
  );
  expect(pending).toEqual(unsubmitted);
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(form).toHaveAttribute("aria-busy", "true");
  await expect(stage.locator("option:checked")).toHaveText(drafting);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const geometry = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return {
      width,
      scrollWidth: document.documentElement.scrollWidth,
      mode: document.querySelector("[data-job-workspace]")?.getAttribute("data-workspace-mode"),
      overflowing: Array.from(document.querySelectorAll("body *"))
        .flatMap((node) => {
          const rect = node.getBoundingClientRect();
          return rect.right > width + 1 && rect.width > 0
            ? [
                {
                  tag: node.tagName,
                  className: node.className,
                  width: rect.width,
                  right: rect.right,
                },
              ]
            : [];
        })
        .slice(0, 20),
    };
  });
  if (geometry.scrollWidth > geometry.width)
    console.info(`HEADER_STATUS_REFLOW_FAILURE ${JSON.stringify(geometry)}`);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("header-status-pending-320.png"),
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).include(".cd-workspace-status-editor").analyze()).violations,
  ).toEqual([]);
  const deliberate = page.getByRole("button", { name: "Source", exact: true });
  await deliberate.focus();
  await releaseWrite(page);
  await expect(form).toHaveCount(0);
  await expect(changes.getByRole("status")).toContainText("Saved Header lifetime subject");
  await expect(deliberate).toBeFocused();
  await expect(header.locator(".cd-job-workspace-context")).toContainText(drafting);
  await changes
    .getByRole("button", { name: "Undo status change for Header lifetime subject", exact: true })
    .click();
  await expect(header.locator(".cd-job-workspace-context")).toContainText("Unassigned");
  await change.click();
  await stage.selectOption({ label: drafting });
  await heldWrite(page);
  await form.getByRole("button", { name: "Save local status", exact: true }).click();
  await page.waitForFunction(() => globalThis.headerHeldWrite.release !== null);
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  await page.getByRole("button", { name: "Header lifetime owner", exact: true }).click();
  await expect(foreign).toBeVisible();
  await expect(
    foreign.getByRole("button", { name: "Discard other job status draft", exact: true }),
  ).toBeDisabled();
  await deliberate.focus();
  await releaseWrite(page);
  await expect(foreign).toHaveCount(0);
  await expect(changes.getByRole("status")).toContainText("Saved Header lifetime subject");
  await expect(deliberate).toBeFocused();
  await expect(page.locator("[data-job-workspace]")).toHaveAttribute("data-job-workspace", otherId);
  expect(
    await page.evaluate(
      (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
      otherId,
    ),
  ).toEqual(otherBefore);
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  await page.getByRole("button", { name: "Header lifetime subject", exact: true }).click();
  await expect(header.locator(".cd-job-workspace-context")).toContainText(drafting);
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Stored job timeline", exact: true })
      .locator("[data-timeline-id]"),
  ).toHaveCount(2);
  await change.click();
  await stage.selectOption({ label: "Explicit reviewed submission" });
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  await page.getByRole("button", { name: "Header lifetime owner", exact: true }).click();
  await foreign
    .getByRole("button", { name: "Discard other job status draft", exact: true })
    .click();
  await expect(foreign).toHaveCount(0);
  await expect(change).toBeFocused();
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  await page.getByRole("button", { name: "Header lifetime subject", exact: true }).click();
  await change.click();
  await expect(stage).toHaveValue("");
  await form.getByRole("button", { name: "Cancel status draft", exact: true }).click();
  return {
    initialAppliedReview: true,
    foreignDraftPreserved: true,
    pendingSingleFlight: true,
    reflow: true,
    deliberateFocusPreserved: true,
    lateCrossJobIsolated: true,
    explicitDiscardReturnsFocus: true,
    canonicalEvents: 2,
  };
};
