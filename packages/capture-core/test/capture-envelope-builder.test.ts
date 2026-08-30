import { safeParseCaptureEnvelopeV1 } from "@coredrill/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  buildCaptureEnvelopeV1,
  canonicalJsonStringify,
  createCaptureEnvelopeContentHashV1,
  safeParsePageCaptureSnapshot,
  sha256Hex,
  verifyCaptureEnvelopeContentHashV1,
  type PageCaptureSnapshot,
} from "../src/index.js";

const now = new Date("2026-08-24T15:30:00.000Z");

const snapshot: PageCaptureSnapshot = {
  specVersion: 1,
  url: "https://jobs.example.test/openings/42?source=fixture",
  canonicalUrl: "https://jobs.example.test/openings/42",
  pageTitle: "Senior Platform Engineer — Example Systems",
  selectedText: "Build reliable local-first systems.",
  jsonLd: [
    {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Senior Platform Engineer",
      hiringOrganization: { "@type": "Organization", name: "Example Systems" },
    },
  ],
  fields: {
    title: {
      value: "Senior Platform Engineer",
      pointer: "/content/jsonLd/0/title",
      method: "jsonld",
      confidence: 0.98,
    },
    company: {
      value: "Example Systems",
      pointer: "/content/jsonLd/0/hiringOrganization/name",
      method: "jsonld",
      confidence: 0.98,
    },
  },
};

function deterministicEntropy(seed = 1): (length: number) => Uint8Array {
  let call = seed;
  return (length) => {
    const bytes = Uint8Array.from({ length }, (_, index) => (call + index) % 256);
    call += 1;
    return bytes;
  };
}

