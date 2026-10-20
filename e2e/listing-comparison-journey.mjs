import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Real capture/review/storage and explicit normal Source comparison controls. */
export const exerciseStoredListingComparison = async (page, testInfo) => {
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Pipeline", exact: true })
    .click();
  const source = (changed) => ({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Structured comparison role",
    hiringOrganization: { "@type": "Organization", name: "Synthetic Comparison Lab" },
    description: "Build local tools without sending private data.",
    datePosted: "2026-09-01",
    validThrough: changed ? "2026-12-20T10:00:00Z" : "2026-12-01",
    qualifications: changed
      ? [
          `${"Build local APIs é中🙂 <script>neverExecute()</script> ".repeat(1200)}END_COMPLETE_REQUIREMENT`,
        ]
      : ["Build APIs", "Maintain tests"],
    ...(changed ? { responsibilities: ["Review security"] } : {}),
    baseSalary: {
      currency: "USD",
      value: {
        minValue: changed ? 110000 : 100000,
        maxValue: changed ? 140000 : 120000,
        unitText: "YEAR",
      },
    },
    jobLocation: {
      "@type": "Place",
      address: {
        addressLocality: changed ? "Boston" : "Austin",
        addressRegion: changed ? "MA" : "TX",
        addressCountry: "US",
      },
    },
  });
  for (const changed of [false, true]) {
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: /Add job/u }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Saved file", exact: true }).click();
    await dialog.getByLabel(/Job title/u).fill("Structured comparison role");
    await dialog.getByLabel(/Company/u).fill("Synthetic Comparison Lab");
    await dialog
      .getByLabel("Source URL (optional)")
      .fill("https://jobs.example.test/structured-comparison");
    await dialog.getByLabel(/Saved HTML/u).setInputFiles({
      name: changed ? "changed.json" : "baseline.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(source(changed))),
    });
    await dialog.getByRole("button", { name: "Save to capture inbox" }).click();
    await expect(dialog.getByRole("status")).toContainText("Stored in the local capture inbox");
    await dialog.getByRole("button", { name: "Close capture dialog" }).click();
    await page.locator('[data-pipeline-view-option="inbox"]').click();
    const review = page.getByTestId("capture-review");
    if (changed)
      await review.getByRole("button", { name: "Merge into selected job", exact: true }).click();
    else {
      await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
      await review.getByRole("button", { name: "Save as new job" }).click();
    }
    await expect(review.getByText("No durable captures yet")).toBeVisible();
  }
  await page.locator('[data-pipeline-view-option="table"]').click();
  await page.getByRole("button", { name: "Structured comparison role", exact: true }).click();
  const jobId = new URL(page.url()).pathname.split("/")[2];
  const result = await page.evaluate(async (jobId) => {
    const api = globalThis.coredrillStorageSpike.pipeline;
    const before = await api.workspace({ jobId });
    const snapshots = await api.sourceSnapshots({ jobId });
    if (!snapshots.ok || snapshots.value.items.length !== 2)
      throw new Error("Expected two normal capture snapshots");
    const [current, baseline] = snapshots.value.items;
    const input = { jobId, baselineSnapshotId: baseline.id, currentSnapshotId: current.id };
    return { input, before };
  }, jobId);
  const observe = async () =>
    page.evaluate(() => {
      const original = globalThis.coredrillStorageSpike;
      const api = original.pipeline;
      globalThis.coredrillComparisonUiProof = { calls: 0, last: null };
      globalThis.coredrillStorageSpike = {
        ...original,
        pipeline: {
          ...api,
          sourceComparison: async (input) => {
            globalThis.coredrillComparisonUiProof.calls += 1;
            const result = await api.sourceComparison(input);
            globalThis.coredrillComparisonUiProof.last = result;
            return result;
          },
        },
      };
    });
  await observe();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const sourceView = page.getByRole("region", { name: "Stored job Source", exact: true });
  await expect(
    sourceView.getByRole("article", { name: "Selected retained snapshot", exact: true }),
  ).toHaveAttribute("data-source-snapshot", result.input.currentSnapshotId);
  await sourceView
    .getByLabel("Second snapshot to inspect", { exact: true })
    .selectOption(result.input.baselineSnapshotId);
  await expect(
    sourceView.getByRole("article", { name: "Paired retained snapshot", exact: true }),
  ).toHaveAttribute("data-source-snapshot", result.input.baselineSnapshotId);
  expect(await page.evaluate(() => globalThis.coredrillComparisonUiProof.calls)).toBe(0);
  const changesView = sourceView.getByRole("region", {
    name: "Retained listing changes",
    exact: true,
  });
  const compare = changesView.getByRole("button", {
    name: "Compare retained listing fields",
    exact: true,
  });
  await compare.click();
  await expect(
    changesView.getByRole("heading", {
      name: "Requirements — Changed retained values",
      exact: true,
    }),
  ).toBeVisible();
  await expect(compare).toBeFocused();
  const compared = await page.evaluate(() => globalThis.coredrillComparisonUiProof.last);
  expect(compared.ok).toBe(true);
  expect(
    await page.evaluate(
      (jobId) => globalThis.coredrillStorageSpike.pipeline.workspace({ jobId }),
      jobId,
    ),
  ).toEqual(result.before);
  const comparison = compared.value;
  expect(comparison.fields.requirements.added).toHaveLength(1);
  expect(comparison.fields.requirements.removed).toHaveLength(1);
  expect(comparison.fields.requirements.changed).toHaveLength(1);
  for (const field of Object.values(comparison.fields)) expect(field.kind).toBe("changed");
  expect(comparison.fields.requirements.after.items[0]).toMatchObject({
    origin: "current_jsonld_analysis",
    candidateId: null,
    sourcePointer: "/content/apiPayload/qualifications/0",
  });
  expect(comparison).toMatchObject({
    refreshPerformed: false,
    trustedFieldMutationPerformed: false,
  });
  expect(await page.evaluate(() => globalThis.neverExecute)).toBeUndefined();
  await expect(changesView).toContainText("not inferred semantic identities");
  await expect(changesView).toContainText("Current local JSON-LD analysis");
  const laterCompensation = changesView.getByRole("article", {
    name: "Later Compensation",
    exact: true,
  });
  await laterCompensation.locator("summary").first().click();
  await laterCompensation
    .getByRole("button", { name: "Inspect after compensation comparison value 1", exact: true })
    .click();
  const inspector = changesView.getByRole("region", {
    name: "Comparison value inspector",
    exact: true,
  });
  await expect(inspector).toBeFocused();
  await expect(
    inspector.getByRole("region", { name: "Comparison value literal part", exact: true }),
  ).toContainText('"minimumDecimal":"110000"');
  const laterRequirements = changesView.getByRole("article", {
    name: "Later Requirements",
    exact: true,
  });
  await laterRequirements.locator("summary").first().click();
  await laterRequirements
    .getByRole("button", { name: "Inspect after requirements comparison value 1", exact: true })
    .click();
  await expect(inspector).toBeFocused();
  const valuePart = inspector.getByRole("region", {
    name: "Comparison value literal part",
    exact: true,
  });
  await expect(valuePart).not.toContainText("END_COMPLETE_REQUIREMENT");
  await inspector.getByRole("button", { name: "Next comparison value part", exact: true }).click();
  await expect(inspector).toContainText(/Bytes [1-9]\d+–/u);
  const heldPart = await valuePart.textContent();
  await page.setViewportSize({ width: 320, height: 850 });
  await expect(valuePart).toHaveText(heldPart);
  expect(await page.evaluate(() => globalThis.coredrillComparisonUiProof.calls)).toBe(1);
  for (
    let count = 0;
    count < 12 &&
    (await inspector
      .getByRole("button", { name: "Next comparison value part", exact: true })
      .isEnabled());
    count += 1
  )
    await inspector
      .getByRole("button", { name: "Next comparison value part", exact: true })
      .click();
  await expect(valuePart).toContainText("END_COMPLETE_REQUIREMENT");
  await inspector.getByRole("button", { name: "First comparison value part", exact: true }).click();
  await expect(inspector).toContainText("Bytes 0–");
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  expect(
    (await new AxeBuilder({ page }).include(".cd-stored-job-source").analyze()).violations,
  ).toEqual([]);
  if (testInfo)
    await page.screenshot({ path: testInfo.outputPath("listing-changes-320.png"), fullPage: true });
  await page.reload();
  await page.waitForFunction(() => globalThis.coredrillStorageSpike?.pipeline !== undefined);
  await expect(
    sourceView.getByRole("article", { name: "Selected retained snapshot", exact: true }),
  ).toHaveAttribute("data-source-snapshot", result.input.currentSnapshotId);
  await observe();
  await sourceView
    .getByLabel("Second snapshot to inspect", { exact: true })
    .selectOption(result.input.baselineSnapshotId);
  await compare.click();
  await expect(
    changesView.getByRole("heading", {
      name: "Requirements — Changed retained values",
      exact: true,
    }),
  ).toBeVisible();
  const reloaded = await page.evaluate(() => globalThis.coredrillComparisonUiProof.last);
  expect(reloaded.ok).toBe(true);
  expect(reloaded.value.fields).toEqual(comparison.fields);
  return {
    jobId,
    baselineSnapshotId: result.input.baselineSnapshotId,
    currentSnapshotId: result.input.currentSnapshotId,
    allFourFieldsChanged: true,
    requirementSlots: { added: 1, removed: 1, changed: 1 },
    noCanonicalMutation: true,
    reloaded: true,
    comparisonControlsConnected: true,
    boundedCompleteValue: true,
    narrowReflow: true,
    automatedAxeViolations: 0,
  };
};
