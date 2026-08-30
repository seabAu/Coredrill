import { readFileSync } from "node:fs";

import type { FieldCandidateV1, JsonValue } from "@coredrill/contracts";
import { describe, expect, it } from "vitest";

import {
  extractJobPostingJsonLdV1,
  JOB_POSTING_JSON_LD_EXTRACTOR,
  JOB_POSTING_JSON_LD_FIELD_NAMES,
  JOB_POSTING_JSON_LD_LIMITS,
  JobPostingJsonLdError,
  type JobPostingJsonLdErrorCode,
  type JobPostingJsonLdFieldName,
  type JobPostingJsonLdInputV1,
  type JobPostingJsonLdWarningV1,
} from "../src/index.js";

interface GoldenCandidate {
  readonly fieldName: JobPostingJsonLdFieldName;
  readonly value: JsonValue;
  readonly pointer: string;
  readonly confidence: number;
}

interface GoldenSummary {
  readonly inputItems: number;
  readonly discoveredJobPostings: number;
  readonly acceptedJobPostings: number;
  readonly completeJobPostings: number;
  readonly candidateCount: number;
  readonly warningCount: number;
}

interface GoldenCase {
  readonly id: string;
  readonly jsonLd: readonly JsonValue[];
  readonly expectedCandidates: readonly GoldenCandidate[];
  readonly expectedWarnings: readonly JobPostingJsonLdWarningV1[];
  readonly expectedSummary: GoldenSummary;
}

interface GoldenFixture {
  readonly specVersion: 1;
  readonly sourceId: string;
  readonly capturedAt: string;
  readonly cases: readonly GoldenCase[];
}

interface AccuracyCounts {
  readonly expected: number;
  readonly produced: number;
  readonly exactMatches: number;
  readonly precision: number;
  readonly recall: number;
}

interface ExtractionCaseResult {
  readonly fixture: GoldenCase;
  readonly candidates: readonly FieldCandidateV1[];
  readonly warnings: readonly JobPostingJsonLdWarningV1[];
  readonly summary: ReturnType<typeof extractJobPostingJsonLdV1>["summary"];
}

const goldenFixture = JSON.parse(
  readFileSync(new URL("./fixtures/job-posting-jsonld.golden.json", import.meta.url), "utf8"),
) as unknown as GoldenFixture;
const retainedAccuracyReport = JSON.parse(
  readFileSync(
    new URL("./fixtures/job-posting-jsonld.accuracy-report.json", import.meta.url),
    "utf8",
  ),
) as unknown;

function candidateId(index: number): string {
  return `018f0f4e-7b8c-7d00-8000-${String(index + 100).padStart(12, "0")}`;
}

function baseInput(
  jsonLd: readonly unknown[],
  createCandidateId: JobPostingJsonLdInputV1["createCandidateId"] = ({ index }) =>
    candidateId(index),
): JobPostingJsonLdInputV1 {
  return {
    specVersion: 1,
    sourceId: goldenFixture.sourceId,
    capturedAt: goldenFixture.capturedAt,
    jsonLd,
    createCandidateId,
  };
}

function projectCandidate(candidate: FieldCandidateV1): GoldenCandidate {
  return {
    fieldName: candidate.fieldName as JobPostingJsonLdFieldName,
    value: candidate.value,
    pointer: candidate.provenance.source.pointer,
    confidence: candidate.provenance.confidence,
  };
}

function decodePointerSegment(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function sourceValueAt(jsonLd: readonly JsonValue[], pointer: string): JsonValue {
  const segments = pointer.split("/").slice(3).map(decodePointerSegment);
  let current: JsonValue = jsonLd as JsonValue;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      current = current[Number(segment)]!;
      continue;
    }
    if (typeof current !== "object" || current === null) {
      throw new Error("Golden pointer traversed through a primitive value.");
    }
    current = current[segment]!;
  }
  return current;
}

function expectedExcerpt(rawValue: JsonValue): string | undefined {
  const serialized = typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue);
  return serialized.length === 0 ? undefined : serialized.slice(0, 4_096);
}

