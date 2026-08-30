import { writeFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const openCleanShell = async (page) => {
  await page.goto("/app-shell.html");
  await page.waitForFunction(
    () =>
      globalThis.coredrillAppShell !== undefined &&
      globalThis.coredrillExtensionInbox !== undefined &&
      globalThis.coredrillStorageSpike !== undefined,
  );
  await page.evaluate(async () => {
    await globalThis.coredrillStorageSpike.delete();
    await globalThis.coredrillStorageSpike.openAndMigrate();
  });
};

const openCapture = async (page, actionName) => {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: actionName }).click();
  return page.getByRole("dialog");
};

const storeCurrentCapture = async (dialog) => {
  await dialog.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    /Stored in the local capture inbox|durable inbox receipt/u,
    {
      timeout: 30_000,
    },
  );
};

const closeCapture = async (dialog) => {
  await dialog.getByRole("button", { name: "Close capture dialog" }).click();
  await expect(dialog).toBeHidden();
};

const receipts = (page) =>
  page.evaluate(async () => {
    const stored = await globalThis.coredrillExtensionInbox.listReceipts();
    return stored.map((receipt) => ({ ...receipt, envelope: JSON.parse(receipt.envelopeJson) }));
  });

const attachAxe = async (page, testInfo, name) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  const output = testInfo.outputPath(`${name}-axe.json`);
  await writeFile(output, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  await testInfo.attach(`${name}-axe.json`, { path: output, contentType: "application/json" });
};

test("manual, pasted text, and pasted URL captures stay local and enter the durable inbox", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await openCleanShell(page);

  let dialog = await openCapture(page, /Add job/u);
  await expect(dialog).toHaveAttribute("data-capture-mode", "manual");
  await dialog.getByLabel(/Job title/u).fill("Staff Accessibility Engineer");
  await dialog.getByLabel(/Company/u).fill("Northstar Cooperative");
  await dialog.getByLabel(/Source URL/u).fill("https://jobs.example.test/openings/7#apply");
  await dialog.getByLabel(/Notes or listing details/u).fill("Build resilient local-first tools.");
  await storeCurrentCapture(dialog);
  await closeCapture(dialog);

  dialog = await openCapture(page, /Paste listing/u);
  await expect(dialog).toHaveAttribute("data-capture-mode", "paste");
  await dialog
    .getByLabel(/Pasted listing text or URL/u)
    .fill("Research Engineer\nDesign transparent retrieval evaluations and document every source.");
  await storeCurrentCapture(dialog);
  await closeCapture(dialog);

  dialog = await openCapture(page, /Paste listing/u);
  await dialog
    .getByLabel(/Pasted listing text or URL/u)
    .fill("https://careers.example.test/jobs/remote-role#details");
  await storeCurrentCapture(dialog);
  await attachAxe(page, testInfo, "supplied-capture-paste-url");
  await closeCapture(dialog);

  const stored = await receipts(page);
  expect(stored).toHaveLength(3);
  expect(stored.map(({ receivedVia }) => receivedVia)).toEqual([
    "manual_export",
    "manual_export",
    "manual_export",
  ]);
  expect(stored.map(({ envelope }) => envelope.captureMethod)).toEqual([
    "manual",
    "paste",
    "paste",
  ]);
  expect(stored.map(({ envelope }) => envelope.source.sourceKind)).toEqual([
    "manual_entry",
    "pasted_listing",
    "pasted_listing",
  ]);
  expect(stored[0].envelope.source.url).toBe("https://jobs.example.test/openings/7");
  expect(stored[0].envelope.fieldCandidates).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fieldName: "title",
        value: "Staff Accessibility Engineer",
        provenance: expect.objectContaining({
          method: "user",
          source: expect.objectContaining({ sourceId: stored[0].envelope.id }),
        }),
      }),
    ]),
  );
  expect(stored[1].envelope.content.readableText).toContain("transparent retrieval evaluations");
  expect(stored[2].envelope.source).toMatchObject({
    url: "https://careers.example.test/jobs/remote-role",
    canonicalUrl: "https://careers.example.test/jobs/remote-role",
  });
  expect(stored[2].envelope.content).toEqual({});
  expect(externalRequests).toEqual([]);

  await page.reload();
  await page.waitForFunction(() => globalThis.coredrillExtensionInbox !== undefined);
  await expect.poll(async () => (await receipts(page)).length).toBe(3);
});

