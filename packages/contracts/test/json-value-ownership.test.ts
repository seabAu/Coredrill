import { describe, expect, it } from "vitest";
import { jsonValueSchema } from "../src/primitives.js";

describe("validated JSON tree ownership", () => {
  it.each(
    [
      undefined,
      NaN,
      Infinity,
      1n,
      () => undefined,
      new Date(0),
      new Map(),
      new Set(),
      new Array(1),
    ].map((value) => ({ value })),
  )("rejects values outside the serialized JSON vocabulary (%#)", ({ value }) =>
    expect(jsonValueSchema.safeParse(value).success).toBe(false),
  );
  it("retains existing prototype-key sanitation without polluting or mutating input", () => {
    const input: unknown = JSON.parse(
      '{"__proto__":{"marker":"synthetic"},"constructor":{"nested":true}}',
    );
    const parsed = jsonValueSchema.parse(input);
    expect(parsed).toEqual({ constructor: { nested: true } });
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(Object.hasOwn(input as object, "__proto__")).toBe(true);
    expect(Object.hasOwn(parsed as object, "__proto__")).toBe(false);
    expect(Object.hasOwn(Object.prototype, "marker")).toBe(false);
  });
  it("rejects cyclic graphs that cannot be serialized as JSON", () => {
    const cycle: Record<string, unknown> = {};
    cycle["self"] = cycle;
    expect(jsonValueSchema.safeParse(cycle).success).toBe(false);
  });
  it("owns each value occurrence without retaining input or sibling aliases", () => {
    const shared = { nested: ["\uFEFFliteral\0🧭", -0] };
    const input = { first: shared, second: shared };
    const parsed = jsonValueSchema.parse(input) as typeof input;
    expect(parsed).toEqual(input);
    expect(parsed.first).not.toBe(input.first);
    expect(parsed.second).not.toBe(parsed.first);
    expect(parsed.first.nested).not.toBe(input.first.nested);
    expect(Object.is(parsed.first.nested[1], -0)).toBe(true);
    input.first.nested[0] = "changed";
    expect(parsed.first.nested[0]).toBe("\uFEFFliteral\0🧭");
    expect(parsed.second.nested[0]).toBe("\uFEFFliteral\0🧭");
  });
});
