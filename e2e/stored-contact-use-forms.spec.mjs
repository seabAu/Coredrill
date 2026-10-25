import { expect, test } from "@playwright/test";
import { createContactEvidenceFixture } from "./contact-evidence-fixture.mjs";
import { exerciseContactUseForms } from "./contact-use-forms-journey.mjs";

const prepareForms = async (page, context, testInfo, fixtureOptions) => {
  const fixture = await createContactEvidenceFixture(testInfo, fixtureOptions),
    external = [],
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
    name: "synthetic-normal-use-forms.coredrill.zip",
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
  return { fixture, external, errors };
};

for (const sourceClass of ["official_employer_page", "public_dataset", "licensed_material"]) {
  test(`normal offline reviewed-use forms for ${sourceClass}`, async ({
    page,
    context,
  }, testInfo) => {
    const { fixture, external, errors } = await prepareForms(page, context, testInfo);
    const proof = await exerciseContactUseForms(page, {
      ...fixture,
      sourceClass,
      lifecycle: sourceClass === "official_employer_page",
    });
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
    await testInfo.attach("normal-contact-use-forms-proof", {
      body: JSON.stringify(
        { ...proof, externalRequests: external.length, pageErrors: errors.length },
        null,
        2,
      ),
      contentType: "application/json",
    });
  });
}

