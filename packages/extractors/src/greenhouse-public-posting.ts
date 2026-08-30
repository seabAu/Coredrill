import {
  fieldCandidateV1Schema,
  type FieldCandidateV1,
  type JsonValue,
} from "@coredrill/contracts";

export const GREENHOUSE_PUBLIC_POSTING_SPEC_VERSION = 1 as const;

export const GREENHOUSE_PUBLIC_POSTING_EXTRACTOR = Object.freeze({
  name: "coredrill.greenhouse-public-posting",
  version: "1.0.0",
});

export const GREENHOUSE_PUBLIC_POSTING_LIMITS = Object.freeze({
  maxPayloadKeys: 128,
  maxCandidates: 32,
  maxPayRanges: 32,
  maxBoardTokenLength: 128,
  maxShortTextLength: 4_096,
  maxDescriptionLength: 512 * 1_024,
  maxUrlLength: 8_192,
});

export const GREENHOUSE_PUBLIC_POSTING_FIELD_NAMES = [
  "title",
  "company",
  "description",
  "locations",
  "posted_at",
  "valid_through",
  "apply_url",
  "external_id",
  "salary",
] as const;
export type GreenhousePublicPostingFieldName =
  (typeof GREENHOUSE_PUBLIC_POSTING_FIELD_NAMES)[number];

export const GREENHOUSE_PUBLIC_POSTING_WARNING_CODES = [
  "required_field_missing_or_invalid",
  "field_invalid",
] as const;
export type GreenhousePublicPostingWarningCode =
  (typeof GREENHOUSE_PUBLIC_POSTING_WARNING_CODES)[number];

export const GREENHOUSE_PUBLIC_POSTING_ERROR_CODES = [
  "input_invalid",
  "payload_invalid",
  "job_id_mismatch",
  "applicant_data_rejected",
  "candidate_limit_exceeded",
  "candidate_invalid",
  "candidate_id_invalid",
] as const;
export type GreenhousePublicPostingErrorCode =
  (typeof GREENHOUSE_PUBLIC_POSTING_ERROR_CODES)[number];

export interface GreenhousePostingCandidateIdContextV1 {
  readonly index: number;
  readonly fieldName: GreenhousePublicPostingFieldName;
  readonly pointer: string;
}

export interface GreenhousePublicPostingInputV1 {
  readonly specVersion: 1;
  readonly sourceId: string;
  readonly capturedAt: string;
  readonly boardToken: string;
  readonly jobId: number;
  readonly payload: unknown;
  readonly createCandidateId: (context: GreenhousePostingCandidateIdContextV1) => string;
}

export interface GreenhousePublicPostingWarningV1 {
  readonly code: GreenhousePublicPostingWarningCode;
  readonly fieldName: GreenhousePublicPostingFieldName | null;
  readonly pointer: string;
}

export interface GreenhousePublicPostingSummaryV1 {
  readonly jobId: number;
  readonly completePosting: boolean;
  readonly payRangesSeen: number;
  readonly payRangesAccepted: number;
  readonly candidateCount: number;
  readonly warningCount: number;
}

export interface GreenhousePublicPostingExtractionV1 {
  readonly specVersion: 1;
  readonly extractor: typeof GREENHOUSE_PUBLIC_POSTING_EXTRACTOR;
  readonly candidates: readonly FieldCandidateV1[];
  readonly warnings: readonly GreenhousePublicPostingWarningV1[];
  readonly summary: GreenhousePublicPostingSummaryV1;
}

/** Content-free failure for malformed or out-of-policy Greenhouse inputs. */
export class GreenhousePublicPostingError extends Error {
  public constructor(public readonly code: GreenhousePublicPostingErrorCode) {
    super("Greenhouse public posting extraction rejected invalid input.");
    this.name = "GreenhousePublicPostingError";
  }
}

interface CandidateDraft {
  readonly fieldName: GreenhousePublicPostingFieldName;
  readonly value: JsonValue;
  readonly rawValue: JsonValue;
  readonly pointer: string;
  readonly confidence: number;
}

const INPUT_KEYS = Object.freeze([
  "specVersion",
  "sourceId",
  "capturedAt",
  "boardToken",
  "jobId",
  "payload",
  "createCandidateId",
]);
const FORBIDDEN_APPLICANT_FIELDS = Object.freeze([
  "questions",
  "location_questions",
  "compliance",
  "demographic_questions",
  "data_compliance",
]);
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const BOARD_TOKEN = /^[A-Za-z0-9_-]{1,128}$/u;
const CURRENCY = /^[A-Z]{3}$/u;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function normalizedText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) return null;
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length === 0 ? null : normalized;
}

function exactNonBlankText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) return null;
  return value.trim().length === 0 ? null : value;
}

function parseableDateText(value: unknown): string | null {
  const text = normalizedText(value, GREENHOUSE_PUBLIC_POSTING_LIMITS.maxShortTextLength);
  return text !== null && Number.isFinite(Date.parse(text)) ? text : null;
}

function safeHttpUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > GREENHOUSE_PUBLIC_POSTING_LIMITS.maxUrlLength ||
    value.trim() !== value
  ) {
    return null;
  }
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.username === "" &&
      parsed.password === ""
      ? value
      : null;
  } catch {
    return null;
  }
}

