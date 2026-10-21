import { describe, expect, it } from "vitest";
import { isAllowedExpression, reviewedLegacyLicense } from "../licenses/license-policy.mjs";

describe("reviewed workspace license expression policy", () => {
  it.each([
    "MIT",
    "ISC",
    "(MIT OR GPL-3.0-or-later)",
    "(MIT AND Zlib)",
    "MIT AND (ISC OR GPL-3.0)",
    "(GPL-3.0 AND UNKNOWN) OR Apache-2.0",
  ])("accepts an available permitted obligation path %s", (value) => {
    expect(isAllowedExpression(value)).toBe(true);
  });
  it.each([
    "",
    "UNKNOWN",
    "UNLICENSED",
    "BSD",
    "GPL-3.0",
    "MIT AND GPL-3.0",
    "MIT OR",
    "MIT ISC",
    "MIT WITH LLVM-exception",
    "MIT OR GPL-3.0 AND",
    "(MIT",
    "MIT)",
    "MIT OR ()",
    "MIT OR UNKNOWN$",
    "MIT OR (GPL-3.0 AND UNKNOWN",
    "(".repeat(129) + "MIT" + ")".repeat(129),
    null,
    {},
    ["MIT", "UNKNOWN"],
  ])("fails closed on unsupported or malformed obligations %j", (value) => {
    expect(isAllowedExpression(value)).toBe(false);
  });
  it("requires all members of legacy license arrays to pass", () => {
    expect(isAllowedExpression(["MIT", "ISC"])).toBe(true);
    expect(isAllowedExpression([])).toBe(false);
    expect(isAllowedExpression(Array(17).fill("MIT"))).toBe(false);
  });
  it("binds duck's BSD-2-Clause review to exact version, reported metadata and LICENSE bytes", () => {
    const digest = "6663bbd049205d38a496ccacb412a151980b444627d38de218b3b809aef330f1";
    expect(reviewedLegacyLicense("duck@0.1.12", "UNKNOWN", digest)).toBe("BSD-2-Clause");
    expect(reviewedLegacyLicense("duck@0.1.13", "UNKNOWN", digest)).toBe("UNKNOWN");
    expect(reviewedLegacyLicense("duck@0.1.12", "UNKNOWN", "0".repeat(64))).toBe("UNKNOWN");
    expect(reviewedLegacyLicense("duck@0.1.12", "GPL-3.0", digest)).toBe("GPL-3.0");
  });
});
