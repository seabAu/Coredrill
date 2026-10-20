import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  createJobSourceEvidenceValueQuery,
  JobSourceEvidenceValueError,
  type ApplicationOperationContext,
  type GetJobSourceEvidenceValueInput,
  type GetJobSourceEvidenceValuePortInput,
  type JobSourceEvidenceValueCursor,
  type JobSourceEvidenceValuePortChunk,
} from "../src/index.js";

const jobId = entityId("job", "0198e206-0000-7000-8000-000000000001");
const snapshotId = entityId("source-snapshot", "0198e206-0000-7000-8000-000000000002");
const evidenceId = entityId("field-value", "0198e206-0000-7000-8000-000000000003");
const provenanceId = entityId("provenance", "0198e206-0000-7000-8000-000000000004");
const now = instant("2026-10-19T12:00:00.000Z");
const later = instant("2026-10-19T13:00:00.000Z");
const context: ApplicationOperationContext = {
  operationId: entityId("application-operation", "0198e206-0000-7000-8000-000000000005"),
  initiatedAt: now,
};
const request: GetJobSourceEvidenceValueInput = {
  jobId,
  snapshotId,
  evidenceKind: "field-value",
  evidenceId,
  part: "normalized",
};
const chunk = (): JobSourceEvidenceValuePortChunk => ({
  jobId,
  snapshotId,
  evidenceKind: "field-value",
  evidenceId,
  part: "normalized",
  includeArchived: false,
  asOf: now,
  provenanceId,
  rowVersion: 1,
  format: "json",
  byteOffset: 0,
  byteLength: 8,
  bytes: new TextEncoder().encode('"abcdef"'),
});
const cursor = (): JobSourceEvidenceValueCursor => ({
  jobId,
  snapshotId,
  evidenceKind: "field-value",
  evidenceId,
  part: "normalized",
  includeArchived: false,
  asOf: now,
  provenanceId,
  rowVersion: 1,
  byteLength: 8,
  byteOffset: 1,
});
const execute = (value: unknown, input: GetJobSourceEvidenceValueInput = request) =>
  createJobSourceEvidenceValueQuery({ readChunk: vi.fn().mockResolvedValue(value) }).execute(
    input,
    context,
  );

