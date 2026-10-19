import { afterEach, describe, expect, it, vi } from "vitest";
import {
  invalidateDeletedVaultViews,
  installVaultViewInvalidation,
  expectsLocalVault,
  markLocalVaultInitialized,
} from "../../apps/web/src/vault-lifecycle.ts";

afterEach(() => vi.unstubAllGlobals());

const environment = () => {
  const values = new Map();
  const target = new globalThis.EventTarget();
  const reload = vi.fn();
  vi.stubGlobal("window", Object.assign(target, { location: { reload } }));
  vi.stubGlobal("localStorage", {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  });
  return { values, target, reload };
};

describe("deleted vault view invalidation", () => {
  it("retains only a boolean recovery hint and clears it after acknowledged deletion", () => {
    const { values } = environment();
    expect(expectsLocalVault()).toBe(false);
    markLocalVaultInitialized();
    expect(expectsLocalVault()).toBe(true);
    expect([...values.entries()]).toEqual([["coredrill-vault-initialized-v1", "true"]]);
    invalidateDeletedVaultViews();
    expect(expectsLocalVault()).toBe(false);
  });
  it("stores only an opaque generation and invalidates restored pages", () => {
    const { values, target, reload } = environment();
    installVaultViewInvalidation();
    target.dispatchEvent(new globalThis.Event("pageshow"));
    expect(reload).not.toHaveBeenCalled();
    invalidateDeletedVaultViews();
    expect([...values.keys()]).toEqual(["coredrill-vault-ui-generation-v1"]);
    expect([...values.values()][0]).toMatch(/^[0-9a-f-]{36}$/u);
    target.dispatchEvent(new globalThis.Event("pageshow"));
    expect(reload).toHaveBeenCalledOnce();
  });
  it("ignores unrelated storage events and reloads on changed vault generation", () => {
    const { target, reload } = environment();
    installVaultViewInvalidation();
    invalidateDeletedVaultViews();
    target.dispatchEvent(Object.assign(new globalThis.Event("storage"), { key: "unrelated" }));
    expect(reload).not.toHaveBeenCalled();
    target.dispatchEvent(
      Object.assign(new globalThis.Event("storage"), { key: "coredrill-vault-ui-generation-v1" }),
    );
    expect(reload).toHaveBeenCalledOnce();
  });
  it("does not claim cross-window invalidation when localStorage is unavailable", () => {
    const { target, reload } = environment();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(() => installVaultViewInvalidation()).not.toThrow();
    expect(() => invalidateDeletedVaultViews()).not.toThrow();
    target.dispatchEvent(new globalThis.Event("pageshow"));
    expect(reload).not.toHaveBeenCalled();
  });
});