test("saved HTML, text, and JSON captures are bounded, inert, validated, and durable", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4178/")) externalRequests.push(request.url());
  });
  await openCleanShell(page);

  let dialog = await openCapture(page, /Paste listing/u);
  await dialog.getByRole("button", { name: "Saved file" }).click();
  await dialog.getByLabel(/Saved HTML/u).setInputFiles({
    name: "hostile-listing.html",
    mimeType: "text/html",
    buffer: Buffer.from(
      '<!doctype html><title>Hostile fixture</title><script>globalThis.__captureScriptRan=true</script><style>body{display:none}</style><h1>Security Engineer</h1><p>SecureCo</p><img src="https://tracker.invalid/pixel">',
    ),
  });
  await storeCurrentCapture(dialog);
  await closeCapture(dialog);

  dialog = await openCapture(page, /Paste listing/u);
  await dialog.getByRole("button", { name: "Saved file" }).click();
  await dialog.getByLabel(/Saved HTML/u).setInputFiles({
    name: "listing.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Product Operations Lead\nCoordinate a distributed hiring program."),
  });
  await storeCurrentCapture(dialog);
  await closeCapture(dialog);

  dialog = await openCapture(page, /Paste listing/u);
  await dialog.getByRole("button", { name: "Saved file" }).click();
  await dialog.getByLabel(/Saved HTML/u).setInputFiles({
    name: "listing.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ title: "Data Platform Engineer", company: "Fixture Labs", remote: true }),
    ),
  });
  await storeCurrentCapture(dialog);
  await attachAxe(page, testInfo, "supplied-capture-json-stored");
  await closeCapture(dialog);

  dialog = await openCapture(page, /Paste listing/u);
  await dialog.getByRole("button", { name: "Saved file" }).click();
  await dialog.getByLabel(/Saved HTML/u).setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"title":'),
  });
  await dialog.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(dialog.getByRole("status")).toContainText("not valid JSON");
  await closeCapture(dialog);

  const stored = await receipts(page);
  expect(stored).toHaveLength(3);
  expect(stored.map(({ envelope }) => envelope.source.sourceKind)).toEqual([
    "saved_html",
    "saved_text",
    "saved_json",
  ]);
  expect(stored[0].envelope.content).toEqual({
    readableText: "Security Engineer SecureCo",
  });
  expect(stored[0].envelope.content.sanitizedHtml).toBeUndefined();
  expect(stored[1].envelope.content.readableText).toContain("distributed hiring program");
  expect(stored[2].envelope.content.apiPayload).toEqual({
    title: "Data Platform Engineer",
    company: "Fixture Labs",
    remote: true,
  });
  expect(await page.evaluate(() => globalThis.__captureScriptRan)).toBeUndefined();
  expect(externalRequests).toEqual([]);

  const diagnostics = await page.evaluate(() => globalThis.coredrillStorageSpike.diagnostics());
  expect(diagnostics).toMatchObject({ schemaVersion: 92 });
  console.info(
    `CAP003_PROOF ${JSON.stringify({
      schemaVersion: diagnostics.schemaVersion,
      manual: true,
      pastedText: true,
      pastedUrlWithoutFetch: true,
      savedHtmlAsInertText: true,
      savedText: true,
      savedJson: true,
      invalidJsonRejected: true,
      durableReceipts: stored.length,
      externalRequests: externalRequests.length,
    })}`,
  );
});
