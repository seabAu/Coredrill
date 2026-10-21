import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";

test.use({ serviceWorkers: "block" });

const openTaskDraft = async (page) => {
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await page.getByRole("link", { name: "Pipeline", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add job/u }).click();
  const capture = page.getByRole("dialog");
  await capture.getByLabel(/Job title/u).fill("Synthetic scheduling loader role");
  await capture.getByLabel(/Company/u).fill("Synthetic Scheduling Lab");
  await capture.getByLabel(/Notes or listing details/u).fill("Owned helper loading fixture.");
  await capture.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
  await capture.getByRole("button", { name: "Close capture dialog" }).click();
  await page.locator('[data-pipeline-view-option="inbox"]').click();
  const review = page.getByTestId("capture-review");
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await review.getByRole("button", { name: "Save as new job" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
  await page.locator('[data-pipeline-view-option="table"]').click();
  await page.getByRole("button", { name: "Synthetic scheduling loader role", exact: true }).click();
  await page.getByRole("button", { name: "Set next action", exact: true }).click();
  return page.getByRole("form", { name: "Add local next action", exact: true });
};

test("an explicit scheduling load is single-flight, preserves inputs across reflow, and cannot resurrect a discarded draft", async ({
  page,
}) => {
  let release;
  let entered = 0;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let forwarded = Promise.resolve();
  await page.route("**/assets/local-schedule-*.js", (route) => {
    forwarded = (async () => {
      entered += 1;
      await gate;
      await route.continue();
    })();
    return forwarded;
  });
  try {
    const form = await openTaskDraft(page);
    expect(entered).toBe(0);
    const before = await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    );
    await form.getByLabel("Task title", { exact: true }).fill("Synthetic pending helper draft");
    await form.getByRole("checkbox", { name: "Add a due date/time", exact: true }).check();
    await expect.poll(() => entered).toBe(1);
    await expect(form.getByRole("status")).toContainText("Loading the bundled local-time helper");
    await form.getByLabel("Local due date and time", { exact: true }).fill("2026-11-01T01:30");
    await form.getByLabel("IANA time zone", { exact: true }).fill("America/New_York");
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.setViewportSize({ width: 320, height: 900 });
    await expect(form.getByLabel("Local due date and time", { exact: true })).toHaveValue(
      "2026-11-01T01:30",
    );
    await expect(
      form.getByRole("button", { name: "Review exact due time", exact: true }),
    ).toBeDisabled();
    await expect(
      form.getByRole("button", { name: "Save local next action", exact: true }),
    ).toBeDisabled();
    await form.getByRole("checkbox", { name: "Add a due date/time", exact: true }).uncheck();
    await form.getByRole("checkbox", { name: "Add a due date/time", exact: true }).check();
    expect(entered).toBe(1);
    await form.getByRole("button", { name: "Cancel task draft", exact: true }).click();
    await page.getByRole("button", { name: "Discard task draft", exact: true }).click();
    await expect(form).toHaveCount(0);
    await page.getByRole("button", { name: "Set next action", exact: true }).click();
    await expect(form.getByLabel("Task title", { exact: true })).toHaveValue("");
    release();
    await forwarded;
    await form.getByRole("checkbox", { name: "Add a due date/time", exact: true }).check();
    await expect(
      form.getByRole("button", { name: "Review exact due time", exact: true }),
    ).toBeEnabled();
    await expect(form.getByLabel("Local due date and time", { exact: true })).toHaveValue("");
    await expect(form.getByLabel("IANA time zone", { exact: true })).toHaveValue("");
    await expect(form.getByRole("radio")).toHaveCount(0);
    expect(
      await page.evaluate(
        async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
      ),
    ).toBe(before);
  } finally {
    release();
    await forwarded;
  }
});

test("a failed helper load preserves literal intent, warns before reload, and recovers after explicit unscheduled save", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/assets/local-schedule-*.js", (route) => {
    attempts += 1;
    return attempts === 1 ? route.abort("failed") : route.continue();
  });
  const form = await openTaskDraft(page);
  const before = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await form
    .getByLabel("Task title", { exact: true })
    .fill("Synthetic retained failed-load intent");
  await form.getByRole("checkbox", { name: "Add a due date/time", exact: true }).check();
  await form.getByLabel("Local due date and time", { exact: true }).fill("2026-11-01T01:30");
  await form.getByLabel("IANA time zone", { exact: true }).fill("America/New_York");
  await expect(form.getByRole("alert")).toContainText("local-time helper could not load");
  await expect(
    form.getByRole("button", { name: "Save local next action", exact: true }),
  ).toBeDisabled();
  await expect(form.getByRole("alert")).toContainText("Reloading discards this unsaved draft");
  let warnings = 0;
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("beforeunload");
    warnings += 1;
    await dialog.dismiss();
  });
  await form
    .getByRole("button", { name: "Reload workspace after preserving input", exact: true })
    .click();
  expect(warnings).toBe(1);
  await expect(form.getByLabel("Local due date and time", { exact: true })).toHaveValue(
    "2026-11-01T01:30",
  );
  await expect(form.getByLabel("IANA time zone", { exact: true })).toHaveValue("America/New_York");
  expect(attempts).toBe(1);
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(before);
  await form.getByRole("checkbox", { name: "Add a due date/time", exact: true }).uncheck();
  await form.getByRole("button", { name: "Save local next action", exact: true }).click();
  await expect(form).toHaveCount(0);
  const jobId = new URL(page.url()).pathname.split("/")[2];
  const read = () =>
    page.evaluate((jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }), jobId);
  expect(await read()).toMatchObject({
    ok: true,
    value: {
      job: { nextAction: { title: "Synthetic retained failed-load intent", dueAt: null } },
      attention: { nextAction: { timeZone: null } },
    },
  });
  await page.reload();
  await expect(page.locator(".cd-job-workspace-context")).toContainText(
    "Synthetic retained failed-load intent — Unscheduled",
  );
  await page.getByRole("button", { name: "Set next action", exact: true }).click();
  await form.getByRole("checkbox", { name: "Add a due date/time", exact: true }).check();
  await expect(
    form.getByRole("button", { name: "Review exact due time", exact: true }),
  ).toBeEnabled();
  expect(attempts).toBe(2);
});
