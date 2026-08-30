const REMOVED_SOURCE_ELEMENTS =
  "script, style, template, noscript, iframe, object, embed, svg, math, img, picture, source, audio, video, track, link, meta";

const SEPARATING_ELEMENTS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "BR",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TD",
  "TH",
  "TR",
  "UL",
]);

/** Converts detached source HTML to normalized text without inserting it into a live document. */
export function sourceTextFromHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll(REMOVED_SOURCE_ELEMENTS).forEach((element) => {
    element.remove();
  });
  const textFrom = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    const content = [...node.childNodes].map(textFrom).join("");
    return node instanceof Element && SEPARATING_ELEMENTS.has(node.tagName)
      ? ` ${content} `
      : content;
  };
  return textFrom(parsed.body).replace(/\s+/gu, " ").trim();
}
