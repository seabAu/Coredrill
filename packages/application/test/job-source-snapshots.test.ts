import { describe, expect, it, vi } from "vitest";
import { entityId, instant, webUrl } from "@coredrill/domain";
import {
  createJobSourceSnapshotQuery,
  JobSourceSnapshotError,
  type JobSourceSnapshotMetadataDto,
  type JobSourceSnapshotPageDto,
  type ApplicationOperationContext,
} from "../src/index.js";

const jobId = entityId("job", "0198e204-0000-7000-8000-000000000001");
const snapshotId = entityId("source-snapshot", "0198e204-0000-7000-8000-000000000002");
const now = instant("2026-10-19T12:00:00.000Z");
const context: ApplicationOperationContext = {
  operationId: entityId("application-operation", "0198e204-0000-7000-8000-000000000003"),
  initiatedAt: now,
};
const item = (): JobSourceSnapshotMetadataDto => ({
  id: snapshotId,
  jobId,
  capturedAt: now,
  createdAt: now,
  extractorId: "synthetic.extractor",
  extractorVersion: "1.0.0",
  contentHash: "a".repeat(64),
  retentionClass: "capture_review",
  hasRawText: true,
  hasRetainedHtml: false,
  hasStructuredData: true,
  currentSource: {
    id: entityId("job-source", "0198e204-0000-7000-8000-000000000004"),
    jobId,
    connectorId: null,
    externalId: null,
    canonicalUrl: webUrl("https://jobs.example.test/role"),
    applyUrl: null,
    firstSeenAt: now,
    lastSeenAt: now,
    primary: false,
  },
});
const page = (): JobSourceSnapshotPageDto => ({
  jobId,
  includeArchived: false,
  asOf: now,
  items: [item()],
  hasMore: false,
  nextCursor: null,
});
const cursor = () => ({
  jobId,
  includeArchived: false,
  asOf: now,
  capturedAt: now,
  id: snapshotId,
});

