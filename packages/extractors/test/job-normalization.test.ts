import { readFileSync } from "node:fs";

import type {
  FieldCandidateV1,
  JobCandidateNormalizationV1,
  JobNormalizationSummaryV1,
  JobSourceNormalizationRawV1,
  JobSourceNormalizationV1,
  JsonValue,
} from "@coredrill/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  JOB_CANDIDATE_NORMALIZATION_LIMITS,
  JobCandidateNormalizationError,
  normalizeJobCandidatesV1,
  type JobCandidateNormalizationErrorCode,
  type JobCandidateNormalizationInputV1,
} from "../src/index.js";

interface GoldenCandidate {
  readonly fieldName: string;
  readonly value: JsonValue;
  readonly rawValue?: JsonValue;
  readonly pointer?: string;
  readonly expected: Pick<
    JobCandidateNormalizationV1,
    "status" | "normalizedValue" | "warningCodes"
  >;
}

interface GoldenFixture {
  readonly specVersion: 1;
  readonly sourceId: string;
  readonly capturedAt: string;
  readonly source: {
    readonly input: JobSourceNormalizationRawV1;
    readonly expected: JobSourceNormalizationV1;
  };
  readonly candidates: readonly GoldenCandidate[];
  readonly summary: JobNormalizationSummaryV1;
}

const goldenFixture = JSON.parse(
  readFileSync(new URL("./fixtures/job-normalization.golden.json", import.meta.url), "utf8"),
) as unknown as GoldenFixture;

function candidateId(index: number): string {
  return `018f0f4e-7b8c-7d00-8000-${String(index + 701).padStart(12, "0")}`;
}

function candidate(
  fieldName: string,
  value: JsonValue,
  index = 0,
  rawValue?: JsonValue,
  pointer = `/fixture/${index}`,
): FieldCandidateV1 {
  const base = {
    specVersion: 1 as const,
    id: candidateId(index),
    fieldName,
    value,
    provenance: {
      specVersion: 1 as const,
      source: {
        sourceType: "fixture",
        sourceId: goldenFixture.sourceId,
        pointer,
      },
      method: "heuristic" as const,
      extractor: { name: "job-normalization-fixture", version: "1.0.0" },
      capturedAt: goldenFixture.capturedAt,
      confidence: 0.9,
    },
  };
  return rawValue === undefined ? base : { ...base, rawValue };
}

function fixtureCandidates(): FieldCandidateV1[] {
  return goldenFixture.candidates.map((fixture, index) =>
    candidate(
      fixture.fieldName,
      fixture.value,
      index,
      fixture.rawValue,
      fixture.pointer ?? `/fixture/${index}`,
    ),
  );
}

function expectErrorCode(operation: () => unknown, code: JobCandidateNormalizationErrorCode): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(JobCandidateNormalizationError);
    expect((error as JobCandidateNormalizationError).code).toBe(code);
    expect((error as Error).message).toBe("Job candidate normalization rejected invalid input.");
    return;
  }
  throw new Error(`Expected normalization error ${code}.`);
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child);
}

function decimalFromCents(value: number): string {
  const whole = Math.floor(value / 100);
  const cents = String(value % 100).padStart(2, "0");
  return `${whole}.${cents}`;
}

