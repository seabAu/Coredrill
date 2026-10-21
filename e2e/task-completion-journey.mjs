import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Normal controls create/review/complete; read APIs only observe canonical results. */
export const exerciseNormalTaskCompletion = async (page, testInfo) => {
  const originalViewport = page.viewportSize();
  const jobId = new URL(page.url()).pathname.split("/")[2];
  const title = "Complete é中🙂 <inert-task> ".padEnd(512, "x");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Set next action", exact: true }).click();
  const form = page.getByRole("form", { name: "Add local next action", exact: true });
  await form.getByRole("textbox", { name: "Task title", exact: true }).fill(title);
  await form.getByRole("button", { name: "Save local next action", exact: true }).click();
  await expect(form).toHaveCount(0);
  const tasks = page.getByRole("region", { name: "Stored job tasks", exact: true });
  const task = tasks
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(task).toHaveCount(1);
  await expect(task).toContainText("State: pending.");
  const taskId = await task.getAttribute("data-stored-task-id");
  await task.getByRole("button", { name: "Mark complete", exact: true }).click();
  const review = tasks.getByRole("region", { name: "Review task completion", exact: true });
  await expect(review.getByRole("heading")).toBeFocused();
  await expect(review).toContainText(title);
  await review.getByRole("button", { name: "Cancel completion review", exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(task).toContainText("State: pending.");
  await task.getByRole("button", { name: "Mark complete", exact: true }).click();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(review).toContainText(title);
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(review).toContainText(title);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  expect(
    (await new AxeBuilder({ page }).include("[data-job-workspace]").analyze()).violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("task-completion-review-320.png"),
    fullPage: true,
  });
  const confirm = review.getByRole("button", { name: "Confirm completion", exact: true });
  await confirm.focus();
  await confirm.press("Enter");
  await expect(review).toHaveCount(0);
  await expect(task).toContainText("State: completed.");
  await expect(task.getByRole("button", { name: "Mark complete", exact: true })).toHaveCount(0);
  await expect(tasks.getByRole("status")).toContainText("Task marked complete locally");
  const canonical = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.nextActions.listPage({ jobId }),
    jobId,
  );
  expect(canonical).toMatchObject({
    ok: true,
    value: {
      items: expect.arrayContaining([
        expect.objectContaining({
          id: taskId,
          title,
          state: "completed",
          rowVersion: 2,
          dueAt: null,
          timeZone: null,
        }),
      ]),
    },
  });
  await page.reload();
  await expect(task).toContainText("State: completed.");
  await expect(review).toHaveCount(0);
  const after = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.nextActions.listPage({ jobId }),
    jobId,
  );
  expect(after).toEqual(canonical);
  if (originalViewport !== null) await page.setViewportSize(originalViewport);
  return {
    normalUiCompletion: true,
    deliberateReviewAndCancel: true,
    retainedAcrossTabsAndReflow: true,
    keyboardCompletion: true,
    exactTitle: true,
    retainedHistoryAndReload: true,
    axeViolations: 0,
  };
};
