import {
  findCaptureDuplicateSuggestionsV1,
  materializeCaptureReviewPromotionV1,
  prepareCaptureReviewPromotionV1,
  type CaptureDuplicateJobCandidateV1,
  type CaptureDuplicateSuggestionV1,
  type CaptureReviewPreparationV1,
  type CaptureReviewPromotionResolutionV1,
} from "@coredrill/application";
import {
  buildSuppliedCaptureEnvelopeV1,
  parseVerifiedCaptureEnvelopeJsonV1,
  type SuppliedCaptureDraftV1,
} from "@coredrill/capture-core";
import { entityId, generateEntityId } from "@coredrill/domain";
import {
  createEmptyOutboxState,
  createTransferAcknowledgement,
  parseOutboxExportJson,
  queueCaptureEnvelope,
  safeParseTransferResponse,
  type OutboxItemV1,
  type TransferOfferV1,
  type TransferPullRequestV1,
} from "@coredrill/extension-bridge";
import {
  createCaptureReviewRepository,
  sqlStatement,
  type CaptureReviewItemRecord,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
} from "@coredrill/storage-core";

export class ExtensionTransferError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ExtensionTransferError";
  }
}

export interface CaptureInboxReceipt {
  readonly envelopeId: string;
  readonly contentHash: string;
  readonly envelopeChecksum: string;
  readonly senderId: string;
  readonly senderSequence: number;
  readonly senderNonce: string;
  readonly capturedAt: string;
  readonly expiresAt: string;
  readonly receivedAt: string;
  readonly receivedVia: "external_message" | "manual_export";
  readonly envelopeJson: string;
  readonly duplicateSuggestions: readonly CaptureDuplicateSuggestionV1[];
}

export interface CaptureReviewMergeTarget {
  readonly jobId: string;
  readonly title: string;
  readonly companyName: string | null;
  readonly reasons: readonly string[];
}

export interface CaptureReviewQueueReceipt extends CaptureInboxReceipt {
  readonly reviewState: "pending" | "snoozed";
  readonly snoozedUntil: string | null;
  readonly reviewRowVersion: number;
  readonly preparation: CaptureReviewPreparationV1;
  readonly mergeTargets: readonly CaptureReviewMergeTarget[];
}

export interface ExtensionMessageTransport {
  send(extensionId: string, message: unknown): Promise<unknown>;
}

interface CaptureInboxRow extends QueryRow {
  readonly envelope_id: string;
  readonly content_hash: string;
  readonly envelope_checksum: string;
  readonly sender_id: string;
  readonly sender_sequence: number;
  readonly sender_nonce: string;
  readonly captured_at: string;
  readonly expires_at: string;
  readonly received_at: string;
  readonly received_via: "external_message" | "manual_export";
  readonly envelope_json: string;
}

interface CaptureReviewQueueRow extends CaptureInboxRow {
  readonly review_state: "pending" | "snoozed";
  readonly snoozed_until: string | null;
  readonly review_row_version: number;
}

interface CaptureDuplicateCandidateRow extends QueryRow {
  readonly job_id: string;
  readonly title: string;
  readonly company_name: string | null;
  readonly job_source_id: string | null;
  readonly source_kind: string | null;
  readonly external_id: string | null;
  readonly canonical_url: string | null;
  readonly source_content_hash: string | null;
  readonly snapshot_content_hash: string | null;
}

export type CaptureInboxDuplicateKind = "none" | "exact_retry" | "content_hash";

export interface SuppliedCaptureStoreResult {
  readonly envelopeId: string;
  readonly durableEnvelopeId: string;
  readonly duplicateKind: CaptureInboxDuplicateKind;
  readonly duplicateSuggestions: readonly CaptureDuplicateSuggestionV1[];
}

interface StoreItemResult {
  readonly duplicateKind: CaptureInboxDuplicateKind;
  readonly durableEnvelopeId: string;
  readonly duplicateSuggestions: readonly CaptureDuplicateSuggestionV1[];
}

export type PullAndStoreResult =
  | { readonly status: "empty"; readonly removedExpired: number }
  | {
      readonly status: "stored";
      readonly envelopeId: string;
      readonly durableEnvelopeId: string;
      readonly attempt: number;
      readonly duplicate: boolean;
      readonly duplicateKind: CaptureInboxDuplicateKind;
      readonly duplicateSuggestions: readonly CaptureDuplicateSuggestionV1[];
      readonly acknowledged: boolean;
      readonly remainingCount?: number;
    };

