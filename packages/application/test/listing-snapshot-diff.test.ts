import { describe, expect, it } from "vitest";

import {
  ListingSnapshotDiffError,
  compareListingSnapshotsV1,
  type ListingSnapshotDiffInputV1,
} from "../src/index.js";
import fixture from "./fixtures/listing-snapshot-diff.json" with { type: "json" };

describe("listing snapshot diff", () => {
  it("reports no changes for equivalent explicit snapshots", () => {
    const result = compareListingSnapshotsV1(fixture.unchanged as ListingSnapshotDiffInputV1);
    expect(result).toMatchObject({
      changed: false,
      changeCount: 0,
      compensation: { kind: "unchanged" },
      deadline: { kind: "unchanged" },
      content: { kind: "unchanged" },
      refreshPerformed: false,
      trustedFieldMutationPerformed: false,
    });
    expect(result.requirements).toEqual({ added: [], removed: [], changed: [] });
    expect(result.locations).toEqual({ added: [], removed: [] });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("distinguishes added, removed, and changed listing evidence", () => {
    const result = compareListingSnapshotsV1(fixture.changed as ListingSnapshotDiffInputV1);
    expect(result.requirements.added.map(({ key }) => key)).toEqual(["req-security"]);
    expect(result.requirements.removed.map(({ key }) => key)).toEqual(["req-travel"]);
    expect(result.requirements.changed).toEqual([
      expect.objectContaining({
        key: "req-platform",
        before: expect.objectContaining({ text: "Build web systems" }),
        after: expect.objectContaining({ text: "Build accessible local-first systems" }),
      }),
    ]);
    expect(result.compensation).toMatchObject({ kind: "changed" });
    expect(result.deadline).toEqual({
      kind: "changed",
      before: "2026-10-15",
      after: "2026-11-01",
    });
    expect(result.locations).toEqual({
      added: ["Remote — United States"],
      removed: ["New York, NY"],
    });
    expect(result.content).toMatchObject({ kind: "changed" });
    expect(result).toMatchObject({
      changed: true,
      changeCount: 8,
      refreshPerformed: false,
      trustedFieldMutationPerformed: false,
    });
    console.info(
      `REV006_DIFF_PROOF ${JSON.stringify({ requirements: { added: 1, removed: 1, changed: 1 }, compensation: "changed", deadline: "changed", locations: { added: 1, removed: 1 }, content: "changed", refreshPerformed: false, trustedFieldMutations: 0 })}`,
    );
  });

  it("classifies nullable values as added and removed", () => {
    const unchanged = fixture.unchanged as ListingSnapshotDiffInputV1;
    const added = compareListingSnapshotsV1({
      ...unchanged,
      baseline: { ...unchanged.baseline, compensation: null, deadline: null },
    });
    expect(added.compensation.kind).toBe("added");
    expect(added.deadline.kind).toBe("added");

    const removed = compareListingSnapshotsV1({
      ...unchanged,
      current: { ...unchanged.current, compensation: null, deadline: null },
    });
    expect(removed.compensation.kind).toBe("removed");
    expect(removed.deadline.kind).toBe("removed");
  });

  it("fails closed on malformed, duplicate, or reversed snapshot input", () => {
    const unchanged = fixture.unchanged as ListingSnapshotDiffInputV1;
    for (const invalid of [
      { ...unchanged, extra: true },
      { ...unchanged, current: { ...unchanged.current, id: unchanged.baseline.id } },
      {
        ...unchanged,
        current: { ...unchanged.current, capturedAt: unchanged.baseline.capturedAt },
      },
      { ...unchanged, baseline: { ...unchanged.baseline, contentHash: "not-a-hash" } },
      {
        ...unchanged,
        current: {
          ...unchanged.current,
          requirements: [unchanged.current.requirements[0], unchanged.current.requirements[0]],
        },
      },
      { ...unchanged, current: { ...unchanged.current, locations: ["Remote", "Remote"] } },
    ]) {
      expect(() => compareListingSnapshotsV1(invalid as ListingSnapshotDiffInputV1)).toThrowError(
        new ListingSnapshotDiffError(),
      );
    }
  });
});
