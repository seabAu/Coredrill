import { readFile, writeFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const hostileHtml = await readFile(
  new URL("../fixtures/capture/hostile-source.html", import.meta.url),
);
const hostileJson = await readFile(
  new URL("../fixtures/capture/hostile-source.json", import.meta.url),
);

const openCleanShell = async (page) => {
  await page.goto("/app-shell.html");
  await page.waitForFunction(
    () =>
      globalThis.coredrillAppShell !== undefined &&
      globalThis.coredrillExtensionInbox !== undefined &&
      globalThis.coredrillStorageSpike !== undefined,
  );
  await page.evaluate(async () => {
    await globalThis.coredrillStorageSpike.delete();
    await globalThis.coredrillStorageSpike.openAndMigrate();
  });
};

const openFileCapture = async (page) => {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Paste listing/u }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Saved file" }).click();
  return dialog;
};

const storeCapture = async (dialog) => {
  await dialog.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(dialog.getByRole("status")).toContainText("Stored in the local capture inbox", {
    timeout: 30_000,
  });
  await dialog.getByRole("button", { name: "Close capture dialog" }).click();
};

test("renders hostile saved sources as inert text and navigates exact excerpt paths", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await openCleanShell(page);

  let dialog = await openFileCapture(page);
  await dialog.getByLabel(/Job title/u).fill("Security Engineer");
  await dialog.getByLabel(/Company/u).fill("SecureCo");
  await dialog.getByLabel(/Saved HTML/u).setInputFiles({
    name: "hostile-source.html",
    mimeType: "text/html",
    buffer: hostileHtml,
  });
  await storeCapture(dialog);

  dialog = await openFileCapture(page);
  await dialog
    .getByLabel(/Job title/u)
    .fill('<img src="https://tracker.invalid/title" onerror="globalThis.__titleRan=true">');
  await dialog.getByLabel(/Saved HTML/u).setInputFiles({
    name: "hostile-source.json",
    mimeType: "application/json",
    buffer: hostileJson,
  });
  await storeCapture(dialog);

  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Pipeline" })
    .click();
  const pipeline = page.getByTestId("pipeline-shell");
  await pipeline.getByRole("button", { name: /Inbox/u }).click();
  const review = page.getByTestId("capture-review");
  await expect(review.getByRole("button", { name: /Security Engineer Saved html/u })).toBeVisible();

  await review.getByRole("button", { name: /Security Engineer Saved html/u }).click();
  const source = review.getByRole("region", { name: "Active source location" });
  await expect(source.locator("pre")).toContainText(
    "Security Engineer SecureCo builds defensive local-first systems.",
  );
  await expect(source.locator("script, img, iframe, svg, object, embed")).toHaveCount(0);

  await review
    .getByRole("button", { name: /Title Security Engineer View source \| \/fields\/title/u })
    .click();
  await expect(source).toBeFocused();
  await expect(source).toHaveAttribute("data-source-pointer", "/fields/title");
  await expect(source.locator("pre mark")).toContainText("Security Engineer");

  await review.getByRole("button", { name: "Next source evidence" }).click();
  await expect(source).toBeFocused();
  await expect(source).toHaveAttribute("data-source-pointer", "/fields/company");
  await expect(source.locator("pre mark")).toContainText("SecureCo");

  await review.getByRole("button", { name: /tracker\.invalid\/title.*Saved json/u }).click();
  await review
    .getByRole("button", {
      name: /Jump to Structured JSON \/content\/apiPayload/u,
    })
    .click();
  await expect(source).toBeFocused();
  await expect(source).toHaveAttribute("data-source-pointer", "/content/apiPayload");
  await expect(source.locator("pre")).toContainText("globalThis.__capturePreviewJsonRan=true");
  await expect(source.locator("script, img, iframe, svg, object, embed")).toHaveCount(0);
  expect(externalRequests).toEqual([]);
  expect(
    await page.evaluate(() =>
      [
        globalThis.__capturePreviewBodyRan,
        globalThis.__capturePreviewImageRan,
        globalThis.__capturePreviewJsonRan,
        globalThis.__capturePreviewScriptRan,
        globalThis.__capturePreviewSvgRan,
        globalThis.__titleRan,
        globalThis.__capturePreviewUrlRan,
      ].every((value) => value === undefined),
    ),
  ).toBe(true);

  const axe = await new AxeBuilder({ page }).include('[data-testid="capture-review"]').analyze();
  expect(axe.violations).toEqual([]);
  const axePath = testInfo.outputPath("capture-source-preview-axe.json");
  await writeFile(axePath, `${JSON.stringify(axe, null, 2)}\n`, "utf8");
  await testInfo.attach("capture-source-preview-axe.json", {
    path: axePath,
    contentType: "application/json",
  });

  await review.evaluate((element) => {
    element.style.fontFamily = '"Courier New", monospace';
  });
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
  ).toEqual({ clientWidth: 360, scrollWidth: 360 });

  console.info(
    `CAP004_PROOF ${JSON.stringify({
      durableReceipts: 2,
      hostileHtmlInert: true,
      markupShapedJsonEscaped: true,
      sectionPathFocused: true,
      fieldExcerptFocused: true,
      crossFontReflow: true,
      narrowReflow: true,
      axeViolations: axe.violations.length,
      externalRequests: externalRequests.length,
    })}`,
  );
});
