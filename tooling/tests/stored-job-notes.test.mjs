import { describe, expect, it, vi, beforeEach } from "vitest";
import { JobActivityError } from "../../packages/application/dist/index.js";
import { createStoredJobNoteApi } from "../../apps/web/src/stored-job-notes.ts";

const { append } = vi.hoisted(() => ({ append: vi.fn() }));
vi.mock("../../packages/storage-core/dist/index.js", async (original) => ({
  ...(await original()),
  createDatabaseJobNotePort: () => ({ recordInteraction: append }),
}));
const jobId = "0199b365-0000-7000-8000-000000000001";
const id = "0199b365-0000-7000-8000-000000000002";
const at = "2026-10-20T05:00:00.000Z";
const context = () => ({ operationId: "0199b365-0000-7000-8000-000000000003", initiatedAt: at });
const setup = () => {
  const open = vi.fn().mockResolvedValue({});
  const createId = vi.fn(() => id);
  return { open, createId, api: createStoredJobNoteApi(open, context, createId) };
};
beforeEach(() => {
  append.mockReset();
  append.mockImplementation(async (input) => ({ ...input, rowVersion: 1 }));
});
describe("normal local-note runtime boundary", () => {
  it("exposes only a note command and preserves exact text with operation-owned time", async () => {
    const { api, createId } = setup();
    const summary = "  é中🙂 <script>neverExecute()</script>\nKeep exact spacing.  ";
    expect(Object.keys(api)).toEqual(["recordNote"]);
    const result = await api.recordNote({
      jobId,
      summary,
      type: "email",
      contactId: id,
      direction: "outbound",
      occurredAt: "2099-01-01T00:00:00.000Z",
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        id,
        jobId,
        summary,
        type: "note",
        contactId: null,
        direction: "unknown",
        occurredAt: at,
        createdAt: at,
        updatedAt: at,
        nextActionAt: null,
      },
    });
    expect(createId).toHaveBeenCalledExactlyOnceWith("interaction");
    expect(append).toHaveBeenCalledOnce();
  });
  it.each([
    null,
    [],
    {},
    { jobId, summary: "  \n " },
    { jobId, summary: "x".repeat(2001) },
    { jobId, summary: "x\u0000y" },
    { jobId: "invalid", summary: "note" },
  ])("rejects invalid input before opening storage", async (input) => {
    const { api, open } = setup();
    expect(await api.recordNote(input)).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(open).not.toHaveBeenCalled();
  });
  it("allows the exact character limit without truncation", async () => {
    const { api } = setup();
    const summary = "é".repeat(2000);
    expect(await api.recordNote({ jobId, summary })).toMatchObject({
      ok: true,
      value: { summary },
    });
  });
  it("redacts storage-open failure and leaves retry explicit", async () => {
    const { api, open } = setup();
    open.mockRejectedValue(new Error("SYNTHETIC_PRIVATE_PATH"));
    const result = await api.recordNote({ jobId, summary: "note" });
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(open).toHaveBeenCalledOnce();
  });
  it("preserves active-job scope failure", async () => {
    const { api } = setup();
    append.mockRejectedValue(new JobActivityError("not_found"));
    expect(await api.recordNote({ jobId, summary: "note" })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });
  it("fails closed on a mismatched stored result without leaking text", async () => {
    const { api } = setup();
    append.mockImplementation(async (input) => ({ ...input, jobId: id, rowVersion: 1 }));
    expect(await api.recordNote({ jobId, summary: "note" })).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });
});
