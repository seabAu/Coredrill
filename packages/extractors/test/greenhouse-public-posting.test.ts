import { readFileSync } from "node:fs";

import type { FieldCandidateV1, JsonValue } from "@coredrill/contracts";
import { describe, expect, it } from "vitest";

import {
  GREENHOUSE_PUBLIC_POSTING_EXTRACTOR,
  GREENHOUSE_PUBLIC_POSTING_FIELD_NAMES,
  GREENHOUSE_PUBLIC_POSTING_LIMITS,
  GreenhousePublicPostingError,
  extractGreenhousePublicPostingV1,
  type GreenhousePostingCandidateIdContextV1,
  type GreenhousePublicPostingErrorCode,
  type GreenhousePublicPostingFieldName,
  type GreenhousePublicPostingInputV1,
  type GreenhousePublicPostingWarningV1,
} from "../src/index.js";

interface GoldenCandidate {
  readonly fieldName: GreenhousePublicPostingFieldName;
  readonly value: JsonValue;
  readonly rawValue: JsonValue;
  readonly pointer: string;
  readonly confidence: number;
}

interface GoldenSummary {
  readonly jobId: number;
  readonly completePosting: boolean;
  readonly payRangesSeen: number;
  readonly payRangesAccepted: number;
  readonly candidateCount: number;
  readonly warningCount: number;
}

interface GoldenCase {
  readonly id: string;
  readonly boardToken: string;
  readonly jobId: number;
  readonly payload: JsonValue;
  readonly expectedCandidates: readonly GoldenCandidate[];
  readonly expectedWarnings: readonly GreenhousePublicPostingWarningV1[];
  readonly expectedSummary: GoldenSummary;
}

interface GoldenFixture {
  readonly specVersion: 1;
  readonly sourceId: string;
  readonly capturedAt: string;
  readonly cases: readonly GoldenCase[];
}

const goldenFixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/greenhouse-public-posting.golden.json", import.meta.url),
    "utf8",
  ),
) as unknown as GoldenFixture;
const retainedAccuracyReport = JSON.parse(
  readFileSync(
    new URL("./fixtures/greenhouse-public-posting.accuracy-report.json", import.meta.url),
    "utf8",
  ),
) as unknown;

function candidateId(index: number): string {
  return `018f0f4e-7b8c-7d00-8000-${String(index + 400).padStart(12, "0")}`;
}

function inputFor(
  fixture: Pick<GoldenCase, "boardToken" | "jobId" | "payload">,
  createCandidateId: GreenhousePublicPostingInputV1["createCandidateId"] = ({ index }) =>
    candidateId(index),
): GreenhousePublicPostingInputV1 {
  return {
    specVersion: 1,
    sourceId: goldenFixture.sourceId,
    capturedAt: goldenFixture.capturedAt,
    boardToken: fixture.boardToken,
    jobId: fixture.jobId,
    payload: fixture.payload,
    createCandidateId,
  };
}

function comparable(candidate: FieldCandidateV1): GoldenCandidate {
  return {
    fieldName: candidate.fieldName as GreenhousePublicPostingFieldName,
    value: candidate.value,
    rawValue: candidate.rawValue as JsonValue,
    pointer: candidate.provenance.source.pointer,
    confidence: candidate.provenance.confidence,
  };
}

function expectErrorCode(operation: () => unknown, code: GreenhousePublicPostingErrorCode): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(GreenhousePublicPostingError);
    expect((error as GreenhousePublicPostingError).code).toBe(code);
    expect((error as Error).message).not.toContain("acme");
    return;
  }
  throw new Error(`Expected Greenhouse public posting error ${code}.`);
}

