import {
  buildCaptureEnvelopeV1,
  type CaptureEnvelopeBuildResult,
  type PageCaptureSnapshot,
} from "@coredrill/capture-core";
import { describe, expect, it } from "vitest";

import {
  TRANSFER_LIMITS,
  acknowledgeOutboxTransfer,
  createEmptyOutboxState,
  createOutboxExport,
  createTransferAcknowledgement,
  parseExternalTransferRequest,
  parseOutboxExportJson,
  prepareNextOutboxTransfer,
  queueCaptureEnvelope,
  safeParseOutboxExport,
  safeParseTransferResponse,
  type OutboxStateV1,
  type TransferOfferV1,
  type TransferPullRequestV1,
} from "../src/index.js";

const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const baseTime = new Date("2026-08-24T18:00:00.000Z");

function entropy(seed: number): (length: number) => Uint8Array {
  let call = seed;
  return (length) => {
    const bytes = Uint8Array.from({ length }, (_, index) => (call + index) % 256);
    call += 1;
    return bytes;
  };
}

async function envelope(
  sequence = 1,
  options: { readonly now?: Date; readonly retentionMilliseconds?: number } = {},
): Promise<Extract<CaptureEnvelopeBuildResult, { readonly success: true }>["envelope"]> {
  const snapshot: PageCaptureSnapshot = {
    specVersion: 1,
    url: `https://jobs.example.test/openings/${String(sequence)}`,
    pageTitle: `Synthetic job ${String(sequence)}`,
    fields: {},
  };
  const built = await buildCaptureEnvelopeV1(snapshot, {
    senderId: extensionId,
    sequence,
    now: options.now ?? baseTime,
    ...(options.retentionMilliseconds === undefined
      ? {}
      : { retentionMilliseconds: options.retentionMilliseconds }),
    randomBytes: entropy(sequence),
  });
  if (!built.success) throw new Error(built.issue);
  return built.envelope;
}

const pull = (requestId = "request_id_abcdefghijkl"): TransferPullRequestV1 => ({
  specVersion: 1,
  type: "capture.transfer.pull.v1",
  requestId,
});

async function queuedState(value?: Awaited<ReturnType<typeof envelope>>): Promise<OutboxStateV1> {
  const queued = await queueCaptureEnvelope(
    createEmptyOutboxState(),
    value ?? (await envelope()),
    baseTime,
  );
  if (!queued.success) throw new Error(queued.issue);
  return queued.state;
}

