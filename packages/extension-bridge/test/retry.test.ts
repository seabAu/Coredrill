import {
  buildCaptureEnvelopeV1,
  type CaptureEnvelopeBuildResult,
  type PageCaptureSnapshot,
} from "@coredrill/capture-core";
import { describe, expect, it } from "vitest";

import {
  OUTBOX_RETRY_POLICY,
  acknowledgeScheduledOutboxTransfer,
  createEmptyOutboxState,
  createOutboxRetryState,
  createTransferAcknowledgement,
  describeOutboxLifecycle,
  prepareNextScheduledOutboxTransfer,
  pruneExpiredOutboxLifecycle,
  queueCaptureEnvelope,
  safeParseOutboxRetryState,
  synchronizeOutboxRetryState,
  type OutboxStateV1,
  type TransferPullRequestV1,
} from "../src/index.js";

const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const baseTime = new Date("2026-09-26T12:00:00.000Z");

function entropy(seed: number): (length: number) => Uint8Array {
  return (length) => Uint8Array.from({ length }, (_, index) => (seed + index) % 256);
}

async function envelope(
  sequence: number,
  options: { readonly now?: Date; readonly retentionMilliseconds?: number } = {},
): Promise<Extract<CaptureEnvelopeBuildResult, { readonly success: true }>["envelope"]> {
  const snapshot: PageCaptureSnapshot = {
    specVersion: 1,
    url: `https://jobs.example.test/retry/${String(sequence)}`,
    pageTitle: `Retry job ${String(sequence)}`,
    fields: {},
  };
  const built = await buildCaptureEnvelopeV1(snapshot, {
    senderId: extensionId,
    sequence,
    now: options.now ?? baseTime,
    ...(options.retentionMilliseconds === undefined
      ? {}
      : { retentionMilliseconds: options.retentionMilliseconds }),
    randomBytes: entropy(sequence + 1),
  });
  if (!built.success) throw new Error(built.issue);
  return built.envelope;
}

async function queuedState(value = envelope(1)): Promise<{
  readonly outbox: OutboxStateV1;
  readonly retry: ReturnType<typeof createOutboxRetryState>;
}> {
  const queued = await queueCaptureEnvelope(createEmptyOutboxState(), await value, baseTime);
  if (!queued.success) throw new Error(queued.issue);
  return { outbox: queued.state, retry: createOutboxRetryState(queued.state) };
}

function pull(suffix = "base"): TransferPullRequestV1 {
  return {
    specVersion: 1,
    type: "capture.transfer.pull.v1",
    requestId: `retry_request_${suffix.padEnd(16, "x")}`,
  };
}

