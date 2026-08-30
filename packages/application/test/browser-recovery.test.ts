import { describe, expect, it } from "vitest";

import {
  BROWSER_EXPORT_REMINDER_INTERVAL_DAYS,
  BROWSER_EXPORT_REMINDER_SNOOZE_DAYS,
  createDefaultBrowserExportReminderPreference,
  deriveBrowserExportReminder,
  deriveBrowserExportReminderFromPreference,
  parseBrowserExportReminderPreference,
  serializeBrowserExportReminderPreference,
  snoozeBrowserExportReminder,
  updateBrowserExportReminderPreference,
} from "../src/index.js";

const DAY = 24 * 60 * 60 * 1_000;
const NOW = Date.UTC(2026, 7, 29, 12);

describe("browser export reminder policy", () => {
  it("derives an optional recurring reminder without a streak or escalating urgency", () => {
    expect(deriveBrowserExportReminder({ enabled: true, nowUnixMs: NOW })).toEqual({
      reason: "never-exported",
      state: "due",
    });
    expect(
      deriveBrowserExportReminder({
        enabled: true,
        lastSuccessfulExportAtUnixMs: NOW - BROWSER_EXPORT_REMINDER_INTERVAL_DAYS * DAY,
        nowUnixMs: NOW,
      }),
    ).toEqual({ reason: "interval-elapsed", state: "due" });
    expect(
      deriveBrowserExportReminder({
        enabled: true,
        lastSuccessfulExportAtUnixMs: NOW - (BROWSER_EXPORT_REMINDER_INTERVAL_DAYS - 1) * DAY,
        nowUnixMs: NOW,
      }),
    ).toEqual({ nextReminderAtUnixMs: NOW + DAY, state: "scheduled" });
  });

  it("supports durable snooze, disable, enable, and successful-export transitions", () => {
    const initial = createDefaultBrowserExportReminderPreference();
    const snoozed = updateBrowserExportReminderPreference(initial, "snooze", NOW);
    expect(snoozed.snoozedUntilUnixMs).toBe(NOW + BROWSER_EXPORT_REMINDER_SNOOZE_DAYS * DAY);
    expect(deriveBrowserExportReminderFromPreference(snoozed, NOW).state).toBe("scheduled");

    const disabled = updateBrowserExportReminderPreference(snoozed, "disable", NOW);
    expect(deriveBrowserExportReminderFromPreference(disabled, NOW)).toEqual({ state: "off" });
    const enabled = updateBrowserExportReminderPreference(disabled, "enable", NOW);
    expect(deriveBrowserExportReminderFromPreference(enabled, NOW)).toEqual({
      reason: "never-exported",
      state: "due",
    });

    const exported = updateBrowserExportReminderPreference(enabled, "record-success", NOW);
    expect(deriveBrowserExportReminderFromPreference(exported, NOW)).toEqual({
      nextReminderAtUnixMs: NOW + BROWSER_EXPORT_REMINDER_INTERVAL_DAYS * DAY,
      state: "scheduled",
    });
  });

  it("strictly validates the versioned persisted preference", () => {
    const value = createDefaultBrowserExportReminderPreference();
    expect(parseBrowserExportReminderPreference(value)).toEqual(value);
    expect(serializeBrowserExportReminderPreference(value)).toEqual(value);
    expect(Object.isFrozen(serializeBrowserExportReminderPreference(value))).toBe(true);
    expect(Object.isFrozen(parseBrowserExportReminderPreference(value))).toBe(true);
    for (const invalid of [
      null,
      { ...value, version: 2 },
      { ...value, enabled: "yes" },
      { ...value, extra: true },
      { ...value, snoozedUntilUnixMs: -1 },
      { ...value, lastSuccessfulExportAtUnixMs: Number.NaN },
    ]) {
      expect(() => parseBrowserExportReminderPreference(invalid)).toThrow(TypeError);
    }
  });

  it("rejects invalid clocks and future successful-export evidence", () => {
    expect(() => snoozeBrowserExportReminder(-1)).toThrow(TypeError);
    expect(() =>
      deriveBrowserExportReminder({
        enabled: true,
        lastSuccessfulExportAtUnixMs: NOW + 1,
        nowUnixMs: NOW,
      }),
    ).toThrow(TypeError);
  });
});
