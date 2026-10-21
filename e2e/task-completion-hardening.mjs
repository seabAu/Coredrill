import { expect } from "@playwright/test";

const resolutionLabels = (kind) => ({
  noun: kind === "complete" ? "completion" : "dismissal",
  action: kind === "complete" ? "Mark complete" : "Dismiss task",
  confirm: kind === "complete" ? "Confirm completion" : "Confirm dismissal",
  cancel: kind === "complete" ? "Cancel completion review" : "Cancel dismissal review",
  pending: kind === "complete" ? "Recording completion…" : "Recording dismissal…",
  cancelOther:
    kind === "complete"
      ? "Cancel other job's completion review"
      : "Cancel other job's dismissal review",
  state: kind === "complete" ? "completed" : "dismissed",
  notice: kind === "complete" ? "Task marked complete locally" : "Task dismissed locally",
  failureTitle: `Synthetic ${kind} failure retains original intent`,
  staleTitle: `Original viewed ${kind} must not rebase`,
  ackTitle: `Acknowledged ${kind} with failed reads`,
});

const tasksFor = (page) => page.getByRole("region", { name: "Stored job tasks", exact: true });
const reviewFor = (page, kind) =>
  tasksFor(page).getByRole("region", {
    name: kind === "complete" ? "Review task completion" : "Review task dismissal",
    exact: true,
  });
const createTask = async (page, title) => {
  await page.getByRole("button", { name: "Set next action", exact: true }).click();
  const form = page.getByRole("form", { name: "Add local next action", exact: true });
  await form.getByRole("textbox", { name: "Task title", exact: true }).fill(title);
  await form.getByRole("button", { name: "Save local next action", exact: true }).click();
  await expect(form).toHaveCount(0);
  const task = tasksFor(page)
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(task).toContainText("State: pending.");
  return task;
};

