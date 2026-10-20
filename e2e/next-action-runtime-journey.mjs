import { expect } from "@playwright/test";

/** Direct production-command composition proof, not the unfinished normal task form. */
export const exerciseNextActionRuntime = async (page) => {
  const jobId = new URL(page.url()).pathname.split("/")[2];
  const title = "Synthetic runtime task — é中🙂";
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
  await page.reload();
  await expect(page.locator("[data-job-workspace]")).toBeVisible();
  return {
    mandatoryContext: true,
    staleRejected: true,
    jobScoped: true,
    scheduledUtcAndIanaRetained: true,
    unscheduledNullPair: true,
    reloadReadback: true,
    undoAndReplay: true,
    normalTaskFormProven: false,
  };
};
