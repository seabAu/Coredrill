import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Normal controls create/review/dismiss; read APIs only observe canonical results. */
export const exerciseNormalTaskDismissal = async (page, testInfo) => {
  const originalViewport = page.viewportSize();
  const jobId = new URL(page.url()).pathname.split("/")[2];
  const title = "Dismiss é中🙂 <inert-task> ".padEnd(512, "x");
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
  const beforeCancel = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.nextActions.listPage({ jobId }),
    jobId,
  );
  await task.getByRole("button", { name: "Dismiss task", exact: true }).click();
  const review = tasks.getByRole("region", { name: "Review task dismissal", exact: true });
  await expect(review.getByRole("heading")).toBeFocused();
  await expect(review).toContainText(title);
  await expect(review).toContainText(
    "Pending linked reminders will be dismissed; fired reminder history is retained.",
  );
  await review.getByRole("button", { name: "Cancel dismissal review", exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(task).toContainText("State: pending.");
  expect(
    await page.evaluate(
      (jobId) => globalThis.coredrillStorageSpike.nextActions.listPage({ jobId }),
      jobId,
    ),
  ).toEqual(beforeCancel);
  await task.getByRole("button", { name: "Dismiss task", exact: true }).click();
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
    path: testInfo.outputPath("task-dismissal-review-320.png"),
    fullPage: true,
  });
  const confirm = review.getByRole("button", { name: "Confirm dismissal", exact: true });
  await confirm.focus();
  await confirm.press("Enter");
  await expect(review).toHaveCount(0);
  await expect(task).toContainText("State: dismissed.");
  await expect(task.getByRole("button", { name: "Dismiss task", exact: true })).toHaveCount(0);
  await expect(tasks.getByRole("status")).toContainText("Task dismissed locally");
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
          state: "dismissed",
          completedAt: null,
          rowVersion: 2,
          dueAt: null,
          timeZone: null,
        }),
      ]),
    },
  });
  const replay = await page.evaluate(
    async ({ jobId, taskId, jobRowVersion }) => {
      const api = globalThis.coredrillStorageSpike;
      const input = {
        jobId,
        nextActionId: taskId,
        expected: { jobRowVersion, nextActionRowVersion: 2 },
      };
      return {
        dismissedAgain: await api.nextActions.dismiss(input),
        completedAfterDismissal: await api.nextActions.complete(input),
        after: await api.nextActions.listPage({ jobId }),
      };
    },
    { jobId, taskId, jobRowVersion: canonical.value.jobRowVersion },
  );
  expect(replay.dismissedAgain).toMatchObject({ ok: false, error: { code: "conflict" } });
  expect(replay.completedAfterDismissal).toMatchObject({ ok: false, error: { code: "conflict" } });
  expect(replay.after).toEqual(canonical);
  await page.reload();
  await expect(task).toContainText("State: dismissed.");
  await expect(review).toHaveCount(0);
  const after = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.nextActions.listPage({ jobId }),
    jobId,
  );
  expect(after).toEqual(canonical);
  if (originalViewport !== null) await page.setViewportSize(originalViewport);
  return {
    normalUiDismissal: true,
    deliberateReviewAndCancel: true,
    retainedAcrossTabsAndReflow: true,
    keyboardDismissal: true,
    exactTitle: true,
    retainedHistoryAndReload: true,
    axeViolations: 0,
  };
};
