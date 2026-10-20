import { expect } from "@playwright/test";

/** Fault delivery is synthetic; acknowledged writes still use the real runtime. */
export const exerciseTaskEntryLifetime = async (page) => {
  const title = "  Retained é中🙂 <literal-task>  ";
  const open = page.getByRole("button", { name: "Set next action", exact: true });
  const form = page.getByRole("form", { name: "Add local next action", exact: true });
  const field = form.getByRole("textbox", { name: "Task title", exact: true });
  const save = form.getByRole("button", { name: "Save local next action", exact: true });
  const cancel = form.getByRole("button", { name: "Cancel task draft", exact: true });
  await open.click();
  await field.fill(title);
  const documentOrigin = await page.evaluate(() => performance.timeOrigin);
  let handled;
  let rejected;
  const warning = new Promise((resolve, reject) => {
    handled = resolve;
    rejected = reject;
  });
  const handleDialog = (dialog) => {
    void dialog.dismiss().then(() => handled(dialog.type()), rejected);
  };
  // Keep delivery subscribed through dismissal, and do not await a new document
  // after deliberately cancelling its navigation.
  page.on("dialog", handleDialog);
  const attemptedReload = page.evaluate(() => window.location.reload()).catch(() => null);
  expect(await warning).toBe("beforeunload");
  await attemptedReload;
  page.off("dialog", handleDialog);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentOrigin);
  await expect(field).toHaveValue(title);
  await page.evaluate(() => {
    const api = globalThis.coredrillStorageSpike;
    globalThis.taskFault = { api, calls: 0, release: null, mode: "fail" };
    globalThis.coredrillStorageSpike = {
      ...api,
      nextActions: {
        ...api.nextActions,
        setNextAction: async (input) => {
          const fault = globalThis.taskFault;
          fault.calls += 1;
          if (fault.mode === "fail") throw new Error("PRIVATE_TASK_FAILURE_DO_NOT_DISPLAY");
          await new Promise((resolve) => {
            fault.release = resolve;
          });
          return api.nextActions.setNextAction(input);
        },
      },
    };
  });
  await save.click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(form.getByRole("alert")).toBeFocused();
  await expect(page.locator("body")).not.toContainText("PRIVATE_TASK_FAILURE_DO_NOT_DISPLAY");
  await expect(field).toHaveValue(title);
  await expect(save).toBeEnabled();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  expect(await page.evaluate(() => globalThis.taskFault.calls)).toBe(1);
  await page.evaluate(() => {
    globalThis.taskFault.mode = "hold";
  });
  await save.click();
  await page.waitForFunction(() => globalThis.taskFault.release !== null);
  await expect(field).toBeDisabled();
  await expect(cancel).toBeDisabled();
  await expect(open).toBeDisabled();
  await expect(page.getByRole("button", { name: "Change status", exact: true })).toBeDisabled();
  await form.evaluate((node) => node.requestSubmit());
  expect(await page.evaluate(() => globalThis.taskFault.calls)).toBe(2);
  const source = page.getByRole("button", { name: "Source", exact: true });
  await source.focus();
  await page.evaluate(() => {
    globalThis.coredrillStorageSpike = globalThis.taskFault.api;
    globalThis.taskFault.release();
  });
  await expect(form).toHaveCount(0);
  await expect(source).toBeFocused();
  const feedback = page.getByRole("region", { name: "Local status and task changes", exact: true });
  await expect(feedback.getByRole("status")).toContainText("Saved a pending task");
  await feedback.getByRole("button", { name: /^Undo next action for /u }).click();
  await expect(feedback.getByRole("status")).toContainText("Undid next-action creation");
  await open.click();
  await field.fill(title);
  await cancel.click();
  const confirm = page.getByRole("region", { name: "Confirm task draft discard", exact: true });
  await expect(confirm.getByRole("heading")).toBeFocused();
  await confirm.getByRole("button", { name: "Keep task draft", exact: true }).click();
  await expect(field).toHaveValue(title);
  await expect(field).toBeFocused();
  await cancel.click();
  await confirm.getByRole("button", { name: "Discard task draft", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await field.fill(title);
  const peer = await page.evaluate(async () => {
    const jobId = new URL(location.href).pathname.split("/")[2];
    const api = globalThis.coredrillStorageSpike;
    const before = await api.pipeline.workspace({ jobId });
    const changed = await api.nextActions.setNextAction({
      jobId,
      title: "Synthetic peer task",
      dueAt: null,
      timeZone: null,
      expected: { jobRowVersion: before.value.job.rowVersion },
    });
    return { changed, after: await api.pipeline.workspace({ jobId }) };
  });
  expect(peer.changed.ok).toBe(true);
  await save.click();
  await expect(form.getByRole("alert")).toContainText("changed since the task draft opened");
  await expect(field).toHaveValue(title);
  expect(
    await page.evaluate(() =>
      globalThis.coredrillStorageSpike.pipeline.workspace({
        jobId: new URL(location.href).pathname.split("/")[2],
      }),
    ),
  ).toEqual(peer.after);
  await feedback.getByRole("button", { name: "Refresh local Pipeline", exact: true }).click();
  await expect(form).toContainText("this draft is not silently rebased");
  await expect(field).toHaveValue(title);
  await expect(field).toBeDisabled();
  await expect(save).toBeDisabled();
  await cancel.click();
  await confirm.getByRole("button", { name: "Discard task draft", exact: true }).click();
  return {
    failedInputRetained: true,
    privateErrorRedacted: true,
    noAutoRetry: true,
    pendingSingleFlight: true,
    sharedStatusLock: true,
    deliberateFocusPreserved: true,
    unloadCancelRetainsDraft: true,
    explicitDiscard: true,
    staleWriteRejectedUnchanged: true,
    noSilentRebaseAfterRefresh: true,
  };
};

export const exerciseTaskEntryCrossJob = async (page) => {
  const ownerTitle = await page.locator("[data-job-workspace] h2").textContent();
  const ownerId = new URL(page.url()).pathname.split("/")[2];
  const otherTitle = "Synthetic other task owner";
  const close = page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u });
  await close.click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add job/u }).click();
  const capture = page.getByRole("dialog");
  await capture.getByLabel(/Job title/u).fill(otherTitle);
  await capture.getByLabel(/Company/u).fill("Synthetic Other Task Lab");
  await capture.getByLabel(/Notes or listing details/u).fill("Synthetic ownership fixture.");
  await capture.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
  await capture.getByRole("button", { name: "Close capture dialog" }).click();
  await page.locator('[data-pipeline-view-option="inbox"]').click();
  const review = page.getByTestId("capture-review");
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await review.getByRole("button", { name: "Save as new job" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
  await page.locator('[data-pipeline-view-option="table"]').click();
  await page.getByRole("button", { name: otherTitle, exact: true }).click();
  const otherId = new URL(page.url()).pathname.split("/")[2];
  const otherBefore = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
    otherId,
  );
  await close.click();
  await page.getByRole("button", { name: ownerTitle, exact: true }).click();
  const open = page.getByRole("button", { name: "Set next action", exact: true });
  const form = page.getByRole("form", { name: "Add local next action", exact: true });
  const field = form.getByRole("textbox", { name: "Task title", exact: true });
  const title = "OWNED_TASK_LITERAL_DO_NOT_SHOW_ON_OTHER_JOB";
  await open.click();
  await field.fill(title);
  await close.click();
  await page.getByRole("button", { name: otherTitle, exact: true }).click();
  const foreign = page.getByRole("region", { name: "Task draft for another job", exact: true });
  await expect(foreign).toContainText(ownerTitle);
  await expect(page.locator("body")).not.toContainText(title);
  await open.click();
  await expect(form).toHaveCount(0);
  await foreign
    .getByRole("button", { name: "Review discarding other job task draft", exact: true })
    .click();
  const confirm = page.getByRole("region", { name: "Confirm task draft discard", exact: true });
  await expect(confirm.getByRole("heading")).toBeFocused();
  await confirm.getByRole("button", { name: "Keep task draft", exact: true }).click();
  await close.click();
  await page.getByRole("button", { name: ownerTitle, exact: true }).click();
  await expect(field).toHaveValue(title);
  await page.evaluate(() => {
    const api = globalThis.coredrillStorageSpike;
    globalThis.taskCrossJob = { api, calls: 0, release: null, result: null };
    globalThis.coredrillStorageSpike = {
      ...api,
      nextActions: {
        ...api.nextActions,
        setNextAction: async (input) => {
          globalThis.taskCrossJob.calls += 1;
          await new Promise((resolve) => {
            globalThis.taskCrossJob.release = resolve;
          });
          const result = await api.nextActions.setNextAction(input);
          globalThis.taskCrossJob.result = result;
          return result;
        },
      },
    };
  });
  await form.getByRole("button", { name: "Save local next action", exact: true }).click();
  await page.waitForFunction(() => globalThis.taskCrossJob.release !== null);
  await close.click();
  await page.getByRole("button", { name: otherTitle, exact: true }).click();
  await expect(foreign.getByRole("button")).toBeDisabled();
  const deliberate = page.getByRole("button", { name: "Source", exact: true });
  await deliberate.focus();
  await page.evaluate(() => {
    globalThis.coredrillStorageSpike = globalThis.taskCrossJob.api;
    globalThis.taskCrossJob.release();
  });
  await expect(foreign).toHaveCount(0);
  await expect(deliberate).toBeFocused();
  await expect(page.locator("[data-job-workspace]")).toHaveAttribute("data-job-workspace", otherId);
  expect(
    await page.evaluate(
      (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
      otherId,
    ),
  ).toEqual(otherBefore);
  const saved = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
    ownerId,
  );
  // Creation retains earlier tasks; the header is not a newest-write preview.
  expect(saved.value.attention.nextAction.title).toBe("Synthetic peer task");
  expect(await page.evaluate(() => globalThis.taskCrossJob.result)).toMatchObject({
    ok: true,
    value: { nextAction: { jobId: ownerId, title, dueAt: null, timeZone: null } },
  });
  expect(await page.evaluate(() => globalThis.taskCrossJob.calls)).toBe(1);
  const feedback = page.getByRole("region", { name: "Local status and task changes", exact: true });
  await feedback
    .getByRole("button", { name: `Undo next action for ${ownerTitle}`, exact: true })
    .click();
  await expect(feedback.getByRole("status")).toContainText("Undid next-action creation");
  await close.click();
  await page.getByRole("button", { name: ownerTitle, exact: true }).click();
  await open.click();
  await field.fill(title);
  await close.click();
  await page.getByRole("button", { name: otherTitle, exact: true }).click();
  await foreign.getByRole("button").click();
  await confirm.getByRole("button", { name: "Discard task draft", exact: true }).click();
  await expect(foreign).toHaveCount(0);
  await expect(open).toBeFocused();
  return {
    foreignLiteralHidden: true,
    noDraftReplacement: true,
    returnRetainsInput: true,
    pendingForeignDiscardBlocked: true,
    lateAcknowledgementOwnsOriginalJob: true,
    otherJobUnchanged: true,
    deliberateOtherJobFocusPreserved: true,
    foreignDiscardFocus: true,
  };
};

