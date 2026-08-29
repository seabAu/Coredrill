import { describe, expect, it } from "vitest";

import { DIAGNOSTIC_ATTRIBUTE_KEYS } from "@coredrill/contracts";

import {
  createLocalDiagnosticEvent,
  createUserCopyableSupportBundle,
  redactDiagnosticAttributes,
  type LocalDiagnosticEventInput,
} from "../src/index.js";

const eventInput: LocalDiagnosticEventInput = {
  specVersion: 1,
  eventId: "019539af-8e01-7dd4-8b54-395d8f3fe501",
  occurredAt: "2026-08-24T19:00:00.000Z",
  appVersion: "0.1.0",
  delivery: "local",
  category: "application",
  name: "operation_complete",
  severity: "warning",
  outcome: "degraded",
  operationId: "019539af-8e02-7dd4-8b54-395d8f3fe502",
  code: "partial_result",
  durationMs: 25,
};

describe("privacy-safe local diagnostics", () => {
  it("keeps only bounded content-free scalar attributes", () => {
    const redacted = redactDiagnosticAttributes({
      adapter: "sqlite-wasm",
      attempt: 2,
      available: true,
      resume_text: "PRIVATE_RESUME_SENTINEL",
      email: "private@example.test",
      prompt_response: "PRIVATE_PROMPT_SENTINEL",
      provider_key: "PRIVATE_KEY_SENTINEL",
      detail: "free form detail is not a token",
      nested: { raw: "PRIVATE_NESTED_SENTINEL" },
      non_finite: Number.POSITIVE_INFINITY,
    });

    expect(redacted).toEqual({
      attributes: {
        adapter: "sqlite-wasm",
        attempt: 2,
        available: true,
      },
      redactedAttributeCount: 7,
    });
    expect(JSON.stringify(redacted)).not.toContain("PRIVATE_");
    expect(Object.isFrozen(redacted)).toBe(true);
    expect(Object.isFrozen(redacted.attributes)).toBe(true);
  });

  it("sorts deterministically and caps accepted attributes at 32", () => {
    const raw = Object.fromEntries(
      DIAGNOSTIC_ATTRIBUTE_KEYS.slice(0, 35).map((key, index) => [key, index]),
    );
    const redacted = redactDiagnosticAttributes(raw);
    expect(Object.keys(redacted.attributes)).toHaveLength(32);
    expect(Object.keys(redacted.attributes)).toEqual([...Object.keys(redacted.attributes)].sort());
    expect(redacted.redactedAttributeCount).toBe(3);
  });

  it("creates a schema-validated local event without retaining rejected content", () => {
    const event = createLocalDiagnosticEvent(eventInput, {
      adapter: "browser-worker",
      result_count: 4,
      resume_text: "PRIVATE_EVENT_SENTINEL",
    });

    expect(event).toMatchObject({
      delivery: "local",
      attributes: { adapter: "browser-worker", result_count: 4 },
      redactedAttributeCount: 1,
    });
    expect(JSON.stringify(event)).not.toContain("PRIVATE_EVENT_SENTINEL");
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.attributes)).toBe(true);
  });

  it("fails closed when the event envelope is not a local diagnostic", () => {
    expect(() =>
      createLocalDiagnosticEvent(
        { ...eventInput, delivery: "telemetry" } as unknown as LocalDiagnosticEventInput,
        {},
      ),
    ).toThrow();
  });

  it("creates a deterministic immutable user-copyable bundle", () => {
    const older = createLocalDiagnosticEvent(eventInput, { adapter: "browser-worker" });
    const newer = createLocalDiagnosticEvent(
      {
        ...eventInput,
        eventId: "019539af-8e03-7dd4-8b54-395d8f3fe503",
        occurredAt: "2026-08-24T19:01:00.000Z",
      },
      { adapter: "sqlite-wasm" },
    );

    const result = createUserCopyableSupportBundle({
      generatedAt: "2026-08-24T19:02:00.000Z",
      appVersion: "0.1.0",
      events: [older, newer],
    });

    expect(result.bundle.events.map(({ eventId }) => eventId)).toEqual([
      newer.eventId,
      older.eventId,
    ]);
    expect(JSON.parse(result.copyText)).toEqual(result.bundle);
    expect(result.copyText.endsWith("\n")).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.bundle)).toBe(true);
    expect(Object.isFrozen(result.bundle.events)).toBe(true);
  });

  it("fails closed instead of copying invalid, duplicate, or content-bearing stored events", () => {
    const event = createLocalDiagnosticEvent(eventInput, {});
    expect(() =>
      createUserCopyableSupportBundle({
        generatedAt: "2026-08-24T19:02:00.000Z",
        appVersion: "0.1.0",
        events: [{ ...event, message: "PRIVATE_SUPPORT_SENTINEL" }],
      }),
    ).toThrow();
    expect(() =>
      createUserCopyableSupportBundle({
        generatedAt: "2026-08-24T19:02:00.000Z",
        appVersion: "0.1.0",
        events: [event, event],
      }),
    ).toThrow();
  });
});
