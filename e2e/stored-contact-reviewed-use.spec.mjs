import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createContactEvidenceFixture } from "./contact-evidence-fixture.mjs";

test("normal contact display uses current reviewed metadata, withholds expiry and preserves independent manual basis", async ({
  page,
  context,
}, testInfo) => {
  // The write controls are a subsequent slice: this test uses the normal runtime
  // command API as a disclosed prerequisite, then exercises actual read/display UI.
  const fixture = await createContactEvidenceFixture(testInfo),
    external = [],
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:4181/")) return route.continue();
    external.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  await page.clock.install();
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
    name: "synthetic-reviewed-use.coredrill.zip",
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
  await page.goto(`/network/contacts/${fixture.contactId}?company=${fixture.companyId}`);
  const details = page.getByRole("region", { name: "Stored contact details", exact: true }),
    email = details.locator('[data-contact-field="email"]');
  await expect(email).toContainText("Value withheld");
  const prepared = await page.evaluate(
    async ({ contactId }) => {
      const root = globalThis.coredrillStorageSpike,
        api = root.contactFieldUse;
      const identity = await root.vault.inspect();
      if (!identity.ok || identity.value.vault === null)
        throw new Error("Missing synthetic vault.");
      const vaultId = identity.value.vault.id,
        sourceSnapshotId = api.newRecordId(),
        policyId = api.newRecordId(),
        reviewId = api.newRecordId();
      const method = "synthetic-evidence@synthetic.example",
        terms = "Synthetic explicit permission for manual job-search contact use.";
      const body = `\uFEFF${method}\n${terms}\0尾`,
        start = 3,
        termsStart = new TextEncoder().encode(`\uFEFF${method}\n`).length;
      const hash = async (text) =>
        Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
      const capturedAt = new Date().toISOString(),
        due = new Date(Date.now() + 60_000).toISOString(),
        sourceHash = await hash(body);
      const scope = {
        specVersion: 1,
        expectedVaultId: vaultId,
        contactId,
        expectedContactRowVersion: 1,
        fieldName: "email",
      };
      const source = await api
        .beginRecord({
          specVersion: 1,
          kind: "source",
          expectedVaultId: vaultId,
          sourceSnapshotId,
          sourceClass: "official_employer_page",
          sourceUrl: "https://synthetic.example/team",
          capturedAt,
          literalText: body,
        })
        .submit();
      const afterSource = await api.readField(scope);
      const policy = await api
        .beginRecord({
          specVersion: 1,
          kind: "policy",
          expectedVaultId: vaultId,
          policyId,
          sourceSnapshotId,
          expectedSourceHash: sourceHash,
          fieldName: "email",
          termsSnapshotId: sourceSnapshotId,
          expectedTermsHash: sourceHash,
          termsStartByte: termsStart,
          termsEndByte: termsStart + new TextEncoder().encode(terms).length,
          termsExcerpt: terms,
          permissionKind: "explicit_public_job_search_contact",
          purpose: "job_search",
          reviewDueAt: due,
          acknowledgement: "I reviewed this source's permitted field use.",
        })
        .submit();
      const afterPolicy = await api.readField(scope);
      const review = await api
        .beginRecord({
          specVersion: 1,
          kind: "review",
          expectedVaultId: vaultId,
          reviewId,
          contactId,
          expectedContactRowVersion: 1,
          expectedLatestReviewId: null,
          fieldName: "email",
          expectedValueHash: await hash(method),
          sourceSnapshotId,
          expectedSourceHash: sourceHash,
          sourceStartByte: start,
          sourceEndByte: start + new TextEncoder().encode(method).length,
          sourceExcerpt: method,
          policyId,
          policyRevision: 1,
          purpose: "job_search",
          purposeNote: "Synthetic explicit manual review.",
          reviewDueAt: due,
          expiresAt: due,
          acknowledgement: "I reviewed this exact contact field and purpose.",
        })
        .submit();
      return {
        source,
        policy,
        review,
        afterSource,
        afterPolicy,
        vaultId,
        sourceSnapshotId,
        sourceHash,
        policyId,
        reviewId,
        due,
      };
    },
    { contactId: fixture.contactId },
  );
  for (const key of ["source", "policy", "review"])
    expect(prepared[key]).toMatchObject({ ok: true });
  for (const key of ["afterSource", "afterPolicy"])
    expect(prepared[key]).toMatchObject({
      ok: true,
      value: { latestReview: null, assessment: null },
    });
  await expect(email).toContainText("Value withheld");
  const before = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await details.getByRole("button", { name: "Refresh selected contact", exact: true }).click();
  await expect(email).toHaveText("synthetic-evidence@synthetic.example");
  await expect(details).toContainText("User-reviewed public basis current until");
  const evidence = page.getByRole("region", { name: "Contact field source evidence", exact: true });
  await evidence.getByRole("button", { name: "Inspect Email evidence", exact: true }).click();
  await expect(evidence).toContainText("eligibility is not established by this evidence read");
  await expect(email).toHaveText("synthetic-evidence@synthetic.example");
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await details.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
  expect(
    (await new AxeBuilder({ page }).include('[aria-label="Stored contact details"]').analyze())
      .violations,
  ).toEqual([]);
  await page.clock.fastForward(120_000);
  await expect(email).toContainText("Value withheld");
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(before);
  // A forged/foreign metadata read withholds only the reviewed-use projection.
  // It must not turn an independently supported manual value into unknown data.
  await page.evaluate(() => {
    const root = globalThis.coredrillStorageSpike,
      original = root.contactFieldUse;
    globalThis.coredrillStorageSpike = {
      ...root,
      contactFieldUse: {
        ...original,
        readField: async (input) => {
          const result = await original.readField(input);
          return result.ok
            ? {
                ok: true,
                value: { ...result.value, vaultId: "0198e124-0000-7000-8000-000000000099" },
              }
            : result;
        },
      },
    };
  });
  await page.getByRole("button", { name: "Back to contacts", exact: true }).click();
  const list = page.getByRole("list", { name: "Stored contacts on this page", exact: true });
  await list
    .getByRole("listitem")
    .filter({ hasText: "Synthetic manually entered contact" })
    .getByRole("button", { name: "View contact details", exact: true })
    .click();
  await expect(details.getByRole("alert")).toContainText(
    "reviewed source-use basis could not be confirmed",
  );
  await expect(details.locator('[data-contact-field="email"]')).toHaveText(
    "manual@synthetic.example",
  );
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await testInfo.attach("reviewed-contact-display-proof.json", {
    body: JSON.stringify({
      syntheticPrerequisiteCommands: true,
      normalWriteControlsProven: false,
      normalDisplay: true,
      sourceAndPolicyAloneDoNotQualify: true,
      expiryWithheldWithoutWrites: true,
      oldJobBoundProjectionDoesNotOverride: true,
      manualBasisIndependent: true,
      externalRequests: 0,
      accessibilityViolations: 0,
    }),
    contentType: "application/json",
  });
});
