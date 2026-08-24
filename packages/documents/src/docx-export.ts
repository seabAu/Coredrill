import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
  convertInchesToTwip,
  type ParagraphChild,
} from "docx";

import {
  isSafeDocumentLink,
  parseDocumentIr,
  type DocumentBlock,
  type DocumentIntermediateRepresentationV1,
  type DocumentMark,
  type DocumentTextNode,
  type ListItemNode,
} from "./document-ir.js";
import { sha256Hex } from "./import-types.js";

export const DOCX_EXPORT_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;

export interface DocumentExportMetadata {
  readonly title: string;
  readonly suggestedFileName: string;
  readonly creator?: string;
  readonly description?: string;
  readonly language?: string;
}

export interface LocalDocumentExport {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly fileExtension: "docx";
  readonly suggestedFileName: string;
  readonly sha256: string;
}

const windowsReservedName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;

export const sanitizeDocumentFileName = (value: string, extension: "docx" | "pdf"): string => {
  const withoutExtension = value.replace(/\.(?:docx|pdf)$/iu, "");
  const withoutControls = Array.from(withoutExtension.normalize("NFKC"))
    .map((character) => ((character.codePointAt(0) ?? 0) < 32 ? "-" : character))
    .join("");
  const safeBase = withoutControls
    .replaceAll(/[<>:"/\\|?*]/gu, "-")
    .replaceAll(/\s+/gu, " ")
    .replace(/[. ]+$/gu, "")
    .trim()
    .slice(0, 96);
  const usableBase =
    safeBase.length === 0 || windowsReservedName.test(safeBase) ? "coredrill-document" : safeBase;
  return `${usableBase}.${extension}`;
};

const markOptions = (
  marks: readonly DocumentMark[] | undefined,
): { readonly bold: boolean; readonly italics: boolean; readonly link?: string } => {
  const link = marks?.find((mark) => mark.type === "link");
  return {
    bold: marks?.some((mark) => mark.type === "bold") ?? false,
    italics: marks?.some((mark) => mark.type === "italic") ?? false,
    ...(link?.type === "link" && isSafeDocumentLink(link.attrs.href)
      ? { link: link.attrs.href }
      : {}),
  };
};

const docxInline = (node: DocumentTextNode, language: string): ParagraphChild => {
  const options = markOptions(node.marks);
  const run = new TextRun({
    text: node.text,
    bold: options.bold,
    italics: options.italics,
    language: { value: language },
    ...(options.link === undefined ? {} : { style: "Hyperlink" }),
  });
  return options.link === undefined
    ? run
    : new ExternalHyperlink({ children: [run], link: options.link });
};

const inlineChildren = (
  content: readonly DocumentTextNode[] | undefined,
  language: string,
): ParagraphChild[] => content?.map((node) => docxInline(node, language)) ?? [];

const headingLevel = (level: 1 | 2 | 3): (typeof HeadingLevel)[keyof typeof HeadingLevel] => {
  if (level === 1) return HeadingLevel.HEADING_1;
  if (level === 2) return HeadingLevel.HEADING_2;
  return HeadingLevel.HEADING_3;
};

const listParagraphs = (
  items: readonly ListItemNode[],
  kind: "bullet" | "ordered",
  language: string,
  level = 0,
): Paragraph[] => {
  const paragraphs: Paragraph[] = [];
  for (const item of items) {
    for (const child of item.content) {
      if (child.type === "paragraph") {
        paragraphs.push(
          new Paragraph({
            children: inlineChildren(child.content, language),
            ...(kind === "bullet"
              ? { bullet: { level } }
              : { numbering: { reference: "coredrill-decimal", level } }),
            spacing: { after: 80, line: 276 },
          }),
        );
      } else {
        paragraphs.push(
          ...listParagraphs(
            child.content,
            child.type === "bulletList" ? "bullet" : "ordered",
            language,
            level + 1,
          ),
        );
      }
    }
  }
  return paragraphs;
};

const docxBlocks = (blocks: readonly DocumentBlock[], language: string): Paragraph[] =>
  blocks.flatMap((block) => {
    if (block.type === "paragraph") {
      return [
        new Paragraph({
          children: inlineChildren(block.content, language),
          spacing: { after: 100, line: 276 },
        }),
      ];
    }
    if (block.type === "heading") {
      return [
        new Paragraph({
          children: inlineChildren(block.content, language),
          heading: headingLevel(block.attrs.level),
          keepNext: true,
          spacing: { before: 160, after: 80 },
        }),
      ];
    }
    return listParagraphs(
      block.content,
      block.type === "bulletList" ? "bullet" : "ordered",
      language,
    );
  });

const numberingLevels = Array.from({ length: 8 }, (_, level) => ({
  level,
  format: LevelFormat.DECIMAL,
  text: `%${String(level + 1)}.`,
  alignment: AlignmentType.START,
  style: {
    paragraph: {
      indent: { left: 720 + level * 360, hanging: 360 },
    },
  },
}));

export const createAccessibleDocx = (
  input: DocumentIntermediateRepresentationV1,
  metadata: DocumentExportMetadata,
): Document => {
  const document = parseDocumentIr(input);
  const language = metadata.language ?? "en-US";
  return new Document({
    creator: metadata.creator ?? "Coredrill",
    title: metadata.title,
    description: metadata.description ?? "Locally generated Coredrill document export.",
    subject: "Job application document",
    keywords: "Coredrill, job application",
    lastModifiedBy: "Coredrill",
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 21, language: { value: language }, color: "172B3A" },
          paragraph: { spacing: { after: 100, line: 276 } },
        },
        heading1: {
          run: { font: "Arial", size: 30, bold: true, color: "12344D" },
          paragraph: { spacing: { before: 180, after: 80 }, keepNext: true, outlineLevel: 0 },
        },
        heading2: {
          run: { font: "Arial", size: 25, bold: true, color: "145DA0" },
          paragraph: { spacing: { before: 160, after: 70 }, keepNext: true, outlineLevel: 1 },
        },
        heading3: {
          run: { font: "Arial", size: 22, bold: true, color: "145DA0" },
          paragraph: { spacing: { before: 140, after: 60 }, keepNext: true, outlineLevel: 2 },
        },
        hyperlink: {
          run: { color: "145DA0", underline: { type: "single" } },
        },
      },
    },
    numbering: {
      config: [{ reference: "coredrill-decimal", levels: numberingLevels }],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.65),
              right: convertInchesToTwip(0.7),
              bottom: convertInchesToTwip(0.65),
              left: convertInchesToTwip(0.7),
            },
          },
        },
        children: docxBlocks(document.document.content, language),
      },
    ],
  });
};

export const exportAccessibleDocx = async (
  input: DocumentIntermediateRepresentationV1,
  metadata: DocumentExportMetadata,
): Promise<LocalDocumentExport> => {
  const blob = await Packer.toBlob(createAccessibleDocx(input, metadata));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return Object.freeze({
    bytes,
    mediaType: DOCX_EXPORT_MEDIA_TYPE,
    fileExtension: "docx",
    suggestedFileName: sanitizeDocumentFileName(metadata.suggestedFileName, "docx"),
    sha256: await sha256Hex(bytes),
  });
};
