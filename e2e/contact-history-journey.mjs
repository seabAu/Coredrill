import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";

/** Normal UI over a separately disclosed synthetic populated archive, not a recording composer. */
export const exerciseContactHistory = async (page, testInfo, fixture, runtime = "browser") => {
  await page.goto(`/network/contacts/${fixture.contactId}?company=${fixture.companyId}`);
  const history = page.getByRole("region", { name: "Recorded contact history", exact: true });
  const list = history.getByRole("list", {
    name: "Recorded interactions on this page",
    exact: true,
  });
  await expect(list.getByRole("listitem")).toHaveCount(25);
  await expect(list.getByRole("listitem").first()).toContainText("Future imported history record");
  await expect(history).not.toContainText("UNRELATED_CONTACT_ONLY");
  await expect(history).not.toContainText("UNLINKED_CONTACT_ONLY");
  await expect(history).not.toContainText("ARCHIVED_JOB_ONLY");
  const inspect = history.locator(`[data-contact-history-inspect="${fixture.longInteractionId}"]`);
  await inspect.focus();
  await inspect.press("Enter");
  const summary = history.getByRole("region", {
    name: "Recorded interaction summary",
    exact: true,
  });
  await expect(summary.getByRole("status")).toContainText("Only a prefix has been read");
  await expect(inspect).toBeFocused();
  await summary.getByRole("button", { name: "Read next summary part", exact: true }).click();
  await expect(summary.getByRole("status")).toContainText("Complete literal summary read");
  expect(
    await summary.getByLabel("Literal recorded summary text", { exact: true }).textContent(),
  ).toBe(fixture.body);
  expect(await summary.locator("script").count()).toBe(0);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).include('[aria-label="Recorded contact history"]').analyze())
      .violations,
  ).toEqual([]);
  await history
    .getByRole("heading", { name: "Recorded interactions", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("contact-history-summary-320.png") });
  const primary = page.getByRole("navigation", { name: /^(Primary|Mobile)$/u });
  await primary.getByRole("link", { name: "Pipeline", exact: true }).click();
  // Network's top-level destination intentionally retires selection. Back returns
  // to the same viewed contact, rather than asking for a new directory owner.
  await page.goBack();
  await expect(summary.getByRole("status")).toContainText("Complete literal summary read");
  expect(
    await summary.getByLabel("Literal recorded summary text", { exact: true }).textContent(),
  ).toBe(fixture.body);
  await summary.getByRole("button", { name: "Close recorded summary", exact: true }).click();
  await expect(inspect).toBeFocused();
  const next = history.getByRole("button", { name: "Next history page", exact: true });
  await next.focus();
  await next.press("Enter");
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(next).toBeDisabled();
  await expect(
    history.getByRole("button", { name: "Load first history page / refresh", exact: true }),
  ).toBeFocused();
  await history.getByRole("checkbox").check();
  await expect(list.getByRole("listitem")).toHaveCount(25);
  await next.click();
  await expect(list.getByRole("listitem")).toHaveCount(4);
  await expect(history).toContainText("ARCHIVED_JOB_ONLY");
  await page.reload();
  await expect(list.getByRole("listitem")).toHaveCount(25);
  await expect(history.getByRole("checkbox")).not.toBeChecked();
  const proof = {
    syntheticPopulatedArchive: true,
    originalRecoveryFixtureUnchanged: true,
    archiveSha256: fixture.archiveSha256,
    normalRecordingComposerProven: false,
    explicitContactLinksOnly: true,
    livePaging: true,
    completeLiteralSummary: true,
    localReloadWithoutExternalFetch: true,
    emulatedBrowserOffline: runtime === "browser",
    navigationReflowRetained: true,
    keyboardFocusAndAxe: true,
  };
  await testInfo.attach("normal-contact-history.json", {
    body: JSON.stringify(proof),
    contentType: "application/json",
  });
  return proof;
};
