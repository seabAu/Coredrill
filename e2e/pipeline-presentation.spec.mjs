import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("represents Unassigned and missing Pipeline capabilities without fake changes", async ({
  page,
}, testInfo) => {
  const external = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4177/")) external.push(request.url());
  });
  await page.goto("/ui-foundations.html?pipeline=availability");
  await page.waitForFunction(() => globalThis.coredrillPipelinePresentation !== undefined);
  const readonlyBoard = page.getByRole("region", { name: "Read-only Board example", exact: true });
  const activeBoard = page.getByRole("region", {
    name: "Handler-backed Board example",
    exact: true,
  });
  const readonlyTable = page.getByRole("region", { name: "Read-only Table example", exact: true });
  await expect(readonlyBoard.locator('[data-board-unassigned="true"]')).toContainText(
    "No status assigned",
  );
  await expect(readonlyBoard.getByRole("combobox").first()).toBeDisabled();
  await expect(readonlyBoard.locator("[data-board-drag-handle]").first()).toHaveAttribute(
    "draggable",
    "false",
  );
  await expect(readonlyBoard.locator("[data-board-drag-handle]").first()).toHaveCSS(
    "cursor",
    "default",
  );
  await expect(readonlyBoard.locator("[data-board-drag-handle]").first()).toHaveCSS(
    "touch-action",
    "auto",
  );
  await expect(
    readonlyBoard.getByRole("button", { name: "Undo move", exact: true }),
  ).toBeDisabled();
  await expect(readonlyBoard).toContainText("Stage moves are unavailable in this view.");
  const move = activeBoard.getByRole("combobox", {
    name: "Move Synthetic unassigned role to stage",
    exact: true,
  });
  await expect(move).toBeEnabled();
  await expect(move.locator('option[value="unassigned"]')).toHaveJSProperty("disabled", true);
  await move.focus();
  await expect(move).toBeFocused();
  await move.selectOption("local-stage");
  await expect
    .poll(() => page.evaluate(() => globalThis.coredrillPipelinePresentation.getMoves()))
    .toEqual([
      {
        fromStageId: "unassigned",
        toStageId: "local-stage",
        jobId: "synthetic-unassigned",
        method: "keyboard",
        requiresReopenConfirmation: false,
      },
    ]);
  // Adversarial drop is an explicit fault witness, not a durable user action.
  await activeBoard.locator('[data-board-stage="unassigned"]').evaluate((target) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "local-stage:synthetic-assigned");
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
  });
  await activeBoard.locator('[data-board-stage="local-stage"]').evaluate((target) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "unassigned:unknown-job");
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
  });
  expect(
    await page.evaluate(() => globalThis.coredrillPipelinePresentation.getMoves()),
  ).toHaveLength(1);
  await expect(readonlyTable.getByRole("button", { name: /^Edit /u })).toHaveCount(0);
  await expect(
    readonlyTable.getByRole("checkbox", { name: "Select Synthetic unassigned role", exact: true }),
  ).toBeDisabled();
  await readonlyTable.locator("summary").click();
  await expect(
    readonlyTable.getByRole("spinbutton", { name: "Title width in pixels", exact: true }),
  ).toBeDisabled();
  await expect(readonlyTable).toContainText("Column settings are read-only in this view.");
  await readonlyTable.locator("summary").click();
  const transition = page.getByRole("region", {
    name: "Temporary edit availability example",
    exact: true,
  });
  await transition
    .getByRole("button", { name: "Edit tags for Synthetic unassigned role", exact: true })
    .click();
  const draft = transition.getByRole("textbox", {
    name: "Tags for Synthetic unassigned role",
    exact: true,
  });
  await draft.fill("Keep this draft");
  await transition.getByRole("button", { name: "Disable editing", exact: true }).click();
  await expect(draft).toHaveValue("Keep this draft");
  await expect(draft).toBeDisabled();
  await expect(transition.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await transition.getByRole("button", { name: "Enable editing", exact: true }).click();
  await expect(draft).toHaveValue("Keep this draft");
  await transition.getByRole("button", { name: "Save", exact: true }).click();
  await expect(transition.getByRole("alert")).toContainText("not persisted");
  await expect(draft).toHaveValue("Keep this draft");
  await transition.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  expect(await page.evaluate(() => globalThis.coredrillStorageSpike)).toBeUndefined();
  expect(external).toEqual([]);
  await testInfo.attach("pipeline-presentation-axe.json", {
    body: JSON.stringify(axe),
    contentType: "application/json",
  });
  await page.screenshot({
    path: testInfo.outputPath("pipeline-presentation-320.png"),
    fullPage: true,
  });
  await readonlyBoard.screenshot({ path: testInfo.outputPath("pipeline-readonly-board-320.png") });
  await readonlyTable.screenshot({ path: testInfo.outputPath("pipeline-readonly-table-320.png") });
  console.info(
    `PIPELINE_PRESENTATION_PROOF ${JSON.stringify({ unassignedHasNoCategory: true, moveToUnassignedRejected: true, unknownJobRejected: true, requestedMoves: 1, persistedMoves: 0, storageRuntimeLoaded: false, axeViolations: 0, externalRequests: 0 })}`,
  );
});
