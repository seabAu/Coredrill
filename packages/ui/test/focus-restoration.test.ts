import { afterEach, describe, expect, it, vi } from "vitest";
import { restoreFocusAfterChange } from "../src/focus-restoration.js";

const element = (isConnected = true): HTMLElement =>
  ({ isConnected, focus: vi.fn() }) as unknown as HTMLElement;

const setup = () => {
  const origin = element();
  const body = element();
  const state = { activeElement: origin as Element | null, body };
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("document", state);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  return { origin, body, state, frame: () => frames.shift()?.(0) };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("post-render focus ownership", () => {
  it("restores an owned interaction only after rendering", () => {
    const { origin, frame } = setup();
    const target = element();
    restoreFocusAfterChange(origin, () => target);
    expect(target.focus).not.toHaveBeenCalled();
    frame();
    expect(target.focus).toHaveBeenCalledOnce();
  });

  it("uses the connected fallback when the original control has disappeared", () => {
    const { body, state, frame } = setup();
    state.activeElement = body;
    const target = element();
    restoreFocusAfterChange(element(false), () => target);
    frame();
    expect(target.focus).toHaveBeenCalledOnce();
  });

  it("preserves deliberate focus movement without resolving another target", () => {
    const { origin, state, frame } = setup();
    const target = element();
    const resolve = vi.fn(() => target);
    restoreFocusAfterChange(origin, resolve);
    state.activeElement = element();
    frame();
    expect(resolve).not.toHaveBeenCalled();
    expect(target.focus).not.toHaveBeenCalled();
  });

  it("resolves the current target lazily instead of retaining an old DOM reference", () => {
    const { origin, frame } = setup();
    const previous = element(false);
    let current = previous;
    restoreFocusAfterChange(origin, () => current);
    current = element();
    frame();
    expect(previous.focus).not.toHaveBeenCalled();
    expect(current.focus).toHaveBeenCalledOnce();
  });

  it("does not focus a disconnected target", () => {
    const { origin, frame } = setup();
    const target = element(false);
    restoreFocusAfterChange(origin, () => target);
    frame();
    expect(target.focus).not.toHaveBeenCalled();
  });

  it("allows a missing target without creating an unrelated focus destination", () => {
    const { origin, frame } = setup();
    restoreFocusAfterChange(origin, () => null);
    expect(frame).not.toThrow();
  });

  it("restores a connected target when the document has no active element", () => {
    const { state, frame } = setup();
    state.activeElement = null;
    const target = element();
    restoreFocusAfterChange(null, () => target);
    frame();
    expect(target.focus).toHaveBeenCalledOnce();
  });
});