describe("deterministic job candidate normalization", () => {
  it("reproduces the golden field, source, provenance, raw-value, and summary contract", () => {
    const candidates = fixtureCandidates();
    const output = normalizeJobCandidatesV1({
      specVersion: 1,
      candidates,
      source: goldenFixture.source.input,
    });

    expect(output.source).toEqual(goldenFixture.source.expected);
    expect(output.summary).toEqual(goldenFixture.summary);
    expect(
      output.candidates.map(({ status, normalizedValue, warningCodes }) => ({
        status,
        normalizedValue,
        warningCodes,
      })),
    ).toEqual(goldenFixture.candidates.map((fixture) => fixture.expected));
    expect(output.candidates.map((result) => result.sourceCandidate)).toEqual(candidates);
    expect(output.candidates[1]?.sourceCandidate.rawValue).toBe("<span>ACME, Inc.</span>");
    expectDeepFrozen(output);

    const proof = {
      specVersion: 1,
      fixtureSuite: "job-normalization.golden.json",
      inputCandidates: output.summary.inputCandidates,
      normalized: output.summary.normalized,
      partial: output.summary.partial,
      ambiguous: output.summary.ambiguous,
      notApplicable: output.summary.notApplicable,
      scenarios: {
        titleAndCompanyKeys: true,
        physicalAndRemoteLocationsSeparated: true,
        workModeNormalized: true,
        exactSalaryMinorUnits: true,
        currencyNormalized: true,
        dateAndInstantSeparated: true,
        sourceCanonicalizedByAllowlist: true,
        rawEvidenceAndProvenanceRetained: true,
        immutableOutput: true,
      },
    };
    expect(proof).toEqual({
      specVersion: 1,
      fixtureSuite: "job-normalization.golden.json",
      inputCandidates: 16,
      normalized: 11,
      partial: 1,
      ambiguous: 3,
      notApplicable: 1,
      scenarios: {
        titleAndCompanyKeys: true,
        physicalAndRemoteLocationsSeparated: true,
        workModeNormalized: true,
        exactSalaryMinorUnits: true,
        currencyNormalized: true,
        dateAndInstantSeparated: true,
        sourceCanonicalizedByAllowlist: true,
        rawEvidenceAndProvenanceRetained: true,
        immutableOutput: true,
      },
    });
    const runtimeProcess = (
      globalThis as typeof globalThis & {
        readonly process?: { readonly stdout?: { write(value: string): unknown } };
      }
    ).process;
    runtimeProcess?.stdout?.write(`XTR007_PROOF ${JSON.stringify(proof)}\n`);
  });

  it("retains user confirmation as evidence without mutating or promoting the candidate", () => {
    const confirmed = {
      ...candidate("title", "Senior Engineer", 40, "<h1>Senior Engineer</h1>"),
      userConfirmation: {
        specVersion: 1 as const,
        id: candidateId(41),
        actor: "user" as const,
        confirmedAt: "2026-09-03T05:31:00.000Z",
        confirmedValueHash: "a".repeat(64),
      },
    } satisfies FieldCandidateV1;
    const before = structuredClone(confirmed);

    const output = normalizeJobCandidatesV1({
      specVersion: 1,
      candidates: [confirmed],
      source: null,
    });

    expect(confirmed).toEqual(before);
    expect(output.candidates[0]?.sourceCandidate).toEqual(before);
    expect(output.candidates[0]?.status).toBe("normalized");
    expect(output.candidates[0]?.sourceCandidate.userConfirmation).toEqual(
      confirmed.userConfirmation,
    );
  });

  it("keeps a usable source partial when another source field is invalid", () => {
    const source: JobSourceNormalizationRawV1 = {
      url: "javascript:alert(1)",
      sourceKind: "Lever API",
      externalId: null,
      materialQueryParameters: [],
    };
    const output = normalizeJobCandidatesV1({ specVersion: 1, candidates: [], source });

    expect(output.source).toEqual({
      specVersion: 1,
      raw: source,
      status: "partial",
      value: { canonicalUrl: null, sourceKind: "lever-api", externalId: null },
      warningCodes: ["invalid_source_url"],
    });
  });

  it("normalizes compatible Unicode and rejects hidden-format text", () => {
    const output = normalizeJobCandidatesV1({
      specVersion: 1,
      candidates: [
        candidate("title", "Ｓｒ．　Software Eng", 42),
        candidate("company", "ＡＣＭＥ， Ｉｎｃ．", 43),
        candidate("title", "Senior\u200BEngineer", 44),
      ],
      source: null,
    });

    expect(output.candidates[0]?.normalizedValue).toEqual({
      kind: "title",
      displayValue: "Sr. Software Eng",
      comparisonKey: "senior software engineer",
    });
    expect(output.candidates[1]?.normalizedValue).toEqual({
      kind: "company",
      displayValue: "ACME, Inc.",
      comparisonKey: "acme",
    });
    expect(output.candidates[2]).toMatchObject({
      status: "ambiguous",
      normalizedValue: null,
      warningCodes: ["invalid_text"],
    });
  });

  it.each([
    ["hourly", "hour"],
    ["per day", "day"],
    ["weekly", "week"],
    ["monthly", "month"],
    ["Per-Year-Salary", "year"],
  ] as const)("maps the explicit %s salary interval to %s", (inputInterval, expectedInterval) => {
    const output = normalizeJobCandidatesV1({
      specVersion: 1,
      candidates: [
        candidate(
          "salary",
          { currency: "USD", minValue: "10", maxValue: "20", interval: inputInterval },
          45,
        ),
      ],
      source: null,
    });
    const normalized = output.candidates[0]?.normalizedValue;

    expect(normalized?.kind).toBe("salary");
    if (normalized?.kind === "salary") expect(normalized.interval).toBe(expectedInterval);
  });

  it("does not guess locale-specific thousands and decimal separators", () => {
    const output = normalizeJobCandidatesV1({
      specVersion: 1,
      candidates: [candidate("salary", "EUR 60.000 to 70.000 annually", 46)],
      source: null,
    });

    expect(output.candidates[0]).toMatchObject({
      status: "ambiguous",
      normalizedValue: null,
      warningCodes: ["invalid_salary"],
    });
    expect(output.candidates[0]?.sourceCandidate.value).toBe("EUR 60.000 to 70.000 annually");
  });

  it.each([
    ["Remote", "remote"],
    ["Hybrid", "hybrid"],
    ["On-site", "on_site"],
  ] as const)("maps the explicit %s work mode to %s", (inputMode, expectedMode) => {
    const output = normalizeJobCandidatesV1({
      specVersion: 1,
      candidates: [candidate("workplace_type", inputMode, 47)],
      source: null,
    });

    expect(output.candidates[0]?.normalizedValue).toEqual({
      kind: "workplace_type",
      value: expectedMode,
    });
  });

  it("is deterministic and never erases arbitrary valid title source values", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom("Senior", "Sr", "Software", "Eng", "Developer", "Platform", "Lead"),
          { minLength: 1, maxLength: 10 },
        ),
        fc.constantFrom(" ", "  ", " - ", " / "),
        (tokens, separator) => {
          const value = tokens.join(separator);
          const input = {
            specVersion: 1 as const,
            candidates: [candidate("title", value, 50, value)],
            source: null,
          };
          const first = normalizeJobCandidatesV1(input);
          const second = normalizeJobCandidatesV1(input);

          expect(first).toEqual(second);
          expect(first.candidates[0]?.sourceCandidate.value).toBe(value);
          expect(first.candidates[0]?.sourceCandidate.rawValue).toBe(value);
          expect(first.candidates[0]?.normalizedValue?.kind).toBe("title");
        },
      ),
      { numRuns: 300 },
    );
  });

  it("converts decimal salaries to exact safe minor units without binary floating point", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50_000_000 }),
        fc.integer({ min: 0, max: 50_000_000 }),
        (minimumCents, deltaCents) => {
          const maximumCents = minimumCents + deltaCents;
          const output = normalizeJobCandidatesV1({
            specVersion: 1,
            candidates: [
              candidate(
                "salary",
                {
                  currency: "USD",
                  minValue: decimalFromCents(minimumCents),
                  maxValue: decimalFromCents(maximumCents),
                  interval: "year",
                },
                60,
              ),
            ],
            source: null,
          });
          const normalized = output.candidates[0]?.normalizedValue;

          expect(normalized?.kind).toBe("salary");
          if (normalized?.kind !== "salary") return;
          expect(normalized.minimumMinorUnits).toBe(minimumCents);
          expect(normalized.maximumMinorUnits).toBe(maximumCents);
          expect(normalized.currency).toBe("USD");
          expect(normalized.currencyScale).toBe(2);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("retains only explicitly material query parameters in canonical source URLs", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789"), {
          minLength: 1,
          maxLength: 32,
        }),
        (characters) => {
          const jobId = characters.join("");
          const output = normalizeJobCandidatesV1({
            specVersion: 1,
            candidates: [],
            source: {
              url: `https://jobs.example.test/opening?utm_source=mail&job_id=${jobId}&ref=board#apply`,
              sourceKind: null,
              externalId: null,
              materialQueryParameters: ["job_id"],
            },
          });

          expect(output.source?.value?.canonicalUrl).toBe(
            `https://jobs.example.test/opening?job_id=${jobId}`,
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it("fails closed for unknown keys, duplicate candidates, excessive candidates, and cycles", () => {
    const base = candidate("title", "Engineer");
    expectErrorCode(
      () =>
        normalizeJobCandidatesV1({
          specVersion: 1,
          candidates: [base],
          source: null,
          extra: "secret@example.test",
        } as unknown as JobCandidateNormalizationInputV1),
      "input_invalid",
    );
    expectErrorCode(
      () =>
        normalizeJobCandidatesV1({
          specVersion: 1,
          candidates: [base, structuredClone(base)],
          source: null,
        }),
      "candidate_duplicate",
    );
    expectErrorCode(
      () =>
        normalizeJobCandidatesV1({
          specVersion: 1,
          candidates: Array.from(
            { length: JOB_CANDIDATE_NORMALIZATION_LIMITS.maxCandidates + 1 },
            () => structuredClone(base),
          ),
          source: null,
        }),
      "candidate_limit_exceeded",
    );
    const cyclic: Record<string, unknown> = {
      specVersion: 1,
      candidates: [],
      source: null,
    };
    cyclic["cycle"] = cyclic;
    expectErrorCode(
      () => normalizeJobCandidatesV1(cyclic as unknown as JobCandidateNormalizationInputV1),
      "input_invalid",
    );
  });
});
