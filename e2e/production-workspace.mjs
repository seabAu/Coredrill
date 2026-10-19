import { expect } from "@playwright/test";

/** A real user action, not a seeded identity or a storage API shortcut. */
export const initializeDefaultWorkspace = async (page) => {
  await expect(
    page.getByRole("heading", {
      name: "Start with one job, or set up the whole workspace",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip setup and go to Home", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Go to Home", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();
};
