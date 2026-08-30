import {
  fieldCandidateV1Schema,
  type FieldCandidateV1,
  type JsonValue,
} from "@coredrill/contracts";

export const LEVER_PUBLIC_POSTING_SPEC_VERSION = 1 as const;

export const LEVER_PUBLIC_POSTING_EXTRACTOR = Object.freeze({
  name: "coredrill.lever-public-posting",
  version: "1.0.0",
});

export const LEVER_PUBLIC_POSTING_REGIONS = ["global", "eu"] as const;
export type LeverPublicPostingRegion = (typeof LEVER_PUBLIC_POSTING_REGIONS)[number];

export const LEVER_PUBLIC_POSTING_LIMITS = Object.freeze({
  maxPayloadKeys: 128,
  maxCategoryKeys: 32,
  maxCandidates: 128,
  maxLocations: 64,
  maxLists: 64,
  maxSiteLength: 128,
  maxShortTextLength: 4_096,
  maxDescriptionLength: 512 * 1_024,
  maxListContentLength: 128 * 1_024,
  maxUrlLength: 8_192,
});

export const LEVER_PUBLIC_POSTING_FIELD_NAMES = [
  "title",
  "description",
  "locations",
  "workplace_type",
  "employment_type",
  "requirements",
  "apply_url",
  "external_id",
  "salary",
] as const;
export type LeverPublicPostingFieldName = (typeof LEVER_PUBLIC_POSTING_FIELD_NAMES)[number];

export const LEVER_PUBLIC_POSTING_WARNING_CODES = [
  "required_field_missing_or_invalid",
  "field_invalid",
] as const;
export type LeverPublicPostingWarningCode = (typeof LEVER_PUBLIC_POSTING_WARNING_CODES)[number];

export const LEVER_PUBLIC_POSTING_ERROR_CODES = [
  "input_invalid",
  "payload_invalid",
  "posting_id_mismatch",
  "applicant_data_rejected",
  "candidate_limit_exceeded",
  "candidate_invalid",
  "candidate_id_invalid",
] as const;
export type LeverPublicPostingErrorCode = (typeof LEVER_PUBLIC_POSTING_ERROR_CODES)[number];

export interface LeverPostingCandidateIdContextV1 {
  readonly index: number;
  readonly fieldName: LeverPublicPostingFieldName;
  readonly pointer: string;
}

export interface LeverPublicPostingInputV1 {
  readonly specVersion: 1;
  readonly sourceId: string;
  readonly capturedAt: string;
  readonly region: LeverPublicPostingRegion;
  readonly site: string;
  readonly postingId: string;
  readonly payload: unknown;
  readonly createCandidateId: (context: LeverPostingCandidateIdContextV1) => string;
}

export interface LeverPublicPostingWarningV1 {
  readonly code: LeverPublicPostingWarningCode;
  readonly fieldName: LeverPublicPostingFieldName | null;
  readonly pointer: string;
}

export interface LeverPublicPostingSummaryV1 {
  readonly postingId: string;
  readonly completePosting: boolean;
  readonly locationsSeen: number;
  readonly locationsAccepted: number;
  readonly listsSeen: number;
  readonly listsAccepted: number;
  readonly salaryAccepted: boolean;
  readonly candidateCount: number;
  readonly warningCount: number;
}

export interface LeverPublicPostingExtractionV1 {
  readonly specVersion: 1;
  readonly extractor: typeof LEVER_PUBLIC_POSTING_EXTRACTOR;
  readonly candidates: readonly FieldCandidateV1[];
  readonly warnings: readonly LeverPublicPostingWarningV1[];
  readonly summary: LeverPublicPostingSummaryV1;
}

/** Content-free failure for malformed or out-of-policy Lever inputs. */
export class LeverPublicPostingError extends Error {
  public constructor(public readonly code: LeverPublicPostingErrorCode) {
    super("Lever public posting extraction rejected invalid input.");
    this.name = "LeverPublicPostingError";
  }
}

interface CandidateDraft {
  readonly fieldName: LeverPublicPostingFieldName;
  readonly value: JsonValue;
  readonly rawValue: JsonValue;
  readonly pointer: string;
  readonly confidence: number;
}

