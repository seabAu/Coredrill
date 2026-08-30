import { readFileSync } from "node:fs";

import type { FieldCandidateV1, JsonValue } from "@coredrill/contracts";
import { describe, expect, it } from "vitest";

import {
  LEVER_PUBLIC_POSTING_EXTRACTOR,
  LEVER_PUBLIC_POSTING_FIELD_NAMES,
  LEVER_PUBLIC_POSTING_LIMITS,
  LeverPublicPostingError,
  extractLeverPublicPostingV1,
  type LeverPostingCandidateIdContextV1,
  type LeverPublicPostingErrorCode,
  type LeverPublicPostingFieldName,
  type LeverPublicPostingInputV1,
  type LeverPublicPostingRegion,
  type LeverPublicPostingWarningV1,
} from "../src/index.js";

interface GoldenCandidate {
  readonly fieldName: LeverPublicPostingFieldName;
  readonly value: JsonValue;
  readonly rawValue: JsonValue;
  readonly pointer: string;
  readonly confidence: number;
}

interface GoldenSummary {
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

interface GoldenCase {
  readonly id: string;
  readonly region: LeverPublicPostingRegion;
  readonly site: string;
  readonly postingId: string;
  readonly payload: JsonValue;
  readonly expectedCandidates: readonly GoldenCandidate[];
  readonly expectedWarnings: readonly LeverPublicPostingWarningV1[];
  readonly expectedSummary: GoldenSummary;
}

interface GoldenFixture {
  readonly specVersion: 1;
  readonly sourceId: string;
  readonly capturedAt: string;
  readonly cases: readonly GoldenCase[];
}

const goldenFixture = JSON.parse(
  readFileSync(new URL("./fixtures/lever-public-posting.golden.json", import.meta.url), "utf8"),
) as unknown as GoldenFixture;
const retainedAccuracyReport = JSON.parse(
  readFileSync(
    new URL("./fixtures/lever-public-posting.accuracy-report.json", import.meta.url),
    "utf8",
  ),
) as unknown;

function candidateId(index: number): string {
  return `018f0f4e-7b8c-7d00-8000-${String(index + 500).padStart(12, "0")}`;
}

function inputFor(
  fixture: Pick<GoldenCase, "region" | "site" | "postingId" | "payload">,
  createCandidateId: LeverPublicPostingInputV1["createCandidateId"] = ({ index }) =>
    candidateId(index),
): LeverPublicPostingInputV1 {
  return {
    specVersion: 1,
    sourceId: goldenFixture.sourceId,
    capturedAt: goldenFixture.capturedAt,
    region: fixture.region,
    site: fixture.site,
    postingId: fixture.postingId,
    payload: fixture.payload,
    createCandidateId,
  };
}

function comparable(candidate: FieldCandidateV1): GoldenCandidate {
  return {
    fieldName: candidate.fieldName as LeverPublicPostingFieldName,
    value: candidate.value,
    rawValue: candidate.rawValue as JsonValue,
    pointer: candidate.provenance.source.pointer,
    confidence: candidate.provenance.confidence,
  };
}

function expectErrorCode(operation: () => unknown, code: LeverPublicPostingErrorCode): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(LeverPublicPostingError);
    expect((error as LeverPublicPostingError).code).toBe(code);
    expect((error as Error).message).not.toContain("secret@example.test");
    return;
  }
  throw new Error(`Expected Lever public posting error ${code}.`);
}

function completeFixture(): GoldenCase {
  const fixture = goldenFixture.cases[0];
  if (fixture === undefined) throw new Error("Missing complete Lever fixture.");
  return fixture;
}

