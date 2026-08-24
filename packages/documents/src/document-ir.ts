import { z } from "zod";

export const DOCUMENT_IR_SPEC_VERSION = 1 as const;
export const DOCUMENT_IR_V1_SCHEMA_ID =
  "https://coredrill.local/schemas/document-ir.v1.schema.json" as const;

export const DOCUMENT_IR_LIMITS = Object.freeze({
  maxBlocks: 10_000,
  maxCharacters: 2_000_000,
  maxDepth: 8,
  maxLinkCharacters: 2_048,
  maxTextNodeCharacters: 100_000,
});

const safeLinkProtocol = /^(?:https?:|mailto:)/iu;

export const isSafeDocumentLink = (value: string): boolean => {
  if (value.length > DOCUMENT_IR_LIMITS.maxLinkCharacters || !safeLinkProtocol.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
};

const boldMarkSchema = z.strictObject({ type: z.literal("bold") });
const italicMarkSchema = z.strictObject({ type: z.literal("italic") });
const linkMarkSchema = z.strictObject({
  type: z.literal("link"),
  attrs: z.strictObject({
    href: z
      .string()
      .max(DOCUMENT_IR_LIMITS.maxLinkCharacters)
      .regex(/^(?:https?:|mailto:)/iu)
      .refine(isSafeDocumentLink, "Unsafe link URI."),
  }),
});

export const documentMarkSchema = z.discriminatedUnion("type", [
  boldMarkSchema,
  italicMarkSchema,
  linkMarkSchema,
]);

const textNodeSchema = z.strictObject({
  type: z.literal("text"),
  text: z.string().min(1).max(DOCUMENT_IR_LIMITS.maxTextNodeCharacters),
  marks: z.array(documentMarkSchema).max(3).optional(),
});

export type DocumentMark = z.infer<typeof documentMarkSchema>;
export type DocumentTextNode = z.infer<typeof textNodeSchema>;

const inlineContentSchema = z.array(textNodeSchema).max(DOCUMENT_IR_LIMITS.maxBlocks);

const paragraphSchema = z.strictObject({
  type: z.literal("paragraph"),
  content: inlineContentSchema.optional(),
});

const headingSchema = z.strictObject({
  type: z.literal("heading"),
  attrs: z.strictObject({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
  content: inlineContentSchema.optional(),
});

type ParagraphNode = z.infer<typeof paragraphSchema>;
export interface ListItemNode {
  type: "listItem";
  content: (ParagraphNode | BulletListNode | OrderedListNode)[];
}

export interface BulletListNode {
  type: "bulletList";
  content: ListItemNode[];
}

export interface OrderedListNode {
  type: "orderedList";
  attrs?: { start: number } | undefined;
  content: ListItemNode[];
}

const listItemSchema: z.ZodType<ListItemNode> = z.lazy(() =>
  z.strictObject({
    type: z.literal("listItem"),
    content: z
      .array(z.union([paragraphSchema, bulletListSchema, orderedListSchema]))
      .min(1)
      .max(DOCUMENT_IR_LIMITS.maxBlocks),
  }),
);

const bulletListSchema: z.ZodType<BulletListNode> = z.lazy(() =>
  z.strictObject({
    type: z.literal("bulletList"),
    content: z.array(listItemSchema).min(1).max(DOCUMENT_IR_LIMITS.maxBlocks),
  }),
);

const orderedListSchema: z.ZodType<OrderedListNode> = z.lazy(() =>
  z.strictObject({
    type: z.literal("orderedList"),
    attrs: z.strictObject({ start: z.number().int().min(1).max(1_000_000) }).optional(),
    content: z.array(listItemSchema).min(1).max(DOCUMENT_IR_LIMITS.maxBlocks),
  }),
);

export const documentBlockSchema = z.union([
  paragraphSchema,
  headingSchema,
  bulletListSchema,
  orderedListSchema,
]);

export const documentIntermediateRepresentationV1Schema = z
  .strictObject({
    specVersion: z.literal(DOCUMENT_IR_SPEC_VERSION),
    document: z.strictObject({
      type: z.literal("doc"),
      content: z.array(documentBlockSchema).max(DOCUMENT_IR_LIMITS.maxBlocks),
    }),
  })
  .superRefine((value, context) => {
    let blocks = 0;
    let characters = 0;

    const visit = (node: unknown, depth: number): void => {
      if (depth > DOCUMENT_IR_LIMITS.maxDepth) {
        context.addIssue({ code: "custom", message: "Document nesting is too deep." });
        return;
      }
      if (node === null || typeof node !== "object") return;
      const candidate = node as { content?: readonly unknown[]; text?: unknown; type?: unknown };
      if (candidate.type !== "text" && candidate.type !== "doc") blocks += 1;
      if (typeof candidate.text === "string") characters += candidate.text.length;
      candidate.content?.forEach((child) => {
        visit(child, depth + 1);
      });
    };

    visit(value.document, 0);
    if (blocks > DOCUMENT_IR_LIMITS.maxBlocks) {
      context.addIssue({ code: "custom", message: "Document contains too many blocks." });
    }
    if (characters > DOCUMENT_IR_LIMITS.maxCharacters) {
      context.addIssue({ code: "custom", message: "Document contains too much text." });
    }
  })
  .meta({
    title: "Coredrill DocumentIntermediateRepresentationV1",
    description:
      "A bounded canonical document model for local editing, source-mapped imports, and deterministic export.",
    "x-coredrill-maxBlocks": DOCUMENT_IR_LIMITS.maxBlocks,
    "x-coredrill-maxCharacters": DOCUMENT_IR_LIMITS.maxCharacters,
  });

const generatedDocumentIrV1JsonSchema = z.toJSONSchema(documentIntermediateRepresentationV1Schema, {
  target: "draft-2020-12",
});
const { $schema: documentIrDialect, ...documentIrSchemaBody } = generatedDocumentIrV1JsonSchema;

export const documentIrV1JsonSchema = Object.freeze({
  $schema: documentIrDialect,
  $id: DOCUMENT_IR_V1_SCHEMA_ID,
  ...documentIrSchemaBody,
});

export type DocumentBlock = z.infer<typeof documentBlockSchema>;
export type DocumentIntermediateRepresentationV1 = z.infer<
  typeof documentIntermediateRepresentationV1Schema
>;

const markKey = (mark: DocumentMark): string =>
  mark.type === "link" ? `${mark.type}:${mark.attrs.href}` : mark.type;

const normalizeMarks = (marks: readonly DocumentMark[] | undefined): DocumentMark[] | undefined => {
  if (marks === undefined || marks.length === 0) return undefined;
  return [...marks].sort((left, right) => markKey(left).localeCompare(markKey(right)));
};

const sameMarks = (
  left: readonly DocumentMark[] | undefined,
  right: readonly DocumentMark[] | undefined,
): boolean => JSON.stringify(left ?? []) === JSON.stringify(right ?? []);

const normalizeInline = (
  content: readonly DocumentTextNode[] | undefined,
): DocumentTextNode[] | undefined => {
  if (content === undefined) return undefined;
  const normalized: DocumentTextNode[] = [];
  for (const current of content) {
    if (current.text.length === 0) continue;
    const marks = normalizeMarks(current.marks);
    const previous = normalized.at(-1);
    if (previous !== undefined && sameMarks(previous.marks, marks)) {
      normalized[normalized.length - 1] = { ...previous, text: previous.text + current.text };
    } else {
      normalized.push(
        marks === undefined ? { type: "text", text: current.text } : { ...current, marks },
      );
    }
  }
  return normalized.length === 0 ? undefined : normalized;
};

const normalizeBlock = (block: DocumentBlock): DocumentBlock => {
  if (block.type === "paragraph" || block.type === "heading") {
    const content = normalizeInline(block.content);
    return content === undefined ? { ...block, content: undefined } : { ...block, content };
  }
  return {
    ...block,
    content: block.content.map((item) => ({
      ...item,
      content: item.content.map((child) => normalizeBlock(child)),
    })),
  } as DocumentBlock;
};

export const normalizeDocumentIr = (
  input: DocumentIntermediateRepresentationV1,
): DocumentIntermediateRepresentationV1 =>
  documentIntermediateRepresentationV1Schema.parse({
    specVersion: DOCUMENT_IR_SPEC_VERSION,
    document: {
      type: "doc",
      content: input.document.content.map(normalizeBlock),
    },
  });

export const parseDocumentIr = (input: unknown): DocumentIntermediateRepresentationV1 =>
  normalizeDocumentIr(documentIntermediateRepresentationV1Schema.parse(input));

const inlineText = (content: readonly DocumentTextNode[] | undefined): string =>
  content?.map((node) => node.text).join("") ?? "";

const blockText = (block: DocumentBlock, depth = 0): string => {
  if (block.type === "paragraph" || block.type === "heading") return inlineText(block.content);
  const prefix =
    block.type === "orderedList"
      ? (index: number): string => `${String(index + 1)}. `
      : (): string => "- ";
  return block.content
    .map((item, index) =>
      item.content
        .map((child) => `${"  ".repeat(depth)}${prefix(index)}${blockText(child, depth + 1)}`)
        .join("\n"),
    )
    .join("\n");
};

export const documentIrToPlainText = (input: DocumentIntermediateRepresentationV1): string =>
  parseDocumentIr(input)
    .document.content.map((block) => blockText(block))
    .join("\n\n");

export const textNode = (text: string, marks?: readonly DocumentMark[]): DocumentTextNode =>
  marks === undefined ? { type: "text", text } : { type: "text", text, marks: [...marks] };
