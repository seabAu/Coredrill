import { describe, expect, it, vi } from "vitest";
import { createWorkspaceNextActionDraft } from "../../apps/web/src/stored-workspace-next-action-draft.ts";

const jobId = "0199b367-0000-7000-8000-000000000001";
const otherId = "0199b367-0000-7000-8000-000000000002";
const context = { jobId, title: "Engineer", rowVersion: 7 };
const wall = "2026-11-01T01:30";
const zone = "America/New_York";
const earlier = "2026-11-01T05:30:00.000Z";
const later = "2026-11-01T06:30:00.000Z";
const setup = () => {
  const save = vi.fn(async () => ({ ok: true, announcement: "saved" }));
  const resolve = vi.fn(() => ({ kind: "resolved", timeZone: zone, candidates: [earlier] }));
  const changed = vi.fn();
  return { save, resolve, changed, draft: createWorkspaceNextActionDraft(save, resolve, changed) };
};
const schedule = (draft) => {
  draft.open(context);
  draft.editTitle(jobId, "Research the team");
  draft.setScheduled(jobId, true);
  draft.editSchedule(jobId, wall, zone);
};

describe("owned workspace next-action draft", () => {
  it("copies the viewed owner/version and sends an unscheduled task with no invented clock context", async () => {
    const { draft, save, resolve } = setup();
    const original = { ...context };
    expect(draft.open(original)).toBe(true);
    original.rowVersion = 99;
    original.jobId = otherId;
    draft.editTitle(jobId, "  é中🙂 Ask about <local> team  ");
    draft.editSchedule(jobId, wall, zone);
    expect(await draft.save(jobId)).toBe(true);
    expect(save).toHaveBeenCalledExactlyOnceWith({
      jobId,
      title: "  é中🙂 Ask about <local> team  ",
      expected: { jobRowVersion: 7 },
      dueAt: null,
      timeZone: null,
    });
    expect(Object.isFrozen(save.mock.calls[0][0])).toBe(true);
    expect(Object.isFrozen(save.mock.calls[0][0].expected)).toBe(true);
    expect(resolve).not.toHaveBeenCalled();
    expect(draft.current()).toBeNull();
    expect(await draft.save(jobId)).toBe(false);
  });
  it.each([0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "refuses invalid viewed row version %s",
    (rowVersion) => {
      const { draft, changed } = setup();
      expect(draft.open({ ...context, rowVersion })).toBe(false);
      expect(changed).not.toHaveBeenCalled();
    },
  );
  it("rejects invalid ownership identities and empty/oversized task text without a write", async () => {
    const { draft, save } = setup();
    expect(draft.open({ ...context, jobId: "invalid" })).toBe(false);
    expect(await draft.save(jobId)).toBe(false);
    draft.open(context);
    draft.editTitle(jobId, " \n ");
    expect(await draft.save(jobId)).toBe(false);
    expect(draft.editTitle(jobId, "x".repeat(513))).toBe(false);
    expect(draft.current().title).toBe(" \n ");
    expect(save).not.toHaveBeenCalled();
  });
  it("retains foreign-job intent until explicit owner discard without rebinding to a new version", async () => {
    const { draft, save, resolve } = setup();
    schedule(draft);
    expect(draft.open({ ...context, jobId: otherId, rowVersion: 8 })).toBe(false);
    expect(draft.editTitle(otherId, "Other task")).toBe(false);
    expect(draft.editSchedule(otherId, "different", "UTC")).toBe(false);
    expect(draft.setScheduled(otherId, false)).toBe(false);
    expect(draft.resolveSchedule(otherId)).toBe(false);
    expect(draft.selectOccurrence(otherId, earlier)).toBe(false);
    expect(draft.discard(otherId)).toBe(false);
    expect(await draft.save(otherId)).toBe(false);
    expect(draft.current()).toMatchObject({
      context,
      title: "Research the team",
      localDateTime: wall,
    });
    expect(save).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    expect(draft.discard(jobId)).toBe(true);
    expect(draft.open({ ...context, jobId: otherId })).toBe(true);
  });
  it.each(["gap", "invalid"])(
    "never writes a scheduled %s or unresolved clock time",
    async (kind) => {
      const { draft, save, resolve } = setup();
      schedule(draft);
      expect(await draft.save(jobId)).toBe(false);
      resolve.mockReturnValueOnce({ kind });
      expect(draft.resolveSchedule(jobId)).toBe(false);
      expect(draft.current()).toMatchObject({
        localDateTime: wall,
        timeZone: zone,
        resolution: null,
        selectedDueAt: null,
      });
      expect(draft.current().error).toBeTruthy();
      expect(await draft.save(jobId)).toBe(false);
      expect(save).not.toHaveBeenCalled();
    },
  );
  it("saves a unique resolved exact instant and zone rather than converting again at submission", async () => {
    const { draft, save, resolve } = setup();
    schedule(draft);
    expect(draft.resolveSchedule(jobId)).toBe(true);
    expect(draft.current().selectedDueAt).toBe(earlier);
    expect(resolve).toHaveBeenCalledExactlyOnceWith(wall, zone);
    expect(await draft.save(jobId)).toBe(true);
    expect(save.mock.calls[0][0]).toMatchObject({
      dueAt: earlier,
      timeZone: zone,
      expected: { jobRowVersion: 7 },
    });
    expect(resolve).toHaveBeenCalledOnce();
  });
  it("requires deliberate selection among distinct overlap occurrences", async () => {
    const { draft, save, resolve } = setup();
    resolve.mockReturnValueOnce({ kind: "resolved", timeZone: zone, candidates: [later, earlier] });
    schedule(draft);
    expect(draft.resolveSchedule(jobId)).toBe(true);
    expect(draft.current().resolution.candidates).toEqual([earlier, later]);
    expect(draft.current().selectedDueAt).toBeNull();
    expect(await draft.save(jobId)).toBe(false);
    expect(draft.selectOccurrence(jobId, "2026-11-01T07:30:00.000Z")).toBe(false);
    expect(draft.selectOccurrence(jobId, later)).toBe(true);
    expect(await draft.save(jobId)).toBe(true);
    expect(save.mock.calls[0][0].dueAt).toBe(later);
  });
  it("invalidates resolution on clock/zone/mode edits while retaining literal input", async () => {
    const { draft, save } = setup();
    schedule(draft);
    draft.resolveSchedule(jobId);
    draft.editTitle(jobId, "Updated task");
    expect(draft.current().selectedDueAt).toBe(earlier);
    draft.editSchedule(jobId, "2026-11-01T02:30", zone);
    expect(draft.current()).toMatchObject({ resolution: null, selectedDueAt: null });
    expect(await draft.save(jobId)).toBe(false);
    draft.resolveSchedule(jobId);
    draft.editSchedule(jobId, "2026-11-01T02:30", "UTC");
    expect(draft.current().resolution).toBeNull();
    draft.setScheduled(jobId, false);
    expect(draft.current()).toMatchObject({ localDateTime: "2026-11-01T02:30", timeZone: "UTC" });
    expect(await draft.save(jobId)).toBe(true);
    expect(save.mock.calls[0][0]).toMatchObject({ dueAt: null, timeZone: null });
  });
  it.each([
    { kind: "resolved", timeZone: "UTC", candidates: [earlier] },
    { kind: "resolved", timeZone: zone, candidates: [] },
    { kind: "resolved", timeZone: zone, candidates: [earlier, earlier] },
    { kind: "resolved", timeZone: zone, candidates: ["invalid"] },
    null,
  ])("fails closed on invalid resolver output %j", async (output) => {
    const { draft, resolve, save } = setup();
    schedule(draft);
    resolve.mockReturnValueOnce(output);
    expect(draft.resolveSchedule(jobId)).toBe(false);
    expect(draft.current().resolution).toBeNull();
    expect(await draft.save(jobId)).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
  it("copies frozen candidate facts and ignores later mutation of resolver-owned arrays", () => {
    const { draft, resolve } = setup();
    const output = { kind: "resolved", timeZone: zone, candidates: [earlier, later] };
    resolve.mockReturnValueOnce(output);
    schedule(draft);
    draft.resolveSchedule(jobId);
    output.candidates[0] = "changed";
    output.timeZone = "UTC";
    const state = draft.current();
    expect(state.resolution.candidates).toEqual([earlier, later]);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.context)).toBe(true);
    expect(Object.isFrozen(state.resolution)).toBe(true);
    expect(Object.isFrozen(state.resolution.candidates)).toBe(true);
  });
  it("bounds raw input without truncation and rejects an empty clock before invoking conversion", async () => {
    const { draft, resolve, save } = setup();
    draft.open(context);
    expect(draft.editTitle(jobId, "é".repeat(512))).toBe(true);
    expect(draft.editSchedule(jobId, "x".repeat(41), zone)).toBe(false);
    expect(draft.editSchedule(jobId, wall, "x".repeat(129))).toBe(false);
    expect(draft.current().localDateTime).toBe("");
    draft.setScheduled(jobId, true);
    draft.editSchedule(jobId, "  ", zone);
    expect(draft.resolveSchedule(jobId)).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
    expect(await draft.save(jobId)).toBe(false);
    expect(save).not.toHaveBeenCalled();
    draft.setScheduled(jobId, false);
    expect(await draft.save(jobId)).toBe(true);
    expect(save.mock.calls[0][0].title).toBe("é".repeat(512));
  });
  it("serializes through acknowledgement and blocks duplicate writes, edits and cancellation", async () => {
    const { draft, save } = setup();
    let release;
    save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    schedule(draft);
    draft.resolveSchedule(jobId);
    const pending = draft.save(jobId);
    expect(draft.current().busy).toBe(true);
    expect(await draft.save(jobId)).toBe(false);
    expect(draft.editTitle(jobId, "changed")).toBe(false);
    expect(draft.editSchedule(jobId, "different", "UTC")).toBe(false);
    expect(draft.setScheduled(jobId, false)).toBe(false);
    expect(draft.resolveSchedule(jobId)).toBe(false);
    expect(draft.selectOccurrence(jobId, earlier)).toBe(false);
    expect(draft.discard(jobId)).toBe(false);
    expect(draft.open(context)).toBe(false);
    release({ ok: true, announcement: "saved" });
    expect(await pending).toBe(true);
    expect(save).toHaveBeenCalledOnce();
  });
  it("retains exact failed intent and captured version for explicit retry, without implicit rebase", async () => {
    const { draft, save } = setup();
    save.mockResolvedValueOnce({ ok: false, error: "Changed job; review before retry." });
    schedule(draft);
    draft.resolveSchedule(jobId);
    expect(await draft.save(jobId)).toBe(false);
    expect(draft.current()).toMatchObject({
      context,
      title: "Research the team",
      localDateTime: wall,
      timeZone: zone,
      selectedDueAt: earlier,
      busy: false,
      error: "Changed job; review before retry.",
    });
    expect(draft.open({ ...context, rowVersion: 8 })).toBe(false);
    expect(save).toHaveBeenCalledOnce();
    expect(await draft.save(jobId)).toBe(true);
    expect(save.mock.calls[1][0].expected.jobRowVersion).toBe(7);
  });
  it("redacts unknown conversion/write exceptions while retaining the literal draft", async () => {
    const { draft, save, resolve } = setup();
    schedule(draft);
    resolve.mockImplementationOnce(() => {
      throw new Error("PRIVATE_ZONE_CONFIG");
    });
    expect(draft.resolveSchedule(jobId)).toBe(false);
    expect(draft.current().error).not.toContain("PRIVATE");
    draft.resolveSchedule(jobId);
    save.mockRejectedValueOnce(new Error("PRIVATE_DATABASE_PATH"));
    expect(await draft.save(jobId)).toBe(false);
    expect(draft.current()).toMatchObject({
      localDateTime: wall,
      timeZone: zone,
      selectedDueAt: earlier,
    });
    expect(draft.current().error).not.toContain("PRIVATE");
    expect(save).toHaveBeenCalledOnce();
  });
  it("suppresses late publication and actions after disposal", async () => {
    const { draft, save, changed } = setup();
    let release;
    save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    schedule(draft);
    draft.resolveSchedule(jobId);
    const pending = draft.save(jobId);
    draft.dispose();
    const calls = changed.mock.calls.length;
    release({ ok: true, announcement: "saved" });
    expect(await pending).toBe(false);
    expect(changed).toHaveBeenCalledTimes(calls);
    expect(draft.open(context)).toBe(false);
    expect(draft.discard(jobId)).toBe(false);
    expect(draft.resolveSchedule(jobId)).toBe(false);
    expect(draft.selectOccurrence(jobId, earlier)).toBe(false);
  });
});
