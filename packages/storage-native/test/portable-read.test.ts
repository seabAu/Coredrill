import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  NATIVE_ARCHIVE_PROTOCOL_VERSION,
  NATIVE_PORTABLE_READ_LIMITS,
  openNativeSqliteDatabase,
  parseNativeArchiveResponse,
  type NativeArchiveRequest,
} from "../src/index.js";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const setup = async (
  options: {
    readonly length?: number;
    readonly alter?: (data: Record<string, unknown>, request: NativeArchiveRequest) => unknown;
    readonly holdBegin?: Promise<void>;
  } = {},
) => {
  const bytes = new Uint8Array(options.length ?? 40).fill(65);
  bytes.set([80, 75, 3, 4]);
  const requests: NativeArchiveRequest[] = [];
  const invokeArchive = vi.fn(async (request: NativeArchiveRequest) => {
    requests.push(request);
    const operation = request.operation;
    if (!("selectionId" in operation)) throw new Error("Unexpected operation");
    let data: Record<string, unknown>;
    if (operation.type === "portable_read_begin") {
      await options.holdBegin;
      data = {
        type: "portable_read_ready",
        selectionId: operation.selectionId,
        byteLength: bytes.length,
        sha256: digest(bytes),
      };
    } else if (operation.type === "portable_read_chunk") {
      const chunk = Array.from(
        bytes.slice(operation.offset, operation.offset + NATIVE_PORTABLE_READ_LIMITS.maxChunkBytes),
      );
      data = {
        type: "portable_read_chunk",
        selectionId: operation.selectionId,
        offset: operation.offset,
        bytes: chunk,
        complete: operation.offset + chunk.length === bytes.length,
      };
    } else data = { type: "portable_read_released", selectionId: operation.selectionId };
    return {
      protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION,
      requestId: request.requestId,
      data: options.alter ? options.alter(data, request) : data,
    };
  });
  const database = await openNativeSqliteDatabase({
    databaseName: "portable-read.sqlite3",
    archiveTransport: { invokeArchive },
    transport: {
      invoke: async (request) => ({
        protocolVersion: 1,
        requestId: request.requestId,
        data:
          request.operation.type === "close"
            ? { type: "closed" }
            : { type: "opened", sessionId: "native-session-1" },
      }),
    },
  });
  return { bytes, requests, database };
};

