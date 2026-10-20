import { expect } from "@playwright/test";

/** Real capture/review/storage; comparison query only. Normal comparison controls remain separate. */
export const exerciseStoredListingComparison = async (page) => {
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
      ? ["Build local APIs <script>neverExecute()</script>"]
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
    const compared = await api.sourceComparison(input);
    const after = await api.workspace({ jobId });
    return { input, before, compared, after };
  }, jobId);
  expect(result.compared.ok).toBe(true);
  expect(result.after).toEqual(result.before);
  const comparison = result.compared.value;
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
  await page.reload();
  await page.waitForFunction(() => globalThis.coredrillStorageSpike?.pipeline !== undefined);
  const reloaded = await page.evaluate(
    (input) => globalThis.coredrillStorageSpike.pipeline.sourceComparison(input),
    result.input,
  );
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
    comparisonControlsConnected: false,
  };
};