/** Synthetic fault delivery wraps real runtime writes; it does not fake acknowledgements. */
export const exerciseTaskCompletionHardening = async (page, kind = "complete") => {
  const labels = resolutionLabels(kind);
  const jobId = new URL(page.url()).pathname.split("/")[2];
  const jobTitle = await page.locator("[data-job-workspace] h2").textContent();
  const tasks = tasksFor(page);
  const review = reviewFor(page, kind);
  const task = await createTask(page, labels.failureTitle);
  await task.getByRole("button", { name: labels.action, exact: true }).click();
  await page.evaluate((method) => {
    const api = globalThis.coredrillStorageSpike;
    globalThis.completionFault = { api, calls: 0, mode: "fail", release: null };
    globalThis.coredrillStorageSpike = {
      ...api,
      nextActions: {
        ...api.nextActions,
        [method]: async (input) => {
          const fault = globalThis.completionFault;
          fault.calls += 1;
          if (fault.mode === "fail") throw new Error("PRIVATE_COMPLETION_FAULT");
          await new Promise((resolve) => {
            fault.release = resolve;
          });
          return api.nextActions[method](input);
        },
      },
    };
  }, kind);
  await review.getByRole("button", { name: labels.confirm, exact: true }).click();
  await expect(review.getByRole("alert")).toBeVisible();
  await expect(review).toContainText(labels.failureTitle);
  await expect(task).toContainText("State: pending.");
  await expect(page.locator("body")).not.toContainText("PRIVATE_COMPLETION_FAULT");
  expect(await page.evaluate(() => globalThis.completionFault.calls)).toBe(1);
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  expect(await page.evaluate(() => globalThis.completionFault.calls)).toBe(1);
  await page.evaluate(() => {
    globalThis.completionFault.mode = "hold";
  });
  await review.getByRole("button", { name: labels.confirm, exact: true }).click();
  await page.waitForFunction(() => globalThis.completionFault.release !== null);
  await expect(review.getByRole("button", { name: labels.pending, exact: true })).toBeDisabled();
  await expect(review.getByRole("button", { name: labels.cancel, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Set next action", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Change status", exact: true })).toBeDisabled();
  const source = page.getByRole("button", { name: "Source", exact: true });
  await source.focus();
  await page.evaluate(() => {
    globalThis.coredrillStorageSpike = globalThis.completionFault.api;
    globalThis.completionFault.release();
  });
  await expect(review).toHaveCount(0);
  await expect(task).toContainText(`State: ${labels.state}.`);
  await expect(source).toBeFocused();
  expect(await page.evaluate(() => globalThis.completionFault.calls)).toBe(2);

  const staleTask = await createTask(page, labels.staleTitle);
  await staleTask.getByRole("button", { name: labels.action, exact: true }).click();
  const peer = await page.evaluate(async (jobId) => {
    const api = globalThis.coredrillStorageSpike;
    const before = await api.pipeline.workspace({ jobId });
    const created = await api.nextActions.setNextAction({
      jobId,
      title: "Synthetic peer advances the job",
      expected: { jobRowVersion: before.value.job.rowVersion },
    });
    return { created, after: await api.nextActions.listPage({ jobId }) };
  }, jobId);
  expect(peer.created.ok).toBe(true);
  await review.getByRole("button", { name: labels.confirm, exact: true }).click();
  await expect(review.getByRole("alert")).toContainText("changed");
  expect(
    await page.evaluate(
      (jobId) => globalThis.coredrillStorageSpike.nextActions.listPage({ jobId }),
      jobId,
    ),
  ).toEqual(peer.after);
  await tasks
    .getByRole("button", { name: "Refresh job and tasks / first page", exact: true })
    .click();
  await expect(review).toContainText("will not be rebound");
  await expect(review.getByRole("button", { name: labels.confirm, exact: true })).toBeDisabled();
  await review.getByRole("button", { name: labels.cancel, exact: true }).click();
  await staleTask.getByRole("button", { name: labels.action, exact: true }).click();
  await review.getByRole("button", { name: labels.confirm, exact: true }).click();
  await expect(staleTask).toContainText(`State: ${labels.state}.`);

  const acknowledged = await createTask(page, labels.ackTitle);
  const acknowledgedId = await acknowledged.getAttribute("data-stored-task-id");
  await page.evaluate((method) => {
    const api = globalThis.coredrillStorageSpike;
    globalThis.completionReadback = { api, calls: 0, failReads: false };
    globalThis.coredrillStorageSpike = {
      ...api,
      pipeline: {
        ...api.pipeline,
        counts: async (...args) => {
          if (globalThis.completionReadback.failReads)
            throw new Error("PRIVATE_COMPLETION_READBACK");
          return api.pipeline.counts(...args);
        },
      },
      nextActions: {
        ...api.nextActions,
        listPage: async (input) => {
          if (globalThis.completionReadback.failReads) throw new Error("PRIVATE_TASK_READBACK");
          return api.nextActions.listPage(input);
        },
        [method]: async (input) => {
          globalThis.completionReadback.calls += 1;
          const result = await api.nextActions[method](input);
          if (result.ok) globalThis.completionReadback.failReads = true;
          return result;
        },
      },
    };
  }, kind);
  // Reopen to construct a reader using the fault-delivery boundary before the write.
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  await page.getByRole("button", { name: jobTitle, exact: true }).click();
  await acknowledged.getByRole("button", { name: labels.action, exact: true }).click();
  await review.getByRole("button", { name: labels.confirm, exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(tasks.getByRole("status")).toContainText(labels.notice);
  await expect(tasks.getByRole("alert")).toContainText("may be stale");
  await expect(
    acknowledged.getByRole("button", { name: labels.action, exact: true }),
  ).toBeDisabled();
  const feedback = page.getByRole("region", { name: "Local status and task changes", exact: true });
  await expect(feedback.getByRole("alert")).toContainText("acknowledged change is saved");
  await expect(page.locator("body")).not.toContainText("PRIVATE_");
  expect(await page.evaluate(() => globalThis.completionReadback.calls)).toBe(1);
  const saved = await page.evaluate(
    (jobId) => globalThis.completionReadback.api.nextActions.listPage({ jobId }),
    jobId,
  );
  expect(saved.value.items.find(({ id }) => id === acknowledgedId)).toMatchObject({
    state: labels.state,
    rowVersion: 2,
  });
  await page.evaluate(() => {
    globalThis.completionReadback.failReads = false;
    globalThis.coredrillStorageSpike = globalThis.completionReadback.api;
  });
  await tasks
    .getByRole("button", { name: "Refresh job and tasks / first page", exact: true })
    .click();
  await expect(acknowledged).toContainText(`State: ${labels.state}.`);
  await expect(tasks.getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.completionReadback.calls)).toBe(1);

  const inventory = await page.evaluate(async (jobId) => {
    const api = globalThis.coredrillStorageSpike;
    // Synthetic scale setup uses real commands, and completes each task so no pending fixture leaks.
    for (let index = 0; index < 27; index += 1) {
      const current = await api.pipeline.workspace({ jobId });
      const created = await api.nextActions.setNextAction({
        jobId,
        title: `Synthetic bounded page ${index}`,
        expected: { jobRowVersion: current.value.job.rowVersion },
      });
      if (!created.ok) throw new Error("Synthetic pagination setup failed");
      const owner = await api.pipeline.workspace({ jobId });
      const done = await api.nextActions.complete({
        jobId,
        nextActionId: created.value.nextAction.id,
        expected: {
          jobRowVersion: owner.value.job.rowVersion,
          nextActionRowVersion: created.value.nextAction.rowVersion,
        },
      });
      if (!done.ok) throw new Error("Synthetic pagination completion failed");
    }
    // Complete the peer task left pending by the stale-review test.
    const current = await api.nextActions.listPage({ jobId, limit: 100 });
    for (const task of current.value.items.filter(({ state }) => state === "pending")) {
      const owner = await api.pipeline.workspace({ jobId });
      const result = await api.nextActions.complete({
        jobId,
        nextActionId: task.id,
        expected: {
          jobRowVersion: owner.value.job.rowVersion,
          nextActionRowVersion: task.rowVersion,
        },
      });
      if (!result.ok) throw new Error("Synthetic pending cleanup failed");
    }
    return api.nextActions.listPage({ jobId, limit: 100 });
  }, jobId);
  await tasks
    .getByRole("button", { name: "Refresh job and tasks / first page", exact: true })
    .click();
  await expect(tasks.locator("li")).toHaveCount(25);
  await expect(tasks.locator("li").first()).toHaveAttribute(
    "data-stored-task-id",
    inventory.value.items[0].id,
  );
  const firstIds = await tasks
    .locator("li")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.storedTaskId));
  expect(inventory.value.hasMore).toBe(false);
  const seen = new Set(firstIds);
  let loaded = firstIds.length;
  const older = tasks.getByRole("button", { name: "Older tasks", exact: true });
  while ((await older.count()) > 0) {
    await older.click();
    await expect(tasks.locator("li").first()).toHaveAttribute(
      "data-stored-task-id",
      inventory.value.items[loaded].id,
    );
    await expect(tasks.locator("li")).toHaveCount(
      Math.min(25, inventory.value.items.length - loaded),
    );
    const ids = await tasks
      .locator("li")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.storedTaskId));
    expect(ids).toEqual(inventory.value.items.slice(loaded, loaded + 25).map(({ id }) => id));
    expect(ids.some((id) => seen.has(id))).toBe(false);
    for (const id of ids) seen.add(id);
    loaded += ids.length;
  }
  expect([...seen].sort()).toEqual(inventory.value.items.map(({ id }) => id).sort());
  await tasks
    .getByRole("button", { name: "Refresh job and tasks / first page", exact: true })
    .click();
  await expect(tasks.locator("li")).toHaveCount(25);
  await expect(tasks.locator("li").first()).toHaveAttribute(
    "data-stored-task-id",
    inventory.value.items[0].id,
  );
  return {
    failedIntentRetained: true,
    privateErrorsRedacted: true,
    resolutionKind: kind,
    heldResolutionSingleFlight: true,
    noLateFocusTheft: true,
    staleReviewNotRebased: true,
    acknowledgedResolutionNotRepeated: true,
    explicitReadRecovery: true,
    boundedPageReplacement: true,
  };
};

