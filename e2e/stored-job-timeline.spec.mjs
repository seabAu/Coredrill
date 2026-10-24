import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";

const captureJob = async (page, title) => {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add job/u }).click();
  const capture = page.getByRole("dialog");
  await capture.getByLabel(/Job title/u).fill(title);
  await capture.getByLabel(/Company/u).fill("Synthetic Timeline Lab");
  await capture.getByLabel(/Notes or listing details/u).fill("Synthetic offline history fixture.");
  await capture.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
  await capture.getByRole("button", { name: "Close capture dialog" }).click();
  await page.locator('[data-pipeline-view-option="inbox"]').click();
  const review = page.getByTestId("capture-review");
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await review.getByRole("button", { name: "Save as new job" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
  await page.locator('[data-pipeline-view-option="board"]').click();
};

test("normal Timeline pages real offline history, retains failures and ignores a closed job's late read", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const errors = [];
  const external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4181/")) external.push(request.url());
  });
  // Hold only JS's responsive-mode observation; real viewport/CSS still reflow.
  // This makes the pre-render breakpoint interval deterministic, not a delay.
  await page.addInitScript(() => {
    const original = globalThis.matchMedia.bind(globalThis);
    const readMatches = Object.getOwnPropertyDescriptor(
      globalThis.MediaQueryList.prototype,
      "matches",
    ).get;
    const probe = { holdWide: false, queries: [] };
    globalThis.coredrillTimelineBreakpoint = probe;
    globalThis.matchMedia = (query) => {
      const media = original(query);
      if (query === "(min-width: 80rem)") {
        Object.defineProperty(media, "matches", {
          get: () => probe.holdWide || readMatches.call(media),
        });
        probe.queries.push(media);
      }
      return media;
    };
  });
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await page.waitForFunction(
    () => globalThis.coredrillOfflineShell?.getState().registered === true,
  );
  await page.evaluate(() => globalThis.navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Pipeline", exact: true })
    .click();
  const board = page.getByTestId("pipeline-board");
  const close = page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u });
  await captureJob(page, "Synthetic stage owner");
  await board.getByRole("button", { name: "Synthetic stage owner", exact: true }).click();
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  const preparation = page.getByRole("form", { name: "Start local application preparation" });
  await preparation.getByLabel("Preparation stage name").fill("My recorded drafting stage");
  await preparation.getByRole("button", { name: "Start preparation locally" }).click();
  await expect(page.locator('[data-preparation-status="missing"]')).toBeVisible();
  await close.click();
  await captureJob(page, "Synthetic history role");
  await board.getByRole("button", { name: "Synthetic history role", exact: true }).click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  const history = page.getByRole("region", { name: "Stored job timeline", exact: true });
  await expect(
    history.getByRole("heading", { name: "No recorded history yet", exact: true }),
  ).toBeVisible();
  const jobId = new URL(page.url()).pathname.split("/")[2];
  await close.click();
  const move = board.getByRole("combobox", {
    name: "Move Synthetic history role to stage",
    exact: true,
  });
  const changes = page.getByRole("region", { name: "Local status changes", exact: true });
  await move.selectOption({ label: "My recorded drafting stage" });
  await expect(changes.getByRole("status")).toContainText("Saved Synthetic history role");
  await changes
    .getByRole("button", { name: "Undo status change for Synthetic history role", exact: true })
    .click();
  await expect(changes.getByRole("status")).toContainText("Restored Synthetic history role");
  await move.selectOption({ label: "My recorded drafting stage" });
  await expect(changes.getByRole("status")).toContainText("Saved Synthetic history role");
  const original = await page.evaluate(async (jobId) => {
    const api = globalThis.coredrillStorageSpike;
    const witness = await api.pipeline.timeline({ jobId });
    globalThis.coredrillTimelineProof = {
      api,
      failMore: true,
      failRefresh: true,
      holdNext: false,
      release: null,
      calls: 0,
      completed: 0,
    };
    // Only page size and faults change; all successful reads use the real validated query.
    globalThis.coredrillStorageSpike = {
      ...api,
      pipeline: {
        ...api.pipeline,
        timeline: async (input) => {
          const proof = globalThis.coredrillTimelineProof;
          proof.calls += 1;
          if ((input.after && proof.failMore) || (!input.after && proof.failRefresh)) {
            if (input.after) proof.failMore = false;
            else proof.failRefresh = false;
            return {
              ok: false,
              error: {
                code: "unavailable",
                message: "Synthetic history temporarily unavailable.",
                retryable: true,
              },
            };
          }
          if (proof.holdNext) {
            proof.holdNext = false;
            await new Promise((resolve) => {
              proof.release = resolve;
            });
          }
          const result = await api.pipeline.timeline({ ...input, limit: 1 });
          proof.completed += 1;
          return result;
        },
      },
    };
    return witness;
  }, jobId);
  expect(original.ok).toBe(true);
  expect(original.value.items).toHaveLength(2);
  await board.getByRole("button", { name: "Synthetic history role", exact: true }).click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(history.getByRole("alert")).toBeVisible();
  await expect(history.locator("[data-timeline-id]")).toHaveCount(0);
  await history.getByRole("button", { name: "Retry loading history", exact: true }).click();
  await expect(history.locator("[data-timeline-id]")).toHaveCount(1);
  await history.getByRole("button", { name: "Load older history", exact: true }).click();
  await expect(history.getByRole("alert")).toContainText(
    "Synthetic history temporarily unavailable",
  );
  await expect(history.locator("[data-timeline-id]")).toHaveCount(1);
  await page.evaluate(() => {
    globalThis.coredrillTimelineProof.holdNext = true;
  });
  await history.getByRole("button", { name: "Retry older history", exact: true }).click();
  await page.waitForFunction(() => globalThis.coredrillTimelineProof.release !== null);
  await expect(
    history.getByRole("button", { name: "Refresh history", exact: true }),
  ).toBeDisabled();
  await close.focus();
  await page.evaluate(() => {
    globalThis.coredrillTimelineProof.release();
    globalThis.coredrillTimelineProof.release = null;
  });
  await expect(history.locator("[data-timeline-id]")).toHaveCount(2);
  await expect(close).toBeFocused();
  await expect(history).toContainText("Reversed by a recorded undo");
  await page.evaluate(() => {
    globalThis.coredrillTimelineProof.failRefresh = true;
  });
  await history.getByRole("button", { name: "Refresh history", exact: true }).click();
  await expect(history.getByRole("alert")).toBeVisible();
  await expect(history.locator("[data-timeline-id]")).toHaveCount(2);
  await history.getByRole("button", { name: "Retry refreshing history", exact: true }).click();
  await expect(history.locator("[data-timeline-id]")).toHaveCount(1);
  await history.getByRole("button", { name: "Load older history", exact: true }).press("Enter");
  await expect(history.locator("[data-timeline-id]")).toHaveCount(2);
  await expect(history).toBeFocused();
  await page.evaluate(() => {
    globalThis.coredrillTimelineBreakpoint.holdWide = true;
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ forcedColors: "active" });
  await expect(history.locator("[data-timeline-id]")).toHaveCount(2);
  const reflowLayout = await page.evaluate(() => ({
    viewport: globalThis.innerWidth,
    documentWidth: globalThis.document.documentElement.scrollWidth,
    overflowing: [...globalThis.document.querySelectorAll("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: element.getAttribute("class"),
          left: rect.left,
          right: rect.right,
          width: rect.width,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        };
      })
      .filter((item) => item.right > globalThis.innerWidth + 1 || item.left < -1)
      .slice(0, 80),
  }));
  await testInfo.attach("timeline-reflow-layout.json", {
    body: JSON.stringify(reflowLayout, null, 2),
    contentType: "application/json",
  });
  expect(reflowLayout.documentWidth <= reflowLayout.viewport).toBe(true);
  await page.evaluate(() => {
    const probe = globalThis.coredrillTimelineBreakpoint;
    probe.holdWide = false;
    for (const media of probe.queries) media.dispatchEvent(new globalThis.Event("change"));
  });
  await expect(page.locator("[data-job-workspace]")).toHaveAttribute(
    "data-workspace-mode",
    "full-page",
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await history.scrollIntoViewIfNeeded();
  const offlineNotice = page.getByRole("button", { name: "Dismiss", exact: true });
  if (await offlineNotice.isVisible()) await offlineNotice.click();
  await history.screenshot({
    path: testInfo.outputPath("stored-timeline-320-forced-colors.png"),
  });
  await page.emulateMedia({ forcedColors: "none" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    globalThis.coredrillTimelineProof.holdNext = true;
  });
  await history.getByRole("button", { name: "Refresh history", exact: true }).click();
  await page.waitForFunction(() => globalThis.coredrillTimelineProof.release !== null);
  await close.click();
  await board.getByRole("button", { name: "Synthetic stage owner", exact: true }).click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(history.locator("[data-timeline-id]")).toHaveCount(1);
  const beforeRelease = await page.evaluate(() => {
    const proof = globalThis.coredrillTimelineProof;
    const before = proof.completed;
    proof.release();
    globalThis.coredrillStorageSpike = proof.api;
    return before;
  });
  await page.waitForFunction(
    (before) => globalThis.coredrillTimelineProof.completed > before,
    beforeRelease,
  );
  await expect(history.locator("[data-timeline-id]")).toHaveCount(1);
  const ownerIds = await history
    .locator("[data-timeline-id]")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.timelineId));
  expect(ownerIds.some((id) => original.value.items.some((item) => item.id === id))).toBe(false);
  await close.click();
  await board.getByRole("button", { name: "Synthetic history role", exact: true }).click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await page.reload();
  await expect(history.locator("[data-timeline-id]")).toHaveCount(2);
  expect(
    await history
      .locator("[data-timeline-id]")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.timelineId)),
  ).toEqual(original.value.items.map((item) => item.id));
  expect(await page.evaluate(() => globalThis.navigator.onLine)).toBe(false);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
