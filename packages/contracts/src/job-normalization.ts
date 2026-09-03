import * as z from "zod";

import { fieldCandidateV1Schema } from "./field-evidence.js";
import { instantSchema, safeHttpUrlSchema, safeIdentifierSchema } from "./primitives.js";

export const JOB_NORMALIZATION_SPEC_VERSION = 1 as const;
export const JOB_NORMALIZATION_V1_SCHEMA_ID =
  "https://schemas.coredrill.local/job-normalization/v1" as const;

export const JOB_NORMALIZATION_STATUSES = [
  "normalized",
  "partial",
  "ambiguous",
  "not_applicable",
] as const;

export const JOB_NORMALIZATION_WARNING_CODES = [
  "invalid_text",
  "invalid_location",
  "ambiguous_workplace_type",
  "invalid_salary",
  "currency_missing",
  "currency_unsupported",
  "interval_missing",
  "invalid_currency",
  "invalid_date",
  "invalid_source_url",
  "invalid_source_kind",
  "invalid_external_id",
] as const;

export const NORMALIZED_MONEY_INTERVALS = ["hour", "day", "week", "month", "year"] as const;
export const NORMALIZED_WORKPLACE_TYPES = ["remote", "hybrid", "on_site"] as const;
export const NORMALIZED_LOCATION_KINDS = ["physical", "remote_region", "label"] as const;
export const NORMALIZED_LOCATION_PRECISIONS = [
  "postal_code",
  "locality",
  "region",
  "country",
  "label",
] as const;

const normalizedDisplayTextSchema = z.string().min(1).max(1_024);
const comparisonKeySchema = z.string().min(1).max(1_024);
const canonicalDecimalSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/u)
  .max(32);
const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/u);
const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/u);
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

function canonicalDecimalParts(value: string): {
  readonly integer: string;
  readonly fraction: string;
} {
  const [integer = "0", fraction = ""] = value.split(".");
  return { integer, fraction };
}

function compareCanonicalDecimals(left: string, right: string): number {
  const leftParts = canonicalDecimalParts(left);
  const rightParts = canonicalDecimalParts(right);
  const scale = Math.max(leftParts.fraction.length, rightParts.fraction.length);
  const leftValue = BigInt(leftParts.integer + leftParts.fraction.padEnd(scale, "0"));
  const rightValue = BigInt(rightParts.integer + rightParts.fraction.padEnd(scale, "0"));
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function exactMinorUnits(value: string, scale: number): number | null {
  const parts = canonicalDecimalParts(value);
  if (parts.fraction.length > scale) return null;
  const encoded = BigInt(parts.integer + parts.fraction.padEnd(scale, "0"));
  return encoded > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(encoded);
}

function validDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year === 0 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (monthDays[month - 1] ?? 0);
}

export const normalizedTitleV1Schema = z.strictObject({
  kind: z.literal("title"),
  displayValue: normalizedDisplayTextSchema,
  comparisonKey: comparisonKeySchema,
});

export const normalizedCompanyV1Schema = z.strictObject({
  kind: z.literal("company"),
  displayValue: normalizedDisplayTextSchema,
  comparisonKey: comparisonKeySchema,
});

export const normalizedLocationV1Schema = z
  .strictObject({
    kind: z.literal("location"),
    locationKind: z.enum(NORMALIZED_LOCATION_KINDS),
    label: normalizedDisplayTextSchema,
    addressLocality: normalizedDisplayTextSchema.optional(),
    region: normalizedDisplayTextSchema.optional(),
    postalCode: z.string().min(1).max(64).optional(),
    country: normalizedDisplayTextSchema.optional(),
    countryCode: countryCodeSchema.optional(),
    remoteRegion: normalizedDisplayTextSchema.optional(),
    precision: z.enum(NORMALIZED_LOCATION_PRECISIONS),
  })
  .superRefine((value, context) => {
    if (value.locationKind !== "remote_region" && value.remoteRegion !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Only remote-region locations may carry a remote region.",
        path: ["remoteRegion"],
      });
    }
    if (
      value.locationKind === "remote_region" &&
      (value.addressLocality !== undefined || value.postalCode !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Remote eligibility is separate from a physical locality or postal code.",
        path: ["locationKind"],
      });
    }
  });

