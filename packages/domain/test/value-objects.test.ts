import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  DomainValidationError,
  MONEY_RATE_INTERVALS,
  compareDateOnly,
  compareInstant,
  confidence,
  currencyCode,
  dateOnly,
  entityId,
  generateEntityId,
  instant,
  instantFromDate,
  isEntityId,
  minorUnits,
  money,
  moneyRate,
  sourceReference,
  timeZone,
  webUrl,
} from "../src/index.js";

const hexDigit = fc.constantFrom(..."0123456789abcdef");
const uuidV7 = fc
  .array(hexDigit, { minLength: 30, maxLength: 30 })
  .map((digits) => digits.join(""))
  .map(
    (hex) =>
      `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(12, 15)}-8${hex.slice(15, 18)}-${hex.slice(18)}`,
  );

function leapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function monthLength(year: number, month: number): number {
  if (month === 2) return leapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

const validDateOnly = fc
  .tuple(
    fc.integer({ min: 1, max: 9999 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 0, max: 30 }),
  )
  .map(([year, month, daySeed]) => {
    const day = (daySeed % monthLength(year, month)) + 1;
    return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
      .toString()
      .padStart(2, "0")}`;
  });

describe("branded entity IDs", () => {
  it("parses every syntactically valid UUIDv7 and normalizes case", () => {
    fc.assert(
      fc.property(uuidV7, (value) => {
        expect(entityId("job", value.toUpperCase())).toBe(value);
        expect(isEntityId(value)).toBe(true);
      }),
    );
  });

  it("generates local UUIDv7 values and rejects wrong versions or entity types", () => {
    const generated = generateEntityId("job");
    expect(isEntityId(generated)).toBe(true);
    expect(generated[14]).toBe("7");
    expect(["8", "9", "a", "b"]).toContain(generated[19]);
    expect(() => entityId("job", "019539af-7c11-4dd4-8b54-395d8f3fe4c2")).toThrow(
      DomainValidationError,
    );
    expect(() => entityId("Job Record", generated)).toThrowError(
      expect.objectContaining({ code: "invalid_entity_id" }),
    );
    expect(isEntityId(null)).toBe(false);
  });
});

describe("calendar and instant value objects", () => {
  it("round-trips valid calendar dates as date-only values", () => {
    fc.assert(
      fc.property(validDateOnly, (value) => {
        expect(dateOnly(value)).toBe(value);
      }),
    );
  });

  it("rejects impossible or ambiguous dates and compares canonical dates", () => {
    expect(dateOnly("2024-02-29")).toBe("2024-02-29");
    for (const invalid of ["0000-01-01", "2023-02-29", "2024-04-31", "2024-1-01"]) {
      expect(() => dateOnly(invalid)).toThrowError(
        expect.objectContaining({ code: "invalid_date_only" }),
      );
    }
    expect(compareDateOnly(dateOnly("2024-01-01"), dateOnly("2024-01-02"))).toBe(-1);
    expect(compareDateOnly(dateOnly("2024-01-02"), dateOnly("2024-01-01"))).toBe(1);
    expect(compareDateOnly(dateOnly("2024-01-01"), dateOnly("2024-01-01"))).toBe(0);
  });

  it("requires UTC instants and normalizes milliseconds", () => {
    expect(instant("2026-08-24T14:03:05Z")).toBe("2026-08-24T14:03:05.000Z");
    expect(instant("2026-08-24T14:03:05.123Z")).toBe("2026-08-24T14:03:05.123Z");
    expect(instantFromDate(new Date("2026-08-24T14:03:05.456Z"))).toBe("2026-08-24T14:03:05.456Z");
    for (const invalid of [
      "2026-08-24T14:03:05-04:00",
      "2026-08-24T24:00:00Z",
      "2026-02-29T01:00:00Z",
      "2026-08-24",
    ]) {
      expect(() => instant(invalid)).toThrow(DomainValidationError);
    }
    expect(() => instantFromDate(new Date(Number.NaN))).toThrowError(
      expect.objectContaining({ code: "invalid_instant" }),
    );
    expect(compareInstant(instant("2026-01-01T00:00:00Z"), instant("2026-01-01T00:00:01Z"))).toBe(
      -1,
    );
    expect(compareInstant(instant("2026-01-01T00:00:01Z"), instant("2026-01-01T00:00:00Z"))).toBe(
      1,
    );
    expect(compareInstant(instant("2026-01-01T00:00:00Z"), instant("2026-01-01T00:00:00Z"))).toBe(
      0,
    );
  });

  it("validates IANA time zones without turning local dates into instants", () => {
    expect(timeZone("America/New_York")).toBe("America/New_York");
    expect(timeZone("UTC")).toBeTruthy();
    for (const invalid of ["", " America/New_York", "+04:00", "Not/AZone"]) {
      expect(() => timeZone(invalid)).toThrowError(
        expect.objectContaining({ code: "invalid_time_zone" }),
      );
    }
  });
});

describe("money and rate units", () => {
  it("preserves every safe integer as minor units and normalizes currency case", () => {
    fc.assert(
      fc.property(fc.maxSafeInteger(), (value) => {
        const amount = money({ minorUnits: value, currency: "usd" });
        expect(amount).toEqual({ minorUnits: value, currency: "USD" });
        expect(Object.isFrozen(amount)).toBe(true);
      }),
    );
  });

  it("rejects fractional, unsafe, and malformed currency values", () => {
    expect(currencyCode("CAD")).toBe("CAD");
    expect(minorUnits(123)).toBe(123);
    for (const invalid of [1.1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => minorUnits(invalid)).toThrowError(
        expect.objectContaining({ code: "invalid_minor_units" }),
      );
    }
    for (const invalid of ["US", "USDD", " USD", "12A"]) {
      expect(() => currencyCode(invalid)).toThrowError(
        expect.objectContaining({ code: "invalid_currency" }),
      );
    }
  });

  it("creates nonnegative money rates for every supported interval", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
        fc.constantFrom(...MONEY_RATE_INTERVALS),
        (value, interval) => {
          const rate = moneyRate({ minorUnits: value, currency: "EUR", interval });
          expect(rate.interval).toBe(interval);
          expect(rate.amount.minorUnits).toBe(value);
          expect(Object.isFrozen(rate)).toBe(true);
        },
      ),
    );
    expect(() => moneyRate({ minorUnits: -1, currency: "USD", interval: "hour" })).toThrowError(
      expect.objectContaining({ code: "invalid_money_rate" }),
    );
    expect(() =>
      moneyRate({ minorUnits: 1, currency: "USD", interval: "quarter" as "hour" }),
    ).toThrow(DomainValidationError);
  });
});

describe("web URLs, source references, and confidence", () => {
  it("normalizes safe absolute web URLs and rejects unsafe schemes and credentials", () => {
    expect(webUrl("HTTPS://Example.COM:443/jobs?q=dev#role")).toBe(
      "https://example.com/jobs?q=dev#role",
    );
    expect(webUrl("http://example.com")).toBe("http://example.com/");
    for (const invalid of [
      "javascript:alert(1)",
      "/relative",
      "https://user:pass@example.com",
      " https://example.com",
      "not a url",
    ]) {
      expect(() => webUrl(invalid)).toThrowError(
        expect.objectContaining({ code: "invalid_web_url" }),
      );
    }
  });

  it("creates immutable opaque source references with optional pointers", () => {
    const id = "019539af-7c11-7dd4-8b54-395d8f3fe4c2";
    const reference = sourceReference({
      sourceType: "source_snapshot",
      sourceId: id,
      pointer: "/jobLocation/address/addressLocality",
    });
    expect(reference).toEqual({
      sourceType: "source_snapshot",
      sourceId: id,
      pointer: "/jobLocation/address/addressLocality",
    });
    expect(Object.isFrozen(reference)).toBe(true);
    expect(sourceReference({ sourceType: "document", sourceId: id })).not.toHaveProperty("pointer");

    expect(() => sourceReference({ sourceType: "Source Snapshot", sourceId: id })).toThrowError(
      expect.objectContaining({ code: "invalid_source_reference" }),
    );
    expect(() =>
      sourceReference({ sourceType: "source_snapshot", sourceId: id, pointer: " " }),
    ).toThrowError(expect.objectContaining({ code: "invalid_source_reference" }));
    expect(() =>
      sourceReference({ sourceType: "source_snapshot", sourceId: "not-an-id" }),
    ).toThrowError(expect.objectContaining({ code: "invalid_entity_id" }));
  });

  it("accepts every finite confidence in the closed unit interval", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (value) => {
        const result = confidence(value);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(1);
      }),
    );
    expect(Object.is(confidence(-0), -0)).toBe(false);
    for (const invalid of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => confidence(invalid)).toThrowError(
        expect.objectContaining({ code: "invalid_confidence" }),
      );
    }
  });
});
