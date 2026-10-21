import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createVaultExportSession } from "../../apps/web/src/vault-export-session.ts";

const vaultId = "0198e102-0000-7000-8000-000000000001";
const archiveId = "0198e102-0000-7000-8000-000000000002";
const verifiedAt = "2026-10-21T10:00:00.000Z";
const bytes = new Uint8Array(32).fill(65);
const artifact = () => ({
  state: "prepared_not_saved",
  vaultId,
  archiveId,
  createdAt: "2026-10-21T08:00:00.000Z",
  schemaVersion: 160,
  fileName: "synthetic.coredrill.zip",
  mediaType: "application/zip",
  encryptionMode: "none",
  byteLength: bytes.length,
  bytes: bytes.slice(),
  sha256: createHash("sha256").update(bytes).digest("hex"),
  dataFileCount: 114,
  attachmentCount: 0,
});
const acknowledge = (input) => ({
  status: "saved_verified",
  vaultId,
  archiveId,
  byteLength: input.byteLength,
  sha256: input.sha256,
});
const view = (input) => ({
  ok: true,
  value: {
    history: { version: 1, vaultId, observations: [input.observation] },
    reminder: {
      version: 1,
      enabled: true,
      lastSuccessfulExportAtUnixMs: Date.parse(input.observation.verifiedAt),
      snoozedUntilUnixMs: null,
    },
  },
});
const setup = async (saveResult = "download_handoff") => {
  const prepare = vi.fn(async () => ({ ok: true, value: artifact() }));
  const save = vi.fn(async (input) =>
    saveResult === "native" ? acknowledge(input) : { status: saveResult },
  );
  const recordVerification = vi.fn(async (input) => view(input));
  const now = vi.fn(() => verifiedAt);
  const onChange = vi.fn();
  const session = createVaultExportSession({
    ownerId: vaultId,
    prepare,
    save,
    recordVerification,
    now,
    onChange,
  });
  session.setConsent(true);
  expect(await session.prepare()).toBe(true);
  return { session, save, prepare, recordVerification, now, onChange };
};
const localCopy = () => ({
  size: bytes.length,
  arrayBuffer: vi.fn(async () => bytes.slice().buffer),
});