const EXTENSION_ID_PATTERN = /^[a-p]{32}$/u;

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function requestId(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assertExtensionId(extensionId: string): void {
  if (!EXTENSION_ID_PATTERN.test(extensionId)) {
    throw new ExtensionTransferError("extension_id_invalid", "Extension ID is invalid.");
  }
}

function rowMatchesItem(row: CaptureInboxRow, item: OutboxItemV1): boolean {
  return (
    row.envelope_id === item.envelope.id &&
    row.content_hash === item.envelope.contentHash &&
    row.envelope_checksum === item.envelopeChecksum &&
    row.sender_id === item.envelope.sender.id &&
    row.sender_sequence === item.envelope.sequence &&
    row.sender_nonce === item.envelope.nonce &&
    row.envelope_json === JSON.stringify(item.envelope)
  );
}

function rowReusesReplayIdentity(row: CaptureInboxRow, item: OutboxItemV1): boolean {
  return (
    row.envelope_id === item.envelope.id ||
    row.sender_nonce === item.envelope.nonce ||
    (row.sender_id === item.envelope.sender.id && row.sender_sequence === item.envelope.sequence)
  );
}

async function loadDuplicateCandidates(
  session: DatabaseSession,
): Promise<readonly CaptureDuplicateJobCandidateV1[]> {
  const rows = await session.query<CaptureDuplicateCandidateRow>(
    sqlStatement(
      `SELECT job.id AS job_id, job.title, company.canonical_name AS company_name,
              job_source.id AS job_source_id, job_source.connector_id AS source_kind,
              job_source.external_id, job_source.canonical_url,
              job_source.content_hash AS source_content_hash,
              source_snapshot.content_hash AS snapshot_content_hash
       FROM job
       LEFT JOIN company ON company.id = job.company_id
       LEFT JOIN job_source ON job_source.job_id = job.id
       LEFT JOIN source_snapshot ON source_snapshot.job_source_id = job_source.id
       ORDER BY job.id, job_source.id, source_snapshot.id`,
    ),
  );
  const jobs = new Map<
    string,
    {
      title: string;
      companyName: string | null;
      sources: Map<
        string,
        {
          sourceKind: string | null;
          externalId: string | null;
          canonicalUrl: string | null;
          contentHashes: Set<string>;
        }
      >;
    }
  >();
  for (const row of rows) {
    let job = jobs.get(row.job_id);
    if (job === undefined) {
      job = {
        title: row.title,
        companyName: row.company_name,
        sources: new Map(),
      };
      jobs.set(row.job_id, job);
    }
    if (row.job_source_id === null) continue;
    let source = job.sources.get(row.job_source_id);
    if (source === undefined) {
      source = {
        sourceKind: row.source_kind,
        externalId: row.external_id,
        canonicalUrl: row.canonical_url,
        contentHashes: new Set(),
      };
      job.sources.set(row.job_source_id, source);
    }
    if (row.source_content_hash !== null) source.contentHashes.add(row.source_content_hash);
    if (row.snapshot_content_hash !== null) source.contentHashes.add(row.snapshot_content_hash);
  }
  return [...jobs.entries()].map(([jobId, job]) => ({
    jobId,
    title: job.title,
    companyName: job.companyName,
    sources: [...job.sources.values()].map((source) => ({
      sourceKind: source.sourceKind,
      externalId: source.externalId,
      canonicalUrl: source.canonicalUrl,
      contentHashes: [...source.contentHashes],
    })),
  }));
}

async function duplicateSuggestions(
  session: DatabaseSession,
  envelope: OutboxItemV1["envelope"],
): Promise<readonly CaptureDuplicateSuggestionV1[]> {
  try {
    return findCaptureDuplicateSuggestionsV1(envelope, await loadDuplicateCandidates(session));
  } catch {
    throw new ExtensionTransferError(
      "duplicate_analysis_invalid",
      "Durable capture and saved-job identity data failed duplicate analysis.",
    );
  }
}

function storedDuplicateSuggestions(
  envelopeJson: string,
  candidates: readonly CaptureDuplicateJobCandidateV1[],
): readonly CaptureDuplicateSuggestionV1[] {
  try {
    return findCaptureDuplicateSuggestionsV1(JSON.parse(envelopeJson) as unknown, candidates);
  } catch {
    throw new ExtensionTransferError(
      "duplicate_analysis_invalid",
      "Durable capture and saved-job identity data failed duplicate analysis.",
    );
  }
}

async function verifiedEnvelope(envelopeJson: string) {
  const result = await parseVerifiedCaptureEnvelopeJsonV1(envelopeJson);
  if (!result.success) {
    throw new ExtensionTransferError(result.code, result.issue);
  }
  return result.envelope;
}

async function loadReceipt(database: DatabasePort, envelopeId: string): Promise<CaptureInboxRow> {
  const rows = await database.query<CaptureInboxRow>(
    sqlStatement(
      `SELECT envelope_id, content_hash, envelope_checksum, sender_id, sender_sequence,
              sender_nonce, captured_at, expires_at, received_at, received_via, envelope_json
       FROM capture_inbox WHERE envelope_id = ?`,
      [entityId("capture-envelope", envelopeId)],
    ),
  );
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new ExtensionTransferError("review_not_found", "Capture review item was not found.");
  }
  return row;
}

