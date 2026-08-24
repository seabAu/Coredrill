import { CAPTURE_ENVELOPE_LIMITS, type JsonValue } from "@coredrill/contracts";

export const PAGE_CAPTURE_SPEC_VERSION = 1 as const;

export type PageFieldCaptureMethod = "jsonld" | "selector";

export interface PageFieldCapture {
  readonly value: string;
  readonly rawValue?: string;
  readonly pointer: string;
  readonly method: PageFieldCaptureMethod;
  readonly confidence: number;
}

export interface PageCaptureSnapshot {
  readonly specVersion: typeof PAGE_CAPTURE_SPEC_VERSION;
  readonly url: string;
  readonly canonicalUrl?: string;
  readonly pageTitle?: string;
  readonly selectedText?: string;
  readonly jsonLd?: readonly JsonValue[];
  readonly fields: {
    readonly title?: PageFieldCapture;
    readonly company?: PageFieldCapture;
  };
}

export type PageCaptureValidationResult =
  | { readonly success: true; readonly data: PageCaptureSnapshot }
  | { readonly success: false; readonly code: "snapshot_invalid"; readonly issue: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function isSafeHttpUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 8192 ||
    !/^https?:\/\/(?![^/?#]*@)[^\s]+$/i.test(value)
  ) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.username === "" &&
      parsed.password === ""
    );
  } catch {
    return false;
  }
}

function isBoundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function isJsonValue(value: unknown): value is JsonValue {
  let nodes = 0;
  const pending: { readonly value: unknown; readonly depth: number }[] = [{ value, depth: 0 }];

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) return false;
    nodes += 1;
    if (nodes > 10_000 || current.depth > 32) return false;

    const candidate = current.value;
    if (
      candidate === null ||
      typeof candidate === "string" ||
      typeof candidate === "boolean" ||
      (typeof candidate === "number" && Number.isFinite(candidate))
    ) {
      continue;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) pending.push({ value: item, depth: current.depth + 1 });
      continue;
    }
    if (!isRecord(candidate)) return false;
    const prototype = Object.getPrototypeOf(candidate) as object | null;
    if (prototype !== Object.prototype && prototype !== null) return false;
    for (const item of Object.values(candidate)) {
      pending.push({ value: item, depth: current.depth + 1 });
    }
  }
  return true;
}

function parseField(value: unknown): PageFieldCapture | undefined {
  if (!isRecord(value)) return undefined;
  if (!hasOnlyKeys(value, ["value", "rawValue", "pointer", "method", "confidence"])) {
    return undefined;
  }
  if (
    !isBoundedText(value["value"], 1024) ||
    !isBoundedText(value["pointer"], 2048) ||
    (value["method"] !== "jsonld" && value["method"] !== "selector") ||
    typeof value["confidence"] !== "number" ||
    !Number.isFinite(value["confidence"]) ||
    value["confidence"] < 0 ||
    value["confidence"] > 1 ||
    (value["rawValue"] !== undefined && !isBoundedText(value["rawValue"], 4096))
  ) {
    return undefined;
  }
  return {
    value: value["value"],
    ...(value["rawValue"] === undefined ? {} : { rawValue: value["rawValue"] }),
    pointer: value["pointer"],
    method: value["method"],
    confidence: value["confidence"],
  };
}

export function safeParsePageCaptureSnapshot(input: unknown): PageCaptureValidationResult {
  if (!isRecord(input)) {
    return { success: false, code: "snapshot_invalid", issue: "Snapshot must be an object." };
  }
  if (
    !hasOnlyKeys(input, [
      "specVersion",
      "url",
      "canonicalUrl",
      "pageTitle",
      "selectedText",
      "jsonLd",
      "fields",
    ]) ||
    input["specVersion"] !== PAGE_CAPTURE_SPEC_VERSION ||
    !isSafeHttpUrl(input["url"])
  ) {
    return {
      success: false,
      code: "snapshot_invalid",
      issue: "Snapshot metadata is invalid.",
    };
  }
  if (input["canonicalUrl"] !== undefined && !isSafeHttpUrl(input["canonicalUrl"])) {
    return {
      success: false,
      code: "snapshot_invalid",
      issue: "Canonical URL is invalid.",
    };
  }
  if (input["pageTitle"] !== undefined && !isBoundedText(input["pageTitle"], 1024)) {
    return { success: false, code: "snapshot_invalid", issue: "Page title is invalid." };
  }
  if (
    input["selectedText"] !== undefined &&
    !isBoundedText(input["selectedText"], CAPTURE_ENVELOPE_LIMITS.maxSelectedTextCharacters)
  ) {
    return { success: false, code: "snapshot_invalid", issue: "Selected text is invalid." };
  }

  const jsonLd = input["jsonLd"];
  if (
    jsonLd !== undefined &&
    (!Array.isArray(jsonLd) ||
      jsonLd.length > CAPTURE_ENVELOPE_LIMITS.maxJsonLdItems ||
      !jsonLd.every((item) => isJsonValue(item)))
  ) {
    return { success: false, code: "snapshot_invalid", issue: "JSON-LD content is invalid." };
  }

  const fields = input["fields"];
  if (!isRecord(fields) || !hasOnlyKeys(fields, ["title", "company"])) {
    return { success: false, code: "snapshot_invalid", issue: "Captured fields are invalid." };
  }
  const title = fields["title"] === undefined ? undefined : parseField(fields["title"]);
  const company = fields["company"] === undefined ? undefined : parseField(fields["company"]);
  if (
    (fields["title"] !== undefined && title === undefined) ||
    (fields["company"] !== undefined && company === undefined)
  ) {
    return {
      success: false,
      code: "snapshot_invalid",
      issue: "Captured field evidence is invalid.",
    };
  }

  return {
    success: true,
    data: {
      specVersion: PAGE_CAPTURE_SPEC_VERSION,
      url: input["url"],
      ...(input["canonicalUrl"] === undefined ? {} : { canonicalUrl: input["canonicalUrl"] }),
      ...(input["pageTitle"] === undefined ? {} : { pageTitle: input["pageTitle"] }),
      ...(input["selectedText"] === undefined ? {} : { selectedText: input["selectedText"] }),
      ...(jsonLd === undefined ? {} : { jsonLd }),
      fields: {
        ...(title === undefined ? {} : { title }),
        ...(company === undefined ? {} : { company }),
      },
    },
  };
}
