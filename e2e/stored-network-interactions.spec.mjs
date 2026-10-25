import { expect, test } from "@playwright/test";
import { createCompanyJobsFixture } from "./company-jobs-fixture.mjs";
import { exerciseNetworkInteractions } from "./network-interactions-journey.mjs";
import { installInteractionCommitProbe } from "./interaction-entry-faults.mjs";

test("normal Network interactions pages, summaries and explicit local entry work offline across reload", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120000);
  await installInteractionCommitProbe(page);
  const fixture = await createCompanyJobsFixture(testInfo, { withNetworkInteractions: true });
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
  await page.getByRole("button", { name: /Quick start/u }).click();
  await page
    .getByRole("button", { name: "Restore an existing archive instead", exact: true })
    .click();
  const restore = page.getByRole("region", { name: "Portable vault restore", exact: true });
  await restore.getByLabel("Choose archive to review", { exact: true }).setInputFiles({
    name: "synthetic-network-history.coredrill.zip",
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
  const proof = await exerciseNetworkInteractions(page, fixture, testInfo);
  await testInfo.attach("normal-network-interactions.json", {
    body: JSON.stringify(proof),
    contentType: "application/json",
  });
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
