import type { JsonValue } from "@coredrill/contracts";

export const BROWSER_EXPORT_REMINDER_INTERVAL_DAYS = 30 as const;
export const BROWSER_EXPORT_REMINDER_SNOOZE_DAYS = 7 as const;
export const BROWSER_EXPORT_REMINDER_SETTING_KEY = "browser-export-reminder-v1" as const;
export const BROWSER_EXPORT_REMINDER_PREFERENCE_VERSION = 1 as const;

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;
const EXPORT_REMINDER_INTERVAL_MS = BROWSER_EXPORT_REMINDER_INTERVAL_DAYS * DAY_IN_MILLISECONDS;

export type BrowserExportReminder =
  | {
      readonly reason: "interval-elapsed" | "never-exported";
      readonly state: "due";
    }
  | {
      readonly nextReminderAtUnixMs: number;
      readonly state: "scheduled";
    }
  | {
      readonly state: "off";
    };

export interface BrowserExportReminderInput {
  readonly enabled: boolean;
  readonly lastSuccessfulExportAtUnixMs?: number;
  readonly nowUnixMs: number;
  readonly snoozedUntilUnixMs?: number;
}

export interface BrowserExportReminderPreferenceV1 {
  readonly enabled: boolean;
  readonly lastSuccessfulExportAtUnixMs: number | null;
  readonly snoozedUntilUnixMs: number | null;
  readonly version: typeof BROWSER_EXPORT_REMINDER_PREFERENCE_VERSION;
}

export type BrowserExportReminderPreferenceAction =
  "disable" | "enable" | "record-success" | "snooze";

const requireUnixMilliseconds = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be nonnegative Unix milliseconds.`);
  }
  return value;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const requireNullableUnixMilliseconds = (value: unknown, label: string): number | null => {
  if (value === null) return null;
  if (typeof value !== "number") throw new TypeError(`${label} is invalid.`);
  return requireUnixMilliseconds(value, label);
};

export const createDefaultBrowserExportReminderPreference = (): BrowserExportReminderPreferenceV1 =>
  Object.freeze({
    enabled: true,
    lastSuccessfulExportAtUnixMs: null,
    snoozedUntilUnixMs: null,
    version: BROWSER_EXPORT_REMINDER_PREFERENCE_VERSION,
  });

export const parseBrowserExportReminderPreference = (
  value: unknown,
): BrowserExportReminderPreferenceV1 => {
  if (!isRecord(value)) throw new TypeError("Browser export reminder preference is invalid.");
  const keys = Object.keys(value).sort();
  if (
    keys.join("|") !== "enabled|lastSuccessfulExportAtUnixMs|snoozedUntilUnixMs|version" ||
    value["version"] !== BROWSER_EXPORT_REMINDER_PREFERENCE_VERSION ||
    typeof value["enabled"] !== "boolean"
  ) {
    throw new TypeError("Browser export reminder preference is invalid.");
  }
  return Object.freeze({
    enabled: value["enabled"],
    lastSuccessfulExportAtUnixMs: requireNullableUnixMilliseconds(
      value["lastSuccessfulExportAtUnixMs"],
      "Last successful export",
    ),
    snoozedUntilUnixMs: requireNullableUnixMilliseconds(
      value["snoozedUntilUnixMs"],
      "Reminder snooze",
    ),
    version: BROWSER_EXPORT_REMINDER_PREFERENCE_VERSION,
  });
};

export const serializeBrowserExportReminderPreference = (
  preference: BrowserExportReminderPreferenceV1,
): JsonValue => {
  const parsed = parseBrowserExportReminderPreference(preference);
  return Object.freeze({
    enabled: parsed.enabled,
    lastSuccessfulExportAtUnixMs: parsed.lastSuccessfulExportAtUnixMs,
    snoozedUntilUnixMs: parsed.snoozedUntilUnixMs,
    version: parsed.version,
  });
};

export const deriveBrowserExportReminder = (
  input: BrowserExportReminderInput,
): BrowserExportReminder => {
  const now = requireUnixMilliseconds(input.nowUnixMs, "Reminder clock");
  if (!input.enabled) return Object.freeze({ state: "off" });

  if (input.snoozedUntilUnixMs !== undefined) {
    const snoozedUntil = requireUnixMilliseconds(input.snoozedUntilUnixMs, "Reminder snooze");
    if (snoozedUntil > now) {
      return Object.freeze({ nextReminderAtUnixMs: snoozedUntil, state: "scheduled" });
    }
  }

  if (input.lastSuccessfulExportAtUnixMs === undefined) {
    return Object.freeze({ reason: "never-exported", state: "due" });
  }

  const lastSuccessfulExport = requireUnixMilliseconds(
    input.lastSuccessfulExportAtUnixMs,
    "Last successful export",
  );
  if (lastSuccessfulExport > now) {
    throw new TypeError("Last successful export cannot be in the future.");
  }
  const nextReminderAtUnixMs = lastSuccessfulExport + EXPORT_REMINDER_INTERVAL_MS;
  return nextReminderAtUnixMs <= now
    ? Object.freeze({ reason: "interval-elapsed", state: "due" })
    : Object.freeze({ nextReminderAtUnixMs, state: "scheduled" });
};

export const deriveBrowserExportReminderFromPreference = (
  preference: BrowserExportReminderPreferenceV1,
  nowUnixMs: number,
): BrowserExportReminder =>
  deriveBrowserExportReminder({
    enabled: preference.enabled,
    ...(preference.lastSuccessfulExportAtUnixMs === null
      ? {}
      : { lastSuccessfulExportAtUnixMs: preference.lastSuccessfulExportAtUnixMs }),
    nowUnixMs,
    ...(preference.snoozedUntilUnixMs === null
      ? {}
      : { snoozedUntilUnixMs: preference.snoozedUntilUnixMs }),
  });

export const snoozeBrowserExportReminder = (nowUnixMs: number): number =>
  requireUnixMilliseconds(nowUnixMs, "Reminder clock") +
  BROWSER_EXPORT_REMINDER_SNOOZE_DAYS * DAY_IN_MILLISECONDS;

export const updateBrowserExportReminderPreference = (
  preference: BrowserExportReminderPreferenceV1,
  action: BrowserExportReminderPreferenceAction,
  nowUnixMs: number,
): BrowserExportReminderPreferenceV1 => {
  const current = parseBrowserExportReminderPreference(preference);
  const now = requireUnixMilliseconds(nowUnixMs, "Reminder clock");
  switch (action) {
    case "disable":
      return Object.freeze({ ...current, enabled: false, snoozedUntilUnixMs: null });
    case "enable":
      return Object.freeze({ ...current, enabled: true, snoozedUntilUnixMs: null });
    case "record-success":
      return Object.freeze({
        ...current,
        enabled: true,
        lastSuccessfulExportAtUnixMs: now,
        snoozedUntilUnixMs: null,
      });
    case "snooze":
      return Object.freeze({
        ...current,
        enabled: true,
        snoozedUntilUnixMs: snoozeBrowserExportReminder(now),
      });
  }
};
