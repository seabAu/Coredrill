import { safeParsePageCaptureSnapshot } from "@coredrill/capture-core";
import { afterEach, describe, expect, it } from "vitest";

import { captureActivePage } from "../src/capture-active-page";
import { isExtensionResponse, parseExtensionRequest } from "../src/messages";
import { COREDRILL_PHASE0_APP_ORIGIN, isTrustedHostedAppSender } from "../src/transfer-policy";
import fixture from "./fixtures/job-posting.capture.json" with { type: "json" };

const originalGlobals = new Map<string, PropertyDescriptor | undefined>();

function replaceGlobal(name: "document" | "location" | "window", value: unknown): void {
  if (!originalGlobals.has(name)) {
    originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

afterEach(() => {
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
    else Object.defineProperty(globalThis, name, descriptor);
  }
  originalGlobals.clear();
});

describe("user-invoked active-page capture fixture", () => {
  it("extracts JobPosting title/company, URL, canonical URL, and selected visible text", () => {
    const fakeDocument = {
      title: fixture.pageTitle,
      querySelectorAll(selector: string): readonly unknown[] {
        expect(selector).toBe('script[type="application/ld+json"]');
        return [{ textContent: JSON.stringify(fixture.jsonLd) }];
      },
      querySelector(selector: string): unknown {
        if (selector === 'link[rel="canonical"]') return { href: fixture.canonicalUrl };
        return null;
      },
    };
    Object.defineProperties(fakeDocument, {
      cookie: {
        get(): never {
          throw new Error("Capture must not read cookies.");
        },
      },
      forms: {
        get(): never {
          throw new Error("Capture must not read form state.");
        },
      },
    });
    replaceGlobal("document", fakeDocument);
    replaceGlobal("location", { href: fixture.url });
    replaceGlobal("window", { getSelection: () => ({ toString: () => fixture.selectedText }) });

    const snapshot = captureActivePage();
    expect(safeParsePageCaptureSnapshot(snapshot).success).toBe(true);
    expect(snapshot).toMatchObject({
      specVersion: 1,
      url: fixture.url,
      canonicalUrl: fixture.canonicalUrl,
      pageTitle: fixture.pageTitle,
      selectedText: fixture.selectedText,
      fields: {
        title: {
          value: fixture.jsonLd.title,
          pointer: "/content/jsonLd/0/title",
          method: "jsonld",
        },
        company: {
          value: fixture.jsonLd.hiringOrganization.name,
          pointer: "/content/jsonLd/0/hiringOrganization/name",
          method: "jsonld",
        },
      },
    });
  });

  it("fails instead of silently truncating an oversized selection", () => {
    replaceGlobal("document", {
      title: "Synthetic job",
      querySelectorAll: () => [],
      querySelector: () => null,
    });
    replaceGlobal("location", { href: fixture.url });
    replaceGlobal("window", {
      getSelection: () => ({ toString: () => "x".repeat(64 * 1024 + 1) }),
    });

    expect(() => captureActivePage()).toThrow(/capture boundary/);
  });
});

describe("extension message boundary", () => {
  it("accepts only exact privileged request shapes", () => {
    expect(parseExtensionRequest({ type: "capture.active-tab.v1" })).toEqual({
      type: "capture.active-tab.v1",
    });
    expect(
      parseExtensionRequest({ type: "capture.active-tab.v1", injected: true }),
    ).toBeUndefined();
    expect(parseExtensionRequest({ type: "capture.queue.v1" })).toBeUndefined();
    expect(parseExtensionRequest({ type: "capture.queue.v1", snapshot: fixture })).toEqual({
      type: "capture.queue.v1",
      snapshot: fixture,
    });
    expect(parseExtensionRequest({ type: "outbox.export.v1" })).toEqual({
      type: "outbox.export.v1",
    });
  });

  it("rejects response impostors and unexpected properties", () => {
    expect(
      isExtensionResponse({
        success: false,
        type: "extension.error.v1",
        code: "capture_unavailable",
        message: "Unavailable",
      }),
    ).toBe(true);
    expect(
      isExtensionResponse({
        success: true,
        type: "capture.queued.v1",
        outboxCount: 1,
        outboxBytes: 1024,
        expiresAt: "2026-08-31T17:00:00.000Z",
        pageValue: "untrusted",
      }),
    ).toBe(false);
    expect(isExtensionResponse({ success: true, type: "capture.preview.v1" })).toBe(false);
    expect(
      isExtensionResponse({
        success: true,
        type: "outbox.export.v1",
        filename: "coredrill-capture-outbox-20260824T180000Z.json",
        json: "{}",
        bytes: 2,
      }),
    ).toBe(true);
  });

  it("accepts only the exact top-level non-incognito hosted-app sender", () => {
    const trusted = {
      origin: COREDRILL_PHASE0_APP_ORIGIN,
      url: `${COREDRILL_PHASE0_APP_ORIGIN}/inbox`,
      frameId: 0,
      tab: { incognito: false },
    };
    expect(isTrustedHostedAppSender(trusted)).toBe(true);
    expect(isTrustedHostedAppSender({ ...trusted, origin: "https://attacker.example" })).toBe(
      false,
    );
    expect(isTrustedHostedAppSender({ ...trusted, url: "https://attacker.example/frame" })).toBe(
      false,
    );
    expect(isTrustedHostedAppSender({ ...trusted, frameId: 1 })).toBe(false);
    expect(isTrustedHostedAppSender({ ...trusted, id: "spoofed-extension" })).toBe(false);
    expect(isTrustedHostedAppSender({ ...trusted, tab: { incognito: true } })).toBe(false);
    expect(
      isTrustedHostedAppSender({
        ...trusted,
        origin: "null",
        url: "about:blank",
      }),
    ).toBe(false);
  });
});
