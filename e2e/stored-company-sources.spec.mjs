import { expect, test } from "@playwright/test";
import { createCompanyJobsFixture } from "./company-jobs-fixture.mjs";
import { exerciseCompanySources, installCompanySourcesProbe } from "./company-sources-journey.mjs";
import { selectCompanyRoles } from "./company-jobs-journey.mjs";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";

const prepare = async (page, context, fixture) => {
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
  if (fixture === undefined) {
    await initializeDefaultWorkspace(page);
    return { external, errors };
  }
  await page.getByRole("button", { name: /Quick start/u }).click();
  await page
    .getByRole("button", { name: "Restore an existing archive instead", exact: true })
    .click();
  const restore = page.getByRole("region", { name: "Portable vault restore", exact: true });
  await restore.getByLabel("Choose archive to review", { exact: true }).setInputFiles({
    name: "synthetic-company-sources.coredrill.zip",
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
  return { external, errors };
};

test("a manually captured source appears under its company and opens retained evidence offline after reload", async ({
  page,
  context,
}) => {
  const { external, errors } = await prepare(page, context);
  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  await primary.getByRole("link", { name: "Pipeline", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add job/u }).click();
  const capture = page.getByRole("dialog"),
    company = "Synthetic manually captured source company";
  await capture.getByLabel(/Job title/u).fill("Synthetic manual source role");
  await capture.getByLabel(/Company/u).fill(company);
  await capture.getByLabel("Source URL (optional)").fill("https://example.test/manual-source");
  await capture
    .getByLabel(/Notes or listing details/u)
    .fill("Synthetic retained source <script>inert()</script> 🧭");
  await capture.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
  await capture.getByRole("button", { name: "Close capture dialog" }).click();
  await page.locator('[data-pipeline-view-option="inbox"]').click();
  const review = page.getByTestId("capture-review");
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await review.getByRole("button", { name: "Save as new job" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  await selectCompanyRoles(page, company);
  const panel = page.getByRole("region", { name: "Company listing sources", exact: true });
  await expect(panel.locator("[data-company-source]")).toHaveCount(1);
  await expect(panel).toContainText("https://example.test/manual-source");
  await expect(panel).not.toContainText("<script>inert()</script>");
  await page.reload();
  await expect(panel.locator("[data-company-source]")).toHaveCount(1);
  await panel.locator("[data-company-source-open]").click();
  const source = page.getByRole("region", { name: "Stored job Source", exact: true });
  await expect(
    source.getByRole("region", { name: "primary literal retained content", exact: true }),
  ).toContainText("Synthetic retained source <script>inert()</script> 🧭");
  await page
    .locator("[data-job-workspace]")
    .getByRole("button", { name: "Back to company", exact: true })
    .click();
  await expect(panel.locator("[data-company-source-open]")).toBeFocused();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("normal company listing sources preserve literal metadata, exact retries and active/archived Source returns offline", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120000);
  const fixture = await createCompanyJobsFixture(testInfo, { withSources: true });
  const { external, errors } = await prepare(page, context, fixture);
  await exerciseCompanySources(page, fixture, testInfo);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("a revised company cannot silently rebase a saved source return page", async ({
  page,
  context,
}, testInfo) => {
  const fixture = await createCompanyJobsFixture(testInfo, { withSources: true });
  const { external, errors } = await prepare(page, context, fixture);
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Network", exact: true })
    .click();
  await installCompanySourcesProbe(page);
  await selectCompanyRoles(page, fixture.sourceCompanyName);
  const panel = page.getByRole("region", { name: "Company listing sources", exact: true });
  await expect(panel.locator("[data-company-source]")).toHaveCount(10);
  await panel.locator("[data-company-source-open]").first().click();
  await expect(page.getByRole("region", { name: "Stored job Source", exact: true })).toContainText(
    "PRIVATE synthetic listing capture 25001",
  );
  // Disclosed concurrent-writer prerequisite: actual command, never a fabricated response.
  await page.evaluate(async (companyId) => {
    const root = globalThis.coredrillStorageSpike,
      identity = await root.vault.inspect();
    if (!identity.ok || identity.value.vault === null) throw Error("Missing synthetic vault");
    const scope = {
      specVersion: 1,
      expectedVaultId: identity.value.vault.id,
      companyId,
      includeArchived: true,
    };
    const company = await root.companyWorkspace.read(scope);
    if (!company.ok) throw Error("Missing synthetic company");
    const changed = await root.companyWorkspace.updateNotes({
      specVersion: 1,
      expectedVaultId: scope.expectedVaultId,
      companyId,
      expectedRowVersion: company.value.company.rowVersion,
      notes: "Synthetic external revision for source return",
    });
    if (!changed.ok) throw Error("Synthetic concurrent edit failed");
  }, fixture.sourceCompanyId);
  const before = await page.evaluate(() => globalThis.__companySourcesProbe.calls.length);
  await page.getByRole("button", { name: "Back to company", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("saved source return no longer matches");
  await expect(panel.locator("[data-company-source]")).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__companySourcesProbe.calls.length)).toBe(before);
  await panel.getByRole("button", { name: "First listing sources", exact: true }).click();
  await expect(panel.locator("[data-company-source]")).toHaveCount(10);
  expect(
    await page.evaluate(() => JSON.parse(globalThis.__companySourcesProbe.calls.at(-1))),
  ).toMatchObject({ expectedCompanyRowVersion: 2, after: null });
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("a held source page cannot publish or steal focus under a different company's confirmed empty scope", async ({
  page,
  context,
}, testInfo) => {
  const fixture = await createCompanyJobsFixture(testInfo, { withSources: true });
  const { external, errors } = await prepare(page, context, fixture);
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Network", exact: true })
    .click();
  await installCompanySourcesProbe(page);
  await selectCompanyRoles(page, fixture.sourceCompanyName);
  const panel = page.getByRole("region", { name: "Company listing sources", exact: true });
  await expect(panel.locator("[data-company-source]")).toHaveCount(10);
  await page.evaluate(() => {
    globalThis.__companySourcesProbe.holdNext = true;
  });
  await panel.getByRole("button", { name: "Next listing sources", exact: true }).click();
  await page.waitForFunction(() => typeof globalThis.__companySourcesProbe.release === "function");
  await selectCompanyRoles(page, "Synthetic empty linked-role company");
  await expect(panel).toContainText(
    "No stored listing sources for linked jobs in this archive scope.",
  );
  const deliberate = panel.getByRole("button", { name: "First listing sources", exact: true });
  await deliberate.focus();
  await page.evaluate(() => {
    const probe = globalThis.__companySourcesProbe;
    probe.release();
    probe.release = null;
  });
  await expect(panel.locator("[data-company-source]")).toHaveCount(0);
  await expect(deliberate).toBeFocused();
  await expect(panel).not.toContainText("synthetic.source");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
