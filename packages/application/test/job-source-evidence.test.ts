import { describe, expect, it, vi } from "vitest";
import { confidence, entityId, instant } from "@coredrill/domain";
import {
  createJobSourceEvidenceQuery,
  JobSourceEvidenceError,
  type ApplicationOperationContext,
  type JobSourceEvidenceDto,
  type JobSourceEvidencePageDto,
  type SourceValuePreviewDto,
} from "../src/index.js";

const jobId = entityId("job", "0198e205-0000-7000-8000-000000000001");
const snapshotId = entityId("source-snapshot", "0198e205-0000-7000-8000-000000000002");
const fieldId = entityId("field-value", "0198e205-0000-7000-8000-000000000003");
const now = instant("2026-10-19T12:00:00.000Z");
const later = instant("2026-10-19T13:00:00.000Z");
const context: ApplicationOperationContext = {
  operationId: entityId("application-operation", "0198e205-0000-7000-8000-000000000004"),
  initiatedAt: now,
};
const literal = (text: string, format: "json" | "text" = "json"): SourceValuePreviewDto => ({
  text,
  format,
  byteLength: new TextEncoder().encode(text).byteLength,
  complete: true,
});
const field = (): Extract<JobSourceEvidenceDto, { kind: "field-value" }> => ({
  kind: "field-value",
  id: fieldId,
  jobId,
  snapshotId,
  createdAt: now,
  fieldName: "title",
  normalized: literal(JSON.stringify("Platform Engineer")),
  raw: literal(JSON.stringify("<script>synthetic untrusted source</script>")),
  provenance: {
    id: entityId("provenance", "0198e205-0000-7000-8000-000000000005"),
    snapshotId,
    method: "heuristic",
    pointer: "synthetic:title",
    excerpt: "Synthetic source excerpt",
    confidence: confidence(0.8),
    capturedAt: now,
    licenseNote: null,
  },
  currentReview: {
    updatedAt: later,
    rowVersion: 2,
    confirmation: {
      id: entityId("field-confirmation", "0198e205-0000-7000-8000-000000000006"),
      confirmedAt: later,
      confirmedValueHash: "b".repeat(64),
    },
    supersededBy: {
      id: entityId("field-value", "0198e205-0000-7000-8000-000000000007"),
      jobId,
      snapshotId,
      fieldName: "title",
    },
  },
});
const requirement = (): Extract<JobSourceEvidenceDto, { kind: "requirement" }> => ({
  ...field(),
  kind: "requirement",
  // UUIDs may coincide across separate tables; identity includes the evidence kind.
  id: entityId("job-requirement", fieldId),
  normalized: literal("TypeScript experience", "text"),
  raw: literal("TypeScript experience", "text"),
  sourceCategory: "required",
  currentReview: { updatedAt: later, rowVersion: 2, category: "desired", userConfirmed: true },
});
const page = (items: readonly JobSourceEvidenceDto[] = [field()]): JobSourceEvidencePageDto => ({
  jobId,
  snapshotId,
  includeArchived: false,
  asOf: now,
  items,
  hasMore: false,
  nextCursor: null,
});
const cursor = () => ({
  jobId,
  snapshotId,
  includeArchived: false,
  asOf: now,
  createdAt: now,
  kind: "field-value" as const,
  id: fieldId,
});
const readValue = async (value: unknown) =>
  createJobSourceEvidenceQuery({ listPage: vi.fn().mockResolvedValue(value) }).execute(
    { jobId, snapshotId },
    context,
  );

