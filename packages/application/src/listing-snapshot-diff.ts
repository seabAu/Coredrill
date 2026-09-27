export const LISTING_SNAPSHOT_REQUIREMENT_KINDS_V1 = [
  "required",
  "preferred",
  "responsibility",
  "education",
  "certification",
  "work_authorization",
  "other",
] as const;

export type ListingSnapshotRequirementKindV1 =
  (typeof LISTING_SNAPSHOT_REQUIREMENT_KINDS_V1)[number];

export const LISTING_SNAPSHOT_COMPENSATION_INTERVALS_V1 = [
  "hour",
  "day",
  "week",
  "month",
  "year",
  "project",
  "unknown",
] as const;

export type ListingSnapshotCompensationIntervalV1 =
  (typeof LISTING_SNAPSHOT_COMPENSATION_INTERVALS_V1)[number];

export interface ListingSnapshotRequirementV1 {
  readonly key: string;
  readonly kind: ListingSnapshotRequirementKindV1;
  readonly text: string;
}

export interface ListingSnapshotCompensationV1 {
  readonly minMinor: number | null;
  readonly maxMinor: number | null;
  readonly currency: string;
  readonly interval: ListingSnapshotCompensationIntervalV1;
}

export interface ComparableListingSnapshotV1 {
  readonly id: string;
  readonly capturedAt: string;
  readonly contentHash: string;
  readonly requirements: readonly ListingSnapshotRequirementV1[];
  readonly compensation: ListingSnapshotCompensationV1 | null;
  readonly deadline: string | null;
  readonly locations: readonly string[];
}

export interface ListingSnapshotDiffInputV1 {
  readonly specVersion: 1;
  readonly baseline: ComparableListingSnapshotV1;
  readonly current: ComparableListingSnapshotV1;
}

export type ListingSnapshotValueChangeKindV1 = "unchanged" | "added" | "removed" | "changed";

export interface ListingSnapshotValueChangeV1<T> {
  readonly kind: ListingSnapshotValueChangeKindV1;
  readonly before: T | null;
  readonly after: T | null;
}

export interface ListingSnapshotRequirementChangeV1 {
  readonly key: string;
  readonly before: ListingSnapshotRequirementV1;
  readonly after: ListingSnapshotRequirementV1;
}

export interface ListingSnapshotDiffV1 {
  readonly specVersion: 1;
  readonly baselineSnapshotId: string;
  readonly currentSnapshotId: string;
  readonly baselineCapturedAt: string;
  readonly currentCapturedAt: string;
  readonly changed: boolean;
  readonly changeCount: number;
  readonly requirements: {
    readonly added: readonly ListingSnapshotRequirementV1[];
    readonly removed: readonly ListingSnapshotRequirementV1[];
    readonly changed: readonly ListingSnapshotRequirementChangeV1[];
  };
  readonly compensation: ListingSnapshotValueChangeV1<ListingSnapshotCompensationV1>;
  readonly deadline: ListingSnapshotValueChangeV1<string>;
  readonly locations: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
  };
  readonly content: {
    readonly kind: "unchanged" | "changed";
    readonly beforeHash: string;
    readonly afterHash: string;
  };
  readonly refreshPerformed: false;
  readonly trustedFieldMutationPerformed: false;
}

export class ListingSnapshotDiffError extends Error {
  public constructor() {
    super("Listing snapshot comparison rejected invalid input.");
    this.name = "ListingSnapshotDiffError";
  }
}

const INPUT_KEYS = ["specVersion", "baseline", "current"] as const;
const SNAPSHOT_KEYS = [
  "id",
  "capturedAt",
  "contentHash",
  "requirements",
  "compensation",
  "deadline",
  "locations",
] as const;
const REQUIREMENT_KEYS = ["key", "kind", "text"] as const;
const COMPENSATION_KEYS = ["minMinor", "maxMinor", "currency", "interval"] as const;
const ENTITY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;
const CURRENCY = /^[A-Z]{3}$/u;

function invalid(): never {
  throw new ListingSnapshotDiffError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isExactInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_ONLY.test(value)) return false;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().startsWith(value);
}

function boundedText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

function minorAmount(value: unknown): value is number | null {
  return (
    value === null ||
    (Number.isSafeInteger(value) &&
      (value as number) >= 0 &&
      (value as number) <= 9_000_000_000_000_000)
  );
}

function parseRequirement(input: unknown): ListingSnapshotRequirementV1 {
  if (!isRecord(input) || !hasExactKeys(input, REQUIREMENT_KEYS)) invalid();
  if (
    !boundedText(input["key"], 512) ||
    !LISTING_SNAPSHOT_REQUIREMENT_KINDS_V1.includes(
      input["kind"] as ListingSnapshotRequirementKindV1,
    ) ||
    !boundedText(input["text"], 8_192)
  ) {
    invalid();
  }
  return Object.freeze({
    key: input["key"],
    kind: input["kind"] as ListingSnapshotRequirementKindV1,
    text: input["text"],
  });
}

function parseCompensation(input: unknown): ListingSnapshotCompensationV1 | null {
  if (input === null) return null;
  if (!isRecord(input) || !hasExactKeys(input, COMPENSATION_KEYS)) invalid();
  if (
    !minorAmount(input["minMinor"]) ||
    !minorAmount(input["maxMinor"]) ||
    (input["minMinor"] === null && input["maxMinor"] === null) ||
    (typeof input["minMinor"] === "number" &&
      typeof input["maxMinor"] === "number" &&
      input["minMinor"] > input["maxMinor"]) ||
    typeof input["currency"] !== "string" ||
    !CURRENCY.test(input["currency"]) ||
    !LISTING_SNAPSHOT_COMPENSATION_INTERVALS_V1.includes(
      input["interval"] as ListingSnapshotCompensationIntervalV1,
    )
  ) {
    invalid();
  }
  return Object.freeze({
    minMinor: input["minMinor"],
    maxMinor: input["maxMinor"],
    currency: input["currency"],
    interval: input["interval"] as ListingSnapshotCompensationIntervalV1,
  });
}