export const normalizedWorkplaceTypeV1Schema = z.strictObject({
  kind: z.literal("workplace_type"),
  value: z.enum(NORMALIZED_WORKPLACE_TYPES),
});

export const normalizedSalaryV1Schema = z
  .strictObject({
    kind: z.literal("salary"),
    minimumDecimal: canonicalDecimalSchema,
    maximumDecimal: canonicalDecimalSchema,
    currency: currencyCodeSchema.nullable(),
    currencyScale: z.number().int().min(0).max(3).nullable(),
    minimumMinorUnits: z.number().int().min(0).nullable(),
    maximumMinorUnits: z.number().int().min(0).nullable(),
    interval: z.enum(NORMALIZED_MONEY_INTERVALS).nullable(),
  })
  .superRefine((value, context) => {
    const minorValuesPresent = value.minimumMinorUnits !== null || value.maximumMinorUnits !== null;
    const completeCurrency = value.currency !== null && value.currencyScale !== null;
    if ((value.currency === null) !== (value.currencyScale === null)) {
      context.addIssue({
        code: "custom",
        message: "Currency and currency scale must be present together.",
        path: ["currencyScale"],
      });
    }
    if (minorValuesPresent && !completeCurrency) {
      context.addIssue({
        code: "custom",
        message: "Minor units require an explicit supported currency and scale.",
        path: ["minimumMinorUnits"],
      });
    }
    if ((value.minimumMinorUnits === null) !== (value.maximumMinorUnits === null)) {
      context.addIssue({
        code: "custom",
        message: "A normalized salary retains both minor-unit bounds or neither.",
        path: ["maximumMinorUnits"],
      });
    }
    if (
      value.minimumMinorUnits !== null &&
      value.maximumMinorUnits !== null &&
      value.minimumMinorUnits > value.maximumMinorUnits
    ) {
      context.addIssue({
        code: "custom",
        message: "The salary minimum must not exceed the maximum.",
        path: ["minimumMinorUnits"],
      });
    }
    if (compareCanonicalDecimals(value.minimumDecimal, value.maximumDecimal) > 0) {
      context.addIssue({
        code: "custom",
        message: "The decimal salary minimum must not exceed the maximum.",
        path: ["minimumDecimal"],
      });
    }
    if (
      value.currency !== null &&
      value.currencyScale !== null &&
      value.minimumMinorUnits !== null &&
      value.maximumMinorUnits !== null &&
      (exactMinorUnits(value.minimumDecimal, value.currencyScale) !== value.minimumMinorUnits ||
        exactMinorUnits(value.maximumDecimal, value.currencyScale) !== value.maximumMinorUnits)
    ) {
      context.addIssue({
        code: "custom",
        message: "Minor-unit bounds must exactly encode the retained decimal bounds and scale.",
        path: ["minimumMinorUnits"],
      });
    }
  });

export const normalizedCurrencyV1Schema = z.strictObject({
  kind: z.literal("currency"),
  value: currencyCodeSchema,
  scale: z.number().int().min(0).max(3),
});

export const normalizedDateV1Schema = z
  .strictObject({
    kind: z.literal("date"),
    date: dateOnlySchema,
    precision: z.enum(["date", "instant"]),
    instant: instantSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (!validDateOnly(value.date)) {
      context.addIssue({
        code: "custom",
        message: "The retained source date must be a real calendar date.",
        path: ["date"],
      });
    }
    if ((value.precision === "date") !== (value.instant === null)) {
      context.addIssue({
        code: "custom",
        message: "Date precision must omit an instant; instant precision must retain one.",
        path: ["instant"],
      });
    }
  });

export const normalizedExternalIdV1Schema = z.strictObject({
  kind: z.literal("source"),
  externalId: z.string().min(1).max(1_024),
});

export const normalizedJobValueV1Schema = z.discriminatedUnion("kind", [
  normalizedTitleV1Schema,
  normalizedCompanyV1Schema,
  normalizedLocationV1Schema,
  normalizedWorkplaceTypeV1Schema,
  normalizedSalaryV1Schema,
  normalizedCurrencyV1Schema,
  normalizedDateV1Schema,
  normalizedExternalIdV1Schema,
]);

