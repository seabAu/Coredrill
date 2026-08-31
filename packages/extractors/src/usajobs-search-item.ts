import {
  fieldCandidateV1Schema,
  type FieldCandidateV1,
  type JsonValue,
} from "@coredrill/contracts";

export const USAJOBS_SEARCH_ITEM_SPEC_VERSION = 1 as const;

export const USAJOBS_SEARCH_ITEM_EXTRACTOR = Object.freeze({
  name: "coredrill.usajobs-search-item",
  version: "1.0.0",
});

export const USAJOBS_SEARCH_ITEM_LIMITS = Object.freeze({
  maxPayloadKeys: 16,
  maxDescriptorKeys: 128,
  maxUserAreaKeys: 32,
  maxDetailKeys: 128,
  maxCandidates: 256,
  maxLocations: 64,
  maxSchedules: 32,
  maxOfferingTypes: 32,
  maxRequirements: 64,
  maxApplyUrls: 32,
  maxSalaryRanges: 32,
  maxShortTextLength: 4_096,
  maxDescriptionLength: 512 * 1_024,
  maxUrlLength: 8_192,
  maxMatchedObjectIdDigits: 20,
});

export const USAJOBS_SEARCH_ITEM_FIELD_NAMES = [
  "title",
  "company",
  "description",
  "locations",
  "employment_type",
  "requirements",
  "posted_at",
  "valid_through",
  "apply_url",
  "external_id",
  "salary",
] as const;
export type UsaJobsSearchItemFieldName = (typeof USAJOBS_SEARCH_ITEM_FIELD_NAMES)[number];

export const USAJOBS_SEARCH_ITEM_WARNING_CODES = [
  "required_field_missing_or_invalid",
  "field_invalid",
] as const;
export type UsaJobsSearchItemWarningCode = (typeof USAJOBS_SEARCH_ITEM_WARNING_CODES)[number];

export const USAJOBS_SEARCH_ITEM_ERROR_CODES = [
  "input_invalid",
  "payload_invalid",
  "matched_object_id_mismatch",
  "non_public_data_rejected",
  "candidate_limit_exceeded",
  "candidate_invalid",
  "candidate_id_invalid",
] as const;
export type UsaJobsSearchItemErrorCode = (typeof USAJOBS_SEARCH_ITEM_ERROR_CODES)[number];

export interface UsaJobsSearchItemCandidateIdContextV1 {
  readonly index: number;
  readonly fieldName: UsaJobsSearchItemFieldName;
  readonly pointer: string;
}

export interface UsaJobsSearchItemInputV1 {
  readonly specVersion: 1;
  readonly sourceId: string;
  readonly capturedAt: string;
  readonly matchedObjectId: string;
  readonly payload: unknown;
  readonly createCandidateId: (context: UsaJobsSearchItemCandidateIdContextV1) => string;
}

export interface UsaJobsSearchItemWarningV1 {
  readonly code: UsaJobsSearchItemWarningCode;
  readonly fieldName: UsaJobsSearchItemFieldName | null;
  readonly pointer: string;
}

export interface UsaJobsSearchItemSummaryV1 {
  readonly matchedObjectId: string;
  readonly completePosting: boolean;
  readonly descriptionsSeen: number;
  readonly descriptionsAccepted: number;
  readonly locationsSeen: number;
  readonly locationsAccepted: number;
  readonly employmentTypesSeen: number;
  readonly employmentTypesAccepted: number;
  readonly requirementsSeen: number;
  readonly requirementsAccepted: number;
  readonly salaryRangesSeen: number;
  readonly salaryRangesAccepted: number;
  readonly candidateCount: number;
  readonly warningCount: number;
}

export interface UsaJobsSearchItemExtractionV1 {
  readonly specVersion: 1;
  readonly extractor: typeof USAJOBS_SEARCH_ITEM_EXTRACTOR;
  readonly candidates: readonly FieldCandidateV1[];
  readonly warnings: readonly UsaJobsSearchItemWarningV1[];
  readonly summary: UsaJobsSearchItemSummaryV1;
}

