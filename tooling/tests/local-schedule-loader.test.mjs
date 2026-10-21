import { describe, expect, it, vi } from "vitest";
import { createLocalScheduleLoader } from "../../apps/web/src/local-schedule-loader.ts";

describe("owned local scheduling module load", () => {
  it("does not load until requested, loads single-flight and retains only a pure resolver", async () => {
    let release;
    const resolver = vi.fn();
    const load = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const changed = vi.fn();
    const loader = createLocalScheduleLoader(changed, load);
    expect(load).not.toHaveBeenCalled();
    expect(loader.resolver()).toBeNull();
    const pending = loader.request();
    expect(loader.current()).toBe("loading");
    expect(await loader.request()).toBe(false);
    release(resolver);
    expect(await pending).toBe(true);
    expect(loader.current()).toBe("ready");
    expect(loader.resolver()).toBe(resolver);
    expect(await loader.request()).toBe(true);
    expect(load).toHaveBeenCalledOnce();
    expect(resolver).not.toHaveBeenCalled();
  });
  it("reports failure without its private exception and retries only on explicit request", async () => {
    const changed = vi.fn();
    const resolver = vi.fn();
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("synthetic-private-path"))
      .mockResolvedValue(resolver);
    const loader = createLocalScheduleLoader(changed, load);
    expect(await loader.request()).toBe(false);
    expect(loader.current()).toBe("error");
    expect(changed.mock.calls).toEqual([["loading"], ["error"]]);
    expect(loader.resolver()).toBeNull();
    expect(load).toHaveBeenCalledOnce();
    expect(await loader.request()).toBe(true);
    expect(loader.resolver()).toBe(resolver);
  });
  it.each(["success", "failure"])("ignores a late %s after owner disposal", async (outcome) => {
    let release;
    let reject;
    const load = vi.fn(
      () =>
        new Promise((resolve, fail) => {
          release = resolve;
          reject = fail;
        }),
    );
    const changed = vi.fn();
    const loader = createLocalScheduleLoader(changed, load);
    const pending = loader.request();
    loader.dispose();
    if (outcome === "success") release(vi.fn());
    else reject(new Error("private-path"));
    expect(await pending).toBe(false);
    expect(changed.mock.calls).toEqual([["loading"]]);
    expect(loader.resolver()).toBeNull();
    expect(await loader.request()).toBe(false);
    expect(load).toHaveBeenCalledOnce();
  });
  it("rejects an invalid module and retires a previously loaded resolver", async () => {
    const loader = createLocalScheduleLoader(vi.fn(), async () => null);
    expect(await loader.request()).toBe(false);
    expect(loader.current()).toBe("error");
    const ready = createLocalScheduleLoader(vi.fn(), async () => vi.fn());
    expect(await ready.request()).toBe(true);
    ready.dispose();
    expect(ready.resolver()).toBeNull();
    expect(await ready.request()).toBe(false);
  });
});
