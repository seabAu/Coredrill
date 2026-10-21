import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Normal controls perform the write; read APIs only observe the acknowledged result. */
export const exerciseNormalTaskEntry = async (page, testInfo) => {
  const originalViewport = page.viewportSize();
  const jobId = new URL(page.url()).pathname.split("/")[2];
  const jobTitle = await page.locator("[data-job-workspace] h2").textContent();
  const title = "Review é中🙂 <inert-task> ".padEnd(512, "x");
  const header = page
    .locator(".cd-job-workspace-context")
    .getByText("Next action", { exact: true })
    .locator("..")
    .locator("dd");
  await page.getByRole("button", { name: "Set next action", exact: true }).click();
  const form = page.getByRole("form", { name: "Add local next action", exact: true });
  const field = form.getByRole("textbox", { name: "Task title", exact: true });
  await expect(field).toBeFocused();
  await expect(form.getByRole("checkbox")).toBeDisabled();
  await expect(form).toContainText("Scheduled task entry is not yet connected");
  await field.fill(title);
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(field).toHaveValue(title);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(field).toHaveValue(title);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  expect(
    (await new AxeBuilder({ page }).include("[data-job-workspace]").analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("task-entry-draft-320.png"), fullPage: true });
  await form.getByRole("button", { name: "Save local next action", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(header).toHaveText(`${title} — Unscheduled`);
  const feedback = page.getByRole("region", { name: "Local status and task changes", exact: true });
  await expect(feedback).toHaveCount(1);
  await expect(feedback.getByRole("status")).toContainText(`Saved a pending task for ${jobTitle}`);
  await expect(page.getByRole("button", { name: "Set next action", exact: true })).toBeFocused();
  const readback = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
    jobId,
  );
  expect(readback).toMatchObject({
    ok: true,
    value: {
      job: { nextAction: { title, dueAt: null } },
      attention: { nextAction: { timeZone: null } },
    },
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  expect(
    (await new AxeBuilder({ page }).include("[data-job-workspace]").analyze()).violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("task-entry-saved-undo-320.png"),
    fullPage: true,
  });
  await feedback
    .locator("[data-task-undo-id]")
    .filter({ hasText: title })
    .getByRole("button", { name: `Undo next action for ${jobTitle}`, exact: true })
    .click();
  await expect(feedback.getByRole("status")).toContainText("Undid next-action creation");
  await expect(feedback.getByRole("status")).toContainText("dismissed, not deleted");
  await expect(feedback.getByRole("status")).not.toContainText("prior status");
  await expect(header).toHaveText("Not set");
  await page.reload();
  await expect(header).toHaveText("Not set");
  const after = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
    jobId,
  );
  expect(after.value.job.nextAction).toBeNull();
  if (originalViewport !== null) await page.setViewportSize(originalViewport);
  return {
    normalUiCreation: true,
    exactTitle: true,
    unscheduledNullPair: true,
    responsiveDraft: true,
    sharedTaskFeedback: true,
    taskUndo: true,
    reloadAfterUndo: true,
    schedulingUnavailable: true,
    scheduledFormProven: false,
  };
};