/** Content-free failure for malformed or out-of-policy USAJOBS search-item inputs. */
export class UsaJobsSearchItemError extends Error {
  public constructor(public readonly code: UsaJobsSearchItemErrorCode) {
    super("USAJOBS search-item extraction rejected invalid input.");
    this.name = "UsaJobsSearchItemError";
  }
}

interface CandidateDraft {
  readonly fieldName: UsaJobsSearchItemFieldName;
  readonly value: JsonValue;
  readonly rawValue: JsonValue;
  readonly pointer: string;
  readonly confidence: number;
}

const INPUT_KEYS = Object.freeze([
  "specVersion",
  "sourceId",
  "capturedAt",
  "matchedObjectId",
  "payload",
  "createCandidateId",
]);
const NON_PUBLIC_KEYS = Object.freeze([
  "Applicant",
  "Applicants",
  "Candidate",
  "Candidates",
  "Resume",
  "Resumes",
  "UserProfile",
  "Authorization-Key",
  "AuthorizationKey",
  "ApiKey",
]);
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MATCHED_OBJECT_ID = /^[1-9][0-9]{0,19}$/u;
const DECIMAL_AMOUNT = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u;
const ROOT_POINTER = "/content/usajobs/MatchedObjectDescriptor";

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

function exactNonBlankText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) return null;
  return value.trim().length === 0 ? null : value;
}

function exactDateText(value: unknown): string | null {
  const text = exactNonBlankText(value, USAJOBS_SEARCH_ITEM_LIMITS.maxShortTextLength);
  return text !== null && Number.isFinite(Date.parse(text)) ? text : null;
}

function hasNonPublicKey(record: Record<string, unknown>): boolean {
  return NON_PUBLIC_KEYS.some((key) => Object.hasOwn(record, key));
}

function safeUsaJobsUrl(
  value: unknown,
  matchedObjectId: string,
  application: boolean,
): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > USAJOBS_SEARCH_ITEM_LIMITS.maxUrlLength ||
    value.trim() !== value
  ) {
    return null;
  }
  try {
    const parsed = new URL(value);
    const expectedPath = `/GetJob/ViewDetails/${matchedObjectId}`;
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname.toLowerCase() !== "www.usajobs.gov" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      (parsed.port !== "" && parsed.port !== "443") ||
      parsed.pathname !== expectedPath ||
      parsed.hash !== ""
    ) {
      return null;
    }
    if (!application) return parsed.search === "" ? value : null;
    const keys = [...parsed.searchParams.keys()];
    return keys.length === 1 &&
      keys[0] === "PostingChannelID" &&
      parsed.searchParams.getAll("PostingChannelID").length === 1 &&
      parsed.searchParams.get("PostingChannelID") === "RESTAPI"
      ? value
      : null;
  } catch {
    return null;
  }
}

