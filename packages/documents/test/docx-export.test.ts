import { describe, expect, it } from "vitest";

import { parseDocumentIr } from "../src/document-ir.js";
import { exportAccessibleDocx, sanitizeDocumentFileName } from "../src/export.js";
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
  });
});
