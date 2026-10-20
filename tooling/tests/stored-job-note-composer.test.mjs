import { describe, expect, it, vi } from "vitest";
import { createStoredJobNoteComposer } from "../../apps/web/src/stored-job-note-composer.ts";
const jobId = "0199b365-0000-7000-8000-000000000001";
const other = "0199b365-0000-7000-8000-000000000003";
const savedId = "0199b365-0000-7000-8000-000000000002";
const success = (input) => ({
  ok: true,
  value: { id: savedId, jobId: input.jobId, summary: input.summary, type: "note" },
});
const setup = () => {
  const recordNote = vi.fn(async (input) => success(input));
  const changed = vi.fn();
  return {
    recordNote,
    changed,
    composer: createStoredJobNoteComposer(() => ({ recordNote }), changed),
  };
};
describe("root-owned single local-note draft", () => {
  it("keeps exact unsaved text until explicit acknowledgement", async () => {
    const { composer, recordNote } = setup();
    const text = "  é中🙂 <script>neverExecute()</script>\nKeep spacing.  ";
    composer.edit(jobId, text);
    expect(composer.current().text).toBe(text);
    expect(await composer.save(jobId)).toBe(true);
    expect(recordNote).toHaveBeenCalledExactlyOnceWith({ jobId, summary: text });
    expect(composer.current()).toEqual({ jobId, text: "", busy: false, error: null, savedId });
    expect(await composer.save(jobId)).toBe(false);
    expect(recordNote).toHaveBeenCalledOnce();
  });
  it("never replaces another job's unsaved draft implicitly", () => {
    const { composer } = setup();
    composer.edit(jobId, "original");
    expect(composer.edit(other, "other")).toBe(false);
    expect(composer.discard(other)).toBe(false);
    expect(composer.current()).toMatchObject({ jobId, text: "original" });
    expect(composer.discard(jobId)).toBe(true);
    expect(composer.edit(other, "other")).toBe(true);
  });
  it("bounds text without truncating or replacing a previous draft", () => {
    const { composer } = setup();
    expect(composer.edit(jobId, "x".repeat(2000))).toBe(true);
    const before = composer.current();
    expect(composer.edit(jobId, "x".repeat(2001))).toBe(false);
    expect(composer.current()).toBe(before);
    expect(Object.isFrozen(before)).toBe(true);
  });
  it("rejects blank and wrong-job saves without calling the runtime", async () => {
    const { composer, recordNote } = setup();
    expect(await composer.save(jobId)).toBe(false);
    composer.edit(jobId, " \n ");
    expect(await composer.save(jobId)).toBe(false);
    composer.edit(jobId, "note");
    expect(await composer.save(other)).toBe(false);
    expect(recordNote).not.toHaveBeenCalled();
  });
  it("keeps write ownership until acknowledgement and rejects duplicate submit/edit/discard", async () => {
    const { composer, recordNote } = setup();
    let release;
    recordNote.mockImplementationOnce(
      (input) =>
        new Promise((resolve) => {
          release = () => resolve(success(input));
        }),
    );
    composer.edit(jobId, "note");
    const pending = composer.save(jobId);
    expect(composer.current()).toMatchObject({ busy: true, text: "note", savedId: null });
    expect(await composer.save(jobId)).toBe(false);
    expect(composer.edit(jobId, "replacement")).toBe(false);
    expect(composer.discard(jobId)).toBe(false);
    release();
    expect(await pending).toBe(true);
    expect(recordNote).toHaveBeenCalledOnce();
  });
  it.each(["throw", "result", "wrong-job", "wrong-text", "wrong-kind"])(
    "retains text and content-free uncertainty after %s failure without automatic retry",
    async (mode) => {
      const { composer, recordNote } = setup();
      recordNote.mockImplementationOnce(async (input) => {
        if (mode === "throw") throw new Error("SYNTHETIC_PRIVATE_NOTE_PATH");
        if (mode === "result")
          return { ok: false, error: { message: "SYNTHETIC_PRIVATE_NOTE_PATH" } };
        return {
          ok: true,
          value: {
            ...success(input).value,
            ...(mode === "wrong-job"
              ? { jobId: other }
              : mode === "wrong-text"
                ? { summary: "other" }
                : { type: "email" }),
          },
        };
      });
      composer.edit(jobId, "retain me");
      expect(await composer.save(jobId)).toBe(false);
      expect(composer.current()).toMatchObject({
        jobId,
        text: "retain me",
        busy: false,
        savedId: null,
      });
      expect(composer.current().error).toContain("Refresh history");
      expect(composer.current().error).not.toContain("PRIVATE");
      expect(recordNote).toHaveBeenCalledOnce();
    },
  );
  it("suppresses late acknowledgement after disposal", async () => {
    const { composer, recordNote, changed } = setup();
    let release;
    recordNote.mockImplementationOnce(
      (input) =>
        new Promise((resolve) => {
          release = () => resolve(success(input));
        }),
    );
    composer.edit(jobId, "note");
    const pending = composer.save(jobId);
    composer.dispose();
    const count = changed.mock.calls.length;
    release();
    expect(await pending).toBe(false);
    expect(changed).toHaveBeenCalledTimes(count);
    expect(composer.edit(jobId, "new")).toBe(false);
    expect(composer.discard(jobId)).toBe(false);
  });
});
