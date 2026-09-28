import { describe, expect, it } from "vitest";

import { parseDocumentIr } from "../src/document-ir.js";
import {
  createLocalDocumentExportPreview,
  exportAccessibleDocx,
  exportDownloadableLocalDocument,
  sanitizeDocumentFileName,
} from "../src/export.js";
import validFixture from "./fixtures/document-ir.v1.valid.json" with { type: "json" };

describe("accessible DOCX export", () => {
  it("creates a non-empty local OOXML package with a digest and safe name", async () => {
    const result = await exportAccessibleDocx(parseDocumentIr(validFixture), {
      title: "Jordan Rivera resume",
      suggestedFileName: "Jordan: Rivera?.pdf",
      creator: "Coredrill test",
      language: "en-US",
    });

    expect(result.mediaType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(result.suggestedFileName).toBe("Jordan- Rivera-.docx");
    expect(Array.from(result.bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(result.bytes.byteLength).toBeGreaterThan(5_000);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("replaces empty and Windows-reserved names", () => {
    expect(sanitizeDocumentFileName("CON.docx", "docx")).toBe("coredrill-document.docx");
    expect(sanitizeDocumentFileName("  ...  ", "pdf")).toBe("coredrill-document.pdf");
    expect(sanitizeDocumentFileName("resume.pdf", "pdf")).toBe("resume.pdf");
    expect(sanitizeDocumentFileName("resume.txt", "txt")).toBe("resume.txt");
  });

  it("prepares collision-safe immutable-version previews and downloadable text", async () => {
    const source = {
      documentVersionId: "0199c200-0000-7000-8000-00000000abcd",
      title: "Northstar resume",
      versionNumber: 3,
      versionLabel: "Reviewed",
      createdAt: "2026-09-28T12:00:00.000Z",
      contentHash: "a".repeat(64),
      content: parseDocumentIr(validFixture),
    };
    const textPreview = createLocalDocumentExportPreview(source, "plain-text", "Northstar: Final");
    expect(textPreview.suggestedFileName).toBe(
      "Northstar- Final-v3-0199c20000007000800000000000abcd.txt",
    );
    expect(textPreview.warnings.map(({ code }) => code)).toEqual(["plain_text_removes_formatting"]);

    const textExport = await exportDownloadableLocalDocument(textPreview);
    expect(new TextDecoder().decode(textExport.bytes)).toContain("Jordan Rivera");
    expect(textExport.sha256).toMatch(/^[a-f0-9]{64}$/u);

    const pdfPreview = createLocalDocumentExportPreview(source, "pdf");
    expect(pdfPreview.suggestedFileName).toBe(
      "Northstar resume-v3-0199c20000007000800000000000abcd.pdf",
    );
    expect(pdfPreview.warnings.map(({ code }) => code)).toEqual([
      "pdf_print_settings_control_pagination",
    ]);
    expect(
      createLocalDocumentExportPreview(source, "docx", "x".repeat(200)).suggestedFileName,
    ).toMatch(/-v3-0199c20000007000800000000000abcd\.docx$/u);
    await expect(exportDownloadableLocalDocument(pdfPreview)).rejects.toThrow(
      "PDF export uses the local semantic print workflow.",
    );
  });
});