function sourceExcerpt(value: JsonValue): string | undefined {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length === 0) return undefined;
  return text.slice(0, USAJOBS_SEARCH_ITEM_LIMITS.maxShortTextLength);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function extractUsaJobsSearchItemV1(
  input: UsaJobsSearchItemInputV1,
): UsaJobsSearchItemExtractionV1 {
  const untrusted = input as unknown;
  if (
    !isPlainRecord(untrusted) ||
    !hasExactKeys(untrusted, INPUT_KEYS) ||
    untrusted["specVersion"] !== USAJOBS_SEARCH_ITEM_SPEC_VERSION ||
    typeof untrusted["sourceId"] !== "string" ||
    !UUID_V7.test(untrusted["sourceId"]) ||
    !isCanonicalInstant(untrusted["capturedAt"]) ||
    typeof untrusted["matchedObjectId"] !== "string" ||
    !MATCHED_OBJECT_ID.test(untrusted["matchedObjectId"]) ||
    typeof untrusted["createCandidateId"] !== "function"
  ) {
    throw new UsaJobsSearchItemError("input_invalid");
  }
  if (
    !isPlainRecord(untrusted["payload"]) ||
    Object.keys(untrusted["payload"]).length > USAJOBS_SEARCH_ITEM_LIMITS.maxPayloadKeys
  ) {
    throw new UsaJobsSearchItemError("payload_invalid");
  }
  const payload = untrusted["payload"];
  if (hasNonPublicKey(payload)) throw new UsaJobsSearchItemError("non_public_data_rejected");
  if (
    typeof payload["MatchedObjectId"] !== "string" ||
    !MATCHED_OBJECT_ID.test(payload["MatchedObjectId"])
  ) {
    throw new UsaJobsSearchItemError("payload_invalid");
  }
  if (payload["MatchedObjectId"] !== untrusted["matchedObjectId"]) {
    throw new UsaJobsSearchItemError("matched_object_id_mismatch");
  }
  if (
    !isPlainRecord(payload["MatchedObjectDescriptor"]) ||
    Object.keys(payload["MatchedObjectDescriptor"]).length >
      USAJOBS_SEARCH_ITEM_LIMITS.maxDescriptorKeys
  ) {
    throw new UsaJobsSearchItemError("payload_invalid");
  }
  const descriptor = payload["MatchedObjectDescriptor"];
  if (hasNonPublicKey(descriptor)) throw new UsaJobsSearchItemError("non_public_data_rejected");

  let details: Record<string, unknown> | null = null;
  if (descriptor["UserArea"] !== undefined && descriptor["UserArea"] !== null) {
    if (
      !isPlainRecord(descriptor["UserArea"]) ||
      Object.keys(descriptor["UserArea"]).length > USAJOBS_SEARCH_ITEM_LIMITS.maxUserAreaKeys
    ) {
      throw new UsaJobsSearchItemError("payload_invalid");
    }
    const userArea = descriptor["UserArea"];
    if (hasNonPublicKey(userArea)) throw new UsaJobsSearchItemError("non_public_data_rejected");
    if (userArea["Details"] !== undefined && userArea["Details"] !== null) {
      if (
        !isPlainRecord(userArea["Details"]) ||
        Object.keys(userArea["Details"]).length > USAJOBS_SEARCH_ITEM_LIMITS.maxDetailKeys
      ) {
        throw new UsaJobsSearchItemError("payload_invalid");
      }
      details = userArea["Details"];
      if (hasNonPublicKey(details)) throw new UsaJobsSearchItemError("non_public_data_rejected");
    }
  }

  const createCandidateId = untrusted["createCandidateId"] as (
    context: UsaJobsSearchItemCandidateIdContextV1,
  ) => string;
  const drafts: CandidateDraft[] = [];
  const warnings: UsaJobsSearchItemWarningV1[] = [];
  const warn = (
    code: UsaJobsSearchItemWarningCode,
    pointer: string,
    fieldName: UsaJobsSearchItemFieldName | null,
  ): void => {
    warnings.push(Object.freeze({ code, fieldName, pointer }));
  };
  const add = (draft: CandidateDraft): void => {
    drafts.push(Object.freeze(draft));
    if (drafts.length > USAJOBS_SEARCH_ITEM_LIMITS.maxCandidates) {
      throw new UsaJobsSearchItemError("candidate_limit_exceeded");
    }
  };
  const addRequiredDescriptorText = (
    sourceField: "PositionTitle" | "OrganizationName" | "PositionID",
    fieldName: "title" | "company" | "external_id",
  ): boolean => {
    const raw = descriptor[sourceField];
    const pointer = `${ROOT_POINTER}/${sourceField}`;
    const value = exactNonBlankText(raw, USAJOBS_SEARCH_ITEM_LIMITS.maxShortTextLength);
    if (value === null || typeof raw !== "string") {
      warn("required_field_missing_or_invalid", pointer, fieldName);
      return false;
    }
    add({ fieldName, value, rawValue: raw, pointer, confidence: 1 });
    return true;
  };

  const titleAccepted = addRequiredDescriptorText("PositionTitle", "title");
  const companyAccepted = addRequiredDescriptorText("OrganizationName", "company");

  let descriptionsSeen = 0;
  let descriptionsAccepted = 0;
  for (const [field, confidence] of [
    ["JobSummary", 0.99],
    ["MajorDuties", 0.97],
  ] as const) {
    const raw = details?.[field];
    if (raw === undefined || raw === null) continue;
    descriptionsSeen += 1;
    const pointer = `${ROOT_POINTER}/UserArea/Details/${field}`;
    const value = exactNonBlankText(raw, USAJOBS_SEARCH_ITEM_LIMITS.maxDescriptionLength);
    if (value === null || typeof raw !== "string") {
      warn("field_invalid", pointer, "description");
      continue;
    }
    add({ fieldName: "description", value, rawValue: raw, pointer, confidence });
    descriptionsAccepted += 1;
  }
  if (descriptionsAccepted === 0) {
    warn(
      "required_field_missing_or_invalid",
      `${ROOT_POINTER}/UserArea/Details/JobSummary`,
      "description",
    );
  }

  let locationsSeen = 0;
  let locationsAccepted = 0;
  if (descriptor["PositionLocation"] !== undefined && descriptor["PositionLocation"] !== null) {
    const locations = descriptor["PositionLocation"];
    if (!Array.isArray(locations) || locations.length > USAJOBS_SEARCH_ITEM_LIMITS.maxLocations) {
      throw new UsaJobsSearchItemError("payload_invalid");
    }
    locationsSeen = locations.length;
    for (const [index, entry] of locations.entries()) {
      const pointer = `${ROOT_POINTER}/PositionLocation/${String(index)}/LocationName`;
      if (!isPlainRecord(entry)) {
        warn("field_invalid", pointer, "locations");
        continue;
      }
      const raw = entry["LocationName"];
      const value = exactNonBlankText(raw, USAJOBS_SEARCH_ITEM_LIMITS.maxShortTextLength);
      if (value === null || typeof raw !== "string") {
        warn("field_invalid", pointer, "locations");
        continue;
      }
      add({ fieldName: "locations", value, rawValue: raw, pointer, confidence: 1 });
      locationsAccepted += 1;
    }
  }
  if (locationsAccepted === 0 && descriptor["PositionLocationDisplay"] !== undefined) {
    locationsSeen += 1;
    const raw = descriptor["PositionLocationDisplay"];
    const pointer = `${ROOT_POINTER}/PositionLocationDisplay`;
    const value = exactNonBlankText(raw, USAJOBS_SEARCH_ITEM_LIMITS.maxShortTextLength);
    if (value === null || typeof raw !== "string") {
      warn("field_invalid", pointer, "locations");
    } else {
      add({ fieldName: "locations", value, rawValue: raw, pointer, confidence: 0.98 });
      locationsAccepted += 1;
    }
  }

  let employmentTypesSeen = 0;
  let employmentTypesAccepted = 0;
  for (const [field, maximum] of [
    ["PositionSchedule", USAJOBS_SEARCH_ITEM_LIMITS.maxSchedules],
    ["PositionOfferingType", USAJOBS_SEARCH_ITEM_LIMITS.maxOfferingTypes],
  ] as const) {
    const entries = descriptor[field];
    if (entries === undefined || entries === null) continue;
    if (!Array.isArray(entries) || entries.length > maximum) {
      throw new UsaJobsSearchItemError("payload_invalid");
    }
    employmentTypesSeen += entries.length;
    for (const [index, entry] of entries.entries()) {
      const pointer = `${ROOT_POINTER}/${field}/${String(index)}/Name`;
      if (!isPlainRecord(entry)) {
        warn("field_invalid", pointer, "employment_type");
        continue;
      }
      const raw = entry["Name"];
      const value = exactNonBlankText(raw, USAJOBS_SEARCH_ITEM_LIMITS.maxShortTextLength);
      if (value === null || typeof raw !== "string") {
        warn("field_invalid", pointer, "employment_type");
        continue;
      }
      add({ fieldName: "employment_type", value, rawValue: raw, pointer, confidence: 1 });
      employmentTypesAccepted += 1;
    }
  }

  let requirementsSeen = 0;
  let requirementsAccepted = 0;
  for (const [container, field, pointer] of [
    [descriptor, "QualificationSummary", `${ROOT_POINTER}/QualificationSummary`],
    [details, "Requirements", `${ROOT_POINTER}/UserArea/Details/Requirements`],
    [details, "Education", `${ROOT_POINTER}/UserArea/Details/Education`],
    [details, "Evaluations", `${ROOT_POINTER}/UserArea/Details/Evaluations`],
    [details, "RequiredDocuments", `${ROOT_POINTER}/UserArea/Details/RequiredDocuments`],
  ] as const) {
    const raw = container?.[field];
    if (raw === undefined || raw === null) continue;
    requirementsSeen += 1;
    const value = exactNonBlankText(raw, USAJOBS_SEARCH_ITEM_LIMITS.maxDescriptionLength);
    if (value === null || typeof raw !== "string") {
      warn("field_invalid", pointer, "requirements");
      continue;
    }
    add({ fieldName: "requirements", value, rawValue: raw, pointer, confidence: 0.98 });
    requirementsAccepted += 1;
  }
  if (details?.["KeyRequirements"] !== undefined && details["KeyRequirements"] !== null) {
    const entries = details["KeyRequirements"];
    if (!Array.isArray(entries) || entries.length > USAJOBS_SEARCH_ITEM_LIMITS.maxRequirements) {
      throw new UsaJobsSearchItemError("payload_invalid");
    }
    requirementsSeen += entries.length;
    for (const [index, raw] of entries.entries()) {
      const pointer = `${ROOT_POINTER}/UserArea/Details/KeyRequirements/${String(index)}`;
      const value = exactNonBlankText(raw, USAJOBS_SEARCH_ITEM_LIMITS.maxDescriptionLength);
      if (value === null || typeof raw !== "string") {
        warn("field_invalid", pointer, "requirements");
        continue;
      }
      add({ fieldName: "requirements", value, rawValue: raw, pointer, confidence: 0.99 });
      requirementsAccepted += 1;
    }
  }

  for (const [sourceField, fieldName] of [
    ["PublicationStartDate", "posted_at"],
    ["ApplicationCloseDate", "valid_through"],
  ] as const) {
    const raw = descriptor[sourceField];
    if (raw === undefined || raw === null) continue;
    const pointer = `${ROOT_POINTER}/${sourceField}`;
    const value = exactDateText(raw);
    if (value === null || typeof raw !== "string") {
      warn("field_invalid", pointer, fieldName);
      continue;
    }
    add({ fieldName, value, rawValue: raw, pointer, confidence: 1 });
  }

  let applyUrlAccepted = false;
  if (descriptor["ApplyURI"] !== undefined && descriptor["ApplyURI"] !== null) {
    const applyUrls = descriptor["ApplyURI"];
    if (!Array.isArray(applyUrls) || applyUrls.length > USAJOBS_SEARCH_ITEM_LIMITS.maxApplyUrls) {
      throw new UsaJobsSearchItemError("payload_invalid");
    }
    for (const [index, raw] of applyUrls.entries()) {
      const pointer = `${ROOT_POINTER}/ApplyURI/${String(index)}`;
      const value = safeUsaJobsUrl(raw, untrusted["matchedObjectId"], true);
      if (value === null || typeof raw !== "string") {
        warn("field_invalid", pointer, "apply_url");
        continue;
      }
      if (!applyUrlAccepted) {
        add({ fieldName: "apply_url", value, rawValue: raw, pointer, confidence: 1 });
        applyUrlAccepted = true;
      }
    }
  }
  if (!applyUrlAccepted && descriptor["PositionURI"] !== undefined) {
    const raw = descriptor["PositionURI"];
    const pointer = `${ROOT_POINTER}/PositionURI`;
    const value = safeUsaJobsUrl(raw, untrusted["matchedObjectId"], false);
    if (value === null || typeof raw !== "string") {
      warn("field_invalid", pointer, "apply_url");
    } else {
      add({ fieldName: "apply_url", value, rawValue: raw, pointer, confidence: 0.99 });
      applyUrlAccepted = true;
    }
  }
  if (!applyUrlAccepted) {
    warn("required_field_missing_or_invalid", `${ROOT_POINTER}/ApplyURI`, "apply_url");
  }

  const externalIdAccepted = addRequiredDescriptorText("PositionID", "external_id");

  let salaryRangesSeen = 0;
  let salaryRangesAccepted = 0;
  if (
    descriptor["PositionRemuneration"] !== undefined &&
    descriptor["PositionRemuneration"] !== null
  ) {
    const ranges = descriptor["PositionRemuneration"];
    if (!Array.isArray(ranges) || ranges.length > USAJOBS_SEARCH_ITEM_LIMITS.maxSalaryRanges) {
      throw new UsaJobsSearchItemError("payload_invalid");
    }
    salaryRangesSeen = ranges.length;
    for (const [index, range] of ranges.entries()) {
      const pointer = `${ROOT_POINTER}/PositionRemuneration/${String(index)}`;
      if (!isPlainRecord(range)) {
        warn("field_invalid", pointer, "salary");
        continue;
      }
      const minimum = range["MinimumRange"];
      const maximum = range["MaximumRange"];
      const intervalCode = range["RateIntervalCode"];
      const description = range["Description"];
      const minimumText = exactNonBlankText(minimum, USAJOBS_SEARCH_ITEM_LIMITS.maxShortTextLength);
      const maximumText = exactNonBlankText(maximum, USAJOBS_SEARCH_ITEM_LIMITS.maxShortTextLength);
      const intervalText = exactNonBlankText(
        intervalCode,
        USAJOBS_SEARCH_ITEM_LIMITS.maxShortTextLength,
      );
      const descriptionText =
        description === undefined || description === null
          ? null
          : exactNonBlankText(description, USAJOBS_SEARCH_ITEM_LIMITS.maxShortTextLength);
      if (
        minimumText === null ||
        maximumText === null ||
        intervalText === null ||
        !DECIMAL_AMOUNT.test(minimumText) ||
        !DECIMAL_AMOUNT.test(maximumText) ||
        Number(maximumText) < Number(minimumText) ||
        (description !== undefined && description !== null && descriptionText === null)
      ) {
        warn("field_invalid", pointer, "salary");
        continue;
      }
      const value: JsonValue = {
        min: minimumText,
        max: maximumText,
        rate_interval_code: intervalText,
        ...(descriptionText === null ? {} : { description: descriptionText }),
      };
      const rawValue: JsonValue = {
        MinimumRange: minimumText,
        MaximumRange: maximumText,
        RateIntervalCode: intervalText,
        ...(descriptionText === null ? {} : { Description: descriptionText }),
      };
      add({ fieldName: "salary", value, rawValue, pointer, confidence: 1 });
      salaryRangesAccepted += 1;
    }
  }

  const seenIds = new Set<string>();
  const candidates = drafts.map((draft, index) => {
    let id: string;
    try {
      id = createCandidateId({ index, fieldName: draft.fieldName, pointer: draft.pointer });
    } catch {
      throw new UsaJobsSearchItemError("candidate_id_invalid");
    }
    if (typeof id !== "string" || !UUID_V7.test(id) || seenIds.has(id)) {
      throw new UsaJobsSearchItemError("candidate_id_invalid");
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
          sourceType: "usajobs_api",
          sourceId: untrusted["sourceId"],
          pointer: draft.pointer,
        },
        method: "api",
        extractor: USAJOBS_SEARCH_ITEM_EXTRACTOR,
        capturedAt: untrusted["capturedAt"],
        confidence: draft.confidence,
        ...(excerpt === undefined ? {} : { sourceExcerpt: excerpt }),
        licenseNote:
          "Public USAJOBS JOA API evidence for the registered user's internal use; credit USAJOBS, display source values unchanged, direct users to USAJOBS to view/apply, and do not redistribute as a standalone feed.",
      },
    });
    if (!parsed.success) throw new UsaJobsSearchItemError("candidate_invalid");
    return deepFreeze(parsed.data);
  });

  return deepFreeze({
    specVersion: USAJOBS_SEARCH_ITEM_SPEC_VERSION,
    extractor: USAJOBS_SEARCH_ITEM_EXTRACTOR,
    candidates,
    warnings,
    summary: {
      matchedObjectId: untrusted["matchedObjectId"],
      completePosting:
        titleAccepted &&
        companyAccepted &&
        descriptionsAccepted > 0 &&
        applyUrlAccepted &&
        externalIdAccepted,
      descriptionsSeen,
      descriptionsAccepted,
      locationsSeen,
      locationsAccepted,
      employmentTypesSeen,
      employmentTypesAccepted,
      requirementsSeen,
      requirementsAccepted,
      salaryRangesSeen,
      salaryRangesAccepted,
      candidateCount: candidates.length,
      warningCount: warnings.length,
    },
  });
}
