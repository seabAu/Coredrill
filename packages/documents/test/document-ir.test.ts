import { describe, expect, it } from "vitest";

import generatedSchemaFixture from "../schemas/document-ir.v1.schema.json" with { type: "json" };
import {
  DOCUMENT_IR_LIMITS,
  DOCUMENT_IR_SPEC_VERSION,
  DOCUMENT_IR_V1_SCHEMA_ID,
  documentIntermediateRepresentationV1Schema,
  documentIrToPlainText,
  documentIrV1JsonSchema,
  isSafeDocumentLink,
  parseDocumentIr,
} from "../src/index.js";
import validFixture from "./fixtures/document-ir.v1.valid.json" with { type: "json" };

describe("DocumentIntermediateRepresentationV1", () => {
  it("publishes a versioned schema that matches the checked-in artifact", () => {
    expect(documentIrV1JsonSchema).toEqual(generatedSchemaFixture);
    expect(documentIrV1JsonSchema.$id).toBe(DOCUMENT_IR_V1_SCHEMA_ID);
    expect(documentIrV1JsonSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(DOCUMENT_IR_SPEC_VERSION).toBe(1);
  });

  it("round-trips the canonical fixture deterministically", () => {
    const parsed = parseDocumentIr(validFixture);
    expect(parsed).toEqual(validFixture);
    expect(parseDocumentIr(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    expect(documentIrToPlainText(parsed)).toContain("accessible local-first workflow");
  });

  it("normalizes adjacent text nodes and mark order", () => {
    const parsed = parseDocumentIr({
      specVersion: 1,
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "A", marks: [{ type: "italic" }, { type: "bold" }] },
              { type: "text", text: "B", marks: [{ type: "bold" }, { type: "italic" }] },
            ],
          },
        ],
      },
    });
    expect(parsed.document.content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "AB", marks: [{ type: "bold" }, { type: "italic" }] }],
    });
  });

  it("rejects unsupported blocks, unsafe links, depth, and content limits", () => {
    expect(() =>
      documentIntermediateRepresentationV1Schema.parse({
        specVersion: 1,
        document: { type: "doc", content: [{ type: "image", attrs: { src: "x" } }] },
      }),
    ).toThrow();
    expect(() =>
      documentIntermediateRepresentationV1Schema.parse({
        specVersion: 1,
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "unsafe",
                  marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
                },
              ],
            },
          ],
        },
      }),
    ).toThrow(/Unsafe link URI/u);
    expect(() =>
      documentIntermediateRepresentationV1Schema.parse({
        specVersion: 1,
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "x".repeat(DOCUMENT_IR_LIMITS.maxTextNodeCharacters + 1) },
              ],
            },
          ],
        },
      }),
    ).toThrow();
  });

  it("permits only explicit safe link protocols", () => {
    expect(isSafeDocumentLink("https://example.test/path")).toBe(true);
    expect(isSafeDocumentLink("mailto:jobs@example.test")).toBe(true);
    expect(isSafeDocumentLink("data:text/html,test")).toBe(false);
    expect(isSafeDocumentLink("//example.test/path")).toBe(false);
  });
});