export const exerciseTaskCompletionCrossJob = async (page, kind = "complete") => {
  const labels = resolutionLabels(kind);
  const ownerId = new URL(page.url()).pathname.split("/")[2];
  const ownerTitle = await page.locator("[data-job-workspace] h2").textContent();
  const otherTitle = `Synthetic ${labels.noun} isolation role`;
  const close = page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u });
  await close.click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add job/u }).click();
  const capture = page.getByRole("dialog");
  await capture.getByLabel(/Job title/u).fill(otherTitle);
  await capture.getByLabel(/Company/u).fill(`Synthetic ${labels.noun} Isolation Lab`);
  await capture.getByLabel(/Notes or listing details/u).fill("Wholly synthetic ownership fixture.");
  await capture.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
  await capture.getByRole("button", { name: "Close capture dialog" }).click();
  await page.locator('[data-pipeline-view-option="inbox"]').click();
  const inbox = page.getByTestId("capture-review");
  await inbox.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await inbox.getByRole("button", { name: "Save as new job" }).click();
  await expect(inbox.getByText("No durable captures yet")).toBeVisible();
  await page.locator('[data-pipeline-view-option="table"]').click();
  await page.getByRole("button", { name: otherTitle, exact: true }).click();
  const otherId = new URL(page.url()).pathname.split("/")[2];
  const before = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
    otherId,
  );
  await close.click();
  await page.getByRole("button", { name: ownerTitle, exact: true }).click();
  const literal = `OWNED_${kind.toUpperCase()}_LITERAL_HIDDEN_UNDER_OTHER_JOB`;
  const task = await createTask(page, literal);
  // Dismiss session undo notices so they cannot independently display an older task literal.
  const dismiss = page.getByRole("button", { name: `Dismiss undo for ${ownerTitle}`, exact: true });
  while ((await dismiss.count()) > 0) await dismiss.first().click();
  await task.getByRole("button", { name: labels.action, exact: true }).click();
  await close.click();
  await page.getByRole("button", { name: otherTitle, exact: true }).click();
  const foreign = page.getByRole("region", {
    name: "Task review belongs to another job",
    exact: true,
  });
  await expect(foreign).toBeVisible();
  await expect(page.locator("body")).not.toContainText(literal);
  await expect(tasksFor(page).locator("li")).toHaveCount(0);
  await foreign.getByRole("button", { name: labels.cancelOther, exact: true }).click();
  await expect(foreign).toHaveCount(0);
  await close.click();
  await page.getByRole("button", { name: ownerTitle, exact: true }).click();
  await task.getByRole("button", { name: labels.action, exact: true }).click();
  await page.evaluate((method) => {
    const api = globalThis.coredrillStorageSpike;
    globalThis.completionOwner = { api, calls: 0, release: null };
    globalThis.coredrillStorageSpike = {
      ...api,
      nextActions: {
        ...api.nextActions,
        [method]: async (input) => {
          globalThis.completionOwner.calls += 1;
          await new Promise((resolve) => {
            globalThis.completionOwner.release = resolve;
          });
          return api.nextActions[method](input);
        },
      },
    };
  }, kind);
  await reviewFor(page, kind).getByRole("button", { name: labels.confirm, exact: true }).click();
  await page.waitForFunction(() => globalThis.completionOwner.release !== null);
  await close.click();
  await page.getByRole("button", { name: otherTitle, exact: true }).click();
  await expect(foreign.getByRole("button")).toBeDisabled();
  await expect(page.locator("body")).not.toContainText(literal);
  const source = page.getByRole("button", { name: "Source", exact: true });
  await source.focus();
  await page.evaluate(() => {
    globalThis.coredrillStorageSpike = globalThis.completionOwner.api;
    globalThis.completionOwner.release();
  });
  await expect(foreign).toHaveCount(0);
  await expect(source).toBeFocused();
  await expect(tasksFor(page).locator("li")).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.completionOwner.calls)).toBe(1);
  expect(
    await page.evaluate(
      (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
      otherId,
    ),
  ).toEqual(before);
  await page.evaluate((ownerId) => {
    const api = globalThis.coredrillStorageSpike;
    globalThis.taskReadOwner = { api, release: null, delivered: false };
    globalThis.coredrillStorageSpike = {
      ...api,
      nextActions: {
        ...api.nextActions,
        listPage: async (input) => {
          const result = await api.nextActions.listPage(input);
          if (input.jobId === ownerId) {
            await new Promise((resolve) => {
              globalThis.taskReadOwner.release = resolve;
            });
            globalThis.taskReadOwner.delivered = true;
          }
          return result;
        },
      },
    };
  }, ownerId);
  await close.click();
  await page.getByRole("button", { name: ownerTitle, exact: true }).click();
  await page.waitForFunction(() => globalThis.taskReadOwner.release !== null);
  await expect(tasksFor(page)).toContainText("Loading local tasks");
  await close.click();
  await page.getByRole("button", { name: otherTitle, exact: true }).click();
  await expect(tasksFor(page)).toContainText("No retained tasks");
  await source.focus();
  await page.evaluate(() => {
    globalThis.coredrillStorageSpike = globalThis.taskReadOwner.api;
    globalThis.taskReadOwner.release();
  });
  await page.waitForFunction(() => globalThis.taskReadOwner.delivered);
  await expect(source).toBeFocused();
  await expect(tasksFor(page).locator("li")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(literal);
  await close.click();
  await page.getByRole("button", { name: ownerTitle, exact: true }).click();
  await expect(task).toContainText(`State: ${labels.state}.`);
  return {
    foreignReviewLiteralHidden: true,
    explicitForeignCancel: true,
    pendingForeignCancelBlocked: true,
    resolutionKind: kind,
    resolutionOwnsOriginalJob: true,
    otherJobUnchanged: true,
    lateReadDiscarded: true,
    noOtherJobFocusTheft: true,
  };
};
