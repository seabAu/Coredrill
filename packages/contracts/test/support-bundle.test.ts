import { describe, expect, it } from "vitest";

import generatedSchemaFixture from "../schemas/support-bundle.v1.schema.json" with { type: "json" };
import {
  SUPPORT_BUNDLE_LIMITS,
  SUPPORT_BUNDLE_SPEC_VERSION,
  SUPPORT_BUNDLE_V1_SCHEMA_ID,
  supportBundleV1JsonSchema,
  supportBundleV1Schema,
} from "../src/index.js";

const olderEvent = {
  specVersion: 1,
  eventId: "0198e301-0000-7000-8000-000000000001",
  occurredAt: "2026-08-29T15:00:00.000Z",
  appVersion: "0.1.0",
  delivery: "local",
  category: "application",
  name: "operation_complete",
  severity: "info",
  outcome: "success",
  code: "ready",
  durationMs: 12,
  attributes: { adapter: "browser-worker", result_count: 2 },
  redactedAttributeCount: 1,
} as const;

const newerEvent = {
  ...olderEvent,
  eventId: "0198e301-0001-7000-8000-000000000002",
  occurredAt: "2026-08-29T15:01:00.000Z",
  severity: "warning",
  outcome: "degraded",
  code: "partial_result",
} as const;

const sampleBundle = {
  specVersion: 1,
  generatedAt: "2026-08-29T15:02:00.000Z",
  appVersion: "0.1.0",
  delivery: "local-copy",
  eventOrder: "newest-first",
  events: [newerEvent, olderEvent],
} as const;

describe("SupportBundleV1", () => {
  it("round-trips a bounded content-free local support export", () => {
    expect(supportBundleV1Schema.parse(sampleBundle)).toEqual(sampleBundle);
    expect(SUPPORT_BUNDLE_SPEC_VERSION).toBe(1);
    expect(SUPPORT_BUNDLE_LIMITS.maxEvents).toBe(200);
  });

  it("publishes its generated Draft 2020-12 schema without drift", () => {
    expect(supportBundleV1JsonSchema).toEqual(generatedSchemaFixture);
    expect(supportBundleV1JsonSchema.$id).toBe(SUPPORT_BUNDLE_V1_SCHEMA_ID);
  });

  it("rejects private fields, arbitrary delivery, duplicates, and incorrect ordering", () => {
    expect(
      supportBundleV1Schema.safeParse({
        ...sampleBundle,
        path: "C:\\Users\\Candidate\\private.sqlite",
      }).success,
    ).toBe(false);
    expect(
      supportBundleV1Schema.safeParse({ ...sampleBundle, delivery: "telemetry" }).success,
    ).toBe(false);
    expect(
      supportBundleV1Schema.safeParse({ ...sampleBundle, events: [newerEvent, newerEvent] })
        .success,
    ).toBe(false);
    expect(
      supportBundleV1Schema.safeParse({ ...sampleBundle, events: [olderEvent, newerEvent] })
        .success,
    ).toBe(false);
  });

  it("rejects more than the reviewed event limit", () => {
    expect(
      supportBundleV1Schema.safeParse({
        ...sampleBundle,
        events: Array.from({ length: SUPPORT_BUNDLE_LIMITS.maxEvents + 1 }, (_, index) => ({
          ...newerEvent,
          eventId: `0198e301-${String(index).padStart(4, "0")}-7000-8000-000000000002`,
        })),
      }).success,
    ).toBe(false);
  });
});
