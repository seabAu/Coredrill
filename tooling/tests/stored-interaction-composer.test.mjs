import { describe, expect, it, vi } from "vitest";
import { createStoredInteractionComposer } from "../../apps/web/src/stored-interaction-composer.ts";

const id = (n) => `0198e109-0000-7000-8000-${String(n).padStart(12, "0")}`;
const scope = {
  specVersion: 1,
  expectedVaultId: id(1),
  jobId: id(2),
  jobRowVersion: 1,
  contactId: id(3),
  contactRowVersion: 2,
};
const label = { job: "Synthetic job", contact: "Synthetic contact" };
const setup = () => {
  let phase = "editing";
  const save = vi.fn(async () => {
    phase = "recorded";
    return { ok: true, value: { id: id(4), jobId: id(2) } };
  });
  const check = vi.fn(async () => {
    phase = "not_recorded";
    return { ok: true, value: { state: "not_recorded", interaction: null } };
  });
  const dispose = vi.fn();
  const beginRecording = vi.fn(() => ({ save, check, dispose, phase: () => phase }));
  let allowed = true;
  const exclusive = vi.fn(async (_vault, work) => work());
  const changed = vi.fn();
  const composer = createStoredInteractionComposer({
    api: () => ({ beginRecording }),
    changed,
    allowed: () => allowed,
    exclusive,
  });
  return {
    composer,
    save,
    check,
    dispose,
    beginRecording,
    exclusive,
    changed,
    setPhase: (value) => {
      phase = value;
    },
    setAllowed: (value) => {
      allowed = value;
    },
  };
};

