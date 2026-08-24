/** Bounded outbox, pairing, transfer, acknowledgement, and compatibility protocol. */
/** Integrity-checked, storage-neutral extension outbox contracts. */
export {
  OUTBOX_ITEM_SPEC_VERSION,
  OUTBOX_LIMITS,
  OUTBOX_SPEC_VERSION,
  createEmptyOutboxState,
  queueCaptureEnvelope,
  safeParseOutboxState,
  type OutboxItemV1,
  type OutboxStateV1,
  type OutboxValidationResult,
  type QueueOutboxResult,
} from "./outbox.js";
