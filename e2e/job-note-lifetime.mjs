import { expect } from "@playwright/test";

/** Negative/latency injection delegates every successful write to the real runtime. */
export const exerciseStoredJobNoteLifetime = async (page, testInfo) => {
  const composer = page.getByRole("region", { name: "Local Timeline note", exact: true });
  const field = composer.getByRole("textbox", { name: "Local note text", exact: true });
  const save = composer.getByRole("button", { name: "Save local note", exact: true });
  const history = page.getByRole("region", { name: "Stored job timeline", exact: true });
  const close = page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u });
  const open = async (title) => {
    await page.getByRole("button", { name: title, exact: true }).click();
    await page.getByRole("button", { name: "Timeline", exact: true }).click();
  };
  await page.evaluate(() => {
    const original = globalThis.coredrillStorageSpike;
    globalThis.coredrillNoteProbe = {
      mode: "failure",
      calls: 0,
      release: null,
      completed: false,
      failHistory: false,
      holdHistory: false,
      holdOnRefreshClick: false,
      refreshClicks: 0,
      heldHistoryCalls: 0,
      releaseHistory: null,
    };
    globalThis.coredrillStorageSpike = {
      ...original,
      jobNotes: {
        recordNote: async (input) => {
          const probe = globalThis.coredrillNoteProbe;
          probe.calls += 1;
          if (probe.mode === "failure") throw new Error("SYNTHETIC_PRIVATE_NOTE_PATH");
          const result = await original.jobNotes.recordNote(input);
          if (probe.mode === "readback-failure") probe.failHistory = true;
          if (probe.mode === "hold")
            await new Promise((resolve) => {
              probe.release = resolve;
            });
          probe.completed = true;
          return result;
        },
      },
      pipeline: {
        ...original.pipeline,
        timeline: async (input) => {
          const probe = globalThis.coredrillNoteProbe;
          const hold = probe.holdHistory;
          if (hold) {
            probe.holdHistory = false;
            probe.heldHistoryCalls++;
          }
          if (probe.failHistory) {
            probe.failHistory = false;
            throw new Error("SYNTHETIC_PRIVATE_HISTORY_PATH");
          }
          const result = await original.pipeline.timeline(input);
          if (hold) {
            await new Promise((resolve) => {
              probe.releaseHistory = resolve;
            });
          }
          return result;
        },
      },
    };
    const armOnRefresh = (event) => {
      const target =
        event.target instanceof Element ? event.target.closest("[data-history-refresh]") : null;
      const probe = globalThis.coredrillNoteProbe;
      if (target === null || target.matches(":disabled") || !probe.holdOnRefreshClick) return;
      probe.holdOnRefreshClick = false;
      probe.holdHistory = true;
      probe.refreshClicks++;
      document.removeEventListener("click", armOnRefresh, true);
    };
    document.addEventListener("click", armOnRefresh, true);
  });
  // Commit the new probe API owner before arming a held read. Otherwise a late
  // root render can consume the hold in its automatic owner-change read and
  // leave the intended Refresh click waiting on that very held operation.
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(history.getByRole("button", { name: "Refresh history", exact: true })).toBeEnabled();
  await page.evaluate(() => {
    // Arm only when the actual enabled Refresh click is dispatched. Automatic
    // reads during Playwright scrolling/actionability checks must settle normally.
    globalThis.coredrillNoteProbe.holdOnRefreshClick = true;
    globalThis.coredrillNoteProbe.mode = "success";
  });
  await history.getByRole("button", { name: "Refresh history", exact: true }).click();
  await page.waitForFunction(() => globalThis.coredrillNoteProbe.releaseHistory !== null);
  expect(
    await page.evaluate(() => ({
      clicks: globalThis.coredrillNoteProbe.refreshClicks,
      held: globalThis.coredrillNoteProbe.heldHistoryCalls,
    })),
  ).toEqual({ clicks: 1, held: 1 });
  await field.fill("QUEUED_HISTORY_NOTE");
  await save.click();
  await expect(composer.getByRole("status")).toContainText("Saved locally as note");
  await expect(field).toHaveValue("");
  await expect(history).not.toContainText("QUEUED_HISTORY_NOTE");
  await page.evaluate(() => {
    globalThis.coredrillNoteProbe.releaseHistory();
  });
  await expect(history.getByText("QUEUED_HISTORY_NOTE", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => globalThis.coredrillNoteProbe.calls)).toBe(1);
  console.log("NOTE_LIFETIME_STAGE acknowledged-invalidation-survived-held-older-read");
  await page.evaluate(() => {
    globalThis.coredrillNoteProbe.calls = 0;
    globalThis.coredrillNoteProbe.mode = "failure";
  });
  await field.fill("RETAINED_FAILURE_NOTE");
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
  // Keep the handler subscribed until navigation settles; a one-shot listener
  // can unsubscribe dialog delivery before the asynchronous dismissal is sent.
  page.on("dialog", handleDialog);
  // Request a real reload without asking Playwright to wait for a new document
  // that must not load after the user cancels the before-unload warning.
  const attemptedReload = page.evaluate(() => window.location.reload()).catch(() => null);
  expect(await warning).toBe("beforeunload");
  await attemptedReload;
  page.off("dialog", handleDialog);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentOrigin);
  await expect(field).toHaveValue("RETAINED_FAILURE_NOTE");
  console.log("NOTE_LIFETIME_STAGE unload-cancelled-with-same-document-and-draft");
  await save.click();
  await expect(composer.getByRole("alert")).toContainText("save could not be confirmed");
  await expect(composer.getByRole("alert")).toBeFocused();
  await expect(composer).not.toContainText("SYNTHETIC_PRIVATE_NOTE_PATH");
  await expect(field).toHaveValue("RETAINED_FAILURE_NOTE");
  expect(await page.evaluate(() => globalThis.coredrillNoteProbe.calls)).toBe(1);
  await history.getByRole("button", { name: "Refresh history", exact: true }).click();
  await expect(history.getByRole("button", { name: "Refresh history", exact: true })).toBeEnabled();
  await page.evaluate(() => {
    globalThis.coredrillNoteProbe.mode = "success";
  });
  await save.click();
  await expect(history.getByText("RETAINED_FAILURE_NOTE", { exact: true })).toBeVisible();
  await expect(field).toHaveValue("");
  await expect(composer.getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.coredrillNoteProbe.calls)).toBe(2);
  console.log("NOTE_LIFETIME_STAGE failed-write-retained-and-explicit-retry-saved");

  await field.fill("ACKNOWLEDGED_ONLY_ONCE");
  await page.evaluate(() => {
    globalThis.coredrillNoteProbe.mode = "readback-failure";
  });
  await save.click();
  await expect(composer.getByRole("status")).toContainText("Saved locally as note");
  await expect(history.getByRole("alert")).toContainText("could not be loaded");
  await expect(history).not.toContainText("SYNTHETIC_PRIVATE_HISTORY_PATH");
  await expect(field).toHaveValue("");
  await expect(save).toBeDisabled();
  const acknowledgedCalls = await page.evaluate(() => globalThis.coredrillNoteProbe.calls);
  await history.getByRole("button", { name: "Retry refreshing history", exact: true }).click();
  await expect(history.getByText("ACKNOWLEDGED_ONLY_ONCE", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => globalThis.coredrillNoteProbe.calls)).toBe(acknowledgedCalls);
  console.log("NOTE_LIFETIME_STAGE acknowledged-save-not-repeated-after-read-failure");

  await field.fill("UNSAVED_FOR_FIRST_JOB");
  await close.click();
  await open("Other note role");
  await expect(composer).toContainText("belongs to another job");
  await expect(field).toHaveCount(0);
  await expect(composer).not.toContainText("UNSAVED_FOR_FIRST_JOB");
  await composer.getByRole("button", { name: "Discard unsaved note", exact: true }).click();
  await composer.getByRole("button", { name: "Keep unsaved note", exact: true }).click();
  await close.click();
  await open("First note role");
  await expect(field).toHaveValue("UNSAVED_FOR_FIRST_JOB");
  await close.click();
  await open("Other note role");
  await composer.getByRole("button", { name: "Discard unsaved note", exact: true }).click();
  await composer.getByRole("button", { name: "Confirm discard unsaved note", exact: true }).click();
  await expect(field).toHaveValue("");
  await expect(field).toBeFocused();
  expect(await page.evaluate(() => globalThis.coredrillNoteProbe.calls)).toBe(acknowledgedCalls);
  await close.click();
  await open("First note role");
  await field.fill("HELD_SINGLE_FLIGHT_NOTE");
  console.log("NOTE_LIFETIME_STAGE foreign-draft-kept-and-explicitly-discarded");
  await page.evaluate(() => {
    globalThis.coredrillNoteProbe.mode = "hold";
  });
  await save.click();
  await page.waitForFunction(() => globalThis.coredrillNoteProbe.release !== null);
  const heldCalls = await page.evaluate(() => globalThis.coredrillNoteProbe.calls);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(field).toHaveValue("HELD_SINGLE_FLIGHT_NOTE");
  await expect(field).toBeDisabled();
  await expect(
    composer.getByRole("button", { name: "Saving local note…", exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => globalThis.coredrillNoteProbe.calls)).toBe(heldCalls);
  await history.focus();
  await page.evaluate(() => {
    globalThis.coredrillNoteProbe.release();
  });
  await expect(history.getByText("HELD_SINGLE_FLIGHT_NOTE", { exact: true })).toBeVisible();
  await expect(history).toBeFocused();
  await expect(field).toHaveValue("");
  await field.fill("LATE_ACK_FOR_FIRST_JOB");
  console.log("NOTE_LIFETIME_STAGE responsive-single-flight-and-deliberate-focus-preserved");
  await page.evaluate(() => {
    globalThis.coredrillNoteProbe.release = null;
    globalThis.coredrillNoteProbe.completed = false;
  });
  await save.click();
  await page.waitForFunction(() => globalThis.coredrillNoteProbe.release !== null);
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(field).toHaveValue("LATE_ACK_FOR_FIRST_JOB");
  await close.click();
  await open("Other note role");
  await expect(composer).toContainText("another job is saving");
  await history.focus();
  await page.evaluate(() => {
    globalThis.coredrillNoteProbe.release();
  });
  await page.waitForFunction(() => globalThis.coredrillNoteProbe.completed);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(field).toHaveValue("");
  await expect(composer).not.toContainText("LATE_ACK_FOR_FIRST_JOB");
  await expect(history).not.toContainText("LATE_ACK_FOR_FIRST_JOB");
  await expect(history).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await composer.screenshot({ path: testInfo.outputPath("stored-note-late-other-job-320.png") });
  await close.click();
  await open("First note role");
  await expect(history.getByText("LATE_ACK_FOR_FIRST_JOB", { exact: true })).toHaveCount(1);
  await expect(history.getByText("ACKNOWLEDGED_ONLY_ONCE", { exact: true })).toHaveCount(1);
  await expect(history).not.toContainText("UNSAVED_FOR_FIRST_JOB");
  await page.reload();
  await expect(history.getByText("LATE_ACK_FOR_FIRST_JOB", { exact: true })).toHaveCount(1);
  return {
    unloadWarningDismissedPreservesDraft: true,
    failureTextRetained: true,
    privateErrorsRedacted: true,
    acknowledgedWriteNotRetriedOnReadFailure: true,
    acknowledgedInvalidationWaitsForHeldHistory: true,
    foreignDraftOwnership: true,
    explicitDiscard: true,
    responsiveSingleFlight: true,
    deliberateFocusPreserved: true,
    lateCrossJobAcknowledgementIsolated: true,
  };
};
