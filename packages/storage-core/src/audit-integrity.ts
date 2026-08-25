import { instant, type Instant } from "@coredrill/domain";

export interface AuditTimestamps {
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

export const auditTimestamps = (
  createdAtInput: Instant,
  updatedAtInput: Instant,
  archivedAtInput: Instant | null = null,
): AuditTimestamps => {
  const createdAt = instant(createdAtInput);
  const updatedAt = instant(updatedAtInput);
  const archivedAt = archivedAtInput === null ? null : instant(archivedAtInput);
  if (updatedAt < createdAt) {
    throw new TypeError("The updated timestamp cannot precede the created timestamp.");
  }
  if (archivedAt !== null && archivedAt < createdAt) {
    throw new TypeError("The archive timestamp cannot precede the created timestamp.");
  }
  return Object.freeze({ archivedAt, createdAt, updatedAt });
};

export const advancingAuditTimestamp = (
  previousInput: Instant,
  nextInput: Instant,
  label: string,
): Instant => {
  const previous = instant(previousInput);
  const next = instant(nextInput);
  if (next < previous) throw new TypeError(`${label} cannot move backward.`);
  return next;
};
