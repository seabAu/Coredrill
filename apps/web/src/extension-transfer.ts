import {
  createTransferAcknowledgement,
  parseOutboxExportJson,
  safeParseTransferResponse,
  type OutboxItemV1,
  type TransferOfferV1,
  type TransferPullRequestV1,
} from "@coredrill/extension-bridge";
import {
  sqlStatement,
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

export type PullAndStoreResult =
  | { readonly status: "empty"; readonly removedExpired: number }
  | {
      readonly status: "stored";
      readonly envelopeId: string;
      readonly attempt: number;
      readonly duplicate: boolean;
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

async function storeItem(
  session: DatabaseSession,
  item: OutboxItemV1,
  receivedAt: string,
  receivedVia: "external_message" | "manual_export",
): Promise<boolean> {
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
    const [onlyCollision] = collisions;
    if (
      collisions.length === 1 &&
      onlyCollision !== undefined &&
      rowMatchesItem(onlyCollision, item)
    ) {
      return true;
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
  return false;
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
      const duplicate = await client.transaction((transaction) =>
        storeItem(transaction, itemFromOffer(response, receivedAt), receivedAt, "external_message"),
      );
      if (options.acknowledge === false) {
        return {
          status: "stored",
          envelopeId: response.envelope.id,
          attempt: response.attempt,
          duplicate,
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
        attempt: response.attempt,
        duplicate,
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
          if (await storeItem(transaction, item, receivedAt, "manual_export")) duplicates += 1;
          else imported += 1;
        }
        return Object.freeze({ imported, duplicates, total: parsed.data.items.length });
      });
    },

    listReceipts: async (): Promise<readonly CaptureInboxReceipt[]> => {
      const rows = await (
        await database()
      ).query<CaptureInboxRow>(
        sqlStatement(
          `SELECT envelope_id, content_hash, envelope_checksum, sender_id, sender_sequence,
                  sender_nonce, captured_at, expires_at, received_at, received_via, envelope_json
           FROM capture_inbox ORDER BY envelope_id`,
        ),
      );
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
        }),
      );
    },
  });
}

export type ExtensionInboxApi = ReturnType<typeof createExtensionInbox>;