function sourceExcerpt(value: JsonValue): string | undefined {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length === 0) return undefined;
  return text.slice(0, GREENHOUSE_PUBLIC_POSTING_LIMITS.maxShortTextLength);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function extractGreenhousePublicPostingV1(
  input: GreenhousePublicPostingInputV1,
): GreenhousePublicPostingExtractionV1 {
  const untrusted = input as unknown;
  if (
    !isPlainRecord(untrusted) ||
    !hasExactKeys(untrusted, INPUT_KEYS) ||
    untrusted["specVersion"] !== GREENHOUSE_PUBLIC_POSTING_SPEC_VERSION ||
    typeof untrusted["sourceId"] !== "string" ||
    !UUID_V7.test(untrusted["sourceId"]) ||
    !isCanonicalInstant(untrusted["capturedAt"]) ||
    typeof untrusted["boardToken"] !== "string" ||
    !BOARD_TOKEN.test(untrusted["boardToken"]) ||
    typeof untrusted["jobId"] !== "number" ||
    !Number.isSafeInteger(untrusted["jobId"]) ||
    untrusted["jobId"] <= 0 ||
    typeof untrusted["createCandidateId"] !== "function"
  ) {
    throw new GreenhousePublicPostingError("input_invalid");
  }
  if (
    !isPlainRecord(untrusted["payload"]) ||
    Object.keys(untrusted["payload"]).length > GREENHOUSE_PUBLIC_POSTING_LIMITS.maxPayloadKeys
  ) {
    throw new GreenhousePublicPostingError("payload_invalid");
  }
  const payload = untrusted["payload"];
  if (FORBIDDEN_APPLICANT_FIELDS.some((field) => Object.hasOwn(payload, field))) {
    throw new GreenhousePublicPostingError("applicant_data_rejected");
  }
  if (
    typeof payload["id"] !== "number" ||
    !Number.isSafeInteger(payload["id"]) ||
    payload["id"] <= 0
  ) {
    throw new GreenhousePublicPostingError("payload_invalid");
  }
  if (payload["id"] !== untrusted["jobId"]) {
    throw new GreenhousePublicPostingError("job_id_mismatch");
  }
  const createCandidateId = untrusted["createCandidateId"] as (
    context: GreenhousePostingCandidateIdContextV1,
  ) => string;

  const drafts: CandidateDraft[] = [];
  const warnings: GreenhousePublicPostingWarningV1[] = [];
  const warn = (
    code: GreenhousePublicPostingWarningCode,
    pointer: string,
    fieldName: GreenhousePublicPostingFieldName | null,
  ): void => {
    warnings.push(Object.freeze({ code, fieldName, pointer }));
  };
  const add = (draft: CandidateDraft): void => {
    drafts.push(Object.freeze(draft));
    if (drafts.length > GREENHOUSE_PUBLIC_POSTING_LIMITS.maxCandidates) {
      throw new GreenhousePublicPostingError("candidate_limit_exceeded");
    }
  };
  const addRequiredText = (
    sourceField: string,
    fieldName: GreenhousePublicPostingFieldName,
    maximum: number,
    confidence: number,
    exact = false,
  ): boolean => {
    const raw = payload[sourceField];
    const value = exact ? exactNonBlankText(raw, maximum) : normalizedText(raw, maximum);
    const pointer = `/content/greenhouse/${sourceField}`;
    if (value === null || typeof raw !== "string") {
      warn("required_field_missing_or_invalid", pointer, fieldName);
      return false;
    }
    add({ fieldName, value, rawValue: raw, pointer, confidence });
    return true;
  };

  const titleAccepted = addRequiredText(
    "title",
    "title",
    GREENHOUSE_PUBLIC_POSTING_LIMITS.maxShortTextLength,
    0.99,
  );
  const companyAccepted = addRequiredText(
    "company_name",
    "company",
    GREENHOUSE_PUBLIC_POSTING_LIMITS.maxShortTextLength,
    0.99,
  );
  const descriptionAccepted = addRequiredText(
    "content",
    "description",
    GREENHOUSE_PUBLIC_POSTING_LIMITS.maxDescriptionLength,
    0.96,
    true,
  );

  if (payload["location"] !== undefined) {
    const location = payload["location"];
    const rawName = isPlainRecord(location) ? location["name"] : undefined;
    const name = normalizedText(rawName, GREENHOUSE_PUBLIC_POSTING_LIMITS.maxShortTextLength);
    if (name === null || typeof rawName !== "string") {
      warn("field_invalid", "/content/greenhouse/location", "locations");
    } else {
      add({
        fieldName: "locations",
        value: name,
        rawValue: { name: rawName },
        pointer: "/content/greenhouse/location/name",
        confidence: 0.98,
      });
    }
  }

  const addOptionalDate = (
    sourceField: "first_published" | "application_deadline",
    fieldName: "posted_at" | "valid_through",
  ): void => {
    if (payload[sourceField] === undefined || payload[sourceField] === null) return;
    const value = parseableDateText(payload[sourceField]);
    const pointer = `/content/greenhouse/${sourceField}`;
    if (value === null || typeof payload[sourceField] !== "string") {
      warn("field_invalid", pointer, fieldName);
      return;
    }
    add({ fieldName, value, rawValue: payload[sourceField], pointer, confidence: 0.98 });
  };
  addOptionalDate("first_published", "posted_at");
  addOptionalDate("application_deadline", "valid_through");

  if (payload["absolute_url"] !== undefined && payload["absolute_url"] !== null) {
    const value = safeHttpUrl(payload["absolute_url"]);
    if (value === null || typeof payload["absolute_url"] !== "string") {
      warn("field_invalid", "/content/greenhouse/absolute_url", "apply_url");
    } else {
      add({
        fieldName: "apply_url",
        value,
        rawValue: payload["absolute_url"],
        pointer: "/content/greenhouse/absolute_url",
        confidence: 0.99,
      });
    }
  }

  add({
    fieldName: "external_id",
    value: payload["id"],
    rawValue: payload["id"],
    pointer: "/content/greenhouse/id",
    confidence: 1,
  });

  let payRangesSeen = 0;
  let payRangesAccepted = 0;
  if (payload["pay_input_ranges"] !== undefined && payload["pay_input_ranges"] !== null) {
    const ranges = payload["pay_input_ranges"];
    if (!Array.isArray(ranges) || ranges.length > GREENHOUSE_PUBLIC_POSTING_LIMITS.maxPayRanges) {
      throw new GreenhousePublicPostingError("payload_invalid");
    }
    payRangesSeen = ranges.length;
    for (const [index, range] of ranges.entries()) {
      const pointer = `/content/greenhouse/pay_input_ranges/${String(index)}`;
      if (!isPlainRecord(range)) {
        warn("field_invalid", pointer, "salary");
        continue;
      }
      const minimum = range["min_cents"];
      const maximum = range["max_cents"];
      const currency = range["currency_type"];
      const title = range["title"];
      const blurb = range["blurb"];
      if (
        typeof minimum !== "number" ||
        !Number.isSafeInteger(minimum) ||
        minimum < 0 ||
        typeof maximum !== "number" ||
        !Number.isSafeInteger(maximum) ||
        maximum < minimum ||
        typeof currency !== "string" ||
        !CURRENCY.test(currency) ||
        (title !== undefined &&
          normalizedText(title, GREENHOUSE_PUBLIC_POSTING_LIMITS.maxShortTextLength) === null) ||
        (blurb !== undefined &&
          normalizedText(blurb, GREENHOUSE_PUBLIC_POSTING_LIMITS.maxShortTextLength) === null)
      ) {
        warn("field_invalid", pointer, "salary");
        continue;
      }
      const value: JsonValue = {
        min_cents: minimum,
        max_cents: maximum,
        currency_type: currency,
        ...(typeof title === "string" ? { title } : {}),
        ...(typeof blurb === "string" ? { blurb } : {}),
      };
      add({ fieldName: "salary", value, rawValue: value, pointer, confidence: 0.98 });
      payRangesAccepted += 1;
    }
  }

  const seenIds = new Set<string>();
  const candidates = drafts.map((draft, index) => {
    let id: string;
    try {
      id = createCandidateId({
        index,
        fieldName: draft.fieldName,
        pointer: draft.pointer,
      });
    } catch {
      throw new GreenhousePublicPostingError("candidate_id_invalid");
    }
    if (typeof id !== "string" || !UUID_V7.test(id) || seenIds.has(id)) {
      throw new GreenhousePublicPostingError("candidate_id_invalid");
    }
    seenIds.add(id);
    const parsed = fieldCandidateV1Schema.safeParse({
      specVersion: 1,
      id,
      fieldName: draft.fieldName,
      value: draft.value,
      rawValue: draft.rawValue,
      provenance: {
        specVersion: 1,
        source: {
          sourceType: "greenhouse_api",
          sourceId: untrusted["sourceId"],
          pointer: draft.pointer,
        },
        method: "api",
        extractor: GREENHOUSE_PUBLIC_POSTING_EXTRACTOR,
        capturedAt: untrusted["capturedAt"],
        confidence: draft.confidence,
        ...(sourceExcerpt(draft.rawValue) === undefined
          ? {}
          : { sourceExcerpt: sourceExcerpt(draft.rawValue) }),
        licenseNote:
          "Public Greenhouse Job Board API posting; attribute the source and verify against the visible job page before confirmation.",
      },
    });
    if (!parsed.success) throw new GreenhousePublicPostingError("candidate_invalid");
    return deepFreeze(parsed.data);
  });

  return deepFreeze({
    specVersion: GREENHOUSE_PUBLIC_POSTING_SPEC_VERSION,
    extractor: GREENHOUSE_PUBLIC_POSTING_EXTRACTOR,
    candidates,
    warnings,
    summary: {
      jobId: untrusted["jobId"],
      completePosting: titleAccepted && companyAccepted && descriptionAccepted,
      payRangesSeen,
      payRangesAccepted,
      candidateCount: candidates.length,
      warningCount: warnings.length,
    },
  });
}
