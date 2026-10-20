import { describe, expect, it, vi } from "vitest";
import { createWorkspaceStatusDraft } from "../../apps/web/src/stored-workspace-status-draft.ts";

const context = {
  jobId: "job",
  title: "Engineer",
  rowVersion: 7,
  fromStatusId: "saved",
  terminal: false,
};
const targets = [
  { id: "preparing", name: "Preparing", terminal: false },
  { id: "closed", name: "Closed", terminal: true },
];
const setup = () => {
  const move = vi.fn(async () => ({ ok: true, announcement: "saved" }));
  const changed = vi.fn();
  return { move, changed, draft: createWorkspaceStatusDraft(move, changed) };
};

describe("owned workspace status gesture", () => {
  it("captures the original viewed tuple and target catalog without sharing mutable inputs", async () => {
    const { draft, move } = setup();
    const mutable = { ...context };
    const stages = targets.map((target) => ({ ...target }));
    expect(draft.open(mutable, stages)).toBe(true);
    mutable.rowVersion = 99;
    stages[0].id = "changed";
    draft.select("job", "preparing");
    expect(await draft.save("job")).toBe(true);
    expect(move).toHaveBeenCalledExactlyOnceWith({
      jobId: "job",
      rowVersion: 7,
      fromStatusId: "saved",
      toStatusId: "preparing",
      allowReopen: false,
    });
    expect(draft.current()).toBeNull();
    expect(await draft.save("job")).toBe(false);
  });
  it("retains another job's draft until explicit owner discard", () => {
    const { draft } = setup();
    draft.open(context, targets);
    draft.select("job", "preparing");
    expect(draft.open({ ...context, jobId: "other" }, targets)).toBe(false);
    expect(draft.select("other", "closed")).toBe(false);
    expect(draft.discard("other")).toBe(false);
    expect(draft.current().context).toEqual(context);
    expect(draft.discard("job")).toBe(true);
    expect(draft.open({ ...context, jobId: "other" }, targets)).toBe(true);
  });
  it("requires an existing changed target before calling the shared mutation owner", async () => {
    const { draft, move } = setup();
    expect(await draft.save("job")).toBe(false);
    draft.open(context, [...targets, { id: "saved", name: "Saved", terminal: false }]);
    expect(await draft.save("job")).toBe(false);
    expect(draft.select("job", "unassigned")).toBe(false);
    draft.select("job", "saved");
    expect(await draft.save("job")).toBe(false);
    expect(move).not.toHaveBeenCalled();
  });
  it("requires explicit terminal reopening and resets confirmation when target changes", async () => {
    const { draft, move } = setup();
    draft.open({ ...context, fromStatusId: "closed", terminal: true }, targets);
    draft.select("job", "preparing");
    expect(await draft.save("job")).toBe(false);
    draft.confirmReopen("job", true);
    draft.select("job", "preparing");
    expect(draft.current().reopenConfirmed).toBe(false);
    draft.confirmReopen("job", true);
    expect(await draft.save("job")).toBe(true);
    expect(move.mock.calls[0][0].allowReopen).toBe(true);
  });
  it("serializes pending writes through acknowledgement without allowing replacement or cancellation", async () => {
    const { draft, move } = setup();
    let release;
    move.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    draft.open(context, targets);
    draft.select("job", "preparing");
    const pending = draft.save("job");
    expect(draft.current().busy).toBe(true);
    expect(await draft.save("job")).toBe(false);
    expect(draft.select("job", "closed")).toBe(false);
    expect(draft.confirmReopen("job", true)).toBe(false);
    expect(draft.discard("job")).toBe(false);
    release({ ok: true, announcement: "saved" });
    expect(await pending).toBe(true);
    expect(move).toHaveBeenCalledOnce();
  });
  it("keeps failures and exact versions for explicit retry rather than rebasing or automatic retry", async () => {
    const { draft, move } = setup();
    move.mockResolvedValueOnce({ ok: false, error: "This job changed; cancel and review." });
    draft.open(context, targets);
    draft.select("job", "preparing");
    expect(await draft.save("job")).toBe(false);
    expect(draft.current()).toMatchObject({
      context,
      targetId: "preparing",
      busy: false,
      error: "This job changed; cancel and review.",
    });
    expect(draft.open({ ...context, rowVersion: 8 }, targets)).toBe(false);
    expect(await draft.save("other")).toBe(false);
    expect(move).toHaveBeenCalledOnce();
    expect(await draft.save("job")).toBe(true);
    expect(move.mock.calls[1][0].rowVersion).toBe(7);
  });
  it("redacts unexpected exceptions without dropping the requested value", async () => {
    const { draft, move } = setup();
    move.mockRejectedValueOnce(new Error("PRIVATE_DATABASE_PATH"));
    draft.open(context, targets);
    draft.select("job", "preparing");
    expect(await draft.save("job")).toBe(false);
    expect(draft.current().error).not.toContain("PRIVATE_DATABASE_PATH");
    expect(draft.current()).toMatchObject({ targetId: "preparing", busy: false });
  });
  it("suppresses late publication and further actions after disposal", async () => {
    const { draft, move, changed } = setup();
    let release;
    move.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    draft.open(context, targets);
    draft.select("job", "preparing");
    const pending = draft.save("job");
    draft.dispose();
    const calls = changed.mock.calls.length;
    release({ ok: true, announcement: "saved" });
    expect(await pending).toBe(false);
    expect(changed).toHaveBeenCalledTimes(calls);
    expect(draft.open(context, targets)).toBe(false);
    expect(draft.discard("job")).toBe(false);
  });
});
