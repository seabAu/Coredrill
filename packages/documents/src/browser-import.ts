import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { preflightDocxArchive } from "./docx-archive.js";
import {
  DOCUMENT_IR_LIMITS,
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

const DOCX_WORKER_TIMEOUT_MILLISECONDS = 30_000;
const DOCX_WORKER_MAX_HTML_CHARACTERS = 8_000_000;
const DOCX_WORKER_MAX_MESSAGES = 100;

const pdfMagic = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
const zipMagic = [0x50, 0x4b] as const;

const hasMagic = (bytes: Uint8Array, expected: readonly number[]): boolean =>
  expected.every((byte, index) => bytes[index] === byte);

const assertMagic = (bytes: Uint8Array, expected: readonly number[]): void => {
  if (!hasMagic(bytes, expected)) throw new DocumentImportError("signature_mismatch");
};

const sourceExcerpt = (value: string): string =>
  value.trim().replaceAll(/\s+/gu, " ").slice(0, DOCUMENT_IMPORT_LIMITS.maxSourceExcerptCharacters);

interface DocxConversionResult {
  readonly html: string;
  readonly messageCount: number;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const convertDocxInWorker = async (bytes: Uint8Array): Promise<DocxConversionResult> => {
  if (typeof Worker === "undefined") throw new DocumentImportError("import_runtime_unavailable");
  const worker = new Worker(new URL("./docx-import.worker.js", import.meta.url), {
    name: "coredrill-docx-import",
    type: "module",
  });
  return new Promise<DocxConversionResult>((resolve, reject) => {
    let settled = false;
    const finish = (operation: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      operation();
    };
    const timeout = setTimeout(() => {
      finish(() => {
        reject(new DocumentImportError("too_complex"));
      });
    }, DOCX_WORKER_TIMEOUT_MILLISECONDS);
    worker.addEventListener("error", () => {
      finish(() => {
        reject(new DocumentImportError("corrupt_file"));
      });
    });
    worker.addEventListener("messageerror", () => {
      finish(() => {
        reject(new DocumentImportError("corrupt_file"));
      });
    });
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const value = event.data;
      if (!isRecord(value) || (value["type"] !== "success" && value["type"] !== "failure")) {
        finish(() => {
          reject(new DocumentImportError("corrupt_file"));
        });
        return;
      }
      if (value["type"] === "failure") {
        finish(() => {
          reject(
            new DocumentImportError(
              value["reason"] === "too_complex" ? "too_complex" : "corrupt_file",
            ),
          );
        });
        return;
      }
      const html = value["html"];
      const messageCount = value["messageCount"];
      if (
        typeof html !== "string" ||
        html.length > DOCX_WORKER_MAX_HTML_CHARACTERS ||
        !Number.isSafeInteger(messageCount) ||
        (messageCount as number) < 0 ||
        (messageCount as number) > DOCX_WORKER_MAX_MESSAGES ||
        Object.keys(value).length !== 3
      ) {
        finish(() => {
          reject(new DocumentImportError("corrupt_file"));
        });
        return;
      }
      finish(() => {
        resolve(Object.freeze({ html, messageCount: messageCount as number }));
      });
    });
    const copied = Uint8Array.from(bytes);
    const transferred = copied.buffer;
    worker.postMessage(Object.freeze({ bytes: transferred }), [transferred]);
  });
};

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

interface HtmlConversionBudget {
  characters: number;
  nodes: number;
}

const consumeHtmlNode = (budget: HtmlConversionBudget, characters = 0): void => {
  budget.nodes += 1;
  budget.characters += characters;
  if (
    budget.nodes > DOCUMENT_IR_LIMITS.maxNodes ||
    characters > DOCUMENT_IR_LIMITS.maxTextNodeCharacters ||
    budget.characters > DOCUMENT_IR_LIMITS.maxCharacters
  ) {
    throw new DocumentImportError("too_complex");
  }
};

