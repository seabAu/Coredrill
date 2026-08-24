import type { Brand } from "./brand.js";
import { DomainValidationError } from "./errors.js";
import { hasControlCharacters } from "./text.js";

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const INSTANT_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const TIME_ZONE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)*$/;

export type DateOnly = Brand<string, "date-only">;
export type Instant = Brand<string, "instant">;
export type TimeZone = Brand<string, "iana-time-zone">;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Parse an exact Gregorian calendar date without assigning a time zone. */
export function dateOnly(value: string): DateOnly {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (match === null) {
    throw new DomainValidationError("invalid_date_only", "Date must use YYYY-MM-DD.");
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year === 0 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new DomainValidationError("invalid_date_only", "Date is not a valid calendar day.");
  }
  return value as DateOnly;
}

export function compareDateOnly(left: DateOnly, right: DateOnly): -1 | 0 | 1 {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Parse a UTC ISO-8601 instant and normalize it to millisecond precision. */
export function instant(value: string): Instant {
  const match = INSTANT_PATTERN.exec(value);
  if (match === null) {
    throw new DomainValidationError(
      "invalid_instant",
      "Instant must be a UTC ISO timestamp with optional millisecond precision.",
    );
  }

  const datePart = value.slice(0, 10);
  try {
    dateOnly(datePart);
  } catch {
    throw new DomainValidationError("invalid_instant", "Instant contains an invalid calendar day.");
  }
  const hourText = value.slice(11, 13);
  const minuteText = value.slice(14, 16);
  const secondText = value.slice(17, 19);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new DomainValidationError("invalid_instant", "Instant contains an invalid clock time.");
  }

  const millisecondText = value.length === 20 ? "000" : value.slice(20, 23);
  return `${datePart}T${hourText}:${minuteText}:${secondText}.${millisecondText}Z` as Instant;
}

export function instantFromDate(value: Date): Instant {
  if (Number.isNaN(value.getTime())) {
    throw new DomainValidationError(
      "invalid_instant",
      "Cannot create an instant from an invalid Date.",
    );
  }
  return instant(value.toISOString());
}

export function compareInstant(left: Instant, right: Instant): -1 | 0 | 1 {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Validate an IANA time-zone identifier and return the runtime's canonical spelling. */
export function timeZone(value: string): TimeZone {
  if (
    value.length === 0 ||
    value.length > 255 ||
    value !== value.trim() ||
    hasControlCharacters(value) ||
    !TIME_ZONE_NAME_PATTERN.test(value)
  ) {
    throw new DomainValidationError("invalid_time_zone", "Time zone is not a valid IANA name.");
  }

  try {
    const canonical = new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions()
      .timeZone;
    return canonical as TimeZone;
  } catch {
    throw new DomainValidationError("invalid_time_zone", "Time zone is not recognized.");
  }
}
