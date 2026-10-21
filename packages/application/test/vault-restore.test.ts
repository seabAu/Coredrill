import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  createVaultRestoreOperations,
  parseVaultRestorePreviewDto,
  type PreviewVaultRestoreInput,
  type VaultRestorePreviewDto,
} from "../src/vault-restore.js";

const vaultId = "0198e102-0000-7000-8000-000000000001";
const previewId = "0198e102-0000-7000-8000-000000000002";
const other = "0198e102-0000-7000-8000-000000000003";
const context = {
  operationId: entityId("application-operation", previewId),
  initiatedAt: instant("2026-10-21T06:00:00.000Z"),
};
const summary = (): VaultRestorePreviewDto => ({
  version: 1,
  previewId,
  viewedVaultId: null,
  archive: {
    sha256: "a".repeat(64),
    databaseSha256: "b".repeat(64),
    byteLength: 40,
    createdAt: "2026-10-21T05:00:00.000Z",
    createdByVersion: "0.0.0",
    vaultId,
    schemaVersion: 160,
    dataFileCount: 2,
    attachmentCount: 1,
  },
  target: {
    state: "empty",
    fingerprint: "empty",
    vaultId: null,
    schemaVersion: null,
    attachmentCount: 0,
  },
  conflict: "none",
  requiredConfirmation: "commit",
  changes: { database: "create", attachmentsAdded: 1, attachmentsReused: 0, attachmentsRemoved: 0 },
});
const setup = () => {
  const port = {
    preview: vi.fn(async (input: PreviewVaultRestoreInput & { readonly previewId: string }) => ({
      ...summary(),
      previewId: input.previewId,
    })),
    commit: vi.fn(async () => ({
      version: 1,
      previewId,
      committed: true,
      archiveSha256: "a".repeat(64),
      vaultId,
      schemaVersion: 160,
      databaseSha256: "b".repeat(64),
      attachmentCount: 1,
    })),
    discard: vi.fn(async () => undefined),
  };
  return { port, operations: createVaultRestoreOperations(port) };
};

