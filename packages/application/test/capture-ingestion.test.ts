import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CAPTURE_DUPLICATE_LIMITS,
  CaptureIngestionError,
  findCaptureDuplicateSuggestionsV1,
  type CaptureDuplicateJobCandidateV1,
} from "../src/index.js";
import fixture from "./fixtures/capture-duplicate-candidates.json" with { type: "json" };

const candidates = fixture.candidates as readonly CaptureDuplicateJobCandidateV1[];

describe("capture ingestion duplicate suggestions", () => {
  it("aggregates exact evidence, exposes fuzzy components, and excludes unrelated jobs", () => {
    expect(findCaptureDuplicateSuggestionsV1(fixture.envelope, candidates)).toEqual([
      {
        jobId: "019539af-7d01-7dd4-8b54-395d8f3fe501",
        reasons: ["source_id", "canonical_url", "content_hash", "fuzzy_title_company"],
        similarity: { title: 1, company: 1 },
      },
      {
        jobId: "019539af-7d02-7dd4-8b54-395d8f3fe502",
        reasons: ["content_hash"],
        similarity: null,
      },
      {
        jobId: "019539af-7d03-7dd4-8b54-395d8f3fe503",
        reasons: ["fuzzy_title_company"],
        similarity: { title: 1, company: 1 },
      },
    ]);
  });

  it("is deterministic across candidate order and does not mutate fixture input", () => {
    const original = structuredClone(fixture);
    const forward = findCaptureDuplicateSuggestionsV1(fixture.envelope, candidates);
    const reverse = findCaptureDuplicateSuggestionsV1(fixture.envelope, [...candidates].reverse());

    expect(reverse).toEqual(forward);
    expect(fixture).toEqual(original);
  });

  it("rejects invalid capture and candidate data with content-free typed errors", () => {
    expect(() => findCaptureDuplicateSuggestionsV1({}, candidates)).toThrowError(
      new CaptureIngestionError("capture_invalid"),
    );
    expect(() =>
      findCaptureDuplicateSuggestionsV1(fixture.envelope, [
        { ...candidates[0], jobId: "not-a-job-id" },
      ] as readonly CaptureDuplicateJobCandidateV1[]),
    ).toThrowError(new CaptureIngestionError("candidate_invalid"));
    expect(() =>
      findCaptureDuplicateSuggestionsV1(
        fixture.envelope,
        Array.from(
          { length: CAPTURE_DUPLICATE_LIMITS.maxCandidates + 1 },
          () => candidates[0],
        ) as readonly CaptureDuplicateJobCandidateV1[],
      ),
    ).toThrowError(new CaptureIngestionError("candidate_limit_exceeded"));
  });

  it("always reports an exact source identity and remains deterministic under rotations", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: candidates.length - 1 }),
        (externalSuffix, offset) => {
          const envelope = structuredClone(fixture.envelope);
          envelope.source.externalId = `JOB-${externalSuffix}`;
          const exactBase = candidates[0]!;
          const exact: CaptureDuplicateJobCandidateV1 = {
            ...exactBase,
            sources: [
              {
                ...exactBase.sources[0]!,
                externalId: envelope.source.externalId,
                canonicalUrl: null,
                contentHashes: [],
              },
            ],
          };
          const ordered = [exact, ...candidates.slice(1)];
          const rotated = [...ordered.slice(offset), ...ordered.slice(0, offset)];

          const first = findCaptureDuplicateSuggestionsV1(envelope, rotated);
          const second = findCaptureDuplicateSuggestionsV1(envelope, [...rotated].reverse());
          expect(first).toEqual(second);
          expect(first.find((suggestion) => suggestion.jobId === exact.jobId)?.reasons).toContain(
            "source_id",
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
