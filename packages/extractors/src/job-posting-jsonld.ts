import {
  fieldCandidateV1Schema,
  type FieldCandidateV1,
  type JsonValue,
} from "@coredrill/contracts";

export const JOB_POSTING_JSON_LD_SPEC_VERSION = 1 as const;

export const JOB_POSTING_JSON_LD_EXTRACTOR = Object.freeze({
  name: "coredrill.schema-org-job-posting",
  version: "1.0.0",
});

export const JOB_POSTING_JSON_LD_LIMITS = Object.freeze({
  maxJsonLdItems: 64,
  maxTraversalDepth: 32,
  maxTraversedValues: 10_000,
  maxCandidates: 256,
  maxShortTextLength: 4_096,
  maxDescriptionLength: 512 * 1_024,
  maxUrlLength: 8_192,
});

export const JOB_POSTING_JSON_LD_FIELD_NAMES = [
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
export type JobPostingJsonLdFieldName = (typeof JOB_POSTING_JSON_LD_FIELD_NAMES)[number];

export const JOB_POSTING_JSON_LD_WARNING_CODES = [
  "jsonld_item_ignored",
  "context_missing_or_unsupported",
  "required_field_missing_or_invalid",
  "field_invalid",
  "multiple_job_postings",
] as const;
export type JobPostingJsonLdWarningCode = (typeof JOB_POSTING_JSON_LD_WARNING_CODES)[number];

export const JOB_POSTING_JSON_LD_ERROR_CODES = [
  "input_invalid",
  "traversal_limit_exceeded",
  "candidate_limit_exceeded",
  "candidate_invalid",
  "candidate_id_invalid",
] as const;
export type JobPostingJsonLdErrorCode = (typeof JOB_POSTING_JSON_LD_ERROR_CODES)[number];

export interface JobPostingCandidateIdContextV1 {
  readonly index: number;
  readonly fieldName: JobPostingJsonLdFieldName;
  readonly pointer: string;
}

export interface JobPostingJsonLdInputV1 {
  readonly specVersion: 1;
  readonly sourceId: string;
  readonly capturedAt: string;
  readonly jsonLd: readonly unknown[];
  readonly createCandidateId: (context: JobPostingCandidateIdContextV1) => string;
}

export interface JobPostingJsonLdWarningV1 {
  readonly code: JobPostingJsonLdWarningCode;
  readonly fieldName: JobPostingJsonLdFieldName | null;
  readonly pointer: string;
}

export interface JobPostingJsonLdSummaryV1 {
  readonly inputItems: number;
  readonly traversedValues: number;
  readonly discoveredJobPostings: number;
  readonly acceptedJobPostings: number;
  readonly completeJobPostings: number;
  readonly candidateCount: number;
  readonly warningCount: number;
}

export interface JobPostingJsonLdExtractionV1 {
  readonly specVersion: 1;
  readonly extractor: typeof JOB_POSTING_JSON_LD_EXTRACTOR;
  readonly candidates: readonly FieldCandidateV1[];
  readonly warnings: readonly JobPostingJsonLdWarningV1[];
  readonly summary: JobPostingJsonLdSummaryV1;
}

/** Content-free failure for malformed parser inputs or failed output validation. */
export class JobPostingJsonLdError extends Error {
  public constructor(public readonly code: JobPostingJsonLdErrorCode) {
    super("JobPosting JSON-LD extraction rejected invalid input.");
    this.name = "JobPostingJsonLdError";
  }
}

interface CandidateDraft {
  readonly fieldName: JobPostingJsonLdFieldName;
  readonly value: JsonValue;
  readonly rawValue: JsonValue;
  readonly pointer: string;
  readonly confidence: number;
}

interface ValueAtPointer {
  readonly value: JsonValue;
  readonly pointer: string;
}

interface PostingAtPointer {
  readonly posting: Record<string, JsonValue>;
  readonly pointer: string;
}

type SchemaContextState = "schema_org" | "missing" | "unsupported";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const DATE_OR_DATETIME =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const SALARY_UNITS = new Set(["HOUR", "DAY", "WEEK", "MONTH", "YEAR"]);
const SCHEMA_ORG_CONTEXTS = new Set([
  "https://schema.org",
  "https://schema.org/",
  "http://schema.org",
  "http://schema.org/",
]);
const REQUIREMENT_FIELDS = Object.freeze([
  ["qualifications", "qualification"],
  ["responsibilities", "responsibility"],
  ["skills", "skill"],
  ["educationRequirements", "education"],
  ["experienceRequirements", "experience"],
] as const);
const INPUT_KEYS = Object.freeze([
  "specVersion",
  "sourceId",
  "capturedAt",
  "jsonLd",
  "createCandidateId",
]);

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
  if (typeof value !== "string" || !SAFE_INSTANT.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function childPointer(pointer: string, key: string | number): string {
  return `${pointer}/${pointerSegment(String(key))}`;
}

function validateJsonTree(values: readonly unknown[]): number {
  const seen = new WeakSet<object>();
  let traversed = 0;

  const visit = (value: unknown, depth: number): void => {
    traversed += 1;
    if (traversed > JOB_POSTING_JSON_LD_LIMITS.maxTraversedValues) {
      throw new JobPostingJsonLdError("traversal_limit_exceeded");
    }
    if (depth > JOB_POSTING_JSON_LD_LIMITS.maxTraversalDepth) {
      throw new JobPostingJsonLdError("traversal_limit_exceeded");
    }
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      return;
    }
    if (typeof value !== "object") throw new JobPostingJsonLdError("input_invalid");
    if (seen.has(value)) throw new JobPostingJsonLdError("input_invalid");
    seen.add(value);

    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1);
      return;
    }
    if (!isPlainRecord(value)) throw new JobPostingJsonLdError("input_invalid");
    for (const entry of Object.values(value)) visit(entry, depth + 1);
  };

  for (const value of values) visit(value, 0);
  return traversed;
}

