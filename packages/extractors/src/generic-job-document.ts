import { isProbablyReaderable, Readability } from "@mozilla/readability";

import {
  fieldCandidateV1Schema,
  type ExtractionMethod,
  type FieldCandidateV1,
  type JsonValue,
} from "@coredrill/contracts";

export const GENERIC_JOB_DOCUMENT_SPEC_VERSION = 1 as const;

export const SELECTED_TEXT_EXTRACTOR = Object.freeze({
  name: "coredrill.selected-text",
  version: "1.0.0",
});

export const GENERIC_JOB_DOCUMENT_EXTRACTOR = Object.freeze({
  name: "coredrill.generic-job-document",
  version: "1.0.0",
});

export const GENERIC_JOB_DOCUMENT_LIMITS = Object.freeze({
  maxCandidates: 256,
  maxDocumentDepth: 128,
  maxDocumentElements: 10_000,
  maxDocumentTextLength: 1_024 * 1_024,
  maxReadableTextLength: 512 * 1_024,
  maxSelectedTextLength: 64 * 1_024,
  maxShortTextLength: 4_096,
  maxSourceExcerptLength: 4_096,
  maxRequirementCandidates: 64,
});

export const GENERIC_JOB_DOCUMENT_FIELD_NAMES = [
  "title",
  "company",
  "description",
  "salary",
  "locations",
  "workplace_type",
  "posted_at",
  "valid_through",
  "requirements",
  "apply_url",
  "external_id",
  "employment_type",
] as const;
export type GenericJobDocumentFieldName = (typeof GENERIC_JOB_DOCUMENT_FIELD_NAMES)[number];

export const GENERIC_JOB_DOCUMENT_WARNING_CODES = [
  "readability_not_available",
  "field_invalid",
  "labeled_value_missing",
] as const;
export type GenericJobDocumentWarningCode = (typeof GENERIC_JOB_DOCUMENT_WARNING_CODES)[number];

export const GENERIC_JOB_DOCUMENT_ERROR_CODES = [
  "input_invalid",
  "document_invalid",
  "document_limit_exceeded",
  "content_limit_exceeded",
  "readability_failed",
  "candidate_limit_exceeded",
  "candidate_invalid",
  "candidate_id_invalid",
] as const;
export type GenericJobDocumentErrorCode = (typeof GENERIC_JOB_DOCUMENT_ERROR_CODES)[number];

export interface GenericJobCandidateIdContextV1 {
  readonly index: number;
  readonly fieldName: GenericJobDocumentFieldName;
  readonly pointer: string;
  readonly method: Extract<ExtractionMethod, "readability" | "selector">;
}

export interface SelectedTextInputV1 {
  readonly specVersion: 1;
  readonly sourceId: string;
  readonly capturedAt: string;
  readonly selectedText: string;
  readonly createCandidateId: (context: GenericJobCandidateIdContextV1) => string;
}

export interface GenericJobDocumentInputV1 {
  readonly specVersion: 1;
  readonly sourceId: string;
  readonly capturedAt: string;
  readonly document: Document;
  readonly createCandidateId: (context: GenericJobCandidateIdContextV1) => string;
}

export interface GenericJobDocumentWarningV1 {
  readonly code: GenericJobDocumentWarningCode;
  readonly fieldName: GenericJobDocumentFieldName | null;
  readonly pointer: string;
}

export interface SelectedTextSummaryV1 {
  readonly inputCharacters: number;
  readonly normalizedCharacters: number;
  readonly candidateCount: number;
}

export interface SelectedTextExtractionV1 {
  readonly specVersion: 1;
  readonly extractor: typeof SELECTED_TEXT_EXTRACTOR;
  readonly candidates: readonly FieldCandidateV1[];
  readonly warnings: readonly GenericJobDocumentWarningV1[];
  readonly summary: SelectedTextSummaryV1;
}

export interface GenericReadableContentV1 {
  readonly textContent: string;
  readonly title?: string;
  readonly excerpt?: string;
  readonly byline?: string;
  readonly siteName?: string;
  readonly language?: string;
}