async function storeItem(
  session: DatabaseSession,
  item: OutboxItemV1,
  receivedAt: string,
  receivedVia: "external_message" | "manual_export",
): Promise<StoreItemResult> {
  const collisions = await session.query<CaptureInboxRow>(
    sqlStatement(
      `SELECT envelope_id, content_hash, envelope_checksum, sender_id, sender_sequence,
              sender_nonce, captured_at, expires_at, received_at, received_via, envelope_json
       FROM capture_inbox
       WHERE envelope_id = ? OR content_hash = ? OR sender_nonce = ?
          OR (sender_id = ? AND sender_sequence = ?)
       ORDER BY envelope_id`,
      [
        item.envelope.id,
        item.envelope.contentHash,
        item.envelope.nonce,
        item.envelope.sender.id,
        item.envelope.sequence,
      ],
    ),
  );
  if (collisions.length > 0) {
    const exactRetry = collisions.find((row) => rowMatchesItem(row, item));
    if (
      collisions.some((row) => rowReusesReplayIdentity(row, item) && !rowMatchesItem(row, item))
    ) {
      throw new ExtensionTransferError(
        "replay_conflict",
        "Capture replay metadata conflicts with a durable inbox receipt.",
      );
    }
    if (exactRetry !== undefined) {
      return Object.freeze({
        duplicateKind: "exact_retry",
        durableEnvelopeId: exactRetry.envelope_id,
        duplicateSuggestions: await duplicateSuggestions(session, item.envelope),
      });
    }
    const sameContent = collisions.find((row) => row.content_hash === item.envelope.contentHash);
    if (sameContent !== undefined) {
      return Object.freeze({
        duplicateKind: "content_hash",
        durableEnvelopeId: sameContent.envelope_id,
        duplicateSuggestions: await duplicateSuggestions(session, item.envelope),
      });
    }
    throw new ExtensionTransferError(
      "replay_conflict",
      "Capture replay metadata conflicts with a durable inbox receipt.",
    );
  }
  await session.execute(
    sqlStatement(
      `INSERT INTO capture_inbox(
         envelope_id, content_hash, envelope_checksum, sender_id, sender_sequence,
         sender_nonce, captured_at, expires_at, received_at, received_via, envelope_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.envelope.id,
        item.envelope.contentHash,
        item.envelopeChecksum,
        item.envelope.sender.id,
        item.envelope.sequence,
        item.envelope.nonce,
        item.envelope.capturedAt,
        item.envelope.expiresAt,
        receivedAt,
        receivedVia,
        JSON.stringify(item.envelope),
      ],
    ),
  );
  return Object.freeze({
    duplicateKind: "none",
    durableEnvelopeId: item.envelope.id,
    duplicateSuggestions: await duplicateSuggestions(session, item.envelope),
  });
}

interface SenderSequenceRow extends QueryRow {
  readonly maximum_sequence: number | null;
}

function itemFromOffer(offer: TransferOfferV1, receivedAt: string): OutboxItemV1 {
  return {
    specVersion: 1,
    envelope: offer.envelope,
    envelopeChecksum: offer.envelopeChecksum,
    envelopeBytes: offer.envelopeBytes,
    queuedAt: receivedAt,
    expiresAt: offer.envelope.expiresAt,
    attemptCount: offer.attempt,
    status: "queued",
  };
}

export function createChromeExtensionTransport(): ExtensionMessageTransport {
  return {
    send: async (extensionId, message) => {
      const chromeApi = (
        globalThis as unknown as {
          chrome?: {
            runtime?: {
              lastError?: { readonly message?: string };
              sendMessage(
                targetExtensionId: string,
                payload: unknown,
                callback: (response: unknown) => void,
              ): void;
            };
          };
        }
      ).chrome;
      if (chromeApi?.runtime === undefined) {
        throw new ExtensionTransferError(
          "extension_api_unavailable",
          "Chromium extension messaging is unavailable in this browser.",
        );
      }
      return new Promise<unknown>((resolve, reject) => {
        try {
          chromeApi.runtime?.sendMessage(extensionId, message, (response) => {
            if (chromeApi.runtime?.lastError !== undefined) {
              reject(
                new ExtensionTransferError(
                  "extension_unreachable",
                  "Coredrill Capture is unavailable or does not trust this app origin.",
                ),
              );
              return;
            }
            resolve(response);
          });
        } catch {
          reject(
            new ExtensionTransferError(
              "extension_unreachable",
              "Coredrill Capture is unavailable or does not trust this app origin.",
            ),
          );
        }
      });
    },
  };
}

export function createExtensionInbox(
  database: () => Promise<DatabasePort>,
  transport: ExtensionMessageTransport = createChromeExtensionTransport(),
) {
  return Object.freeze({
    ingestSupplied: async (
      draft: SuppliedCaptureDraftV1,
      now = new Date(),
    ): Promise<SuppliedCaptureStoreResult> => {
      const receivedAt = now.toISOString();
      const client = await database();
      return client.transaction(async (transaction) => {
        const senderId = "coredrill.web.local-capture";
        const rows = await transaction.query<SenderSequenceRow>(
          sqlStatement(
            `SELECT MAX(sender_sequence) AS maximum_sequence
             FROM capture_inbox
             WHERE sender_id = ?`,
            [senderId],
          ),
        );
        const maximumSequence = rows[0]?.maximum_sequence ?? 0;
        const built = await buildSuppliedCaptureEnvelopeV1(draft, {
          senderId,
          sequence: maximumSequence + 1,
          now,
        });
        if (!built.success) {
          throw new ExtensionTransferError(built.code, built.issue);
        }
        const queued = await queueCaptureEnvelope(createEmptyOutboxState(), built.envelope, now);
        if (!queued.success) {
          throw new ExtensionTransferError(queued.code, queued.issue);
        }
        const stored = await storeItem(transaction, queued.item, receivedAt, "manual_export");
        return Object.freeze({
          envelopeId: built.envelope.id,
          durableEnvelopeId: stored.durableEnvelopeId,
          duplicateKind: stored.duplicateKind,
          duplicateSuggestions: stored.duplicateSuggestions,
        });
      });
    },

    pullAndStore: async (
      extensionId: string,
      options: { readonly acknowledge?: boolean; readonly now?: Date } = {},
    ): Promise<PullAndStoreResult> => {
      assertExtensionId(extensionId);
      const now = options.now ?? new Date();
      const pullRequest: TransferPullRequestV1 = {
        specVersion: 1,
        type: "capture.transfer.pull.v1",
        requestId: requestId(),
      };
      const input = await transport.send(extensionId, pullRequest);
      const response = await safeParseTransferResponse(input, {
        expectedRequestId: pullRequest.requestId,
        expectedExtensionId: extensionId,
        now,
      });
      if (response === undefined) {
        throw new ExtensionTransferError(
          "response_invalid",
          "The extension returned an invalid transfer response.",
        );
      }
      if (response.type === "capture.transfer.error.v1") {
        throw new ExtensionTransferError(response.code, response.message);
      }
      if (response.type === "capture.transfer.empty.v1") {
        return { status: "empty", removedExpired: response.removedExpired };
      }
      if (response.type !== "capture.transfer.offer.v1") {
        throw new ExtensionTransferError(
          "response_invalid",
          "The extension returned an unexpected transfer response.",
        );
      }

      const receivedAt = now.toISOString();
      const client = await database();
      const stored = await client.transaction((transaction) =>
        storeItem(transaction, itemFromOffer(response, receivedAt), receivedAt, "external_message"),
      );
      if (options.acknowledge === false) {
        return {
          status: "stored",
          envelopeId: response.envelope.id,
          durableEnvelopeId: stored.durableEnvelopeId,
          attempt: response.attempt,
          duplicate: stored.duplicateKind !== "none",
          duplicateKind: stored.duplicateKind,
          duplicateSuggestions: stored.duplicateSuggestions,
          acknowledged: false,
        };
      }

      const acknowledgement = createTransferAcknowledgement(response);
      const acknowledgementInput = await transport.send(extensionId, acknowledgement);
      const acknowledgementResponse = await safeParseTransferResponse(acknowledgementInput, {
        expectedRequestId: response.requestId,
        expectedExtensionId: extensionId,
        now,
      });
      if (acknowledgementResponse?.type === "capture.transfer.error.v1") {
        throw new ExtensionTransferError(
          acknowledgementResponse.code,
          acknowledgementResponse.message,
        );
      }
      if (
        acknowledgementResponse?.type !== "capture.transfer.acknowledged.v1" ||
        acknowledgementResponse.envelopeId !== response.envelope.id
      ) {
        throw new ExtensionTransferError(
          "acknowledgement_invalid",
          "The extension did not confirm the exact durably stored capture.",
        );
      }
      return {
        status: "stored",
        envelopeId: response.envelope.id,
        durableEnvelopeId: stored.durableEnvelopeId,
        attempt: response.attempt,
        duplicate: stored.duplicateKind !== "none",
        duplicateKind: stored.duplicateKind,
        duplicateSuggestions: stored.duplicateSuggestions,
        acknowledged: true,
        remainingCount: acknowledgementResponse.remainingCount,
      };
    },

    importOutboxJson: async (json: string, now = new Date()) => {
      const parsed = await parseOutboxExportJson(json, now);
      if (!parsed.success) throw new ExtensionTransferError(parsed.code, parsed.issue);
      const receivedAt = now.toISOString();
      const client = await database();
      return client.transaction(async (transaction) => {
        let imported = 0;
        let duplicates = 0;
        for (const item of parsed.data.items) {
          const stored = await storeItem(transaction, item, receivedAt, "manual_export");
          if (stored.duplicateKind === "none") imported += 1;
          else duplicates += 1;
        }
        return Object.freeze({ imported, duplicates, total: parsed.data.items.length });
      });
    },

    listReceipts: async (): Promise<readonly CaptureInboxReceipt[]> => {
      const client = await database();
      const rows = await client.query<CaptureInboxRow>(
        sqlStatement(
          `SELECT envelope_id, content_hash, envelope_checksum, sender_id, sender_sequence,
                  sender_nonce, captured_at, expires_at, received_at, received_via, envelope_json
           FROM capture_inbox ORDER BY envelope_id`,
        ),
      );
      const candidates = await loadDuplicateCandidates(client);
      return rows.map((row) =>
        Object.freeze({
          envelopeId: row.envelope_id,
          contentHash: row.content_hash,
          envelopeChecksum: row.envelope_checksum,
          senderId: row.sender_id,
          senderSequence: row.sender_sequence,
          senderNonce: row.sender_nonce,
          capturedAt: row.captured_at,
          expiresAt: row.expires_at,
          receivedAt: row.received_at,
          receivedVia: row.received_via,
          envelopeJson: row.envelope_json,
          duplicateSuggestions: storedDuplicateSuggestions(row.envelope_json, candidates),
        }),
      );
    },

    listReviewItems: async (): Promise<readonly CaptureReviewQueueReceipt[]> => {
      const client = await database();
      const { rows, candidates } = await client.transaction(async (transaction) => ({
        rows: await transaction.query<CaptureReviewQueueRow>(
          sqlStatement(
            `SELECT receipt.envelope_id, receipt.content_hash, receipt.envelope_checksum,
                    receipt.sender_id, receipt.sender_sequence, receipt.sender_nonce,
                    receipt.captured_at, receipt.expires_at, receipt.received_at,
                    receipt.received_via, receipt.envelope_json,
                    review.state AS review_state, review.snoozed_until,
                    review.row_version AS review_row_version
             FROM capture_review_item AS review
             INNER JOIN capture_inbox AS receipt ON receipt.envelope_id = review.envelope_id
             WHERE review.state IN ('pending', 'snoozed')
             ORDER BY receipt.envelope_id`,
          ),
        ),
        candidates: await loadDuplicateCandidates(transaction),
      }));
      const candidateByJob = new Map(candidates.map((candidate) => [candidate.jobId, candidate]));
      const queue: CaptureReviewQueueReceipt[] = [];
      for (const row of rows) {
        const envelope = await verifiedEnvelope(row.envelope_json);
        const suggestions = findCaptureDuplicateSuggestionsV1(envelope, candidates);
        const preparation = prepareCaptureReviewPromotionV1(envelope, () =>
          generateEntityId("field-conflict"),
        );
        queue.push(
          Object.freeze({
            envelopeId: row.envelope_id,
            contentHash: row.content_hash,
            envelopeChecksum: row.envelope_checksum,
            senderId: row.sender_id,
            senderSequence: row.sender_sequence,
            senderNonce: row.sender_nonce,
            capturedAt: row.captured_at,
            expiresAt: row.expires_at,
            receivedAt: row.received_at,
            receivedVia: row.received_via,
            envelopeJson: row.envelope_json,
            duplicateSuggestions: suggestions,
            reviewState: row.review_state,
            snoozedUntil: row.snoozed_until,
            reviewRowVersion: row.review_row_version,
            preparation,
            mergeTargets: Object.freeze(
              suggestions.flatMap((suggestion) => {
                const candidate = candidateByJob.get(suggestion.jobId);
                return candidate === undefined
                  ? []
                  : [
                      Object.freeze({
                        jobId: suggestion.jobId,
                        title: candidate.title,
                        companyName: candidate.companyName,
                        reasons: Object.freeze([...suggestion.reasons]),
                      }),
                    ];
              }),
            ),
          }),
        );
      }
      return Object.freeze(queue);
    },

    getReviewItem: async (envelopeId: string): Promise<CaptureReviewItemRecord | null> => {
      const client = await database();
      const expected = entityId("capture-envelope", envelopeId);
      return (
        (await createCaptureReviewRepository(client).list()).find(
          (item) => item.envelopeId === expected,
        ) ?? null
      );
    },

    snoozeReview: async (
      input: { readonly envelopeId: string; readonly expectedRowVersion: number },
      now = new Date(),
    ): Promise<CaptureReviewItemRecord> => {
      const client = await database();
      return createCaptureReviewRepository(client).snooze({
        envelopeId: entityId("capture-envelope", input.envelopeId),
        expectedRowVersion: input.expectedRowVersion,
        updatedAt: now.toISOString(),
        snoozedUntil: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
      });
    },

    wakeReview: async (
      input: { readonly envelopeId: string; readonly expectedRowVersion: number },
      now = new Date(),
    ): Promise<CaptureReviewItemRecord> => {
      const client = await database();
      return createCaptureReviewRepository(client).wake({
        envelopeId: entityId("capture-envelope", input.envelopeId),
        expectedRowVersion: input.expectedRowVersion,
        updatedAt: now.toISOString(),
      });
    },

    discardReview: async (
      input: { readonly envelopeId: string; readonly expectedRowVersion: number },
      now = new Date(),
    ) => {
      const client = await database();
      return createCaptureReviewRepository(client).discard({
        envelopeId: entityId("capture-envelope", input.envelopeId),
        expectedRowVersion: input.expectedRowVersion,
        undoTokenId: generateEntityId("capture-review-discard-undo"),
        discardedAt: now.toISOString(),
      });
    },

    undoDiscardReview: async (undoTokenId: string, now = new Date()) => {
      const client = await database();
      return createCaptureReviewRepository(client).undoDiscard({
        undoTokenId: entityId("capture-review-discard-undo", undoTokenId),
        restoredAt: now.toISOString(),
      });
    },

    promoteReview: async (
      input: {
        readonly envelopeId: string;
        readonly expectedRowVersion: number;
        readonly acceptedCandidateIds: readonly string[];
        readonly resolution: CaptureReviewPromotionResolutionV1;
      },
      now = new Date(),
    ): Promise<CaptureReviewItemRecord> => {
      const client = await database();
      const row = await loadReceipt(client, input.envelopeId);
      const envelope = await verifiedEnvelope(row.envelope_json);
      const promotion = await materializeCaptureReviewPromotionV1(
        {
          specVersion: 1,
          envelope,
          expectedReviewRowVersion: input.expectedRowVersion,
          acceptedCandidateIds: input.acceptedCandidateIds,
          resolution: input.resolution,
        },
        {
          createId: (entity) => generateEntityId(entity),
          hashConfirmedValue: sha256Text,
          initiatedAt: now.toISOString(),
        },
      );
      return createCaptureReviewRepository(client).promote(promotion);
    },
  });
}

export type ExtensionInboxApi = ReturnType<typeof createExtensionInbox>;
