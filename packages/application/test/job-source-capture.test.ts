import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import fixture from "../../contracts/test/fixtures/capture-envelope.valid.json" with { type: "json" };
import {
  createJobSourceCaptureQuery,
  JobSourceCaptureError,
  type JobSourceCaptureScope,
  type JobSourceCaptureRecord,
} from "../src/index.js";

const jobId = entityId("job", "0198e204-0000-7000-8000-000000000001");
const snapshotId = entityId("source-snapshot", "0198e204-0000-7000-8000-000000000002");
const context = {
  operationId: entityId("application-operation", "0198e204-0000-7000-8000-000000000003"),
  initiatedAt: instant("2026-10-19T12:00:00.000Z"),
};
const request = { jobId, snapshotId };
const row = (scope: JobSourceCaptureScope): JobSourceCaptureRecord => ({
  ...scope,
  capturedAt: instant(fixture.capturedAt),
  contentHash: fixture.contentHash,
  receipt: {
    envelopeId: fixture.id,
    checksum: "b".repeat(64),
    envelopeJson: JSON.stringify(fixture),
  },
});

describe("original capture-time source query", () => {
  it("keeps an explicitly retained empty candidate set distinct from missing receipt", async () => {
    const empty = { ...fixture, fieldCandidates: [] };
    const result = await createJobSourceCaptureQuery(
      {
        readCapture: async (scope) => ({
          ...row(scope),
          receipt: { ...row(scope).receipt!, envelopeJson: JSON.stringify(empty) },
        }),
      },
      async () => true,
    ).execute({ ...request, includeArchived: true }, context);
    expect(result).toMatchObject({
      ok: true,
      value: { includeArchived: true, availability: "retained", capture: { fieldCandidates: [] } },
    });
  });
  it("returns original bounded evidence after validation and injected full/semantic hash verification", async () => {
    const verify = vi.fn(async () => true);
    const readCapture = vi.fn(async (scope: JobSourceCaptureScope) => row(scope));
    const result = await createJobSourceCaptureQuery({ readCapture }, verify).execute(
      request,
      context,
    );
    expect(result).toMatchObject({
      ok: true,
      value: { availability: "retained", capture: fixture },
    });
    expect(readCapture).toHaveBeenCalledWith({
      ...request,
      includeArchived: false,
      asOf: context.initiatedAt,
    });
    expect(verify).toHaveBeenCalledExactlyOnceWith(fixture, "b".repeat(64));
    // Already expired transfer metadata must not expire retained historical evidence.
    expect(fixture.expiresAt < context.initiatedAt).toBe(true);
    if (!result.ok) throw new Error("unexpected failure");
    expect(Object.isFrozen(result.value)).toBe(true);
  });
  it("distinguishes an unlinked snapshot from an empty captured candidate set", async () => {
    const verify = vi.fn(async () => true);
    const result = await createJobSourceCaptureQuery(
      { readCapture: async (scope) => ({ ...row(scope), receipt: null }) },
      verify,
    ).execute(request, context);
    expect(result).toMatchObject({
      ok: true,
      value: { availability: "not_retained", capture: null },
    });
    expect(verify).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    { ...request, jobId: "' OR 1=1" },
    { ...request, includeArchived: 1 },
    { ...request, extra: true },
  ])("rejects invalid input before reading: %j", async (input) => {
    const readCapture = vi.fn();
    const result = await createJobSourceCaptureQuery({ readCapture }, async () => true).execute(
      input as typeof request,
      context,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(readCapture).not.toHaveBeenCalled();
  });
  it.each(["jobId", "snapshotId", "includeArchived", "asOf", "capturedAt", "contentHash"])(
    "rejects mismatched/invalid stored %s",
    async (key) => {
      const result = await createJobSourceCaptureQuery(
        { readCapture: async (scope) => ({ ...row(scope), [key]: "invalid/private" }) },
        async () => true,
      ).execute(request, context);
      expect(result).toMatchObject({ ok: false, error: { code: "internal", retryable: false } });
      expect(JSON.stringify(result)).not.toContain("private");
    },
  );
  it.each(["id", "capturedAt", "contentHash", "specVersion", "provenance"])(
    "rejects invalid original capture %s before hash verification",
    async (key) => {
      const original = structuredClone(fixture);
      const raw: Record<string, unknown> = original;
      if (key === "provenance") original.fieldCandidates[0]!.provenance.source.sourceId = jobId;
      else raw[key] = key === "specVersion" ? 2 : "invalid";
      const verify = vi.fn(async () => true);
      const result = await createJobSourceCaptureQuery(
        {
          readCapture: async (scope) => ({
            ...row(scope),
            receipt: { ...row(scope).receipt!, envelopeJson: JSON.stringify(original) },
          }),
        },
        verify,
      ).execute(request, context);
      expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
      expect(verify).not.toHaveBeenCalled();
    },
  );
  it.each([
    "{",
    "x".repeat(2 * 1024 * 1024 + 1),
    "中".repeat(700_000),
    "[".repeat(45) + "0" + "]".repeat(45),
    JSON.stringify(Array.from({ length: 20_001 }, () => 0)),
  ])("rejects corrupt, oversized, deep or broad JSON before recursive validation", async (json) => {
    const verify = vi.fn(async () => true);
    const result = await createJobSourceCaptureQuery(
      {
        readCapture: async (scope) => ({
          ...row(scope),
          receipt: { ...row(scope).receipt!, envelopeJson: json },
        }),
      },
      verify,
    ).execute(request, context);
    expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(verify).not.toHaveBeenCalled();
  });
  it.each([false, "throw"])("fails closed when hash verification returns %s", async (mode) => {
    const result = await createJobSourceCaptureQuery(
      { readCapture: async (scope) => row(scope) },
      async () => {
        if (mode === "throw") throw new Error("C:/private/resume");
        return false;
      },
    ).execute(request, context);
    expect(result).toMatchObject({ ok: false, error: { code: "internal", retryable: false } });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it.each([new Error("private/database"), new JobSourceCaptureError("invalid_state")])(
    "redacts storage failure",
    async (failure) => {
      const result = await createJobSourceCaptureQuery(
        {
          readCapture: async () => {
            throw failure;
          },
        },
        async () => true,
      ).execute(request, context);
      expect(result).toMatchObject({
        ok: false,
        error: { code: failure instanceof JobSourceCaptureError ? "internal" : "unavailable" },
      });
      expect(JSON.stringify(result)).not.toContain("private");
    },
  );
  it("keeps unavailable scope distinct from missing original capture", async () => {
    const result = await createJobSourceCaptureQuery(
      { readCapture: async () => undefined },
      async () => true,
    ).execute(request, context);
    expect(result).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});
