import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { exerciseNormalTaskCompletion } from "./task-completion-journey.mjs";
import { exerciseNormalTaskDismissal } from "./task-dismissal-journey.mjs";
import {
  exerciseTaskCompletionHardening,
  exerciseTaskCompletionCrossJob,
} from "./task-completion-hardening.mjs";

/** Direct production-command composition proof, not the unfinished normal task form. */
export const exerciseNextActionRuntime = async (page, testInfo) => {
  const originalViewport = page.viewportSize();
  const jobId = new URL(page.url()).pathname.split("/")[2];
  const title = "Synthetic runtime task — é中🙂 <inert-task> ".padEnd(512, "x");
  const header = page
    .locator(".cd-job-workspace-context")
    .getByText("Next action", { exact: true })
    .locator("..")
    .locator("dd");
  const first = await page.evaluate(
    async ({ jobId, title }) => {
      const api = globalThis.coredrillStorageSpike;
      const before = await api.pipeline.workspace({ jobId });
      if (!before.ok) throw new Error("Synthetic task fixture is unavailable");
      const invalid = await api.nextActions.setNextAction({ jobId, title });
      const scheduled = await api.nextActions.setNextAction({
        jobId,
        title,
        expected: { jobRowVersion: before.value.job.rowVersion },
        dueAt: "2026-11-01T05:30:00.000Z",
        timeZone: "America/New_York",
        applicationId: "must-not-bind",
        interactionId: "must-not-bind",
      });
      const after = await api.pipeline.workspace({ jobId });
      const stale = await api.nextActions.setNextAction({
        jobId,
        title: "Stale task",
        expected: { jobRowVersion: before.value.job.rowVersion },
      });
      const afterStale = await api.pipeline.workspace({ jobId });
      return { before, invalid, scheduled, after, stale, afterStale };
    },
    { jobId, title },
  );
  expect(first.before.value.job.nextAction).toBeNull();
  expect(first.invalid).toMatchObject({ ok: false, error: { code: "validation" } });
  expect(first.scheduled).toMatchObject({
    ok: true,
    value: {
      nextAction: {
        jobId,
        title,
        applicationId: null,
        interactionId: null,
        dueAt: "2026-11-01T05:30:00.000Z",
        timeZone: "America/New_York",
        state: "pending",
      },
      undoToken: { kind: "next_action_set" },
    },
  });
  expect(first.stale).toMatchObject({ ok: false, error: { code: "conflict" } });
  expect(first.afterStale.value.job).toEqual(first.after.value.job);
  const scheduledId = first.scheduled.value.nextAction.id;
  await page.reload();
  await expect(page.locator("[data-job-workspace]")).toBeVisible();
  const scheduledReadback = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
    jobId,
  );
  expect(scheduledReadback).toMatchObject({
    ok: true,
    value: {
      job: { nextAction: { id: scheduledId, title, dueAt: "2026-11-01T05:30:00.000Z" } },
      attention: { nextAction: { id: scheduledId, timeZone: "America/New_York" } },
    },
  });
  await expect(header).toHaveText(`${title} — Due 2026-11-01 05:30:00.000 UTC`);
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(page.locator("[data-job-workspace]")).toHaveAttribute(
    "data-workspace-mode",
    "full-page",
  );
  await expect(header).toHaveText(`${title} — Due 2026-11-01 05:30:00.000 UTC`);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  const accessibility = await new AxeBuilder({ page }).include("[data-job-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("task-header-512-320.png"), fullPage: true });
  const second = await page.evaluate(
    async ({ jobId, title, tokenId }) => {
      const api = globalThis.coredrillStorageSpike;
      const undone = await api.pipelineMutations.undo({ tokenId });
      const current = await api.pipeline.workspace({ jobId });
      if (!current.ok) throw new Error("Synthetic task fixture is unavailable");
      const unscheduled = await api.nextActions.setNextAction({
        jobId,
        title,
        expected: { jobRowVersion: current.value.job.rowVersion },
      });
      return { undone, current, unscheduled };
    },
    { jobId, title, tokenId: first.scheduled.value.undoToken.id },
  );
  expect(second.undone).toMatchObject({ ok: true });
  expect(second.current.value.job.nextAction).toBeNull();
  expect(second.unscheduled).toMatchObject({
    ok: true,
    value: {
      nextAction: {
        title,
        dueAt: null,
        timeZone: null,
        applicationId: null,
        interactionId: null,
      },
    },
  });
  await page.reload();
  await expect(page.locator("[data-job-workspace]")).toBeVisible();
  await expect(header).toHaveText(`${title} — Unscheduled`);
  const final = await page.evaluate(
    async ({ jobId, tokenId }) => {
      const api = globalThis.coredrillStorageSpike;
      const readback = await api.pipeline.workspace({ jobId });
      const undone = await api.pipelineMutations.undo({ tokenId });
      const replay = await api.pipelineMutations.undo({ tokenId });
      const after = await api.pipeline.workspace({ jobId });
      return { readback, undone, replay, after };
    },
    { jobId, tokenId: second.unscheduled.value.undoToken.id },
  );
  expect(final.readback).toMatchObject({
    ok: true,
    value: {
      job: { nextAction: { id: second.unscheduled.value.nextAction.id, title, dueAt: null } },
      attention: { nextAction: { timeZone: null } },
    },
  });
  expect(final.undone).toMatchObject({ ok: true });
  expect(final.replay).toMatchObject({ ok: false, error: { code: "conflict" } });
  expect(final.after.value.job.nextAction).toBeNull();
  const lifecycle = await page.evaluate(
    async ({ jobId }) => {
      const api = globalThis.coredrillStorageSpike;
      const before = await api.pipeline.workspace({ jobId });
      if (!before.ok) throw new Error("Synthetic task owner is unavailable");
      const created = await api.nextActions.setNextAction({
        jobId,
        title: "Deliberately complete this local task",
        expected: { jobRowVersion: before.value.job.rowVersion },
        dueAt: "2026-11-01T06:30:00.000Z",
        timeZone: "America/New_York",
      });
      if (!created.ok) throw new Error("Synthetic task creation failed");
      const page = await api.nextActions.listPage({ jobId, limit: 1 });
      if (!page.ok) throw new Error("Synthetic task page is unavailable");
      const request = {
        jobId,
        nextActionId: created.value.nextAction.id,
        expected: {
          jobRowVersion: page.value.jobRowVersion,
          nextActionRowVersion: created.value.nextAction.rowVersion,
        },
      };
      const stale = await api.nextActions.complete({
        ...request,
        expected: {
          ...request.expected,
          nextActionRowVersion: request.expected.nextActionRowVersion + 1,
        },
      });
      const unchanged = await api.nextActions.listPage({ jobId, limit: 1 });
      const completed = await api.nextActions.complete(request);
      const replay = await api.nextActions.complete(request);
      const invalidatedPage = await api.nextActions.listPage({
        jobId,
        limit: 1,
        after: page.value.nextCursor,
      });
      const after = await api.pipeline.workspace({ jobId });
      const history = await api.nextActions.listPage({ jobId });
      return {
        before,
        created,
        page,
        stale,
        unchanged,
        completed,
        replay,
        invalidatedPage,
        after,
        history,
      };
    },
    { jobId },
  );
  expect(lifecycle.page).toMatchObject({ ok: true, value: { jobId, hasMore: true } });
  expect(lifecycle.stale).toMatchObject({ ok: false, error: { code: "conflict" } });
  expect(lifecycle.unchanged).toEqual(lifecycle.page);
  expect(lifecycle.completed).toMatchObject({
    ok: true,
    value: {
      jobId,
      nextActionId: lifecycle.created.value.nextAction.id,
      state: "completed",
      jobRowVersion: lifecycle.page.value.jobRowVersion + 1,
      nextActionRowVersion: 2,
    },
  });
  expect(lifecycle.replay).toMatchObject({ ok: false, error: { code: "conflict" } });
  expect(lifecycle.invalidatedPage).toMatchObject({ ok: false, error: { code: "conflict" } });
  expect(lifecycle.after.value.job.nextAction).toBeNull();
  expect(lifecycle.after.value.application).toEqual(lifecycle.before.value.application);
  expect(lifecycle.history.value.items).toHaveLength(3);
  expect(lifecycle.history.value.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: lifecycle.created.value.nextAction.id,
        state: "completed",
        dueAt: "2026-11-01T06:30:00.000Z",
        timeZone: "America/New_York",
        completedAt: lifecycle.completed.value.completedAt,
      }),
      expect.objectContaining({ id: scheduledId, state: "dismissed" }),
      expect.objectContaining({ id: second.unscheduled.value.nextAction.id, state: "dismissed" }),
    ]),
  );
  await page.reload();
  await expect(page.locator("[data-job-workspace]")).toBeVisible();
  await expect(header).toHaveText("Not set");
  const durableHistory = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.nextActions.listPage({ jobId }),
    jobId,
  );
  expect(durableHistory).toEqual(lifecycle.history);
  const normalCompletion = await exerciseNormalTaskCompletion(page, testInfo);
  const completionHardening = await exerciseTaskCompletionHardening(page);
  const completionCrossJob = await exerciseTaskCompletionCrossJob(page);
  const normalDismissal = await exerciseNormalTaskDismissal(page, testInfo);
  const dismissalHardening = await exerciseTaskCompletionHardening(page, "dismiss");
  const dismissalCrossJob = await exerciseTaskCompletionCrossJob(page, "dismiss");
  if (originalViewport !== null) await page.setViewportSize(originalViewport);
  return {
    mandatoryContext: true,
    staleRejected: true,
    jobScoped: true,
    scheduledUtcAndIanaRetained: true,
    unscheduledNullPair: true,
    reloadReadback: true,
    undoAndReplay: true,
    normalScheduledTaskFormProven: false,
    canonicalTaskHeader: true,
    fullTitleReachable: true,
    narrowHeaderReflow: true,
    runtimeTaskListAndCompletion: true,
    staleTaskAndReplayRejected: true,
    completionInvalidatesCursor: true,
    completedAndDismissedHistoryRetained: true,
    normalCompletion,
    completionHardening,
    completionCrossJob,
    normalDismissal,
    dismissalHardening,
    dismissalCrossJob,
    normalTaskDismissalControlsProven: true,
    normalTaskCompletionControlsProven: true,
    normalTaskLifecycleControlsProven: true,
  };
};