describe("owned export verified-file versus historical-record outcomes", () => {
  it.each(["download_handoff", "cancelled", "unconfirmed"])(
    "does not record from preparation or %s",
    async (kind) => {
      const { session, recordVerification } = await setup(kind);
      expect(recordVerification).not.toHaveBeenCalled();
      await session.save();
      expect(recordVerification).not.toHaveBeenCalled();
      expect(session.current().recordStatus).toBe("not_recorded");
      await session.verify({ size: 1, arrayBuffer: vi.fn() });
      await session.verify({
        size: bytes.length,
        arrayBuffer: async () => new Uint8Array(bytes.length).buffer,
      });
      expect(recordVerification).not.toHaveBeenCalled();
    },
  );

  it.each(["browser", "native"])("records only after exact %s byte evidence", async (kind) => {
    const { session, recordVerification } = await setup(
      kind === "native" ? "native" : "download_handoff",
    );
    expect(kind === "native" ? await session.save() : await session.verify(localCopy())).toBe(true);
    const input = recordVerification.mock.calls[0][0];
    expect(input).toEqual({
      vaultId,
      observation: {
        archiveId,
        archiveCreatedAt: artifact().createdAt,
        schemaVersion: 160,
        byteLength: bytes.length,
        sha256: artifact().sha256,
        verifiedAt,
        method: kind === "native" ? "native_readback" : "selected_local_copy",
      },
    });
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.observation)).toBe(true);
    expect(session.current()).toMatchObject({
      phase: "saved_copy_verified",
      recordStatus: "recorded",
      recordError: null,
      busy: false,
    });
    expect(recordVerification).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(session.current())).not.toContain('"bytes"');
  });

  it.each(["browser", "native"])(
    "keeps verified %s copy acknowledged on record failure; retry only records original evidence",
    async (kind) => {
      const { session, recordVerification, save, now } = await setup(
        kind === "native" ? "native" : "download_handoff",
      );
      recordVerification.mockRejectedValueOnce(new Error("PRIVATE_SQL_PATH"));
      const copy = localCopy();
      expect(kind === "native" ? await session.save() : await session.verify(copy)).toBe(true);
      expect(session.current()).toMatchObject({
        phase: "saved_copy_verified",
        error: null,
        recordStatus: "failed",
        recordRetryAvailable: true,
        busy: false,
      });
      expect(JSON.stringify(session.current())).not.toContain("PRIVATE_SQL_PATH");
      const original = recordVerification.mock.calls[0][0];
      now.mockReturnValue("2026-10-22T00:00:00.000Z");
      expect(await session.retryRecord()).toBe(true);
      expect(recordVerification.mock.calls[1][0]).toEqual(original);
      expect(now).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledTimes(kind === "native" ? 1 : 0);
      expect(copy.arrayBuffer).toHaveBeenCalledTimes(kind === "native" ? 0 : 1);
      expect(session.current()).toMatchObject({
        phase: "saved_copy_verified",
        recordStatus: "recorded",
        recordRetryAvailable: false,
      });
      expect(await session.retryRecord()).toBe(false);
    },
  );

  it("retains failed record evidence privately while pending and blocks save/read/discard/deletion", async () => {
    const { session, recordVerification, save } = await setup();
    let release;
    recordVerification.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = session.verify(localCopy());
    await vi.waitFor(() => expect(recordVerification).toHaveBeenCalledTimes(1));
    expect(session.current()).toMatchObject({
      phase: "saved_copy_verified",
      busy: true,
      recordStatus: "recording",
    });
    expect(await session.save()).toBe(false);
    expect(await session.retryRecord()).toBe(false);
    expect(session.discard()).toBe(false);
    const copy = localCopy();
    expect(await session.verify(copy)).toBe(false);
    expect(copy.arrayBuffer).not.toHaveBeenCalled();
    const mutation = vi.fn();
    expect(await session.runVaultMutation(vaultId, mutation)).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    expect(mutation).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    release(view(recordVerification.mock.calls[0][0]));
    expect(await pending).toBe(true);
  });

  it("rejects forged/missing record acknowledgement without changing verified-file success", async () => {
    const { session, recordVerification } = await setup("native");
    recordVerification.mockImplementationOnce(async (input) => ({
      ...view(input),
      value: { ...view(input).value, history: { version: 1, vaultId, observations: [] } },
    }));
    expect(await session.save()).toBe(true);
    expect(session.current()).toMatchObject({
      phase: "saved_copy_verified",
      recordStatus: "failed",
    });
  });

  it("retains byte verification but invents no historical instant when the clock is invalid", async () => {
    const { session, now, recordVerification } = await setup("native");
    now.mockReturnValue("2026-10-21T07:00:00.000Z");
    expect(await session.save()).toBe(true);
    expect(session.current()).toMatchObject({
      phase: "saved_copy_verified",
      recordStatus: "failed",
      recordRetryAvailable: false,
      error: null,
    });
    expect(session.current().recordError).toContain("device clock");
    expect(recordVerification).not.toHaveBeenCalled();
    expect(await session.retryRecord()).toBe(false);
  });

  it("drops old failed evidence before a later mismatched copy or explicit discard", async () => {
    const { session, recordVerification } = await setup();
    recordVerification.mockRejectedValueOnce(new Error("Synthetic failure"));
    await session.verify(localCopy());
    expect(session.current().recordRetryAvailable).toBe(true);
    expect(await session.verify({ size: 1, arrayBuffer: vi.fn() })).toBe(false);
    expect(session.current()).toMatchObject({
      phase: "prepared",
      recordStatus: "not_recorded",
      recordRetryAvailable: false,
    });
    expect(await session.retryRecord()).toBe(false);
    expect(session.discard()).toBe(true);
    expect(await session.retryRecord()).toBe(false);
    expect(recordVerification).toHaveBeenCalledTimes(1);
  });

  it("does not record after disposed file read or publish after disposed record acknowledgement", async () => {
    const first = await setup();
    let releaseRead;
    const read = first.session.verify({
      size: bytes.length,
      arrayBuffer: () =>
        new Promise((resolve) => {
          releaseRead = resolve;
        }),
    });
    first.session.dispose();
    releaseRead(bytes.slice().buffer);
    expect(await read).toBe(false);
    expect(first.recordVerification).not.toHaveBeenCalled();
    const second = await setup("native");
    let releaseRecord;
    second.recordVerification.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRecord = resolve;
        }),
    );
    const save = second.session.save();
    await vi.waitFor(() => expect(second.recordVerification).toHaveBeenCalledTimes(1));
    const count = second.onChange.mock.calls.length;
    second.session.dispose();
    releaseRecord(view(second.recordVerification.mock.calls[0][0]));
    await save;
    expect(second.onChange).toHaveBeenCalledTimes(count);
    expect(await second.session.retryRecord()).toBe(false);
  });
});
