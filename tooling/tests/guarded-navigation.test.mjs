import { describe, expect, it, vi } from "vitest";

import {
  createGuardedNavigation,
  NAVIGATION_ENTRY_KEY,
} from "../../apps/web/src/guarded-navigation.ts";

const setup = () => {
  const entries = [{ href: "/documents", state: { kind: "original-context" } }];
  let cursor = 0;
  let guard = null;
  const go = vi.fn((delta) => {
    cursor += delta;
  });
  const blocked = vi.fn();
  const navigation = createGuardedNavigation({
    history: {
      read: () => entries[cursor],
      push: (state, href) => {
        entries.splice(cursor + 1);
        entries.push({ state, href });
        cursor += 1;
      },
      replace: (state, href) => {
        entries[cursor] = { state, href };
      },
      go,
    },
    getLeaveGuard: () => guard,
    onBlocked: blocked,
  });
  navigation.initialize();
  return {
    entries,
    navigation,
    blocked,
    go,
    current: () => entries[cursor],
    setGuard: (value) => {
      guard = value;
    },
    back: () => {
      cursor -= 1;
    },
    externalPush: (href) => {
      entries.splice(cursor + 1);
      entries.push({ href, state: null });
      cursor += 1;
    },
  };
};

describe("save-before-navigation history", () => {
  it("keeps fragment-only skip navigation from remounting or flushing the editor", async () => {
    const { navigation, setGuard, externalPush, back, current } = setup();
    const guard = vi.fn(async () => undefined);
    setGuard(guard);
    const apply = vi.fn();
    externalPush("/documents#coredrill-main");
    await navigation.pop(apply);
    expect(current().href).toBe("/documents#coredrill-main");
    back();
    await navigation.pop(apply);
    expect(current().href).toBe("/documents");
    expect(apply).not.toHaveBeenCalled();
    expect(guard).not.toHaveBeenCalled();
  });

  it("restores the committed editor after several Back requests during one failed save", async () => {
    const { navigation, setGuard, back, current, entries, go } = setup();
    navigation.pushState(null, "", "/documents/first");
    navigation.pushState(null, "", "/documents/second");
    let fail;
    setGuard(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const apply = vi.fn();
    back();
    const first = navigation.pop(apply);
    await Promise.resolve();
    back();
    const second = navigation.pop(apply);
    fail(new Error("unavailable"));
    await Promise.all([first, second]);
    expect(go).toHaveBeenCalledExactlyOnceWith(2);
    expect(current().href).toBe("/documents/second");
    expect(entries).toHaveLength(3);
    expect(apply).not.toHaveBeenCalled();
  });

  it("keeps existing route context and uses synchronous navigation when no editor is mounted", () => {
    const { navigation, current } = setup();
    expect(current().state).toEqual({ kind: "original-context", [NAVIGATION_ENTRY_KEY]: 0 });
    void navigation.run(() =>
      navigation.pushState({ kind: "pipeline", snapshot: { selection: ["job"] } }, "", "/pipeline"),
    );
    expect(current()).toEqual({
      href: "/pipeline",
      state: { kind: "pipeline", snapshot: { selection: ["job"] }, [NAVIGATION_ENTRY_KEY]: 1 },
    });
    navigation.replaceState(
      { kind: "pipeline", snapshot: { selection: [] } },
      "",
      "/pipeline?view=table",
    );
    expect(current().state[NAVIGATION_ENTRY_KEY]).toBe(1);
  });

  it("waits for a durable save and coalesces rapid navigation to the latest requested destination", async () => {
    const { navigation, setGuard, current } = setup();
    let release;
    const guard = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    setGuard(guard);
    const first = navigation.run(() => navigation.pushState(null, "", "/pipeline"));
    await Promise.resolve();
    const second = navigation.run(() => navigation.pushState(null, "", "/profile"));
    expect(first).toBe(second);
    expect(current().href).toBe("/documents");
    release();
    await second;
    expect(current().href).toBe("/profile");
    expect(guard).toHaveBeenCalledTimes(1);
  });

  it("does not change the route or history length when saving fails", async () => {
    const { navigation, setGuard, current, entries, blocked } = setup();
    setGuard(async () => {
      throw new Error("private document details");
    });
    await navigation.run(() => navigation.pushState(null, "", "/pipeline"));
    expect(current().href).toBe("/documents");
    expect(entries).toHaveLength(1);
    expect(blocked).toHaveBeenCalledExactlyOnceWith();
    setGuard(async () => undefined);
    await navigation.run(() => navigation.pushState(null, "", "/pipeline"));
    expect(current().href).toBe("/pipeline");
  });

  it("reverses a failed Back without pushing a duplicate entry or losing Forward history", async () => {
    const { navigation, setGuard, current, entries, back, go, blocked } = setup();
    navigation.pushState({ kind: "editor" }, "", "/documents/exact-document");
    setGuard(async () => {
      throw new Error("storage unavailable");
    });
    back();
    const apply = vi.fn();
    await navigation.pop(apply);
    expect(go).toHaveBeenCalledExactlyOnceWith(1);
    expect(current().href).toBe("/documents/exact-document");
    expect(entries).toHaveLength(2);
    expect(apply).not.toHaveBeenCalled();
    await navigation.pop(apply); // The restoration event is not another navigation request.
    expect(apply).not.toHaveBeenCalled();
    expect(blocked).toHaveBeenCalledTimes(1);
    setGuard(async () => undefined);
    back();
    await navigation.pop(apply);
    expect(current().href).toBe("/documents");
    expect(apply).toHaveBeenCalledTimes(1);
    expect(entries).toHaveLength(2);
  });

  it("restores a legacy unindexed route in place after failure instead of discarding editor text", async () => {
    const { navigation, setGuard, entries, back, current, blocked } = setup();
    navigation.pushState(null, "", "/documents/exact-document");
    entries[0] = { href: "/legacy", state: null };
    setGuard(async () => {
      throw new Error("save failed");
    });
    back();
    await navigation.pop(vi.fn());
    expect(current().href).toBe("/documents/exact-document");
    expect(entries).toHaveLength(2);
    expect(blocked).toHaveBeenCalledTimes(1);
  });
});