test("normal reviewed-use forms preserve the exact legacy profile URL through qualification and reload", async ({
  page,
  context,
}, testInfo) => {
  const literal = "HTTPS://SYNTHETIC.EXAMPLE:443/Profile?q=%7e#Tail";
  const { fixture, external, errors } = await prepareForms(page, context, testInfo, {
    profileUrl: literal,
  });
  await exerciseContactUseForms(page, {
    ...fixture,
    fieldName: "public_profile_url",
    fieldValue: literal,
    lifecycle: false,
  });
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("source-use draft survives foreign navigation and lost acknowledgement; metadata retries retain exact bounded scope", async ({
  page,
  context,
}, testInfo) => {
  const { fixture, external, errors } = await prepareForms(page, context, testInfo);
  await page.goto(`/network/contacts/${fixture.contactId}?company=${fixture.companyId}`);
  // Disclosed bulk metadata prerequisite; the held source itself is created through normal UI.
  await page.evaluate(async () => {
    const root = globalThis.coredrillStorageSpike,
      api = root.contactFieldUse;
    const identity = await root.vault.inspect();
    if (!identity.ok || identity.value.vault === null) throw Error("Missing synthetic vault");
    for (let n = 0; n < 12; n++) {
      const result = await api
        .beginRecord({
          specVersion: 1,
          kind: "source",
          expectedVaultId: identity.value.vault.id,
          sourceSnapshotId: api.newRecordId(),
          sourceClass: "official_employer_page",
          sourceUrl: `https://synthetic.example/bulk/${n}`,
          capturedAt: "2026-10-24T12:00:00.000Z",
          literalText: `SYNTHETIC_PRIVATE_BODY_${n}`,
        })
        .submit();
      if (!result.ok) throw Error("Synthetic metadata setup failed");
    }
    const driver = { committed: false, release: null, submits: 0, failNext: false, reads: [] };
    globalThis.__contactUseDriver = driver;
    globalThis.coredrillStorageSpike = {
      ...root,
      contactFieldUse: {
        ...api,
        beginRecord: (input) => {
          const bound = api.beginRecord(input);
          return {
            ...bound,
            submit: async () => {
              driver.submits++;
              const result = await bound.submit();
              driver.committed = result.ok;
              return new Promise((_resolve, reject) => {
                driver.release = () => reject(new Error("SYNTHETIC_PRIVATE_ACK_FAILURE"));
              });
            },
          };
        },
        readResearch: async (input) => {
          driver.reads.push(JSON.stringify(input));
          if (input.kind === "sources" && input.cursor !== null && driver.failNext) {
            driver.failNext = false;
            throw Error("SYNTHETIC_PRIVATE_QUERY_FAILURE");
          }
          const result = await api.readResearch(input);
          if (input.kind === "evidence" && driver.holdEvidence) {
            driver.holdEvidence = false;
            driver.readHeld = true;
            return new Promise((resolve) => {
              driver.releaseRead = () => resolve(result);
            });
          }
          return result;
        },
      },
    };
  });
  const details = page.getByRole("region", { name: "Stored contact details", exact: true });
  await details.getByRole("button", { name: "Refresh selected contact", exact: true }).click();
  await details.getByRole("button", { name: "Review Email source use", exact: true }).click();
  const flow = page.getByRole("region", { name: "Contact source-use review", exact: true });
  await expect(flow.getByText(/Local date helper:/u)).toHaveCount(0);
  const literal = "\uFEFFSYNTHETIC_PRIVATE_SOURCE_DRAFT\0<script>inert</script>尾";
  await flow.getByLabel("Time zone for date inputs", { exact: true }).fill("UTC");
  await flow.getByLabel("Source class", { exact: true }).selectOption("official_employer_page");
  await flow
    .getByLabel("Source URL", { exact: true })
    .fill("https://synthetic.example/held-source");
  await flow.getByLabel("Captured at", { exact: true }).fill("2026-10-24T12:00");
  await flow.getByLabel("Material to retain verbatim", { exact: true }).fill(literal);
  await flow.getByRole("button", { name: "Review source retention", exact: true }).click();
  await flow.getByRole("button", { name: "Confirm retain source", exact: true }).click();
  await page.waitForFunction(() => globalThis.__contactUseDriver.committed);
  await expect(
    flow.getByRole("button", { name: "Confirm retain source", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("list", { name: "Stored contacts on this page", exact: true })
    .getByRole("listitem")
    .filter({
      has: page.getByRole("heading", { name: "Other synthetic evidence contact", exact: true }),
    })
    .getByRole("button", { name: "View contact details", exact: true })
    .click();
  await expect(flow).toContainText("A review is retained for another contact");
  await expect(flow.locator("textarea, pre, input")).toHaveCount(0);
  await expect(flow).not.toContainText("SYNTHETIC_PRIVATE_SOURCE_DRAFT");
  await flow.getByRole("button", { name: "Return to source-use review", exact: true }).click();
  await expect(flow.getByLabel("Material to retain verbatim", { exact: true })).toHaveValue(
    literal,
  );
  await page.evaluate(() => globalThis.__contactUseDriver.release());
  await expect(flow).toContainText("Original action: uncertain.");
  await expect(flow).not.toContainText("SYNTHETIC_PRIVATE_ACK_FAILURE");
  await flow.getByRole("button", { name: "Inspect original action outcome", exact: true }).click();
  await expect(flow).toContainText("Original action: matching.");
  expect(await page.evaluate(() => globalThis.__contactUseDriver.submits)).toBe(1);
  await flow.getByRole("button", { name: "Close this action review", exact: true }).click();
  await flow.getByRole("button", { name: "Browse retained sources", exact: true }).click();
  const list = flow.getByLabel("Retained source page", { exact: true });
  await expect(list.getByRole("listitem")).toHaveCount(10);
  await expect(list.locator("pre,textarea")).toHaveCount(0);
  await expect(list).not.toContainText("SYNTHETIC_PRIVATE_BODY");
  await page.evaluate(() => {
    globalThis.__contactUseDriver.failNext = true;
  });
  await list.getByRole("button", { name: "Next retained-source page", exact: true }).click();
  const retry = flow.getByRole("button", { name: "Retry original research read", exact: true });
  await expect(retry).toBeFocused();
  await expect(flow).not.toContainText("SYNTHETIC_PRIVATE_QUERY_FAILURE");
  await retry.press("Enter");
  await expect(list.getByRole("listitem")).toHaveCount(3);
  const requests = await page.evaluate(() => globalThis.__contactUseDriver.reads.slice(-2));
  expect(requests[0]).toBe(requests[1]);
  await expect(
    list.getByRole("button", { name: "Next retained-source page", exact: true }),
  ).toBeDisabled();
  await flow.getByRole("button", { name: "Browse retained sources", exact: true }).click();
  await expect(list.getByRole("listitem")).toHaveCount(10);
  let item = list
    .getByRole("listitem")
    .filter({ hasText: "https://synthetic.example/held-source" });
  if ((await item.count()) === 0)
    await list.getByRole("button", { name: "Next retained-source page", exact: true }).click();
  await item.getByRole("button", { name: "Inspect and choose source", exact: true }).click();
  await expect(flow.getByLabel("Retained source text (read-only)", { exact: true })).toHaveValue(
    literal,
  );
  await expect(details.locator('[data-contact-field="email"]')).toContainText("Value withheld");
  const beforeRead = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await flow.getByRole("button", { name: "Browse retained sources", exact: true }).click();
  await expect(list.getByRole("listitem")).toHaveCount(10);
  await page.evaluate(() => {
    globalThis.__contactUseDriver.holdEvidence = true;
  });
  await list
    .getByRole("listitem")
    .filter({ hasText: "https://synthetic.example/bulk/" })
    .first()
    .getByRole("button", { name: "Inspect and choose source", exact: true })
    .click();
  await page.waitForFunction(() => globalThis.__contactUseDriver.readHeld);
  await page
    .getByRole("list", { name: "Stored contacts on this page", exact: true })
    .getByRole("listitem")
    .filter({
      has: page.getByRole("heading", { name: "Other synthetic evidence contact", exact: true }),
    })
    .getByRole("button", { name: "View contact details", exact: true })
    .click();
  await expect(flow.locator("textarea,pre,input")).toHaveCount(0);
  await page.evaluate(() => globalThis.__contactUseDriver.releaseRead());
  await flow.getByRole("button", { name: "Return to source-use review", exact: true }).click();
  await expect(
    flow.getByRole("button", { name: "Retry original research read", exact: true }),
  ).toBeVisible();
  await expect(flow.getByLabel("Retained source text (read-only)", { exact: true })).toHaveValue(
    literal,
  );
  await flow.getByRole("button", { name: "Retry original research read", exact: true }).click();
  await expect(flow.getByLabel("Retained source text (read-only)", { exact: true })).toHaveValue(
    /SYNTHETIC_PRIVATE_BODY_/u,
  );
  const evidenceRequests = await page.evaluate(() => globalThis.__contactUseDriver.reads.slice(-2));
  expect(evidenceRequests[0]).toBe(evidenceRequests[1]);
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(beforeRead);
  expect(await page.evaluate(() => globalThis.__contactUseDriver.submits)).toBe(1);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("restore retires a private source-use draft only after deliberate reopen", async ({
  page,
  context,
}, testInfo) => {
  const { fixture, external, errors } = await prepareForms(page, context, testInfo);
  await page.goto(`/network/contacts/${fixture.contactId}?company=${fixture.companyId}`);
  await page.getByRole("button", { name: "Review Email source use", exact: true }).click();
  const flow = page.getByRole("region", { name: "Contact source-use review", exact: true });
  const privateDraft = "UNSAVED_SYNTHETIC_SOURCE_RESTORE_DRAFT";
  await flow.getByLabel("Material to retain verbatim", { exact: true }).fill(privateDraft);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const restore = page.getByRole("region", { name: "Portable vault restore", exact: true });
  await restore.getByLabel("Choose archive to review", { exact: true }).setInputFiles({
    name: "synthetic-source-review-restore.coredrill.zip",
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
  await expect(
    page.getByRole("heading", { name: "Reopen local vault after restore", exact: true }),
  ).toBeVisible();
  await expect(flow).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(privateDraft);
  const warning = page.waitForEvent("dialog"),
    reopening = restore.getByRole("button", { name: "Reload local vault", exact: true }).click();
  const dialog = await warning;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.accept();
  await reopening;
  await page.goto(`/network/contacts/${fixture.contactId}?company=${fixture.companyId}`);
  await expect(flow).toHaveCount(0);
  await page.getByRole("button", { name: "Review Email source use", exact: true }).click();
  await expect(flow.getByLabel("Material to retain verbatim", { exact: true })).toHaveValue("");
  await flow.getByRole("button", { name: "Browse retained sources", exact: true }).click();
  await expect(flow).toContainText("No retained sources in this page.");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("source capture rejects DST gaps and requires a fresh explicit occurrence for overlaps", async ({
  page,
  context,
}, testInfo) => {
  const { fixture, external, errors } = await prepareForms(page, context, testInfo);
  await page.goto(`/network/contacts/${fixture.contactId}?company=${fixture.companyId}`);
  await page.getByRole("button", { name: "Review Email source use", exact: true }).click();
  const flow = page.getByRole("region", { name: "Contact source-use review", exact: true });
  await expect(flow.getByText(/Local date helper:/u)).toHaveCount(0);
  await flow.getByLabel("Source class", { exact: true }).selectOption("official_employer_page");
  await flow
    .getByLabel("Source URL", { exact: true })
    .fill("https://synthetic.example/time-review");
  await flow
    .getByLabel("Material to retain verbatim", { exact: true })
    .fill("Synthetic capture-time evidence.");
  await flow.getByLabel("Time zone for date inputs", { exact: true }).fill("America/New_York");
  const captured = flow.getByLabel("Captured at", { exact: true });
  await captured.fill("2026-03-08T02:30");
  const before = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await flow.getByRole("button", { name: "Review source retention", exact: true }).click();
  await expect(
    flow.getByRole("alert").filter({ hasText: "Captured at does not exist" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(before);
  await captured.fill("2025-11-02T01:30");
  const occurrence = flow.getByLabel(/Which occurrence of captured at/u);
  await flow.getByRole("button", { name: "Review source retention", exact: true }).click();
  await expect(flow.getByRole("alert")).toContainText("Choose which occurrence");
  await occurrence.selectOption("earlier");
  await flow.getByRole("button", { name: "Review source retention", exact: true }).click();
  await expect(flow).toContainText("captured at 2025-11-02T05:30:00.000Z");
  await flow.getByRole("button", { name: "Close this action review", exact: true }).click();
  await captured.fill("2025-11-02T01:45");
  await expect(occurrence).toHaveValue("");
  await occurrence.selectOption("later");
  await flow.getByRole("button", { name: "Review source retention", exact: true }).click();
  await expect(flow).toContainText("captured at 2025-11-02T06:45:00.000Z");
  await flow.getByRole("button", { name: "Confirm retain source", exact: true }).click();
  await expect(flow).toContainText("Original action: acknowledged.");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
