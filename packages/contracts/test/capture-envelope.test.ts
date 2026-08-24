import { describe, expect, it } from "vitest";

import generatedSchemaFixture from "../schemas/capture-envelope.v1.schema.json" with { type: "json" };
import {
  CAPTURE_ENVELOPE_LIMITS,
  CAPTURE_ENVELOPE_SPEC_VERSION,
  CAPTURE_ENVELOPE_V1_SCHEMA_ID,
  captureEnvelopeV1JsonSchema,
  captureEnvelopeV1Schema,
  safeParseCaptureEnvelopeV1,
} from "../src/index.js";
import invalidCaptureMutations from "./fixtures/capture-envelope.invalid.json" with { type: "json" };
import validCaptureFixture from "./fixtures/capture-envelope.valid.json" with { type: "json" };

interface InvalidCaptureMutation {
  readonly name: string;
  readonly path: readonly string[];
  readonly value?: unknown;
  readonly delete?: boolean;
}

function mutatedCapture(mutation: InvalidCaptureMutation): unknown {
  const copy = structuredClone(validCaptureFixture) as unknown as Record<string, unknown>;
  let target = copy;
  for (const segment of mutation.path.slice(0, -1)) {
    const next = target[segment];
    if (next === null || typeof next !== "object") {
      throw new Error(`Invalid fixture mutation path: ${mutation.path.join(".")}`);
    }
    target = next as Record<string, unknown>;
  }

  const property = mutation.path.at(-1);
  if (property === undefined) throw new Error("Invalid empty fixture mutation path.");
  if (mutation.delete === true) delete target[property];
  else target[property] = mutation.value;
  return copy;
}

describe("CaptureEnvelopeV1 boundary", () => {
  it("round-trips the synthetic valid fixture through the Zod validator", () => {
    const result = safeParseCaptureEnvelopeV1(validCaptureFixture);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected the valid fixture to parse.");

    expect(result.data).toEqual(validCaptureFixture);
    expect(result.encodedBytes).toBeGreaterThan(0);
    expect(captureEnvelopeV1Schema.parse(JSON.parse(JSON.stringify(result.data)))).toEqual(
      validCaptureFixture,
    );
  });

  it("publishes the generated Draft 2020-12 JSON Schema without drift", () => {
    expect(captureEnvelopeV1JsonSchema).toEqual(generatedSchemaFixture);
    expect(captureEnvelopeV1JsonSchema.$id).toBe(CAPTURE_ENVELOPE_V1_SCHEMA_ID);
    expect(captureEnvelopeV1JsonSchema.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );

    const fixture = generatedSchemaFixture as {
      properties: { specVersion: { const: number; type: string } };
      [key: string]: unknown;
    };
    expect(fixture.properties.specVersion).toEqual({ type: "number", const: 1 });
    expect(fixture["x-coredrill-maxBytes"]).toBe(CAPTURE_ENVELOPE_LIMITS.maxBytes);
    expect(CAPTURE_ENVELOPE_SPEC_VERSION).toBe(1);
  });

  it.each(invalidCaptureMutations as readonly InvalidCaptureMutation[])(
    "rejects invalid fixture: $name",
    (mutation) => {
      const result = safeParseCaptureEnvelopeV1(mutatedCapture(mutation));
      expect(result.success).toBe(false);
      if (result.success) throw new Error("Expected the invalid fixture to fail.");
      expect(result.code).toBe("schema_invalid");
    },
  );

  it("rejects field limits and the total UTF-8 envelope limit before persistence", () => {
    const tooMuchSelectedText = structuredClone(validCaptureFixture);
    tooMuchSelectedText.content.selectedText = "x".repeat(
      CAPTURE_ENVELOPE_LIMITS.maxSelectedTextCharacters + 1,
    );
    expect(safeParseCaptureEnvelopeV1(tooMuchSelectedText)).toMatchObject({
      success: false,
      code: "schema_invalid",
    });

    const oversized = structuredClone(validCaptureFixture) as unknown as {
      content: Record<string, unknown>;
    };
    oversized.content["apiPayload"] = {
      padding: "é".repeat(CAPTURE_ENVELOPE_LIMITS.maxBytes),
    };
    const result = safeParseCaptureEnvelopeV1(oversized);
    expect(result).toMatchObject({ success: false, code: "too_large" });
    if (result.success || result.encodedBytes === undefined) {
      throw new Error("Expected a measured oversized failure.");
    }
    expect(result.encodedBytes).toBeGreaterThan(CAPTURE_ENVELOPE_LIMITS.maxBytes);
  });

  it("rejects non-JSON and circular inputs without throwing", () => {
    expect(safeParseCaptureEnvelopeV1(1n)).toEqual({
      success: false,
      code: "not_json_serializable",
    });
    expect(safeParseCaptureEnvelopeV1(undefined)).toEqual({
      success: false,
      code: "not_json_serializable",
    });

    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    expect(safeParseCaptureEnvelopeV1(circular)).toEqual({
      success: false,
      code: "not_json_serializable",
    });
  });
});
