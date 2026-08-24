export const DEFERRED_SYNC_AVAILABILITY = Object.freeze({
  state: "deferred",
  reason: "not-available-in-baseline",
  networkRequired: false,
} as const);

export type SyncAvailability = typeof DEFERRED_SYNC_AVAILABILITY;

/** Capability-only placeholder. Push/pull APIs require the later accepted E2EE/conflict ADR. */
export interface SyncPort {
  availability(): Promise<SyncAvailability>;
}
