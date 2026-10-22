import { expect } from "@playwright/test";

/** Uses ordinary Settings controls; native save/restore remain separately unproven. */
export const exerciseNormalVaultPreparation = async (page, runtime) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const back = page.getByRole("button", { name: "Back to Pipeline", exact: true });
  if (await back.isVisible()) await back.click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const panel = page.getByRole("region", { name: "Portable vault export", exact: true });
  const prepare = panel.getByRole("button", { name: "Prepare portable archive", exact: true });
  await expect(prepare).toBeDisabled();
  await panel.getByRole("checkbox").focus();
  await panel.getByRole("checkbox").press("Space");
  await prepare.focus();
  await prepare.press("Enter");
  await expect(
    panel.getByRole("heading", { name: "Prepared archive snapshot", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByRole("status")).toContainText("not saved");
  await expect(panel).toContainText("116");
  if (runtime === "native") {
    await expect(
      panel.getByRole("button", { name: "Download prepared archive", exact: true }),
    ).toHaveCount(0);
    await expect(panel.locator('input[type="file"]')).toHaveCount(0);
    await expect(panel).toContainText("does not use a browser-download fallback");
  }
  return panel;
};