describe("Greenhouse public posting golden extraction", () => {
  it("reproduces every checked-in candidate, warning, summary, and provenance pointer", () => {
    let expected = 0;
    let produced = 0;
    let exactMatches = 0;
    const producedFields = new Set<string>();
    const fieldCounts = new Map<
      GreenhousePublicPostingFieldName,
      { expected: number; produced: number; exactMatches: number }
    >();

    for (const fixture of goldenFixture.cases) {
      const extraction = extractGreenhousePublicPostingV1(inputFor(fixture));
      const actual = extraction.candidates.map(comparable);
      expected += fixture.expectedCandidates.length;
      produced += actual.length;
      fixture.expectedCandidates.forEach((candidate, index) => {
        const counts = fieldCounts.get(candidate.fieldName) ?? {
          expected: 0,
          produced: 0,
          exactMatches: 0,
        };
        counts.expected += 1;
        if (JSON.stringify(candidate) === JSON.stringify(actual[index])) counts.exactMatches += 1;
        fieldCounts.set(candidate.fieldName, counts);
      });
      actual.forEach((candidate) => {
        const counts = fieldCounts.get(candidate.fieldName) ?? {
          expected: 0,
          produced: 0,
          exactMatches: 0,
        };
        counts.produced += 1;
        fieldCounts.set(candidate.fieldName, counts);
      });
      exactMatches += fixture.expectedCandidates.filter(
        (candidate, index) => JSON.stringify(candidate) === JSON.stringify(actual[index]),
      ).length;
      extraction.candidates.forEach((candidate) => producedFields.add(candidate.fieldName));

      expect(actual, fixture.id).toEqual(fixture.expectedCandidates);
      expect(extraction.warnings, fixture.id).toEqual(fixture.expectedWarnings);
      expect(extraction.summary, fixture.id).toEqual(fixture.expectedSummary);
      expect(extraction.extractor).toBe(GREENHOUSE_PUBLIC_POSTING_EXTRACTOR);
      expect(Object.isFrozen(extraction), fixture.id).toBe(true);
      expect(Object.isFrozen(extraction.candidates), fixture.id).toBe(true);
      for (const candidate of extraction.candidates) {
        expect(candidate.provenance).toMatchObject({
          source: {
            sourceType: "greenhouse_api",
            sourceId: goldenFixture.sourceId,
            pointer: candidate.provenance.source.pointer,
          },
          method: "api",
          extractor: GREENHOUSE_PUBLIC_POSTING_EXTRACTOR,
          capturedAt: goldenFixture.capturedAt,
        });
        expect(candidate.provenance.licenseNote).toContain("attribute the source");
        expect(candidate.userConfirmation).toBeUndefined();
        expect(Object.isFrozen(candidate)).toBe(true);
      }
    }

    expect(
      [...producedFields].every((field) =>
        GREENHOUSE_PUBLIC_POSTING_FIELD_NAMES.includes(field as GreenhousePublicPostingFieldName),
      ),
    ).toBe(true);
    const perField = Object.fromEntries(
      GREENHOUSE_PUBLIC_POSTING_FIELD_NAMES.filter((fieldName) => fieldCounts.has(fieldName)).map(
        (fieldName) => {
          const counts = fieldCounts.get(fieldName);
          if (counts === undefined) throw new Error("Missing Greenhouse field counts.");
          return [
            fieldName,
            {
              ...counts,
              precision: counts.produced === 0 ? 1 : counts.exactMatches / counts.produced,
              recall: counts.expected === 0 ? 1 : counts.exactMatches / counts.expected,
            },
          ];
        },
      ),
    );
    const proof = {
      specVersion: 1,
      extractor: GREENHOUSE_PUBLIC_POSTING_EXTRACTOR,
      fixtureSuite: "greenhouse-public-posting.golden.json",
      fixtureCases: goldenFixture.cases.length,
      expected,
      produced,
      exactMatches,
      falsePositives: produced - exactMatches,
      falseNegatives: expected - exactMatches,
      precision: exactMatches / produced,
      recall: exactMatches / expected,
      perField,
      scenarios: {
        getOnlyRequestDescriptor: true,
        exactApiDestination: true,
        payTransparencyWithoutQuestions: true,
        jobIdentityMatched: true,
        rawEvidenceRetained: true,
        provenanceRetained: true,
        applicantDataRejected: true,
        invalidOptionalFieldsRejected: true,
      },
    };
    expect(proof).toEqual(retainedAccuracyReport);
    const runtimeProcess = (
      globalThis as typeof globalThis & {
        readonly process?: { readonly stdout?: { write(value: string): unknown } };
      }
    ).process;
    runtimeProcess?.stdout?.write(`XTR004_ADAPTER_PROOF ${JSON.stringify(proof)}\n`);
  });

  it("provides deterministic candidate-ID contexts in retained field order", () => {
    const contexts: GreenhousePostingCandidateIdContextV1[] = [];
    const fixture = goldenFixture.cases[0];
    if (fixture === undefined) throw new Error("Missing complete Greenhouse fixture.");
    const extraction = extractGreenhousePublicPostingV1(
      inputFor(fixture, (context) => {
        contexts.push(context);
        return candidateId(context.index);
      }),
    );

    expect(contexts).toEqual(
      extraction.candidates.map((candidate, index) => ({
        index,
        fieldName: candidate.fieldName,
        pointer: candidate.provenance.source.pointer,
      })),
    );
  });
});

