import { describe, expect, it } from "vitest";

import {
  CaptureReviewPromotionError,
  materializeCaptureReviewPromotionV1,
  prepareCaptureReviewPromotionV1,
  type CaptureReviewPromotionDependenciesV1,
} from "../src/index.js";

const fixture = {
  specVersion: 1,
  id: "019539af-7c11-7dd4-8b54-395d8f3fe4c2",
  capturedAt: "2026-08-24T14:03:05.123Z",
  expiresAt: "2026-08-31T14:03:05.123Z",
  captureMethod: "extension",
  sender: { kind: "browser_extension", id: "abcdefghijklmnopabcdefghijklmnop" },
  sequence: 42,
  nonce: "abcdefghijklmnopqrstuv",
  source: {
    url: "https://jobs.example.test/openings/42?source=careers",
    canonicalUrl: "https://jobs.example.test/openings/42",
    pageTitle: "Senior Platform Engineer — Example Systems",
    sourceKind: "official_careers_page",
    externalId: "JOB-42",
  },
  content: {
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title: "Senior Platform Engineer",
      },
    ],
    selectedText: "Senior Platform Engineer\nExample Systems",
    readableText: "Example Systems is seeking a Senior Platform Engineer.",
    sanitizedHtml: "<article><h1>Senior Platform Engineer</h1></article>",
  },
  fieldCandidates: [
    {
      specVersion: 1,
      id: "019539af-7c12-7dd4-8b54-395d8f3fe4c3",
      fieldName: "title",
      value: "Senior Platform Engineer",
      rawValue: " Senior Platform Engineer ",
      provenance: {
        specVersion: 1,
        source: {
          sourceType: "capture",
          sourceId: "019539af-7c11-7dd4-8b54-395d8f3fe4c2",
          pointer: "/content/jsonLd/0/title",
        },
        method: "jsonld",
        extractor: { name: "coredrill.jobposting", version: "1.0.0" },
        capturedAt: "2026-08-24T14:03:05.123Z",
        confidence: 0.98,
        sourceExcerpt: "Senior Platform Engineer",
        licenseNote: "Synthetic fixture; no third-party content.",
      },
    },
  ],
  captureClient: { name: "coredrill.extension", version: "0.1.0" },
  contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
} as const;

const id = (index: number): string =>
  `019c1000-0000-7000-8000-${index.toString(16).padStart(12, "0")}`;

const dependencies = (): CaptureReviewPromotionDependenciesV1 => {
  let sequence = 1;
  return {
    createId: () => id(sequence++),
    hashConfirmedValue: () => Promise.resolve("d".repeat(64)),
    initiatedAt: "2026-09-26T21:00:00.000Z",
  };
};

const conflictId = (() => {
  let sequence = 900;
  return () => id(sequence++);
})();

const expectCode = async (
  promise: Promise<unknown>,
  code: CaptureReviewPromotionError["code"],
): Promise<void> => {
  await expect(promise).rejects.toMatchObject({
    name: "CaptureReviewPromotionError",
    code,
  });
};

