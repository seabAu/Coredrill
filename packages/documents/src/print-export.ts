import {
  isSafeDocumentLink,
  parseDocumentIr,
  type DocumentBlock,
  type DocumentIntermediateRepresentationV1,
  type DocumentMark,
  type DocumentTextNode,
  type ListItemNode,
} from "./document-ir.js";

export interface PrintDocumentOptions {
  readonly title: string;
  readonly language?: string;
}

const printInline = (node: DocumentTextNode, owner: globalThis.Document): Node => {
  const marks = node.marks ?? [];
  let current: Node = owner.createTextNode(node.text);
  const wrap = (tagName: "a" | "em" | "strong"): HTMLElement => {
    const wrapper = owner.createElement(tagName);
    wrapper.append(current);
    current = wrapper;
    return wrapper;
  };
  if (marks.some((mark) => mark.type === "bold")) wrap("strong");
  if (marks.some((mark) => mark.type === "italic")) wrap("em");
  const link = marks.find(
    (mark): mark is Extract<DocumentMark, { type: "link" }> => mark.type === "link",
  );
  if (link !== undefined && isSafeDocumentLink(link.attrs.href)) {
    const anchor = wrap("a");
    anchor.setAttribute("href", link.attrs.href);
  }
  return current;
};

const appendInline = (
  element: HTMLElement,
  content: readonly DocumentTextNode[] | undefined,
): void => {
  content?.forEach((node) => {
    element.append(printInline(node, element.ownerDocument));
  });
};

const printList = (
  items: readonly ListItemNode[],
  ordered: boolean,
  owner: globalThis.Document,
): HTMLOListElement | HTMLUListElement => {
  const list = owner.createElement(ordered ? "ol" : "ul");
  for (const item of items) {
    const listItem = owner.createElement("li");
    for (const child of item.content) {
      if (child.type === "paragraph") {
        const span = owner.createElement("span");
        appendInline(span, child.content);
        listItem.append(span);
      } else {
        listItem.append(printList(child.content, child.type === "orderedList", owner));
      }
    }
    list.append(listItem);
  }
  return list;
};

const printBlock = (block: DocumentBlock, owner: globalThis.Document): HTMLElement => {
  if (block.type === "paragraph") {
    const paragraph = owner.createElement("p");
    appendInline(paragraph, block.content);
    return paragraph;
  }
  if (block.type === "heading") {
    const heading = owner.createElement(`h${String(block.attrs.level)}`);
    appendInline(heading, block.content);
    return heading;
  }
  return printList(block.content, block.type === "orderedList", owner);
};

export const renderAccessiblePrintDocument = (
  input: DocumentIntermediateRepresentationV1,
  options: PrintDocumentOptions,
  owner: globalThis.Document = document,
): HTMLElement => {
  const parsed = parseDocumentIr(input);
  const article = owner.createElement("article");
  article.className = "coredrill-print-document";
  article.lang = options.language ?? "en-US";
  article.setAttribute("aria-label", options.title);
  parsed.document.content.forEach((block) => {
    article.append(printBlock(block, owner));
  });
  return article;
};

export const printDocumentLocally = (
  input: DocumentIntermediateRepresentationV1,
  options: PrintDocumentOptions,
  target: HTMLElement,
): void => {
  target.replaceChildren(renderAccessiblePrintDocument(input, options, target.ownerDocument));
  target.ownerDocument.defaultView?.print();
};
