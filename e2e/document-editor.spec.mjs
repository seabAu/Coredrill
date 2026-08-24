import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

const repositoryRoot = process.cwd();
const importGoldens = JSON.parse(
  await readFile(path.join(repositoryRoot, "fixtures", "imports", "expected-imports.json"), "utf8"),
);

const callHarness = (page, method, argument) =>
  page.evaluate(
    async ({ methodName, value }) => {
      const harness = globalThis.coredrillDocumentSpike;
      if (harness === undefined) throw new Error("Document verification harness is unavailable.");
      return value === undefined ? harness[methodName]() : harness[methodName](value);
    },
    { methodName: method, value: argument },
  );

const openHarness = async (page) => {
  await page.goto("/document-spike.html");
  await expect(page.getByRole("status")).toHaveText("Document harness ready");
  await page.waitForFunction(() => globalThis.coredrillDocumentSpike !== undefined);
};

const importFixture = async (page, fileName, mediaType) => {
  const bytes = await readFile(path.join(repositoryRoot, "fixtures", "imports", fileName));
  return callHarness(page, "importDocument", {
    bytes: [...bytes],
    fileName,
    mediaType,
  });
};

const importFailure = (page, input) =>
  page.evaluate(async (value) => {
    try {
      await globalThis.coredrillDocumentSpike.importDocument(value);
      return { imported: true };
    } catch (error) {
      return {
        imported: false,
        code:
          error !== null && typeof error === "object" && "code" in error
            ? String(error.code)
            : undefined,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }, input);

test("edits locally and preserves undo/redo history", async ({ page }) => {
  await openHarness(page);
  const editor = page.locator(".tiptap");
  await editor.click();
  await page.keyboard.type("Coredrill local draft");
  await expect(editor).toContainText("Coredrill local draft");
  await page.keyboard.press("Control+Z");
  await expect(editor).not.toContainText("Coredrill local draft");
  await page.keyboard.press("Control+Shift+Z");
  await expect(editor).toContainText("Coredrill local draft");
});

test("exposes a keyboard and screen-reader-facing editor contract", async ({ page }) => {
  await openHarness(page);
  await page.keyboard.press("Tab");
  const editor = page.getByRole("textbox", { name: "Document content editor" });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveAttribute("aria-multiline", "true");
  await expect(editor).toHaveAttribute("aria-describedby", "editor-help");
  await page.keyboard.type("Accessible keyboard draft");
  await page.keyboard.press("Control+Alt+1");
  await expect(callHarness(page, "getDocument")).resolves.toMatchObject({
    document: { content: [{ type: "heading", attrs: { level: 1 } }] },
  });
  await page.keyboard.press("Control+Z");
  await page.keyboard.press("Control+Shift+Z");
  await expect(editor).toContainText("Accessible keyboard draft");
});

test("sanitizes hostile pasted HTML through the restricted editor schema", async ({ page }) => {
  await openHarness(page);
  await callHarness(page, "reset");
  await page.locator(".tiptap").click();
  await page.evaluate(() => {
    const clipboard = new DataTransfer();
    clipboard.setData(
      "text/html",
      '<div onclick="alert(1)"><p><strong>Safe evidence</strong><script>alert(2)</script><a href="javascript:alert(3)">bad link</a><img src="https://example.test/tracker.png"></p><table><tr><td>table text</td></tr></table></div>',
    );
    clipboard.setData("text/plain", "Safe evidence bad link table text");
    const target = document.querySelector(".tiptap");
    if (target === null) throw new Error("Editor target unavailable.");
    target.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }),
    );
  });
  const result = await callHarness(page, "getDocument");
  const rendered = await page.locator(".tiptap").innerHTML();
  expect(JSON.stringify(result)).toContain("Safe evidence");
  expect(rendered).not.toMatch(/<(?:script|img|table)|onclick|javascript:/iu);
  expect(JSON.stringify(result)).not.toMatch(/"type":"(?:image|table)"|javascript:/iu);
});

test("round-trips the versioned IR without drift", async ({ page }) => {
  await openHarness(page);
  const fixture = JSON.parse(
    await readFile(
      path.join(
        repositoryRoot,
        "packages",
        "documents",
        "test",
        "fixtures",
        "document-ir.v1.valid.json",
      ),
      "utf8",
    ),
  );
  await callHarness(page, "setDocument", fixture);
  await expect(callHarness(page, "getDocument")).resolves.toEqual(fixture);
});

test("edits a synthetic 100-page document within the diagnostic budget", async ({
  page,
}, testInfo) => {
  await openHarness(page);
  const result = await callHarness(page, "runStressProbe", 100);
  expect(result).toMatchObject({ pageCount: 100, blockCount: 2_100 });
  expect(result.characterCount).toBeGreaterThan(100_000);
  expect(result.loadMilliseconds).toBeLessThan(5_000);
  expect(result.editMilliseconds).toBeLessThan(500);
  await testInfo.attach("document-editor-benchmark.json", {
    body: Buffer.from(`${JSON.stringify(result, null, 2)}\n`),
    contentType: "application/json",
  });
});

test("imports DOCX as a source-mapped unconfirmed proposal", async ({ page }) => {
  await openHarness(page);
  const result = await importFixture(
    page,
    "synthetic-resume.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  expect(result).toMatchObject({
    evidenceStatus: "proposal",
    source: { format: "docx", fileName: "synthetic-resume.docx" },
  });
  expect(result.plainText).toContain("Jordan Rivera");
  expect(result.plainText).toContain("Reduced research turnaround by 42%");
  expect(result.mappings[0]).toMatchObject(importGoldens.docx.firstMapping);
  expect(result.structuredDocument.document.content.map((block) => block.type)).toEqual(
    importGoldens.docx.blockTypes,
  );
});

