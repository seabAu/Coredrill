import { describe, expect, it } from "vitest";

import { DOCUMENT_IMPORT_LIMITS, importTextDocument } from "../src/index.js";

describe("local text import", () => {
  it("returns a source-mapped unconfirmed proposal", async () => {
    const result = await importTextDocument({
      bytes: new TextEncoder().encode("# Profile\nLocal-first work\n- Evidence-backed decisions"),
      fileName: "profile.md",
      mediaType: "text/markdown",
    });

    expect(result.evidenceStatus).toBe("proposal");
    expect(result.source).toMatchObject({ format: "text", fileName: "profile.md" });
    expect(result.source.sha256).toMatch(/^[a-f\d]{64}$/u);
    expect(result.structuredDocument.document.content.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "bulletList",
    ]);
    expect(result.mappings).toEqual([
      {
        targetPath: "/document/content/0",
        sourcePointer: "/lines/1",
        sourceExcerpt: "# Profile",
      },
      {
        targetPath: "/document/content/1",
        sourcePointer: "/lines/2",
        sourceExcerpt: "Local-first work",
      },
      {
        targetPath: "/document/content/2",
        sourcePointer: "/lines/3",
        sourceExcerpt: "- Evidence-backed decisions",
      },
    ]);
  });

  it("returns stable actionable failures for malformed and oversized input", async () => {
    await expect(
      importTextDocument({ bytes: Uint8Array.from([0xff]), fileName: "bad.txt" }),
    ).rejects.toMatchObject({
      code: "malformed_text",
      message: "This text file is not valid UTF-8. Save it as UTF-8 and try again.",
    });
    await expect(
      importTextDocument({
        bytes: new Uint8Array(DOCUMENT_IMPORT_LIMITS.maxBytes + 1),
        fileName: "large.txt",
      }),
    ).rejects.toMatchObject({ code: "too_large" });
  });
});