export interface GenericJobDocumentSummaryV1 {
  readonly inputElementCount: number;
  readonly retainedElementCount: number;
  readonly removedElementCount: number;
  readonly readabilityAccepted: boolean;
  readonly candidateCount: number;
  readonly warningCount: number;
}

export interface GenericJobDocumentExtractionV1 {
  readonly specVersion: 1;
  readonly extractor: typeof GENERIC_JOB_DOCUMENT_EXTRACTOR;
  readonly readableContent: GenericReadableContentV1 | null;
  readonly candidates: readonly FieldCandidateV1[];
  readonly warnings: readonly GenericJobDocumentWarningV1[];
  readonly summary: GenericJobDocumentSummaryV1;
}

/** Content-free failure for malformed, oversized, or non-deterministic document inputs. */
export class GenericJobDocumentError extends Error {
  public constructor(public readonly code: GenericJobDocumentErrorCode) {
    super("Generic job-document extraction rejected invalid input.");
    this.name = "GenericJobDocumentError";
  }
}

interface CandidateDraft {
  readonly fieldName: GenericJobDocumentFieldName;
  readonly value: JsonValue;
  readonly rawValue: JsonValue;
  readonly pointer: string;
  readonly method: Extract<ExtractionMethod, "readability" | "selector">;
  readonly confidence: number;
}

interface CandidateBuildContext {
  readonly sourceId: string;
  readonly capturedAt: string;
  readonly extractor: typeof SELECTED_TEXT_EXTRACTOR | typeof GENERIC_JOB_DOCUMENT_EXTRACTOR;
  readonly licenseNote: string;
  readonly createCandidateId: (context: GenericJobCandidateIdContextV1) => string;
}

interface LabeledValue {
  readonly labelElement: Element;
  readonly valueElement: Element;
}

interface LabelRule {
  readonly fieldName: GenericJobDocumentFieldName;
  readonly confidence: number;
}

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SELECTED_TEXT_INPUT_KEYS = Object.freeze([
  "specVersion",
  "sourceId",
  "capturedAt",
  "selectedText",
  "createCandidateId",
]);
const DOCUMENT_INPUT_KEYS = Object.freeze([
  "specVersion",
  "sourceId",
  "capturedAt",
  "document",
  "createCandidateId",
]);
const SCRUB_SELECTORS = [
  "script",
  "style",
  "template",
  "iframe",
  "frame",
  "object",
  "embed",
  "svg",
  "math",
  "canvas",
  "nav",
  "aside",
  "footer",
  "form",
  "input",
  "textarea",
  "select",
  "option",
  "button",
  "[hidden]",
  '[aria-hidden="true"]',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
].join(",");
const BOILERPLATE_TOKEN =
  /(?:^|[-_\s])(advert|banner|cookie|consent|newsletter|promo|share|social)(?:$|[-_\s])/iu;