describe("validated retained source evidence query", () => {
  it.each([
    { jobId: "invalid", snapshotId },
    { jobId, snapshotId: "invalid" },
    { jobId, snapshotId, limit: 0 },
    { jobId, snapshotId, limit: 51 },
    { jobId, snapshotId, limit: 1.5 },
    { jobId, snapshotId, includeArchived: 1 },
    { jobId, snapshotId, arbitrary: true },
    { jobId, snapshotId, after: { ...cursor(), unknown: true } },
    { jobId, snapshotId, after: { ...cursor(), snapshotId: jobId } },
    { jobId, snapshotId, after: { ...cursor(), jobId: snapshotId } },
    { jobId, snapshotId, after: { ...cursor(), includeArchived: true } },
    { jobId, snapshotId, after: { ...cursor(), asOf: later } },
    { jobId, snapshotId, after: { ...cursor(), createdAt: later } },
    { jobId, snapshotId, after: { ...cursor(), kind: "unknown" } },
  ])("rejects invalid scope/cursors before storage: %j", async (input) => {
    const read = vi.fn();
    const result = await createJobSourceEvidenceQuery({ listPage: read }).execute(
      input as never,
      context,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(read).not.toHaveBeenCalled();
  });
  it("copies and freezes literal values and current annotations without inventing historical review state", async () => {
    const original = page([field(), requirement()]);
    const read = vi.fn().mockResolvedValue(original);
    const result = await createJobSourceEvidenceQuery({ listPage: read }).execute(
      { jobId, snapshotId },
      context,
    );
    expect(read).toHaveBeenCalledWith({
      jobId,
      snapshotId,
      includeArchived: false,
      asOf: now,
      limit: 25,
      after: null,
    });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("Expected retained source evidence");
    const savedField = result.value.items[0];
    const savedRequirement = result.value.items[1];
    expect(savedField).toEqual(field());
    expect(savedField).not.toBe(original.items[0]);
    expect(savedField?.raw?.text).toContain("<script>");
    expect(savedField?.currentReview.updatedAt).toBe(later);
    for (const value of [
      result.value,
      result.value.items,
      savedField,
      savedField?.normalized,
      savedField?.raw,
      savedField?.provenance,
      savedField?.currentReview,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    if (savedField?.kind !== "field-value") throw new Error("Expected field");
    expect(Object.isFrozen(savedField.currentReview.confirmation)).toBe(true);
    expect(Object.isFrozen(savedField.currentReview.supersededBy)).toBe(true);
    expect(savedRequirement?.currentReview).toEqual(requirement().currentReview);
    expect(savedRequirement?.currentReview).not.toHaveProperty("confirmation");
    expect(savedRequirement).not.toHaveProperty("fieldName");
  });
  it("returns explicit incomplete JSON previews, preserving absent raw and JSON null distinctions", async () => {
    const incomplete = {
      ...field(),
      normalized: { ...literal('"partial'), complete: false, byteLength: 4096 },
      raw: null,
    };
    expect(await readValue(page([incomplete]))).toEqual({ ok: true, value: page([incomplete]) });
    expect(
      await readValue(page([{ ...field(), normalized: literal("null"), raw: null }])),
    ).toMatchObject({ ok: true });
  });
  it.each([
    { ...field(), jobId: snapshotId },
    { ...field(), snapshotId: jobId },
    { ...field(), createdAt: later },
    { ...field(), fieldName: "" },
    { ...field(), normalized: literal("not JSON") },
    { ...field(), normalized: { ...literal('"ok"'), complete: false } },
    { ...field(), normalized: { ...literal('"é"'), byteLength: 3 } },
    { ...field(), normalized: { ...literal('"partial'), byteLength: 100 } },
    { ...field(), normalized: literal(JSON.stringify("x".repeat(513))) },
    { ...field(), raw: { ...literal("{}"), format: "text" } },
    { ...field(), provenance: { ...field().provenance, snapshotId: jobId } },
    { ...field(), provenance: { ...field().provenance, confidence: 2 } },
    { ...field(), provenance: { ...field().provenance, method: "invented" } },
    { ...field(), provenance: { ...field().provenance, pointer: " " } },
    { ...field(), provenance: { ...field().provenance, excerpt: "x".repeat(4097) } },
    { ...field(), currentReview: { ...field().currentReview, rowVersion: 0 } },
    {
      ...field(),
      currentReview: { ...field().currentReview, updatedAt: "2026-10-18T12:00:00.000Z" },
    },
    {
      ...field(),
      currentReview: {
        ...field().currentReview,
        confirmation: { id: fieldId, confirmedAt: later, confirmedValueHash: "bad" },
      },
    },
    { ...field(), currentReview: { ...field().currentReview, updatedAt: now } },
    {
      ...field(),
      currentReview: {
        ...field().currentReview,
        supersededBy: { id: fieldId, jobId, snapshotId, fieldName: "title" },
      },
    },
    {
      ...field(),
      currentReview: {
        ...field().currentReview,
        supersededBy: { id: snapshotId, jobId: snapshotId, snapshotId, fieldName: "title" },
      },
    },
    {
      ...field(),
      currentReview: {
        ...field().currentReview,
        supersededBy: { id: snapshotId, jobId, snapshotId, fieldName: "description" },
      },
    },
    { ...requirement(), sourceCategory: "invented" },
    { ...requirement(), raw: null },
    { ...requirement(), raw: literal("", "text") },
    { ...requirement(), normalized: literal("", "text") },
    { ...requirement(), currentReview: { ...requirement().currentReview, userConfirmed: 1 } },
  ])(
    "fails closed on malformed stored values, provenance, and review annotations",
    async (item) => {
      expect(await readValue(page([item as never]))).toMatchObject({
        ok: false,
        error: { code: "internal", retryable: false },
      });
    },
  );
  it.each([
    { ...page(), jobId: snapshotId },
    { ...page(), snapshotId: jobId },
    { ...page(), asOf: later },
    { ...page(), includeArchived: true },
    page([field(), field()]),
    page([requirement(), field()]),
    { ...page(), hasMore: true },
    { ...page(), nextCursor: cursor() },
  ])("rejects invalid page scope/order/continuation", async (value) => {
    expect(await readValue(value)).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it("uses kind plus ID to paginate tied records across tables", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ ...page(), hasMore: true, nextCursor: cursor() })
      .mockResolvedValueOnce(page([requirement()]));
    const query = createJobSourceEvidenceQuery({ listPage: read });
    expect(await query.execute({ jobId, snapshotId, limit: 1 }, context)).toMatchObject({
      ok: true,
    });
    expect(
      await query.execute(
        { jobId, snapshotId, after: cursor() },
        { ...context, initiatedAt: later },
      ),
    ).toMatchObject({ ok: true });
    expect(read.mock.calls[1]?.[0]).toMatchObject({ asOf: now, after: cursor() });
    expect(
      await createJobSourceEvidenceQuery({ listPage: vi.fn().mockResolvedValue(page()) }).execute(
        { jobId, snapshotId, after: cursor() },
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it.each([
    { ...cursor(), kind: "requirement" },
    { ...cursor(), asOf: later },
    { ...cursor(), snapshotId: jobId },
    { ...cursor(), id: snapshotId },
  ])("requires the next cursor to match the exact final item and scope", async (nextCursor) => {
    const result = await createJobSourceEvidenceQuery({
      listPage: vi.fn().mockResolvedValue({ ...page(), hasMore: true, nextCursor }),
    }).execute({ jobId, snapshotId, limit: 1 }, context);
    expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it("distinguishes an owned empty snapshot from unavailable scope", async () => {
    expect(await readValue(page([]))).toEqual({ ok: true, value: page([]) });
    expect(await readValue(undefined)).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
  it.each([
    [new JobSourceEvidenceError("cursor_invalidated"), "conflict"],
    [new JobSourceEvidenceError("invalid_state"), "internal"],
    [new JobSourceEvidenceError("unavailable"), "unavailable"],
    [new Error("SYNTHETIC_PRIVATE_CONTENT"), "unavailable"],
  ])("maps storage errors without leaking contents", async (error, code) => {
    const result = await createJobSourceEvidenceQuery({
      listPage: vi.fn().mockRejectedValue(error),
    }).execute({ jobId, snapshotId }, context);
    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE_CONTENT");
  });
  it("rejects invalid operation context without calling storage", async () => {
    const read = vi.fn();
    const query = createJobSourceEvidenceQuery({ listPage: read });
    expect(
      await query.execute({ jobId, snapshotId }, { ...context, operationId: "invalid" } as never),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(read).not.toHaveBeenCalled();
  });
});
