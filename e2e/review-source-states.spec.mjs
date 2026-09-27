import { writeFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const openCleanShell = async (page) => {
  await page.goto("/");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);
  await page.evaluate(async () => {
    await globalThis.coredrillStorageSpike.delete();
  });
  await page.goto("/app-shell.html");
  await page.waitForFunction(
    () =>
      globalThis.coredrillAppShell !== undefined &&
      globalThis.coredrillExtensionInbox !== undefined,
  );
};

const openCapture = async (page, actionName) => {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: actionName }).click();
  return page.getByRole("dialog");
};

const storeAndClose = async (dialog) => {
  await dialog.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(dialog.getByRole("status")).toContainText("Stored in the local capture inbox", {
    timeout: 30_000,
  });
  await dialog.getByRole("button", { name: "Close capture dialog" }).click();
};

const addUrlOnlyCapture = async (page, url) => {
  const dialog = await openCapture(page, /Paste listing/u);
  await dialog.getByLabel(/Pasted listing text or URL/u).fill(url);
  await storeAndClose(dialog);
};

const addManualCapture = async (page, { title, company, sourceUrl, notes }) => {
  const dialog = await openCapture(page, /Add job/u);
  await dialog.getByLabel(/Job title/u).fill(title);
  await dialog.getByLabel(/Company/u).fill(company);
  await dialog.getByLabel(/Source URL/u).fill(sourceUrl);
  await dialog.getByLabel(/Notes or listing details/u).fill(notes);
  await storeAndClose(dialog);
};

test("blocked and unsupported sources preserve local evidence and offer manual fallbacks", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await openCleanShell(page);

  await addUrlOnlyCapture(page, "https://jobs.example.test/unsupported/1");
  await addUrlOnlyCapture(page, "https://www.linkedin.com/jobs/view/42");
  await page.getByRole("button", { name: "Review captures" }).click();

  const review = page.getByTestId("capture-review");
  await expect(review.getByRole("heading", { name: "Source use is blocked" })).toBeVisible();
  await expect(review.getByText("No automatic refresh was performed.")).toBeVisible();
  await expect(
    review.getByRole("button", { name: "Accept high-confidence fields" }),
  ).toBeDisabled();
  await expect(review.getByRole("button", { name: "Save as new job" })).toBeDisabled();

  await review.getByRole("button", { name: "Enter job manually" }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("data-capture-mode", "manual");
  await expect(dialog.getByLabel(/Source URL/u)).toHaveValue(
    "https://www.linkedin.com/jobs/view/42",
  );
  await dialog.getByRole("button", { name: "Close capture dialog" }).click();

  await review.getByRole("button", { name: /jobs\.example\.test/u }).click();
  await expect(review.getByRole("heading", { name: "Page content is unsupported" })).toBeVisible();
  await review.getByRole("button", { name: "Paste listing text" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("data-capture-mode", "paste");
  await expect(dialog.getByLabel(/Source URL/u)).toHaveValue(
    "https://jobs.example.test/unsupported/1",
  );
  await dialog.getByRole("button", { name: "Close capture dialog" }).click();

  expect(externalRequests).toEqual([]);
  const accessibility = await new AxeBuilder({ page })
    .include('[data-testid="capture-review"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
  const output = testInfo.outputPath("review-source-states-axe.json");
  await writeFile(output, `${JSON.stringify(accessibility, null, 2)}\n`, "utf8");
  await testInfo.attach("review-source-states-axe.json", {
    path: output,
    contentType: "application/json",
  });

  console.info(
    `REV005_E2E_PROOF ${JSON.stringify({ blocked: true, unsupported: true, manualFallbacks: true, retainedEvidence: true, networkRequests: externalRequests.length, accessibilityViolations: accessibility.violations.length })}`,
  );
});

test("a changed source stays reviewable without overwriting confirmed values", async ({ page }) => {
  await openCleanShell(page);
  const sourceUrl = "https://jobs.example.test/changed/1";

  await addManualCapture(page, {
    title: "Original Platform Engineer",
    company: "Coredrill Labs",
    sourceUrl,
    notes: "Original retained listing text.",
  });
  await page.getByRole("button", { name: "Review captures" }).click();
  const review = page.getByTestId("capture-review");
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await review.getByRole("button", { name: "Save as new job" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();

  await addManualCapture(page, {
    title: "Updated Platform Engineer",
    company: "Coredrill Labs",
    sourceUrl,
    notes: "Changed retained listing text.",
  });

  await expect(review.getByRole("heading", { name: "Source content changed" })).toBeVisible();
  await expect(
    review.getByText("Confirmed fields will not be overwritten.", { exact: false }),
  ).toBeVisible();
  await expect(review.getByRole("button", { name: "Accept high-confidence fields" })).toBeEnabled();
  await review.getByRole("button", { name: "Paste updated listing" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("data-capture-mode", "paste");
  await dialog.getByRole("button", { name: "Close capture dialog" }).click();
});