export const exerciseTaskEntryReadbackFailure = async (page) => {
  const jobTitle = await page.locator("[data-job-workspace] h2").textContent();
  const title = "Acknowledged task survives failed view read";
  const open = page.getByRole("button", { name: "Set next action", exact: true });
  await open.click();
  const form = page.getByRole("form", { name: "Add local next action", exact: true });
  await form.getByRole("textbox", { name: "Task title", exact: true }).fill(title);
  await page.evaluate(() => {
    const api = globalThis.coredrillStorageSpike;
    globalThis.taskReadback = { api, calls: 0 };
    globalThis.coredrillStorageSpike = {
      ...api,
      nextActions: {
        ...api.nextActions,
        setNextAction: async (input) => {
          globalThis.taskReadback.calls += 1;
          const result = await api.nextActions.setNextAction(input);
          if (result.ok)
            globalThis.coredrillStorageSpike = {
              ...globalThis.coredrillStorageSpike,
              pipeline: {
                ...api.pipeline,
                counts: async () => {
                  throw new Error("PRIVATE_TASK_READ_FAILURE_DO_NOT_DISPLAY");
                },
              },
            };
          return result;
        },
      },
    };
  });
  await form.getByRole("button", { name: "Save local next action", exact: true }).click();
  await expect(form).toHaveCount(0);
  const feedback = page.getByRole("region", { name: "Local status and task changes", exact: true });
  await expect(feedback.getByRole("alert")).toContainText("The acknowledged change is saved");
  await expect(feedback.getByRole("alert")).toContainText("view could not refresh");
  await expect(page.locator("body")).not.toContainText("PRIVATE_TASK_READ_FAILURE_DO_NOT_DISPLAY");
  await expect(feedback.getByRole("button", { name: /Retry/u })).toHaveCount(0);
  const saved = await page.evaluate(() =>
    globalThis.taskReadback.api.pipeline.workspace({
      jobId: new URL(location.href).pathname.split("/")[2],
    }),
  );
  expect(saved.value.attention.nextAction.title).toBe(title);
  expect(await page.evaluate(() => globalThis.taskReadback.calls)).toBe(1);
  await page.evaluate(() => {
    globalThis.coredrillStorageSpike = globalThis.taskReadback.api;
  });
  await feedback.getByRole("button", { name: "Refresh local Pipeline", exact: true }).click();
  await expect(page.locator(".cd-job-workspace-context")).toContainText(`${title} — Unscheduled`);
  expect(await page.evaluate(() => globalThis.taskReadback.calls)).toBe(1);
  await feedback
    .getByRole("button", { name: `Undo next action for ${jobTitle}`, exact: true })
    .click();
  await expect(feedback.getByRole("status")).toContainText("Undid next-action creation");
  return {
    acknowledgedWriteNotRetried: true,
    privateReadErrorRedacted: true,
    savedDraftClosed: true,
    explicitRefreshRestoresCanonicalView: true,
    undoRetained: true,
  };
};