const INLINE_HIDDEN = /(?:display\s*:\s*none|visibility\s*:\s*hidden)/iu;
const LABEL_RULES = new Map<string, LabelRule>([
  ["company", { fieldName: "company", confidence: 0.82 }],
  ["employer", { fieldName: "company", confidence: 0.82 }],
  ["organization", { fieldName: "company", confidence: 0.8 }],
  ["location", { fieldName: "locations", confidence: 0.8 }],
  ["job location", { fieldName: "locations", confidence: 0.84 }],
  ["work location", { fieldName: "locations", confidence: 0.82 }],
  ["workplace type", { fieldName: "workplace_type", confidence: 0.84 }],
  ["work type", { fieldName: "workplace_type", confidence: 0.78 }],
  ["remote", { fieldName: "workplace_type", confidence: 0.72 }],
  ["salary", { fieldName: "salary", confidence: 0.8 }],
  ["compensation", { fieldName: "salary", confidence: 0.8 }],
  ["pay range", { fieldName: "salary", confidence: 0.82 }],
  ["employment type", { fieldName: "employment_type", confidence: 0.82 }],
  ["job type", { fieldName: "employment_type", confidence: 0.8 }],
  ["date posted", { fieldName: "posted_at", confidence: 0.8 }],
  ["posting date", { fieldName: "posted_at", confidence: 0.8 }],
  ["valid through", { fieldName: "valid_through", confidence: 0.8 }],
  ["application deadline", { fieldName: "valid_through", confidence: 0.82 }],
  ["deadline", { fieldName: "valid_through", confidence: 0.76 }],
  ["apply url", { fieldName: "apply_url", confidence: 0.82 }],
  ["application url", { fieldName: "apply_url", confidence: 0.82 }],
  ["job id", { fieldName: "external_id", confidence: 0.82 }],
  ["requisition id", { fieldName: "external_id", confidence: 0.84 }],
  ["reference id", { fieldName: "external_id", confidence: 0.8 }],
]);
const REQUIREMENT_LABELS = new Map<string, string>([
  ["requirements", "requirement"],
  ["qualifications", "qualification"],
  ["minimum qualifications", "qualification"],
  ["preferred qualifications", "qualification"],
  ["responsibilities", "responsibility"],
  ["what you'll do", "responsibility"],
  ["what you will do", "responsibility"],
  ["what you'll need", "requirement"],
  ["what you will need", "requirement"],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== "string" || !SAFE_INSTANT.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isDocumentLike(value: unknown): value is Document {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    readonly nodeType?: unknown;
    readonly cloneNode?: unknown;
    readonly querySelector?: unknown;
    readonly querySelectorAll?: unknown;
    readonly documentElement?: unknown;
  };
  return (
    candidate.nodeType === 9 &&
    typeof candidate.cloneNode === "function" &&
    typeof candidate.querySelector === "function" &&
    typeof candidate.querySelectorAll === "function" &&
    typeof candidate.documentElement === "object" &&
    candidate.documentElement !== null
  );
}

function normalizeText(value: string, maximum: number): string | null {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length === 0 || normalized.length > maximum ? null : normalized;
}

function normalizedLabel(value: string): string | null {
  const normalized = normalizeText(value, 128);
  return normalized === null
    ? null
    : normalized.replace(/\s*:\s*$/u, "").toLocaleLowerCase("en-US");
}

function sourceExcerpt(value: JsonValue): string | undefined {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (serialized.length === 0) return undefined;
  return serialized.slice(0, GENERIC_JOB_DOCUMENT_LIMITS.maxSourceExcerptLength);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function buildCandidates(
  drafts: readonly CandidateDraft[],
  context: CandidateBuildContext,
): readonly FieldCandidateV1[] {
  if (drafts.length > GENERIC_JOB_DOCUMENT_LIMITS.maxCandidates) {
    throw new GenericJobDocumentError("candidate_limit_exceeded");
  }
  const ids = new Set<string>();
  return Object.freeze(
    drafts.map((draft, index) => {
      let id: string;
      try {
        id = context.createCandidateId(
          Object.freeze({
            index,
            fieldName: draft.fieldName,
            pointer: draft.pointer,
            method: draft.method,
          }),
        );
      } catch {
        throw new GenericJobDocumentError("candidate_id_invalid");
      }
      if (typeof id !== "string" || !UUID_V7.test(id) || ids.has(id)) {
        throw new GenericJobDocumentError("candidate_id_invalid");
      }
      ids.add(id);
      const excerpt = sourceExcerpt(draft.rawValue);
      const parsed = fieldCandidateV1Schema.safeParse({
        specVersion: 1,
        id,
        fieldName: draft.fieldName,
        value: draft.value,
        rawValue: draft.rawValue,
        provenance: {
          specVersion: 1,
          source: {
            sourceType: "capture",
            sourceId: context.sourceId,
            pointer: draft.pointer,
          },
          method: draft.method,
          extractor: context.extractor,
          capturedAt: context.capturedAt,
          confidence: draft.confidence,
          ...(excerpt === undefined ? {} : { sourceExcerpt: excerpt }),
          licenseNote: context.licenseNote,
        },
      });
      if (!parsed.success) throw new GenericJobDocumentError("candidate_invalid");
      return deepFreeze(parsed.data);
    }),
  );
}

function validBoundaryMetadata(
  input: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  return (
    hasExactKeys(input, expectedKeys) &&
    input["specVersion"] === GENERIC_JOB_DOCUMENT_SPEC_VERSION &&
    typeof input["sourceId"] === "string" &&
    UUID_V7.test(input["sourceId"]) &&
    isCanonicalInstant(input["capturedAt"]) &&
    typeof input["createCandidateId"] === "function"
  );
}

export function extractSelectedTextV1(input: SelectedTextInputV1): SelectedTextExtractionV1 {
  const untrusted = input as unknown;
  if (
    !isRecord(untrusted) ||
    !validBoundaryMetadata(untrusted, SELECTED_TEXT_INPUT_KEYS) ||
    typeof untrusted["selectedText"] !== "string" ||
    untrusted["selectedText"].length > GENERIC_JOB_DOCUMENT_LIMITS.maxSelectedTextLength
  ) {
    throw new GenericJobDocumentError("input_invalid");
  }
  const selectedText = untrusted["selectedText"];
  const sourceId = untrusted["sourceId"] as string;
  const capturedAt = untrusted["capturedAt"] as string;
  const normalized = normalizeText(selectedText, GENERIC_JOB_DOCUMENT_LIMITS.maxSelectedTextLength);
  if (normalized === null) throw new GenericJobDocumentError("input_invalid");

  const candidates = buildCandidates(
    [
      {
        fieldName: "description",
        value: normalized,
        rawValue: selectedText,
        pointer: "/content/selectedText",
        method: "selector",
        confidence: 0.98,
      },
    ],
    {
      sourceId,
      capturedAt,
      extractor: SELECTED_TEXT_EXTRACTOR,
      licenseNote: "User-selected page text; compare with the visible source before confirmation.",
      createCandidateId: untrusted["createCandidateId"] as SelectedTextInputV1["createCandidateId"],
    },
  );

  return Object.freeze({
    specVersion: GENERIC_JOB_DOCUMENT_SPEC_VERSION,
    extractor: SELECTED_TEXT_EXTRACTOR,
    candidates,
    warnings: Object.freeze([]),
    summary: Object.freeze({
      inputCharacters: selectedText.length,
      normalizedCharacters: normalized.length,
      candidateCount: candidates.length,
    }),
  });
}

function elementPointer(element: Element): string | null {
  const segments: string[] = [];
  let current: Element | null = element;
  while (current !== null) {
    const tagName = current.tagName.toLocaleLowerCase("en-US");
    let position = 1;
    let sibling = current.previousElementSibling;
    while (sibling !== null) {
      if (sibling.tagName.toLocaleLowerCase("en-US") === tagName) position += 1;
      sibling = sibling.previousElementSibling;
    }
    segments.unshift(`${tagName}[${String(position)}]`);
    current = current.parentElement;
  }
  const pointer = `/document/${segments.join("/")}`;
  return pointer.length <= 2_000 ? pointer : null;
}

function removeElement(element: Element): void {
  element.parentNode?.removeChild(element);
}

function countAndValidateDocument(document: Document): number {
  try {
    const elements = Array.from(document.querySelectorAll("*"));
    if (elements.length > GENERIC_JOB_DOCUMENT_LIMITS.maxDocumentElements) {
      throw new GenericJobDocumentError("document_limit_exceeded");
    }
    for (const element of elements) {
      let depth = 0;
      let current: Element | null = element;
      while (current !== null) {
        depth += 1;
        if (depth > GENERIC_JOB_DOCUMENT_LIMITS.maxDocumentDepth) {
          throw new GenericJobDocumentError("document_limit_exceeded");
        }
        current = current.parentElement;
      }
    }
    return elements.length;
  } catch (error) {
    if (error instanceof GenericJobDocumentError) throw error;
    throw new GenericJobDocumentError("document_invalid");
  }
}

function scrubDocument(document: Document): number {
  let removed = 0;
  const remove = (element: Element): void => {
    if (element.parentNode === null) return;
    removeElement(element);
    removed += 1;
  };
  for (const element of Array.from(document.querySelectorAll(SCRUB_SELECTORS))) remove(element);
  for (const element of Array.from(document.querySelectorAll("[class], [id], [style]"))) {
    const classAndId = `${element.getAttribute("class") ?? ""} ${element.getAttribute("id") ?? ""}`;
    const inlineStyle = element.getAttribute("style") ?? "";
    if (BOILERPLATE_TOKEN.test(classAndId) || INLINE_HIDDEN.test(inlineStyle)) remove(element);
  }
  return removed;
}

function safeHttpUrl(value: string): boolean {
  if (value.length === 0 || value.length > 8_192) return false;
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.username === "" &&
      parsed.password === ""
    );
  } catch {
    return false;
  }
}

