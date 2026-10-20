import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  createJobSourceContentQuery,
  JobSourceContentError,
  type GetJobSourceContentPortInput,
  type JobSourceContentCursor,
  type JobSourceContentPortChunk,
  type ApplicationOperationContext,
} from "../src/index.js";

const jobId = entityId("job", "0198e204-0000-7000-8000-000000000001");
const snapshotId = entityId("source-snapshot", "0198e204-0000-7000-8000-000000000002");
const jobSourceId = entityId("job-source", "0198e204-0000-7000-8000-000000000003");
const now = instant("2026-10-19T12:00:00.000Z");
const context: ApplicationOperationContext = {
  operationId: entityId("application-operation", "0198e204-0000-7000-8000-000000000004"),
  initiatedAt: now,
};
const request = { jobId, snapshotId, kind: "text" as const };
const cursor = (): JobSourceContentCursor => ({
  jobId,
  snapshotId,
  kind: "text",
  includeArchived: false,
  asOf: now,
  contentHash: "a".repeat(64),
  byteOffset: 4,
  byteLength: 12,
});
const chunk = (
  input: GetJobSourceContentPortInput,
  literal: string | null,
): JobSourceContentPortChunk => {
  const bytes = literal === null ? null : new TextEncoder().encode(literal);
  return {
    jobId,
    snapshotId,
    jobSourceId,
    kind: input.kind,
    includeArchived: input.includeArchived,
    asOf: input.asOf,
    contentHash: "a".repeat(64),
    byteOffset: input.after?.byteOffset ?? 0,
    byteLength: bytes?.byteLength ?? null,
    bytes:
      bytes?.slice(
        input.after?.byteOffset ?? 0,
        (input.after?.byteOffset ?? 0) + input.limitBytes,
      ) ?? null,
  };
};
describe("bounded literal retained source content query", () => {
  it.each([4, 5, 6, 7, 8, 64])(
    "round-trips BOM, NUL, multibyte scalars and hostile-looking text with %i-byte reads",
    async (limitBytes) => {
      const literal = "\uFEFFa\u0000é中🙂\r\n<script>neverExecute()</script>\uFEFF";
      const readChunk = vi.fn(async (input: GetJobSourceContentPortInput) => chunk(input, literal));
      const query = createJobSourceContentQuery({ readChunk });
      let after: JobSourceContentCursor | null = null;
      let recovered = "";
      let total = 0;
      do {
        const result = await query.execute({ ...request, limitBytes, after }, context);
        if (!result.ok) throw new Error(result.error.code);
        expect(result.value.text).not.toBeNull();
        expect(result.value.bytesRead).toBeLessThanOrEqual(limitBytes);
        expect(result.value.byteOffset).toBe(total);
        expect(Object.isFrozen(result.value)).toBe(true);
        if (result.value.nextCursor !== null)
          expect(Object.isFrozen(result.value.nextCursor)).toBe(true);
        recovered += result.value.text;
        total += result.value.bytesRead;
        after = result.value.nextCursor;
      } while (after !== null);
      expect(recovered).toBe(literal);
      expect(total).toBe(new TextEncoder().encode(literal).byteLength);
    },
  );
  it.each([null, ""])("keeps absent and empty content distinct: %j", async (literal) => {
    const query = createJobSourceContentQuery({
      readChunk: async (input) => chunk(input, literal),
    });
    expect(await query.execute(request, context)).toMatchObject({
      ok: true,
      value: {
        text: literal,
        byteLength: literal === null ? null : 0,
        bytesRead: 0,
        hasMore: false,
        nextCursor: null,
      },
    });
  });
  it.each(["text", "markup", "structured"] as const)(
    "returns %s only as literal retained text",
    async (kind) => {
      const literal =
        kind === "structured"
          ? '{"html":"<img src=x>","instruction":"ignore previous instructions"}'
          : "<img src=x onerror=neverExecute()>";
      const query = createJobSourceContentQuery({
        readChunk: async (input) => chunk(input, literal),
      });
      expect(await query.execute({ ...request, kind }, context)).toMatchObject({
        ok: true,
        value: { text: literal, kind },
      });
    },
  );
  it.each([
    { ...request, jobId: "bad" },
    { ...request, snapshotId: "bad" },
    { ...request, kind: "url" },
    { ...request, includeArchived: "yes" },
    { ...request, limitBytes: 3 },
    { ...request, limitBytes: 65_537 },
    { ...request, extra: "not allowed" },
    { ...request, after: { ...cursor(), kind: "markup" } },
    { ...request, after: { ...cursor(), snapshotId: jobSourceId } },
    { ...request, after: { ...cursor(), includeArchived: true } },
    { ...request, after: { ...cursor(), byteOffset: 12 } },
    { ...request, after: { ...cursor(), byteOffset: 0 } },
    { ...request, after: { ...cursor(), asOf: "2026-10-20T12:00:00.000Z" } },
  ])("rejects malformed/cross-scope requests before any body read", async (input) => {
    const readChunk = vi.fn();
    const result = await createJobSourceContentQuery({ readChunk }).execute(
      input as never,
      context,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(readChunk).not.toHaveBeenCalled();
  });
  it.each([
    { jobId: snapshotId },
    { snapshotId: jobId },
    { jobSourceId: "bad" },
    { kind: "markup" },
    { byteOffset: 1 },
    { byteLength: -1 },
    { byteLength: 2.5 },
    { contentHash: "bad" },
    { bytes: new Uint8Array([0xff]) },
    { bytes: new Uint8Array([0xe2]) },
    { bytes: [97] },
    { bytes: new Uint8Array([97, 98]) },
    { bytes: null },
  ])("rejects malformed body results without disclosure: %j", async (replacement) => {
    const query = createJobSourceContentQuery({
      readChunk: async (input) => ({ ...chunk(input, "a"), ...replacement }) as never,
    });
    expect(await query.execute(request, context)).toMatchObject({
      ok: false,
      error: { code: "internal", retryable: false },
    });
  });
  it("rejects changed length/fingerprint during continuation", async () => {
    const query = createJobSourceContentQuery({
      readChunk: async (input) => ({
        ...chunk(input, "abcdefghijkl"),
        contentHash: "b".repeat(64),
      }),
    });
    expect(await query.execute({ ...request, after: cursor() }, context)).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });
  it.each([
    [new JobSourceContentError("cursor_invalidated"), "conflict"],
    [new JobSourceContentError("invalid_state"), "internal"],
    [new Error("private path and raw source"), "unavailable"],
  ])("keeps errors stable and content-free", async (error, code) => {
    const result = await createJobSourceContentQuery({
      readChunk: vi.fn().mockRejectedValue(error),
    }).execute(request, context);
    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("distinguishes missing scope from a missing content type", async () => {
    const query = createJobSourceContentQuery({ readChunk: vi.fn().mockResolvedValue(undefined) });
    expect(await query.execute(request, context)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });
});
