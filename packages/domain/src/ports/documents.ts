import type { EntityId } from "../identifiers.js";
import type { PortRequestContext, PortWarning } from "./context.js";

export const DOCUMENT_IMPORT_FORMATS = ["pdf", "docx", "markdown", "plain-text"] as const;
export const DOCUMENT_EXPORT_FORMATS = ["pdf", "docx", "markdown", "plain-text"] as const;

export type DocumentImportFormat = (typeof DOCUMENT_IMPORT_FORMATS)[number];
export type DocumentExportFormat = (typeof DOCUMENT_EXPORT_FORMATS)[number];

export interface DocumentImportRequest {
  readonly format: DocumentImportFormat;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly context: PortRequestContext;
}

export interface ImportedDocumentPage {
  readonly page: number;
  readonly text: string;
}

export interface DocumentImportResult {
  /** Imported facts remain proposals until the user confirms them. */
  readonly evidenceStatus: "proposal";
  readonly plainText: string;
  readonly pages: readonly ImportedDocumentPage[];
  readonly warnings: readonly PortWarning[];
}

export type CanonicalDocumentBlock =
  | { readonly kind: "heading"; readonly text: string; readonly level: 1 | 2 | 3 }
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "list-item"; readonly text: string };

export interface DocumentExportRequest {
  readonly documentVersionId: EntityId<"document-version">;
  readonly title: string;
  readonly blocks: readonly CanonicalDocumentBlock[];
  readonly format: DocumentExportFormat;
  readonly suggestedFileName: string;
  readonly context: PortRequestContext;
}

export interface DocumentExportResult {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly fileExtension: string;
  readonly sha256: string;
  readonly warnings: readonly PortWarning[];
}

/** Local import/export conversion boundary; immutable document versions remain application data. */
export interface DocumentPort {
  importDocument(request: DocumentImportRequest): Promise<DocumentImportResult>;
  exportDocument(request: DocumentExportRequest): Promise<DocumentExportResult>;
}
