import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";

/** Normal read-only UI over a disclosed restored synthetic archive, not contact acquisition. */
export const exerciseContactEvidence = async (page, testInfo, fixture, runtime = "browser") => {
  await page.goto(`/network/contacts/${fixture.contactId}?company=${fixture.companyId}`);
  const evidence = page.getByRole("region", { name: "Contact field source evidence", exact: true });
  const details = page.getByRole("region", { name: "Stored contact details", exact: true });
  const email = evidence.getByRole("button", { name: "Inspect Email evidence", exact: true });
  const list = evidence.getByRole("list", {
    name: "Retained field evidence on this page",
    exact: true,
  });
  await expect(email).toBeEnabled();
  await expect(evidence.getByRole("status")).toContainText("Choose a field");
  await expect(details.locator('[data-contact-field="email"]')).toContainText("Value withheld");
  const before = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await email.focus();
  await email.press("Enter");
  await expect(list.getByRole("listitem")).toHaveCount(5);
  await expect(email).toBeFocused();
  expect(
    await evidence
      .locator(`[data-contact-evidence-excerpt="${fixture.firstEvidenceId}"]`)
      .textContent(),
  ).toBe(fixture.excerpt);
  await expect(list.getByRole("listitem").first()).toContainText("Exact value hash matches");
  await expect(list.getByRole("listitem").nth(1)).toContainText(
    "Historical value hash does not match",
  );
  await expect(evidence).toContainText("UNTRUSTED public/licensed assertion");
  await expect(evidence).toContainText("eligibility is not established");
  await expect(evidence).toContainText("No excerpt retained.");
  await expect(evidence).toContainText("Empty retained excerpt.");
  await expect(evidence).toContainText("Empty retained license note.");
  await expect(evidence).toContainText("not capture-time authorization");
  await expect(evidence.locator("a, img, script")).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__contactEvidenceExecuted ?? false)).toBe(false);
  await expect(evidence).not.toContainText("ARCHIVED_SOURCE_EVIDENCE_ONLY");
  const next = evidence.getByRole("button", { name: "Next evidence page", exact: true });
  const first = evidence.getByRole("button", {
    name: "Load first evidence page / refresh",
    exact: true,
  });
  await next.focus();
  await next.press("Enter");
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(evidence).toContainText("ARCHIVED_SOURCE_EVIDENCE_ONLY");
  await expect(next).toBeDisabled();
  await expect(first).toBeFocused();
  expect(
    await evidence
      .locator(`[data-contact-evidence-excerpt="${fixture.longEvidenceId}"]`)
      .textContent(),
  ).toBe(fixture.longExcerpt);
  await evidence.getByRole("checkbox").check();
  await expect(list.getByRole("listitem")).toHaveCount(5);
  await next.click();
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(evidence).toContainText("ARCHIVED_SOURCE_EVIDENCE_ONLY");
  await evidence.getByRole("button", { name: "Inspect Role evidence", exact: true }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(evidence).toContainText("The current field is absent");
  await expect(evidence).toContainText("Historical value hash does not match");
  await evidence.getByRole("button", { name: "Inspect Phone evidence", exact: true }).click();
  await expect(evidence).toContainText("No retained source links were found");
  await expect(evidence).toContainText("The current field is absent");
  await evidence.getByRole("button", { name: "Inspect Name evidence", exact: true }).click();
  await expect(evidence).toContainText("No retained source links were found");
  await expect(evidence).toContainText("The current field is present");
  await evidence.getByRole("button", { name: "Close evidence inspection", exact: true }).click();
  await expect(
    evidence.getByRole("button", { name: "Inspect Name evidence", exact: true }),
  ).toBeFocused();
  await expect(evidence.getByRole("status")).toContainText("Choose a field");
  await email.click();
  await expect(list.getByRole("listitem")).toHaveCount(5);
  const after = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  expect(after).toBe(before);
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(list.getByRole("listitem")).toHaveCount(5);
  await next.click();
  await expect(list.getByRole("listitem")).toHaveCount(3);
  expect(
    await evidence
      .locator(`[data-contact-evidence-excerpt="${fixture.longEvidenceId}"]`)
      .textContent(),
  ).toBe(fixture.longExcerpt);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .include('[aria-label="Contact field source evidence"]')
        .analyze()
    ).violations,
  ).toEqual([]);
  await evidence
    .getByRole("heading", { name: "Retained contact source evidence", exact: true })
    .evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: testInfo.outputPath("contact-evidence-controls-320.png") });
  await list
    .getByRole("listitem")
    .first()
    .evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: testInfo.outputPath("contact-evidence-320.png") });
  await first.click();
  await expect(list.getByRole("listitem")).toHaveCount(5);
  const primary = page.getByRole("navigation", { name: /^(Primary|Mobile)$/u });
  await primary.getByRole("link", { name: "Pipeline", exact: true }).click();
  await page.goBack();
  await expect(list.getByRole("listitem")).toHaveCount(5);
  await expect(evidence.getByRole("checkbox")).toBeChecked();
  await expect(details.locator('[data-contact-field="email"]')).toContainText("Value withheld");
  await page.reload();
  await expect(email).toBeEnabled();
  await expect(evidence.getByRole("status")).toContainText("Choose a field");
  await expect(evidence.getByRole("checkbox")).not.toBeChecked();
  await email.click();
  await expect(list.getByRole("listitem")).toHaveCount(5);
  await page.goto(`/network/contacts/${fixture.archivedContactId}?company=${fixture.companyId}`);
  await expect(email).toBeEnabled();
  await expect(details).toContainText("Archived at");
  const archivedBefore = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await email.click();
  await expect(evidence.getByRole("alert")).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(0);
  await evidence.getByRole("checkbox").check();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(evidence).toContainText("ARCHIVED_CONTACT_EVIDENCE_ONLY");
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(archivedBefore);
  const proof = {
    runtime,
    syntheticRestoredArchive: true,
    originalRecoveryFixtureUnchanged: fixture.originalRecoveryFixtureUnchanged,
    archiveSha256: fixture.archiveSha256,
    sourceBackedCreationOrAcquisitionProven: false,
    publicLicensedQualificationProven: false,
    canonicalUnqualifiedMethodWithheld: true,
    explicitOneFieldInspection: true,
    exactAndHistoricalValueHashes: true,
    absentPresentEmptyEvidenceDistinct: true,
    literalBOMNULUnicodeMarkup: true,
    livePagingAndArchiveScope: true,
    sourceLinksSurviveJobArchival: true,
    archivedContactNeedsExplicitScope: true,
    exactDatabaseUnchangedByInspection: true,
    navigationReflowRetained: true,
    selectionEphemeralAfterReload: true,
    keyboardFocusAnd320pxAxe: true,
    sourceFetchesOrMessages: 0,
  };
  await testInfo.attach("normal-contact-source-evidence.json", {
    body: JSON.stringify(proof),
    contentType: "application/json",
  });
  return proof;
};
