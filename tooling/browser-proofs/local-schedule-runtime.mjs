import assert from "node:assert/strict";

/** Serialized into the actual browser; no dependency, fixture or app writes. */
export async function inspectLocalScheduleRuntime({ moduleUrl, cases, invalid }) {
  const before = {
    Date: globalThis.Date,
    Intl: globalThis.Intl,
    Temporal: globalThis.Temporal,
    method: Date.prototype.toTemporalInstant,
  };
  const { resolveLocalSchedule } = await import(moduleUrl);
  return {
    resolutions: cases.map(([local, zone]) => resolveLocalSchedule(local, zone)),
    invalid: invalid.map((local) => resolveLocalSchedule(local, "UTC")),
    canonicalZones: cases.map(
      ([, zone]) => new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone,
    ),
    hostTimeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
    globalsUnchanged:
      globalThis.Date === before.Date &&
      globalThis.Intl === before.Intl &&
      globalThis.Temporal === before.Temporal &&
      Date.prototype.toTemporalInstant === before.method,
  };
}

export const assertLocalScheduleRuntime = (proof, fixture) => {
  assert.equal(fixture.specVersion, 1);
  assert.equal(proof.globalsUnchanged, true);
  assert.equal(typeof proof.hostTimeZone, "string");
  assert.equal(proof.resolutions.length, fixture.cases.length);
  for (const [index, [, , candidates]] of fixture.cases.entries())
    assert.deepEqual(
      proof.resolutions[index],
      candidates.length === 0
        ? { kind: "gap" }
        : { kind: "resolved", timeZone: proof.canonicalZones[index], candidates },
    );
  assert.deepEqual(
    proof.invalid,
    fixture.invalid.map(() => ({ kind: "invalid" })),
  );
  return {
    specVersion: 1,
    scenarios: fixture.cases.length,
    invalidLiterals: fixture.invalid.length,
    hostTimeZone: proof.hostTimeZone,
    globalsUnchanged: true,
  };
};
