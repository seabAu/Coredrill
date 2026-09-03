import { describe, expect, it } from "vitest";

import {
  JOB_NORMALIZATION_V1_SCHEMA_ID,
  jobNormalizationSummaryV1Schema,
  jobNormalizationV1JsonSchema,
  jobNormalizationV1Schema,
  jobSourceNormalizationRawV1Schema,
  normalizedDateV1Schema,
  normalizedJobSourceV1Schema,
  normalizedLocationV1Schema,
  normalizedSalaryV1Schema,
  type JobNormalizationV1,
} from "../src/index.js";

const sourceCandidate = {
  specVersion: 1 as const,
  id: "018f0f4e-7b8c-7d00-8000-000000000801",
  fieldName: "title",
  value: "Senior Engineer",
  rawValue: "<h1>Senior Engineer</h1>",
  provenance: {
    specVersion: 1 as const,
    source: {
      sourceType: "fixture",
      sourceId: "018f0f4e-7b8c-7d00-8000-000000000800",
      pointer: "/title",
    },
    method: "jsonld" as const,
    extractor: { name: "schema-org-job-posting", version: "1.0.0" },
    capturedAt: "2026-09-03T05:30:00.000Z",
    confidence: 0.99,
  },
};

const validNormalization = {
  specVersion: 1 as const,
  candidates: [
    {
      specVersion: 1 as const,
      sourceCandidate,
      status: "normalized" as const,
      normalizedValue: {
        kind: "title" as const,
        displayValue: "Senior Engineer",
        comparisonKey: "senior engineer",
      },
      warningCodes: [],
    },
  ],
  source: null,
  summary: {
    inputCandidates: 1,
    normalized: 1,
    partial: 0,
    ambiguous: 0,
    notApplicable: 0,
  },
} satisfies JobNormalizationV1;

describe("job normalization v1 contract", () => {
  it("accepts coherent output while retaining the complete source candidate", () => {
    const parsed = jobNormalizationV1Schema.parse(validNormalization);

    expect(parsed.candidates[0]?.sourceCandidate).toEqual(sourceCandidate);
    expect(parsed.candidates[0]?.sourceCandidate.rawValue).toBe("<h1>Senior Engineer</h1>");
  });

  it("rejects inconsistent status, duplicate IDs, and incorrect summary counts", () => {
    expect(
      jobNormalizationV1Schema.safeParse({
        ...validNormalization,
        candidates: [{ ...validNormalization.candidates[0], status: "partial" }],
      }).success,
    ).toBe(false);
    expect(
      jobNormalizationV1Schema.safeParse({
        ...validNormalization,
        candidates: [...validNormalization.candidates, ...validNormalization.candidates],
        summary: { ...validNormalization.summary, inputCandidates: 2, normalized: 2 },
      }).success,
    ).toBe(false);
    expect(
      jobNormalizationSummaryV1Schema.safeParse({
        inputCandidates: 2,
        normalized: 1,
        partial: 0,
        ambiguous: 0,
        notApplicable: 0,
      }).success,
    ).toBe(false);
  });

  it("keeps date-only values distinct from UTC instants", () => {
    expect(
      normalizedDateV1Schema.safeParse({
        kind: "date",
        date: "2026-09-03",
        precision: "date",
        instant: null,
      }).success,
    ).toBe(true);
    expect(
      normalizedDateV1Schema.safeParse({
        kind: "date",
        date: "2026-09-03",
        precision: "date",
        instant: "2026-09-03T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      normalizedDateV1Schema.safeParse({
        kind: "date",
        date: "2026-09-03",
        precision: "instant",
        instant: null,
      }).success,
    ).toBe(false);
    expect(
      normalizedDateV1Schema.safeParse({
        kind: "date",
        date: "2026-02-30",
        precision: "date",
        instant: null,
      }).success,
    ).toBe(false);
  });

  it("requires coherent currency/minor units and ordered salary bounds", () => {
    const salary = {
      kind: "salary",
      minimumDecimal: "120000",
      maximumDecimal: "150000",
      currency: "USD",
      currencyScale: 2,
      minimumMinorUnits: 12000000,
      maximumMinorUnits: 15000000,
      interval: "year",
    };
    expect(normalizedSalaryV1Schema.safeParse(salary).success).toBe(true);
    expect(normalizedSalaryV1Schema.safeParse({ ...salary, currencyScale: null }).success).toBe(
      false,
    );
    expect(
      normalizedSalaryV1Schema.safeParse({
        ...salary,
        minimumMinorUnits: 16000000,
      }).success,
    ).toBe(false);
    expect(
      normalizedSalaryV1Schema.safeParse({
        ...salary,
        minimumMinorUnits: 12000001,
      }).success,
    ).toBe(false);
    expect(
      normalizedSalaryV1Schema.safeParse({
        ...salary,
        minimumDecimal: "160000",
        maximumDecimal: "150000",
        currency: null,
        currencyScale: null,
        minimumMinorUnits: null,
        maximumMinorUnits: null,
      }).success,
    ).toBe(false);
  });

  it("binds each normalized value kind to its version-1 source field", () => {
    expect(
      jobNormalizationV1Schema.safeParse({
        ...validNormalization,
        candidates: [
          {
            ...validNormalization.candidates[0],
            normalizedValue: { kind: "currency", value: "USD", scale: 2 },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      jobNormalizationV1Schema.safeParse({
        ...validNormalization,
        candidates: [
          {
            ...validNormalization.candidates[0],
            sourceCandidate: { ...sourceCandidate, fieldName: "description" },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("separates remote eligibility from physical locality fields", () => {
    expect(
      normalizedLocationV1Schema.safeParse({
        kind: "location",
        locationKind: "remote_region",
        label: "United States",
        remoteRegion: "United States",
        precision: "country",
      }).success,
    ).toBe(true);
    expect(
      normalizedLocationV1Schema.safeParse({
        kind: "location",
        locationKind: "remote_region",
        label: "New York",
        addressLocality: "New York",
        precision: "locality",
      }).success,
    ).toBe(false);
  });

  it("requires source records to retain at least one raw and normalized value", () => {
    expect(
      jobSourceNormalizationRawV1Schema.safeParse({
        url: null,
        sourceKind: null,
        externalId: null,
        materialQueryParameters: [],
      }).success,
    ).toBe(false);
    expect(
      normalizedJobSourceV1Schema.safeParse({
        canonicalUrl: null,
        sourceKind: null,
        externalId: null,
      }).success,
    ).toBe(false);
  });

  it("publishes a stable generated JSON Schema identity", () => {
    expect(jobNormalizationV1JsonSchema["$id"]).toBe(JOB_NORMALIZATION_V1_SCHEMA_ID);
    expect(jobNormalizationV1JsonSchema["$schema"]).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
  });
});
