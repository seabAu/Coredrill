import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("bounded collection validation security", () => {
  it.each(["array", "set", "map"] as const)(
    "rejects oversized %s before visiting untrusted elements",
    (kind) => {
      let visited = 0;
      const element = z.preprocess((value) => {
        visited += 1;
        return value;
      }, z.string());
      const values = Array.from({ length: 10_000 }, (_, index) => String(index));
      const schema =
        kind === "array"
          ? z.array(element).max(2)
          : kind === "set"
            ? z.set(element).max(2)
            : z.map(element, element).max(2);
      const input =
        kind === "array"
          ? values
          : kind === "set"
            ? new Set(values)
            : new Map(values.map((value) => [value, "synthetic"]));
      expect(schema.safeParse(input).success).toBe(false);
      expect(visited).toBe(0);
    },
  );
});
