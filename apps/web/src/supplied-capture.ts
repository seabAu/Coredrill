import type { SuppliedCaptureDraftV1 } from "@coredrill/capture-core";

export const SUPPLIED_CAPTURE_FILE_LIMIT_BYTES = 2 * 1024 * 1024;
const READABLE_TEXT_LIMIT = 512 * 1024;
const JSON_NODE_LIMIT = 10_000;
const JSON_DEPTH_LIMIT = 32;

export type SuppliedCaptureMode = "manual" | "paste" | "file";

export interface SuppliedCaptureFormInput {
  readonly mode: SuppliedCaptureMode;
  readonly title: string;
  readonly company: string;
  readonly sourceUrl: string;
  readonly text: string;
  readonly file: File | null;
}

export class SuppliedCaptureInputError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SuppliedCaptureInputError";
  }
}

function optionalTrimmed(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function safeSourceUrl(value: string): string | undefined {
  const trimmed = optionalTrimmed(value);
  if (trimmed === undefined) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username !== "" ||
      parsed.password !== ""
    ) {
      throw new Error("unsafe URL");
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    throw new SuppliedCaptureInputError(
      "source_url_invalid",
      "Use a complete HTTP or HTTPS source URL without embedded credentials.",
    );
  }
}

function fieldsFor(
  titleInput: string,
  companyInput: string,
): SuppliedCaptureDraftV1["fields"] | undefined {
  const title = optionalTrimmed(titleInput);
  const company = optionalTrimmed(companyInput);
  if (title === undefined && company === undefined) return undefined;
  return {
    ...(title === undefined ? {} : { title: { value: title } }),
    ...(company === undefined ? {} : { company: { value: company } }),
  };
}

function assertReadableText(value: string): string {
  if (value.length === 0 || value.length > READABLE_TEXT_LIMIT) {
    throw new SuppliedCaptureInputError(
      "text_size_invalid",
      `Listing text must contain 1–${String(READABLE_TEXT_LIMIT)} characters.`,
    );
  }
  return value;
}

function assertBoundedJson(
  value: unknown,
): asserts value is SuppliedCaptureDraftV1["content"]["apiPayload"] {
  const pending: { readonly value: unknown; readonly depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    nodes += 1;
    if (nodes > JSON_NODE_LIMIT || current.depth > JSON_DEPTH_LIMIT) {
      throw new SuppliedCaptureInputError(
        "json_complexity_invalid",
        "The JSON file is too deeply nested or contains too many values.",
      );
    }
    if (
      current.value === null ||
      typeof current.value === "string" ||
      typeof current.value === "boolean" ||
      (typeof current.value === "number" && Number.isFinite(current.value))
    ) {
      continue;
    }
    if (Array.isArray(current.value)) {
      for (const child of current.value) pending.push({ value: child, depth: current.depth + 1 });
      continue;
    }
    if (typeof current.value !== "object") {
      throw new SuppliedCaptureInputError("json_invalid", "The file is not valid JSON data.");
    }
    for (const child of Object.values(current.value)) {
      pending.push({ value: child, depth: current.depth + 1 });
    }
  }
}