export const jobCandidateNormalizationV1Schema = z
  .strictObject({
    specVersion: z.literal(JOB_NORMALIZATION_SPEC_VERSION),
    sourceCandidate: fieldCandidateV1Schema,
    status: z.enum(JOB_NORMALIZATION_STATUSES),
    normalizedValue: normalizedJobValueV1Schema.nullable(),
    warningCodes: z.array(z.enum(JOB_NORMALIZATION_WARNING_CODES)).max(8),
  })
  .superRefine((value, context) => {
    const hasValue = value.normalizedValue !== null;
    const hasWarnings = value.warningCodes.length > 0;
    const valid =
      (value.status === "normalized" && hasValue && !hasWarnings) ||
      (value.status === "partial" && hasValue && hasWarnings) ||
      (value.status === "ambiguous" && !hasValue && hasWarnings) ||
      (value.status === "not_applicable" && !hasValue && !hasWarnings);
    if (!valid) {
      context.addIssue({
        code: "custom",
        message: "Normalization status, value, and warning codes are inconsistent.",
        path: ["status"],
      });
    }
    if (new Set(value.warningCodes).size !== value.warningCodes.length) {
      context.addIssue({
        code: "custom",
        message: "Normalization warning codes must be unique.",
        path: ["warningCodes"],
      });
    }
    const expectedKindByField: Readonly<Record<string, NormalizedJobValueV1["kind"]>> = {
      title: "title",
      company: "company",
      locations: "location",
      workplace_type: "workplace_type",
      salary: "salary",
      currency: "currency",
      date: "date",
      posted_at: "date",
      valid_through: "date",
      external_id: "source",
      source_id: "source",
    };
    const expectedKind = expectedKindByField[value.sourceCandidate.fieldName];
    if (value.normalizedValue !== null && value.normalizedValue.kind !== expectedKind) {
      context.addIssue({
        code: "custom",
        message: "Normalized value kind does not match its source field.",
        path: ["normalizedValue", "kind"],
      });
    }
    if ((expectedKind === undefined) !== (value.status === "not_applicable")) {
      context.addIssue({
        code: "custom",
        message: "Only fields outside the version-1 normalization set may be not applicable.",
        path: ["status"],
      });
    }
  });

export const jobSourceNormalizationRawV1Schema = z
  .strictObject({
    url: z.string().max(8_192).nullable(),
    sourceKind: z.string().max(128).nullable(),
    externalId: z.string().max(1_024).nullable(),
    materialQueryParameters: z.array(z.string().min(1).max(64)).max(32),
  })
  .superRefine((value, context) => {
    if (value.url === null && value.sourceKind === null && value.externalId === null) {
      context.addIssue({
        code: "custom",
        message: "Source normalization requires at least one raw source value.",
      });
    }
    if (value.url === null && value.materialQueryParameters.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Material query parameters require a source URL.",
        path: ["materialQueryParameters"],
      });
    }
    if (new Set(value.materialQueryParameters).size !== value.materialQueryParameters.length) {
      context.addIssue({
        code: "custom",
        message: "Material query parameters must be unique.",
        path: ["materialQueryParameters"],
      });
    }
  });

export const normalizedJobSourceV1Schema = z
  .strictObject({
    canonicalUrl: safeHttpUrlSchema.nullable(),
    sourceKind: safeIdentifierSchema.nullable(),
    externalId: z.string().min(1).max(1_024).nullable(),
  })
  .superRefine((value, context) => {
    if (value.canonicalUrl === null && value.sourceKind === null && value.externalId === null) {
      context.addIssue({
        code: "custom",
        message: "A normalized source must retain at least one usable value.",
      });
    }
  });