function runGoldenCases(): readonly ExtractionCaseResult[] {
  return goldenFixture.cases.map((fixture) => {
    const extraction = extractJobPostingJsonLdV1(baseInput(fixture.jsonLd));
    return {
      fixture,
      candidates: extraction.candidates,
      warnings: extraction.warnings,
      summary: extraction.summary,
    };
  });
}

function candidateKey(candidate: GoldenCandidate): string {
  return JSON.stringify([
    candidate.fieldName,
    candidate.pointer,
    candidate.confidence,
    candidate.value,
  ]);
}

function accuracyCounts(
  expected: readonly GoldenCandidate[],
  produced: readonly GoldenCandidate[],
): AccuracyCounts {
  const remaining = new Map<string, number>();
  for (const candidate of expected) {
    const key = candidateKey(candidate);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  let exactMatches = 0;
  for (const candidate of produced) {
    const key = candidateKey(candidate);
    const count = remaining.get(key) ?? 0;
    if (count === 0) continue;
    exactMatches += 1;
    remaining.set(key, count - 1);
  }
  return {
    expected: expected.length,
    produced: produced.length,
    exactMatches,
    precision: produced.length === 0 ? 0 : exactMatches / produced.length,
    recall: expected.length === 0 ? 0 : exactMatches / expected.length,
  };
}

function buildAccuracyReport(results: readonly ExtractionCaseResult[]): unknown {
  const expected = results.flatMap(({ fixture }) => [...fixture.expectedCandidates]);
  const produced = results.flatMap(({ candidates }) => candidates.map(projectCandidate));
  const totals = accuracyCounts(expected, produced);
  const perField = Object.fromEntries(
    JOB_POSTING_JSON_LD_FIELD_NAMES.map((fieldName) => [
      fieldName,
      accuracyCounts(
        expected.filter((candidate) => candidate.fieldName === fieldName),
        produced.filter((candidate) => candidate.fieldName === fieldName),
      ),
    ]),
  );
  const multiple = results.find(
    ({ fixture }) => fixture.id === "nested-multiple-conflicting-postings",
  )!;
  const malformed = results.find(({ fixture }) => fixture.id === "malformed-and-partial")!;
  const allCandidates = results.flatMap(({ candidates }) => [...candidates]);
  const allRawValuesMatch = results.every(({ fixture, candidates }) =>
    candidates.every(
      (candidate) =>
        candidate.rawValue === sourceValueAt(fixture.jsonLd, candidate.provenance.source.pointer) ||
        JSON.stringify(candidate.rawValue) ===
          JSON.stringify(sourceValueAt(fixture.jsonLd, candidate.provenance.source.pointer)),
    ),
  );
  const allProvenanceMatches = allCandidates.every(
    (candidate) =>
      candidate.provenance.method === "jsonld" &&
      candidate.provenance.extractor.name === JOB_POSTING_JSON_LD_EXTRACTOR.name &&
      candidate.provenance.extractor.version === JOB_POSTING_JSON_LD_EXTRACTOR.version &&
      candidate.provenance.source.sourceId === goldenFixture.sourceId &&
      candidate.provenance.capturedAt === goldenFixture.capturedAt,
  );

  return {
    specVersion: 1,
    extractor: JOB_POSTING_JSON_LD_EXTRACTOR,
    fixtureSuite: "job-posting-jsonld.golden.json",
    fixtureCases: results.length,
    expectedCandidates: totals.expected,
    producedCandidates: totals.produced,
    exactMatches: totals.exactMatches,
    falsePositives: totals.produced - totals.exactMatches,
    falseNegatives: totals.expected - totals.exactMatches,
    precision: totals.precision,
    recall: totals.recall,
    perField,
    scenarios: {
      nestedValues: produced.some((candidate) =>
        JSON.stringify(candidate.value).includes('"address"'),
      ),
      arrays: produced.some((candidate) => /\/\d+$/u.test(candidate.pointer)),
      graph: produced.some((candidate) => candidate.pointer.includes("/@graph/")),
      multipleCandidatesRetained:
        multiple.candidates.filter((candidate) => candidate.fieldName === "title").length === 3 &&
        multiple.candidates.filter((candidate) => candidate.fieldName === "company").length === 3,
      malformedJsonLdRejectedOrWarned:
        malformed.summary.discoveredJobPostings === 2 &&
        malformed.summary.acceptedJobPostings === 1 &&
        malformed.warnings.some((warning) => warning.code === "jsonld_item_ignored") &&
        malformed.warnings.some((warning) => warning.code === "context_missing_or_unsupported"),
      missingInvalidFieldsWarned:
        malformed.warnings.some((warning) => warning.code === "field_invalid") &&
        malformed.warnings.some((warning) => warning.code === "required_field_missing_or_invalid"),
      partialValidFieldsRetained: malformed.candidates.length === 3,
      rawSourceEvidenceRetained: allRawValuesMatch,
      provenanceRetained: allProvenanceMatches,
    },
  };
}

function expectErrorCode(operation: () => unknown, code: JobPostingJsonLdErrorCode): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(JobPostingJsonLdError);
    expect((error as JobPostingJsonLdError).code).toBe(code);
    expect((error as Error).message).not.toContain("secret job title");
    return;
  }
  throw new Error(`Expected JobPosting JSON-LD error ${code}.`);
}

