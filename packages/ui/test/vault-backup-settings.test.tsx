import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  BROWSER_EXPORT_REMINDER_INTERVAL_DAYS,
  BROWSER_EXPORT_REMINDER_SNOOZE_DAYS,
  BrowserVaultBackupSettings,
  deriveBrowserExportReminder,
  snoozeBrowserExportReminder,
  type BrowserVaultBackupModel,
} from "../src/index.js";

const DAY = 24 * 60 * 60 * 1_000;
const NOW = Date.UTC(2026, 7, 29, 12);

const model = (overrides: Partial<BrowserVaultBackupModel> = {}): BrowserVaultBackupModel => ({
  expectedDatabase: "found",
  origin: "https://app.coredrill.test",
  persistence: "granted",
  quota: "available",
  remainingBytes: 512 * 1024 * 1024,
  reminder: { reason: "never-exported", state: "due" },
  ...overrides,
});

const renderSettings = (value: BrowserVaultBackupModel): string =>
  renderToStaticMarkup(createElement(BrowserVaultBackupSettings, { model: value }));

describe("browser vault backup settings", () => {
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
    expect(deriveBrowserExportReminder({ enabled: false, nowUnixMs: NOW })).toEqual({
      state: "off",
    });
  });

  it("supports a bounded remind-later choice and rejects invalid clocks", () => {
    const snoozedUntil = snoozeBrowserExportReminder(NOW);
    expect(snoozedUntil).toBe(NOW + BROWSER_EXPORT_REMINDER_SNOOZE_DAYS * DAY);
    expect(
      deriveBrowserExportReminder({
        enabled: true,
        nowUnixMs: NOW,
        snoozedUntilUnixMs: snoozedUntil,
      }),
    ).toEqual({ nextReminderAtUnixMs: snoozedUntil, state: "scheduled" });
    expect(() => deriveBrowserExportReminder({ enabled: true, nowUnixMs: -1 })).toThrow(TypeError);
    expect(() =>
      deriveBrowserExportReminder({
        enabled: true,
        lastSuccessfulExportAtUnixMs: NOW + 1,
        nowUnixMs: NOW,
      }),
    ).toThrow(TypeError);
  });

  it("labels granted persistence and available quota without overstating device protection", () => {
    const markup = renderSettings(model());
    expect(markup).toContain("Persistent storage granted");
    expect(markup).toContain("Storage space available");
    expect(markup).toContain("512 MB remains");
    expect(markup).toContain("Stored for this exact origin");
    expect(markup).not.toContain("encrypted");
    expect(markup).not.toContain("private mode");
  });

  it.each([
    ["denied", "Best-effort browser storage"],
    ["error", "Persistence status unavailable"],
    ["unsupported", "Persistent storage unsupported"],
  ] as const)("renders honest %s persistence guidance", (persistence, label) => {
    const markup = renderSettings(model({ persistence }));
    expect(markup).toContain(label);
    expect(markup).toContain("Export portable archive");
    expect(markup).toContain("Review restore options");
    expect(markup).not.toContain("data loss is imminent");
  });

  it("renders low/unknown quota and expected-database recovery states explicitly", () => {
    const low = renderSettings(model({ quota: "low" }));
    const unknown = renderSettings(model({ quota: "unknown" }));
    const missing = renderSettings(model({ expectedDatabase: "missing" }));
    expect(low).toContain("Storage space is low");
    expect(unknown).toContain("Storage estimate unavailable");
    expect(missing).toContain("Expected vault database not found");
    expect(missing).toContain("same browser profile and origin");
  });

  it("lets users snooze or disable due reminders and re-enable an off reminder", () => {
    const due = renderSettings(model());
    const off = renderSettings(model({ reminder: { state: "off" } }));
    expect(due).toContain("Remind me later");
    expect(due).toContain("Turn off reminders");
    expect(due).toContain("will keep working if you choose to do this later");
    expect(off).toContain("Turn on reminders");
    expect(off).not.toContain("Remind me later");
  });
});