function collectLabeledValues(document: Document): readonly LabeledValue[] {
  const values: LabeledValue[] = [];
  for (const labelElement of Array.from(document.querySelectorAll("dt"))) {
    const valueElement = labelElement.nextElementSibling;
    if (valueElement?.tagName.toLocaleLowerCase("en-US") === "dd") {
      values.push({ labelElement, valueElement });
    }
  }
  for (const row of Array.from(document.querySelectorAll("tr"))) {
    const labelElement = row.querySelector("th");
    const valueElement = row.querySelector("td");
    if (labelElement !== null && valueElement !== null) values.push({ labelElement, valueElement });
  }
  return values;
}

function requirementTexts(element: Element): readonly Element[] {
  const items = Array.from(element.querySelectorAll("li"));
  if (items.length > 0) return items;
  return [element];
}

function requirementSectionElements(heading: Element): readonly Element[] {
  const elements: Element[] = [];
  let sibling = heading.nextElementSibling;
  while (sibling !== null) {
    if (/^H[1-6]$/u.test(sibling.tagName)) break;
    elements.push(...requirementTexts(sibling));
    sibling = sibling.nextElementSibling;
  }
  return elements;
}

function optionalReadableText(
  value: string | null | undefined,
  maximum: number,
): string | undefined {
  if (value === null || value === undefined) return undefined;
  return normalizeText(value, maximum) ?? undefined;
}

