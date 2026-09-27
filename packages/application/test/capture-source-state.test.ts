import { describe, expect, it } from "vitest";

import {
  CaptureSourceStateError,
  evaluateCaptureSourceStateV1,
  type CaptureSourceStateInputV1,
} from "../src/index.js";
import fixture from "./fixtures/capture-source-states.json" with { type: "json" };

describe("capture source review state", () => {
  it("projects every required state fixture with a stable manual fallback", () => {
    const proof = fixture.cases.map((testCase) => {
      const result = evaluateCaptureSourceStateV1(testCase.input as CaptureSourceStateInputV1);
      expect(result.kind, testCase.name).toBe(testCase.expectedKind);
      expect(result.manualFallback?.mode ?? null, testCase.name).toBe(testCase.expectedFallback);
      expect(result.refreshPerformed).toBe(false);
      expect(result.retainedEvidence).toContain("remain in this local review");
      expect(Object.isFrozen(result)).toBe(true);
      return result.kind;
    });

    expect(proof).toEqual(["available", "expired", "changed", "blocked", "unsupported"]);
    expect(
      evaluateCaptureSourceStateV1(
        fixture.cases.find(({ expectedKind }) => expectedKind === "blocked")
          ?.input as CaptureSourceStateInputV1,
      ).promotionAllowed,
    ).toBe(false);
    console.info(
      `REV005_STATE_PROOF ${JSON.stringify({ states: proof, noRefresh: true, blockedPromotion: true, manualFallbacks: 4 })}`,
    );
  });

  it("uses stable precedence without treating a changed source as an overwrite instruction", () => {
    const changed = fixture.cases.find(({ expectedKind }) => expectedKind === "changed")
      ?.input as CaptureSourceStateInputV1;
    expect(
      evaluateCaptureSourceStateV1({
        ...changed,
        sourceExpiresAt: "2026-09-25",
        policy: { status: "blocked", reason: "runtime_kill_switch" },
      }).kind,
    ).toBe("blocked");
    expect(evaluateCaptureSourceStateV1({ ...changed, sourceExpiresAt: "2026-09-25" }).kind).toBe(
      "expired",
    );
    expect(evaluateCaptureSourceStateV1(changed).explanation).toContain(
      "Confirmed fields will not be overwritten",
    );
  });

  it("keeps a date-only listing valid through its stated day", () => {
    const expired = fixture.cases.find(({ expectedKind }) => expectedKind === "expired")
      ?.input as CaptureSourceStateInputV1;
    expect(
      evaluateCaptureSourceStateV1({
        ...expired,
        observedAt: "2026-09-25T23:59:59.999Z",
      }).kind,
    ).toBe("available");
  });

  it("fails closed on malformed state observations", () => {
    const available = fixture.cases[0]?.input as CaptureSourceStateInputV1;
    for (const invalid of [
      { ...available, observedAt: "yesterday" },
      { ...available, sourceUrl: "javascript:alert(1)" },
      { ...available, retainedCandidateCount: 257 },
      { ...available, policy: { status: "blocked", reason: "network_error" } },
      { ...available, extra: true },
    ]) {
      expect(() => evaluateCaptureSourceStateV1(invalid as CaptureSourceStateInputV1)).toThrowError(
        new CaptureSourceStateError(),
      );
    }
  });
});