function parseSnapshot(input: unknown): ComparableListingSnapshotV1 {
  if (!isRecord(input) || !hasExactKeys(input, SNAPSHOT_KEYS)) invalid();
  if (
    typeof input["id"] !== "string" ||
    !ENTITY_ID.test(input["id"]) ||
    !isExactInstant(input["capturedAt"]) ||
    typeof input["contentHash"] !== "string" ||
    !SHA256.test(input["contentHash"]) ||
    !Array.isArray(input["requirements"]) ||
    input["requirements"].length > 256 ||
    !Array.isArray(input["locations"]) ||
    input["locations"].length > 64 ||
    (input["deadline"] !== null && !isDateOnly(input["deadline"]))
  ) {
    invalid();
  }
  const requirements = input["requirements"].map(parseRequirement);
  const locations = input["locations"].map((location) => {
    if (!boundedText(location, 1_024)) invalid();
    return location;
  });
  if (
    new Set(requirements.map(({ key }) => key)).size !== requirements.length ||
    new Set(locations).size !== locations.length
  ) {
    invalid();
  }
  return Object.freeze({
    id: input["id"],
    capturedAt: input["capturedAt"],
    contentHash: input["contentHash"],
    requirements: Object.freeze(requirements),
    compensation: parseCompensation(input["compensation"]),
    deadline: input["deadline"],
    locations: Object.freeze(locations),
  });
}

function valueJson(value: unknown): string {
  return JSON.stringify(value);
}

function valueChange<T>(before: T | null, after: T | null): ListingSnapshotValueChangeV1<T> {
  const kind: ListingSnapshotValueChangeKindV1 =
    valueJson(before) === valueJson(after)
      ? "unchanged"
      : before === null
        ? "added"
        : after === null
          ? "removed"
          : "changed";
  return Object.freeze({ kind, before, after });
}

function requirementDiff(
  baseline: ComparableListingSnapshotV1,
  current: ComparableListingSnapshotV1,
): ListingSnapshotDiffV1["requirements"] {
  const before = new Map(
    baseline.requirements.map((requirement) => [requirement.key, requirement]),
  );
  const after = new Map(current.requirements.map((requirement) => [requirement.key, requirement]));
  const added: ListingSnapshotRequirementV1[] = [];
  const removed: ListingSnapshotRequirementV1[] = [];
  const changed: ListingSnapshotRequirementChangeV1[] = [];

  for (const [key, requirement] of after) {
    const previous = before.get(key);
    if (previous === undefined) added.push(requirement);
    else if (previous.kind !== requirement.kind || previous.text !== requirement.text) {
      changed.push(Object.freeze({ key, before: previous, after: requirement }));
    }
  }
  for (const [key, requirement] of before) {
    if (!after.has(key)) removed.push(requirement);
  }

  const byKey = (left: { readonly key: string }, right: { readonly key: string }): number =>
    left.key.localeCompare(right.key);
  return Object.freeze({
    added: Object.freeze(added.sort(byKey)),
    removed: Object.freeze(removed.sort(byKey)),
    changed: Object.freeze(changed.sort(byKey)),
  });
}

function locationDiff(
  baseline: ComparableListingSnapshotV1,
  current: ComparableListingSnapshotV1,
): ListingSnapshotDiffV1["locations"] {
  const before = new Set(baseline.locations);
  const after = new Set(current.locations);
  return Object.freeze({
    added: Object.freeze(current.locations.filter((value) => !before.has(value)).sort()),
    removed: Object.freeze(baseline.locations.filter((value) => !after.has(value)).sort()),
  });
}

/**
 * Compares two explicit immutable listing snapshots. It performs no refresh,
 * persistence operation, confirmation, or trusted-field mutation.
 */
export function compareListingSnapshotsV1(input: unknown): ListingSnapshotDiffV1 {
  if (!isRecord(input) || !hasExactKeys(input, INPUT_KEYS) || input["specVersion"] !== 1) invalid();
  const baseline = parseSnapshot(input["baseline"]);
  const current = parseSnapshot(input["current"]);
  if (baseline.id === current.id || baseline.capturedAt >= current.capturedAt) invalid();

  const requirements = requirementDiff(baseline, current);
  const compensation = valueChange(baseline.compensation, current.compensation);
  const deadline = valueChange(baseline.deadline, current.deadline);
  const locations = locationDiff(baseline, current);
  const contentKind = baseline.contentHash === current.contentHash ? "unchanged" : "changed";
  const changeCount =
    requirements.added.length +
    requirements.removed.length +
    requirements.changed.length +
    locations.added.length +
    locations.removed.length +
    (compensation.kind === "unchanged" ? 0 : 1) +
    (deadline.kind === "unchanged" ? 0 : 1) +
    (contentKind === "unchanged" ? 0 : 1);

  return Object.freeze({
    specVersion: 1 as const,
    baselineSnapshotId: baseline.id,
    currentSnapshotId: current.id,
    baselineCapturedAt: baseline.capturedAt,
    currentCapturedAt: current.capturedAt,
    changed: changeCount > 0,
    changeCount,
    requirements,
    compensation,
    deadline,
    locations,
    content: Object.freeze({
      kind: contentKind,
      beforeHash: baseline.contentHash,
      afterHash: current.contentHash,
    }),
    refreshPerformed: false as const,
    trustedFieldMutationPerformed: false as const,
  });
}