export const jobSourceNormalizationV1Schema = z
  .strictObject({
    specVersion: z.literal(JOB_NORMALIZATION_SPEC_VERSION),
    raw: jobSourceNormalizationRawV1Schema,
    status: z.enum(["normalized", "partial", "ambiguous"]),
    value: normalizedJobSourceV1Schema.nullable(),
    warningCodes: z.array(z.enum(JOB_NORMALIZATION_WARNING_CODES)).max(3),
  })
  .superRefine((value, context) => {
    const hasValue = value.value !== null;
    const hasWarnings = value.warningCodes.length > 0;
    const valid =
      (value.status === "normalized" && hasValue && !hasWarnings) ||
      (value.status === "partial" && hasValue && hasWarnings) ||
      (value.status === "ambiguous" && !hasValue && hasWarnings);
    if (!valid) {
      context.addIssue({
        code: "custom",
        message: "Source-normalization status, value, and warning codes are inconsistent.",
        path: ["status"],
      });
    }
    if (new Set(value.warningCodes).size !== value.warningCodes.length) {
      context.addIssue({
        code: "custom",
        message: "Source warning codes must be unique.",
        path: ["warningCodes"],
      });
    }
  });

export const jobNormalizationSummaryV1Schema = z
  .strictObject({
    inputCandidates: z.number().int().min(0).max(256),
    normalized: z.number().int().min(0).max(256),
    partial: z.number().int().min(0).max(256),
    ambiguous: z.number().int().min(0).max(256),
    notApplicable: z.number().int().min(0).max(256),
  })
  .superRefine((value, context) => {
    if (
      value.normalized + value.partial + value.ambiguous + value.notApplicable !==
      value.inputCandidates
    ) {
      context.addIssue({
        code: "custom",
        message: "Normalization summary counts must cover every input candidate exactly once.",
      });
    }
  });

export const jobNormalizationV1Schema = z
  .strictObject({
    specVersion: z.literal(JOB_NORMALIZATION_SPEC_VERSION),
    candidates: z.array(jobCandidateNormalizationV1Schema).max(256),
    source: jobSourceNormalizationV1Schema.nullable(),
    summary: jobNormalizationSummaryV1Schema,
  })
  .superRefine((value, context) => {
    const candidateIds = value.candidates.map((candidate) => candidate.sourceCandidate.id);
    if (new Set(candidateIds).size !== candidateIds.length) {
      context.addIssue({
        code: "custom",
        message: "Normalized source-candidate IDs must be unique.",
        path: ["candidates"],
      });
    }
  });

const generatedJobNormalizationV1JsonSchema = z.toJSONSchema(jobNormalizationV1Schema, {
  target: "draft-2020-12",
});
const { $schema: jobNormalizationDialect, ...jobNormalizationSchemaBody } =
  generatedJobNormalizationV1JsonSchema;

export const jobNormalizationV1JsonSchema = Object.freeze({
  $schema: jobNormalizationDialect,
  $id: JOB_NORMALIZATION_V1_SCHEMA_ID,
  ...jobNormalizationSchemaBody,
});

export type JobNormalizationStatus = (typeof JOB_NORMALIZATION_STATUSES)[number];
export type JobNormalizationWarningCode = (typeof JOB_NORMALIZATION_WARNING_CODES)[number];
export type NormalizedMoneyInterval = (typeof NORMALIZED_MONEY_INTERVALS)[number];
export type NormalizedWorkplaceType = (typeof NORMALIZED_WORKPLACE_TYPES)[number];
export type NormalizedLocationKind = (typeof NORMALIZED_LOCATION_KINDS)[number];
export type NormalizedLocationPrecision = (typeof NORMALIZED_LOCATION_PRECISIONS)[number];
export type NormalizedJobValueV1 = z.infer<typeof normalizedJobValueV1Schema>;
export type JobCandidateNormalizationV1 = z.infer<typeof jobCandidateNormalizationV1Schema>;
export type JobSourceNormalizationRawV1 = z.infer<typeof jobSourceNormalizationRawV1Schema>;
export type NormalizedJobSourceV1 = z.infer<typeof normalizedJobSourceV1Schema>;
export type JobSourceNormalizationV1 = z.infer<typeof jobSourceNormalizationV1Schema>;
export type JobNormalizationSummaryV1 = z.infer<typeof jobNormalizationSummaryV1Schema>;
export type JobNormalizationV1 = z.infer<typeof jobNormalizationV1Schema>;
