import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";
import { createCompanyJobsFixture } from "./company-jobs-fixture.mjs";
import {
  exerciseCompanyInteractions,
  installCompanyInteractionsProbe,
} from "./company-interactions-journey.mjs";
import { selectCompanyRoles } from "./company-jobs-journey.mjs";

const prepare = async (page, context) => {
  const external = [],
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:4181/")) return route.continue();
    external.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  await page.clock.setFixedTime(new Date("2026-10-25T16:00:00.000Z"));
  await page.goto("/");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  return { external, errors };
};
const restoreFixture = async (page, fixture) => {
  await page.getByRole("button", { name: /Quick start/u }).click();
  await page
    .getByRole("button", { name: "Restore an existing archive instead", exact: true })
    .click();
  const restore = page.getByRole("region", { name: "Portable vault restore", exact: true });
  await restore.getByLabel("Choose archive to review", { exact: true }).setInputFiles({
    name: "synthetic-company-history.coredrill.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(fixture.bytes),
  });
  await expect(
    restore.getByRole("heading", { name: "Review exact restore changes", exact: true }),
  ).toBeVisible();
  await restore.getByRole("checkbox").check();
  await restore
    .getByRole("button", { name: "Confirm and restore reviewed archive", exact: true })
    .click();
  await expect(restore.getByRole("status")).toContainText(
    "Restore committed and its acknowledgement validated",
  );
  await restore.getByRole("button", { name: "Reload local vault", exact: true }).click();
};
test("normal company history shows a manually recorded job interaction offline and after reload", async ({
  page,
  context,
}) => {
  const { external, errors } = await prepare(page, context);
  await initializeDefaultWorkspace(page);
  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  await primary.getByRole("link", { name: "Pipeline", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add job/u }).click();
  const capture = page.getByRole("dialog"),
    title = "Synthetic company history role",
    company = "Synthetic UI history company";
  await capture.getByLabel(/Job title/u).fill(title);
  await capture.getByLabel(/Company/u).fill(company);
  await capture.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
  await capture.getByRole("button", { name: "Close capture dialog" }).click();
  await page.locator('[data-pipeline-view-option="inbox"]').click();
  const review = page.getByTestId("capture-review");
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await review.getByRole("button", { name: "Save as new job" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  const roles = await selectCompanyRoles(page, company);
  const history = page.getByRole("region", { name: "Company recorded interactions", exact: true });
  await expect(history).toContainText(
    "No recorded interactions for linked jobs in this archive scope.",
  );
  await roles.getByRole("button", { name: title, exact: true }).click();
  await page
    .locator("[data-job-workspace]")
    .getByRole("button", { name: "Timeline", exact: true })
    .click();
  const entry = page.getByRole("region", { name: "Record local interaction", exact: true });
  await entry.getByRole("button", { name: "New interaction", exact: true }).click();
  const literal = "\uFEFF  Local company <script>inert()</script> 🧭\nKeep spacing.  ";
  await entry.getByLabel("Interaction summary", { exact: true }).fill(literal);
  await entry.getByRole("button", { name: "Record interaction", exact: true }).click();
  await expect(entry.getByRole("status")).toContainText("Interaction save acknowledged");
  await entry.getByRole("button", { name: "Close recorded interaction", exact: true }).click();
  await page
    .locator("[data-job-workspace]")
    .getByRole("button", { name: "Back to company", exact: true })
    .click();
  await expect(history).toContainText("Local company <script>inert()</script>");
  await expect(history).toContainText("No retained contact link.");
  await history.getByRole("button", { name: /^Read summary for/u }).click();
  const summary = history.getByRole("region", {
    name: "Selected company interaction summary",
    exact: true,
  });
  await expect(summary).toContainText("Complete retained summary read.");
  expect(await summary.locator("p.cd-company-literal").textContent()).toBe(literal);
  await page.reload();
  await expect(history).toContainText("Local company <script>inert()</script>");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
test("normal company history pages and complete literal summaries use exact retries and archive scope offline", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120000);
  const fixture = await createCompanyJobsFixture(testInfo, { withInteractions: true });
  const { external, errors } = await prepare(page, context);
  await restoreFixture(page, fixture);
  await exerciseCompanyInteractions(page, fixture, testInfo);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("a held actual summary cannot publish or steal focus after another company's empty history is confirmed", async ({
  page,
  context,
}, testInfo) => {
  const fixture = await createCompanyJobsFixture(testInfo, { withInteractions: true });
  const { external, errors } = await prepare(page, context);
  await restoreFixture(page, fixture);
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Network", exact: true })
    .click();
  await installCompanyInteractionsProbe(page);
  await selectCompanyRoles(page, fixture.historyCompanyName);
  const panel = page.getByRole("region", { name: "Company recorded interactions", exact: true });
  await expect(panel.locator("[data-company-interaction]")).toHaveCount(10);
  await page.evaluate(() => {
    globalThis.__companyInteractionsProbe.holdSummary = true;
  });
  await panel
    .getByRole("button", { name: /^Read summary for/u })
    .first()
    .click();
  await page.waitForFunction(
    () => typeof globalThis.__companyInteractionsProbe.release === "function",
  );
  await selectCompanyRoles(page, "Synthetic empty linked-role company");
  await expect(panel).toContainText(
    "No recorded interactions for linked jobs in this archive scope.",
  );
  const deliberate = panel.getByRole("button", { name: "First company interactions", exact: true });
  await deliberate.focus();
  await page.evaluate(() => {
    const probe = globalThis.__companyInteractionsProbe;
    probe.release();
    probe.release = null;
  });
  await expect(panel.locator("[data-company-interaction]")).toHaveCount(0);
  await expect(
    panel.getByRole("region", { name: "Selected company interaction summary", exact: true }),
  ).toHaveCount(0);
  await expect(deliberate).toBeFocused();
  await expect(panel).not.toContainText("Synthetic history job 400");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
