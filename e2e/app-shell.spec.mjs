import { writeFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const openShell = async (page, options = {}) => {
  const parameters = new URLSearchParams(options).toString();
  await page.goto(`/app-shell.html${parameters.length > 0 ? `?${parameters}` : ""}`);
  await expect(page.getByTestId("page-title")).toHaveText("Keep the next move clear");
  await page.waitForFunction(() => globalThis.coredrillAppShell !== undefined);
};

const attachProof = async (page, testInfo, name) => {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ fullPage: true, path: screenshotPath });
  await testInfo.attach(`${name}.png`, { path: screenshotPath, contentType: "image/png" });
};

const attachAxe = async (page, testInfo, name) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  const axePath = testInfo.outputPath(`${name}-axe.json`);
  await writeFile(axePath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  await testInfo.attach(`${name}-axe.json`, { path: axePath, contentType: "application/json" });
};

const attachAriaSnapshot = async (locator, testInfo, name) => {
  const snapshot = await locator.ariaSnapshot();
  const snapshotPath = testInfo.outputPath(`${name}-aria.yml`);
  await writeFile(snapshotPath, `${snapshot}\n`, "utf8");
  await testInfo.attach(`${name}-aria.yml`, {
    path: snapshotPath,
    contentType: "text/yaml",
  });
};