function inertHtmlText(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed
    .querySelectorAll("script, style, template, noscript, iframe, object, embed, svg, math")
    .forEach((element) => {
      element.remove();
    });
  const separatingElements = new Set([
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
  const textFrom = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    const content = [...node.childNodes].map(textFrom).join("");
    return node instanceof Element && separatingElements.has(node.tagName)
      ? ` ${content} `
      : content;
  };
  return textFrom(parsed.body).replace(/\s+/gu, " ").trim();
}

function fileKind(file: File): "saved_text" | "saved_html" | "saved_json" {
  const lowerName = file.name.toLocaleLowerCase();
  if (file.type === "text/html" || lowerName.endsWith(".html") || lowerName.endsWith(".htm")) {
    return "saved_html";
  }
  if (file.type === "application/json" || lowerName.endsWith(".json")) return "saved_json";
  if (file.type === "text/plain" || lowerName.endsWith(".txt")) return "saved_text";
  throw new SuppliedCaptureInputError(
    "file_type_unsupported",
    "Choose a saved HTML, plain-text, or JSON capture file.",
  );
}

const captureClient = Object.freeze({ name: "coredrill.web.capture", version: "0.1.0" });

export async function prepareSuppliedCaptureDraft(
  input: SuppliedCaptureFormInput,
): Promise<SuppliedCaptureDraftV1> {
  const fields = fieldsFor(input.title, input.company);
  let sourceUrl = safeSourceUrl(input.sourceUrl);

  if (input.mode === "manual") {
    const readableText = optionalTrimmed(input.text);
    if (fields?.title === undefined) {
      throw new SuppliedCaptureInputError(
        "title_required",
        "Enter a job title for manual capture.",
      );
    }
    return {
      captureMethod: "manual",
      senderKind: "web_app",
      source: {
        ...(sourceUrl === undefined ? {} : { url: sourceUrl, canonicalUrl: sourceUrl }),
        sourceKind: "manual_entry",
      },
      content: readableText === undefined ? {} : { readableText: assertReadableText(readableText) },
      fields,
      captureClient,
    };
  }

  if (input.mode === "paste") {
    let readableText = optionalTrimmed(input.text);
    if (sourceUrl === undefined && readableText !== undefined) {
      try {
        sourceUrl = safeSourceUrl(readableText);
        readableText = undefined;
      } catch {
        // Ordinary pasted listing text is not required to be a URL.
      }
    }
    if (sourceUrl === undefined && readableText === undefined && fields === undefined) {
      throw new SuppliedCaptureInputError(
        "paste_required",
        "Paste listing text or an HTTP(S) job URL.",
      );
    }
    return {
      captureMethod: "paste",
      senderKind: "web_app",
      source: {
        ...(sourceUrl === undefined ? {} : { url: sourceUrl, canonicalUrl: sourceUrl }),
        sourceKind: "pasted_listing",
      },
      content: readableText === undefined ? {} : { readableText: assertReadableText(readableText) },
      ...(fields === undefined ? {} : { fields }),
      captureClient,
    };
  }

  if (input.file === null) {
    throw new SuppliedCaptureInputError("file_required", "Choose a saved capture file.");
  }
  if (input.file.size === 0 || input.file.size > SUPPLIED_CAPTURE_FILE_LIMIT_BYTES) {
    throw new SuppliedCaptureInputError(
      "file_size_invalid",
      "The saved capture file must be non-empty and no larger than 2 MiB.",
    );
  }
  const kind = fileKind(input.file);
  const content = await input.file.text();
  if (kind === "saved_json") {
    let payload: unknown;
    try {
      payload = JSON.parse(content) as unknown;
    } catch {
      throw new SuppliedCaptureInputError("json_invalid", "The selected file is not valid JSON.");
    }
    assertBoundedJson(payload);
    return {
      captureMethod: "file",
      senderKind: "import_tool",
      source: {
        ...(sourceUrl === undefined ? {} : { url: sourceUrl, canonicalUrl: sourceUrl }),
        pageTitle: input.file.name,
        sourceKind: kind,
      },
      content: { apiPayload: payload },
      ...(fields === undefined ? {} : { fields }),
      captureClient,
    };
  }
  const readableText = kind === "saved_html" ? inertHtmlText(content) : content;
  return {
    captureMethod: "file",
    senderKind: "import_tool",
    source: {
      ...(sourceUrl === undefined ? {} : { url: sourceUrl, canonicalUrl: sourceUrl }),
      pageTitle: input.file.name,
      sourceKind: kind,
    },
    content: { readableText: assertReadableText(readableText) },
    ...(fields === undefined ? {} : { fields }),
    captureClient,
  };
}
