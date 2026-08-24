import { z } from "zod";

import { documentIntermediateRepresentationV1Schema } from "./document-ir.js";

export const DOCUMENT_IMPORT_LIMITS = Object.freeze({
  maxBytes: 10 * 1024 * 1024,
  maxPages: 500,
  maxSourceExcerptCharacters: 240,
});

export type DocumentImportFormat = "docx" | "pdf" | "text";

export const documentSourceMappingSchema = z.strictObject({
  targetPath: z.string().min(1).max(200),
  sourcePointer: z.string().min(1).max(300),
  sourceExcerpt: z.string().max(DOCUMENT_IMPORT_LIMITS.maxSourceExcerptCharacters),
});

export const documentImportWarningSchema = z.strictObject({
  code: z.enum(["formatting_omitted", "unsafe_link_removed", "scanned_pdf", "empty_block_omitted"]),
  message: z.string().min(1).max(500),
});

export const documentImportProposalSchema = z.strictObject({
  evidenceStatus: z.literal("proposal"),
  source: z.strictObject({
    format: z.enum(["docx", "pdf", "text"]),
    fileName: z.string().min(1).max(255),
    mediaType: z.string().min(1).max(120),
    byteLength: z.number().int().min(1).max(DOCUMENT_IMPORT_LIMITS.maxBytes),
    sha256: z.string().regex(/^[a-f\d]{64}$/u),
  }),
  structuredDocument: documentIntermediateRepresentationV1Schema,
  plainText: z.string(),
  mappings: z.array(documentSourceMappingSchema),
  warnings: z.array(documentImportWarningSchema),
  summary: z.strictObject({
    blockCount: z.number().int().min(0),
    characterCount: z.number().int().min(0),
    pageCount: z.number().int().min(0).optional(),
  }),
});

export type DocumentImportProposal = z.infer<typeof documentImportProposalSchema>;
export type DocumentImportWarning = z.infer<typeof documentImportWarningSchema>;
export type DocumentSourceMapping = z.infer<typeof documentSourceMappingSchema>;

export type DocumentImportErrorCode =
  | "corrupt_file"
  | "encrypted_pdf"
  | "import_runtime_unavailable"
  | "malformed_text"
  | "signature_mismatch"
  | "too_large"
  | "too_many_pages"
  | "unsupported_format";

const errorMessages: Readonly<Record<DocumentImportErrorCode, string>> = Object.freeze({
  corrupt_file: "This file could not be read. Choose an intact local file and try again.",
  encrypted_pdf: "This PDF is password-protected. Save an unlocked local copy before importing it.",
  import_runtime_unavailable: "Local document import is unavailable in this browser session.",
  malformed_text: "This text file is not valid UTF-8. Save it as UTF-8 and try again.",
  signature_mismatch: "The file contents do not match the selected document type.",
  too_large: `This file exceeds the ${String(DOCUMENT_IMPORT_LIMITS.maxBytes / 1024 / 1024)} MiB local import limit.`,
  too_many_pages: `This PDF exceeds the ${String(DOCUMENT_IMPORT_LIMITS.maxPages)}-page local import limit.`,
  unsupported_format: "Choose a local DOCX, PDF, Markdown, or plain-text file.",
});

export class DocumentImportError extends Error {
  readonly code: DocumentImportErrorCode;

  constructor(code: DocumentImportErrorCode, options?: ErrorOptions) {
    super(errorMessages[code], options);
    this.name = "DocumentImportError";
    this.code = code;
  }
}

export interface LocalDocumentInput {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mediaType?: string;
}

export const assertImportSize = (bytes: Uint8Array): void => {
  if (bytes.byteLength === 0) throw new DocumentImportError("corrupt_file");
  if (bytes.byteLength > DOCUMENT_IMPORT_LIMITS.maxBytes) {
    throw new DocumentImportError("too_large");
  }
};

export const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