describe("capture envelope builder", () => {
  it("turns a synthetic JobPosting capture into a provenance-retaining valid envelope", async () => {
    const result = await buildCaptureEnvelopeV1(snapshot, {
      senderId: "abcdefghijklmnopabcdefghijklmnop",
      sequence: 42,
      now,
      randomBytes: deterministicEntropy(),
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.issue);
    expect(safeParseCaptureEnvelopeV1(result.envelope).success).toBe(true);
    expect(result.envelope).toMatchObject({
      specVersion: 1,
      capturedAt: "2026-08-24T15:30:00.000Z",
      expiresAt: "2026-08-31T15:30:00.000Z",
      captureMethod: "extension",
      sequence: 42,
      source: {
        url: snapshot.url,
        canonicalUrl: snapshot.canonicalUrl,
        sourceKind: "job_page",
      },
      content: {
        selectedText: snapshot.selectedText,
        jsonLd: snapshot.jsonLd,
      },
    });
    expect(result.envelope.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.envelope.nonce).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(result.envelope.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.envelope.fieldCandidates).toHaveLength(2);
    expect(result.envelope.fieldCandidates.map((candidate) => candidate.fieldName)).toEqual([
      "title",
      "company",
    ]);
    expect(result.envelope.fieldCandidates[0]?.provenance).toMatchObject({
      method: "jsonld",
      source: { sourceId: result.envelope.id, pointer: "/content/jsonLd/0/title" },
      confidence: 0.98,
    });
    await expect(verifyCaptureEnvelopeContentHashV1(result.envelope)).resolves.toBe(true);
  });

  it("uses semantic captured content, not random IDs or sequence, for its dedupe hash", async () => {
    const first = await buildCaptureEnvelopeV1(snapshot, {
      senderId: "abcdefghijklmnopabcdefghijklmnop",
      sequence: 1,
      now,
      randomBytes: deterministicEntropy(1),
    });
    const second = await buildCaptureEnvelopeV1(snapshot, {
      senderId: "abcdefghijklmnopabcdefghijklmnop",
      sequence: 2,
      now: new Date("2026-08-24T16:00:00.000Z"),
      randomBytes: deterministicEntropy(90),
    });
    expect(first.success && second.success).toBe(true);
    if (!first.success || !second.success) throw new Error("Expected valid envelopes.");
    expect(first.envelope.id).not.toBe(second.envelope.id);
    expect(first.envelope.contentHash).toBe(second.envelope.contentHash);
  });

  it("detects semantic source-snapshot mutations through the reusable content checksum", async () => {
    const result = await buildCaptureEnvelopeV1(snapshot, {
      senderId: "abcdefghijklmnopabcdefghijklmnop",
      sequence: 42,
      now,
      randomBytes: deterministicEntropy(),
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.issue);

    const mutated = structuredClone(result.envelope);
    mutated.source.pageTitle = "Mutated title";
    await expect(verifyCaptureEnvelopeContentHashV1(mutated)).resolves.toBe(false);
    await expect(createCaptureEnvelopeContentHashV1(mutated)).resolves.not.toBe(
      result.envelope.contentHash,
    );
  });

  it("builds valid nonce, sequence, and expiry combinations across generated inputs", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
        fc.integer({ min: 1, max: 30 * 24 * 60 * 60 * 1_000 }),
        fc.integer({ min: 0, max: 255 }),
        async (sequence, retentionMilliseconds, entropySeed) => {
          const result = await buildCaptureEnvelopeV1(snapshot, {
            senderId: "abcdefghijklmnopabcdefghijklmnop",
            sequence,
            retentionMilliseconds,
            now,
            randomBytes: deterministicEntropy(entropySeed),
          });
          expect(result.success).toBe(true);
          if (!result.success) throw new Error(result.issue);

          expect(safeParseCaptureEnvelopeV1(result.envelope).success).toBe(true);
          expect(result.envelope.sequence).toBe(sequence);
          expect(
            Date.parse(result.envelope.expiresAt) - Date.parse(result.envelope.capturedAt),
          ).toBe(retentionMilliseconds);
          expect(result.envelope.nonce).toMatch(/^[A-Za-z0-9_-]{24}$/);
          await expect(verifyCaptureEnvelopeContentHashV1(result.envelope)).resolves.toBe(true);
        },
      ),
    );
  });

  it("strictly rejects unsafe URLs, extra keys, oversized text, and hostile JSON depth", () => {
    expect(safeParsePageCaptureSnapshot({ ...snapshot, url: "file:///etc/passwd" })).toMatchObject({
      success: false,
      code: "snapshot_invalid",
    });
    expect(safeParsePageCaptureSnapshot({ ...snapshot, cookie: "secret" })).toMatchObject({
      success: false,
      code: "snapshot_invalid",
    });
    expect(
      safeParsePageCaptureSnapshot({ ...snapshot, selectedText: "x".repeat(64 * 1024 + 1) }),
    ).toMatchObject({ success: false, code: "snapshot_invalid" });

    let deep: unknown = "leaf";
    for (let index = 0; index < 34; index += 1) deep = [deep];
    expect(safeParsePageCaptureSnapshot({ ...snapshot, jsonLd: [deep] })).toMatchObject({
      success: false,
      code: "snapshot_invalid",
    });
  });

  it("returns typed failures for invalid sequencing and entropy", async () => {
    await expect(
      buildCaptureEnvelopeV1(snapshot, {
        senderId: "abcdefghijklmnopabcdefghijklmnop",
        sequence: -1,
        now,
      }),
    ).resolves.toMatchObject({ success: false, code: "envelope_invalid" });
    await expect(
      buildCaptureEnvelopeV1(snapshot, {
        senderId: "abcdefghijklmnopabcdefghijklmnop",
        sequence: 1,
        now,
        randomBytes: () => new Uint8Array(1),
      }),
    ).resolves.toMatchObject({ success: false, code: "envelope_invalid" });
  });
});

describe("canonical JSON", () => {
  it("sorts object keys and produces the standard SHA-256 digest", async () => {
    expect(canonicalJsonStringify({ z: 1, a: [true, null, "x"] })).toBe(
      '{"a":[true,null,"x"],"z":1}',
    );
    await expect(sha256Hex("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("rejects non-JSON numbers, values, prototypes, and cycles", () => {
    expect(() => canonicalJsonStringify(Number.NaN)).toThrow(/finite/);
    expect(() => canonicalJsonStringify(undefined)).toThrow(/JSON values/);
    expect(() => canonicalJsonStringify(new Date())).toThrow(/plain objects/);
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    expect(() => canonicalJsonStringify(circular)).toThrow(/cycles/);
  });
});