const INPUT_KEYS = Object.freeze([
  "specVersion",
  "sourceId",
  "capturedAt",
  "region",
  "site",
  "postingId",
  "payload",
  "createCandidateId",
]);
const FORBIDDEN_APPLICANT_FIELDS = Object.freeze([
  "name",
  "email",
  "resume",
  "phone",
  "org",
  "urls",
  "comments",
  "silent",
  "source",
  "ip",
  "timezone",
  "userAgent",
  "acceptLanguage",
  "referer",
  "consent",
  "opportunityLocation",
  "applicationId",
  "candidate",
  "candidates",
  "questions",
  "customQuestions",
  "key",
]);
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const POSTING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SITE = /^[a-z0-9][a-z0-9_-]{0,127}$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const WORKPLACE_TYPES = new Set(["on-site", "remote", "hybrid"]);

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

function isRegion(value: unknown): value is LeverPublicPostingRegion {
  return (
    typeof value === "string" &&
    LEVER_PUBLIC_POSTING_REGIONS.includes(value as LeverPublicPostingRegion)
  );
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

function safeLeverUrl(
  value: unknown,
  region: LeverPublicPostingRegion,
  site: string,
  postingId: string,
  application: boolean,
): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > LEVER_PUBLIC_POSTING_LIMITS.maxUrlLength ||
    value.trim() !== value
  ) {
    return null;
  }
  try {
    const parsed = new URL(value);
    const expectedHost = region === "global" ? "jobs.lever.co" : "jobs.eu.lever.co";
    const expectedPath = `/${site}/${postingId}${application ? "/apply" : ""}`;
    return parsed.protocol === "https:" &&
      parsed.hostname.toLowerCase() === expectedHost &&
      parsed.username === "" &&
      parsed.password === "" &&
      (parsed.port === "" || parsed.port === "443") &&
      !parsed.searchParams.has("key") &&
      (parsed.pathname === expectedPath || parsed.pathname === `${expectedPath}/`)
      ? value
      : null;
  } catch {
    return null;
  }
}