describe("normal interaction draft ownership and recovery", () => {
  it("a failed acknowledgement read cannot unlock or resend the original intent", async () => {
    const s = setup();
    s.composer.start(scope, label);
    s.save.mockImplementationOnce(async () => {
      s.setPhase("uncertain");
      return { ok: false };
    });
    await s.composer.save(scope);
    s.check.mockResolvedValueOnce({ ok: false, error: { message: "PRIVATE_READ_SENTINEL" } });
    expect(await s.composer.check(id(1))).toBe(false);
    expect(s.composer.current().phase).toBe("uncertain");
    expect(JSON.stringify(s.composer.current())).not.toContain("PRIVATE_READ_SENTINEL");
    expect(await s.composer.save(scope)).toBe(false);
    expect(s.save).toHaveBeenCalledTimes(1);
  });
  it("permission and explicit contact versions remain mandatory on edits and saves", async () => {
    const s = setup();
    s.composer.start(scope, label);
    const otherVersion = { ...scope, contactRowVersion: 3 };
    expect(s.composer.edit(otherVersion, "summary", "wrong")).toBe(false);
    expect(await s.composer.save(otherVersion)).toBe(false);
    s.setAllowed(false);
    expect(s.composer.edit(scope, "summary", "blocked")).toBe(false);
    expect(await s.composer.save(scope)).toBe(false);
    expect(s.save).not.toHaveBeenCalled();
  });
  it("opens only explicitly, copies ownership and preserves exact literal fields", async () => {
    const s = setup();
    expect(s.beginRecording).not.toHaveBeenCalled();
    const mutable = { ...scope };
    expect(s.composer.start(mutable, label)).toBe(true);
    mutable.jobId = id(99);
    const summary = "\uFEFF  🧭 <script>inert</script>\n ";
    expect(s.composer.edit(scope, "summary", summary)).toBe(true);
    expect(Object.isFrozen(s.composer.current().fields)).toBe(true);
    expect(await s.composer.save(scope)).toBe(true);
    expect(s.save).toHaveBeenCalledExactlyOnceWith({ type: "note", direction: "unknown", summary });
    expect(s.exclusive.mock.calls[0][0]).toBe(id(1));
    expect(s.composer.current()).toMatchObject({ phase: "recorded", recovered: false, scope });
    expect(await s.composer.save(scope)).toBe(false);
    expect(s.composer.hasUnsaved()).toBe(false);
  });
  it("does not replace, edit, discard or save another owner's draft", async () => {
    const s = setup(),
      other = { ...scope, jobId: id(99) };
    s.composer.start(scope, label);
    s.composer.edit(scope, "summary", "private original");
    expect(s.composer.start(other, label)).toBe(false);
    expect(s.composer.edit(other, "summary", "other")).toBe(false);
    expect(await s.composer.save(other)).toBe(false);
    expect(s.composer.discard(id(99))).toBe(false);
    expect(s.composer.current().fields.summary).toBe("private original");
    expect(s.save).not.toHaveBeenCalled();
  });
  it("refuses stale versions, oversize/NUL and invalid fields without altering text", async () => {
    const s = setup();
    s.composer.start(scope, label);
    expect(s.composer.edit(scope, "summary", "x".repeat(200000))).toBe(true);
    const before = s.composer.current();
    for (const value of ["x".repeat(200001), "bad\0value"])
      expect(s.composer.edit(scope, "summary", value)).toBe(false);
    expect(s.composer.edit(scope, "type", "send_email")).toBe(false);
    expect(s.composer.edit(scope, "direction", "invented")).toBe(false);
    expect(s.composer.current()).toBe(before);
    expect(await s.composer.save({ ...scope, jobRowVersion: 2 })).toBe(false);
    expect(s.save).not.toHaveBeenCalled();
  });
  it("retains a failed dispatched intent and requires read-only absence before identical retry", async () => {
    const s = setup();
    s.composer.start(scope, label);
    s.composer.edit(scope, "summary", "original");
    s.save.mockImplementationOnce(async () => {
      s.setPhase("uncertain");
      return { ok: false, error: { message: "private /path" } };
    });
    expect(await s.composer.save(scope)).toBe(false);
    expect(s.composer.current()).toMatchObject({
      phase: "uncertain",
      fields: { summary: "original" },
    });
    expect(s.composer.current().error).not.toContain("private");
    expect(s.composer.edit(scope, "summary", "replacement")).toBe(false);
    expect(await s.composer.save(scope)).toBe(false);
    expect(await s.composer.check(id(1))).toBe(false);
    expect(s.composer.current().phase).toBe("not_recorded");
    expect(s.save).toHaveBeenCalledTimes(1);
    expect(await s.composer.save(scope)).toBe(true);
    expect(s.save.mock.calls[1]).toEqual(s.save.mock.calls[0]);
    expect(s.beginRecording).toHaveBeenCalledTimes(1);
  });
  it("recovers acknowledged history without another write even after owner versions change", async () => {
    const s = setup();
    s.composer.start(scope, label);
    s.save.mockImplementationOnce(async () => {
      s.setPhase("uncertain");
      throw new Error("private");
    });
    expect(await s.composer.save(scope)).toBe(false);
    s.check.mockImplementationOnce(async () => {
      s.setPhase("recorded");
      return { ok: true, value: { state: "recorded", interaction: { id: id(4) } } };
    });
    expect(await s.composer.check(id(99))).toBe(false);
    expect(await s.composer.check(id(1))).toBe(true);
    expect(s.composer.current()).toMatchObject({ phase: "recorded", recovered: true });
    expect(s.save).toHaveBeenCalledTimes(1);
  });
  it("does not submit when shared vault exclusion denies the operation", async () => {
    const s = setup();
    s.composer.start(scope, label);
    s.exclusive.mockResolvedValueOnce({ ok: false, error: { message: "private" } });
    expect(await s.composer.save(scope)).toBe(false);
    expect(s.save).not.toHaveBeenCalled();
    expect(s.composer.current().phase).toBe("editing");
  });
  it("locks pending fields/discard/duplicate work and suppresses retired publication", async () => {
    const s = setup();
    s.composer.start(scope, label);
    let finish;
    s.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = s.composer.save(scope);
    expect(s.composer.current().busy).toBe(true);
    expect(s.composer.edit(scope, "summary", "changed")).toBe(false);
    expect(s.composer.discard(id(1))).toBe(false);
    expect(await s.composer.check(id(1))).toBe(false);
    expect(await s.composer.save(scope)).toBe(false);
    s.composer.dispose();
    const count = s.changed.mock.calls.length;
    finish({ ok: true, value: { id: id(4) } });
    expect(await pending).toBe(false);
    expect(s.changed).toHaveBeenCalledTimes(count);
    expect(s.dispose).toHaveBeenCalledTimes(1);
  });
  it("retires on discard and checks live permission again before entering a delayed slot", async () => {
    const s = setup();
    s.composer.start(scope, label);
    s.exclusive.mockImplementationOnce(async (_vault, work) => {
      s.setAllowed(false);
      return work();
    });
    expect(await s.composer.save(scope)).toBe(false);
    expect(s.save).not.toHaveBeenCalled();
    s.setAllowed(true);
    expect(s.composer.discard(id(1))).toBe(true);
    expect(s.dispose).toHaveBeenCalledOnce();
    expect(s.composer.current()).toBeNull();
  });
});
