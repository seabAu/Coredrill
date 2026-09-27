import {
  OUTBOX_LIMITS,
  OUTBOX_SPEC_VERSION,
  safeParseOutboxState,
  type OutboxStateV1,
} from "./outbox.js";
import {
  acknowledgeOutboxTransfer,
  prepareNextOutboxTransfer,
  type AcknowledgeTransferResult,
  type PrepareTransferResult,
  type TransferAckRequestV1,
  type TransferPullRequestV1,
} from "./transfer.js";

export const OUTBOX_RETRY_SPEC_VERSION = 1 as const;
export const OUTBOX_RETRY_ITEM_SPEC_VERSION = 1 as const;
export const OUTBOX_RETRY_POLICY = Object.freeze({
  initialDelayMilliseconds: 5_000,
  maximumDelayMilliseconds: 5 * 60_000,
  maximumAttempts: 10,
  expiryWarningMilliseconds: 24 * 60 * 60_000,
});

export type OutboxRetryErrorCode = "acknowledgement_pending" | "legacy_attempt_pending";

export interface OutboxRetryItemV1 {
  readonly specVersion: typeof OUTBOX_RETRY_ITEM_SPEC_VERSION;
  readonly envelopeId: string;
  readonly lastAttemptAt: string | null;
  readonly nextAttemptAt: string;
  readonly lastErrorCode: OutboxRetryErrorCode | null;
}

export interface OutboxRetryStateV1 {
  readonly specVersion: typeof OUTBOX_RETRY_SPEC_VERSION;
  readonly items: readonly OutboxRetryItemV1[];
}

export interface OutboxLifecycleSummaryV1 {
  readonly activeCount: number;
  readonly earliestExpiry: string | null;
  readonly expiringSoonCount: number;
  readonly nextRetryAt: string | null;
  readonly exhaustedCount: number;
}

export type OutboxRetryValidationResult =
  | { readonly success: true; readonly state: OutboxRetryStateV1 }
  | { readonly success: false; readonly code: "retry_state_invalid"; readonly issue: string };

export type PrepareScheduledTransferResult =
  | (Extract<PrepareTransferResult, { readonly success: true }> & {
      readonly retryState: OutboxRetryStateV1;
    })
  | {
      readonly success: false;
      readonly code: string;
      readonly issue: string;
    };