function asJsonRecord(value: JsonValue): Record<string, JsonValue> | null {
  return isPlainRecord(value) ? value : null;
}

function typeIncludes(value: JsonValue | undefined, expected: string): boolean {
  if (typeof value === "string") {
    return value === expected || value === `https://schema.org/${expected}`;
  }
  return Array.isArray(value) && value.some((entry) => typeIncludes(entry, expected));
}

function schemaContextValueSupported(value: JsonValue): boolean {
  if (typeof value === "string") return SCHEMA_ORG_CONTEXTS.has(value);
  if (Array.isArray(value)) return value.some(schemaContextValueSupported);
  const record = asJsonRecord(value);
  return record !== null && typeof record["@vocab"] === "string"
    ? SCHEMA_ORG_CONTEXTS.has(record["@vocab"])
    : false;
}

function resolveSchemaContext(
  record: Record<string, JsonValue>,
  inherited: SchemaContextState,
): SchemaContextState {
  const local = record["@context"];
  if (local === undefined) return inherited;
  if (schemaContextValueSupported(local)) return "schema_org";
  const localRecord = asJsonRecord(local);
  if (localRecord !== null && localRecord["@vocab"] === undefined) return inherited;
  return "unsupported";
}

function valuesAt(
  record: Record<string, JsonValue>,
  key: string,
  pointer: string,
): readonly ValueAtPointer[] {
  const value = record[key];
  if (value === undefined) return [];
  const fieldPointer = childPointer(pointer, key);
  return Array.isArray(value)
    ? value.map((entry, index) => ({ value: entry, pointer: childPointer(fieldPointer, index) }))
    : [{ value, pointer: fieldPointer }];
}

function boundedText(value: JsonValue, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed.length > maximum ? null : trimmed;
}