describe("Schema.org JobPosting JSON-LD golden extraction", () => {
  it("matches every golden candidate, warning, summary, raw value, and provenance record", () => {
    for (const result of runGoldenCases()) {
      expect(result.candidates.map(projectCandidate), result.fixture.id).toEqual(
        result.fixture.expectedCandidates,
      );
      expect(result.warnings, result.fixture.id).toEqual(result.fixture.expectedWarnings);
      expect(result.summary, result.fixture.id).toMatchObject(result.fixture.expectedSummary);
      expect(result.summary.traversedValues).toBeGreaterThan(0);

      for (const candidate of result.candidates) {
        const sourceValue = sourceValueAt(
          result.fixture.jsonLd,
          candidate.provenance.source.pointer,
        );
        expect(candidate.rawValue, candidate.provenance.source.pointer).toEqual(sourceValue);
        expect(candidate.provenance, candidate.provenance.source.pointer).toEqual({
          specVersion: 1,
          source: {
            sourceType: "capture",
            sourceId: goldenFixture.sourceId,
            pointer: candidate.provenance.source.pointer,
          },
          method: "jsonld",
          extractor: JOB_POSTING_JSON_LD_EXTRACTOR,
          capturedAt: goldenFixture.capturedAt,
          confidence: candidate.provenance.confidence,
          sourceExcerpt: expectedExcerpt(sourceValue),
          licenseNote: "Untrusted page JSON-LD; compare with visible content before confirmation.",
        });
      }
    }
  });

  it("reproduces the checked-in per-field golden accuracy report", () => {
    const report = buildAccuracyReport(runGoldenCases());

    expect(report).toEqual(retainedAccuracyReport);
    console.info(`XTR002_PROOF ${JSON.stringify(report)}`);
  });
});