export type AcknowledgeScheduledTransferResult =
  | (Extract<AcknowledgeTransferResult, { readonly success: true }> & {
      readonly retryState: OutboxRetryStateV1;
    })
  | {
      readonly success: false;
      readonly code: string;
      readonly issue: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function validNow(now: Date): boolean {
  const milliseconds = now.getTime();
  return (
    Number.isSafeInteger(milliseconds) && milliseconds >= 0 && milliseconds <= 253_402_300_799_999
  );
}

function retryDelay(attempt: number): number {
  const exponent = Math.max(0, Math.min(attempt - 1, 30));
  return Math.min(
    OUTBOX_RETRY_POLICY.initialDelayMilliseconds * 2 ** exponent,
    OUTBOX_RETRY_POLICY.maximumDelayMilliseconds,
  );
}

function initialRetryItem(
  item: OutboxStateV1["items"][number],
  migrationInstant?: string,
): OutboxRetryItemV1 {
  const migratedAttempt = item.attemptCount > 0;
  const migratedNextAttemptAt =
    migrationInstant === undefined
      ? item.queuedAt
      : new Date(
          Math.min(
            Math.max(Date.parse(migrationInstant), Date.parse(item.queuedAt)),
            Date.parse(item.expiresAt),
          ),
        ).toISOString();
  return {
    specVersion: OUTBOX_RETRY_ITEM_SPEC_VERSION,
    envelopeId: item.envelope.id,
    lastAttemptAt: null,
    nextAttemptAt: migratedAttempt ? migratedNextAttemptAt : item.queuedAt,
    lastErrorCode: migratedAttempt ? "legacy_attempt_pending" : null,
  };
}

export function createOutboxRetryState(
  outbox: OutboxStateV1,
  migrationInstant?: string,
): OutboxRetryStateV1 {
  return {
    specVersion: OUTBOX_RETRY_SPEC_VERSION,
    items: outbox.items.map((item) => initialRetryItem(item, migrationInstant)),
  };
}

export async function safeParseOutboxRetryState(
  input: unknown,
  outboxInput: unknown,
): Promise<OutboxRetryValidationResult> {
  const parsedOutbox = await safeParseOutboxState(outboxInput);
  if (!parsedOutbox.success) {
    return {
      success: false,
      code: "retry_state_invalid",
      issue: "Retry metadata cannot be validated against an invalid outbox.",
    };
  }
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ["specVersion", "items"]) ||
    input["specVersion"] !== OUTBOX_RETRY_SPEC_VERSION ||
    !Array.isArray(input["items"]) ||
    input["items"].length > OUTBOX_LIMITS.maxItems ||
    input["items"].length !== parsedOutbox.state.items.length
  ) {
    return { success: false, code: "retry_state_invalid", issue: "Retry state shape is invalid." };
  }

  const outboxById = new Map(parsedOutbox.state.items.map((item) => [item.envelope.id, item]));
  const seen = new Set<string>();
  const items: OutboxRetryItemV1[] = [];
  for (const value of input["items"]) {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, [
        "specVersion",
        "envelopeId",
        "lastAttemptAt",
        "nextAttemptAt",
        "lastErrorCode",
      ]) ||
      value["specVersion"] !== OUTBOX_RETRY_ITEM_SPEC_VERSION ||
      typeof value["envelopeId"] !== "string" ||
      seen.has(value["envelopeId"]) ||
      (value["lastAttemptAt"] !== null && !isInstant(value["lastAttemptAt"])) ||
      !isInstant(value["nextAttemptAt"]) ||
      (value["lastErrorCode"] !== null &&
        value["lastErrorCode"] !== "acknowledgement_pending" &&
        value["lastErrorCode"] !== "legacy_attempt_pending")
    ) {
      return {
        success: false,
        code: "retry_state_invalid",
        issue: "Retry item shape is invalid.",
      };
    }
    const outboxItem = outboxById.get(value["envelopeId"]);
    if (
      outboxItem === undefined ||
      Date.parse(value["nextAttemptAt"]) < Date.parse(outboxItem.queuedAt) ||
      Date.parse(value["nextAttemptAt"]) > Date.parse(outboxItem.expiresAt) ||
      (value["lastAttemptAt"] !== null &&
        (Date.parse(value["lastAttemptAt"]) < Date.parse(outboxItem.queuedAt) ||
          Date.parse(value["lastAttemptAt"]) > Date.parse(value["nextAttemptAt"]))) ||
      (outboxItem.attemptCount === 0 &&
        (value["lastAttemptAt"] !== null || value["lastErrorCode"] !== null)) ||
      (outboxItem.attemptCount > 0 && value["lastErrorCode"] === null) ||
      (value["lastErrorCode"] === "acknowledgement_pending" && value["lastAttemptAt"] === null) ||
      (value["lastErrorCode"] === "legacy_attempt_pending" && value["lastAttemptAt"] !== null)
    ) {
      return {
        success: false,
        code: "retry_state_invalid",
        issue: "Retry metadata does not match its queued capture.",
      };
    }
    seen.add(value["envelopeId"]);
    items.push({
      specVersion: OUTBOX_RETRY_ITEM_SPEC_VERSION,
      envelopeId: value["envelopeId"],
      lastAttemptAt: value["lastAttemptAt"],
      nextAttemptAt: value["nextAttemptAt"],
      lastErrorCode: value["lastErrorCode"],
    });
  }
  if (seen.size !== outboxById.size) {
    return {
      success: false,
      code: "retry_state_invalid",
      issue: "Retry state is missing queued captures.",
    };
  }
  return { success: true, state: { specVersion: OUTBOX_RETRY_SPEC_VERSION, items } };
}