describe("persistent outbox retry lifecycle", () => {
  it("strictly validates retry metadata and migrates an attempted legacy item as due now", async () => {
    const queued = await queuedState();
    await expect(safeParseOutboxRetryState(queued.retry, queued.outbox)).resolves.toEqual({
      success: true,
      state: queued.retry,
    });
    await expect(
      safeParseOutboxRetryState(
        {
          ...queued.retry,
          items: [{ ...queued.retry.items[0], unexpected: true }],
        },
        queued.outbox,
      ),
    ).resolves.toMatchObject({ success: false, code: "retry_state_invalid" });

    const legacyOutbox: OutboxStateV1 = {
      specVersion: 1,
      items: [{ ...queued.outbox.items[0]!, attemptCount: 2 }],
    };
    const migrated = createOutboxRetryState(legacyOutbox, baseTime.toISOString());
    expect(migrated.items[0]).toMatchObject({
      lastAttemptAt: null,
      nextAttemptAt: baseTime.toISOString(),
      lastErrorCode: "legacy_attempt_pending",
    });
    await expect(safeParseOutboxRetryState(migrated, legacyOutbox)).resolves.toMatchObject({
      success: true,
    });

    const afterExpiry = new Date(Date.parse(legacyOutbox.items[0]!.expiresAt) + 1_000);
    const expiredMigration = createOutboxRetryState(legacyOutbox, afterExpiry.toISOString());
    expect(expiredMigration.items[0]?.nextAttemptAt).toBe(legacyOutbox.items[0]?.expiresAt);
    await expect(
      pruneExpiredOutboxLifecycle(legacyOutbox, expiredMigration, afterExpiry),
    ).resolves.toMatchObject({ success: true, removedExpired: 1, state: { items: [] } });
  });

  it("persists deterministic bounded backoff and removes metadata only after exact acknowledgement", async () => {
    const queued = await queuedState();
    const first = await prepareNextScheduledOutboxTransfer(
      queued.outbox,
      queued.retry,
      pull("first"),
      baseTime,
    );
    expect(first).toMatchObject({
      success: true,
      response: { type: "capture.transfer.offer.v1", attempt: 1 },
      retryState: {
        items: [
          {
            lastAttemptAt: baseTime.toISOString(),
            nextAttemptAt: new Date(
              baseTime.getTime() + OUTBOX_RETRY_POLICY.initialDelayMilliseconds,
            ).toISOString(),
            lastErrorCode: "acknowledgement_pending",
          },
        ],
      },
    });
    if (!first.success || first.response.type !== "capture.transfer.offer.v1") {
      throw new Error("Expected a scheduled transfer offer.");
    }

    await expect(
      prepareNextScheduledOutboxTransfer(
        first.state,
        first.retryState,
        pull("early"),
        new Date(baseTime.getTime() + OUTBOX_RETRY_POLICY.initialDelayMilliseconds - 1),
      ),
    ).resolves.toMatchObject({ success: false, code: "retry_not_due" });

    const retryAt = new Date(baseTime.getTime() + OUTBOX_RETRY_POLICY.initialDelayMilliseconds);
    const second = await prepareNextScheduledOutboxTransfer(
      first.state,
      first.retryState,
      pull("second"),
      retryAt,
    );
    expect(second).toMatchObject({
      success: true,
      response: { type: "capture.transfer.offer.v1", attempt: 2 },
      retryState: {
        items: [
          {
            lastAttemptAt: retryAt.toISOString(),
            nextAttemptAt: new Date(
              retryAt.getTime() + OUTBOX_RETRY_POLICY.initialDelayMilliseconds * 2,
            ).toISOString(),
          },
        ],
      },
    });
    if (!second.success || second.response.type !== "capture.transfer.offer.v1") {
      throw new Error("Expected the due retry offer.");
    }

    const acknowledgement = createTransferAcknowledgement(second.response);
    const acknowledged = await acknowledgeScheduledOutboxTransfer(
      second.state,
      second.retryState,
      acknowledgement,
      retryAt,
    );
    expect(acknowledged).toMatchObject({
      success: true,
      state: { items: [] },
      retryState: { items: [] },
    });
  });

  it("caps attempts and keeps exhausted captures available for export instead of evicting them", async () => {
    let lifecycle = await queuedState();
    let now = baseTime;
    for (let attempt = 1; attempt <= OUTBOX_RETRY_POLICY.maximumAttempts; attempt += 1) {
      const prepared = await prepareNextScheduledOutboxTransfer(
        lifecycle.outbox,
        lifecycle.retry,
        pull(`attempt${String(attempt)}`),
        now,
      );
      if (!prepared.success || prepared.response.type !== "capture.transfer.offer.v1") {
        throw new Error("Expected a bounded transfer attempt.");
      }
      lifecycle = { outbox: prepared.state, retry: prepared.retryState };
      now = new Date(Date.parse(prepared.retryState.items[0]!.nextAttemptAt));
    }
    await expect(
      prepareNextScheduledOutboxTransfer(lifecycle.outbox, lifecycle.retry, pull("exhausted"), now),
    ).resolves.toMatchObject({ success: false, code: "retry_exhausted" });
    expect(lifecycle.outbox.items).toHaveLength(1);
    await expect(
      describeOutboxLifecycle(lifecycle.outbox, lifecycle.retry, now),
    ).resolves.toMatchObject({ success: true, summary: { exhaustedCount: 1, activeCount: 1 } });
  });

  it("does not let an exhausted capture block a newer eligible capture", async () => {
    const first = await queuedState();
    const secondQueued = await queueCaptureEnvelope(first.outbox, await envelope(4), baseTime);
    if (!secondQueued.success) throw new Error(secondQueued.issue);
    const exhaustedOutbox: OutboxStateV1 = {
      specVersion: 1,
      items: [
        {
          ...secondQueued.state.items[0]!,
          attemptCount: OUTBOX_RETRY_POLICY.maximumAttempts,
        },
        secondQueued.state.items[1]!,
      ],
    };
    const retry = createOutboxRetryState(exhaustedOutbox, baseTime.toISOString());
    const prepared = await prepareNextScheduledOutboxTransfer(
      exhaustedOutbox,
      retry,
      pull("skip-exhausted"),
      baseTime,
    );
    expect(prepared).toMatchObject({
      success: true,
      response: {
        type: "capture.transfer.offer.v1",
        envelope: { id: exhaustedOutbox.items[1]!.envelope.id },
        attempt: 1,
      },
      state: {
        items: [
          { envelope: { id: exhaustedOutbox.items[0]!.envelope.id } },
          { envelope: { id: exhaustedOutbox.items[1]!.envelope.id }, attemptCount: 1 },
        ],
      },
    });
  });

  it("warns within the expiry window and prunes expired outbox/retry records together", async () => {
    const short = await envelope(2, { retentionMilliseconds: 60 * 60_000 });
    const queued = await queuedState(Promise.resolve(short));
    await expect(
      describeOutboxLifecycle(queued.outbox, queued.retry, baseTime),
    ).resolves.toMatchObject({
      success: true,
      summary: { activeCount: 1, expiringSoonCount: 1, earliestExpiry: short.expiresAt },
    });
    await expect(
      pruneExpiredOutboxLifecycle(
        queued.outbox,
        queued.retry,
        new Date(Date.parse(short.expiresAt)),
      ),
    ).resolves.toMatchObject({
      success: true,
      state: { items: [] },
      retryState: { items: [] },
      removedExpired: 1,
    });
    await expect(
      prepareNextScheduledOutboxTransfer(
        queued.outbox,
        queued.retry,
        pull("expired"),
        new Date(Date.parse(short.expiresAt)),
      ),
    ).resolves.toMatchObject({
      success: true,
      removedExpired: 1,
      response: { type: "capture.transfer.empty.v1", removedExpired: 1 },
    });
  });

  it("adds new retry metadata without changing an existing queued item's schedule", async () => {
    const first = await queuedState();
    const secondQueued = await queueCaptureEnvelope(first.outbox, await envelope(3), baseTime);
    if (!secondQueued.success) throw new Error(secondQueued.issue);
    const synchronized = await synchronizeOutboxRetryState(
      first.outbox,
      first.retry,
      secondQueued.state,
      baseTime,
    );
    expect(synchronized).toMatchObject({
      success: true,
      state: {
        items: [
          first.retry.items[0],
          {
            envelopeId: secondQueued.item.envelope.id,
            lastAttemptAt: null,
            nextAttemptAt: baseTime.toISOString(),
            lastErrorCode: null,
          },
        ],
      },
    });
  });
});
