import { describe, expect, it } from "vitest";

import generatedSchemaFixture from "../schemas/diagnostic-event.v1.schema.json" with { type: "json" };
import {
  DIAGNOSTIC_ATTRIBUTE_KEYS,
  DIAGNOSTIC_EVENT_SPEC_VERSION,
  DIAGNOSTIC_EVENT_V1_SCHEMA_ID,
  FORBIDDEN_DIAGNOSTIC_FIELD_PARTS,
  diagnosticEventV1JsonSchema,
  diagnosticEventV1Schema,
} from "../src/index.js";

const sampleEvent = {
  specVersion: 1,
  eventId: "019539af-8d01-7dd4-8b54-395d8f3fe501",
  occurredAt: "2026-08-24T18:00:00.000Z",
  appVersion: "0.1.0",
  delivery: "local",
  category: "storage",
  name: "database_open",
  severity: "info",
  outcome: "success",
  operationId: "019539af-8d02-7dd4-8b54-395d8f3fe502",
  code: "ready",
  durationMs: 12,
  attributes: {
    adapter: "sqlite-wasm",
    available: true,
    attempt: 1,
  },
  redactedAttributeCount: 0,
} as const;

describe("DiagnosticEventV1", () => {
  it("round-trips a content-free local operational event", () => {
    const parsed = diagnosticEventV1Schema.parse(sampleEvent);
    expect(parsed).toEqual(sampleEvent);
    expect(DIAGNOSTIC_EVENT_SPEC_VERSION).toBe(1);
    expect(parsed.delivery).toBe("local");
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(sampleEvent);
  });

  it("publishes its generated Draft 2020-12 schema without drift", () => {
    expect(diagnosticEventV1JsonSchema).toEqual(generatedSchemaFixture);
    expect(diagnosticEventV1JsonSchema.$id).toBe(DIAGNOSTIC_EVENT_V1_SCHEMA_ID);
  });

  it("rejects content-bearing attribute keys and free-form values", () => {
    for (const key of DIAGNOSTIC_ATTRIBUTE_KEYS) {
      const parts = key.split(/[._-]/u);
      expect(
        parts.some((part) => FORBIDDEN_DIAGNOSTIC_FIELD_PARTS.includes(part)),
        key,
      ).toBe(false);
    }

    for (const key of [
      "resume_text",
      "email",
      "prompt_response",
      "provider_key",
      "jobtitle",
      "company_name",
    ]) {
      const event = structuredClone(sampleEvent) as unknown as {
        attributes: Record<string, unknown>;
      };
      event.attributes[key] = "synthetic-secret";
      expect(diagnosticEventV1Schema.safeParse(event).success, key).toBe(false);
    }

    const freeForm = structuredClone(sampleEvent) as unknown as {
      attributes: Record<string, unknown>;
    };
    freeForm.attributes["adapter"] = "someone@example.test";
    expect(diagnosticEventV1Schema.safeParse(freeForm).success).toBe(false);
    freeForm.attributes["adapter"] = { nested: "raw content" };
    expect(diagnosticEventV1Schema.safeParse(freeForm).success).toBe(false);
  });

  it("rejects telemetry delivery, unknown fields, invalid duration, and oversized attributes", () => {
    const telemetry = structuredClone(sampleEvent) as unknown as { delivery: string };
    telemetry.delivery = "telemetry";
    expect(diagnosticEventV1Schema.safeParse(telemetry).success).toBe(false);

    const unknownField = { ...structuredClone(sampleEvent), message: "private content" };
    expect(diagnosticEventV1Schema.safeParse(unknownField).success).toBe(false);

    const arbitraryName = structuredClone(sampleEvent) as unknown as { name: string };
    arbitraryName.name = "john_doe";
    expect(diagnosticEventV1Schema.safeParse(arbitraryName).success).toBe(false);

    const arbitraryCode = structuredClone(sampleEvent) as unknown as { code: string };
    arbitraryCode.code = "secretlookingvalue";
    expect(diagnosticEventV1Schema.safeParse(arbitraryCode).success).toBe(false);

    const invalidDuration = structuredClone(sampleEvent) as unknown as { durationMs: number };
    invalidDuration.durationMs = 86_400_001;
    expect(diagnosticEventV1Schema.safeParse(invalidDuration).success).toBe(false);

    const oversized = structuredClone(sampleEvent) as unknown as {
      attributes: Record<string, unknown>;
    };
    oversized.attributes = Object.fromEntries(
      DIAGNOSTIC_ATTRIBUTE_KEYS.map((key, index) => [key, index]),
    );
    expect(diagnosticEventV1Schema.safeParse(oversized).success).toBe(false);
  });
});
