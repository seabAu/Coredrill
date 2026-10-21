import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fixture from "../../fixtures/scheduling/civil-time-v1.json" with { type: "json" };

let resolveLocalSchedule;
const globalsBefore = {
  Temporal: globalThis.Temporal,
  Date: globalThis.Date,
  Intl: globalThis.Intl,
  toTemporalInstant: Date.prototype.toTemporalInstant,
};
beforeAll(async () => {
  ({ resolveLocalSchedule } = await import("../../apps/web/src/local-schedule.ts"));
});
const originalZone = process.env.TZ;
afterAll(() => {
  if (originalZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalZone;
});
const cases = fixture.cases;
describe("accepted bounded civil-time resolver", () => {
  it.each(["UTC", "America/Los_Angeles", "Asia/Tokyo"])(
    "resolves frozen DST cases independently of host %s",
    (host) => {
      process.env.TZ = host;
      for (const [local, zone, candidates] of cases) {
        const result = resolveLocalSchedule(local, zone);
        if (candidates.length === 0) expect(result).toEqual({ kind: "gap" });
        else {
          expect(result).toEqual({
            kind: "resolved",
            timeZone: new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions()
              .timeZone,
            candidates,
          });
          expect(Object.isFrozen(result)).toBe(true);
          expect(Object.isFrozen(result.candidates)).toBe(true);
        }
      }
    },
  );
  it.each([
    "",
    " 2026-11-02T09:00",
    "2026-11-02T09:00\n",
    "2026-11-02 09:00",
    "0000-01-01T00:00",
    "2026-02-29T09:00",
    "2026-04-31T09:00",
    "2026-11-02T24:00",
    "2026-11-02T09:60",
    "2026-11-02T09:00:60",
    "2026-11-02T09:00Z",
    "2026-11-02T09:00-05:00",
    "2026-11-02T09:00[America/New_York]",
    "2026-11-02T09:00[u-ca=hebrew]",
    "2026-11-02T09:00:00.1234",
    "2026-11-02T09:00:00.1",
    "x".repeat(1000),
    null,
    {},
    42,
  ])("rejects unsupported or invalid literal %j without shifting or truncating", (literal) => {
    expect(resolveLocalSchedule(literal, "UTC")).toEqual({ kind: "invalid" });
  });
  it.each(["", " UTC", "UTC\n", "+05:30", "Not/AZone", "x".repeat(129), null, {}])(
    "rejects invalid zone %j",
    (zone) => {
      expect(resolveLocalSchedule("2026-11-02T09:00", zone)).toEqual({ kind: "invalid" });
    },
  );
  it("retains exact seconds/milliseconds, leap dates and canonical zone aliases", () => {
    expect(resolveLocalSchedule("2028-02-29T09:00:12.345", "US/Eastern")).toEqual({
      kind: "resolved",
      timeZone: "America/New_York",
      candidates: ["2028-02-29T14:00:12.345Z"],
    });
    expect(resolveLocalSchedule("2028-02-29T09:00:12", "UTC")).toEqual({
      kind: "resolved",
      timeZone: "UTC",
      candidates: ["2028-02-29T09:00:12.000Z"],
    });
  });
  it("does not patch Date, Intl or global Temporal", () => {
    expect(globalThis.Date).toBe(globalsBefore.Date);
    expect(globalThis.Intl).toBe(globalsBefore.Intl);
    expect(globalThis.Temporal).toBe(globalsBefore.Temporal);
    expect(Date.prototype.toTemporalInstant).toBe(globalsBefore.toTemporalInstant);
  });
  it("preserves supported boundary instants and rejects conversion outside durable year bounds", () => {
    expect(resolveLocalSchedule("0001-01-01T00:00", "UTC")).toEqual({
      kind: "resolved",
      timeZone: "UTC",
      candidates: ["0001-01-01T00:00:00.000Z"],
    });
    expect(resolveLocalSchedule("9999-12-31T23:59:59.999", "UTC")).toEqual({
      kind: "resolved",
      timeZone: "UTC",
      candidates: ["9999-12-31T23:59:59.999Z"],
    });
    expect(resolveLocalSchedule("0001-01-01T00:00", "Etc/GMT-14")).toEqual({ kind: "invalid" });
    expect(resolveLocalSchedule("9999-12-31T23:59:59.999", "Etc/GMT+12")).toEqual({
      kind: "invalid",
    });
  });
});
