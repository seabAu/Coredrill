import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  appendVaultExportObservation,
  createReadVaultExportVerificationsQuery,
  createRecordVaultExportVerificationCommand,
  createUpdateVaultExportReminderCommand,
  emptyVaultExportVerificationHistory,
  parseVaultExportObservation,
  parseVaultExportVerificationHistory,
  serializeVaultExportVerificationHistory,
  type VaultExportObservation,
  type VaultExportVerificationPort,
} from "../src/vault-export-verification.js";
import {
  createDefaultBrowserExportReminderPreference,
  updateBrowserExportReminderPreference,
} from "../src/browser-recovery.js";

const vaultId = "0198e102-0000-7000-8000-000000000001";
const archiveId = "0198e102-0000-7000-8000-000000000002";
const context = {
  operationId: entityId("application-operation", archiveId),
  initiatedAt: instant("2026-10-21T10:00:00.000Z"),
};
const observation = (index = 1): VaultExportObservation => ({
  archiveId,
  archiveCreatedAt: "2026-10-21T08:00:00.000Z",
  schemaVersion: 160,
  byteLength: 1024,
  sha256: "a".repeat(64),
  verifiedAt: new Date(Date.parse("2026-10-21T09:00:00.000Z") + index * 1000).toISOString(),
  method: "selected_local_copy",
});
const view = () => ({
  history: emptyVaultExportVerificationHistory(vaultId),
  reminder: createDefaultBrowserExportReminderPreference(),
});
const port = (): VaultExportVerificationPort => ({
  read: vi.fn(async () => view()),
  record: vi.fn(async ({ observation: item }) => ({
    ...view(),
    history: appendVaultExportObservation(view().history, item),
  })),
  updateReminder: vi.fn(async () => view()),
});

describe("bounded path-free vault export observations", () => {
  it("copies and deeply freezes parsed records and canonical round trips", () => {
    const original = observation();
    const parsed = parseVaultExportObservation(original);
    expect(parsed).toEqual(original);
    expect(parsed).not.toBe(original);
    expect(Object.isFrozen(parsed)).toBe(true);
    const history = appendVaultExportObservation(view().history, original);
    expect(
      parseVaultExportVerificationHistory(serializeVaultExportVerificationHistory(history)),
    ).toEqual(history);
    expect(Object.isFrozen(history.observations)).toBe(true);
  });

  it.each([
    { path: "PRIVATE_PATH" },
    { method: "download_handoff" },
    { schemaVersion: 0 },
    { schemaVersion: 0x1_0000_0000 },
    { byteLength: 21 },
    { byteLength: 544 * 1024 * 1024 + 1 },
    { byteLength: Number.NaN },
    { sha256: "A".repeat(64) },
    { archiveId: "foreign" },
    { verifiedAt: "2026-10-21T07:00:00.000Z" },
    { archiveCreatedAt: "1969-12-31T23:00:00.000Z" },
  ])("rejects malformed or unreviewed observation fields: %j", (change) => {
    expect(() => parseVaultExportObservation({ ...observation(), ...change })).toThrow();
  });

  it("keeps only the latest 20, sorted deterministically, rejecting older insertion", () => {
    let history = view().history;
    for (let index = 1; index <= 21; index += 1)
      history = appendVaultExportObservation(history, observation(index));
    expect(history.observations).toHaveLength(20);
    expect(history.observations[0]).toEqual(observation(21));
    expect(history.observations.at(-1)).toEqual(observation(2));
    expect(() => appendVaultExportObservation(history, observation(1))).toThrow();
    expect(() =>
      parseVaultExportVerificationHistory({
        ...history,
        observations: [...history.observations].reverse(),
      }),
    ).toThrow();
    expect(() =>
      parseVaultExportVerificationHistory({
        ...history,
        observations: [...history.observations, observation(1)],
      }),
    ).toThrow();
  });

  it("duplicate retry returns owned frozen canonical data, not mutable caller input", () => {
    const item = observation();
    const mutable = { version: 1 as const, vaultId, observations: [{ ...item }] };
    const repeated = appendVaultExportObservation(mutable, item);
    expect(repeated).toEqual(mutable);
    expect(repeated).not.toBe(mutable);
    expect(Object.isFrozen(repeated)).toBe(true);
    expect(Object.isFrozen(repeated.observations)).toBe(true);
    const editable = mutable.observations[0];
    if (editable === undefined) throw new Error("Missing synthetic observation");
    editable.sha256 = "b".repeat(64);
    expect(repeated.observations[0]?.sha256).toBe(item.sha256);
  });

  it("rejects conflicting archive identity and duplicate persisted observations", () => {
    const history = appendVaultExportObservation(view().history, observation());
    for (const change of [
      { sha256: "b".repeat(64) },
      { byteLength: 1025 },
      { schemaVersion: 159 },
      { archiveCreatedAt: "2026-10-21T07:00:00.000Z" },
    ])
      expect(() =>
        appendVaultExportObservation(history, { ...observation(2), ...change }),
      ).toThrow();
    expect(() =>
      parseVaultExportVerificationHistory({
        ...history,
        observations: [observation(), observation()],
      }),
    ).toThrow();
    expect(() => parseVaultExportVerificationHistory({ ...history, version: 2 })).toThrow();
    expect(() => parseVaultExportVerificationHistory({ ...history, extra: true })).toThrow();
  });

  it("successful verification preserves an explicitly disabled reminder", () => {
    const disabled = updateBrowserExportReminderPreference(view().reminder, "disable", 1000);
    const recorded = updateBrowserExportReminderPreference(disabled, "record-success", 2000);
    expect(recorded).toMatchObject({ enabled: false, lastSuccessfulExportAtUnixMs: 2000 });
  });
});

