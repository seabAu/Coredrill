import { createHash } from "node:crypto";
import { TextEncoder } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { writePortableArchiveV1 } from "../../packages/storage-core/dist/index.js";
import { createStoredVaultRestoreApi } from "../../apps/web/src/stored-vault-restore.ts";

const candidate = "0198e102-0000-7000-8000-000000000001";
const original = "0198e102-0000-7000-8000-000000000002";
const archiveId = "0198e102-0000-7000-8000-000000000003";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const setup = async (viewed = null) => {
  const bytes = new TextEncoder().encode("SQLite format 3\u0000synthetic restore fixture");
  const archive = await writePortableArchiveV1({
    archiveId,
    createdAt: "2026-10-21T05:00:00.000Z",
    createdByVersion: "0.0.0",
    vault: {
      id: candidate,
      schemaVersion: 160,
      migrationHistory: [
        {
          version: 160,
          name: "synthetic",
          appliedAt: "2026-10-21T04:00:00.000Z",
          sha256: "a".repeat(64),
        },
      ],
    },
    database: { bytes, byteLength: bytes.length, schemaVersion: 160, sha256: hash(bytes) },
    dataFiles: [],
    attachments: [],
    readAttachment: async () => undefined,
  });
  let target =
    viewed === null
      ? { state: "empty", fingerprint: "empty", attachmentContentIds: [] }
      : {
          state: "present",
          fingerprint: "b".repeat(64),
          vaultId: viewed,
          schemaVersion: 160,
          databaseSha256: "c".repeat(64),
          attachmentContentIds: [],
        };
  // Fixture-only storage port: this suite proves real ZIP/coordinator/composition behavior, not SQLite integrity.
  const port = {
    inspectTarget: vi.fn(async () => target),
    inspectDatabase: vi.fn(async () => ({
      integrity: "ok",
      schemaVersion: 160,
      vaultId: candidate,
    })),
    commit: vi.fn(async (payload) => {
      target = {
        state: "present",
        fingerprint: "d".repeat(64),
        vaultId: payload.vaultId,
        schemaVersion: payload.database.schemaVersion,
        databaseSha256: payload.database.sha256,
        attachmentContentIds: [],
      };
    }),
  };
  const factory = vi.fn(async () => port);
  let sequence = 0;
  const api = createStoredVaultRestoreApi({
    expectedSchemaVersion: async () => 160,
    port: factory,
    context: () => ({
      operationId: `0198e102-0000-7000-8000-${(++sequence).toString(16).padStart(12, "0")}`,
      initiatedAt: "2026-10-21T06:00:00.000Z",
    }),
  });
  return {
    api,
    port,
    archive,
    factory,
    target: () => target,
    changeTarget: (value) => {
      target = value;
    },
  };
};
const preview = async (fixture, viewedVaultId = null) => {
  const result = await fixture.api.preview({ viewedVaultId, bytes: fixture.archive.bytes });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Fixture preview failed");
  return result.value;
};

