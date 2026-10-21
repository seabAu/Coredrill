import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** The ordinary form owns conversion/write; privileged APIs observe only durable readback. */
export const exerciseScheduledTaskEntry = async (page, testInfo) => {
  const viewport = page.viewportSize();
  const jobId = new URL(page.url()).pathname.split("/")[2];
  const title = "Synthetic scheduled DST follow-up é中🙂";
  const dueAt = "2026-11-01T06:30:00.000Z";
  const zone = "America/New_York";
  const read = () =>
    page.evaluate((jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }), jobId);
  const before = await read();
  expect(before.ok).toBe(true);
  await page.getByRole("button", { name: "Set next action", exact: true }).click();
  const form = page.getByRole("form", { name: "Add local next action", exact: true });
  await form.getByRole("textbox", { name: "Task title", exact: true }).fill(title);
  await form.getByRole("checkbox", { name: "Add a due date/time", exact: true }).check();
  const clock = form.getByLabel("Local due date and time", { exact: true });
  const timeZone = form.getByRole("textbox", { name: "IANA time zone", exact: true });
  const review = form.getByRole("button", { name: "Review exact due time", exact: true });
  const save = form.getByRole("button", { name: "Save local next action", exact: true });
  await clock.fill("2026-03-08T02:30");
  await timeZone.fill(zone);
  await expect(review).toBeEnabled();
  await review.click();
  await expect(form.getByRole("alert")).toContainText("does not exist");
  await expect(form.getByRole("alert")).toBeFocused();
  await expect(clock).toHaveValue("2026-03-08T02:30");
  await expect(save).toBeDisabled();
  expect((await read()).value.job.rowVersion).toBe(before.value.job.rowVersion);
  await clock.fill("2026-11-01T01:30");
  await review.click();
  await expect(form).toContainText("This clock occurs twice");
  const first = form.getByRole("radio", { name: /First occurrence/u });
  const second = form.getByRole("radio", { name: /Second occurrence/u });
  await expect(first).not.toBeChecked();
  await expect(second).not.toBeChecked();
  await expect(first).toHaveAccessibleName(/GMT-04:00.*2026-11-01T05:30:00.000Z/u);
  await expect(second).toHaveAccessibleName(/GMT-05:00.*2026-11-01T06:30:00.000Z/u);
  await expect(save).toBeDisabled();
  await second.check();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(clock).toHaveValue("2026-11-01T01:30");
  await expect(second).toBeChecked();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(clock).toHaveValue("2026-11-01T01:30");
  await expect(second).toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).include("[data-job-workspace]").analyze()).violations,
  ).toEqual([]);
  await form.screenshot({ path: testInfo.outputPath("scheduled-task-overlap-320.png") });
  await save.click();
  await expect(form).toHaveCount(0);
  const feedback = page.getByRole("region", { name: "Local status and task changes", exact: true });
  await expect(feedback.getByRole("status")).toContainText("Saved a pending task");
  const saved = await read();
  expect(saved).toMatchObject({
    ok: true,
    value: { job: { nextAction: { title, dueAt } }, attention: { nextAction: { timeZone: zone } } },
  });
  const taskId = saved.value.attention.nextAction.id;
  const header = page.locator(".cd-job-workspace-context");
  await expect(header).toContainText(title);
  await expect(header).toContainText("2026-11-01 06:30:00.000 UTC");
  // Undo remains session-owned. First prove its exact scheduled target, then
  // reload and prove canonical dismissal without resurrecting the local task.
  await feedback
    .locator("[data-task-undo-id]")
    .filter({ hasText: title })
    .getByRole("button", { name: /Undo next action/u })
    .click();
  await expect(feedback.getByRole("status")).toContainText("Undid next-action creation");
  await page.reload();
  await expect(header).toContainText("Not set");
  const after = await read();
  expect(after.value.job.nextAction).toEqual(before.value.job.nextAction);
  const tasks = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.nextActions.listPage({ jobId, limit: 25 }),
    jobId,
  );
  expect(tasks.ok).toBe(true);
  expect(JSON.stringify(tasks.value)).toContain(taskId);
  // A second ordinary creation independently proves a saved schedule survives
  // reload. Its explicit normal dismissal restores the later journey's baseline.
  const retainedTitle = "Synthetic unique scheduled task retained across reload";
  const retainedDue = "2026-11-02T14:00:12.345Z";
  await page.getByRole("button", { name: "Set next action", exact: true }).click();
  await form.getByRole("textbox", { name: "Task title", exact: true }).fill(retainedTitle);
  await form.getByRole("checkbox", { name: "Add a due date/time", exact: true }).check();
  await clock.fill("2026-11-02T09:00:12.345");
  await timeZone.fill(zone);
  await review.click();
  await expect(form.getByRole("radio", { name: /Only occurrence/u })).toBeChecked();
  await save.click();
  await expect(form).toHaveCount(0);
  await expect(header).toContainText("2026-11-02 14:00:12.345 UTC");
  await page.reload();
  await expect(header).toContainText(retainedTitle);
  await expect(header).toContainText("2026-11-02 14:00:12.345 UTC");
  expect(await read()).toMatchObject({
    ok: true,
    value: {
      job: { nextAction: { title: retainedTitle, dueAt: retainedDue } },
      attention: { nextAction: { timeZone: zone } },
    },
  });
  const taskRegion = page.getByRole("region", { name: "Stored job tasks", exact: true });
  const retainedTask = taskRegion
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: retainedTitle, exact: true }) });
  await retainedTask.getByRole("button", { name: "Dismiss task", exact: true }).click();
  await taskRegion
    .getByRole("region", { name: "Review task dismissal", exact: true })
    .getByRole("button", { name: "Confirm dismissal", exact: true })
    .click();
  await expect(retainedTask).toContainText("State: dismissed.");
  expect((await read()).value.job.nextAction).toEqual(before.value.job.nextAction);
  if (viewport !== null) await page.setViewportSize(viewport);
  return {
    gapRejectedBeforeWrite: true,
    explicitSecondOccurrence: true,
    exactUtcAndZoneReadback: true,
    responsiveOwnedResolution: true,
    scheduledUndoAndReload: true,
    scheduledCanonicalReload: true,
    noNotification: true,
  };
};