describe("capture review promotion", () => {
  it("prepares the conservative high-confidence candidate set", () => {
    const prepared = prepareCaptureReviewPromotionV1(fixture, conflictId);

    expect(prepared).toEqual({
      specVersion: 1,
      envelopeId: fixture["id"],
      minimumConfidence: 0.95,
      eligibleCandidateIds: ["019539af-7c12-7dd4-8b54-395d8f3fe4c3"],
      decisions: [
        {
          fieldName: "title",
          selectedCandidateId: "019539af-7c12-7dd4-8b54-395d8f3fe4c3",
          selectedConfidence: 0.98,
          disposition: "accept",
          reasons: ["high_confidence"],
        },
      ],
    });
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.eligibleCandidateIds)).toBe(true);
  });

  it("materializes explicit save-new confirmation without confirming held candidates", async () => {
    const descriptionId = id(500);
    const envelope = structuredClone(fixture) as Record<string, unknown>;
    envelope["fieldCandidates"] = [
      ...(envelope["fieldCandidates"] as unknown[]),
      {
        specVersion: 1,
        id: descriptionId,
        fieldName: "description",
        value: "A lower-confidence description.",
        provenance: {
          specVersion: 1,
          source: {
            sourceType: "capture",
            sourceId: fixture["id"],
            pointer: "/content/readableText",
          },
          method: "readability",
          extractor: { name: "fixture", version: "1.0.0" },
          capturedAt: fixture["capturedAt"],
          confidence: 0.7,
        },
      },
    ];
    const titleId = "019539af-7c12-7dd4-8b54-395d8f3fe4c3";
    const result = await materializeCaptureReviewPromotionV1(
      {
        specVersion: 1,
        envelope,
        expectedReviewRowVersion: 1,
        acceptedCandidateIds: [titleId],
        resolution: { kind: "save_new" },
      },
      dependencies(),
    );

    expect(result.resolution).toMatchObject({
      kind: "save_new",
      job: {
        title: "Senior Platform Engineer",
        normalizedTitle: "senior platform engineer",
        company: null,
        descriptionText: "",
      },
    });
    expect(result.source).toMatchObject({
      connectorId: "official_careers_page",
      canonicalUrl: "https://jobs.example.test/openings/42",
      contentHash: fixture["contentHash"],
    });
    expect(result.snapshot).toMatchObject({
      rawText: "Example Systems is seeking a Senior Platform Engineer.",
      retentionClass: "capture_review",
    });
    expect(JSON.parse(result.snapshot.structuredJson ?? "null")).toEqual({
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "JobPosting",
          title: "Senior Platform Engineer",
        },
      ],
    });
    expect(result.candidates).toHaveLength(2);
    expect(
      result.candidates.find(({ fieldName }) => fieldName === "title")?.userConfirmation,
    ).toMatchObject({
      confirmedAt: "2026-09-26T21:00:00.000Z",
      confirmedValueHash: "d".repeat(64),
    });
    expect(
      result.candidates.find(({ fieldName }) => fieldName === "description")?.userConfirmation,
    ).toBeNull();
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.candidates)).toBe(true);
  });

  it("holds conflicts and rejects forged or below-threshold acceptance", async () => {
    const conflictEnvelope = structuredClone(fixture) as Record<string, unknown>;
    const first = (conflictEnvelope["fieldCandidates"] as Record<string, unknown>[])[0];
    conflictEnvelope["fieldCandidates"] = [
      first,
      {
        ...(first ?? {}),
        id: id(600),
        value: "Different title",
      },
    ];
    expect(
      prepareCaptureReviewPromotionV1(conflictEnvelope, conflictId).eligibleCandidateIds,
    ).toEqual([]);
    await expectCode(
      materializeCaptureReviewPromotionV1(
        {
          specVersion: 1,
          envelope: conflictEnvelope,
          expectedReviewRowVersion: 1,
          acceptedCandidateIds: ["019539af-7c12-7dd4-8b54-395d8f3fe4c3"],
          resolution: { kind: "save_new" },
        },
        dependencies(),
      ),
      "accepted_candidate_invalid",
    );

    const below = structuredClone(fixture) as Record<string, unknown>;
    const candidate = (below["fieldCandidates"] as Record<string, unknown>[])[0];
    if (candidate === undefined) throw new Error("Expected title fixture candidate.");
    candidate["provenance"] = {
      ...(candidate["provenance"] as Record<string, unknown>),
      confidence: 0.949,
    };
    await expectCode(
      materializeCaptureReviewPromotionV1(
        {
          specVersion: 1,
          envelope: below,
          expectedReviewRowVersion: 1,
          acceptedCandidateIds: [candidate["id"] as string],
          resolution: { kind: "save_new" },
        },
        dependencies(),
      ),
      "accepted_candidate_invalid",
    );
  });

  it("allows merge with every incoming candidate still unconfirmed", async () => {
    const result = await materializeCaptureReviewPromotionV1(
      {
        specVersion: 1,
        envelope: fixture,
        expectedReviewRowVersion: 3,
        acceptedCandidateIds: [],
        resolution: { kind: "merge_existing", jobId: id(700) },
      },
      dependencies(),
    );

    expect(result.resolution).toEqual({ kind: "merge_existing", jobId: id(700) });
    expect(result.expectedReviewRowVersion).toBe(3);
    expect(result.candidates.every(({ userConfirmation }) => userConfirmation === null)).toBe(true);
  });

  it("requires an accepted title for save and rejects invalid confirmation hashing", async () => {
    await expectCode(
      materializeCaptureReviewPromotionV1(
        {
          specVersion: 1,
          envelope: fixture,
          expectedReviewRowVersion: 1,
          acceptedCandidateIds: [],
          resolution: { kind: "save_new" },
        },
        dependencies(),
      ),
      "title_required",
    );
    await expectCode(
      materializeCaptureReviewPromotionV1(
        {
          specVersion: 1,
          envelope: fixture,
          expectedReviewRowVersion: 1,
          acceptedCandidateIds: ["019539af-7c12-7dd4-8b54-395d8f3fe4c3"],
          resolution: { kind: "save_new" },
        },
        { ...dependencies(), hashConfirmedValue: () => Promise.resolve("invalid") },
      ),
      "input_invalid",
    );
  });
});
