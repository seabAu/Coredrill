import {
  DOCUMENT_IR_SPEC_VERSION,
  documentIrToPlainText,
  parseDocumentIr,
  textNode,
  type DocumentBlock,
} from "./document-ir.js";
import {
  assertImportSize,
  documentImportProposalSchema,
  DocumentImportError,
  sha256Hex,
  type DocumentImportProposal,
  type DocumentSourceMapping,
  type LocalDocumentInput,
} from "./import-types.js";

const normalizeLineEndings = (value: string): string =>
  value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");

const parseLine = (line: string): DocumentBlock => {
  const heading = /^(#{1,3})\s+(.+)$/u.exec(line);
  if (heading !== null) {
    const text = heading[2] ?? "";
    return {
      type: "heading",
      attrs: { level: heading[1]?.length as 1 | 2 | 3 },
      content: [textNode(text)],
    };
  }
  const unordered = /^[-*]\s+(.+)$/u.exec(line);
  if (unordered !== null) {
    return {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [textNode(unordered[1] ?? "")] }],
        },
      ],
    };
  }
  const ordered = /^(\d+)\.\s+(.+)$/u.exec(line);
  if (ordered !== null) {
    return {
      type: "orderedList",
      attrs: { start: Number(ordered[1]) },
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [textNode(ordered[2] ?? "")] }],
        },
      ],
    };
  }
  return { type: "paragraph", content: [textNode(line)] };
};

export const importTextDocument = async (
  input: LocalDocumentInput,
): Promise<DocumentImportProposal> => {
  assertImportSize(input.bytes);
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes);
  } catch (error) {
    throw new DocumentImportError("malformed_text", { cause: error });
  }
  if (decoded.includes("\0")) throw new DocumentImportError("malformed_text");

  const lines = normalizeLineEndings(decoded).split("\n");
  const blocks: DocumentBlock[] = [];
  const mappings: DocumentSourceMapping[] = [];
  lines.forEach((line, index) => {
    if (line.length === 0) return;
    const block = parseLine(line);
    const targetIndex = blocks.length;
    blocks.push(block);
    mappings.push({
      targetPath: `/document/content/${String(targetIndex)}`,
      sourcePointer: `/lines/${String(index + 1)}`,
      sourceExcerpt: line.slice(0, 240),
    });
  });

  const structuredDocument = parseDocumentIr({
    specVersion: DOCUMENT_IR_SPEC_VERSION,
    document: { type: "doc", content: blocks },
  });
  const plainText = documentIrToPlainText(structuredDocument);
  return documentImportProposalSchema.parse({
    evidenceStatus: "proposal",
    source: {
      format: "text",
      fileName: input.fileName,
      mediaType: input.mediaType ?? "text/plain;charset=utf-8",
      byteLength: input.bytes.byteLength,
      sha256: await sha256Hex(input.bytes),
    },
    structuredDocument,
    plainText,
    mappings,
    warnings: [],
    summary: { blockCount: blocks.length, characterCount: plainText.length },
  });
};