function isDateOrDateTime(value: string): boolean {
  if (!DATE_OR_DATETIME.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return false;
  }
  const timestamp = Date.parse(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isFinite(timestamp);
}

function isSafeHttpUrl(value: string): boolean {
  if (value.length > JOB_POSTING_JSON_LD_LIMITS.maxUrlLength) return false;
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

function finiteNumber(value: JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function salaryValid(value: JsonValue): boolean {
  const salary = asJsonRecord(value);
  if (
    salary === null ||
    (salary["@type"] !== undefined && !typeIncludes(salary["@type"], "MonetaryAmount"))
  ) {
    return false;
  }
  if (typeof salary["currency"] !== "string" || !CURRENCY.test(salary["currency"])) return false;
  const quantity = asJsonRecord(salary["value"] ?? null);
  if (
    quantity === null ||
    (quantity["@type"] !== undefined && !typeIncludes(quantity["@type"], "QuantitativeValue")) ||
    typeof quantity["unitText"] !== "string" ||
    !SALARY_UNITS.has(quantity["unitText"])
  ) {
    return false;
  }
  const exact = finiteNumber(quantity["value"]);
  const minimum = finiteNumber(quantity["minValue"]);
  const maximum = finiteNumber(quantity["maxValue"]);
  return exact !== null || (minimum !== null && maximum !== null && minimum <= maximum);
}

function physicalLocationValid(value: JsonValue): boolean {
  const place = asJsonRecord(value);
  if (place === null || (place["@type"] !== undefined && !typeIncludes(place["@type"], "Place"))) {
    return false;
  }
  const address = asJsonRecord(place["address"] ?? null);
  if (
    address === null ||
    (address["@type"] !== undefined && !typeIncludes(address["@type"], "PostalAddress"))
  ) {
    return false;
  }
  const country = address["addressCountry"];
  if (typeof country === "string") return country.trim().length > 0;
  const countryRecord = country === undefined ? null : asJsonRecord(country);
  return countryRecord !== null && boundedText(countryRecord["name"] ?? null, 256) !== null;
}

function applicantLocationValid(value: JsonValue): boolean {
  const location = asJsonRecord(value);
  if (location === null) return false;
  const acceptedType = ["Country", "State", "AdministrativeArea", "Place"].some((type) =>
    typeIncludes(location["@type"], type),
  );
  return acceptedType && boundedText(location["name"] ?? null, 1_024) !== null;
}

function requirementValid(value: JsonValue): boolean {
  if (boundedText(value, JOB_POSTING_JSON_LD_LIMITS.maxDescriptionLength) !== null) return true;
  const record = asJsonRecord(value);
  if (record === null) return false;
  return ["name", "credentialCategory", "about", "monthsOfExperience"].some((key) => {
    const entry = record[key];
    return (
      boundedText(entry ?? null, JOB_POSTING_JSON_LD_LIMITS.maxShortTextLength) !== null ||
      (typeof entry === "number" && Number.isFinite(entry))
    );
  });
}

function sourceExcerpt(value: JsonValue): string | undefined {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (serialized.length === 0) return undefined;
  return serialized.slice(0, 4_096);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function extractJobPostingJsonLdV1(
  input: JobPostingJsonLdInputV1,
): JobPostingJsonLdExtractionV1 {
  const untrusted = input as unknown;
  if (
    !isPlainRecord(untrusted) ||
    !hasExactKeys(untrusted, INPUT_KEYS) ||
    untrusted["specVersion"] !== JOB_POSTING_JSON_LD_SPEC_VERSION ||
    typeof untrusted["sourceId"] !== "string" ||
    !UUID_V7.test(untrusted["sourceId"]) ||
    !isCanonicalInstant(untrusted["capturedAt"]) ||
    !Array.isArray(untrusted["jsonLd"]) ||
    untrusted["jsonLd"].length > JOB_POSTING_JSON_LD_LIMITS.maxJsonLdItems ||
    typeof untrusted["createCandidateId"] !== "function"
  ) {
    throw new JobPostingJsonLdError("input_invalid");
  }

  const traversedValues = validateJsonTree(untrusted["jsonLd"]);
  const jsonLd = untrusted["jsonLd"] as readonly JsonValue[];
  const createCandidateId = untrusted[
    "createCandidateId"
  ] as JobPostingJsonLdInputV1["createCandidateId"];
  const warnings: JobPostingJsonLdWarningV1[] = [];
  const warningKeys = new Set<string>();
  const postings: PostingAtPointer[] = [];
  let discoveredJobPostings = 0;

  const warn = (
    code: JobPostingJsonLdWarningCode,
    pointer: string,
    fieldName: JobPostingJsonLdFieldName | null = null,
  ): void => {
    const key = `${code}\u0000${pointer}\u0000${fieldName ?? ""}`;
    if (warningKeys.has(key)) return;
    warningKeys.add(key);
    warnings.push(Object.freeze({ code, fieldName, pointer }));
  };

  const walk = (value: JsonValue, pointer: string, inherited: SchemaContextState): void => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        walk(entry, childPointer(pointer, index), inherited);
      });
      return;
    }
    const record = asJsonRecord(value);
    if (record === null) return;
    const context = resolveSchemaContext(record, inherited);
    if (typeIncludes(record["@type"], "JobPosting")) {
      discoveredJobPostings += 1;
      if (context === "schema_org") postings.push({ posting: record, pointer });
      else warn("context_missing_or_unsupported", childPointer(pointer, "@context"));
    }
    for (const [key, entry] of Object.entries(record)) {
      if (key === "@context" || key === "@type") continue;
      if (Array.isArray(entry) || asJsonRecord(entry) !== null) {
        walk(entry, childPointer(pointer, key), context);
      }
    }
  };

  jsonLd.forEach((value, index) => {
    if (!Array.isArray(value) && asJsonRecord(value) === null) {
      warn("jsonld_item_ignored", `/content/jsonLd/${String(index)}`);
      return;
    }
    walk(value, `/content/jsonLd/${String(index)}`, "missing");
  });
  if (postings.length > 1) warn("multiple_job_postings", "/content/jsonLd");

  const drafts: CandidateDraft[] = [];
  let completeJobPostings = 0;

  const addDraft = (
    fieldName: JobPostingJsonLdFieldName,
    value: JsonValue,
    rawValue: JsonValue,
    pointer: string,
    confidence = 0.9,
  ): void => {
    drafts.push({ fieldName, value, rawValue, pointer, confidence });
    if (drafts.length > JOB_POSTING_JSON_LD_LIMITS.maxCandidates) {
      throw new JobPostingJsonLdError("candidate_limit_exceeded");
    }
  };

  for (const { posting, pointer } of postings) {
    const addText = (
      key: string,
      fieldName: JobPostingJsonLdFieldName,
      maximum: number,
      validate?: (value: string) => boolean,
    ): number => {
      const entries = valuesAt(posting, key, pointer);
      let added = 0;
      for (const entry of entries) {
        const value = boundedText(entry.value, maximum);
        if (value === null || (validate !== undefined && !validate(value))) continue;
        addDraft(fieldName, value, entry.value, entry.pointer);
        added += 1;
      }
      if (entries.length > 0 && added === 0)
        warn("field_invalid", childPointer(pointer, key), fieldName);
      return added;
    };

    const titleCount = addText("title", "title", JOB_POSTING_JSON_LD_LIMITS.maxShortTextLength);
    if (titleCount === 0) {
      warn("required_field_missing_or_invalid", childPointer(pointer, "title"), "title");
    }

    const organizations = valuesAt(posting, "hiringOrganization", pointer);
    let companyCount = 0;
    for (const entry of organizations) {
      const organization = asJsonRecord(entry.value);
      if (
        organization === null ||
        (organization["@type"] !== undefined &&
          !typeIncludes(organization["@type"], "Organization"))
      ) {
        continue;
      }
      const rawName = organization["name"];
      if (typeof rawName !== "string") continue;
      const name = boundedText(rawName, JOB_POSTING_JSON_LD_LIMITS.maxShortTextLength);
      if (name === null) continue;
      addDraft("company", name, rawName, childPointer(entry.pointer, "name"));
      companyCount += 1;
    }
    if (organizations.length > 0 && companyCount === 0) {
      warn("field_invalid", childPointer(pointer, "hiringOrganization"), "company");
    }
    if (companyCount === 0) {
      warn(
        "required_field_missing_or_invalid",
        childPointer(pointer, "hiringOrganization"),
        "company",
      );
    }

    const descriptionCount = addText(
      "description",
      "description",
      JOB_POSTING_JSON_LD_LIMITS.maxDescriptionLength,
    );
    if (descriptionCount === 0) {
      warn(
        "required_field_missing_or_invalid",
        childPointer(pointer, "description"),
        "description",
      );
    }

    const salaries = valuesAt(posting, "baseSalary", pointer);
    let salaryCount = 0;
    for (const entry of salaries) {
      if (!salaryValid(entry.value)) continue;
      addDraft("salary", entry.value, entry.value, entry.pointer, 0.88);
      salaryCount += 1;
    }
    if (salaries.length > 0 && salaryCount === 0) {
      warn("field_invalid", childPointer(pointer, "baseSalary"), "salary");
    }

    const physicalLocations = valuesAt(posting, "jobLocation", pointer);
    let physicalLocationCount = 0;
    for (const entry of physicalLocations) {
      if (!physicalLocationValid(entry.value)) continue;
      addDraft("locations", entry.value, entry.value, entry.pointer, 0.88);
      physicalLocationCount += 1;
    }
    if (physicalLocations.length > 0 && physicalLocationCount === 0) {
      warn("field_invalid", childPointer(pointer, "jobLocation"), "locations");
    }

    const applicantLocations = valuesAt(posting, "applicantLocationRequirements", pointer);
    let applicantLocationCount = 0;
    for (const entry of applicantLocations) {
      if (!applicantLocationValid(entry.value)) continue;
      addDraft("locations", entry.value, entry.value, entry.pointer, 0.88);
      applicantLocationCount += 1;
    }
    if (applicantLocations.length > 0 && applicantLocationCount === 0) {
      warn("field_invalid", childPointer(pointer, "applicantLocationRequirements"), "locations");
    }

    const workplaceEntries = valuesAt(posting, "jobLocationType", pointer);
    let workplaceCount = 0;
    let remote = false;
    for (const entry of workplaceEntries) {
      const value = boundedText(entry.value, 128);
      if (value !== "TELECOMMUTE") continue;
      addDraft("workplace_type", value, entry.value, entry.pointer, 0.9);
      workplaceCount += 1;
      remote = true;
    }
    if (workplaceEntries.length > 0 && workplaceCount === 0) {
      warn("field_invalid", childPointer(pointer, "jobLocationType"), "workplace_type");
    }

    const locationComplete = physicalLocationCount > 0 || (remote && applicantLocationCount > 0);
    if (!locationComplete) {
      warn("required_field_missing_or_invalid", childPointer(pointer, "jobLocation"), "locations");
    }

    const postedCount = addText("datePosted", "posted_at", 128, isDateOrDateTime);
    if (postedCount === 0) {
      warn("required_field_missing_or_invalid", childPointer(pointer, "datePosted"), "posted_at");
    }
    addText("validThrough", "valid_through", 128, isDateOrDateTime);

    for (const [key, category] of REQUIREMENT_FIELDS) {
      const entries = valuesAt(posting, key, pointer);
      let added = 0;
      for (const entry of entries) {
        if (!requirementValid(entry.value)) continue;
        addDraft(
          "requirements",
          { category, content: entry.value },
          entry.value,
          entry.pointer,
          0.84,
        );
        added += 1;
      }
      if (entries.length > 0 && added === 0) {
        warn("field_invalid", childPointer(pointer, key), "requirements");
      }
    }

    addText("url", "apply_url", JOB_POSTING_JSON_LD_LIMITS.maxUrlLength, isSafeHttpUrl);

    const identifiers = valuesAt(posting, "identifier", pointer);
    let identifierCount = 0;
    for (const entry of identifiers) {
      const identifier = asJsonRecord(entry.value);
      const rawIdentifier = identifier === null ? entry.value : identifier["value"];
      const identifierValue =
        typeof rawIdentifier === "number" && Number.isFinite(rawIdentifier)
          ? rawIdentifier
          : rawIdentifier === undefined
            ? null
            : boundedText(rawIdentifier, JOB_POSTING_JSON_LD_LIMITS.maxShortTextLength);
      if (rawIdentifier === undefined || identifierValue === null) continue;
      addDraft(
        "external_id",
        identifierValue,
        rawIdentifier,
        identifier === null ? entry.pointer : childPointer(entry.pointer, "value"),
        0.88,
      );
      identifierCount += 1;
    }
    if (identifiers.length > 0 && identifierCount === 0) {
      warn("field_invalid", childPointer(pointer, "identifier"), "external_id");
    }

    addText("employmentType", "employment_type", JOB_POSTING_JSON_LD_LIMITS.maxShortTextLength);

    if (
      titleCount > 0 &&
      companyCount > 0 &&
      descriptionCount > 0 &&
      postedCount > 0 &&
      locationComplete
    ) {
      completeJobPostings += 1;
    }
  }

  const candidateIds = new Set<string>();
  const candidates = drafts.map((draft, index) => {
    let id: string;
    try {
      id = createCandidateId(
        Object.freeze({ index, fieldName: draft.fieldName, pointer: draft.pointer }),
      );
    } catch {
      throw new JobPostingJsonLdError("candidate_id_invalid");
    }
    if (typeof id !== "string" || !UUID_V7.test(id) || candidateIds.has(id)) {
      throw new JobPostingJsonLdError("candidate_id_invalid");
    }
    candidateIds.add(id);
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
          sourceId: untrusted["sourceId"],
          pointer: draft.pointer,
        },
        method: "jsonld",
        extractor: JOB_POSTING_JSON_LD_EXTRACTOR,
        capturedAt: untrusted["capturedAt"],
        confidence: draft.confidence,
        ...(excerpt === undefined ? {} : { sourceExcerpt: excerpt }),
        licenseNote: "Untrusted page JSON-LD; compare with visible content before confirmation.",
      },
    });
    if (!parsed.success) throw new JobPostingJsonLdError("candidate_invalid");
    return deepFreeze(parsed.data);
  });

  const summary = Object.freeze({
    inputItems: jsonLd.length,
    traversedValues,
    discoveredJobPostings,
    acceptedJobPostings: postings.length,
    completeJobPostings,
    candidateCount: candidates.length,
    warningCount: warnings.length,
  });

  return Object.freeze({
    specVersion: JOB_POSTING_JSON_LD_SPEC_VERSION,
    extractor: JOB_POSTING_JSON_LD_EXTRACTOR,
    candidates: Object.freeze(candidates),
    warnings: Object.freeze(warnings),
    summary,
  });
}
