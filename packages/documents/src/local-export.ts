import {
  documentIrToPlainText,
  parseDocumentIr,
  type DocumentIntermediateRepresentationV1,
} from "./document-ir.js";
import {
  exportAccessibleDocx,
  sanitizeDocumentFileName,
  type DocumentExportFileExtension,
  type DocumentExportMetadata,
} from "./docx-export.js";
import { sha256Hex } from "./import-types.js";

export const LOCAL_DOCUMENT_EXPORT_FORMATS = Object.freeze(["docx", "pdf", "plain-text"] as const);
export type LocalDocumentExportFormat = (typeof LOCAL_DOCUMENT_EXPORT_FORMATS)[number];

export const LOCAL_DOCUMENT_EXPORT_WARNING_CODES = Object.freeze([
  "pdf_print_settings_control_pagination",
  "plain_text_removes_formatting",
] as const);
export type LocalDocumentExportWarningCode = (typeof LOCAL_DOCUMENT_EXPORT_WARNING_CODES)[number];

export interface LocalDocumentExportWarning {
  readonly code: LocalDocumentExportWarningCode;
  readonly message: string;
}

export interface ImmutableDocumentExportSource {
  readonly documentVersionId: string;
  readonly title: string;
  readonly versionNumber: number;
  readonly versionLabel: string | null;
  readonly createdAt: string;
  readonly contentHash: string;
  readonly content: DocumentIntermediateRepresentationV1;
}

export interface LocalDocumentExportPreview {
  readonly documentVersionId: string;
  readonly title: string;
  readonly versionNumber: number;
  readonly versionLabel: string | null;
  readonly createdAt: string;
  readonly contentHash: string;
  readonly format: LocalDocumentExportFormat;
  readonly fileExtension: DocumentExportFileExtension;
  readonly mediaType: string;
  readonly suggestedFileName: string;
  readonly pageCount: number;
  readonly warnings: readonly LocalDocumentExportWarning[];
  readonly content: DocumentIntermediateRepresentationV1;
}

export interface DownloadableLocalDocumentExport {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly fileExtension: "docx" | "txt";
  readonly suggestedFileName: string;
  readonly sha256: string;
  readonly warnings: readonly LocalDocumentExportWarning[];
}

const FORMAT_DETAILS = Object.freeze({
  docx: Object.freeze({
    extension: "docx" as const,
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }),
  pdf: Object.freeze({ extension: "pdf" as const, mediaType: "application/pdf" }),
  "plain-text": Object.freeze({
    extension: "txt" as const,
    mediaType: "text/plain;charset=utf-8",
  }),
});

const PDF_WARNING: LocalDocumentExportWarning = Object.freeze({
  code: "pdf_print_settings_control_pagination",
  message:
    "PDF pagination can change with the local print dialog's paper size, margins, and scaling.",
});
const TEXT_WARNING: LocalDocumentExportWarning = Object.freeze({
  code: "plain_text_removes_formatting",
  message: "Plain text does not preserve headings, lists, emphasis, or link destinations.",
});

const warningFor = (format: LocalDocumentExportFormat): readonly LocalDocumentExportWarning[] =>
  format === "pdf"
    ? Object.freeze([PDF_WARNING])
    : format === "plain-text"
      ? Object.freeze([TEXT_WARNING])
      : Object.freeze([]);

const pageCountFor = (content: DocumentIntermediateRepresentationV1): number =>
  Math.max(1, Math.ceil(documentIrToPlainText(content).length / 3_200));

const safeVersionToken = (documentVersionId: string): string => {
  const token = documentVersionId.replaceAll(/[^a-z0-9]/giu, "").toLowerCase();
  return token.length === 0 ? "version" : token;
};

export const createCollisionSafeDocumentFileName = (
  source: Pick<ImmutableDocumentExportSource, "documentVersionId" | "title" | "versionNumber">,
  format: LocalDocumentExportFormat,
  requestedBaseName?: string,
): string => {
  const details = FORMAT_DETAILS[format];
  const requested = requestedBaseName?.trim();
  const base = requested === undefined || requested.length === 0 ? source.title : requested;
  const suffix = `v${String(source.versionNumber)}-${safeVersionToken(source.documentVersionId)}`;
  const sanitizedBase = sanitizeDocumentFileName(base, details.extension).slice(
    0,
    -(details.extension.length + 1),
  );
  const reservedBaseLength = Math.max(1, 96 - suffix.length - 1);
  return sanitizeDocumentFileName(
    `${sanitizedBase.slice(0, reservedBaseLength)}-${suffix}`,
    details.extension,
  );
};

export const createLocalDocumentExportPreview = (
  source: ImmutableDocumentExportSource,
  format: LocalDocumentExportFormat,
  requestedBaseName?: string,
): LocalDocumentExportPreview => {
  const content = parseDocumentIr(source.content);
  const details = FORMAT_DETAILS[format];
  return Object.freeze({
    ...source,
    content,
    format,
    fileExtension: details.extension,
    mediaType: details.mediaType,
    suggestedFileName: createCollisionSafeDocumentFileName(source, format, requestedBaseName),
    pageCount: pageCountFor(content),
    warnings: warningFor(format),
  });
};

const publicMetadata = (preview: LocalDocumentExportPreview): DocumentExportMetadata =>
  Object.freeze({
    title: preview.title,
    suggestedFileName: preview.suggestedFileName,
    creator: "Coredrill",
    description: "Locally generated job application document.",
    language: "en-US",
  });

export const exportDownloadableLocalDocument = async (
  preview: LocalDocumentExportPreview,
): Promise<DownloadableLocalDocumentExport> => {
  if (preview.format === "pdf") {
    throw new TypeError("PDF export uses the local semantic print workflow.");
  }
  if (preview.format === "docx") {
    const exported = await exportAccessibleDocx(preview.content, publicMetadata(preview));
    return Object.freeze({ ...exported, warnings: preview.warnings });
  }
  const bytes = new TextEncoder().encode(documentIrToPlainText(preview.content));
  return Object.freeze({
    bytes,
    mediaType: preview.mediaType,
    fileExtension: "txt",
    suggestedFileName: preview.suggestedFileName,
    sha256: await sha256Hex(bytes),
    warnings: preview.warnings,
  });
};
