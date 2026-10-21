import { describe, expect, it } from "vitest";
import fixture from "../../fixtures/scheduling/civil-time-v1.json" with { type: "json" };
import { assertLocalScheduleRuntime } from "../browser-proofs/local-schedule-runtime.mjs";

const proof = () => ({
  globalsUnchanged: true,
  hostTimeZone: "UTC",
  canonicalZones: fixture.cases.map(([, zone]) => zone),
  resolutions: fixture.cases.map(([, zone, candidates]) =>
    candidates.length === 0 ? { kind: "gap" } : { kind: "resolved", timeZone: zone, candidates },
  ),
  invalid: fixture.invalid.map(() => ({ kind: "invalid" })),
});
describe("exact runtime scheduling witness validation", () => {
  it("validates every frozen expected candidate and invalid input, not only a case count", () => {
    expect(assertLocalScheduleRuntime(proof(), fixture)).toMatchObject({
      scenarios: 7,
      invalidLiterals: 13,
      globalsUnchanged: true,
    });
    for (const mutate of [
      (value) => {
        value.globalsUnchanged = false;
      },
      (value) => {
        value.resolutions[0].candidates = ["2026-11-02T15:00:00.000Z"];
      },
      (value) => {
        value.resolutions[1] = { kind: "resolved", candidates: [] };
      },
      (value) => {
        value.resolutions.pop();
      },
      (value) => {
        value.invalid[0] = { kind: "gap" };
      },
    ]) {
      const changed = proof();
      mutate(changed);
      expect(() => assertLocalScheduleRuntime(changed, fixture)).toThrow();
    }
  });
});