describe("validated normal vault restore boundary", () => {
  it("rebuilds a deeply frozen path/byte-free versioned preview", () => {
    const raw = summary();
    const parsed = parseVaultRestorePreviewDto(raw);
    expect(parsed).toEqual(raw);
    expect(parsed).not.toBe(raw);
    expect(parsed.archive).not.toBe(raw.archive);
    for (const item of [parsed, parsed.archive, parsed.target, parsed.changes])
      expect(Object.isFrozen(item)).toBe(true);
    expect(JSON.stringify(parsed)).not.toContain("bytes");
  });

  it("rejects incoherent, foreign, unversioned and path-bearing preview shapes", () => {
    const valid = summary();
    for (const raw of [
      { ...valid, version: 2 },
      { ...valid, path: "PRIVATE_PATH" },
      { ...valid, previewId: "../other" },
      { ...valid, viewedVaultId: vaultId },
      { ...valid, archive: { ...valid.archive, bytes: [1] } },
      { ...valid, archive: { ...valid.archive, byteLength: 0 } },
      { ...valid, archive: { ...valid.archive, createdAt: "2026-10-21T05:00:00Z" } },
      { ...valid, target: { ...valid.target, schemaVersion: 160 } },
      { ...valid, target: { ...valid.target, attachmentCount: 1 } },
      { ...valid, changes: { ...valid.changes, attachmentsReused: 1 } },
      { ...valid, changes: { ...valid.changes, database: "unchanged" } },
      { ...valid, requiredConfirmation: "replace_same_vault" },
    ])
      expect(() => parseVaultRestorePreviewDto(raw)).toThrow();
  });

  it("validates intent before any port call and captures original bytes and owner", async () => {
    const { port, operations } = setup();
    for (const bad of [
      { viewedVaultId: null, bytes: [1] },
      { viewedVaultId: "../private", bytes: new Uint8Array(40) },
      { viewedVaultId: null, bytes: new Uint8Array(21) },
      { viewedVaultId: null, bytes: new Uint8Array(40), path: "PRIVATE_PATH" },
    ]) {
      expect(
        await operations.preview.execute(
          bad as unknown as Parameters<typeof operations.preview.execute>[0],
          context,
        ),
      ).toMatchObject({ ok: false, error: { code: "validation" } });
    }
    expect(port.preview).not.toHaveBeenCalled();
    const bytes = new Uint8Array(40).fill(7);
    const pending = operations.preview.execute({ bytes, viewedVaultId: null }, context);
    bytes.fill(0);
    const result = await pending;
    expect(result).toMatchObject({ ok: true, value: { previewId } });
    const passed = port.preview.mock.calls[0]?.[0] as unknown as {
      bytes: Uint8Array;
      viewedVaultId: string | null;
    };
    expect(passed.bytes).not.toBe(bytes);
    expect([...passed.bytes]).toEqual(new Array(40).fill(7));
    expect(passed.viewedVaultId).toBeNull();
  });

  it("retires the original capability after malformed or miscorrelated preview acknowledgement", async () => {
    const { port, operations } = setup();
    port.preview.mockResolvedValue({ ...summary(), previewId: other });
    expect(
      await operations.preview.execute({ viewedVaultId: null, bytes: new Uint8Array(40) }, context),
    ).toMatchObject({ ok: false });
    expect(port.discard).toHaveBeenCalledWith({ previewId, viewedVaultId: null });
    expect(port.commit).not.toHaveBeenCalled();
  });

  it("requires exact confirmation before commit and checks the acknowledged archive tuple", async () => {
    const { port, operations } = setup();
    expect(
      await operations.commit.execute(
        { preview: summary(), confirmation: "replace_same_vault" },
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(port.commit).not.toHaveBeenCalled();
    expect(
      await operations.commit.execute({ preview: summary(), confirmation: "commit" }, context),
    ).toMatchObject({
      ok: true,
      value: { committed: true, archiveSha256: "a".repeat(64), vaultId },
    });
    port.commit.mockResolvedValue({
      version: 1,
      previewId,
      committed: true,
      archiveSha256: "a".repeat(64),
      vaultId: other,
      schemaVersion: 160,
      databaseSha256: "b".repeat(64),
      attachmentCount: 1,
    });
    const uncertain = await operations.commit.execute(
      { preview: summary(), confirmation: "commit" },
      context,
    );
    expect(uncertain).toMatchObject({ ok: false, error: { retryable: false } });
    if (uncertain.ok) throw new Error("Expected uncertain acknowledgement");
    expect(uncertain.error.message).toContain("may have changed");
    expect(uncertain.error.message).not.toContain("unchanged");
  });

  it("redacts private commit failures and validates discard ownership", async () => {
    const { port, operations } = setup();
    port.commit.mockRejectedValue(new Error("PRIVATE_PATH private archive contents"));
    const result = await operations.commit.execute(
      { preview: summary(), confirmation: "commit" },
      context,
    );
    expect(JSON.stringify(result)).not.toContain("PRIVATE_PATH");
    expect(
      await operations.discard.execute({ previewId, viewedVaultId: "../path" }, context),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(port.discard).not.toHaveBeenCalled();
    expect(await operations.discard.execute({ previewId, viewedVaultId: null }, context)).toEqual({
      ok: true,
      value: { discarded: true },
    });
    expect(port.discard).toHaveBeenCalledWith({ previewId, viewedVaultId: null });
  });
  it("does not claim success for a different database digest in an otherwise correlated acknowledgement", async () => {
    const { port, operations } = setup();
    const reply = await port.commit();
    port.commit.mockResolvedValue({ ...reply, databaseSha256: "c".repeat(64) });
    const result = await operations.commit.execute(
      { preview: summary(), confirmation: "commit" },
      context,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: false } });
    if (result.ok) throw new Error("Expected uncertain acknowledgement");
    expect(result.error.message).toContain("may have changed");
  });
});
