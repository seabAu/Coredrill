import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { instant } from "@coredrill/domain";

import { advancingAuditTimestamp, auditTimestamps } from "../src/index.js";

const BASE_TIME = Date.parse("2026-08-25T00:00:00.000Z");
const asInstant = (offsetMilliseconds: number) =>
  instant(new Date(BASE_TIME + offsetMilliseconds).toISOString());

describe("audit and future-sync timestamp contracts", () => {
  it("accepts every monotonic created/updated/archive timeline", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 86_400_000 }),
        fc.integer({ min: 0, max: 86_400_000 }),
        fc.integer({ min: 0, max: 86_400_000 }),
        (createdOffset, updateDelta, archiveDelta) => {
          const createdAt = asInstant(createdOffset);
          const updatedAt = asInstant(createdOffset + updateDelta);
          const archivedAt = asInstant(createdOffset + archiveDelta);
          expect(auditTimestamps(createdAt, updatedAt, archivedAt)).toEqual({
            archivedAt,
            createdAt,
            updatedAt,
          });
        },
      ),
    );
  });

  it("rejects backward audit, archive, and last-seen movement", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 86_400_000 }), (delta) => {
        const createdAt = asInstant(delta);
        const before = asInstant(0);
        expect(() => auditTimestamps(createdAt, before)).toThrow(TypeError);
        expect(() => auditTimestamps(createdAt, createdAt, before)).toThrow(TypeError);
        expect(() => advancingAuditTimestamp(createdAt, before, "Synthetic timestamp")).toThrow(
          TypeError,
        );
      }),
    );
  });
});
