import {
  fieldCandidateV1Schema,
  jobNormalizationV1Schema,
  type FieldCandidateV1,
  type JobCandidateNormalizationV1,
  type JobNormalizationStatus,
  type JobNormalizationV1,
  type JobNormalizationWarningCode,
  type JobSourceNormalizationRawV1,
  type JobSourceNormalizationV1,
  type JsonValue,
  type NormalizedJobValueV1,
  type NormalizedLocationPrecision,
  type NormalizedMoneyInterval,
} from "@coredrill/contracts";

export const JOB_CANDIDATE_NORMALIZATION_SPEC_VERSION = 1 as const;

export const JOB_CANDIDATE_NORMALIZATION_LIMITS = Object.freeze({
  maxCandidates: 256,
  maxInputBytes: 2 * 1024 * 1024,
  maxJsonDepth: 32,
  maxJsonValues: 10_000,
  maxTextLength: 1_024,
  maxSourceUrlLength: 8_192,
  maxMaterialQueryParameters: 32,
  maxDecimalIntegerDigits: 15,
  maxDecimalFractionDigits: 3,
});

export const JOB_CANDIDATE_NORMALIZATION_ERROR_CODES = [
  "input_invalid",
  "input_too_large",
  "candidate_limit_exceeded",
  "candidate_duplicate",
  "contract_invalid",
] as const;

export type JobCandidateNormalizationErrorCode =
  (typeof JOB_CANDIDATE_NORMALIZATION_ERROR_CODES)[number];

/** Content-free failure for invalid or unbounded normalization input. */
export class JobCandidateNormalizationError extends Error {
  public constructor(public readonly code: JobCandidateNormalizationErrorCode) {
    super("Job candidate normalization rejected invalid input.");
    this.name = "JobCandidateNormalizationError";
  }
}

export type JobSourceNormalizationInputV1 = JobSourceNormalizationRawV1;

export interface JobCandidateNormalizationInputV1 {
  readonly specVersion: 1;
  readonly candidates: readonly FieldCandidateV1[];
  readonly source: JobSourceNormalizationInputV1 | null;
}

export const CURRENCY_SCALES_V1: Readonly<Record<string, 0 | 2 | 3>> = Object.freeze({
  AED: 2,
  ARS: 2,
  AUD: 2,
  BHD: 3,
  BRL: 2,
  CAD: 2,
  CHF: 2,
  CLP: 0,
  CNY: 2,
  CZK: 2,
  DKK: 2,
  EUR: 2,
  GBP: 2,
  HKD: 2,
  HUF: 2,
  IDR: 2,
  ILS: 2,
  INR: 2,
  IQD: 3,
  ISK: 0,
  JOD: 3,
  JPY: 0,
  KRW: 0,
  KWD: 3,
  LYD: 3,
  MXN: 2,
  MYR: 2,
  NOK: 2,
  NZD: 2,
  OMR: 3,
  PHP: 2,
  PLN: 2,
  PYG: 0,
  RON: 2,
  SAR: 2,
  SEK: 2,
  SGD: 2,
  THB: 2,
  TND: 3,
  TRY: 2,
  TWD: 2,
  USD: 2,
  VND: 0,
  ZAR: 2,
});

const INPUT_KEYS = ["specVersion", "candidates", "source"] as const;
const SOURCE_KEYS = ["url", "sourceKind", "externalId", "materialQueryParameters"] as const;
const SAFE_SOURCE_KIND = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const SAFE_QUERY_PARAMETER = /^[A-Za-z0-9_.~-]{1,64}$/u;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/u;
const ISO_INSTANT =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/u;
const GROUPED_DECIMAL = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,3})?$/u;
const TITLE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  dev: "developer",
  eng: "engineer",
  engineering: "engineer",
  jr: "junior",
  sr: "senior",
});

const COMPANY_SUFFIXES = new Set([
  "co",
  "company",
  "corp",
  "corporation",
  "inc",
  "incorporated",
  "limited",
  "llc",
  "ltd",
  "plc",
]);

