import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  JOB_REQUIREMENT_PARSE_LIMITS,
  parseJobRequirementProposals,
  type JobRequirementProposalDto,
  type ParseJobRequirementsInput,
} from "../src/index.js";

interface GoldenFixture extends ParseJobRequirementsInput {
  readonly expected: readonly Pick<
    JobRequirementProposalDto,
    "category" | "confidence" | "id" | "normalizedText" | "sourceExcerpt" | "sourcePointer"
  >[];
}

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/job-requirement-parser.golden.json", import.meta.url), "utf8"),
) as GoldenFixture;

describe("deterministic job requirement parser", () => {
  it("matches the reviewed golden fixture with exact excerpts and stable categories", () => {
    const first = parseJobRequirementProposals(fixture);
    const second = parseJobRequirementProposals(fixture);

    expect(first).toEqual(second);
    expect(first.specVersion).toBe(1);
    expect(first.proposals).toHaveLength(fixture.expected.length);
    expect(
      first.proposals.map(
        ({ category, confidence, id, normalizedText, sourceExcerpt, sourcePointer }) => ({
          category,
          confidence,
          id,
          normalizedText,
          sourceExcerpt,
          sourcePointer,
        }),
      ),
    ).toEqual(fixture.expected);
    expect(first.proposals[0]?.sourceExcerpt.endsWith("\n")).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.proposals)).toBe(true);
    expect(first.proposals.every((proposal) => Object.isFrozen(proposal))).toBe(true);
  });

  it("fails closed on unbounded input and malformed provenance", () => {
    expect(() =>
      parseJobRequirementProposals({
        blocks: Array.from(
          { length: JOB_REQUIREMENT_PARSE_LIMITS.maxBlocks + 1 },
          () => fixture.blocks[0]!,
        ),
        jobId: fixture.jobId,
      }),
    ).toThrow("too many blocks");
    expect(() =>
      parseJobRequirementProposals({
        blocks: [
          {
            ...fixture.blocks[1]!,
            provenanceId: "not-an-id",
          },
        ],
        jobId: fixture.jobId,
      }),
    ).toThrow();
  });
});