const htmlInlineContent = (
  parent: ParentNode,
  warnings: DocumentImportWarning[],
  budget: HtmlConversionBudget,
  inherited: readonly DocumentMark[] = [],
): DocumentTextNode[] | undefined => {
  const output: DocumentTextNode[] = [];
  const pending: {
    readonly depth: number;
    readonly inherited: readonly DocumentMark[];
    readonly node: Node;
  }[] = Array.from(parent.childNodes, (node) => ({
    depth: 0,
    inherited,
    node,
  })).reverse();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    const { node } = current;
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? "";
      if (value.length > 0) {
        consumeHtmlNode(budget, value.length);
        output.push(textNode(value, current.inherited));
      }
      continue;
    }
    if (!(node instanceof Element)) continue;
    if (current.depth > DOCUMENT_IR_LIMITS.maxDepth * 4) {
      throw new DocumentImportError("too_complex");
    }
    const tag = node.tagName.toLowerCase();
    if (
      tag === "script" ||
      tag === "style" ||
      tag === "img" ||
      tag === "svg" ||
      tag === "ul" ||
      tag === "ol"
    ) {
      continue;
    }
    const marks = marksForElement(node, current.inherited, warnings);
    const children = Array.from(node.childNodes);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push({ depth: current.depth + 1, inherited: marks, node: children[index] as Node });
    }
  }
  return output.length === 0 ? undefined : output;
};

const htmlList = (
  element: Element,
  warnings: DocumentImportWarning[],
  budget: HtmlConversionBudget,
  depth = 0,
): Extract<DocumentBlock, { type: "bulletList" | "orderedList" }> => {
  if (depth > DOCUMENT_IR_LIMITS.maxDepth) throw new DocumentImportError("too_complex");
  consumeHtmlNode(budget);
  const content: ListItemNode[] = [];
  for (const child of element.children) {
    if (child.tagName.toLowerCase() !== "li") continue;
    consumeHtmlNode(budget);
    const itemContent: ListItemNode["content"] = [];
    const inline = htmlInlineContent(child, warnings, budget);
    if (inline !== undefined) {
      consumeHtmlNode(budget);
      itemContent.push({ type: "paragraph", content: inline });
    }
    for (const nested of child.children) {
      const nestedTag = nested.tagName.toLowerCase();
      if (nestedTag === "ul" || nestedTag === "ol") {
        itemContent.push(htmlList(nested, warnings, budget, depth + 1));
      }
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
  const budget: HtmlConversionBudget = { characters: 0, nodes: 1 };
  let sourceParagraph = 0;

  for (const element of parsed.body.children) {
    const tag = element.tagName.toLowerCase();
    let block: DocumentBlock | undefined;
    if (tag === "p") {
      consumeHtmlNode(budget);
      block = { type: "paragraph", content: htmlInlineContent(element, warnings, budget) };
    } else if (/^h[1-3]$/u.test(tag)) {
      consumeHtmlNode(budget);
      block = {
        type: "heading",
        attrs: { level: Number(tag.slice(1)) as 1 | 2 | 3 },
        content: htmlInlineContent(element, warnings, budget),
      };
    } else if (tag === "ul" || tag === "ol") {
      block = htmlList(element, warnings, budget);
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
    if (targetIndex >= DOCUMENT_IR_LIMITS.maxBlocks) {
      throw new DocumentImportError("too_complex");
    }
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
  preflightDocxArchive(input.bytes);
  const converted = await convertDocxInWorker(input.bytes);
  const convertedDocument = htmlToDocument(converted.html);
  const structuredDocument = parseDocumentIr({
    specVersion: DOCUMENT_IR_SPEC_VERSION,
    document: { type: "doc", content: convertedDocument.blocks },
  });
  const plainText = documentIrToPlainText(structuredDocument);
  const warnings = [
    ...convertedDocument.warnings,
    ...Array.from({ length: converted.messageCount }, (): DocumentImportWarning => ({
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
    let characterCount = 0;
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
        if (
          blocks.length >= DOCUMENT_IR_LIMITS.maxBlocks ||
          text.length > DOCUMENT_IR_LIMITS.maxTextNodeCharacters ||
          characterCount + text.length > DOCUMENT_IR_LIMITS.maxCharacters
        ) {
          throw new DocumentImportError("too_complex");
        }
        characterCount += text.length;
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
