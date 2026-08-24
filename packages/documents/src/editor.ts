import { Editor, type EditorOptions, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import {
  DOCUMENT_IR_SPEC_VERSION,
  isSafeDocumentLink,
  parseDocumentIr,
  type DocumentIntermediateRepresentationV1,
} from "./document-ir.js";

export interface RestrictedDocumentEditorOptions {
  readonly element?: Element;
  readonly content?: DocumentIntermediateRepresentationV1;
  readonly editable?: boolean;
  readonly onUpdate?: (document: DocumentIntermediateRepresentationV1) => void;
}

const restrictedExtensions = [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    dropcursor: false,
    gapcursor: false,
    hardBreak: false,
    heading: { levels: [1, 2, 3] },
    horizontalRule: false,
    link: {
      autolink: false,
      enableClickSelection: false,
      isAllowedUri: (url) => isSafeDocumentLink(url),
      linkOnPaste: false,
      markdownLinks: false,
      openOnClick: false,
      protocols: ["http", "https", "mailto"],
    },
    strike: false,
    trailingNode: false,
    underline: false,
  }),
] as const;

const canonicalizeEditorJson = (value: JSONContent): unknown => {
  const attributes = value.attrs as Record<string, unknown> | undefined;
  if (value.type === "text") {
    const marks = value.marks
      ?.map((mark) => {
        if (mark.type === "bold" || mark.type === "italic") return { type: mark.type };
        const markAttributes = mark.attrs as Record<string, unknown> | undefined;
        const href = markAttributes?.["href"];
        if (mark.type === "link" && typeof href === "string") {
          return { type: "link", attrs: { href } };
        }
        return undefined;
      })
      .filter((mark) => mark !== undefined);
    return {
      type: "text",
      text: value.text,
      ...(marks === undefined || marks.length === 0 ? {} : { marks }),
    };
  }
  const content = value.content?.map(canonicalizeEditorJson);
  if (value.type === "heading") {
    return {
      type: "heading",
      attrs: { level: attributes?.["level"] },
      ...(content === undefined ? {} : { content }),
    };
  }
  if (value.type === "orderedList") {
    const start = attributes?.["start"];
    return {
      type: "orderedList",
      ...(start === undefined || start === 1 ? {} : { attrs: { start } }),
      ...(content === undefined ? {} : { content }),
    };
  }
  return { type: value.type, ...(content === undefined ? {} : { content }) };
};

const fromEditorJson = (value: JSONContent): DocumentIntermediateRepresentationV1 =>
  parseDocumentIr({
    specVersion: DOCUMENT_IR_SPEC_VERSION,
    document: canonicalizeEditorJson(value),
  });

export const getDocumentIr = (editor: Editor): DocumentIntermediateRepresentationV1 =>
  fromEditorJson(editor.getJSON());

export const setDocumentIr = (
  editor: Editor,
  document: DocumentIntermediateRepresentationV1,
): void => {
  const parsed = parseDocumentIr(document);
  editor.commands.setContent(structuredClone(parsed.document) as JSONContent, {
    emitUpdate: false,
    errorOnInvalidContent: true,
  });
};

export const createRestrictedDocumentEditor = (
  options: RestrictedDocumentEditorOptions = {},
): Editor => {
  const editorOptions: Partial<EditorOptions> = {
    content:
      options.content === undefined
        ? { type: "doc", content: [{ type: "paragraph" }] }
        : (structuredClone(options.content.document) as JSONContent),
    editable: options.editable ?? true,
    enableContentCheck: true,
    editorProps: {
      attributes: {
        "aria-describedby": "editor-help",
        "aria-label": "Document content editor",
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    extensions: [...restrictedExtensions],
    injectCSS: false,
    onUpdate: ({ editor }) => options.onUpdate?.(getDocumentIr(editor)),
  };
  if (options.element !== undefined) editorOptions.element = options.element;
  return new Editor(editorOptions);
};