describe("Greenhouse public posting boundary hardening", () => {
  const base = {
    boardToken: "acme",
    jobId: 123456,
    payload: {
      id: 123456,
      title: "Engineer",
      company_name: "Acme",
      content: "Build carefully.",
    },
  } as const;

  it("rejects malformed inputs, payloads, and mismatched job identities", () => {
    expectErrorCode(
      () => extractGreenhousePublicPostingV1({ ...inputFor(base), extra: true } as never),
      "input_invalid",
    );
    expectErrorCode(
      () => extractGreenhousePublicPostingV1({ ...inputFor(base), boardToken: "acme/other" }),
      "input_invalid",
    );
    expectErrorCode(
      () => extractGreenhousePublicPostingV1({ ...inputFor(base), capturedAt: "not-an-instant" }),
      "input_invalid",
    );
    expectErrorCode(
      () => extractGreenhousePublicPostingV1({ ...inputFor(base), payload: [] }),
      "payload_invalid",
    );
    expectErrorCode(
      () => extractGreenhousePublicPostingV1({ ...inputFor(base), payload: { id: "123456" } }),
      "payload_invalid",
    );
    expectErrorCode(
      () => extractGreenhousePublicPostingV1({ ...inputFor(base), jobId: 654321 }),
      "job_id_mismatch",
    );
    const oversizedPayload = Object.fromEntries(
      Array.from({ length: GREENHOUSE_PUBLIC_POSTING_LIMITS.maxPayloadKeys + 1 }, (_, index) => [
        `field_${index}`,
        index,
      ]),
    );
    expectErrorCode(
      () => extractGreenhousePublicPostingV1({ ...inputFor(base), payload: oversizedPayload }),
      "payload_invalid",
    );
  });

  it("rejects every documented applicant, demographic, and compliance field atomically", () => {
    for (const forbidden of [
      "questions",
      "location_questions",
      "compliance",
      "demographic_questions",
      "data_compliance",
    ]) {
      expectErrorCode(
        () =>
          extractGreenhousePublicPostingV1({
            ...inputFor(base),
            payload: { ...base.payload, [forbidden]: [] },
          }),
        "applicant_data_rejected",
      );
    }
  });

  it("warns for missing required posting fields without inventing values", () => {
    const extraction = extractGreenhousePublicPostingV1(
      inputFor({ boardToken: "acme", jobId: 123456, payload: { id: 123456 } }),
    );

    expect(extraction.candidates.map(({ fieldName }) => fieldName)).toEqual(["external_id"]);
    expect(extraction.warnings).toEqual([
      {
        code: "required_field_missing_or_invalid",
        fieldName: "title",
        pointer: "/content/greenhouse/title",
      },
      {
        code: "required_field_missing_or_invalid",
        fieldName: "company",
        pointer: "/content/greenhouse/company_name",
      },
      {
        code: "required_field_missing_or_invalid",
        fieldName: "description",
        pointer: "/content/greenhouse/content",
      },
    ]);
    expect(extraction.summary.completePosting).toBe(false);
  });

  it("enforces pay-range and candidate bounds before requesting candidate IDs", () => {
    let calls = 0;
    const tooManyRanges = Array.from(
      { length: GREENHOUSE_PUBLIC_POSTING_LIMITS.maxPayRanges + 1 },
      () => ({ min_cents: 1, max_cents: 2, currency_type: "USD" }),
    );
    expectErrorCode(
      () =>
        extractGreenhousePublicPostingV1({
          ...inputFor(
            { ...base, payload: { ...base.payload, pay_input_ranges: tooManyRanges } },
            () => {
              calls += 1;
              return candidateId(calls);
            },
          ),
        }),
      "payload_invalid",
    );
    expect(calls).toBe(0);

    const candidateOverflow = Array.from(
      { length: GREENHOUSE_PUBLIC_POSTING_LIMITS.maxPayRanges },
      (_, index) => ({ min_cents: index, max_cents: index + 1, currency_type: "USD" }),
    );
    expectErrorCode(
      () =>
        extractGreenhousePublicPostingV1({
          ...inputFor(
            { ...base, payload: { ...base.payload, pay_input_ranges: candidateOverflow } },
            () => {
              calls += 1;
              return candidateId(calls);
            },
          ),
        }),
      "candidate_limit_exceeded",
    );
    expect(calls).toBe(0);
  });

  it("rejects throwing, malformed, and reused candidate IDs without leaking content", () => {
    expectErrorCode(
      () =>
        extractGreenhousePublicPostingV1(
          inputFor(base, () => {
            throw new Error("Acme payload content");
          }),
        ),
      "candidate_id_invalid",
    );
    expectErrorCode(
      () => extractGreenhousePublicPostingV1(inputFor(base, () => "not-a-uuid")),
      "candidate_id_invalid",
    );
    expectErrorCode(
      () => extractGreenhousePublicPostingV1(inputFor(base, () => candidateId(0))),
      "candidate_id_invalid",
    );
  });
});
