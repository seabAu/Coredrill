import type { Brand } from "./brand.js";
import { DomainValidationError } from "./errors.js";

export const MONEY_RATE_INTERVALS = ["hour", "day", "week", "month", "year"] as const;

export type CurrencyCode = Brand<string, "iso-4217-currency-code">;
export type MinorUnits = Brand<number, "integer-minor-units">;
export type MoneyRateInterval = (typeof MONEY_RATE_INTERVALS)[number];

export interface Money {
  readonly minorUnits: MinorUnits;
  readonly currency: CurrencyCode;
}

export interface MoneyRate {
  readonly amount: Money;
  readonly interval: MoneyRateInterval;
}

export function currencyCode(value: string): CurrencyCode {
  const normalized = value.toUpperCase();
  if (value !== value.trim() || !/^[A-Za-z]{3}$/.test(value)) {
    throw new DomainValidationError(
      "invalid_currency",
      "Currency must be a three-letter ISO 4217 code.",
    );
  }
  return normalized as CurrencyCode;
}

export function minorUnits(value: number): MinorUnits {
  if (!Number.isSafeInteger(value)) {
    throw new DomainValidationError(
      "invalid_minor_units",
      "Money must use safe integer minor units.",
    );
  }
  return value as MinorUnits;
}

export function money(input: { readonly minorUnits: number; readonly currency: string }): Money {
  return Object.freeze({
    minorUnits: minorUnits(input.minorUnits),
    currency: currencyCode(input.currency),
  });
}

export function moneyRate(input: {
  readonly minorUnits: number;
  readonly currency: string;
  readonly interval: MoneyRateInterval;
}): MoneyRate {
  const amount = money(input);
  if (amount.minorUnits < 0 || !MONEY_RATE_INTERVALS.includes(input.interval)) {
    throw new DomainValidationError(
      "invalid_money_rate",
      "A rate requires a nonnegative amount and a supported interval.",
    );
  }
  return Object.freeze({ amount, interval: input.interval });
}