export async function synchronizeOutboxRetryState(
  previousOutboxInput: unknown,
  previousRetryInput: unknown,
  nextOutboxInput: unknown,
  now = new Date(),
): Promise<OutboxRetryValidationResult> {
  if (!validNow(now)) {
    return { success: false, code: "retry_state_invalid", issue: "Retry timestamp is invalid." };
  }
  const previousOutbox = await safeParseOutboxState(previousOutboxInput);
  const nextOutbox = await safeParseOutboxState(nextOutboxInput);
  if (!previousOutbox.success || !nextOutbox.success) {
    return { success: false, code: "retry_state_invalid", issue: "Outbox state is invalid." };
  }
  const previousRetry = await safeParseOutboxRetryState(previousRetryInput, previousOutbox.state);
  if (!previousRetry.success) return previousRetry;
  const previousById = new Map(previousRetry.state.items.map((item) => [item.envelopeId, item]));
  const items = nextOutbox.state.items.map(
    (item) => previousById.get(item.envelope.id) ?? initialRetryItem(item, now.toISOString()),
  );
  return safeParseOutboxRetryState(
    { specVersion: OUTBOX_RETRY_SPEC_VERSION, items },
    nextOutbox.state,
  );
}

export async function pruneExpiredOutboxLifecycle(
  outboxInput: unknown,
  retryInput: unknown,
  now = new Date(),
): Promise<
  | {
      readonly success: true;
      readonly state: OutboxStateV1;
      readonly retryState: OutboxRetryStateV1;
      readonly removedExpired: number;
    }
  | { readonly success: false; readonly code: string; readonly issue: string }
> {
  if (!validNow(now)) {
    return { success: false, code: "retry_state_invalid", issue: "Retry timestamp is invalid." };
  }
  const parsedOutbox = await safeParseOutboxState(outboxInput);
  if (!parsedOutbox.success) return parsedOutbox;
  const parsedRetry = await safeParseOutboxRetryState(retryInput, parsedOutbox.state);
  if (!parsedRetry.success) return parsedRetry;
  const items = parsedOutbox.state.items.filter(
    (item) => Date.parse(item.expiresAt) > now.getTime(),
  );
  const state: OutboxStateV1 = { specVersion: OUTBOX_SPEC_VERSION, items };
  const synchronized = await synchronizeOutboxRetryState(
    parsedOutbox.state,
    parsedRetry.state,
    state,
    now,
  );
  if (!synchronized.success) return synchronized;
  return {
    success: true,
    state,
    retryState: synchronized.state,
    removedExpired: parsedOutbox.state.items.length - items.length,
  };
}

export async function describeOutboxLifecycle(
  outboxInput: unknown,
  retryInput: unknown,
  now = new Date(),
): Promise<
  | { readonly success: true; readonly summary: OutboxLifecycleSummaryV1 }
  | { readonly success: false; readonly code: string; readonly issue: string }
> {
  const pruned = await pruneExpiredOutboxLifecycle(outboxInput, retryInput, now);
  if (!pruned.success) return pruned;
  const retryById = new Map(pruned.retryState.items.map((item) => [item.envelopeId, item]));
  const earliestExpiry = pruned.state.items.map((item) => item.expiresAt).sort()[0] ?? null;
  const retryInstants = pruned.state.items
    .filter(
      (item) => item.attemptCount > 0 && item.attemptCount < OUTBOX_RETRY_POLICY.maximumAttempts,
    )
    .map((item) => retryById.get(item.envelope.id)?.nextAttemptAt)
    .filter((value): value is string => value !== undefined)
    .sort();
  return {
    success: true,
    summary: {
      activeCount: pruned.state.items.length,
      earliestExpiry,
      expiringSoonCount: pruned.state.items.filter(
        (item) =>
          Date.parse(item.expiresAt) - now.getTime() <=
          OUTBOX_RETRY_POLICY.expiryWarningMilliseconds,
      ).length,
      nextRetryAt: retryInstants[0] ?? null,
      exhaustedCount: pruned.state.items.filter(
        (item) => item.attemptCount >= OUTBOX_RETRY_POLICY.maximumAttempts,
      ).length,
    },
  };
}

