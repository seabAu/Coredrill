import {
  importLocalDocument,
  type DocumentImportProposal,
  type LocalDocumentInput,
} from "@coredrill/documents/browser";
import {
  createRestrictedDocumentEditor,
  getDocumentIr,
  setDocumentIr,
} from "@coredrill/documents/editor";
import {
  exportAccessibleDocx,
  renderAccessiblePrintDocument,
  type DocumentExportMetadata,
} from "@coredrill/documents/export";
import {
  DOCUMENT_IR_SPEC_VERSION,
  parseDocumentIr,
  type DocumentIntermediateRepresentationV1,
} from "@coredrill/documents";

export interface DocumentStressResult {
  readonly pageCount: number;
  readonly blockCount: number;
  readonly characterCount: number;
  readonly loadMilliseconds: number;
  readonly editMilliseconds: number;
}

export interface CoredrillDocumentSpikeApi {
  getDocument(): DocumentIntermediateRepresentationV1;
  setDocument(document: DocumentIntermediateRepresentationV1): void;
  reset(): void;
  importDocument(input: LocalDocumentInput): Promise<DocumentImportProposal>;
  exportDocx(metadata: DocumentExportMetadata): Promise<{
    readonly bytes: readonly number[];
    readonly mediaType: string;
    readonly fileExtension: "docx";
    readonly suggestedFileName: string;
    readonly sha256: string;
  }>;
  preparePrintPreview(options: { readonly title: string; readonly language?: string }): void;
  runStressProbe(pageCount?: number): DocumentStressResult;
}

declare global {
  var coredrillDocumentSpike: CoredrillDocumentSpikeApi;
}

const editorElement = document.querySelector<HTMLElement>("#editor");
const statusElement = document.querySelector<HTMLElement>("#status");
const printPreviewElement = document.querySelector<HTMLElement>("#print-preview");
if (editorElement === null) throw new Error("Document editor mount point is unavailable.");
if (printPreviewElement === null) throw new Error("Document print preview is unavailable.");

const setStatus = (value: string): void => {
  if (statusElement !== null) statusElement.textContent = value;
};

const editor = createRestrictedDocumentEditor({
  element: editorElement,
  onUpdate: () => {
    setStatus("Document changed locally");
  },
});

const emptyDocument = (): DocumentIntermediateRepresentationV1 =>
  parseDocumentIr({
    specVersion: DOCUMENT_IR_SPEC_VERSION,
    document: { type: "doc", content: [{ type: "paragraph" }] },
  });

const setDocument = (document: DocumentIntermediateRepresentationV1): void => {
  const parsed = parseDocumentIr(document);
  setDocumentIr(editor, parsed);
  setStatus("Document loaded locally");
};

globalThis.coredrillDocumentSpike = Object.freeze({
  getDocument: () => getDocumentIr(editor),
  setDocument,
  reset: () => {
    setDocument(emptyDocument());
  },
  importDocument: async (input: LocalDocumentInput) => {
    const result = await importLocalDocument({
      ...input,
      bytes: Uint8Array.from(input.bytes),
    });
    setStatus(`Imported ${result.source.format.toUpperCase()} as an unconfirmed proposal`);
    return result;
  },
  exportDocx: async (metadata: DocumentExportMetadata) => {
    const result = await exportAccessibleDocx(getDocumentIr(editor), metadata);
    setStatus("DOCX export generated locally");
    return Object.freeze({ ...result, bytes: [...result.bytes] });
  },
  preparePrintPreview: (options: { readonly title: string; readonly language?: string }) => {
    printPreviewElement.replaceChildren(
      renderAccessiblePrintDocument(getDocumentIr(editor), options),
    );
    document.title = options.title;
    setStatus("PDF print preview prepared locally");
  },
  runStressProbe: (pageCount = 100) => {
    const content = Array.from({ length: pageCount }, (_, pageIndex) => [
      {
        type: "heading" as const,
        attrs: { level: 2 as const },
        content: [{ type: "text" as const, text: `Synthetic page ${String(pageIndex + 1)}` }],
      },
      ...Array.from({ length: 20 }, (_, paragraphIndex) => ({
        type: "paragraph" as const,
        content: [
          {
            type: "text" as const,
            text: `Page ${String(pageIndex + 1)}, paragraph ${String(paragraphIndex + 1)}: evidence-backed local document editing remains responsive.`,
          },
        ],
      })),
    ]).flat();
    const stressDocument = parseDocumentIr({
      specVersion: DOCUMENT_IR_SPEC_VERSION,
      document: { type: "doc", content },
    });
    const loadStarted = performance.now();
    setDocument(stressDocument);
    const loadMilliseconds = performance.now() - loadStarted;
    const editStarted = performance.now();
    editor.commands.insertContent("!");
    const editMilliseconds = performance.now() - editStarted;
    const result = getDocumentIr(editor);
    const characterCount = JSON.stringify(result.document).length;
    return Object.freeze({
      pageCount,
      blockCount: content.length,
      characterCount,
      loadMilliseconds,
      editMilliseconds,
    });
  },
});

setStatus("Document harness ready");
