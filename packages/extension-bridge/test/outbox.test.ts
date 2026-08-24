import {
  buildCaptureEnvelopeV1,
  type CaptureEnvelopeBuildResult,
  type PageCaptureSnapshot,
} from "@coredrill/capture-core";
import { describe, expect, it } from "vitest";

import {
  OUTBOX_LIMITS,
  createEmptyOutboxState,
  queueCaptureEnvelope,
  safeParseOutboxState,
  type OutboxStateV1,
} from "../src/index.js";

const baseTime = new Date("2026-08-24T17:00:00.000Z");

function entropy(seed: number): (length: number) => Uint8Array {
  let call = seed;
  return (length) => {
    const bytes = Uint8Array.from({ length }, (_, index) => (call + index) % 256);
    call += 1;
    return bytes;
  };
}

async function envelope(
  index: number,
  options: {
    readonly now?: Date;
    readonly retentionMilliseconds?: number;
    readonly padding?: number;
    readonly entropySeed?: number;
  } = {},
): Promise<Extract<CaptureEnvelopeBuildResult, { readonly success: true }>["envelope"]> {
  const snapshot: PageCaptureSnapshot = {
    specVersion: 1,
    url: `https://jobs.example.test/openings/${index}`,
    pageTitle: `Job ${index}`,
    ...(options.padding === undefined
      ? {}
      : {
          jsonLd: [
            {
              "@type": "JobPosting",
              title: `Job ${index}`,
              description: "x".repeat(options.padding),
            },
          ],
        }),
    fields: {
      title: {
        value: `Job ${index}`,
        pointer: "/document/title",
        method: "selector",
        confidence: 0.45,
      },
    },
  };
  const built = await buildCaptureEnvelopeV1(snapshot, {
    senderId: "abcdefghijklmnopabcdefghijklmnop",
    sequence: index,
    now: options.now ?? baseTime,
    ...(options.retentionMilliseconds === undefined
      ? {}
      : { retentionMilliseconds: options.retentionMilliseconds }),
    randomBytes: entropy(options.entropySeed ?? index + 1),
  });
  if (!built.success) throw new Error(built.issue);
  return built.envelope;
}

describe("bounded checksummed extension outbox", () => {
  it("queues and revalidates a checksummed CaptureEnvelopeV1", async () => {
    const queued = await queueCaptureEnvelope(
      createEmptyOutboxState(),
      await envelope(1),
      baseTime,
    );
    expect(queued.success).toBe(true);
    if (!queued.success) throw new Error(queued.issue);

    expect(queued.item).toMatchObject({
      specVersion: 1,
      envelopeBytes: expect.any(Number),
      envelopeChecksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      queuedAt: baseTime.toISOString(),
      attemptCount: 0,
      status: "queued",
    });
    await expect(safeParseOutboxState(structuredClone(queued.state))).resolves.toMatchObject({
      success: true,
      encodedBytes: queued.encodedBytes,
    });
  });

  it("rejects schema corruption and preserves checksum failures as typed errors", async () => {
    const queued = await queueCaptureEnvelope(
      createEmptyOutboxState(),
      await envelope(2),
      baseTime,
    );
    if (!queued.success) throw new Error(queued.issue);
    const corrupt = structuredClone(queued.state) as {
      specVersion: number;
      items: Array<{ envelopeChecksum: string }>;
    };
    const first = corrupt.items[0];
    if (first === undefined) throw new Error("Expected an outbox item.");
    first.envelopeChecksum = "0".repeat(64);
    await expect(safeParseOutboxState(corrupt)).resolves.toMatchObject({
      success: false,
      code: "checksum_mismatch",
    });
    await expect(
      safeParseOutboxState({ ...queued.state, unexpected: "page-controlled" }),
    ).resolves.toMatchObject({ success: false, code: "state_invalid" });

    const sameContent = await envelope(2, { entropySeed: 200 });
    const second = await queueCaptureEnvelope(createEmptyOutboxState(), sameContent, baseTime);
    if (!second.success) throw new Error(second.issue);
    await expect(
      safeParseOutboxState({
        specVersion: 1,
        items: [...queued.state.items, ...second.state.items],
      }),
    ).resolves.toMatchObject({ success: false, code: "state_invalid" });
  });

  it("deduplicates semantic content and rejects already-expired captures", async () => {
    const firstEnvelope = await envelope(3);
    const queued = await queueCaptureEnvelope(createEmptyOutboxState(), firstEnvelope, baseTime);
    if (!queued.success) throw new Error(queued.issue);
    await expect(
      queueCaptureEnvelope(queued.state, firstEnvelope, baseTime),
    ).resolves.toMatchObject({
      success: false,
      code: "duplicate",
    });

    const expired = await envelope(4, {
      now: new Date(baseTime.getTime() - 10_000),
      retentionMilliseconds: 1_000,
    });
    await expect(
      queueCaptureEnvelope(createEmptyOutboxState(), expired, baseTime),
    ).resolves.toMatchObject({ success: false, code: "envelope_expired" });
  });

  it("removes expired entries only when a new validated capture is queued", async () => {
    const shortLived = await envelope(5, { retentionMilliseconds: 1_000 });
    const initial = await queueCaptureEnvelope(createEmptyOutboxState(), shortLived, baseTime);
    if (!initial.success) throw new Error(initial.issue);
    const later = new Date(baseTime.getTime() + 2_000);
    const replacement = await envelope(6, { now: later });
    const queued = await queueCaptureEnvelope(initial.state, replacement, later);
    expect(queued).toMatchObject({ success: true, removedExpired: 1 });
    if (!queued.success) throw new Error(queued.issue);
    expect(queued.state.items).toHaveLength(1);
    expect(queued.state.items[0]?.envelope.id).toBe(replacement.id);
  });

  it("refuses item-count overflow without evicting unexpired captures", async () => {
    let state: OutboxStateV1 = createEmptyOutboxState();
    for (let index = 0; index < OUTBOX_LIMITS.maxItems; index += 1) {
      const queued = await queueCaptureEnvelope(state, await envelope(100 + index), baseTime);
      if (!queued.success) throw new Error(queued.issue);
      state = queued.state;
    }
    expect(state.items).toHaveLength(OUTBOX_LIMITS.maxItems);
    await expect(queueCaptureEnvelope(state, await envelope(999), baseTime)).resolves.toMatchObject(
      { success: false, code: "outbox_full" },
    );
    expect(state.items).toHaveLength(OUTBOX_LIMITS.maxItems);
  });

  it("refuses byte-capacity overflow before storage", async () => {
    let state: OutboxStateV1 = createEmptyOutboxState();
    for (let index = 0; index < 3; index += 1) {
      const queued = await queueCaptureEnvelope(
        state,
        await envelope(200 + index, { padding: 1_600_000 }),
        baseTime,
      );
      if (!queued.success) throw new Error(queued.issue);
      state = queued.state;
    }
    const overflow = await queueCaptureEnvelope(
      state,
      await envelope(204, { padding: 1_600_000 }),
      baseTime,
    );
    expect(overflow).toMatchObject({ success: false, code: "outbox_full" });
    expect(JSON.stringify(state).length).toBeLessThan(OUTBOX_LIMITS.maxBytes);
  });
});
