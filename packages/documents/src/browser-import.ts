import mammoth from "mammoth";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import {
  DOCUMENT_IR_SPEC_VERSION,
  documentIrToPlainText,
  isSafeDocumentLink,
  parseDocumentIr,
  textNode,
  type DocumentBlock,
  type DocumentMark,
  type DocumentTextNode,
  type ListItemNode,
} from "./document-ir.js";
import {
  DOCUMENT_IMPORT_LIMITS,
  assertImportSize,
  documentImportProposalSchema,
  DocumentImportError,
  sha256Hex,
  type DocumentImportProposal,
  type DocumentImportWarning,
  type DocumentSourceMapping,
  type LocalDocumentInput,
} from "./import-types.js";
import { importTextDocument } from "./text-import.js";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const pdfMagic = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
const zipMagic = [0x50, 0x4b] as const;

const hasMagic = (bytes: Uint8Array, expected: readonly number[]): boolean =>
  expected.every((byte, index) => bytes[index] === byte);

const assertMagic = (bytes: Uint8Array, expected: readonly number[]): void => {
  if (!hasMagic(bytes, expected)) throw new DocumentImportError("signature_mismatch");
};

const sourceExcerpt = (value: string): string =>
  value.trim().replaceAll(/\s+/gu, " ").slice(0, DOCUMENT_IMPORT_LIMITS.maxSourceExcerptCharacters);

const marksForElement = (
  element: Element,
  inherited: readonly DocumentMark[],
  warnings: DocumentImportWarning[],
): readonly DocumentMark[] => {
  const tag = element.tagName.toLowerCase();
  if (tag === "strong" || tag === "b") return [...inherited, { type: "bold" }];
  if (tag === "em" || tag === "i") return [...inherited, { type: "italic" }];
  if (tag === "a") {
    const href = element.getAttribute("href") ?? "";
    if (isSafeDocumentLink(href)) return [...inherited, { type: "link", attrs: { href } }];
    warnings.push({
      code: "unsafe_link_removed",
      message: "A link with an unsafe or unsupported URI was imported as plain text.",
    });
  }
  return inherited;
};

const htmlInlineContent = (
  parent: ParentNode,
  warnings: DocumentImportWarning[],
  inherited: readonly DocumentMark[] = [],
): DocumentTextNode[] | undefined => {
  const output: DocumentTextNode[] = [];
  parent.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? "";
      if (value.length > 0) output.push(textNode(value, inherited));
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.tagName.toLowerCase();
    if (
      tag === "script" ||
      tag === "style" ||
      tag === "img" ||
      tag === "svg" ||
      tag === "ul" ||
      tag === "ol"
    ) {
      return;
    }
    const marks = marksForElement(node, inherited, warnings);
    output.push(...(htmlInlineContent(node, warnings, marks) ?? []));
  });
  return output.length === 0 ? undefined : output;
};

const htmlList = (
  element: Element,
  warnings: DocumentImportWarning[],
): Extract<DocumentBlock, { type: "bulletList" | "orderedList" }> => {
  const content: ListItemNode[] = [];
  for (const child of element.children) {
    if (child.tagName.toLowerCase() !== "li") continue;
    const itemContent: ListItemNode["content"] = [];
    const inline = htmlInlineContent(child, warnings);
    if (inline !== undefined) itemContent.push({ type: "paragraph", content: inline });
    for (const nested of child.children) {
      const nestedTag = nested.tagName.toLowerCase();
      if (nestedTag === "ul" || nestedTag === "ol") itemContent.push(htmlList(nested, warnings));
    }
    if (itemContent.length > 0) content.push({ type: "listItem", content: itemContent });
  }
  if (element.tagName.toLowerCase() === "ol") {
    const parsedStart = Number(element.getAttribute("start") ?? "1");
    return {
      type: "orderedList",
      attrs: { start: Number.isSafeInteger(parsedStart) && parsedStart > 0 ? parsedStart : 1 },
      content,
    };
  }
  return { type: "bulletList", content };
};

const htmlToDocument = (
  html: string,
): {
  readonly blocks: DocumentBlock[];
  readonly mappings: DocumentSourceMapping[];
  readonly warnings: DocumentImportWarning[];
} => {
  if (typeof DOMParser === "undefined") throw new DocumentImportError("import_runtime_unavailable");
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const blocks: DocumentBlock[] = [];
  const mappings: DocumentSourceMapping[] = [];
  const warnings: DocumentImportWarning[] = [];
  let sourceParagraph = 0;

  for (const element of parsed.body.children) {
    const tag = element.tagName.toLowerCase();
    let block: DocumentBlock | undefined;
    if (tag === "p") {
      block = { type: "paragraph", content: htmlInlineContent(element, warnings) };
    } else if (/^h[1-3]$/u.test(tag)) {
      block = {
        type: "heading",
        attrs: { level: Number(tag.slice(1)) as 1 | 2 | 3 },
        content: htmlInlineContent(element, warnings),
      };
    } else if (tag === "ul" || tag === "ol") {
      block = htmlList(element, warnings);
    }
    if (block === undefined) {
      warnings.push({
        code: "formatting_omitted",
        message:
          "Unsupported document formatting was omitted while retaining readable text where possible.",
      });
      continue;
    }
    if (
      (block.type === "bulletList" || block.type === "orderedList") &&
      block.content.length === 0
    ) {
      warnings.push({
        code: "empty_block_omitted",
        message: "An empty document block was omitted.",
      });
      continue;
    }
    const targetIndex = blocks.length;
    blocks.push(block);
    sourceParagraph += 1;
    mappings.push({
      targetPath: `/document/content/${String(targetIndex)}`,
      sourcePointer: `/word/document.xml#paragraph=${String(sourceParagraph)}`,
      sourceExcerpt: sourceExcerpt(element.textContent),
    });
  }
  return { blocks, mappings, warnings };
};