describe("extension transfer protocol security", () => {
  it("offers, retries without acknowledgement, and removes only the exact acknowledged item", async () => {
    const first = await prepareNextOutboxTransfer(await queuedState(), pull(), baseTime);
    expect(first).toMatchObject({
      success: true,
      response: { type: "capture.transfer.offer.v1", attempt: 1 },
    });
    if (!first.success || first.response.type !== "capture.transfer.offer.v1") {
      throw new Error("Expected a transfer offer.");
    }

    const retry = await prepareNextOutboxTransfer(
      first.state,
      pull("retry_request_abcdefghij"),
      baseTime,
    );
    expect(retry).toMatchObject({
      success: true,
      response: { type: "capture.transfer.offer.v1", attempt: 2 },
    });
    if (!retry.success || retry.response.type !== "capture.transfer.offer.v1") {
      throw new Error("Expected a retry offer.");
    }

    const acknowledgement = createTransferAcknowledgement(retry.response);
    const acknowledged = await acknowledgeOutboxTransfer(retry.state, acknowledgement, baseTime);
    expect(acknowledged).toMatchObject({
      success: true,
      state: { items: [] },
      response: { type: "capture.transfer.acknowledged.v1", remainingCount: 0 },
    });
    if (!acknowledged.success) throw new Error(acknowledged.issue);
    await expect(
      acknowledgeOutboxTransfer(acknowledged.state, acknowledgement, baseTime),
    ).resolves.toMatchObject({ success: false, code: "replay_or_unknown_ack" });
  });

  it("rejects wrong IDs, altered integrity metadata, and acknowledgement-before-offer", async () => {
    const state = await queuedState();
    const item = state.items[0];
    if (item === undefined) throw new Error("Expected queued capture.");
    const premature = {
      specVersion: 1,
      type: "capture.transfer.ack.v1",
      requestId: "premature_request_abcde",
      envelopeId: item.envelope.id,
      envelopeChecksum: item.envelopeChecksum,
      contentHash: item.envelope.contentHash,
      nonce: item.envelope.nonce,
      sequence: item.envelope.sequence,
    } as const;
    await expect(acknowledgeOutboxTransfer(state, premature, baseTime)).resolves.toMatchObject({
      success: false,
      code: "ack_mismatch",
    });

    const offered = await prepareNextOutboxTransfer(state, pull(), baseTime);
    if (!offered.success || offered.response.type !== "capture.transfer.offer.v1") {
      throw new Error("Expected a transfer offer.");
    }
    const acknowledgement = createTransferAcknowledgement(offered.response);
    await expect(
      acknowledgeOutboxTransfer(
        offered.state,
        { ...acknowledgement, envelopeChecksum: "0".repeat(64) },
        baseTime,
      ),
    ).resolves.toMatchObject({ success: false, code: "ack_mismatch" });
    await expect(
      acknowledgeOutboxTransfer(
        offered.state,
        {
          ...acknowledgement,
          envelopeId: "0198d9cf-93b7-7a37-8b56-fba6b5f0ce11",
        },
        baseTime,
      ),
    ).resolves.toMatchObject({ success: false, code: "replay_or_unknown_ack" });
  });

  it("bounds and strictly validates page-controlled requests", () => {
    expect(parseExternalTransferRequest(pull())).toEqual(pull());
    expect(parseExternalTransferRequest({ ...pull(), unexpected: true })).toBeUndefined();
    expect(
      parseExternalTransferRequest({
        ...pull(),
        padding: "x".repeat(TRANSFER_LIMITS.maxRequestBytes),
      }),
    ).toBeUndefined();
    expect(
      parseExternalTransferRequest({
        specVersion: 1,
        type: "capture.fetch-url.v1",
        requestId: "request_id_abcdefghijkl",
        url: "https://attacker.example/steal",
      }),
    ).toBeUndefined();
  });

  it("validates the request correlation, exact extension ID, checksum, and expiry on receipt", async () => {
    const prepared = await prepareNextOutboxTransfer(await queuedState(), pull(), baseTime);
    if (!prepared.success || prepared.response.type !== "capture.transfer.offer.v1") {
      throw new Error("Expected a transfer offer.");
    }
    const offer = prepared.response;
    await expect(
      safeParseTransferResponse(offer, {
        expectedRequestId: offer.requestId,
        expectedExtensionId: extensionId,
        now: baseTime,
      }),
    ).resolves.toEqual(offer);
    await expect(
      safeParseTransferResponse(offer, {
        expectedRequestId: "wrong_request_abcdefghij",
        expectedExtensionId: extensionId,
        now: baseTime,
      }),
    ).resolves.toBeUndefined();
    await expect(
      safeParseTransferResponse(offer, {
        expectedRequestId: offer.requestId,
        expectedExtensionId: "wrongextensionidwrongextensionid",
        now: baseTime,
      }),
    ).resolves.toBeUndefined();
    await expect(
      safeParseTransferResponse(
        { ...offer, envelopeChecksum: "0".repeat(64) },
        {
          expectedRequestId: offer.requestId,
          expectedExtensionId: extensionId,
          now: baseTime,
        },
      ),
    ).resolves.toBeUndefined();
    await expect(
      safeParseTransferResponse(offer, {
        expectedRequestId: offer.requestId,
        expectedExtensionId: extensionId,
        now: new Date(offer.envelope.expiresAt),
      }),
    ).resolves.toBeUndefined();
  });

  it("creates and verifies a bounded portable outbox export", async () => {
    const created = await createOutboxExport(await queuedState(), baseTime);
    expect(created).toMatchObject({ success: true, data: { items: [{ attemptCount: 0 }] } });
    if (!created.success) throw new Error(created.issue);
    await expect(safeParseOutboxExport(structuredClone(created.data), baseTime)).resolves.toEqual(
      created,
    );
    const corrupt = structuredClone(created.data) as { itemsChecksum: string };
    corrupt.itemsChecksum = "0".repeat(64);
    await expect(safeParseOutboxExport(corrupt, baseTime)).resolves.toMatchObject({
      success: false,
      code: "checksum_mismatch",
    });
    await expect(
      parseOutboxExportJson(`{"padding":"${"x".repeat(TRANSFER_LIMITS.maxExportBytes)}"}`),
    ).resolves.toMatchObject({ success: false, code: "export_too_large" });
  });

  it("rejects expired offers and expired manual exports", async () => {
    const shortLived = await envelope(2, { retentionMilliseconds: 1_000 });
    const state = await queuedState(shortLived);
    const expiredAt = new Date(baseTime.getTime() + 2_000);
    const pullResult = await prepareNextOutboxTransfer(state, pull(), expiredAt);
    expect(pullResult).toMatchObject({
      success: true,
      response: { type: "capture.transfer.empty.v1", removedExpired: 1 },
    });

    const exported = await createOutboxExport(state, baseTime);
    if (!exported.success) throw new Error(exported.issue);
    await expect(safeParseOutboxExport(exported.data, expiredAt)).resolves.toMatchObject({
      success: false,
      code: "capture_expired",
    });
  });

  it("does not trust a structurally valid offer with a changed payload", async () => {
    const prepared = await prepareNextOutboxTransfer(await queuedState(), pull(), baseTime);
    if (!prepared.success || prepared.response.type !== "capture.transfer.offer.v1") {
      throw new Error("Expected a transfer offer.");
    }
    const altered = structuredClone(prepared.response) as TransferOfferV1 & {
      envelope: { source: { pageTitle?: string } };
    };
    altered.envelope.source.pageTitle = "Attacker controlled mutation";
    await expect(
      safeParseTransferResponse(altered, {
        expectedRequestId: altered.requestId,
        expectedExtensionId: extensionId,
        now: baseTime,
      }),
    ).resolves.toBeUndefined();
  });
});
