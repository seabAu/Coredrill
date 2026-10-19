import { describe, expect, it, vi } from "vitest";
import {
  closeHostedAppContext,
  closeHostedAppPage,
  routeHostedApp,
} from "../../e2e/hosted-app-routing.mjs";

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("hosted test-app route lifetime", () => {
  it("preserves the exact test origin, asset path, query and response without retries", async () => {
    let handler;
    const context = {
      route: vi.fn(async (_pattern, callback) => {
        handler = callback;
      }),
    };
    await routeHostedApp(context);
    expect(context.route.mock.calls[0][0]).toBe("https://app.coredrill.test/**");
    const response = {};
    const route = {
      request: () => ({ url: () => "https://app.coredrill.test/source%20file.sql?import&raw" }),
      fetch: vi.fn(async () => response),
      fulfill: vi.fn(async () => undefined),
    };
    await handler(route);
    expect(route.fetch).toHaveBeenCalledExactlyOnceWith({
      url: "http://127.0.0.1:4173/source%20file.sql?import&raw",
    });
    expect(route.fulfill).toHaveBeenCalledExactlyOnceWith({ response });
  });
  it("waits for forwarding handlers before closing their request context", async () => {
    const held = deferred();
    const context = { unrouteAll: vi.fn(() => held.promise), close: vi.fn(async () => undefined) };
    const closing = closeHostedAppContext(context);
    await Promise.resolve();
    expect(context.unrouteAll).toHaveBeenCalledWith({ behavior: "wait" });
    expect(context.close).not.toHaveBeenCalled();
    held.resolve();
    await closing;
    await closeHostedAppContext(context);
    expect(context.unrouteAll).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });
  it("drains before closing a page, then reinstalls forwarding for the next app page", async () => {
    const held = deferred();
    const context = { unrouteAll: vi.fn(() => held.promise), route: vi.fn(async () => undefined) };
    const page = { close: vi.fn(async () => undefined) };
    const closing = closeHostedAppPage(context, page);
    await Promise.resolve();
    expect(page.close).not.toHaveBeenCalled();
    expect(context.route).not.toHaveBeenCalled();
    held.resolve();
    await closing;
    expect(page.close).toHaveBeenCalledOnce();
    expect(context.route).toHaveBeenCalledOnce();
  });
  it("does not convert a genuine forwarding failure into a successful response", async () => {
    let handler;
    const context = {
      route: vi.fn(async (_pattern, callback) => {
        handler = callback;
      }),
    };
    await routeHostedApp(context);
    const route = {
      request: () => ({ url: () => "https://app.coredrill.test/asset.js?raw" }),
      fetch: vi.fn(async () => {
        throw new Error("synthetic connection failure");
      }),
      fulfill: vi.fn(),
    };
    await expect(handler(route)).rejects.toThrow("synthetic connection failure");
    expect(route.fulfill).not.toHaveBeenCalled();
  });
});
