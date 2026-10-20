import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Positive normal UI journey shared by actual browser/native SQLite runtimes. */
export const exerciseStoredJobNote = async (page, testInfo) => {
  const jobId = new URL(page.url()).pathname.split("/")[2];
  const before = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
    jobId,
  );
  expect(before.ok).toBe(true);
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  const composer = page.getByRole("region", { name: "Local Timeline note", exact: true });
  const field = composer.getByRole("textbox", { name: "Local note text", exact: true });
  const text =
    "  NOTE_UI_START é中🙂 <script>neverExecuteNote()</script>\nKeep exact spacing. NOTE_UI_END  ";
  await field.fill(text);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(field).toHaveValue(text);
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(field).toHaveValue(text);
  await composer.getByRole("button", { name: "Save local note", exact: true }).click();
  await expect(composer.getByRole("status")).toContainText("Saved locally as note");
  await expect(field).toHaveValue("");
  await expect(field).toBeFocused();
  const history = page.getByRole("region", { name: "Stored job timeline", exact: true });
  await expect(history.getByText(text, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => globalThis.neverExecuteNote)).toBeUndefined();
  const stored = await page.evaluate(async (jobId) => {
    const api = globalThis.coredrillStorageSpike.pipeline;
    return { workspace: await api.workspace({ jobId }), timeline: await api.timeline({ jobId }) };
  }, jobId);
  expect(stored.workspace.ok).toBe(true);
  expect(stored.timeline.ok).toBe(true);
  const note = stored.timeline.value.items.find(
    (item) => item.kind === "interaction" && item.summary === text,
  );
  expect(note).toMatchObject({ jobId, type: "note", direction: "unknown", summary: text });
  const { lastInteractionAt: beforeLast, ...beforeJob } = before.value.job;
  const { lastInteractionAt: afterLast, ...afterJob } = stored.workspace.value.job;
  expect(afterJob).toEqual(beforeJob);
  expect(afterLast).toBe(note.occurredAt);
  expect(stored.workspace.value.application).toEqual(before.value.application);
  expect(stored.workspace.value.timelineItemCount).toBe(before.value.timelineItemCount + 1);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  // Cross-platform fallback fonts can change intrinsic widths even at the same viewport.
  for (const font of ["Arial", "monospace"]) {
    await page
      .locator(".cd-stored-job-note, .cd-stored-job-timeline")
      .evaluateAll((nodes, font) => {
        for (const node of nodes) node.style.fontFamily = font;
      }, font);
    const geometry = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowing: Array.from(document.querySelectorAll("body *"))
        .flatMap((node) => {
          const rect = node.getBoundingClientRect();
          return rect.right > document.documentElement.clientWidth + 1 && rect.width > 0
            ? [
                {
                  tag: node.tagName,
                  className: node.className,
                  width: rect.width,
                  right: rect.right,
                },
              ]
            : [];
        })
        .slice(0, 20),
    }));
    if (geometry.scrollWidth > geometry.width)
      console.info(`NOTE_FONT_REFLOW_FAILURE ${JSON.stringify({ font, ...geometry })}`);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
  }
  await page.locator(".cd-stored-job-note, .cd-stored-job-timeline").evaluateAll((nodes) => {
    for (const node of nodes) node.style.removeProperty("font-family");
  });
  const reflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return {
      width,
      scrollWidth: document.documentElement.scrollWidth,
      overflowing: Array.from(document.querySelectorAll("body *"))
        .flatMap((node) => {
          const rect = node.getBoundingClientRect();
          return rect.right > width + 1 && rect.width > 0
            ? [
                {
                  tag: node.tagName,
                  className: node.className,
                  width: rect.width,
                  right: rect.right,
                },
              ]
            : [];
        })
        .slice(0, 20),
    };
  });
  if (reflow.scrollWidth > reflow.width)
    console.info(`NOTE_REFLOW_FAILURE ${JSON.stringify(reflow)}`);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  expect(
    (
      await new AxeBuilder({ page })
        .include(".cd-stored-job-note")
        .include(".cd-stored-job-timeline")
        .analyze()
    ).violations,
  ).toEqual([]);
  if (testInfo) await composer.screenshot({ path: testInfo.outputPath("stored-note-320.png") });
  if (testInfo) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("stored-note-320-full.png"),
      fullPage: true,
    });
  }
  await page.reload();
  await expect(history.getByText(text, { exact: true })).toBeVisible();
  const reloaded = await page.evaluate(
    (jobId) => globalThis.coredrillStorageSpike.pipeline.timeline({ jobId }),
    jobId,
  );
  expect(reloaded.ok).toBe(true);
  expect(reloaded.value.items.filter((item) => item.id === note.id)).toEqual([note]);
  await expect(field).toHaveValue("");
  return {
    jobId,
    noteId: note.id,
    exactText: true,
    canonicalJobUnchanged: true,
    noSendingOrScheduling: true,
    reloaded: true,
    draftSurvivesTabsAndReflow: true,
    axeViolations: 0,
  };
};