describe("Schema.org JobPosting JSON-LD trust boundaries", () => {
  it("validates exact input shape, version, source ID, capture instant, and item count", () => {
    const valid = baseInput([]);
    const invalidInputs: readonly unknown[] = [
      { ...valid, extra: true },
      { ...valid, specVersion: 2 },
      { ...valid, sourceId: "not-a-uuid" },
      { ...valid, capturedAt: "2026-08-30" },
      { ...valid, jsonLd: Array.from({ length: JOB_POSTING_JSON_LD_LIMITS.maxJsonLdItems + 1 }) },
      { ...valid, createCandidateId: null },
    ];

    for (const invalid of invalidInputs) {
      expectErrorCode(
        () => extractJobPostingJsonLdV1(invalid as JobPostingJsonLdInputV1),
        "input_invalid",
      );
    }
  });

  it("rejects non-JSON values, cycles, excessive depth, and excessive traversal", () => {
    const nonJsonValues: readonly unknown[] = [
      undefined,
      Number.NaN,
      1n,
      () => undefined,
      new Date(),
    ];
    for (const nonJson of nonJsonValues) {
      expectErrorCode(() => extractJobPostingJsonLdV1(baseInput([nonJson])), "input_invalid");
    }

    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expectErrorCode(() => extractJobPostingJsonLdV1(baseInput(cyclic)), "input_invalid");

    let tooDeep: unknown = null;
    for (let index = 0; index <= JOB_POSTING_JSON_LD_LIMITS.maxTraversalDepth; index += 1) {
      tooDeep = [tooDeep];
    }
    expectErrorCode(
      () => extractJobPostingJsonLdV1(baseInput([tooDeep])),
      "traversal_limit_exceeded",
    );
    expectErrorCode(
      () =>
        extractJobPostingJsonLdV1(
          baseInput([
            {
              values: Array.from(
                { length: JOB_POSTING_JSON_LD_LIMITS.maxTraversedValues },
                () => null,
              ),
            },
          ]),
        ),
      "traversal_limit_exceeded",
    );
  });

  it("fails atomically when candidate count, output validation, or ID generation fails", () => {
    const tooManyCandidates = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: Array.from(
        { length: JOB_POSTING_JSON_LD_LIMITS.maxCandidates + 1 },
        (_, index) => `Title ${String(index)}`,
      ),
    };
    expectErrorCode(
      () => extractJobPostingJsonLdV1(baseInput([tooManyCandidates])),
      "candidate_limit_exceeded",
    );

    const tooLongPointer = {
      ["x".repeat(2_049)]: {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title: "secret job title",
      },
    };
    expectErrorCode(
      () => extractJobPostingJsonLdV1(baseInput([tooLongPointer])),
      "candidate_invalid",
    );

    const posting = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: ["First title", "Second title"],
    };
    expectErrorCode(
      () => extractJobPostingJsonLdV1(baseInput([posting], () => "not-a-uuid")),
      "candidate_id_invalid",
    );
    expectErrorCode(
      () => extractJobPostingJsonLdV1(baseInput([posting], () => candidateId(0))),
      "candidate_id_invalid",
    );
    expectErrorCode(
      () =>
        extractJobPostingJsonLdV1(
          baseInput([posting], () => {
            throw new Error("secret job title");
          }),
        ),
      "candidate_id_invalid",
    );
  });

  it("does not mutate input and deeply freezes all returned evidence", () => {
    const fixture = goldenFixture.cases[0]!;
    const before = structuredClone(fixture.jsonLd);
    const contexts: unknown[] = [];
    const extraction = extractJobPostingJsonLdV1(
      baseInput(fixture.jsonLd, (context) => {
        contexts.push(context);
        return candidateId(context.index);
      }),
    );

    expect(fixture.jsonLd).toEqual(before);
    expect(contexts.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(extraction)).toBe(true);
    expect(Object.isFrozen(extraction.candidates)).toBe(true);
    expect(Object.isFrozen(extraction.candidates[3]?.value)).toBe(true);
    expect(Object.isFrozen(extraction.candidates[3]?.provenance)).toBe(true);
    expect(Object.isFrozen(extraction.warnings)).toBe(true);
    expect(Object.isFrozen(extraction.summary)).toBe(true);
  });

  it("rejects impossible calendar dates while retaining valid date-only and offset values", () => {
    const extraction = extractJobPostingJsonLdV1(
      baseInput([
        {
          "@context": "https://schema.org",
          "@type": "JobPosting",
          title: "Date tester",
          description: "Date validation fixture.",
          hiringOrganization: { "@type": "Organization", name: "Example" },
          jobLocation: {
            "@type": "Place",
            address: { "@type": "PostalAddress", addressCountry: "US" },
          },
          datePosted: ["2026-02-29", "2024-02-29", "2026-08-15T08:30:00-04:00"],
        },
      ]),
    );

    expect(
      extraction.candidates
        .filter((candidate) => candidate.fieldName === "posted_at")
        .map((candidate) => candidate.value),
    ).toEqual(["2024-02-29", "2026-08-15T08:30:00-04:00"]);
  });
});