describe("native complete portable archive input", () => {
  it("assembles exact owned bytes in bounded ordered chunks and explicitly releases without a restore", async () => {
    const { bytes, requests, database } = await setup({
      length: NATIVE_PORTABLE_READ_LIMITS.maxChunkBytes + 27,
    });
    const selected = await database.selectPortableArchive();
    expect(selected.status).toBe("selected");
    if (selected.status !== "selected") throw new Error("Expected selected bytes");
    expect(Buffer.from(selected.bytes).equals(Buffer.from(bytes))).toBe(true);
    // Keep identity checks boolean: negated object matchers may traverse equal-content arrays.
    expect(selected.bytes === bytes).toBe(false);
    expect(selected.sha256).toBe(digest(bytes));
    expect(selected.byteLength).toBe(bytes.length);
    expect(requests.map(({ operation }) => operation.type)).toEqual([
      "portable_read_begin",
      "portable_read_chunk",
      "portable_read_chunk",
      "portable_read_release",
    ]);
    const chunks = requests.flatMap(({ operation }) =>
      operation.type === "portable_read_chunk" ? [operation] : [],
    );
    expect(chunks.map(({ offset }) => offset)).toEqual([
      0,
      NATIVE_PORTABLE_READ_LIMITS.maxChunkBytes,
    ]);
    const identities = requests.flatMap(({ operation }) =>
      "selectionId" in operation ? [operation.selectionId] : [],
    );
    expect(new Set(identities).size).toBe(1);
    expect(identities[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(requests.every(({ protocolVersion }) => protocolVersion === 5)).toBe(true);
    for (const { operation } of requests) expect(Object.keys(operation)).not.toContain("path");
    bytes.fill(0);
    expect(selected.sha256).toBe(digest(selected.bytes));
  });

  it("reports cancellation without reading bytes or invoking legacy restore", async () => {
    const { database, requests } = await setup({
      alter: (data, request) =>
        request.operation.type === "portable_read_begin"
          ? { type: "portable_read_cancelled", selectionId: data["selectionId"] }
          : data,
    });
    await expect(database.selectPortableArchive()).resolves.toEqual({ status: "cancelled" });
    expect(requests.map(({ operation }) => operation.type)).toEqual([
      "portable_read_begin",
      "portable_read_release",
    ]);
  });

  it.each([
    "foreign",
    "offset",
    "short",
    "empty",
    "completion",
    "hash",
    "oversized",
    "path",
    "release",
    "lost_begin",
  ])("fails closed and attempts original-handle release after %s", async (kind) => {
    const { database, requests } = await setup({
      alter: (data, request) => {
        const type = request.operation.type;
        if (type === "portable_read_begin") {
          if (kind === "foreign") return { ...data, selectionId: "f".repeat(64) };
          if (kind === "hash") return { ...data, sha256: "0".repeat(64) };
          if (kind === "oversized")
            return { ...data, byteLength: NATIVE_PORTABLE_READ_LIMITS.maxArchiveBytes + 1 };
          if (kind === "path") return { ...data, path: "PRIVATE_PATH" };
          if (kind === "lost_begin") throw new Error("PRIVATE_PATH selected-file content");
        }
        if (type === "portable_read_chunk") {
          if (kind === "offset") return { ...data, offset: 1 };
          if (kind === "short") return { ...data, bytes: [1] };
          if (kind === "empty") return { ...data, bytes: [] };
          if (kind === "completion") return { ...data, complete: false };
        }
        if (type === "portable_read_release" && kind === "release")
          return { ...data, selectionId: "e".repeat(64) };
        return data;
      },
    });
    await expect(database.selectPortableArchive()).rejects.toSatisfy(
      (error: unknown) => error instanceof Error && !error.message.includes("PRIVATE_PATH"),
    );
    const begin = requests[0]?.operation;
    const release = requests.at(-1)?.operation;
    expect(begin?.type).toBe("portable_read_begin");
    expect(release?.type).toBe("portable_read_release");
    if (begin && release && "selectionId" in begin && "selectionId" in release)
      expect(release.selectionId).toBe(begin.selectionId);
    expect(
      requests.filter(({ operation }) => operation.type === "portable_read_begin"),
    ).toHaveLength(1);
    expect(
      requests.some(
        ({ operation }) => operation.type === "restore" || operation.type === "portable_commit",
      ),
    ).toBe(false);
  });

  it("serializes selection and close on the existing adapter queue with fresh private identities", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { database, requests } = await setup({ holdBegin: held });
    const first = database.selectPortableArchive();
    const second = database.selectPortableArchive();
    const close = database.close();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    release();
    const results = await Promise.all([first, second, close]);
    expect(results.slice(0, 2)).toMatchObject([{ status: "selected" }, { status: "selected" }]);
    expect(requests.map(({ operation }) => operation.type)).toEqual([
      "portable_read_begin",
      "portable_read_chunk",
      "portable_read_release",
      "portable_read_begin",
      "portable_read_chunk",
      "portable_read_release",
    ]);
    const ids = requests.flatMap(({ operation }) =>
      operation.type === "portable_read_begin" ? [operation.selectionId] : [],
    );
    expect(ids[0]).not.toBe(ids[1]);
    await expect(database.selectPortableArchive()).rejects.toMatchObject({
      code: "session_closed",
    });
  });

  it("strictly rejects unsupported versions, malformed fields, paths and excessive chunks", () => {
    const valid = {
      protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION,
      requestId: "read-protocol",
      data: {
        type: "portable_read_chunk",
        selectionId: "a".repeat(64),
        offset: 0,
        bytes: [80],
        complete: false,
      },
    };
    expect(parseNativeArchiveResponse(valid, "read-protocol").data.type).toBe(
      "portable_read_chunk",
    );
    for (const response of [
      { ...valid, protocolVersion: 4 },
      { ...valid, path: "PRIVATE_PATH" },
      { ...valid, requestId: "other" },
      ...[
        { selectionId: "../path" },
        { offset: -1 },
        { bytes: [256] },
        { bytes: [1.5] },
        { bytes: new Array<number>(NATIVE_PORTABLE_READ_LIMITS.maxChunkBytes + 1).fill(0) },
        { complete: "false" },
        { path: "PRIVATE_PATH" },
      ].map((change) => ({ ...valid, data: { ...valid.data, ...change } })),
    ])
      expect(() => parseNativeArchiveResponse(response, "read-protocol")).toThrow();
  });
});
