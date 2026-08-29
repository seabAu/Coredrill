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