test("desktop shell exposes reviewed navigation, routes, local state, and no axe violations", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openShell(page);

  const sidebar = page.getByLabel("Coredrill workspace");
  await expect(sidebar).toBeVisible();
  expect((await sidebar.boundingBox())?.width).toBe(240);
  const primary = page.getByRole("navigation", { name: "Primary" });
  for (const label of ["Home", "Pipeline", "Documents", "Career Profile", "Network", "Insights"]) {
    await expect(primary.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(primary.getByRole("link", { name: "Pipeline" })).toHaveAttribute(
    "href",
    "/pipeline?view=board",
  );
  await expect(page.getByText("Local only", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Browser vault: Job search 2026. Vault healthy/ }),
  ).toBeVisible();

  await primary.getByRole("link", { name: "Pipeline" }).click();
  await expect(page.getByTestId("page-title")).toHaveText("Pipeline");
  await expect(primary.getByRole("link", { name: "Pipeline" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await attachAxe(page, testInfo, "desktop-light-comfortable");
  await attachProof(page, testInfo, "desktop-light-comfortable");
});

test("dark compact shell and backup-due state remain accessible", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openShell(page, { density: "compact", health: "backup-due", theme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.getByRole("button", { name: /Backup due/ })).toBeVisible();
  await attachAxe(page, testInfo, "desktop-dark-compact-backup-due");
  await attachProof(page, testInfo, "desktop-dark-compact-backup-due");
});

test("Home orders actionable local work, limits Now, and lets users hide the snapshot", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openShell(page);

  const sections = await page
    .locator("[data-home-section]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-home-section")),
    );
  expect(sections).toEqual(["now", "attention", "week", "snapshot", "continue"]);
  await expect(page.getByTestId("home-now-item")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Add job", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Paste listing", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Capture URL", exact: true })).toBeVisible();
  await expect(page.getByText("5 items", { exact: true })).toBeVisible();
  await expect(page.getByText(/private planning aid, not a streak/)).toBeVisible();
  await attachAxe(page, testInfo, "home-attention-queue");
  await attachProof(page, testInfo, "home-attention-queue");

  await page.getByRole("button", { name: "Hide snapshot" }).click();
  await expect(page.locator('[data-home-section="snapshot"]')).toBeHidden();
  const stateAfterHide = await page.evaluate(() => globalThis.coredrillAppShell?.getState());
  expect(stateAfterHide?.homeSnapshotVisible).toBe(false);
  await expect(page.getByRole("status")).toContainText("snapshot hidden");

  await page.getByRole("link", { name: /Northstar Health · Product Operations Lead/ }).click();
  await expect(page.getByRole("status")).toContainText("Opened recent local job");
  expect(externalRequests).toEqual([]);
});

test("empty Home offers three non-account paths without inventing goals", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1000, height: 760 });
  await openShell(page, { home: "empty" });

  await expect(
    page.getByRole("heading", { name: "Add the first opportunity when you are ready" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a job" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import existing tracker" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Explore sample data" })).toBeVisible();
  await expect(
    page.getByText(/No account, AI connection, or application target is required/),
  ).toBeVisible();
  await expect(page.locator("[data-home-section]")).toHaveCount(0);
  expect((await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.homeMode).toBe(
    "empty",
  );
  await attachAxe(page, testInfo, "home-empty");
  await attachProof(page, testInfo, "home-empty");

  await page.getByRole("button", { name: "Add a job" }).click();
  await expect(page.getByRole("status")).toContainText("Home action selected: add-job");
});

test("Pipeline switches peer presentations while saved views, filters, search, and scope stay local", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await openShell(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const pipeline = page.getByTestId("pipeline-shell");
  await expect(pipeline).toBeVisible();
  await expect(pipeline.getByRole("button", { name: "Inbox 3" })).toBeVisible();
  await expect(pipeline.getByRole("button", { name: "Board" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(pipeline.getByText(/8 matching of 12/)).toBeVisible();

  await pipeline.getByRole("button", { name: "Table" }).click();
  await expect(pipeline.locator('[data-pipeline-view="table"]')).toBeVisible();
  await expect(pipeline.getByText(/8 matching of 12/)).toBeVisible();
  expect((await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.pipelineView).toBe(
    "table",
  );

  await pipeline.getByRole("combobox", { name: "Saved view" }).selectOption("interview-prep");
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.pipelineSavedViewId,
  ).toBe("interview-prep");

  await pipeline.getByRole("searchbox", { name: "Search jobs" }).fill("Northstar");
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.pipelineSearchQuery,
  ).toBe("Northstar");

  await pipeline.getByRole("button", { name: /Remove filter Status/ }).click();
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.pipelineFilterCount,
  ).toBe(1);
  await pipeline.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("open-filters");
  await pipeline.getByRole("button", { name: "Sort · Recently updated" }).click();
  await expect(page.getByRole("status").first()).toContainText("open-sort");
  await pipeline.getByRole("button", { name: "More Pipeline actions" }).click();
  await expect(page.getByRole("status").first()).toContainText("open-more");

  await attachAxe(page, testInfo, "pipeline-peer-views-and-filters");
  await attachProof(page, testInfo, "pipeline-peer-views-and-filters");
  expect(externalRequests).toEqual([]);
});

test("Pipeline selection exposes a non-mutating bulk shell and reflows at 320 pixels", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openShell(page, { pipeline: "selected" });
  await page
    .getByRole("navigation", { name: "Mobile" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const pipeline = page.getByTestId("pipeline-shell");
  const bulk = pipeline.getByRole("region", { name: "Bulk actions" });
  await expect(bulk).toContainText("2 jobs selected");
  for (const name of ["Change status", "Add tags", "Archive", "Clear selection"]) {
    await expect(bulk.getByRole("button", { name })).toBeVisible();
  }
  await attachAxe(page, testInfo, "pipeline-mobile-selected-forced-colors-320");
  await attachProof(page, testInfo, "pipeline-mobile-selected-forced-colors-320");
  await bulk.getByRole("button", { name: "Change status" }).click();
  await expect(page.getByText(/Bulk action prepared.*No records changed/)).toBeVisible();
  await bulk.getByRole("button", { name: "Clear selection" }).click();
  await expect(bulk).toBeHidden();
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.pipelineSelectedCount,
  ).toBe(0);

  await pipeline.getByRole("button", { name: "Table" }).click();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await attachAxe(page, testInfo, "pipeline-mobile-after-clear");
});

test("Table keeps semantic pinned columns and remembers each saved view's configuration", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await openShell(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();
  await page.getByTestId("pipeline-shell").getByRole("button", { name: "Table" }).click();

  const tableView = page.getByTestId("pipeline-table");
  const table = tableView.getByRole("table");
  const scrollRegion = tableView.getByRole("region", { name: "Pipeline Table for Active search" });
  await expect(table).toBeVisible();
  await expect(scrollRegion).toHaveAttribute("data-table-total", "8");
  await expect(scrollRegion).toHaveAttribute("data-table-rendered", "8");
  await expect(table.getByRole("columnheader", { name: "Title" })).toHaveCSS("position", "sticky");
  await expect(table.getByRole("columnheader", { name: "Company" })).toHaveCSS(
    "position",
    "sticky",
  );

  await tableView.getByText("Columns", { exact: true }).click();
  const statusSetting = tableView.locator('[data-column-setting="status"]');
  await statusSetting.getByRole("checkbox", { name: "Pinned" }).check();
  await expect(table.getByRole("columnheader", { name: "Status" })).toHaveAttribute(
    "data-table-pinned",
    "true",
  );
  await statusSetting.getByRole("spinbutton", { name: "Status width in pixels" }).fill("192");
  await expect(table.getByRole("columnheader", { name: "Status" })).toHaveCSS("width", "192px");

  const tagsSetting = tableView.locator('[data-column-setting="tags"]');
  await tagsSetting.getByRole("button", { name: "Move Tags earlier" }).click();
  const sourceSetting = tableView.locator('[data-column-setting="source"]');
  await sourceSetting.getByRole("checkbox", { name: "Visible" }).uncheck();
  await expect(table.getByRole("columnheader", { name: "Source" })).toHaveCount(0);

  const pipeline = page.getByTestId("pipeline-shell");
  await pipeline.getByRole("combobox", { name: "Saved view" }).selectOption("interview-prep");
  await expect(table.getByRole("columnheader", { name: "Source" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Status" })).toHaveAttribute(
    "data-table-pinned",
    "false",
  );
  await pipeline.getByRole("combobox", { name: "Saved view" }).selectOption("active-search");
  await expect(table.getByRole("columnheader", { name: "Source" })).toHaveCount(0);
  await expect(table.getByRole("columnheader", { name: "Status" })).toHaveAttribute(
    "data-table-pinned",
    "true",
  );
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.tableColumnSaveCount,
  ).toBeGreaterThanOrEqual(4);

  await tableView.getByText("Columns", { exact: true }).click();
  await attachAriaSnapshot(tableView, testInfo, "table-semantic-and-configurable");
  await attachAxe(page, testInfo, "table-semantic-and-configurable");
  await attachProof(page, testInfo, "table-semantic-and-configurable");
  expect(externalRequests).toEqual([]);
});

test("Table validates low-risk edits, confirms reopening, and opens complex fields", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await openShell(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();
  await page.getByTestId("pipeline-shell").getByRole("button", { name: "Table" }).click();

  const tableView = page.getByTestId("pipeline-table");
  const northstar = tableView.locator('[data-table-job="board-northstar"]');
  await northstar.getByRole("button", { name: "Product Operations Lead", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText(
    "Opened contextual local Job workspace",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-job-workspace="board-northstar"]')).toHaveCount(0);
  await expect(tableView).toBeVisible();

  await northstar
    .getByRole("button", { name: "Edit priority for Product Operations Lead" })
    .click();
  await northstar.getByLabel("Priority for Product Operations Lead").selectOption("low");
  await northstar.getByRole("button", { name: "Save" }).click();
  await expect(northstar.getByText("low", { exact: true })).toBeVisible();

  await northstar.getByRole("button", { name: "Edit tags for Product Operations Lead" }).click();
  await northstar.getByLabel("Tags for Product Operations Lead").fill("research, Research");
  await northstar.getByRole("button", { name: "Save" }).click();
  await expect(northstar.getByRole("alert")).toContainText("unique comma-separated tags");
  await northstar.getByRole("button", { name: "Cancel" }).click();

  await northstar
    .getByRole("button", { name: "Edit next action for Product Operations Lead" })
    .click();
  await northstar.getByLabel("Next action for Product Operations Lead").fill("2026-09-10");
  await northstar.getByRole("button", { name: "Save" }).click();
  await expect(northstar.getByText("2026-09-10", { exact: true })).toBeVisible();

  const closed = tableView.locator('[data-table-job="board-harbor"]');
  await closed.getByRole("button", { name: "Edit status for Product Manager" }).click();
  await closed.getByLabel("Status for Product Manager").selectOption("saved");
  await expect(
    closed.getByRole("checkbox", { name: "Confirm reopening this closed job" }),
  ).toBeVisible();
  await closed.getByRole("button", { name: "Save" }).click();
  await expect(closed.getByRole("alert")).toContainText("Confirm reopening");
  await expect(closed.getByLabel("Status for Product Manager")).toHaveValue("saved");
  await closed.getByRole("checkbox", { name: "Confirm reopening this closed job" }).check();
  await closed.getByRole("button", { name: "Save" }).click();
  await expect(closed.getByText("Saved", { exact: true })).toBeVisible();

  const state = await page.evaluate(() => globalThis.coredrillAppShell?.getState());
  expect(state?.tableEditCount).toBe(3);
  expect(state?.boardTimelineEventCount).toBe(1);
});

test("Table rejects a stale row version without changing the previous value", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openShell(page, { table: "conflict" });
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const row = page.getByTestId("pipeline-table").locator('[data-table-job="board-northstar"]');
  await row.getByRole("button", { name: "Edit priority for Product Operations Lead" }).click();
  await row.getByLabel("Priority for Product Operations Lead").selectOption("low");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByRole("alert")).toContainText("changed before the edit could commit");
  await expect(row.getByLabel("Priority for Product Operations Lead")).toHaveValue("low");
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.tableEditCount,
  ).toBe(0);
});

test("Table windows 2,000 rows within budget and owns narrow-screen overflow", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openShell(page, { table: "large" });
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const tableView = page.getByTestId("pipeline-table");
  const scrollRegion = tableView.getByRole("region", { name: "Pipeline Table for Active search" });
  await expect(scrollRegion).toHaveAttribute("data-table-total", "2000");
  await expect(scrollRegion).toHaveAttribute("data-table-rendered", "12");
  await expect(tableView.locator('[data-table-job="table-volume-1992"]')).toHaveCount(0);
  const start = Date.now();
  await scrollRegion.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(tableView.locator('[data-table-job="table-volume-1992"]')).toBeVisible();
  expect(Date.now() - start).toBeLessThan(2_500);
  await expect(scrollRegion).toHaveAttribute("data-table-rendered", "12");
  await attachProof(page, testInfo, "table-2000-row-window");

  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const documentDimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(documentDimensions.scrollWidth).toBeLessThanOrEqual(documentDimensions.clientWidth);
  const tableDimensions = await scrollRegion.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(tableDimensions.scrollWidth).toBeGreaterThan(tableDimensions.clientWidth);
  await attachAxe(page, testInfo, "table-mobile-forced-colors");
  await attachProof(page, testInfo, "table-mobile-forced-colors");
});

test("wide Pipeline opens a contextual Job route and restores exact Board context and focus", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openShell(page, { board: "large", pipeline: "selected" });
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const pipeline = page.getByTestId("pipeline-shell");
  await pipeline.getByRole("searchbox", { name: "Search jobs" }).fill("Northstar");
  const savedScroll = pipeline.getByRole("list", { name: "Saved jobs" });
  const verticalScroll = await savedScroll.evaluate((element) => {
    element.scrollTop = 520;
    element.dispatchEvent(new Event("scroll"));
    return element.scrollTop;
  });
  const boardColumns = pipeline.locator(".cd-board-columns");
  const horizontalScroll = await boardColumns.evaluate((element) => {
    element.scrollLeft = 300;
    return element.scrollLeft;
  });
  const opener = pipeline
    .locator('[data-board-job="board-arc"]')
    .getByRole("button", { name: "Design Systems Lead", exact: true });
  await opener.evaluate((button) => {
    button.click();
  });

  await expect(page).toHaveURL(/\/jobs\/board-arc\/overview$/u);
  const workspace = page.locator('[data-job-workspace="board-arc"]');
  await expect(workspace).toHaveAttribute("data-workspace-mode", "contextual");
  await expect(pipeline).toBeVisible();
  await expect(workspace.getByRole("heading", { name: "Design Systems Lead" })).toBeFocused();
  await expect(workspace.getByText("Arc Studio", { exact: true })).toBeVisible();
  await expect(workspace.getByRole("button", { name: "Change status" })).toBeVisible();
  await expect(workspace.getByRole("button", { name: "Set next action" })).toBeVisible();
  await expect(workspace.getByRole("button", { name: "Prepare application" })).toBeVisible();
  await workspace.getByRole("slider", { name: "Job workspace width" }).fill("720");
  await expect(workspace).toHaveCSS("width", "720px");
  await attachAxe(page, testInfo, "job-workspace-contextual-wide");
  await attachProof(page, testInfo, "job-workspace-contextual-wide");

  await page.keyboard.press("Escape");
  await expect(workspace).toHaveCount(0);
  await expect(page).toHaveURL(/\/pipeline\?savedView=active-search&view=board$/u);
  await expect(pipeline.getByRole("searchbox", { name: "Search jobs" })).toHaveValue("Northstar");
  await expect(pipeline.getByRole("region", { name: "Bulk actions" })).toContainText(
    "2 jobs selected",
  );
  await expect(opener).toBeFocused();
  await expect
    .poll(() => savedScroll.evaluate((element) => element.scrollTop))
    .toBe(verticalScroll);
  await expect
    .poll(() => boardColumns.evaluate((element) => element.scrollLeft))
    .toBe(horizontalScroll);

  await page.goForward();
  await expect(page).toHaveURL(/\/jobs\/board-arc\/overview$/u);
  await expect(workspace).toHaveAttribute("data-workspace-mode", "contextual");
  expect((await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.workspaceMode).toBe(
    "contextual",
  );
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(workspace).toHaveAttribute("data-workspace-mode", "full-page");
  await expect(pipeline).toHaveCount(0);
  const responsiveDimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(responsiveDimensions.scrollWidth).toBeLessThanOrEqual(responsiveDimensions.clientWidth);
});

test("refresh converts a contextual Job entry to the full route and Back restores Pipeline", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openShell(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();
  await page
    .locator('[data-board-job="board-northstar"]')
    .getByRole("button", { name: "Product Operations Lead", exact: true })
    .click();
  await expect(page.locator('[data-job-workspace="board-northstar"]')).toHaveAttribute(
    "data-workspace-mode",
    "contextual",
  );

  await page.reload();
  await page.waitForFunction(() => globalThis.coredrillAppShell !== undefined);
  const workspace = page.locator('[data-job-workspace="board-northstar"]');
  await expect(workspace).toHaveAttribute("data-workspace-mode", "full-page");
  await expect(page.getByTestId("pipeline-shell")).toHaveCount(0);
  await expect(workspace.getByRole("button", { name: "Back to Pipeline" })).toBeVisible();
  await attachAxe(page, testInfo, "job-workspace-refresh-full-page");
  await attachProof(page, testInfo, "job-workspace-refresh-full-page");

  await workspace.getByRole("button", { name: "Back to Pipeline" }).click();
  await expect(page.getByTestId("pipeline-shell")).toBeVisible();
  await expect(page).toHaveURL(/\/pipeline\?savedView=active-search&view=board$/u);
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.workspaceMode,
  ).toBeNull();
});

test("a deep-linked Job tab opens full-page and keeps tab history without a server account", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/jobs/board-northstar/timeline");
  await page.waitForFunction(() => globalThis.coredrillAppShell !== undefined);

  const workspace = page.locator('[data-job-workspace="board-northstar"]');
  await expect(workspace).toHaveAttribute("data-workspace-mode", "full-page");
  await expect(workspace.getByRole("button", { name: "Timeline" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await workspace.getByRole("button", { name: "Source" }).click();
  await expect(page).toHaveURL(/\/jobs\/board-northstar\/source$/u);
  await expect(workspace.getByRole("button", { name: "Source" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.goBack();
  await expect(page).toHaveURL(/\/jobs\/board-northstar\/timeline$/u);
  await expect(workspace.getByRole("button", { name: "Timeline" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await workspace.getByRole("button", { name: "Back to Pipeline" }).click();
  await expect(page).toHaveURL(/\/pipeline\?savedView=active-search&view=board$/u);
  await expect(page.getByTestId("pipeline-shell")).toBeVisible();
});

test("narrow Table opens full-page and restores local selection, scroll, and opener focus", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await openShell(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();
  const pipeline = page.getByTestId("pipeline-shell");
  await pipeline.getByRole("button", { name: "Table" }).click();
  await pipeline.getByRole("searchbox", { name: "Search jobs" }).fill("Product");
  const row = pipeline.locator('[data-table-job="board-northstar"]');
  await row.getByRole("checkbox", { name: "Select Product Operations Lead" }).check();
  const tableScroll = pipeline.getByRole("region", { name: "Pipeline Table for Active search" });
  const horizontalScroll = await tableScroll.evaluate((element) => {
    element.scrollLeft = 700;
    return element.scrollLeft;
  });
  const opener = row.getByRole("button", { name: "Product Operations Lead", exact: true });
  await opener.evaluate((button) => {
    button.click();
  });

  const workspace = page.locator('[data-job-workspace="board-northstar"]');
  await expect(workspace).toHaveAttribute("data-workspace-mode", "full-page");
  await expect(pipeline).toHaveCount(0);
  await expect(page).toHaveURL(/\/jobs\/board-northstar\/overview$/u);
  await workspace.getByRole("button", { name: "Back to Pipeline" }).click();

  await expect(pipeline).toBeVisible();
  await expect(pipeline.getByRole("button", { name: "Table" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(pipeline.getByRole("searchbox", { name: "Search jobs" })).toHaveValue("Product");
  await expect(pipeline.getByRole("region", { name: "Bulk actions" })).toContainText(
    "1 job selected",
  );
  await expect(opener).toBeFocused();
  await expect
    .poll(() => tableScroll.evaluate((element) => element.scrollLeft))
    .toBe(horizontalScroll);
  await attachAxe(page, testInfo, "job-workspace-narrow-return");
  await attachProof(page, testInfo, "job-workspace-narrow-return");
});

test("Board cards expose semantic context, keyboard moves, durable-event intent, and undo", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await openShell(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const board = page.getByTestId("pipeline-board");
  await expect(board).toBeVisible();
  for (const stage of ["Saved", "Preparing", "Applied", "Interviewing", "Offer", "Closed"]) {
    await expect(board.getByRole("heading", { name: stage, exact: true })).toBeVisible();
  }
  await expect(board.getByText("response · interview")).toBeVisible();
  await expect(board.getByText("rejected · withdrawn · archived")).toBeVisible();

  const northstar = board.locator('[data-board-job="board-northstar"]');
  await expect(northstar.getByRole("button", { name: "Product Operations Lead" })).toBeVisible();
  await expect(northstar.getByText("Northstar Health", { exact: true })).toBeVisible();
  await expect(northstar.getByText(/remote · United States/)).toBeVisible();
  await expect(northstar.getByText(/Review source fields · Saved today/)).toBeVisible();
  await expect(northstar.getByText("Unreviewed source", { exact: true })).toBeVisible();
  await expect(northstar.getByRole("list", { name: "Job warnings" })).toHaveCSS(
    "overflow-x",
    "hidden",
  );

  await northstar
    .getByRole("combobox", { name: "Move Product Operations Lead to stage" })
    .selectOption("preparing");
  await expect(board.locator('[data-board-stage="preparing"]')).toContainText(
    "Product Operations Lead",
  );
  await expect(board.getByRole("status")).toContainText(
    "Timeline event recorded; undo is available",
  );
  let state = await page.evaluate(() => globalThis.coredrillAppShell?.getState());
  expect(state?.boardTimelineEventCount).toBe(1);
  expect(state?.boardUndoAvailable).toBe(true);

  await board.getByRole("button", { name: "Undo move" }).click();
  await expect(board.locator('[data-board-stage="saved"]')).toContainText(
    "Product Operations Lead",
  );
  await expect(board.getByRole("status")).toContainText("original timeline event remains");
  state = await page.evaluate(() => globalThis.coredrillAppShell?.getState());
  expect(state?.boardTimelineEventCount).toBe(2);
  expect(state?.boardUndoAvailable).toBe(false);

  await attachAriaSnapshot(board, testInfo, "board-keyboard-and-screen-reader-facing");
  await attachAxe(page, testInfo, "board-keyboard-move-and-undo");
  await attachProof(page, testInfo, "board-keyboard-move-and-undo");
  expect(externalRequests).toEqual([]);
});

test("Board supports pointer drag while terminal-stage reopen requests fail closed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await openShell(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const board = page.getByTestId("pipeline-board");
  await board
    .locator('[data-board-job="board-canvas"] [data-board-drag-handle]')
    .dragTo(board.locator('[data-board-stage="applied"]'));
  await expect(board.locator('[data-board-stage="applied"]')).toContainText("Platform Engineer");
  await expect(board.getByRole("status")).toContainText("by drag");
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.boardTimelineEventCount,
  ).toBe(1);

  const closedJob = board.locator('[data-board-job="board-harbor"]');
  await closedJob
    .getByRole("combobox", { name: "Move Product Manager to stage" })
    .selectOption("saved");
  await expect(board.getByRole("status")).toContainText("requires explicit confirmation");
  await expect(board.locator('[data-board-stage="closed"]')).toContainText("Product Manager");
  expect(
    (await page.evaluate(() => globalThis.coredrillAppShell?.getState()))?.boardTimelineEventCount,
  ).toBe(1);
});

test("Board virtualizes a large synthetic column and keeps mobile overflow local", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openShell(page, { board: "large" });
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();

  const board = page.getByTestId("pipeline-board");
  const savedColumn = board.locator('[data-board-stage="saved"]');
  const scrollRegion = savedColumn.getByRole("list", { name: "Saved jobs" });
  await expect(scrollRegion).toHaveAttribute("data-board-total", "72");
  await expect(scrollRegion).toHaveAttribute("data-board-rendered", "8");
  await expect(savedColumn.locator('[data-board-job="board-volume-70"]')).toHaveCount(0);
  await scrollRegion.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(savedColumn.locator('[data-board-job="board-volume-70"]')).toBeVisible();
  await attachProof(page, testInfo, "board-large-column-windowed");

  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  const boardDimensions = await board.locator(".cd-board-columns").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(boardDimensions.scrollWidth).toBeGreaterThan(boardDimensions.clientWidth);
  await attachAxe(page, testInfo, "board-mobile-forced-colors");
  await attachProof(page, testInfo, "board-mobile-forced-colors");
});

test("search, command, and Add surfaces restore focus and stay local", async ({ page }) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await openShell(page);

  const searchTrigger = page.getByRole("button", { name: /Search local vault/ });
  await searchTrigger.click();
  const searchInput = page.getByRole("searchbox", { name: "Search local vault" });
  await expect(searchInput).toBeFocused();
  await searchInput.fill("Northstar");
  await expect(page.getByRole("button", { name: /Northstar Health/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(searchTrigger).toBeFocused();

  const commandTrigger = page.getByRole("button", { name: "Open command menu" });
  await page.keyboard.press("Control+k");
  const commandInput = page.getByRole("searchbox", { name: "Filter commands" });
  await expect(commandInput).toBeFocused();
  await commandInput.fill("back up");
  await page.getByRole("button", { name: /Export or back up vault/ }).click();
  await expect(page.getByRole("status")).toContainText("export-backup");
  await expect(commandTrigger).toBeFocused();

  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("c");
  await expect(page.getByRole("menuitem", { name: /Add job/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const pasteListing = page.getByRole("menuitem", { name: /Paste listing/ });
  await expect(pasteListing).toBeFocused();
  await pasteListing.click();
  await expect(page.getByRole("status")).toContainText("paste-listing");
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeFocused();

  expect(externalRequests).toEqual([]);
});

test("compact rail keeps every destination and vault state named", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await openShell(page, { health: "offline" });
  const sidebar = page.getByLabel("Coredrill workspace");
  expect((await sidebar.boundingBox())?.width).toBe(64);
  const primary = page.getByRole("navigation", { name: "Primary" });
  await expect(primary.getByRole("link", { name: "Career Profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Offline · local work available/ })).toBeVisible();
  await attachProof(page, testInfo, "compact-rail-offline");
});

test("mobile bottom navigation, More, forced colors, and 320 pixel reflow remain usable", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openShell(page, { health: "storage-risk" });

  await expect(page.getByLabel("Coredrill workspace")).toBeHidden();
  const mobile = page.getByRole("navigation", { name: "Mobile" });
  await expect(mobile).toBeVisible();
  for (const name of ["Home", "Pipeline", "Add", "Documents", "More"]) {
    await expect(
      mobile.getByRole(name === "Add" || name === "More" ? "button" : "link", { name }),
    ).toBeVisible();
  }
  await mobile.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("menuitem", { name: /Career Profile/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Storage risk/ })).toBeVisible();
  await page.keyboard.press("Escape");

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await attachAxe(page, testInfo, "mobile-forced-colors-320");
  await attachProof(page, testInfo, "mobile-forced-colors-320");
});
