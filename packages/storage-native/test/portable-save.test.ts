import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  NATIVE_ARCHIVE_PROTOCOL_VERSION,
  NATIVE_PORTABLE_SAVE_LIMITS,
  openNativeSqliteDatabase,
  parseNativeArchiveResponse,
  type NativeArchiveRequest,
  type NativeArchiveResponseData,
  type NativePortableSaveInput,
} from "../src/index.js";

const vaultId = "0198e102-0000-7000-8000-000000000001";
const archiveId = "0198e102-0000-7000-8000-000000000002";
const input = (length = 40): NativePortableSaveInput => {
  const bytes = new Uint8Array(length).fill(65);
  bytes.set([80, 75, 3, 4]);
  return {
    vaultId,
    archiveId,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes,
  };
};
const setup = async (
  response?: (
    request: NativeArchiveRequest,
  ) => NativeArchiveResponseData | Promise<NativeArchiveResponseData>,
) => {
  const requests: NativeArchiveRequest[] = [];
  let received = 0;
  const archive = vi.fn(async (request: NativeArchiveRequest) => {
    requests.push(request);
    const operation = request.operation;
    let data: NativeArchiveResponseData;
    if (response) data = await response(request);
    else if (operation.type === "portable_save_begin") {
      received = 0;
      data = { type: "portable_save_progress", archiveId, receivedBytes: 0 };
    } else if (operation.type === "portable_save_append") {
      received += operation.bytes.length;
      data = { type: "portable_save_progress", archiveId, receivedBytes: received };
    } else if (operation.type === "portable_save_finish")
      data = {
        type: "portable_saved",
        vaultId,
        archiveId,
        byteLength: operation.byteLength,
        sha256: operation.sha256,
      };
    else data = { type: "portable_save_aborted", archiveId };
    return { protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION, requestId: request.requestId, data };
  });
  const database = await openNativeSqliteDatabase({
    databaseName: "portable-save.sqlite3",
    archiveTransport: { invokeArchive: archive },
    transport: {
      invoke: async (request) => ({
        protocolVersion: 1,
        requestId: request.requestId,
        data: { type: "opened", sessionId: "native-session-1" },
      }),
    },
  });
  return { database, requests, archive };
};
describe("native complete portable archive save transport", () => {
  it("snapshots bytes and sends ordered bounded chunks with exact acknowledgements", async () => {
    const { database, requests } = await setup();
    const artifact = input(NATIVE_PORTABLE_SAVE_LIMITS.maxChunkBytes + 27);
    const expected = artifact.bytes.slice();
    const pending = database.savePortableArchive(artifact);
    artifact.bytes.fill(9);
    expect(await pending).toMatchObject({
      status: "saved_verified",
      vaultId,
      archiveId,
      sha256: artifact.sha256,
    });
    expect(requests.map(({ operation }) => operation.type)).toEqual([
      "portable_save_begin",
      "portable_save_append",
      "portable_save_append",
      "portable_save_finish",
    ]);
    const chunks = requests.flatMap(({ operation }) =>
      operation.type === "portable_save_append" ? [operation] : [],
    );
    expect(chunks.map(({ offset, bytes }) => [offset, bytes.length])).toEqual([
      [0, NATIVE_PORTABLE_SAVE_LIMITS.maxChunkBytes],
      [NATIVE_PORTABLE_SAVE_LIMITS.maxChunkBytes, 27],
    ]);
    expect(Uint8Array.from(chunks.flatMap(({ bytes }) => [...bytes]))).toEqual(expected);
    expect(requests.every((request) => request.protocolVersion === 4)).toBe(true);
    expect(JSON.stringify(requests)).not.toContain("path");
  });
  it("rejects invalid identity, lengths and content before archive IPC", async () => {
    const { database, archive } = await setup();
    const artifact = input();
    for (const change of [
      { vaultId: "../path" },
      { archiveId: vaultId.toUpperCase() },
      { byteLength: -1 },
      { byteLength: NATIVE_PORTABLE_SAVE_LIMITS.maxArchiveBytes + 1 },
      { sha256: "0".repeat(64) },
      { bytes: new Uint8Array(30) },
    ]) {
      await expect(database.savePortableArchive({ ...artifact, ...change })).rejects.toMatchObject({
        code: "invalid_request",
      });
    }
    expect(archive).not.toHaveBeenCalled();
  });
  it.each(["progress", "finish", "cancelled", "throw"])(
    "does not infer success or retry finish after %s",
    async (kind) => {
      const artifact = input();
      const { database, requests } = await setup((request) => {
        const operation = request.operation;
        if (operation.type === "portable_save_begin")
          return { type: "portable_save_progress", archiveId, receivedBytes: 0 };
        if (operation.type === "portable_save_append")
          return {
            type: "portable_save_progress",
            archiveId,
            receivedBytes: kind === "progress" ? 1 : artifact.byteLength,
          };
        if (operation.type === "portable_save_abort")
          return { type: "portable_save_aborted", archiveId };
        if (kind === "throw") throw new Error("PRIVATE_DESTINATION");
        if (kind === "cancelled") return { type: "portable_save_cancelled", archiveId };
        return {
          type: "portable_saved",
          vaultId,
          archiveId,
          byteLength: artifact.byteLength,
          sha256: "0".repeat(64),
        };
      });
      if (kind === "cancelled")
        expect(await database.savePortableArchive(artifact)).toEqual({ status: "cancelled" });
      else await expect(database.savePortableArchive(artifact)).rejects.toBeDefined();
      expect(
        requests.filter(({ operation }) => operation.type === "portable_save_finish"),
      ).toHaveLength(kind === "progress" ? 0 : 1);
      expect(requests.at(-1)?.operation.type).toBe(
        kind === "cancelled" ? "portable_save_finish" : "portable_save_abort",
      );
    },
  );
  it("rejects old versions, foreign acknowledgements, excessive progress and path-bearing responses", () => {
    const valid = {
      protocolVersion: 4,
      requestId: "native-save",
      data: { type: "portable_saved", vaultId, archiveId, byteLength: 40, sha256: "0".repeat(64) },
    };
    for (const invalid of [
      { ...valid, protocolVersion: 3 },
      { ...valid, data: { ...valid.data, archiveId: "other" } },
      { ...valid, data: { ...valid.data, path: "PRIVATE_PATH" } },
      {
        ...valid,
        data: {
          type: "portable_save_progress",
          archiveId,
          receivedBytes: NATIVE_PORTABLE_SAVE_LIMITS.maxArchiveBytes + 1,
        },
      },
    ])
      expect(() => parseNativeArchiveResponse(invalid, "native-save")).toThrow();
  });
});