describe("validated job source snapshot metadata query", () => {
  it.each([
    { jobId: "bad" },
    { jobId, limit: 0 },
    { jobId, limit: 51 },
    { jobId, limit: 1.5 },
    { jobId, includeArchived: "true" },
    { jobId, arbitrary: true },
    { jobId, after: { ...cursor(), jobId: snapshotId } },
    { jobId, after: { ...cursor(), includeArchived: true } },
    { jobId, after: { ...cursor(), unknown: true } },
    { jobId, after: { ...cursor(), asOf: "2026-10-20T12:00:00.000Z" } },
  ])("rejects invalid input before storage: %j", async (input) => {
    const read = vi.fn();
    const result = await createJobSourceSnapshotQuery({ listPage: read }).execute(
      input as never,
      context,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(read).not.toHaveBeenCalled();
  });
  it("copies and freezes metadata and scopes the default read without raw-content disclosure", async () => {
    const original = page();
    const read = vi.fn().mockResolvedValue(original);
    const result = await createJobSourceSnapshotQuery({ listPage: read }).execute(
      { jobId },
      context,
    );
    expect(read).toHaveBeenCalledWith({
      jobId,
      includeArchived: false,
      limit: 25,
      after: null,
      asOf: now,
    });
    expect(result).toEqual({ ok: true, value: original });
    if (!result.ok) throw new Error("Expected valid metadata");
    expect(result.value).not.toBe(original);
    expect(Object.isFrozen(result.value.items)).toBe(true);
    expect(Object.isFrozen(result.value.items[0]?.currentSource)).toBe(true);
    expect(result.value.items[0]).not.toHaveProperty("rawText");
    expect(result.value.items[0]).not.toHaveProperty("structuredData");
  });
  it.each([
    { ...page(), jobId: snapshotId },
    { ...page(), asOf: "2026-10-19T11:00:00.000Z" },
    { ...page(), items: [item(), item()] },
    {
      ...page(),
      items: [
        { ...item(), id: entityId("source-snapshot", "0198e204-0000-7000-8000-000000000005") },
        item(),
      ],
    },
    { ...page(), hasMore: true },
    { ...page(), nextCursor: cursor() },
    { ...page(), items: [{ ...item(), createdAt: "2026-10-20T12:00:00.000Z" }] },
    { ...page(), items: [{ ...item(), contentHash: "invalid" }] },
    { ...page(), items: [{ ...item(), hasRawText: 1 }] },
    {
      ...page(),
      items: [{ ...item(), currentSource: { ...item().currentSource, jobId: snapshotId } }],
    },
    {
      ...page(),
      items: [
        { ...item(), currentSource: { ...item().currentSource, canonicalUrl: "javascript:bad()" } },
      ],
    },
    {
      ...page(),
      items: [
        {
          ...item(),
          currentSource: { ...item().currentSource, lastSeenAt: "2026-10-18T12:00:00.000Z" },
        },
      ],
    },
  ])("fails closed for malformed or discontinuous stored metadata", async (value) => {
    const result = await createJobSourceSnapshotQuery({
      listPage: vi.fn().mockResolvedValue(value),
    }).execute({ jobId }, context);
    expect(result).toMatchObject({ ok: false, error: { code: "internal", retryable: false } });
  });
  it("validates tied ordering and exact continuation, while allowing explicit future source-clock capture times", async () => {
    const future = { ...item(), capturedAt: instant("2026-10-20T12:00:00.000Z") };
    const after = { ...cursor(), capturedAt: future.capturedAt };
    const read = vi
      .fn()
      .mockResolvedValueOnce({ ...page(), items: [future], hasMore: true, nextCursor: after })
      .mockResolvedValueOnce({
        ...page(),
        items: [
          { ...item(), id: entityId("source-snapshot", "0198e204-0000-7000-8000-000000000005") },
        ],
      });
    const query = createJobSourceSnapshotQuery({ listPage: read });
    expect(await query.execute({ jobId, limit: 1 }, context)).toMatchObject({ ok: true });
    expect(await query.execute({ jobId, limit: 1, after }, context)).toMatchObject({ ok: true });
    expect(read.mock.calls[1]?.[0]).toMatchObject({ asOf: now, after });
    // Capture clocks may be ahead; membership is bounded by local immutable creation time.
    expect(future.createdAt).toBe(now);
  });
  it("rejects a repeated anchor or reversed tie result", async () => {
    const result = await createJobSourceSnapshotQuery({
      listPage: vi.fn().mockResolvedValue(page()),
    }).execute({ jobId, after: cursor() }, context);
    expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it.each([
    { ...cursor(), id: entityId("source-snapshot", "0198e204-0000-7000-8000-000000000005") },
    { ...cursor(), includeArchived: true },
    { ...cursor(), jobId: entityId("job", "0198e204-0000-7000-8000-000000000006") },
    { ...cursor(), asOf: instant("2026-10-19T11:00:00.000Z") },
  ])("requires a next cursor to match the last item and full request scope", async (nextCursor) => {
    const result = await createJobSourceSnapshotQuery({
      listPage: vi.fn().mockResolvedValue({ ...page(), hasMore: true, nextCursor }),
    }).execute({ jobId, limit: 1 }, context);
    expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it("validates operation context before opening storage", async () => {
    const read = vi.fn();
    const query = createJobSourceSnapshotQuery({ listPage: read });
    expect(
      await query.execute({ jobId }, { ...context, operationId: "bad" } as never),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(read).not.toHaveBeenCalled();
  });
  it.each([
    [new JobSourceSnapshotError("cursor_invalidated"), "conflict"],
    [new JobSourceSnapshotError("invalid_state"), "internal"],
    [new Error("private SQL and vault path"), "unavailable"],
  ])("keeps failures stable and content-free", async (error, code) => {
    const result = await createJobSourceSnapshotQuery({
      listPage: vi.fn().mockRejectedValue(error),
    }).execute({ jobId }, context);
    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("distinguishes unavailable job scope from an empty retained history", async () => {
    const query = createJobSourceSnapshotQuery({
      listPage: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ ...page(), items: [] }),
    });
    expect(await query.execute({ jobId }, context)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await query.execute({ jobId }, context)).toMatchObject({
      ok: true,
      value: { items: [] },
    });
  });
});
