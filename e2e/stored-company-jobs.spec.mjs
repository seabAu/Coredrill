import { expect, test } from "@playwright/test";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";
import { createCompanyJobsFixture } from "./company-jobs-fixture.mjs";
import {
  exerciseCompanyJobs,
  installCompanyJobsProbe,
  companyRoleIds,
  selectCompanyRoles,
} from "./company-jobs-journey.mjs";

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
  const panel = page.getByRole("region", { name: "Portable vault restore", exact: true });
  await panel.getByLabel("Choose archive to review", { exact: true }).setInputFiles({
    name: "synthetic-company-jobs.coredrill.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(fixture.bytes),
  });
  await expect(
    panel.getByRole("heading", { name: "Review exact restore changes", exact: true }),
  ).toBeVisible();
  await panel.getByRole("checkbox").check();
  await panel
    .getByRole("button", { name: "Confirm and restore reviewed archive", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "Restore committed and its acknowledgement validated",
  );
  await panel.getByRole("button", { name: "Reload local vault", exact: true }).click();
};

test("normal offline related roles come from manual capture and honest empty company details", async ({
  page,
  context,
}) => {
  const { external, errors } = await prepare(page, context);
  await initializeDefaultWorkspace(page);
  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  await primary.getByRole("link", { name: "Network", exact: true }).click();
  await page.getByRole("button", { name: "Create local company", exact: true }).click();
  const form = page.getByRole("form", { name: "Create local company", exact: true });
  await form.getByLabel("Company name", { exact: true }).fill("Synthetic UI-created empty company");
  await form.getByRole("button", { name: "Save local company", exact: true }).click();
  await form.getByRole("button", { name: "Close saved company draft", exact: true }).click();
  await selectCompanyRoles(page, "Synthetic UI-created empty company");
  await expect(
    page.getByRole("region", { name: "Company linked roles", exact: true }),
  ).toContainText("No stored linked roles in this archive scope.");
  await primary.getByRole("link", { name: "Pipeline", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add job/u }).click();
  const capture = page.getByRole("dialog");
  const title = "Synthetic <b>literal role</b> 😀",
    company = "Synthetic UI-captured role company";
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
  const roles = await selectCompanyRoles(page, company),
    role = roles.getByRole("button", { name: title, exact: true });
  await expect(role).toBeEnabled();
  await role.focus();
  await role.press("Enter");
  const frame = page.locator("[data-job-workspace]");
  await expect(frame.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await frame.getByRole("button", { name: "Back to company", exact: true }).click();
  await expect(role).toBeFocused();
  await page.reload();
  await expect(role).toBeVisible();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("normal offline company role pages retain exact retry, reflow and company return including archived jobs", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const fixture = await createCompanyJobsFixture(testInfo),
    { external, errors } = await prepare(page, context);
  await restoreFixture(page, fixture);
  const proof = await exerciseCompanyJobs(page, fixture);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await testInfo.attach("normal-company-role-proof", {
    body: JSON.stringify(proof, null, 2),
    contentType: "application/json",
  });
});

test("retired company-role reads stay private and do not claim empty until the new owner is confirmed", async ({
  page,
  context,
}, testInfo) => {
  const fixture = await createCompanyJobsFixture(testInfo),
    { external, errors } = await prepare(page, context);
  await restoreFixture(page, fixture);
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Network", exact: true })
    .click();
  await installCompanyJobsProbe(page);
  const roles = await selectCompanyRoles(page, fixture.companyName);
  await expect.poll(() => companyRoleIds(roles)).toEqual(fixture.firstIds);
  await page.evaluate(() => {
    globalThis.__companyJobsProbe.holdNext = true;
  });
  await roles.getByRole("button", { name: "First linked roles", exact: true }).click();
  await page.waitForFunction(() => globalThis.__companyJobsProbe.release !== null);
  await selectCompanyRoles(page, "Synthetic empty linked-role company");
  await expect(roles).toContainText("No stored linked roles in this archive scope.");
  await expect(roles.locator("[data-company-job]")).toHaveCount(0);
  const completed = await page.evaluate(() => globalThis.__companyJobsProbe.completed);
  await page.getByRole("button", { name: "Back to companies", exact: true }).focus();
  await page.evaluate(() => globalThis.__companyJobsProbe.release());
  await page.waitForFunction(
    (before) => globalThis.__companyJobsProbe.completed > before,
    completed,
  );
  await expect(roles.locator("[data-company-job]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back to companies", exact: true })).toBeFocused();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("a changed company invalidates the saved return scope until an explicit first-page read", async ({
  page,
  context,
}, testInfo) => {
  const fixture = await createCompanyJobsFixture(testInfo),
    { external, errors } = await prepare(page, context);
  await restoreFixture(page, fixture);
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Network", exact: true })
    .click();
  await installCompanyJobsProbe(page);
  const roles = await selectCompanyRoles(page, fixture.companyName);
  await expect.poll(() => companyRoleIds(roles)).toEqual(fixture.firstIds);
  await roles.locator("[data-company-job]").first().click();
  await expect(page.getByRole("button", { name: "Back to company", exact: true })).toBeVisible();
  // Disclosed concurrent-writer prerequisite: actual scoped command, never a fabricated read response.
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
      notes: "Synthetic external company revision for return check",
    });
    if (!changed.ok) throw Error("Synthetic concurrent edit failed");
  }, fixture.companyId);
  const before = await page.evaluate(() => globalThis.__companyJobsProbe.calls.length);
  await page.getByRole("button", { name: "Back to company", exact: true }).click();
  await expect(roles.getByRole("status")).toContainText("saved return page no longer matches");
  await expect(roles.locator("[data-company-job]")).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__companyJobsProbe.calls.length)).toBe(before);
  await roles.getByRole("button", { name: "First linked roles", exact: true }).click();
  await expect.poll(() => companyRoleIds(roles)).toEqual(fixture.firstIds);
  expect(
    await page.evaluate(() => JSON.parse(globalThis.__companyJobsProbe.calls.at(-1))),
  ).toMatchObject({ expectedCompanyRowVersion: 2, after: null });
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("an archived role lookup stays visible through a held real read and private failure before explicit retry", async ({
  page,
  context,
}, testInfo) => {
  const fixture = await createCompanyJobsFixture(testInfo),
    { external, errors } = await prepare(page, context);
  await restoreFixture(page, fixture);
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Network", exact: true })
    .click();
  await page.evaluate((jobId) => {
    const root = globalThis.coredrillStorageSpike,
      original = root.pipeline;
    const probe = { jobId, hold: true, fail: true, release: null, reads: 0 };
    globalThis.__companyJobLookup = probe;
    globalThis.coredrillStorageSpike = {
      ...root,
      pipeline: {
        ...original,
        workspace: async (input) => {
          const result = await original.workspace(input);
          if (input.jobId === probe.jobId) {
            probe.reads++;
            if (probe.hold) {
              probe.hold = false;
              await new Promise((resolve) => {
                probe.release = resolve;
              });
            }
            if (probe.fail) throw Error("PRIVATE archived lookup path");
          }
          return result;
        },
      },
    };
  }, fixture.archivedJobId);
  const roles = await selectCompanyRoles(page, fixture.companyName);
  await roles.getByRole("checkbox", { name: "Include archived linked roles", exact: true }).check();
  await expect.poll(() => companyRoleIds(roles)).toEqual(fixture.firstIds);
  await roles.getByRole("button", { name: "Next linked roles", exact: true }).click();
  await expect.poll(() => companyRoleIds(roles)).toEqual(fixture.secondIds);
  await roles.getByRole("button", { name: "Next linked roles", exact: true }).click();
  await roles.locator(`[data-company-job="${fixture.archivedJobId}"]`).click();
  await page.waitForFunction(() => globalThis.__companyJobLookup.release !== null);
  const lookup = page.getByRole("region", { name: "Stored job lookup", exact: true });
  await expect(lookup).toContainText("Reading the selected stored job");
  await expect(page.getByText("PRIVATE synthetic role body 126", { exact: true })).toHaveCount(0);
  await page.evaluate(() => globalThis.__companyJobLookup.release());
  await expect(lookup).toContainText("could not be confirmed");
  await expect(lookup).not.toContainText("PRIVATE archived lookup path");
  expect(await page.evaluate(() => globalThis.__companyJobLookup.reads)).toBe(1);
  await page.evaluate(() => {
    globalThis.__companyJobLookup.fail = false;
  });
  await lookup.locator("[data-details-refresh]").click();
  const frame = page.locator(`[data-job-workspace="${fixture.archivedJobId}"]`);
  await expect(frame).toContainText("PRIVATE synthetic role body 126");
  expect(await page.evaluate(() => globalThis.__companyJobLookup.reads)).toBe(2);
  await frame.getByRole("button", { name: "Back to company", exact: true }).click();
  await expect(roles.locator(`[data-company-job="${fixture.archivedJobId}"]`)).toBeFocused();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
