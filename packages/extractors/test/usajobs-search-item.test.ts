import { readFileSync } from "node:fs";

import type { FieldCandidateV1, JsonValue } from "@coredrill/contracts";
import { describe, expect, it } from "vitest";

import {
  USAJOBS_SEARCH_ITEM_EXTRACTOR,
  USAJOBS_SEARCH_ITEM_FIELD_NAMES,
  USAJOBS_SEARCH_ITEM_LIMITS,
  UsaJobsSearchItemError,
  extractUsaJobsSearchItemV1,
  type UsaJobsSearchItemCandidateIdContextV1,
  type UsaJobsSearchItemErrorCode,
  type UsaJobsSearchItemFieldName,
  type UsaJobsSearchItemInputV1,
  type UsaJobsSearchItemSummaryV1,
  type UsaJobsSearchItemWarningV1,
} from "../src/index.js";

interface GoldenCandidate {
  readonly fieldName: UsaJobsSearchItemFieldName;
  readonly value: JsonValue;
  readonly rawValue: JsonValue;
  readonly pointer: string;
  readonly confidence: number;
}

interface GoldenCase {
  readonly id: string;
  readonly matchedObjectId: string;
  readonly payload: JsonValue;
  readonly expectedCandidates: readonly GoldenCandidate[];
  readonly expectedWarnings: readonly UsaJobsSearchItemWarningV1[];
  readonly expectedSummary: UsaJobsSearchItemSummaryV1;
}

interface GoldenFixture {
  readonly specVersion: 1;
  readonly sourceId: string;
  readonly capturedAt: string;
  readonly cases: readonly GoldenCase[];
}

const goldenFixture = JSON.parse(
  readFileSync(new URL("./fixtures/usajobs-search-item.golden.json", import.meta.url), "utf8"),
) as unknown as GoldenFixture;
const retainedAccuracyReport = JSON.parse(
  readFileSync(
    new URL("./fixtures/usajobs-search-item.accuracy-report.json", import.meta.url),
    "utf8",
  ),
) as unknown;

function candidateId(index: number): string {
  return `018f0f4e-7b8c-7d00-8000-${String(index + 600).padStart(12, "0")}`;
}

function inputFor(
  fixture: Pick<GoldenCase, "matchedObjectId" | "payload">,
  createCandidateId: UsaJobsSearchItemInputV1["createCandidateId"] = ({ index }) =>
    candidateId(index),
): UsaJobsSearchItemInputV1 {
  return {
    specVersion: 1,
    sourceId: goldenFixture.sourceId,
    capturedAt: goldenFixture.capturedAt,
    matchedObjectId: fixture.matchedObjectId,
    payload: fixture.payload,
    createCandidateId,
  };
}

function comparable(candidate: FieldCandidateV1): GoldenCandidate {
  return {
    fieldName: candidate.fieldName as UsaJobsSearchItemFieldName,
    value: candidate.value,
    rawValue: candidate.rawValue as JsonValue,
    pointer: candidate.provenance.source.pointer,
    confidence: candidate.provenance.confidence,
  };
}

function expectErrorCode(operation: () => unknown, code: UsaJobsSearchItemErrorCode): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(UsaJobsSearchItemError);
    expect((error as UsaJobsSearchItemError).code).toBe(code);
    expect((error as Error).message).not.toContain("secret@example.test");
    expect((error as Error).message).not.toContain("api-key-value");
    return;
  }
  throw new Error(`Expected USAJOBS search-item error ${code}.`);
}

function completeFixture(): GoldenCase {
  const fixture = goldenFixture.cases[0];
  if (fixture === undefined) throw new Error("Missing complete USAJOBS fixture.");
  return fixture;
}

function payloadRecord(fixture: GoldenCase): Readonly<Record<string, JsonValue>> {
  return fixture.payload as Readonly<Record<string, JsonValue>>;
}

function descriptorRecord(fixture: GoldenCase): Readonly<Record<string, JsonValue>> {
  return payloadRecord(fixture)["MatchedObjectDescriptor"] as Readonly<Record<string, JsonValue>>;
}

