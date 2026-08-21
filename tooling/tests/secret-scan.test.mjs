import { describe, expect, it } from "vitest";

import { scanText } from "../scripts/check-secrets.mjs";

describe("secret-pattern scanner", () => {
  it("rejects representative private credentials", () => {
    const syntheticCredential = ["abcdefghijkl", "mnop1234"].join("");
    expect(scanText(`api_key = '${syntheticCredential}'`)).toEqual([
      { label: "assigned credential", line: 1 },
    ]);
  });

  it("permits documented placeholders", () => {
    expect(scanText("api_key = placeholder\nsecret: ${SECRET_FROM_STORE}")).toEqual([]);
  });
});