describe("normal selected-runtime restore capability", () => {
  it("inspects a private owned archive without committing, then requires explicit exact confirmation", async () => {
    const fixture = await setup();
    const value = await preview(fixture);
    expect(value).toMatchObject({
      version: 1,
      conflict: "none",
      requiredConfirmation: "commit",
      archive: { sha256: fixture.archive.sha256, vaultId: candidate },
    });
    expect(fixture.factory).toHaveBeenCalledWith(candidate);
    expect(fixture.port.commit).not.toHaveBeenCalled();
    expect(fixture.target().state).toBe("empty");
    fixture.archive.bytes.fill(0);
    expect(
      await fixture.api.commit({ preview: value, confirmation: "replace_same_vault" }),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(fixture.port.commit).not.toHaveBeenCalled();
    expect(await fixture.api.commit({ preview: value, confirmation: "commit" })).toMatchObject({
      ok: true,
      value: { committed: true, archiveSha256: value.archive.sha256, vaultId: candidate },
    });
    expect(fixture.port.commit).toHaveBeenCalledTimes(1);
    expect(await fixture.api.commit({ preview: value, confirmation: "commit" })).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
  });

  it("binds the viewed target independently from a different candidate vault", async () => {
    const fixture = await setup(original);
    const refused = await fixture.api.preview({
      viewedVaultId: candidate,
      bytes: fixture.archive.bytes,
    });
    expect(refused).toMatchObject({ ok: false });
    expect(fixture.port.commit).not.toHaveBeenCalled();
    const value = await preview(fixture, original);
    expect(value).toMatchObject({
      viewedVaultId: original,
      target: { vaultId: original },
      conflict: "different_vault_replace",
      requiredConfirmation: "replace_different_vault",
    });
    expect(await fixture.api.commit({ preview: value, confirmation: "commit" })).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(
      await fixture.api.commit({ preview: value, confirmation: value.requiredConfirmation }),
    ).toMatchObject({ ok: true, value: { vaultId: candidate } });
  });

  it("rejects drift, forged metadata, retired capabilities and deterministic-identity replay", async () => {
    const fixture = await setup();
    const first = await preview(fixture);
    expect(
      await fixture.api.commit({
        preview: { ...first, archive: { ...first.archive, createdByVersion: "other" } },
        confirmation: "commit",
      }),
    ).toMatchObject({ ok: false });
    expect(fixture.port.commit).not.toHaveBeenCalled();
    expect(
      await fixture.api.discard({ previewId: first.previewId, viewedVaultId: original }),
    ).toMatchObject({ ok: false });
    expect(
      await fixture.api.discard({ previewId: first.previewId, viewedVaultId: null }),
    ).toMatchObject({ ok: true });
    const second = await preview(fixture);
    expect(second.previewId).not.toBe(first.previewId);
    expect(second.archive).toEqual(first.archive);
    expect(await fixture.api.commit({ preview: first, confirmation: "commit" })).toMatchObject({
      ok: false,
    });
    fixture.changeTarget({
      state: "present",
      fingerprint: "e".repeat(64),
      vaultId: original,
      schemaVersion: 160,
      databaseSha256: "f".repeat(64),
      attachmentContentIds: [],
    });
    expect(await fixture.api.commit({ preview: second, confirmation: "commit" })).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    expect(fixture.port.commit).not.toHaveBeenCalled();
  });

  it("rejects malformed and unsupported archives before opening selected storage", async () => {
    const fixture = await setup();
    expect(
      await fixture.api.preview({ viewedVaultId: null, bytes: new Uint8Array(40) }),
    ).toMatchObject({ ok: false });
    expect(fixture.factory).not.toHaveBeenCalled();
    const api = createStoredVaultRestoreApi({
      expectedSchemaVersion: async () => 159,
      port: fixture.factory,
      context: () => ({ operationId: archiveId, initiatedAt: "2026-10-21T06:00:00.000Z" }),
    });
    const result = await api.preview({ viewedVaultId: null, bytes: fixture.archive.bytes });
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).toContain("compatible Coredrill build");
    expect(fixture.factory).not.toHaveBeenCalled();
  });

  it("keeps uncertain commits distinct, consumes the capability and never retries automatically", async () => {
    const fixture = await setup();
    const value = await preview(fixture);
    fixture.port.commit.mockRejectedValue(new Error("PRIVATE_PATH private archive content"));
    const result = await fixture.api.commit({ preview: value, confirmation: "commit" });
    expect(result).toMatchObject({ ok: false, error: { retryable: false } });
    expect(JSON.stringify(result)).toContain("may have changed");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_PATH");
    await fixture.api.commit({ preview: value, confirmation: "commit" });
    expect(fixture.port.commit).toHaveBeenCalledTimes(1);
    expect(fixture.target().state).toBe("empty");
  });

  it("holds one preview/commit operation and never discards a pending commit", async () => {
    const fixture = await setup();
    const held = deferred();
    fixture.port.inspectDatabase.mockImplementation(async () => {
      await held.promise;
      return { integrity: "ok", schemaVersion: 160, vaultId: candidate };
    });
    const preparing = fixture.api.preview({ viewedVaultId: null, bytes: fixture.archive.bytes });
    await vi.waitFor(() => expect(fixture.port.inspectDatabase).toHaveBeenCalledTimes(1));
    expect(
      await fixture.api.preview({ viewedVaultId: null, bytes: fixture.archive.bytes }),
    ).toMatchObject({ ok: false });
    held.resolve();
    const result = await preparing;
    expect(result.ok).toBe(true);
    const value = result.value;
    const committingGate = deferred();
    fixture.port.commit.mockImplementation(async () => committingGate.promise);
    const committing = fixture.api.commit({ preview: value, confirmation: "commit" });
    await vi.waitFor(() => expect(fixture.port.commit).toHaveBeenCalledTimes(1));
    expect(
      await fixture.api.discard({ previewId: value.previewId, viewedVaultId: null }),
    ).toMatchObject({ ok: false });
    expect(await fixture.api.commit({ preview: value, confirmation: "commit" })).toMatchObject({
      ok: false,
    });
    committingGate.resolve();
    expect(await committing).toMatchObject({ ok: true });
  });
});