describe("full literal retained source evidence values", () => {
  it.each([
    { ...request, jobId: "bad" },
    { ...request, snapshotId: "bad" },
    { ...request, evidenceId: "bad" },
    { ...request, evidenceKind: "other" },
    { ...request, part: "other" },
    { ...request, includeArchived: "true" },
    { ...request, unknown: true },
    { ...request, limitBytes: 0 },
    { ...request, limitBytes: 3 },
    { ...request, limitBytes: 65_537 },
    { ...request, limitBytes: 4.5 },
    ...[
      { ...cursor(), jobId: snapshotId },
      { ...cursor(), snapshotId: jobId },
      { ...cursor(), evidenceId: jobId },
      { ...cursor(), evidenceKind: "requirement" },
      { ...cursor(), part: "raw" },
      { ...cursor(), includeArchived: true },
      { ...cursor(), asOf: later },
      { ...cursor(), provenanceId: "bad" },
      { ...cursor(), rowVersion: 0 },
      { ...cursor(), byteLength: 0 },
      { ...cursor(), byteOffset: 0 },
      { ...cursor(), byteOffset: 8 },
      { ...cursor(), unknown: true },
    ].map((after) => ({ ...request, after })),
  ])("rejects invalid identity, scope, bounds and cursor before storage", async (input) => {
    const read = vi.fn();
    expect(
      await createJobSourceEvidenceValueQuery({ readChunk: read }).execute(input as never, context),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(read).not.toHaveBeenCalled();
  });
  it("copies/freezes exact serialized JSON without exposing mutable bytes or parsing objects", async () => {
    const original = chunk();
    const read = vi.fn().mockResolvedValue(original);
    const result = await createJobSourceEvidenceValueQuery({ readChunk: read }).execute(
      request,
      context,
    );
    expect(read).toHaveBeenCalledWith({
      ...request,
      includeArchived: false,
      asOf: now,
      after: null,
      limitBytes: 32_768,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { text: '"abcdef"', bytesRead: 8, byteLength: 8, hasMore: false, nextCursor: null },
    });
    if (!result.ok) throw new Error("Expected complete literal value");
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(result.value).not.toHaveProperty("bytes");
    original.bytes?.fill(0);
    expect(result.value.text).toBe('"abcdef"');
  });
  it.each([
    {
      kind: "field-value" as const,
      format: "json" as const,
      value: JSON.stringify({ text: "\uFEFFaé中🙂\u0000<script>literal</script>\r\n" }),
    },
    {
      kind: "requirement" as const,
      format: "text" as const,
      value: "\uFEFFa\u0000é中🙂\r\n<script>literal</script>\uFEFF",
    },
  ])(
    "reconstructs all UTF-8 scalars and literal content in four-byte chunks: $kind",
    async ({ kind, format, value }) => {
      const bytes = new TextEncoder().encode(value);
      const read = vi.fn((input: GetJobSourceEvidenceValuePortInput) =>
        Promise.resolve({
          ...input,
          provenanceId,
          rowVersion: 1,
          format,
          byteOffset: input.after?.byteOffset ?? 0,
          byteLength: bytes.byteLength,
          bytes: bytes.slice(
            input.after?.byteOffset ?? 0,
            (input.after?.byteOffset ?? 0) + input.limitBytes,
          ),
        }),
      );
      const query = createJobSourceEvidenceValueQuery({ readChunk: read });
      let after: JobSourceEvidenceValueCursor | null = null;
      let reconstructed = "";
      let consumed = 0;
      do {
        const result = await query.execute(
          { ...request, evidenceKind: kind, limitBytes: 4, after },
          { ...context, initiatedAt: later },
        );
        if (!result.ok) throw new Error("Expected bounded UTF-8 read");
        expect(result.value.byteOffset).toBe(consumed);
        expect(result.value.bytesRead).toBeGreaterThan(0);
        expect(result.value.bytesRead).toBeLessThanOrEqual(4);
        expect(result.value.format).toBe(format);
        reconstructed += result.value.text;
        consumed += result.value.bytesRead;
        after = result.value.nextCursor;
        if (after !== null) {
          expect(Object.isFrozen(after)).toBe(true);
          expect(after.byteOffset).toBe(consumed);
          expect(after.asOf).toBe(later);
        }
      } while (after !== null);
      expect(reconstructed).toBe(value);
      expect(consumed).toBe(bytes.byteLength);
    },
  );
  it("keeps absent raw data distinct from serialized JSON null and the empty JSON string", async () => {
    expect(
      await execute(
        { ...chunk(), part: "raw", byteLength: null, bytes: null },
        { ...request, part: "raw" },
      ),
    ).toMatchObject({
      ok: true,
      value: { text: null, byteLength: null, bytesRead: 0, hasMore: false },
    });
    for (const value of ["null", '""']) {
      expect(
        await execute({
          ...chunk(),
          byteLength: value.length,
          bytes: new TextEncoder().encode(value),
        }),
      ).toMatchObject({
        ok: true,
        value: { text: value, byteLength: value.length, bytesRead: value.length },
      });
    }
  });
  it("defers an incomplete trailing scalar instead of replacing or losing it", async () => {
    const value = { ...chunk(), byteLength: 5, bytes: new Uint8Array([0x61, 0xf0, 0x9f, 0x99]) };
    const result = await execute(value, { ...request, limitBytes: 4 });
    expect(result).toMatchObject({
      ok: true,
      value: { text: "a", bytesRead: 1, nextCursor: { byteOffset: 1 } },
    });
  });
  it.each([
    { ...chunk(), jobId: snapshotId },
    { ...chunk(), snapshotId: jobId },
    { ...chunk(), evidenceKind: "requirement" },
    { ...chunk(), evidenceId: jobId },
    { ...chunk(), part: "raw" },
    { ...chunk(), includeArchived: true },
    { ...chunk(), asOf: later },
    { ...chunk(), provenanceId: "bad" },
    { ...chunk(), rowVersion: 0 },
    { ...chunk(), format: "text" },
    { ...chunk(), byteOffset: 1 },
    { ...chunk(), byteLength: -1 },
    { ...chunk(), byteLength: 0, bytes: new Uint8Array() },
    { ...chunk(), byteLength: null, bytes: null },
    { ...chunk(), byteLength: 9 },
    { ...chunk(), bytes: [1, 2] },
    { ...chunk(), bytes: null },
    { ...chunk(), byteLength: 4, bytes: new Uint8Array([0xff, 0xff, 0xff, 0xff]) },
    { ...chunk(), byteLength: 2, bytes: new Uint8Array([0xe2, 0x82]) },
  ])("rejects malformed, discontinuous or undecodable port results", async (value) => {
    expect(await execute(value)).toMatchObject({
      ok: false,
      error: { code: "internal", retryable: false },
    });
  });
  it("does not permit absent requirement raw text", async () => {
    expect(
      await execute(
        {
          ...chunk(),
          evidenceKind: "requirement",
          part: "raw",
          format: "text",
          byteLength: null,
          bytes: null,
        },
        { ...request, evidenceKind: "requirement", part: "raw" },
      ),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it.each([{ provenanceId: snapshotId }, { rowVersion: 2 }, { byteLength: 9 }])(
    "revalidates provenance, version and length continuity from the adapter",
    async (changed) => {
      expect(
        await execute(
          { ...chunk(), ...changed, byteOffset: 1, bytes: new TextEncoder().encode('abcdef"') },
          { ...request, after: cursor() },
        ),
      ).toMatchObject({ ok: false, error: { code: "internal" } });
    },
  );
  it("preserves the membership ceiling on a later operation and freezes its continuation", async () => {
    const read = vi
      .fn()
      .mockResolvedValue({ ...chunk(), byteOffset: 1, bytes: new TextEncoder().encode('abcdef"') });
    expect(
      await createJobSourceEvidenceValueQuery({ readChunk: read }).execute(
        { ...request, after: cursor() },
        { ...context, initiatedAt: later },
      ),
    ).toMatchObject({ ok: true });
    expect(read.mock.calls[0]?.[0]).toMatchObject({ asOf: now, after: cursor() });
    expect(Object.isFrozen(read.mock.calls[0]?.[0].after)).toBe(true);
  });
  it.each([
    [new JobSourceEvidenceValueError("cursor_invalidated"), "conflict"],
    [new JobSourceEvidenceValueError("invalid_state"), "internal"],
    [new JobSourceEvidenceValueError("unavailable"), "unavailable"],
    [new Error("SYNTHETIC_PRIVATE_VALUE"), "unavailable"],
  ])("maps failures without disclosing value contents", async (error, code) => {
    const result = await createJobSourceEvidenceValueQuery({
      readChunk: vi.fn().mockRejectedValue(error),
    }).execute(request, context);
    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE_VALUE");
  });
  it("keeps missing scope distinct from absent raw value", async () => {
    expect(await execute(undefined)).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
  it("validates operation context before touching storage", async () => {
    const read = vi.fn();
    expect(
      await createJobSourceEvidenceValueQuery({ readChunk: read }).execute(request, {
        ...context,
        operationId: "bad",
      } as never),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(read).not.toHaveBeenCalled();
  });
});