export const importDocxDocument = async (
  input: LocalDocumentInput,
): Promise<DocumentImportProposal> => {
  assertImportSize(input.bytes);
  assertMagic(input.bytes, zipMagic);
  let converted: Awaited<ReturnType<typeof mammoth.convertToHtml>>;
  try {
    converted = await mammoth.convertToHtml(
      { arrayBuffer: Uint8Array.from(input.bytes).buffer },
      {
        convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "about:blank" })),
        externalFileAccess: false,
        ignoreEmptyParagraphs: false,
        includeEmbeddedStyleMap: false,
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
        ],
      },
    );
  } catch (error) {
    throw new DocumentImportError("corrupt_file", { cause: error });
  }
  const convertedDocument = htmlToDocument(converted.value);
  const structuredDocument = parseDocumentIr({
    specVersion: DOCUMENT_IR_SPEC_VERSION,
    document: { type: "doc", content: convertedDocument.blocks },
  });
  const plainText = documentIrToPlainText(structuredDocument);
  const warnings = [
    ...convertedDocument.warnings,
    ...converted.messages.map((): DocumentImportWarning => ({
      code: "formatting_omitted",
      message: "Some DOCX formatting could not be represented and was omitted.",
    })),
  ];
  return documentImportProposalSchema.parse({
    evidenceStatus: "proposal",
    source: {
      format: "docx",
      fileName: input.fileName,
      mediaType:
        input.mediaType ??
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      byteLength: input.bytes.byteLength,
      sha256: await sha256Hex(input.bytes),
    },
    structuredDocument,
    plainText,
    mappings: convertedDocument.mappings,
    warnings,
    summary: { blockCount: convertedDocument.blocks.length, characterCount: plainText.length },
  });
};

interface PdfTextItemLike {
  readonly str: string;
  readonly hasEOL?: boolean;
}

const isPdfTextItem = (value: unknown): value is PdfTextItemLike =>
  value !== null &&
  typeof value === "object" &&
  "str" in value &&
  typeof (value as { str?: unknown }).str === "string";

const pdfError = (error: unknown): DocumentImportError => {
  const name =
    error !== null && typeof error === "object" && "name" in error ? String(error.name) : "";
  return new DocumentImportError(name === "PasswordException" ? "encrypted_pdf" : "corrupt_file", {
    cause: error,
  });
};

export const importPdfDocument = async (
  input: LocalDocumentInput,
): Promise<DocumentImportProposal> => {
  assertImportSize(input.bytes);
  assertMagic(input.bytes, pdfMagic);
  const loadingTask = getDocument({ data: Uint8Array.from(input.bytes), stopAtErrors: true });
  let pdf: Awaited<typeof loadingTask.promise>;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    throw pdfError(error);
  }
  try {
    if (pdf.numPages > DOCUMENT_IMPORT_LIMITS.maxPages) {
      throw new DocumentImportError("too_many_pages");
    }
    const blocks: DocumentBlock[] = [];
    const mappings: DocumentSourceMapping[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const lines: string[] = [];
      let line = "";
      for (const item of textContent.items) {
        if (!isPdfTextItem(item)) continue;
        line += item.str;
        if (item.hasEOL) {
          if (line.trim().length > 0) lines.push(line.trim());
          line = "";
        } else if (item.str.length > 0) {
          line += " ";
        }
      }
      if (line.trim().length > 0) lines.push(line.trim());
      lines.forEach((text, lineIndex) => {
        const targetIndex = blocks.length;
        blocks.push({ type: "paragraph", content: [textNode(text)] });
        mappings.push({
          targetPath: `/document/content/${String(targetIndex)}`,
          sourcePointer: `/pages/${String(pageNumber)}/lines/${String(lineIndex + 1)}`,
          sourceExcerpt: sourceExcerpt(text),
        });
      });
    }
    const warnings: DocumentImportWarning[] = [];
    if (blocks.length === 0) {
      warnings.push({
        code: "scanned_pdf",
        message:
          "No extractable text was found. This PDF may be scanned. Choose a local OCR tool explicitly or paste the text manually; the original file remains unchanged.",
      });
    }
    const structuredDocument = parseDocumentIr({
      specVersion: DOCUMENT_IR_SPEC_VERSION,
      document: { type: "doc", content: blocks },
    });
    const plainText = documentIrToPlainText(structuredDocument);
    return documentImportProposalSchema.parse({
      evidenceStatus: "proposal",
      source: {
        format: "pdf",
        fileName: input.fileName,
        mediaType: input.mediaType ?? "application/pdf",
        byteLength: input.bytes.byteLength,
        sha256: await sha256Hex(input.bytes),
      },
      structuredDocument,
      plainText,
      mappings,
      warnings,
      summary: {
        blockCount: blocks.length,
        characterCount: plainText.length,
        pageCount: pdf.numPages,
      },
    });
  } catch (error) {
    if (error instanceof DocumentImportError) throw error;
    throw pdfError(error);
  } finally {
    await loadingTask.destroy();
  }
};

const extensionOf = (fileName: string): string => fileName.toLowerCase().split(".").at(-1) ?? "";

export const importLocalDocument = async (
  input: LocalDocumentInput,
): Promise<DocumentImportProposal> => {
  const extension = extensionOf(input.fileName);
  if (extension === "docx") return importDocxDocument(input);
  if (extension === "pdf") return importPdfDocument(input);
  if (extension === "txt" || extension === "md" || extension === "markdown") {
    return importTextDocument(input);
  }
  throw new DocumentImportError("unsupported_format");
};