test("imports text PDFs with page mappings and flags scanned PDFs without implicit OCR", async ({
  page,
}) => {
  await openHarness(page);
  const textPdf = await importFixture(page, "synthetic-two-page.pdf", "application/pdf");
  expect(textPdf).toMatchObject({
    evidenceStatus: "proposal",
    source: { format: "pdf" },
    summary: { pageCount: 2 },
  });
  expect(textPdf.plainText).toContain("Page one evidence line.");
  expect(textPdf.plainText).toContain("Page two salary source line.");
  expect(textPdf.mappings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sourcePointer: expect.stringMatching(/^\/pages\/1\/lines\//u) }),
      expect.objectContaining({ sourcePointer: expect.stringMatching(/^\/pages\/2\/lines\//u) }),
    ]),
  );

  const scanned = await importFixture(page, "synthetic-scanned.pdf", "application/pdf");
  expect(scanned.plainText).toBe("");
  expect(scanned.mappings).toEqual([]);
  expect(scanned.warnings).toEqual([importGoldens.scannedPdf.warning]);

  const text = await importFixture(page, "synthetic-profile.md", "text/markdown");
  expect(text.structuredDocument.document.content.map((block) => block.type)).toEqual(
    importGoldens.text.blockTypes,
  );
  expect(text.mappings.map((mapping) => mapping.sourcePointer)).toEqual(
    importGoldens.text.sourcePointers,
  );
});

test("returns stable actionable failures for mismatched and corrupt binaries", async ({ page }) => {
  await openHarness(page);
  await expect(
    importFailure(page, {
      bytes: [...new TextEncoder().encode("not a pdf")],
      fileName: "mismatch.pdf",
      mediaType: "application/pdf",
    }),
  ).resolves.toMatchObject({
    imported: false,
    code: "signature_mismatch",
    message: "The file contents do not match the selected document type.",
  });
  await expect(
    importFailure(page, {
      bytes: [0x50, 0x4b, 0x03, 0x04, 0x00],
      fileName: "corrupt.docx",
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  ).resolves.toMatchObject({
    imported: false,
    code: "corrupt_file",
    message: "This file could not be read. Choose an intact local file and try again.",
  });
  await expect(
    importFailure(page, {
      bytes: [1, 2, 3],
      fileName: "unsupported.rtf",
      mediaType: "application/rtf",
    }),
  ).resolves.toMatchObject({
    imported: false,
    code: "unsupported_format",
    message: "Choose a local DOCX, PDF, Markdown, or plain-text file.",
  });
});

test("exports accessible DOCX and tagged print-PDF artifacts", async ({ page }, testInfo) => {
  await openHarness(page);
  const fixture = JSON.parse(
    await readFile(
      path.join(
        repositoryRoot,
        "packages",
        "documents",
        "test",
        "fixtures",
        "document-ir.v1.valid.json",
      ),
      "utf8",
    ),
  );
  await callHarness(page, "setDocument", fixture);
  const docx = await callHarness(page, "exportDocx", {
    title: "Jordan Rivera Accessible Resume",
    suggestedFileName: "Jordan Rivera: Coredrill Resume.docx",
    creator: "Coredrill test suite",
    description: "Synthetic accessible resume export fixture.",
    language: "en-US",
  });
  expect(docx).toMatchObject({
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fileExtension: "docx",
    suggestedFileName: "Jordan Rivera- Coredrill Resume.docx",
  });
  expect(docx.sha256).toMatch(/^[a-f\d]{64}$/u);
  expect(docx.bytes.slice(0, 2)).toEqual([0x50, 0x4b]);

  const docxPath = testInfo.outputPath("accessible-resume.docx");
  await writeFile(docxPath, Buffer.from(docx.bytes));
  await callHarness(page, "preparePrintPreview", {
    title: "Jordan Rivera Accessible Resume",
    language: "en-US",
  });
  await expect(page.locator("#print-preview article[lang='en-US']")).toHaveCount(1);
  await expect(page.locator("#print-preview h1")).toHaveText("Jordan Rivera");
  await expect(page.locator("#print-preview ul")).toHaveCount(1);
  await expect(page.locator("#print-preview a[href='https://example.test/portfolio']")).toHaveText(
    "Portfolio",
  );

  const pdfPath = testInfo.outputPath("accessible-resume.pdf");
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: pdfPath,
    format: "Letter",
    preferCSSPageSize: true,
    printBackground: true,
    tagged: true,
    outline: true,
  });
  const pdfBytes = await readFile(pdfPath);
  const pdfSyntax = pdfBytes.toString("latin1");
  expect(pdfBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(pdfSyntax).toContain("/StructTreeRoot");
  expect(pdfSyntax).toMatch(/\/Marked\s+true/u);

  if (process.env["COREDRILL_WRITE_EXPORT_FIXTURES"] === "1") {
    const fixtureDirectory = path.join(repositoryRoot, "fixtures", "exports");
    await mkdir(fixtureDirectory, { recursive: true });
    await writeFile(path.join(fixtureDirectory, "accessible-resume.docx"), Buffer.from(docx.bytes));
    await writeFile(path.join(fixtureDirectory, "accessible-resume.pdf"), pdfBytes);
  }

  await testInfo.attach("accessible-resume.docx", {
    path: docxPath,
    contentType: docx.mediaType,
  });
  await testInfo.attach("accessible-resume.pdf", {
    path: pdfPath,
    contentType: "application/pdf",
  });
});