const WORKPLACE_VALUES: Readonly<Record<string, "remote" | "hybrid" | "on_site">> = Object.freeze({
  remote: "remote",
  "fully remote": "remote",
  "100 remote": "remote",
  telecommute: "remote",
  virtual: "remote",
  wfh: "remote",
  "work from home": "remote",
  "remote first": "remote",
  hybrid: "hybrid",
  "hybrid remote": "hybrid",
  "partially remote": "hybrid",
  onsite: "on_site",
  "on site": "on_site",
  "in office": "on_site",
  "office based": "on_site",
  "in person": "on_site",
});

const INTERVAL_VALUES: Readonly<Record<string, NormalizedMoneyInterval>> = Object.freeze({
  hour: "hour",
  hourly: "hour",
  hr: "hour",
  "per hour": "hour",
  "per-hour-wage": "hour",
  ph: "hour",
  day: "day",
  daily: "day",
  "per day": "day",
  pd: "day",
  week: "week",
  weekly: "week",
  "per week": "week",
  pw: "week",
  month: "month",
  monthly: "month",
  "per month": "month",
  pm: "month",
  year: "year",
  yearly: "year",
  annual: "year",
  annually: "year",
  annum: "year",
  "per year": "year",
  "per annum": "year",
  "per-year-salary": "year",
  pa: "year",
});

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function inspectJsonBoundary(value: unknown): number {
  const stack: { readonly value: unknown; readonly depth: number }[] = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  let count = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    count += 1;
    if (count > JOB_CANDIDATE_NORMALIZATION_LIMITS.maxJsonValues) {
      throw new JobCandidateNormalizationError("input_too_large");
    }
    if (current.depth > JOB_CANDIDATE_NORMALIZATION_LIMITS.maxJsonDepth) {
      throw new JobCandidateNormalizationError("input_too_large");
    }
    const entry = current.value;
    if (
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "boolean" ||
      (typeof entry === "number" && Number.isFinite(entry))
    ) {
      continue;
    }
    if (typeof entry !== "object") {
      throw new JobCandidateNormalizationError("input_invalid");
    }
    if (seen.has(entry)) throw new JobCandidateNormalizationError("input_invalid");
    seen.add(entry);
    if (Array.isArray(entry)) {
      for (const child of entry) stack.push({ value: child, depth: current.depth + 1 });
      continue;
    }
    if (!isPlainRecord(entry)) throw new JobCandidateNormalizationError("input_invalid");
    for (const child of Object.values(entry)) {
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }
  return count;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizedDisplayText(value: unknown, maximum = 1_024): string | null {
  if (typeof value !== "string" || value.length > maximum * 4) return null;
  const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (
    normalized.length === 0 ||
    normalized.length > maximum ||
    /[\p{Cc}\p{Cf}]/u.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function comparisonKey(value: string, kind: "title" | "company"): string | null {
  const tokens = value
    .toLocaleLowerCase("en-US")
    .replaceAll("&", " and ")
    .replaceAll(/[\p{P}\p{S}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter((token) => token.length > 0)
    .map((token) => (kind === "title" ? (TITLE_ALIASES[token] ?? token) : token));
  const withoutSuffixes =
    kind === "company" ? tokens.filter((token) => !COMPANY_SUFFIXES.has(token)) : tokens;
  const key = (withoutSuffixes.length > 0 ? withoutSuffixes : tokens).join(" ");
  return key.length === 0 || key.length > 1_024 ? null : key;
}

function normalizeTextCandidate(
  candidate: FieldCandidateV1,
  kind: "title" | "company",
): NormalizedJobValueV1 | null {
  const displayValue = normalizedDisplayText(candidate.value);
  if (displayValue === null) return null;
  const key = comparisonKey(displayValue, kind);
  return key === null ? null : { kind, displayValue, comparisonKey: key };
}

function asRecord(value: JsonValue): Record<string, JsonValue> | null {
  return isPlainRecord(value) ? value : null;
}

function locationPrecision(input: {
  readonly postalCode?: string;
  readonly addressLocality?: string;
  readonly region?: string;
  readonly country?: string;
}): NormalizedLocationPrecision {
  if (input.postalCode !== undefined) return "postal_code";
  if (input.addressLocality !== undefined) return "locality";
  if (input.region !== undefined) return "region";
  if (input.country !== undefined) return "country";
  return "label";
}

function recordText(
  record: Record<string, JsonValue>,
  key: string,
  maximum = 1_024,
): string | null {
  return normalizedDisplayText(record[key], maximum);
}

function normalizeLocationCandidate(candidate: FieldCandidateV1): NormalizedJobValueV1 | null {
  const display = normalizedDisplayText(candidate.value);
  if (display !== null) {
    const remoteMatch = /^(?:remote|work from anywhere)(?:\s*(?:[-–—:]|\bin\b)\s*(.+))?$/iu.exec(
      display,
    );
    if (remoteMatch !== null) {
      const remoteRegion = normalizedDisplayText(remoteMatch[1]);
      return {
        kind: "location",
        locationKind: "remote_region",
        label: display,
        ...(remoteRegion === null ? {} : { remoteRegion }),
        precision: remoteRegion === null ? "label" : "region",
      };
    }
    return { kind: "location", locationKind: "label", label: display, precision: "label" };
  }

  const record = asRecord(candidate.value);
  if (record === null) return null;
  const directName = recordText(record, "name");
  const address = record["address"] === undefined ? null : asRecord(record["address"]);
  const addressLocality = address === null ? null : recordText(address, "addressLocality");
  const region = address === null ? null : recordText(address, "addressRegion");
  const postalCode = address === null ? null : recordText(address, "postalCode", 64);
  const countryInput = address?.["addressCountry"];
  const countryRecord = countryInput === undefined ? null : asRecord(countryInput);
  const country =
    normalizedDisplayText(countryInput) ??
    (countryRecord === null ? null : recordText(countryRecord, "name"));
  const countryCode =
    country !== null && /^[A-Za-z]{2}$/u.test(country) ? country.toUpperCase() : null;
  const pieces = [addressLocality, region, postalCode, country].filter(
    (entry): entry is string => entry !== null,
  );
  const label = directName ?? (pieces.length > 0 ? [...new Set(pieces)].join(", ") : null);
  if (label === null) return null;

  const typeText = normalizedDisplayText(record["@type"], 128)?.toLocaleLowerCase("en-US");
  const remote =
    candidate.provenance.source.pointer.includes("/applicantLocationRequirements") ||
    typeText === "country" ||
    typeText === "state" ||
    typeText === "administrativearea";
  if (remote) {
    const remoteRegion = directName ?? country ?? region;
    return {
      kind: "location",
      locationKind: "remote_region",
      label,
      ...(country === null ? {} : { country }),
      ...(countryCode === null ? {} : { countryCode }),
      ...(remoteRegion === null ? {} : { remoteRegion }),
      precision: locationPrecision({
        ...(region === null ? {} : { region }),
        ...(country === null ? {} : { country }),
      }),
    };
  }

  return {
    kind: "location",
    locationKind: address === null ? "label" : "physical",
    label,
    ...(addressLocality === null ? {} : { addressLocality }),
    ...(region === null ? {} : { region }),
    ...(postalCode === null ? {} : { postalCode }),
    ...(country === null ? {} : { country }),
    ...(countryCode === null ? {} : { countryCode }),
    precision: locationPrecision({
      ...(postalCode === null ? {} : { postalCode }),
      ...(addressLocality === null ? {} : { addressLocality }),
      ...(region === null ? {} : { region }),
      ...(country === null ? {} : { country }),
    }),
  };
}

function normalizedLookupKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeWorkplaceCandidate(candidate: FieldCandidateV1): NormalizedJobValueV1 | null {
  const display = normalizedDisplayText(candidate.value, 128);
  if (display === null) return null;
  const value = WORKPLACE_VALUES[normalizedLookupKey(display)];
  return value === undefined ? null : { kind: "workplace_type", value };
}

function validDateOnly(value: string): boolean {
  const match = DATE_ONLY.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year === 0 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (monthDays[month - 1] ?? 0);
}

function normalizeDateCandidate(candidate: FieldCandidateV1): NormalizedJobValueV1 | null {
  if (typeof candidate.value !== "string") return null;
  if (validDateOnly(candidate.value)) {
    return { kind: "date", date: candidate.value, precision: "date", instant: null };
  }
  const match = ISO_INSTANT.exec(candidate.value);
  const date = match?.[1];
  if (match === null || date === undefined || !validDateOnly(date)) return null;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  const offset = match[6] ?? "";
  if (hour > 23 || minute > 59 || second > 59) return null;
  if (offset !== "Z") {
    const offsetHour = Number(offset.slice(1, 3));
    const offsetMinute = Number(offset.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return null;
  }
  const parsed = new Date(candidate.value);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    kind: "date",
    date,
    precision: "instant",
    instant: parsed.toISOString(),
  };
}

function canonicalDecimal(input: unknown): string | null {
  let text: string;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) return null;
    text = input.toString();
  } else if (typeof input === "string") {
    text = input.trim();
  } else {
    return null;
  }
  if (!GROUPED_DECIMAL.test(text)) return null;
  const ungrouped = text.replaceAll(",", "");
  const [integerInput = "", fractionInput = ""] = ungrouped.split(".");
  const integer = integerInput.replace(/^0+(?=\d)/u, "");
  const fraction = fractionInput.replace(/0+$/u, "");
  if (
    integer.length === 0 ||
    integer.length > JOB_CANDIDATE_NORMALIZATION_LIMITS.maxDecimalIntegerDigits ||
    fraction.length > JOB_CANDIDATE_NORMALIZATION_LIMITS.maxDecimalFractionDigits
  ) {
    return null;
  }
  return fraction.length === 0 ? integer : `${integer}.${fraction}`;
}

function decimalParts(value: string): { readonly integer: string; readonly fraction: string } {
  const [integer = "0", fraction = ""] = value.split(".");
  return { integer, fraction };
}

function compareDecimals(left: string, right: string): number {
  const leftParts = decimalParts(left);
  const rightParts = decimalParts(right);
  const scale = Math.max(leftParts.fraction.length, rightParts.fraction.length);
  const leftValue = BigInt(leftParts.integer + leftParts.fraction.padEnd(scale, "0"));
  const rightValue = BigInt(rightParts.integer + rightParts.fraction.padEnd(scale, "0"));
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function multiplyDecimal(value: string, multiplier: 1_000 | 1_000_000): string | null {
  const parts = decimalParts(value);
  const scale = parts.fraction.length;
  const scaled = BigInt(parts.integer + parts.fraction) * BigInt(multiplier);
  const digits = scaled.toString().padStart(scale + 1, "0");
  const candidate =
    scale === 0
      ? digits
      : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.0+$/u, "");
  return canonicalDecimal(candidate);
}

function toMinorUnits(value: string, scale: 0 | 2 | 3): number | null {
  const parts = decimalParts(value);
  if (parts.fraction.length > scale) return null;
  const encoded = BigInt(parts.integer + parts.fraction.padEnd(scale, "0"));
  return encoded > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(encoded);
}

function decimalFromMinorUnits(value: unknown, scale: 0 | 2 | 3): string | null {
  const parsed = canonicalDecimal(value);
  if (parsed === null || parsed.includes(".")) return null;
  const minor = BigInt(parsed);
  const divisor = 10n ** BigInt(scale);
  const integer = minor / divisor;
  const fraction = (minor % divisor).toString().padStart(scale, "0").replace(/0+$/u, "");
  return canonicalDecimal(
    fraction.length === 0 ? integer.toString() : `${integer.toString()}.${fraction}`,
  );
}

function currencyFrom(value: unknown): string | null {
  if (typeof value !== "string" || value !== value.trim() || !/^[A-Za-z]{3}$/u.test(value)) {
    return null;
  }
  return value.toUpperCase();
}

function intervalFrom(value: unknown): NormalizedMoneyInterval | null {
  if (typeof value !== "string") return null;
  const display = normalizedDisplayText(value, 128);
  if (display === null) return null;
  return INTERVAL_VALUES[display.toLocaleLowerCase("en-US")] ?? null;
}

interface SalaryParts {
  readonly minimumDecimal: string;
  readonly maximumDecimal: string;
  readonly currency: string | null;
  readonly interval: NormalizedMoneyInterval | null;
}

function structuredSalaryParts(value: JsonValue): SalaryParts | null {
  const salary = asRecord(value);
  if (salary === null) return null;

  if (salary["min_cents"] !== undefined || salary["max_cents"] !== undefined) {
    const currency = currencyFrom(salary["currency_type"]);
    const scale = currency === null ? null : CURRENCY_SCALES_V1[currency];
    if (scale === undefined || scale === null) return null;
    const minimumDecimal = decimalFromMinorUnits(salary["min_cents"], scale);
    const maximumDecimal = decimalFromMinorUnits(salary["max_cents"], scale);
    if (minimumDecimal === null || maximumDecimal === null) return null;
    return { minimumDecimal, maximumDecimal, currency, interval: null };
  }

  const quantitative = asRecord(salary["value"] ?? null);
  const values = quantitative ?? salary;
  const exact = canonicalDecimal(values["value"]);
  const minimumDecimal = exact ?? canonicalDecimal(values["minValue"] ?? values["min"]);
  const maximumDecimal = exact ?? canonicalDecimal(values["maxValue"] ?? values["max"]);
  if (minimumDecimal === null || maximumDecimal === null) return null;
  const currency = currencyFrom(salary["currency"] ?? salary["currency_type"]);
  const interval = intervalFrom(
    values["unitText"] ??
      salary["interval"] ??
      salary["rate_interval_code"] ??
      salary["description"],
  );
  return { minimumDecimal, maximumDecimal, currency, interval };
}

function salaryTextParts(value: string): SalaryParts | null {
  const display = normalizedDisplayText(value, 512);
  if (display === null) return null;
  const matches = [
    ...display.matchAll(/(?<![\p{L}\p{N}])(\d+(?:,\d{3})*(?:\.\d{1,3})?)\s*([kKmM])?/gu),
  ];
  if (matches.length === 0 || matches.length > 2) return null;
  const amounts: string[] = [];
  for (const match of matches) {
    const decimal = canonicalDecimal(match[1]);
    if (decimal === null) return null;
    const suffix = match[2]?.toLocaleLowerCase("en-US");
    const expanded =
      suffix === "k"
        ? multiplyDecimal(decimal, 1_000)
        : suffix === "m"
          ? multiplyDecimal(decimal, 1_000_000)
          : decimal;
    if (expanded === null) return null;
    amounts.push(expanded);
  }
  const minimumDecimal = amounts[0];
  const maximumDecimal = amounts[1] ?? amounts[0];
  if (minimumDecimal === undefined || maximumDecimal === undefined) return null;

  const currencyCandidates = new Set<string>();
  for (const match of display.matchAll(/\b[A-Za-z]{3}\b/gu)) {
    const candidate = match[0].toUpperCase();
    if (CURRENCY_SCALES_V1[candidate] !== undefined) currencyCandidates.add(candidate);
  }
  if (display.includes("€")) currencyCandidates.add("EUR");
  if (display.includes("₹")) currencyCandidates.add("INR");
  if (display.includes("₩")) currencyCandidates.add("KRW");
  if (display.includes("₫")) currencyCandidates.add("VND");
  if (display.includes("₪")) currencyCandidates.add("ILS");
  if (display.includes("₱")) currencyCandidates.add("PHP");
  if (display.includes("₺")) currencyCandidates.add("TRY");
  const currency = currencyCandidates.size === 1 ? ([...currencyCandidates][0] ?? null) : null;
  const maximumFractionDigits = currency === null ? 2 : (CURRENCY_SCALES_V1[currency] ?? 2);
  if (
    matches.some((match) => {
      const fraction = match[1]?.split(".")[1];
      return fraction !== undefined && fraction.length > maximumFractionDigits;
    })
  ) {
    return null;
  }

  const key = normalizedLookupKey(display);
  const intervalMatches = new Set<NormalizedMoneyInterval>();
  for (const [phrase, interval] of Object.entries(INTERVAL_VALUES)) {
    if (
      key === phrase ||
      key.includes(` ${phrase} `) ||
      key.startsWith(`${phrase} `) ||
      key.endsWith(` ${phrase}`)
    ) {
      intervalMatches.add(interval);
    }
  }
  const interval = intervalMatches.size === 1 ? ([...intervalMatches][0] ?? null) : null;
  return { minimumDecimal, maximumDecimal, currency, interval };
}

function normalizeSalaryCandidate(candidate: FieldCandidateV1): {
  readonly value: NormalizedJobValueV1 | null;
  readonly warnings: readonly JobNormalizationWarningCode[];
} {
  const parts =
    typeof candidate.value === "string"
      ? salaryTextParts(candidate.value)
      : structuredSalaryParts(candidate.value);
  if (parts === null || compareDecimals(parts.minimumDecimal, parts.maximumDecimal) > 0) {
    return { value: null, warnings: ["invalid_salary"] };
  }

  const warnings: JobNormalizationWarningCode[] = [];
  const currency = parts.currency;
  const scale = currency === null ? null : (CURRENCY_SCALES_V1[currency] ?? null);
  if (currency === null) warnings.push("currency_missing");
  else if (scale === null) warnings.push("currency_unsupported");
  if (parts.interval === null) warnings.push("interval_missing");

  let minimumMinorUnits: number | null = null;
  let maximumMinorUnits: number | null = null;
  if (scale !== null) {
    minimumMinorUnits = toMinorUnits(parts.minimumDecimal, scale);
    maximumMinorUnits = toMinorUnits(parts.maximumDecimal, scale);
    if (minimumMinorUnits === null || maximumMinorUnits === null) {
      return { value: null, warnings: ["invalid_salary"] };
    }
  }

  return {
    value: {
      kind: "salary",
      minimumDecimal: parts.minimumDecimal,
      maximumDecimal: parts.maximumDecimal,
      currency,
      currencyScale: scale,
      minimumMinorUnits,
      maximumMinorUnits,
      interval: parts.interval,
    },
    warnings,
  };
}

function normalizeCurrencyCandidate(candidate: FieldCandidateV1): {
  readonly value: NormalizedJobValueV1 | null;
  readonly warning: JobNormalizationWarningCode | null;
} {
  const currency = currencyFrom(candidate.value);
  if (currency === null) return { value: null, warning: "invalid_currency" };
  const scale = CURRENCY_SCALES_V1[currency];
  if (scale === undefined) return { value: null, warning: "currency_unsupported" };
  return { value: { kind: "currency", value: currency, scale }, warning: null };
}

function normalizeExternalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const externalId = value.normalize("NFKC").trim();
  if (externalId.length === 0 || externalId.length > 1_024 || /[\p{Cc}\p{Cf}]/u.test(externalId)) {
    return null;
  }
  return externalId;
}

function normalizeExternalIdCandidate(candidate: FieldCandidateV1): NormalizedJobValueV1 | null {
  const externalId = normalizeExternalId(candidate.value);
  return externalId === null ? null : { kind: "source", externalId };
}

function candidateResult(
  sourceCandidate: FieldCandidateV1,
  status: JobNormalizationStatus,
  normalizedValue: NormalizedJobValueV1 | null,
  warningCodes: readonly JobNormalizationWarningCode[],
): JobCandidateNormalizationV1 {
  return {
    specVersion: JOB_CANDIDATE_NORMALIZATION_SPEC_VERSION,
    sourceCandidate,
    status,
    normalizedValue,
    warningCodes: [...warningCodes],
  };
}

function normalizeCandidate(candidate: FieldCandidateV1): JobCandidateNormalizationV1 {
  if (candidate.fieldName === "title" || candidate.fieldName === "company") {
    const normalized = normalizeTextCandidate(candidate, candidate.fieldName);
    return normalized === null
      ? candidateResult(candidate, "ambiguous", null, ["invalid_text"])
      : candidateResult(candidate, "normalized", normalized, []);
  }
  if (candidate.fieldName === "locations") {
    const normalized = normalizeLocationCandidate(candidate);
    return normalized === null
      ? candidateResult(candidate, "ambiguous", null, ["invalid_location"])
      : candidateResult(candidate, "normalized", normalized, []);
  }
  if (candidate.fieldName === "workplace_type") {
    const normalized = normalizeWorkplaceCandidate(candidate);
    return normalized === null
      ? candidateResult(candidate, "ambiguous", null, ["ambiguous_workplace_type"])
      : candidateResult(candidate, "normalized", normalized, []);
  }
  if (candidate.fieldName === "salary") {
    const normalized = normalizeSalaryCandidate(candidate);
    if (normalized.value === null) {
      return candidateResult(candidate, "ambiguous", null, normalized.warnings);
    }
    return candidateResult(
      candidate,
      normalized.warnings.length === 0 ? "normalized" : "partial",
      normalized.value,
      normalized.warnings,
    );
  }
  if (candidate.fieldName === "currency") {
    const normalized = normalizeCurrencyCandidate(candidate);
    return normalized.value === null || normalized.warning !== null
      ? candidateResult(candidate, "ambiguous", null, [normalized.warning ?? "invalid_currency"])
      : candidateResult(candidate, "normalized", normalized.value, []);
  }
  if (["date", "posted_at", "valid_through"].includes(candidate.fieldName)) {
    const normalized = normalizeDateCandidate(candidate);
    return normalized === null
      ? candidateResult(candidate, "ambiguous", null, ["invalid_date"])
      : candidateResult(candidate, "normalized", normalized, []);
  }
  if (["external_id", "source_id"].includes(candidate.fieldName)) {
    const normalized = normalizeExternalIdCandidate(candidate);
    return normalized === null
      ? candidateResult(candidate, "ambiguous", null, ["invalid_external_id"])
      : candidateResult(candidate, "normalized", normalized, []);
  }
  return candidateResult(candidate, "not_applicable", null, []);
}

function normalizeSourceKind(value: string): string | null {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^[^a-z]+/u, "")
    .replace(/[._-]+$/u, "");
  return normalized.length === 0 || normalized.length > 128 || !SAFE_SOURCE_KIND.test(normalized)
    ? null
    : normalized;
}

function normalizeSourceUrl(raw: JobSourceNormalizationRawV1): string | null {
  if (raw.url === null || raw.url.length > JOB_CANDIDATE_NORMALIZATION_LIMITS.maxSourceUrlLength) {
    return null;
  }
  try {
    const parsed = new URL(raw.url);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.username !== "" ||
      parsed.password !== ""
    ) {
      return null;
    }
    const retained = new Set(raw.materialQueryParameters);
    const entries = [...parsed.searchParams.entries()]
      .filter(([key]) => retained.has(key))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey === rightKey
          ? leftValue.localeCompare(rightValue, "en-US")
          : leftKey.localeCompare(rightKey, "en-US"),
      );
    parsed.search = "";
    for (const [key, value] of entries) parsed.searchParams.append(key, value);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeSource(raw: JobSourceNormalizationRawV1): JobSourceNormalizationV1 {
  const warningCodes: JobNormalizationWarningCode[] = [];
  const canonicalUrl = raw.url === null ? null : normalizeSourceUrl(raw);
  if (raw.url !== null && canonicalUrl === null) warningCodes.push("invalid_source_url");
  const sourceKind = raw.sourceKind === null ? null : normalizeSourceKind(raw.sourceKind);
  if (raw.sourceKind !== null && sourceKind === null) warningCodes.push("invalid_source_kind");
  const externalId = raw.externalId === null ? null : normalizeExternalId(raw.externalId);
  if (raw.externalId !== null && externalId === null) warningCodes.push("invalid_external_id");
  const hasValue = canonicalUrl !== null || sourceKind !== null || externalId !== null;
  if (!hasValue) {
    return {
      specVersion: 1,
      raw,
      status: "ambiguous",
      value: null,
      warningCodes,
    };
  }
  return {
    specVersion: 1,
    raw,
    status: warningCodes.length === 0 ? "normalized" : "partial",
    value: { canonicalUrl, sourceKind, externalId },
    warningCodes,
  };
}

function parseInput(input: JobCandidateNormalizationInputV1): {
  readonly candidates: readonly FieldCandidateV1[];
  readonly source: JobSourceNormalizationRawV1 | null;
} {
  const untrusted = input as unknown;
  inspectJsonBoundary(untrusted);
  let serialized: string;
  try {
    serialized = JSON.stringify(untrusted);
  } catch {
    throw new JobCandidateNormalizationError("input_invalid");
  }
  if (
    new TextEncoder().encode(serialized).byteLength >
    JOB_CANDIDATE_NORMALIZATION_LIMITS.maxInputBytes
  ) {
    throw new JobCandidateNormalizationError("input_too_large");
  }
  if (
    !isPlainRecord(untrusted) ||
    !hasExactKeys(untrusted, INPUT_KEYS) ||
    untrusted["specVersion"] !== JOB_CANDIDATE_NORMALIZATION_SPEC_VERSION ||
    !Array.isArray(untrusted["candidates"])
  ) {
    throw new JobCandidateNormalizationError("input_invalid");
  }
  if (untrusted["candidates"].length > JOB_CANDIDATE_NORMALIZATION_LIMITS.maxCandidates) {
    throw new JobCandidateNormalizationError("candidate_limit_exceeded");
  }
  const candidates = untrusted["candidates"].map((candidate) => {
    const parsed = fieldCandidateV1Schema.safeParse(candidate);
    if (!parsed.success) throw new JobCandidateNormalizationError("input_invalid");
    return parsed.data;
  });
  if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) {
    throw new JobCandidateNormalizationError("candidate_duplicate");
  }

  const sourceInput = untrusted["source"];
  let source: JobSourceNormalizationRawV1 | null = null;
  if (sourceInput !== null) {
    if (!isPlainRecord(sourceInput) || !hasExactKeys(sourceInput, SOURCE_KEYS)) {
      throw new JobCandidateNormalizationError("input_invalid");
    }
    const url = sourceInput["url"];
    const sourceKind = sourceInput["sourceKind"];
    const externalId = sourceInput["externalId"];
    const materialQueryParameters = sourceInput["materialQueryParameters"];
    const queryParameters: readonly unknown[] = Array.isArray(materialQueryParameters)
      ? materialQueryParameters
      : [];
    if (
      (url !== null && typeof url !== "string") ||
      (sourceKind !== null && typeof sourceKind !== "string") ||
      (externalId !== null && typeof externalId !== "string") ||
      !Array.isArray(materialQueryParameters) ||
      queryParameters.length > JOB_CANDIDATE_NORMALIZATION_LIMITS.maxMaterialQueryParameters ||
      !queryParameters.every(
        (parameter) => typeof parameter === "string" && SAFE_QUERY_PARAMETER.test(parameter),
      ) ||
      new Set(queryParameters).size !== queryParameters.length ||
      (url === null && queryParameters.length > 0) ||
      (url === null && sourceKind === null && externalId === null)
    ) {
      throw new JobCandidateNormalizationError("input_invalid");
    }
    source = {
      url,
      sourceKind,
      externalId,
      materialQueryParameters: queryParameters.map((parameter) => {
        if (typeof parameter !== "string") {
          throw new JobCandidateNormalizationError("input_invalid");
        }
        return parameter;
      }),
    };
  }
  return { candidates, source };
}

export function normalizeJobCandidatesV1(
  input: JobCandidateNormalizationInputV1,
): JobNormalizationV1 {
  const parsed = parseInput(input);
  const candidates = parsed.candidates.map(normalizeCandidate);
  const summary = {
    inputCandidates: candidates.length,
    normalized: candidates.filter((candidate) => candidate.status === "normalized").length,
    partial: candidates.filter((candidate) => candidate.status === "partial").length,
    ambiguous: candidates.filter((candidate) => candidate.status === "ambiguous").length,
    notApplicable: candidates.filter((candidate) => candidate.status === "not_applicable").length,
  };
  const output = jobNormalizationV1Schema.safeParse({
    specVersion: JOB_CANDIDATE_NORMALIZATION_SPEC_VERSION,
    candidates,
    source: parsed.source === null ? null : normalizeSource(parsed.source),
    summary,
  });
  if (!output.success) throw new JobCandidateNormalizationError("contract_invalid");
  return deepFreeze(output.data);
}