function sourceExcerpt(value: JsonValue): string | undefined {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length === 0) return undefined;
  return text.slice(0, LEVER_PUBLIC_POSTING_LIMITS.maxShortTextLength);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function extractLeverPublicPostingV1(
  input: LeverPublicPostingInputV1,
): LeverPublicPostingExtractionV1 {
  const untrusted = input as unknown;
  if (
    !isPlainRecord(untrusted) ||
    !hasExactKeys(untrusted, INPUT_KEYS) ||
    untrusted["specVersion"] !== LEVER_PUBLIC_POSTING_SPEC_VERSION ||
    typeof untrusted["sourceId"] !== "string" ||
    !UUID_V7.test(untrusted["sourceId"]) ||
    !isCanonicalInstant(untrusted["capturedAt"]) ||
    !isRegion(untrusted["region"]) ||
    typeof untrusted["site"] !== "string" ||
    !SITE.test(untrusted["site"]) ||
    typeof untrusted["postingId"] !== "string" ||
    !POSTING_ID.test(untrusted["postingId"]) ||
    typeof untrusted["createCandidateId"] !== "function"
  ) {
    throw new LeverPublicPostingError("input_invalid");
  }
  if (
    !isPlainRecord(untrusted["payload"]) ||
    Object.keys(untrusted["payload"]).length > LEVER_PUBLIC_POSTING_LIMITS.maxPayloadKeys
  ) {
    throw new LeverPublicPostingError("payload_invalid");
  }
  const payload = untrusted["payload"];
  if (FORBIDDEN_APPLICANT_FIELDS.some((field) => Object.hasOwn(payload, field))) {
    throw new LeverPublicPostingError("applicant_data_rejected");
  }
  if (typeof payload["id"] !== "string" || !POSTING_ID.test(payload["id"])) {
    throw new LeverPublicPostingError("payload_invalid");
  }
  if (payload["id"] !== untrusted["postingId"]) {
    throw new LeverPublicPostingError("posting_id_mismatch");
  }
  const createCandidateId = untrusted["createCandidateId"] as (
    context: LeverPostingCandidateIdContextV1,
  ) => string;

  const drafts: CandidateDraft[] = [];
  const warnings: LeverPublicPostingWarningV1[] = [];
  const warn = (
    code: LeverPublicPostingWarningCode,
    pointer: string,
    fieldName: LeverPublicPostingFieldName | null,
  ): void => {
    warnings.push(Object.freeze({ code, fieldName, pointer }));
  };
  const add = (draft: CandidateDraft): void => {
    drafts.push(Object.freeze(draft));
    if (drafts.length > LEVER_PUBLIC_POSTING_LIMITS.maxCandidates) {
      throw new LeverPublicPostingError("candidate_limit_exceeded");
    }
  };
  const addRequiredText = (
    sourceField: "text" | "descriptionPlain",
    fieldName: "title" | "description",
    maximum: number,
    confidence: number,
  ): boolean => {
    const raw = payload[sourceField];
    const value = normalizedText(raw, maximum);
    const pointer = `/content/lever/${sourceField}`;
    if (value === null || typeof raw !== "string") {
      warn("required_field_missing_or_invalid", pointer, fieldName);
      return false;
    }
    add({ fieldName, value, rawValue: raw, pointer, confidence });
    return true;
  };

  const titleAccepted = addRequiredText(
    "text",
    "title",
    LEVER_PUBLIC_POSTING_LIMITS.maxShortTextLength,
    0.99,
  );
  const descriptionAccepted = addRequiredText(
    "descriptionPlain",
    "description",
    LEVER_PUBLIC_POSTING_LIMITS.maxDescriptionLength,
    0.99,
  );

  let locationsSeen = 0;
  let locationsAccepted = 0;
  if (payload["categories"] !== undefined && payload["categories"] !== null) {
    const categories = payload["categories"];
    if (
      !isPlainRecord(categories) ||
      Object.keys(categories).length > LEVER_PUBLIC_POSTING_LIMITS.maxCategoryKeys
    ) {
      throw new LeverPublicPostingError("payload_invalid");
    }
    const allLocations = categories["allLocations"];
    if (allLocations !== undefined && allLocations !== null) {
      if (
        !Array.isArray(allLocations) ||
        allLocations.length > LEVER_PUBLIC_POSTING_LIMITS.maxLocations
      ) {
        throw new LeverPublicPostingError("payload_invalid");
      }
      locationsSeen = allLocations.length;
      for (const [index, raw] of allLocations.entries()) {
        const pointer = `/content/lever/categories/allLocations/${String(index)}`;
        const value = normalizedText(raw, LEVER_PUBLIC_POSTING_LIMITS.maxShortTextLength);
        if (value === null || typeof raw !== "string") {
          warn("field_invalid", pointer, "locations");
          continue;
        }
        add({ fieldName: "locations", value, rawValue: raw, pointer, confidence: 0.99 });
        locationsAccepted += 1;
      }
    }
    if (
      locationsAccepted === 0 &&
      categories["location"] !== undefined &&
      categories["location"] !== null
    ) {
      locationsSeen += 1;
      const raw = categories["location"];
      const value = normalizedText(raw, LEVER_PUBLIC_POSTING_LIMITS.maxShortTextLength);
      if (value === null || typeof raw !== "string") {
        warn("field_invalid", "/content/lever/categories/location", "locations");
      } else {
        add({
          fieldName: "locations",
          value,
          rawValue: raw,
          pointer: "/content/lever/categories/location",
          confidence: 0.98,
        });
        locationsAccepted = 1;
      }
    }

    if (categories["commitment"] !== undefined && categories["commitment"] !== null) {
      const raw = categories["commitment"];
      const value = normalizedText(raw, LEVER_PUBLIC_POSTING_LIMITS.maxShortTextLength);
      if (value === null || typeof raw !== "string") {
        warn("field_invalid", "/content/lever/categories/commitment", "employment_type");
      } else {
        add({
          fieldName: "employment_type",
          value,
          rawValue: raw,
          pointer: "/content/lever/categories/commitment",
          confidence: 0.98,
        });
      }
    }
  }

  if (payload["workplaceType"] !== undefined && payload["workplaceType"] !== null) {
    const raw = payload["workplaceType"];
    if (raw === "unspecified") {
      // Explicitly carries no workplace evidence.
    } else if (typeof raw !== "string" || !WORKPLACE_TYPES.has(raw)) {
      warn("field_invalid", "/content/lever/workplaceType", "workplace_type");
    } else {
      add({
        fieldName: "workplace_type",
        value: raw,
        rawValue: raw,
        pointer: "/content/lever/workplaceType",
        confidence: 0.99,
      });
    }
  }

  let listsSeen = 0;
  let listsAccepted = 0;
  if (payload["lists"] !== undefined && payload["lists"] !== null) {
    const lists = payload["lists"];
    if (!Array.isArray(lists) || lists.length > LEVER_PUBLIC_POSTING_LIMITS.maxLists) {
      throw new LeverPublicPostingError("payload_invalid");
    }
    listsSeen = lists.length;
    for (const [index, entry] of lists.entries()) {
      const pointer = `/content/lever/lists/${String(index)}`;
      if (!isPlainRecord(entry)) {
        warn("field_invalid", pointer, "requirements");
        continue;
      }
      const label = normalizedText(entry["text"], LEVER_PUBLIC_POSTING_LIMITS.maxShortTextLength);
      const content = exactNonBlankText(
        entry["content"],
        LEVER_PUBLIC_POSTING_LIMITS.maxListContentLength,
      );
      if (label === null || content === null) {
        warn("field_invalid", pointer, "requirements");
        continue;
      }
      const value: JsonValue = { label, content_html: content };
      const rawValue: JsonValue = { text: entry["text"] as string, content };
      add({ fieldName: "requirements", value, rawValue, pointer, confidence: 0.96 });
      listsAccepted += 1;
    }
  }

  const hostedUrl = payload["hostedUrl"];
  if (
    hostedUrl !== undefined &&
    hostedUrl !== null &&
    safeLeverUrl(
      hostedUrl,
      untrusted["region"],
      untrusted["site"],
      untrusted["postingId"],
      false,
    ) === null
  ) {
    warn("field_invalid", "/content/lever/hostedUrl", null);
  }

  if (payload["applyUrl"] !== undefined && payload["applyUrl"] !== null) {
    const raw = payload["applyUrl"];
    const value = safeLeverUrl(
      raw,
      untrusted["region"],
      untrusted["site"],
      untrusted["postingId"],
      true,
    );
    if (value === null || typeof raw !== "string") {
      warn("field_invalid", "/content/lever/applyUrl", "apply_url");
    } else {
      add({
        fieldName: "apply_url",
        value,
        rawValue: raw,
        pointer: "/content/lever/applyUrl",
        confidence: 0.99,
      });
    }
  }

  add({
    fieldName: "external_id",
    value: payload["id"],
    rawValue: payload["id"],
    pointer: "/content/lever/id",
    confidence: 1,
  });

  let salaryAccepted = false;
  if (payload["salaryRange"] !== undefined && payload["salaryRange"] !== null) {
    const range = payload["salaryRange"];
    const pointer = "/content/lever/salaryRange";
    if (!isPlainRecord(range)) {
      warn("field_invalid", pointer, "salary");
    } else {
      const currency = range["currency"];
      const interval = normalizedText(
        range["interval"],
        LEVER_PUBLIC_POSTING_LIMITS.maxShortTextLength,
      );
      const minimum = range["min"];
      const maximum = range["max"];
      if (
        typeof currency !== "string" ||
        !CURRENCY.test(currency) ||
        interval === null ||
        typeof minimum !== "number" ||
        !Number.isFinite(minimum) ||
        minimum < 0 ||
        typeof maximum !== "number" ||
        !Number.isFinite(maximum) ||
        maximum < minimum
      ) {
        warn("field_invalid", pointer, "salary");
      } else {
        const value: JsonValue = {
          currency,
          interval,
          min: minimum,
          max: maximum,
        };
        const rawValue: JsonValue = {
          currency,
          interval: range["interval"] as string,
          min: minimum,
          max: maximum,
        };
        add({ fieldName: "salary", value, rawValue, pointer, confidence: 0.98 });
        salaryAccepted = true;
      }
    }
  }

  const seenIds = new Set<string>();
  const candidates = drafts.map((draft, index) => {
    let id: string;
    try {
      id = createCandidateId({ index, fieldName: draft.fieldName, pointer: draft.pointer });
    } catch {
      throw new LeverPublicPostingError("candidate_id_invalid");
    }
    if (typeof id !== "string" || !UUID_V7.test(id) || seenIds.has(id)) {
      throw new LeverPublicPostingError("candidate_id_invalid");
    }
    seenIds.add(id);
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
          sourceType: "lever_api",
          sourceId: untrusted["sourceId"],
          pointer: draft.pointer,
        },
        method: "api",
        extractor: LEVER_PUBLIC_POSTING_EXTRACTOR,
        capturedAt: untrusted["capturedAt"],
        confidence: draft.confidence,
        ...(excerpt === undefined ? {} : { sourceExcerpt: excerpt }),
        licenseNote:
          "Public Lever Postings API evidence; attribute Lever/the employer, treat retained HTML as untrusted text, and verify against the hosted job page before confirmation.",
      },
    });
    if (!parsed.success) throw new LeverPublicPostingError("candidate_invalid");
    return deepFreeze(parsed.data);
  });

  return deepFreeze({
    specVersion: LEVER_PUBLIC_POSTING_SPEC_VERSION,
    extractor: LEVER_PUBLIC_POSTING_EXTRACTOR,
    candidates,
    warnings,
    summary: {
      postingId: untrusted["postingId"],
      completePosting: titleAccepted && descriptionAccepted,
      locationsSeen,
      locationsAccepted,
      listsSeen,
      listsAccepted,
      salaryAccepted,
      candidateCount: candidates.length,
      warningCount: warnings.length,
    },
  });
}