export async function prepareNextScheduledOutboxTransfer(
  outboxInput: unknown,
  retryInput: unknown,
  request: TransferPullRequestV1,
  now = new Date(),
): Promise<PrepareScheduledTransferResult> {
  const pruned = await pruneExpiredOutboxLifecycle(outboxInput, retryInput, now);
  if (!pruned.success) return pruned;
  const retryById = new Map(pruned.retryState.items.map((item) => [item.envelopeId, item]));
  const eligibleIndex = pruned.state.items.findIndex((item) => {
    const retry = retryById.get(item.envelope.id);
    return (
      retry !== undefined &&
      item.attemptCount < OUTBOX_RETRY_POLICY.maximumAttempts &&
      Date.parse(retry.nextAttemptAt) <= now.getTime()
    );
  });
  if (pruned.state.items.length > 0 && eligibleIndex < 0) {
    const hasPendingRetry = pruned.state.items.some(
      (item) => item.attemptCount < OUTBOX_RETRY_POLICY.maximumAttempts,
    );
    return hasPendingRetry
      ? {
          success: false,
          code: "retry_not_due",
          issue: "The queued captures are waiting for their bounded retry window.",
        }
      : {
          success: false,
          code: "retry_exhausted",
          issue: "Automatic transfer attempts are exhausted. Export remains available.",
        };
  }

  const eligible = eligibleIndex < 0 ? undefined : pruned.state.items[eligibleIndex];
  const transferState: OutboxStateV1 =
    eligible === undefined || eligibleIndex === 0
      ? pruned.state
      : {
          specVersion: OUTBOX_SPEC_VERSION,
          items: [
            eligible,
            ...pruned.state.items.slice(0, eligibleIndex),
            ...pruned.state.items.slice(eligibleIndex + 1),
          ],
        };
  const prepared = await prepareNextOutboxTransfer(transferState, request, now);
  if (!prepared.success) return prepared;
  if (prepared.response.type === "capture.transfer.empty.v1") {
    return {
      ...prepared,
      removedExpired: pruned.removedExpired,
      response: { ...prepared.response, removedExpired: pruned.removedExpired },
      retryState: pruned.retryState,
    };
  }
  const attempted = prepared.state.items[0];
  if (attempted === undefined) {
    return { success: false, code: "retry_state_invalid", issue: "Offered capture is missing." };
  }
  const preparedById = new Map(prepared.state.items.map((item) => [item.envelope.id, item]));
  const state: OutboxStateV1 = {
    specVersion: OUTBOX_SPEC_VERSION,
    items: pruned.state.items.map((item) => preparedById.get(item.envelope.id) ?? item),
  };
  const attemptedAt = now.toISOString();
  const nextAttemptAt = new Date(
    Math.min(now.getTime() + retryDelay(attempted.attemptCount), Date.parse(attempted.expiresAt)),
  ).toISOString();
  const items = pruned.retryState.items.map((item) =>
    item.envelopeId === attempted.envelope.id
      ? {
          specVersion: OUTBOX_RETRY_ITEM_SPEC_VERSION,
          envelopeId: item.envelopeId,
          lastAttemptAt: attemptedAt,
          nextAttemptAt,
          lastErrorCode: "acknowledgement_pending" as const,
        }
      : item,
  );
  const retryState = await safeParseOutboxRetryState(
    { specVersion: OUTBOX_RETRY_SPEC_VERSION, items },
    state,
  );
  if (!retryState.success) return retryState;
  return { ...prepared, state, retryState: retryState.state };
}

export async function acknowledgeScheduledOutboxTransfer(
  outboxInput: unknown,
  retryInput: unknown,
  request: TransferAckRequestV1,
  now = new Date(),
): Promise<AcknowledgeScheduledTransferResult> {
  const parsedOutbox = await safeParseOutboxState(outboxInput);
  if (!parsedOutbox.success) return parsedOutbox;
  const parsedRetry = await safeParseOutboxRetryState(retryInput, parsedOutbox.state);
  if (!parsedRetry.success) return parsedRetry;
  const acknowledged = await acknowledgeOutboxTransfer(parsedOutbox.state, request, now);
  if (!acknowledged.success) return acknowledged;
  const retryState = await synchronizeOutboxRetryState(
    parsedOutbox.state,
    parsedRetry.state,
    acknowledged.state,
    now,
  );
  if (!retryState.success) return retryState;
  return { ...acknowledged, retryState: retryState.state };
}