describe("original-vault-bound export observation operations", () => {
  it("captures immutable input before await and requires exact returned evidence", async () => {
    const adapter = port();
    const input = { vaultId, observation: { ...observation() } };
    const expected = observation();
    const pending = createRecordVaultExportVerificationCommand(adapter).execute(input, context);
    input.vaultId = archiveId;
    input.observation.sha256 = "b".repeat(64);
    expect(await pending).toMatchObject({
      ok: true,
      value: { history: { vaultId, observations: [expected] } },
    });
    expect(adapter.record).toHaveBeenCalledWith({
      vaultId,
      observation: expected,
      recordedAt: context.initiatedAt,
    });
  });

  it("rejects future evidence and invalid intents without invoking ports", async () => {
    const adapter = port();
    const future = { ...observation(), verifiedAt: "2026-10-21T11:00:00.000Z" };
    expect(
      await createRecordVaultExportVerificationCommand(adapter).execute(
        { vaultId, observation: future },
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(
      await createReadVaultExportVerificationsQuery(adapter).execute(
        { vaultId: "invalid" },
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(
      await createUpdateVaultExportReminderCommand(adapter).execute(
        { vaultId, action: "record-success" as "enable" },
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(adapter.record).not.toHaveBeenCalled();
    expect(adapter.read).not.toHaveBeenCalled();
    expect(adapter.updateReminder).not.toHaveBeenCalled();
  });

  it("rejects foreign views, omitted acknowledgements and private adapter errors", async () => {
    const adapter = port();
    adapter.read = async () => ({
      ...view(),
      history: emptyVaultExportVerificationHistory(archiveId),
    });
    expect(
      await createReadVaultExportVerificationsQuery(adapter).execute({ vaultId }, context),
    ).toMatchObject({ ok: false, error: { code: "conflict" } });
    adapter.record = async () => view();
    expect(
      await createRecordVaultExportVerificationCommand(adapter).execute(
        { vaultId, observation: observation() },
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: "unavailable" } });
    adapter.updateReminder = async () => {
      throw new Error("PRIVATE_PATH_SQL_CONTENT");
    };
    const result = await createUpdateVaultExportReminderCommand(adapter).execute(
      { vaultId, action: "disable" },
      context,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: false } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_PATH_SQL_CONTENT");
  });
});
