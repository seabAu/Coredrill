import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";

const serviceWorkerPath = path.resolve("apps/web/dist/service-worker.js");
const sentinelName = "q1-002-service-worker-update-sentinel";

const waitForOfflineShell = async (page) => {
  await page.waitForFunction(
    () => globalThis.coredrillOfflineShell?.getState().registered === true,
  );
  await page.evaluate(() => globalThis.navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => globalThis.navigator.serviceWorker.controller !== null))) {
    await page.reload();
    await page.waitForFunction(
      () =>
        globalThis.coredrillOfflineShell?.getState().registered === true &&
        globalThis.navigator.serviceWorker.controller !== null,
    );
  }
};

for (const width of [1440, 320]) {
  test(`keeps a visible offline notice in workspace flow at ${width}px`, async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto("/");
      await initializeDefaultWorkspace(page);
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction(
        () => globalThis.coredrillOfflineShell?.getState().offlineReady === true,
      );
      const notice = page.getByTestId("offline-shell-notice");
      await expect(notice).toContainText("Coredrill is ready for offline work.");
      await expect(notice).toHaveAttribute("role", "status");
      // This fails against the old fixed toast, even if timing happens not to obscure a button.
      await expect(notice).toHaveCSS("position", "static");
      const bounds = await notice.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`offline-notice-${width}.png`),
        fullPage: true,
      });
      // The notice stays present during the actual application action; do not dismiss it to unblock work.
      await page.getByRole("button", { name: "Add a job", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: "Close capture dialog", exact: true }).click();
      await expect(notice).toBeVisible();
      const dismiss = notice.getByRole("button", { name: "Dismiss", exact: true });
      await dismiss.focus();
      await expect(dismiss).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(notice).toHaveCount(0);
      expect(
        await page.evaluate(() => globalThis.coredrillOfflineShell?.getState().offlineReady),
      ).toBe(false);
    } finally {
      await context.close();
    }
  });
}

test("keeps the production shell offline and applies a waiting update without touching OPFS", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4181/")) {
      externalRequests.push(request.url());
    }
  });

  const originalServiceWorker = await readFile(serviceWorkerPath, "utf8");
  try {
    await page.goto("/");
    await initializeDefaultWorkspace(page);
    await expect(page.getByTestId("page-title")).toHaveText("Keep the next move clear");
    await waitForOfflineShell(page);

    await page.goto("/pipeline?view=board");
    await expect(page.getByTestId("page-title")).toHaveText("Pipeline");
    expect(
      await page.evaluate(() => globalThis.navigator.serviceWorker.controller?.scriptURL ?? null),
    ).toContain("/service-worker.js");
    await page.evaluate(async (name) => {
      const root = await globalThis.navigator.storage.getDirectory();
      const handle = await root.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write("preserve-across-service-worker-update");
      await writable.close();
    }, sentinelName);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId("page-title")).toHaveText("Pipeline");
    await expect(page.getByText("Local only", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => globalThis.navigator.onLine)).toBe(false);

    await context.setOffline(false);
    await writeFile(
      serviceWorkerPath,
      `${originalServiceWorker}\n/* q1-002 deployed-update-fixture */\n`,
      "utf8",
    );
    await expect(
      page.evaluate(() => globalThis.coredrillOfflineShell?.checkForUpdate()),
    ).resolves.toBe(true);
    await expect
      .poll(() => page.evaluate(() => globalThis.coredrillOfflineShell?.getState().updateAvailable))
      .toBe(true);
    await expect(page.getByTestId("offline-shell-notice")).toContainText(
      "A Coredrill update is ready",
    );
    // The old document already satisfies the readiness predicate below. Observe
    // the requested reload before inspecting the replacement document or OPFS.
    await page.evaluate(() => {
      globalThis.coredrillUpdateDocumentWitness = "before-update";
    });
    await Promise.all([
      page.waitForEvent("load"),
      page.getByRole("button", { name: "Reload update" }).click(),
    ]);
    expect(await page.evaluate(() => globalThis.coredrillUpdateDocumentWitness)).toBeUndefined();
    await page.waitForFunction(
      () =>
        globalThis.coredrillAppShell !== undefined &&
        globalThis.coredrillOfflineShell?.getState().registered === true &&
        globalThis.navigator.serviceWorker.controller !== null,
    );
    await expect(page.getByTestId("page-title")).toHaveText("Pipeline");

    const sentinel = await page.evaluate(async (name) => {
      const root = await globalThis.navigator.storage.getDirectory();
      const handle = await root.getFileHandle(name);
      const contents = await (await handle.getFile()).text();
      await root.removeEntry(name);
      return contents;
    }, sentinelName);
    expect(sentinel).toBe("preserve-across-service-worker-update");
    expect(externalRequests).toEqual([]);

    console.info(
      `Q1_RESILIENCE_PROOF ${JSON.stringify({
        explicitUpdateConsent: true,
        offlineDeepRouteReload: true,
        opfsPreservedAcrossUpdate: true,
        unexpectedExternalRequests: externalRequests.length,
      })}`,
    );
  } finally {
    await context.setOffline(false);
    await writeFile(serviceWorkerPath, originalServiceWorker, "utf8");
    await context.close();
  }
});