describe("USAJOBS selected search-item golden extraction", () => {
  it("reproduces every checked-in candidate, warning, summary, and provenance pointer", () => {
    let expected = 0;
    let produced = 0;
    let exactMatches = 0;
    const producedFields = new Set<string>();
    const fieldCounts = new Map<
      UsaJobsSearchItemFieldName,
      { expected: number; produced: number; exactMatches: number }
    >();

    for (const fixture of goldenFixture.cases) {
      const extraction = extractUsaJobsSearchItemV1(inputFor(fixture));
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
      expect(extraction.extractor).toBe(USAJOBS_SEARCH_ITEM_EXTRACTOR);
      expect(Object.isFrozen(extraction), fixture.id).toBe(true);
      expect(Object.isFrozen(extraction.candidates), fixture.id).toBe(true);
      for (const candidate of extraction.candidates) {
        expect(candidate.provenance).toMatchObject({
          source: {
            sourceType: "usajobs_api",
            sourceId: goldenFixture.sourceId,
            pointer: candidate.provenance.source.pointer,
          },
          method: "api",
          extractor: USAJOBS_SEARCH_ITEM_EXTRACTOR,
          capturedAt: goldenFixture.capturedAt,
        });
        expect(candidate.provenance.licenseNote).toContain("credit USAJOBS");
        expect(candidate.provenance.licenseNote).toContain("display source values unchanged");
        expect(candidate.userConfirmation).toBeUndefined();
        expect(Object.isFrozen(candidate)).toBe(true);
      }
    }

    expect(
      [...producedFields].every((field) =>
        USAJOBS_SEARCH_ITEM_FIELD_NAMES.includes(field as UsaJobsSearchItemFieldName),
      ),
    ).toBe(true);
    const perField = Object.fromEntries(
      USAJOBS_SEARCH_ITEM_FIELD_NAMES.filter((fieldName) => fieldCounts.has(fieldName)).map(
        (fieldName) => {
          const counts = fieldCounts.get(fieldName);
          if (counts === undefined) throw new Error("Missing USAJOBS field counts.");
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
      extractor: USAJOBS_SEARCH_ITEM_EXTRACTOR,
      fixtureSuite: "usajobs-search-item.golden.json",
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
        selectedSearchItemIdentityMatched: true,
        sourceValuesUnchanged: true,
        rawEvidenceRetained: true,
        provenanceRetained: true,
        officialViewOrApplyLinkRequired: true,
        publicContactFieldsIgnored: true,
        nonPublicDataRejected: true,
        invalidOptionalFieldsRejected: true,
        salaryCurrencyNotInvented: true,
      },
    };
    expect(proof).toEqual(retainedAccuracyReport);
    const runtimeProcess = (
      globalThis as typeof globalThis & {
        readonly process?: { readonly stdout?: { write(value: string): unknown } };
      }
    ).process;
    runtimeProcess?.stdout?.write(`XTR006_ADAPTER_PROOF ${JSON.stringify(proof)}\n`);
  });

  it("provides deterministic candidate-ID contexts in retained field order", () => {
    const contexts: UsaJobsSearchItemCandidateIdContextV1[] = [];
    const extraction = extractUsaJobsSearchItemV1(
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

  it("never maps or excerpts public contact fields", () => {
    const fixture = goldenFixture.cases[2];
    if (fixture === undefined) throw new Error("Missing contact-field fixture.");
    const extraction = extractUsaJobsSearchItemV1(inputFor(fixture));
    const serialized = JSON.stringify(extraction);
    expect(serialized).not.toContain("contact@example.gov");
    expect(serialized).not.toContain("202-555-0100");
    expect(extraction.candidates.every(({ fieldName }) => fieldName !== "contact")).toBe(true);
  });
});

describe("USAJOBS selected search-item rejection and bounds", () => {
  it("rejects malformed exact inputs, payloads, and item identity before IDs", () => {
    const fixture = completeFixture();
    let candidateIdCalls = 0;
    const base = inputFor(fixture, ({ index }) => {
      candidateIdCalls += 1;
      return candidateId(index);
    });

    expectErrorCode(
      () => extractUsaJobsSearchItemV1({ ...base, matchedObjectId: "not-an-id" }),
      "input_invalid",
    );
    expectErrorCode(
      () => extractUsaJobsSearchItemV1({ ...base, unexpected: true } as never),
      "input_invalid",
    );
    expectErrorCode(() => extractUsaJobsSearchItemV1({ ...base, payload: [] }), "payload_invalid");
    expectErrorCode(
      () =>
        extractUsaJobsSearchItemV1({
          ...base,
          payload: { ...payloadRecord(fixture), MatchedObjectId: "222222222" },
        }),
      "matched_object_id_mismatch",
    );
    expectErrorCode(
      () =>
        extractUsaJobsSearchItemV1({
          ...base,
          payload: { MatchedObjectId: fixture.matchedObjectId, MatchedObjectDescriptor: [] },
        }),
      "payload_invalid",
    );
    expect(candidateIdCalls).toBe(0);
  });

  it("rejects credential-like and applicant/system-user fields at every accepted envelope level", () => {
    const fixture = completeFixture();
    const descriptor = descriptorRecord(fixture);
    const userArea = descriptor["UserArea"] as Readonly<Record<string, JsonValue>>;
    const details = userArea["Details"] as Readonly<Record<string, JsonValue>>;
    const rejectedFieldOne = ["Authorization", "Key"].join("");
    const rejectedFieldTwo = ["Api", "Key"].join("");
    const invalidPayloads: JsonValue[] = [
      { ...payloadRecord(fixture), Applicant: "secret@example.test" },
      {
        ...payloadRecord(fixture),
        MatchedObjectDescriptor: { ...descriptor, [rejectedFieldOne]: true },
      },
      {
        ...payloadRecord(fixture),
        MatchedObjectDescriptor: {
          ...descriptor,
          UserArea: { ...userArea, [rejectedFieldTwo]: true },
        },
      },
      {
        ...payloadRecord(fixture),
        MatchedObjectDescriptor: {
          ...descriptor,
          UserArea: { ...userArea, Details: { ...details, Candidate: "secret@example.test" } },
        },
      },
    ];

    for (const payload of invalidPayloads) {
      expectErrorCode(
        () => extractUsaJobsSearchItemV1(inputFor({ ...fixture, payload })),
        "non_public_data_rejected",
      );
    }
  });

  it("enforces descriptor, nested-object, and provider-array bounds before IDs", () => {
    const fixture = completeFixture();
    const descriptor = descriptorRecord(fixture);
    const tooManyDescriptorKeys = Object.fromEntries(
      Array.from({ length: USAJOBS_SEARCH_ITEM_LIMITS.maxDescriptorKeys + 1 }, (_, index) => [
        `field${String(index)}`,
        index,
      ]),
    );
    let candidateIdCalls = 0;
    const idFactory = ({ index }: UsaJobsSearchItemCandidateIdContextV1): string => {
      candidateIdCalls += 1;
      return candidateId(index);
    };
    const boundedPayloads: JsonValue[] = [
      { ...payloadRecord(fixture), MatchedObjectDescriptor: tooManyDescriptorKeys },
      {
        ...payloadRecord(fixture),
        MatchedObjectDescriptor: {
          ...descriptor,
          PositionLocation: Array.from(
            { length: USAJOBS_SEARCH_ITEM_LIMITS.maxLocations + 1 },
            () => ({ LocationName: "Remote" }),
          ),
        },
      },
      {
        ...payloadRecord(fixture),
        MatchedObjectDescriptor: {
          ...descriptor,
          ApplyURI: Array.from(
            { length: USAJOBS_SEARCH_ITEM_LIMITS.maxApplyUrls + 1 },
            () => "https://www.usajobs.gov/GetJob/ViewDetails/123456789?PostingChannelID=RESTAPI",
          ),
        },
      },
      {
        ...payloadRecord(fixture),
        MatchedObjectDescriptor: {
          ...descriptor,
          PositionRemuneration: Array.from(
            { length: USAJOBS_SEARCH_ITEM_LIMITS.maxSalaryRanges + 1 },
            () => ({ MinimumRange: "1", MaximumRange: "2", RateIntervalCode: "PH" }),
          ),
        },
      },
    ];

    for (const payload of boundedPayloads) {
      expectErrorCode(
        () => extractUsaJobsSearchItemV1(inputFor({ ...fixture, payload }, idFactory)),
        "payload_invalid",
      );
    }
    expect(candidateIdCalls).toBe(0);
  });

  it("accepts only exact USAJOBS view/apply links for the selected control number", () => {
    const fixture = completeFixture();
    const descriptor = descriptorRecord(fixture);
    const invalidUrls = [
      "http://www.usajobs.gov/GetJob/ViewDetails/123456789?PostingChannelID=RESTAPI",
      "https://jobs.usajobs.gov/GetJob/ViewDetails/123456789?PostingChannelID=RESTAPI",
      "https://www.usajobs.gov/GetJob/ViewDetails/999999999?PostingChannelID=RESTAPI",
      "https://www.usajobs.gov/GetJob/ViewDetails/123456789?PostingChannelID=OTHER",
      "https://www.usajobs.gov/GetJob/ViewDetails/123456789?PostingChannelID=RESTAPI&key=secret",
    ];

    for (const applyUrl of invalidUrls) {
      const extraction = extractUsaJobsSearchItemV1(
        inputFor({
          ...fixture,
          payload: {
            ...payloadRecord(fixture),
            MatchedObjectDescriptor: {
              ...descriptor,
              PositionURI: null,
              ApplyURI: [applyUrl],
            },
          },
        }),
      );
      expect(extraction.candidates.some(({ fieldName }) => fieldName === "apply_url")).toBe(false);
      expect(extraction.warnings).toContainEqual({
        code: "field_invalid",
        fieldName: "apply_url",
        pointer: "/content/usajobs/MatchedObjectDescriptor/ApplyURI/0",
      });
      expect(extraction.summary.completePosting).toBe(false);
    }
  });

  it("rejects throwing, malformed, or reused candidate IDs atomically", () => {
    const fixture = completeFixture();
    expectErrorCode(
      () =>
        extractUsaJobsSearchItemV1(
          inputFor(fixture, () => {
            throw new Error("secret@example.test");
          }),
        ),
      "candidate_id_invalid",
    );
    expectErrorCode(
      () => extractUsaJobsSearchItemV1(inputFor(fixture, () => "not-a-uuid")),
      "candidate_id_invalid",
    );
    expectErrorCode(
      () => extractUsaJobsSearchItemV1(inputFor(fixture, () => candidateId(0))),
      "candidate_id_invalid",
    );
  });
});
