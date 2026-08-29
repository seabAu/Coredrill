import { writeFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const openCatalog = async (page) => {
  await page.goto("/ui-foundations.html");
  await expect(
    page.getByRole("heading", { level: 1, name: "UI foundation catalog" }),
  ).toBeVisible();
  await page.waitForFunction(() => globalThis.coredrillUiFoundations !== undefined);
};

const attachCatalogProof = async (page, testInfo, name) => {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ fullPage: true, path: screenshotPath });
  await testInfo.attach(`${name}.png`, {
    path: screenshotPath,
    contentType: "image/png",
  });
};

for (const appearance of [
  { theme: "light", density: "comfortable" },
  { theme: "dark", density: "compact" },
]) {
  test(`${appearance.theme} ${appearance.density} catalog has no automated accessibility violations`, async ({
    page,
  }, testInfo) => {
    await openCatalog(page);
    await page.getByLabel("Theme").selectOption(appearance.theme);
    await page.getByLabel("Density").selectOption(appearance.density);
    await expect(page.locator("html")).toHaveAttribute("data-theme", appearance.theme);
    await expect(page.locator("html")).toHaveAttribute("data-density", appearance.density);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    const axePath = testInfo.outputPath(`${appearance.theme}-${appearance.density}-axe.json`);
    await writeFile(axePath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
    await testInfo.attach(`${appearance.theme}-${appearance.density}-axe.json`, {
      path: axePath,
      contentType: "application/json",
    });
    await attachCatalogProof(page, testInfo, `${appearance.theme}-${appearance.density}`);
  });
}

test("keyboard focus is visible without creating icon-only focus stops", async ({ page }) => {
  await openCatalog(page);
  await page.keyboard.press("Tab");
  const theme = page.getByLabel("Theme");
  await expect(theme).toBeFocused();
  const focusStyle = await theme.evaluate((element) => {
    const style = getComputedStyle(element);
    return { boxShadow: style.boxShadow, outlineStyle: style.outlineStyle };
  });
  expect(focusStyle.boxShadow).not.toBe("none");
  expect(focusStyle.outlineStyle).toBe("solid");
  await expect(page.locator("svg[tabindex]"), "icons must never become keyboard stops").toHaveCount(
    0,
  );
});

test("reduced motion removes repeating animation", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openCatalog(page);
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  const motion = await page.locator(".cd-motion-demo").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationDuration: style.animationDuration,
      animationIterationCount: style.animationIterationCount,
      token: getComputedStyle(document.documentElement)
        .getPropertyValue("--motion-standard")
        .trim(),
    };
  });
  expect(motion).toEqual({
    animationDuration: "1e-05s",
    animationIterationCount: "1",
    token: "0.01ms",
  });
  await attachCatalogProof(page, testInfo, "reduced-motion");
});

test("forced colors and a 360 pixel viewport retain a usable layout", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ forcedColors: "active" });
  await openCatalog(page);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(page.getByLabel("Theme")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save evidence" })).toBeVisible();
  await attachCatalogProof(page, testInfo, "forced-colors-mobile");
});