describe("Lever public posting golden extraction", () => {
  it("reproduces every checked-in candidate, warning, summary, and provenance pointer", () => {
    let expected = 0;
    let produced = 0;
    let exactMatches = 0;
    const producedFields = new Set<string>();
    const fieldCounts = new Map<
      LeverPublicPostingFieldName,
      { expected: number; produced: number; exactMatches: number }
    >();

    for (const fixture of goldenFixture.cases) {
      const extraction = extractLeverPublicPostingV1(inputFor(fixture));
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
      expect(extraction.extractor).toBe(LEVER_PUBLIC_POSTING_EXTRACTOR);
      expect(Object.isFrozen(extraction), fixture.id).toBe(true);
      expect(Object.isFrozen(extraction.candidates), fixture.id).toBe(true);
      expect(Object.isFrozen(extraction.warnings), fixture.id).toBe(true);
      for (const candidate of extraction.candidates) {
        expect(candidate.provenance).toMatchObject({
          source: {
            sourceType: "lever_api",
            sourceId: goldenFixture.sourceId,
            pointer: candidate.provenance.source.pointer,
          },
          method: "api",
          extractor: LEVER_PUBLIC_POSTING_EXTRACTOR,
          capturedAt: goldenFixture.capturedAt,
        });
        expect(candidate.provenance.licenseNote).toContain("Public Lever Postings API evidence");
        expect(candidate.userConfirmation).toBeUndefined();
        expect(Object.isFrozen(candidate)).toBe(true);
        expect(Object.isFrozen(candidate.provenance)).toBe(true);
      }
    }

    expect(
      [...producedFields].every((field) =>
        LEVER_PUBLIC_POSTING_FIELD_NAMES.includes(field as LeverPublicPostingFieldName),
      ),
    ).toBe(true);
    const perField = Object.fromEntries(
      LEVER_PUBLIC_POSTING_FIELD_NAMES.filter((fieldName) => fieldCounts.has(fieldName)).map(
        (fieldName) => {
          const counts = fieldCounts.get(fieldName);
          if (counts === undefined) throw new Error("Missing Lever field counts.");
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
      extractor: LEVER_PUBLIC_POSTING_EXTRACTOR,
      fixtureSuite: "lever-public-posting.golden.json",
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
        globalAndEuRequestDescriptors: true,
        exactApiDestinations: true,
        applicationSubmissionExcluded: true,
        postingIdentityMatched: true,
        plainDescriptionPreferred: true,
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
    runtimeProcess?.stdout?.write(`XTR005_ADAPTER_PROOF ${JSON.stringify(proof)}\n`);
  });

  it("provides deterministic candidate-ID contexts in retained field order", () => {
    const contexts: LeverPostingCandidateIdContextV1[] = [];
    const extraction = extractLeverPublicPostingV1(
      inputFor(completeFixture(), (context) => {
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

describe("Lever public posting rejection and bounds", () => {
  it("rejects malformed exact inputs, payloads, and posting identities before IDs", () => {
    const fixture = completeFixture();
    let candidateIdCalls = 0;
    const base = inputFor(fixture, ({ index }) => {
      candidateIdCalls += 1;
      return candidateId(index);
    });

    expectErrorCode(
      () => extractLeverPublicPostingV1({ ...base, region: "other" as never }),
      "input_invalid",
    );
    expectErrorCode(
      () => extractLeverPublicPostingV1({ ...base, site: "invalid/site" }),
      "input_invalid",
    );
    expectErrorCode(
      () => extractLeverPublicPostingV1({ ...base, unexpected: true } as never),
      "input_invalid",
    );
    expectErrorCode(() => extractLeverPublicPostingV1({ ...base, payload: [] }), "payload_invalid");
    expectErrorCode(
      () => extractLeverPublicPostingV1({ ...base, payload: { id: "not-a-uuid" } }),
      "payload_invalid",
    );
    expectErrorCode(
      () =>
        extractLeverPublicPostingV1({
          ...base,
          payload: {
            ...(fixture.payload as Readonly<Record<string, JsonValue>>),
            id: "bac21346-8e0c-4494-8e7a-3eb92ff77909",
          },
        }),
      "posting_id_mismatch",
    );
    expect(candidateIdCalls).toBe(0);
  });

  it("rejects every documented or defensive applicant-data field atomically", () => {
    const fixture = completeFixture();
    const forbidden = [
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
    ];
    for (const field of forbidden) {
      let candidateIdCalls = 0;
      expectErrorCode(
        () =>
          extractLeverPublicPostingV1(
            inputFor(
              {
                ...fixture,
                payload: {
                  ...(fixture.payload as Readonly<Record<string, JsonValue>>),
                  [field]: "secret@example.test",
                },
              },
              ({ index }) => {
                candidateIdCalls += 1;
                return candidateId(index);
              },
            ),
          ),
        "applicant_data_rejected",
      );
      expect(candidateIdCalls, field).toBe(0);
    }
  });

  it("retains an incomplete posting with warnings when required public fields are absent", () => {
    const fixture = completeFixture();
    const extraction = extractLeverPublicPostingV1(
      inputFor({
        ...fixture,
        payload: { id: fixture.postingId },
      }),
    );
    expect(extraction.candidates.map((candidate) => candidate.fieldName)).toEqual(["external_id"]);
    expect(extraction.warnings).toEqual([
      {
        code: "required_field_missing_or_invalid",
        fieldName: "title",
        pointer: "/content/lever/text",
      },
      {
        code: "required_field_missing_or_invalid",
        fieldName: "description",
        pointer: "/content/lever/descriptionPlain",
      },
    ]);
    expect(extraction.summary.completePosting).toBe(false);
  });

  it("enforces payload, category, location, list, text, and candidate bounds before IDs", () => {
    const fixture = completeFixture();
    const tooManyPayloadKeys = Object.fromEntries(
      Array.from({ length: LEVER_PUBLIC_POSTING_LIMITS.maxPayloadKeys + 1 }, (_, index) => [
        `field${String(index)}`,
        index,
      ]),
    );
    const tooManyCategoryKeys = Object.fromEntries(
      Array.from({ length: LEVER_PUBLIC_POSTING_LIMITS.maxCategoryKeys + 1 }, (_, index) => [
        `field${String(index)}`,
        index,
      ]),
    );
    let candidateIdCalls = 0;
    const idFactory = ({ index }: LeverPostingCandidateIdContextV1): string => {
      candidateIdCalls += 1;
      return candidateId(index);
    };

    expectErrorCode(
      () =>
        extractLeverPublicPostingV1(
          inputFor(
            { ...fixture, payload: { ...tooManyPayloadKeys, id: fixture.postingId } },
            idFactory,
          ),
        ),
      "payload_invalid",
    );
    expectErrorCode(
      () =>
        extractLeverPublicPostingV1(
          inputFor(
            {
              ...fixture,
              payload: { id: fixture.postingId, categories: tooManyCategoryKeys },
            },
            idFactory,
          ),
        ),
      "payload_invalid",
    );
    expectErrorCode(
      () =>
        extractLeverPublicPostingV1(
          inputFor(
            {
              ...fixture,
              payload: {
                id: fixture.postingId,
                categories: {
                  allLocations: Array.from(
                    { length: LEVER_PUBLIC_POSTING_LIMITS.maxLocations + 1 },
                    () => "Remote",
                  ),
                },
              },
            },
            idFactory,
          ),
        ),
      "payload_invalid",
    );
    expectErrorCode(
      () =>
        extractLeverPublicPostingV1(
          inputFor(
            {
              ...fixture,
              payload: {
                id: fixture.postingId,
                lists: Array.from({ length: LEVER_PUBLIC_POSTING_LIMITS.maxLists + 1 }, () => ({
                  text: "Requirements",
                  content: "<li>One</li>",
                })),
              },
            },
            idFactory,
          ),
        ),
      "payload_invalid",
    );
    expect(candidateIdCalls).toBe(0);

    const oversized = "x".repeat(LEVER_PUBLIC_POSTING_LIMITS.maxDescriptionLength + 1);
    const extraction = extractLeverPublicPostingV1(
      inputFor({
        ...fixture,
        payload: { id: fixture.postingId, text: oversized, descriptionPlain: oversized },
      }),
    );
    expect(extraction.candidates).toHaveLength(1);
    expect(extraction.warnings).toHaveLength(2);

    expectErrorCode(
      () =>
        extractLeverPublicPostingV1(
          inputFor(
            {
              ...fixture,
              payload: {
                id: fixture.postingId,
                text: "Title",
                descriptionPlain: "Description",
                categories: {
                  allLocations: Array.from(
                    { length: LEVER_PUBLIC_POSTING_LIMITS.maxLocations },
                    (_, index) => `Location ${String(index)}`,
                  ),
                },
                lists: Array.from({ length: LEVER_PUBLIC_POSTING_LIMITS.maxLists }, (_, index) => ({
                  text: `List ${String(index)}`,
                  content: "<li>One</li>",
                })),
              },
            },
            idFactory,
          ),
        ),
      "candidate_limit_exceeded",
    );
  });

  it("rejects malformed salary ranges while retaining valid unrelated evidence", () => {
    const fixture = completeFixture();
    const invalidRanges: JsonValue[] = [
      "salary",
      { currency: "usd", interval: "per-year-salary", min: 1, max: 2 },
      { currency: "USD", interval: "", min: 1, max: 2 },
      { currency: "USD", interval: "per-year-salary", min: -1, max: 2 },
      { currency: "USD", interval: "per-year-salary", min: 3, max: 2 },
      { currency: "USD", interval: "per-year-salary", min: 1, max: Number.POSITIVE_INFINITY },
    ];

    for (const salaryRange of invalidRanges) {
      const extraction = extractLeverPublicPostingV1(
        inputFor({
          ...fixture,
          payload: {
            id: fixture.postingId,
            text: "Title",
            descriptionPlain: "Description",
            salaryRange,
          },
        }),
      );
      expect(extraction.candidates.some((candidate) => candidate.fieldName === "salary")).toBe(
        false,
      );
      expect(extraction.warnings).toContainEqual({
        code: "field_invalid",
        fieldName: "salary",
        pointer: "/content/lever/salaryRange",
      });
    }
  });

  it("rejects apply URLs that do not exactly match the requested Lever posting", () => {
    const fixture = completeFixture();
    const wrongPostingId = "6ac21346-8e0c-4494-8e7a-3eb92ff77902";
    const invalidApplyUrls = [
      `https://jobs.eu.lever.co/${fixture.site}/${fixture.postingId}/apply`,
      `https://jobs.lever.co/other-site/${fixture.postingId}/apply`,
      `https://jobs.lever.co/${fixture.site}/${wrongPostingId}/apply`,
      `https://jobs.lever.co/${fixture.site}/${fixture.postingId}/apply/extra`,
      `https://jobs.lever.co/${fixture.site}/${fixture.postingId}/apply?key=redacted`,
    ];

    for (const applyUrl of invalidApplyUrls) {
      const extraction = extractLeverPublicPostingV1(
        inputFor({
          ...fixture,
          payload: {
            id: fixture.postingId,
            text: "Title",
            descriptionPlain: "Description",
            applyUrl,
          },
        }),
      );
      expect(extraction.candidates.some((candidate) => candidate.fieldName === "apply_url")).toBe(
        false,
      );
      expect(extraction.warnings).toContainEqual({
        code: "field_invalid",
        fieldName: "apply_url",
        pointer: "/content/lever/applyUrl",
      });
    }
  });

  it("rejects throwing, malformed, or reused candidate IDs atomically", () => {
    const fixture = completeFixture();
    expectErrorCode(
      () =>
        extractLeverPublicPostingV1(
          inputFor(fixture, () => {
            throw new Error("secret@example.test");
          }),
        ),
      "candidate_id_invalid",
    );
    expectErrorCode(
      () => extractLeverPublicPostingV1(inputFor(fixture, () => "not-a-uuid")),
      "candidate_id_invalid",
    );
    expectErrorCode(
      () => extractLeverPublicPostingV1(inputFor(fixture, () => candidateId(0))),
      "candidate_id_invalid",
    );
  });
});