export function extractGenericJobDocumentV1(
  input: GenericJobDocumentInputV1,
): GenericJobDocumentExtractionV1 {
  const untrusted = input as unknown;
  if (
    !isRecord(untrusted) ||
    !validBoundaryMetadata(untrusted, DOCUMENT_INPUT_KEYS) ||
    !isDocumentLike(untrusted["document"])
  ) {
    throw new GenericJobDocumentError("input_invalid");
  }
  const inputDocument = untrusted["document"];
  const inputElementCount = countAndValidateDocument(inputDocument);
  let document: Document;
  try {
    const cloned = inputDocument.cloneNode(true);
    if (!isDocumentLike(cloned)) throw new GenericJobDocumentError("document_invalid");
    document = cloned;
  } catch (error) {
    if (error instanceof GenericJobDocumentError) throw error;
    throw new GenericJobDocumentError("document_invalid");
  }

  let removedElementCount: number;
  try {
    removedElementCount = scrubDocument(document);
  } catch {
    throw new GenericJobDocumentError("document_invalid");
  }
  const retainedElementCount = countAndValidateDocument(document);
  const retainedText = document.documentElement.textContent;
  if (retainedText.length > GENERIC_JOB_DOCUMENT_LIMITS.maxDocumentTextLength) {
    throw new GenericJobDocumentError("content_limit_exceeded");
  }

  const warnings: GenericJobDocumentWarningV1[] = [];
  const warningKeys = new Set<string>();
  const drafts: CandidateDraft[] = [];
  const draftKeys = new Set<string>();
  let requirementCount = 0;

  const warn = (
    code: GenericJobDocumentWarningCode,
    pointer: string,
    fieldName: GenericJobDocumentFieldName | null = null,
  ): void => {
    const key = `${code}\u0000${pointer}\u0000${fieldName ?? ""}`;
    if (warningKeys.has(key)) return;
    warningKeys.add(key);
    warnings.push(Object.freeze({ code, fieldName, pointer }));
  };

  const addDraft = (draft: CandidateDraft): void => {
    const key = `${draft.fieldName}\u0000${draft.pointer}\u0000${JSON.stringify(draft.rawValue)}`;
    if (draftKeys.has(key)) return;
    draftKeys.add(key);
    drafts.push(draft);
    if (drafts.length > GENERIC_JOB_DOCUMENT_LIMITS.maxCandidates) {
      throw new GenericJobDocumentError("candidate_limit_exceeded");
    }
  };

  const addElementText = (
    element: Element,
    fieldName: GenericJobDocumentFieldName,
    confidence: number,
  ): void => {
    const pointer = elementPointer(element);
    const rawValue = element.textContent;
    const value = normalizeText(rawValue, GENERIC_JOB_DOCUMENT_LIMITS.maxShortTextLength);
    if (pointer === null || value === null) {
      warn("field_invalid", pointer ?? "/document", fieldName);
      return;
    }
    addDraft({ fieldName, value, rawValue, pointer, method: "selector", confidence });
  };

  for (const heading of Array.from(document.querySelectorAll("h1"))) {
    addElementText(heading, "title", 0.82);
  }
  for (const meta of Array.from(
    document.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]'),
  )) {
    const pointer = elementPointer(meta);
    const rawValue = meta.getAttribute("content") ?? "";
    const value = normalizeText(rawValue, GENERIC_JOB_DOCUMENT_LIMITS.maxShortTextLength);
    if (pointer === null || value === null) {
      warn("field_invalid", pointer ?? "/document/head", "title");
      continue;
    }
    addDraft({
      fieldName: "title",
      value,
      rawValue,
      pointer: `${pointer}/@content`,
      method: "selector",
      confidence: 0.62,
    });
  }
  const titleElement = document.querySelector("title");
  if (titleElement !== null) addElementText(titleElement, "title", 0.52);

  for (const { labelElement, valueElement } of collectLabeledValues(document)) {
    const label = normalizedLabel(labelElement.textContent);
    if (label === null) continue;
    const category = REQUIREMENT_LABELS.get(label);
    if (category !== undefined) {
      for (const element of requirementTexts(valueElement)) {
        if (requirementCount >= GENERIC_JOB_DOCUMENT_LIMITS.maxRequirementCandidates) {
          throw new GenericJobDocumentError("candidate_limit_exceeded");
        }
        const pointer = elementPointer(element);
        const rawValue = element.textContent;
        const content = normalizeText(rawValue, GENERIC_JOB_DOCUMENT_LIMITS.maxShortTextLength);
        if (pointer === null || content === null) {
          warn("field_invalid", pointer ?? "/document", "requirements");
          continue;
        }
        addDraft({
          fieldName: "requirements",
          value: { category, content },
          rawValue,
          pointer,
          method: "selector",
          confidence: 0.8,
        });
        requirementCount += 1;
      }
      continue;
    }

    const rule = LABEL_RULES.get(label);
    if (rule === undefined) continue;
    const pointer = elementPointer(valueElement);
    let rawValue = valueElement.textContent;
    let value = normalizeText(rawValue, GENERIC_JOB_DOCUMENT_LIMITS.maxShortTextLength);
    let valuePointer = pointer;
    if (rule.fieldName === "apply_url") {
      const anchor = valueElement.matches("a[href]")
        ? valueElement
        : valueElement.querySelector("a[href]");
      const href = anchor?.getAttribute("href") ?? "";
      if (safeHttpUrl(href)) {
        value = href;
        rawValue = href;
        const anchorPointer = anchor === null ? null : elementPointer(anchor);
        valuePointer = anchorPointer === null ? null : `${anchorPointer}/@href`;
      } else if (value === null || !safeHttpUrl(value)) {
        value = null;
      }
    }
    if (pointer === null || valuePointer === null || value === null) {
      warn("labeled_value_missing", elementPointer(labelElement) ?? "/document", rule.fieldName);
      continue;
    }
    addDraft({
      fieldName: rule.fieldName,
      value,
      rawValue,
      pointer: valuePointer,
      method: "selector",
      confidence: rule.confidence,
    });
  }

  for (const heading of Array.from(document.querySelectorAll("h2, h3, h4, h5, h6"))) {
    const label = normalizedLabel(heading.textContent);
    const category = label === null ? undefined : REQUIREMENT_LABELS.get(label);
    if (category === undefined) continue;
    for (const element of requirementSectionElements(heading)) {
      if (requirementCount >= GENERIC_JOB_DOCUMENT_LIMITS.maxRequirementCandidates) {
        throw new GenericJobDocumentError("candidate_limit_exceeded");
      }
      const pointer = elementPointer(element);
      const rawValue = element.textContent;
      const content = normalizeText(rawValue, GENERIC_JOB_DOCUMENT_LIMITS.maxShortTextLength);
      if (pointer === null || content === null) {
        warn("field_invalid", pointer ?? "/document", "requirements");
        continue;
      }
      addDraft({
        fieldName: "requirements",
        value: { category, content },
        rawValue,
        pointer,
        method: "selector",
        confidence: 0.78,
      });
      requirementCount += 1;
    }
  }

  let readableContent: GenericReadableContentV1 | null = null;
  try {
    const readabilityDocument = document.cloneNode(true);
    if (!isDocumentLike(readabilityDocument)) {
      throw new GenericJobDocumentError("document_invalid");
    }
    const likelyReadable = isProbablyReaderable(readabilityDocument, {
      minContentLength: 100,
      minScore: 10,
      visibilityChecker: () => true,
    });
    const article = new Readability(readabilityDocument, {
      maxElemsToParse: GENERIC_JOB_DOCUMENT_LIMITS.maxDocumentElements,
      charThreshold: 120,
      disableJSONLD: true,
    }).parse();
    const rawReadableText = article?.textContent ?? "";
    if (rawReadableText.length > GENERIC_JOB_DOCUMENT_LIMITS.maxReadableTextLength) {
      throw new GenericJobDocumentError("content_limit_exceeded");
    }
    const textContent = normalizeText(
      rawReadableText,
      GENERIC_JOB_DOCUMENT_LIMITS.maxReadableTextLength,
    );
    if (!likelyReadable || article === null || textContent === null || textContent.length < 120) {
      warn("readability_not_available", "/content/readableText", "description");
    } else {
      const title = optionalReadableText(
        article.title,
        GENERIC_JOB_DOCUMENT_LIMITS.maxShortTextLength,
      );
      const excerpt = optionalReadableText(
        article.excerpt,
        GENERIC_JOB_DOCUMENT_LIMITS.maxShortTextLength,
      );
      const byline = optionalReadableText(article.byline, 1_024);
      const siteName = optionalReadableText(article.siteName, 1_024);
      const language = optionalReadableText(article.lang, 128);
      readableContent = deepFreeze({
        textContent,
        ...(title === undefined ? {} : { title }),
        ...(excerpt === undefined ? {} : { excerpt }),
        ...(byline === undefined ? {} : { byline }),
        ...(siteName === undefined ? {} : { siteName }),
        ...(language === undefined ? {} : { language }),
      });
      addDraft({
        fieldName: "description",
        value: textContent,
        rawValue: textContent,
        pointer: "/content/readableText",
        method: "readability",
        confidence: 0.68,
      });
    }
  } catch (error) {
    if (error instanceof GenericJobDocumentError) throw error;
    throw new GenericJobDocumentError("readability_failed");
  }

  const candidates = buildCandidates(drafts, {
    sourceId: untrusted["sourceId"] as string,
    capturedAt: untrusted["capturedAt"] as string,
    extractor: GENERIC_JOB_DOCUMENT_EXTRACTOR,
    licenseNote:
      "User-invoked page DOM; generic extraction is provisional and requires visible-source review.",
    createCandidateId: untrusted[
      "createCandidateId"
    ] as GenericJobDocumentInputV1["createCandidateId"],
  });
  const summary = Object.freeze({
    inputElementCount,
    retainedElementCount,
    removedElementCount,
    readabilityAccepted: readableContent !== null,
    candidateCount: candidates.length,
    warningCount: warnings.length,
  });
  return Object.freeze({
    specVersion: GENERIC_JOB_DOCUMENT_SPEC_VERSION,
    extractor: GENERIC_JOB_DOCUMENT_EXTRACTOR,
    readableContent,
    candidates,
    warnings: Object.freeze(warnings),
    summary,
  });
}
