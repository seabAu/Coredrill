import { describe, expect, it, vi } from "vitest";
import { createStoredRequirementReviewGate } from "../../apps/web/src/stored-requirement-review-gate.ts";

describe("per-job requirement write/readback gate", () => {
  it("holds same-job actions through readback while another job can progress", async () => {
    let releaseWrite;
    let releaseRead;
    const changed = vi.fn();
    const gate = createStoredRequirementReviewGate(changed);
    const action = vi.fn(async () => {
      await new Promise((resolve) => {
        releaseWrite = resolve;
      });
      await new Promise((resolve) => {
        releaseRead = resolve;
      });
    });
    const first = gate.run("job-a", action);
    const overlapping = vi.fn();
    expect(await gate.run("job-a", overlapping)).toBe(false);
    expect(overlapping).not.toHaveBeenCalled();
    expect(await gate.run("job-b", async () => undefined)).toBe(true);
    expect(changed).toHaveBeenLastCalledWith(["job-a"]);
    releaseWrite();
    await vi.waitFor(() => expect(releaseRead).toBeTypeOf("function"));
    expect(await gate.run("job-a", overlapping)).toBe(false);
    releaseRead();
    expect(await first).toBe(true);
    expect(changed).toHaveBeenLastCalledWith([]);
    expect(await gate.run("job-a", async () => undefined)).toBe(true);
  });
  it("releases a failed action for explicit retry and never swallows its failure", async () => {
    const changed = vi.fn();
    const gate = createStoredRequirementReviewGate(changed);
    const error = new Error("synthetic failure");
    await expect(
      gate.run("job-a", async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(changed).toHaveBeenLastCalledWith([]);
    expect(await gate.run("job-a", async () => undefined)).toBe(true);
  });
});
