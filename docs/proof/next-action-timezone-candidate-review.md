# Next-action time-zone candidates — review, not adoption

Date: 2026-10-20. Scope: scheduling prerequisite for `INT-004`. No product dependency, support floor, Accepted decision or schema changes in this review.

## Exact candidate metadata

Technology document 10 selects date-fns and date-fns-tz. Current official registry metadata and upstream releases agree on stable **date-fns 4.4.0** and **date-fns-tz 3.2.0**; the date-fns 5 alpha is not selected. Both licenses are MIT. The time-zone package declares date-fns `^3.0.0 || ^4.0.0` as its peer, compatible with the candidate core version; neither reports runtime dependencies in the queried metadata. Registry unpacked sizes are 10,902,084 and 217,678 bytes respectively, not production bundle measurements.

Sources: [date-fns releases](https://github.com/date-fns/date-fns/releases), [time-zone releases](https://github.com/marnusw/date-fns-tz/releases), exact [core license](https://github.com/date-fns/date-fns/blob/v4.4.0/pkgs/core/LICENSE.md), [time-zone license](https://github.com/marnusw/date-fns-tz/blob/v3.2.0/LICENSE.md) and [peer/package metadata](https://github.com/marnusw/date-fns-tz/blob/v3.2.0/package.json). `pnpm view` separately confirms version/license/peer/dependency/integrity metadata.

GitHub's public advisory API returns no records for either exact candidate on this date. That is a bounded database result, not a guarantee or substitute for auditing the eventual frozen graph. The time-zone repository is not archived/disabled; its API reports last push 2024-12-31. Maintenance suitability must be considered before adoption; repository `updated_at` is not code-maintenance evidence.

## Conversion behavior and executable findings

The tagged [fromZonedTime implementation](https://github.com/marnusw/date-fns-tz/blob/v3.2.0/src/fromZonedTime/index.ts) and [offset correction](https://github.com/marnusw/date-fns-tz/blob/v3.2.0/src/_lib/tzParseTimezone/index.ts) do not provide an explicit reject/earlier/later disambiguation contract. The hole-time branch chooses an offset rather than rejecting a skipped clock time. The public `getTimezoneOffset` helper also describes its date argument as local-clock fields, not an arbitrary exact UTC-instant offset oracle.

An isolated ignored review directory installs only these exact two candidates, with `--ignore-workspace` and `--ignore-scripts`; the product manifests and lockfile are unchanged. On pinned Node 24.19.0, seven synthetic ordinary/gap/overlap/skipped-day/quarter-offset cases run under host zones UTC, America/Los_Angeles and Asia/Tokyo. Ordinary New York and Kathmandu conversions pass, and invalid February 30 is rejected. Hour gaps, Lord Howe's half-hour gap and Apia's skipped day are silently shifted. Overlap results round-trip successfully, so round-trip validation alone cannot detect the ambiguity.

More importantly, `2026-11-01T01:30:00` in `America/New_York` becomes `2026-11-01T05:30:00.000Z` on UTC/Los Angeles hosts but `2026-11-01T06:30:00.000Z` on the Tokyo host. The host-independence assertion deliberately remains failing: `TIMEZONE_HOST_INDEPENDENCE_EXIT=1`. The initial failure and expanded diagnostic output are retained locally in `test-results/timezone-candidate-review.json` (raw failure output, not valid JSON) and `test-results/timezone-candidate-host-independence.log`; isolated script/lockfile live under `test-results/timezone-candidate-review/`.

A minimal reproduction, run in an isolated directory containing the exact candidates, is:

```js
import assert from "node:assert/strict";
import { fromZonedTime } from "date-fns-tz";
const results = [];
for (const host of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
  process.env.TZ = host;
  results.push({
    host,
    utc: fromZonedTime("2026-11-01T01:30:00", "America/New_York").toISOString(),
  });
}
console.log(results);
assert.equal(new Set(results.map(({ utc }) => utc)).size, 1);
```

## Adoption gate and next implementation

Do not wire direct `fromZonedTime` output into a task write, treat a matching round trip as proof of uniqueness, infer the user's intended occurrence from the device zone, or shift nonexistent clock times automatically. The scheduling layer needs explicit gap rejection, deliberate overlap selection and host-independent exact-instant proof, including non-hour transitions. UTC instant plus canonical IANA zone remain the durable representation; unscheduled tasks retain neither.

No alternative library or support target is selected here. Any actual Accepted library/architecture change requires an ADR and owner acceptance under repository rules. Review of a suitable composition of the documented utilities remains unblocked; an unsupported custom offset heuristic or a UTC-only form must not be substituted merely to make tests pass. Production bundle/runtime/browser/native and complete security/license checks remain adoption requirements. Normal task draft/shared undo wiring and the rest of the product goal remain unfinished.

## Isolated alternative and proposed decision

Subsequent isolated review tests exact **@js-temporal/polyfill 0.5.1 / jsbi 4.3.2** without adding either to product manifests/lockfile. Registry metadata, [tagged package](https://github.com/js-temporal/temporal-polyfill/blob/v0.5.1/package.json), [ISC license](https://github.com/js-temporal/temporal-polyfill/blob/v0.5.1/LICENSE) and [JSBI Apache-2.0 license](https://github.com/GoogleChromeLabs/jsbi/blob/v4.3.2/LICENSE) are reviewed. The isolated frozen graph passes `pnpm audit --audit-level=low`, and public exact-version advisory queries return no records. This is not the eventual product graph's approval.

An imported namespace prototype obtains standard earlier/later interpretations and retains only interpretations whose plain clock equals the requested clock. It returns zero candidates for gaps, one for unique times, and two explicit instants for overlaps. It passes the same seven scenarios across three host zones in Node 24.19.0 and the standalone ES2020 bundle in offline Edge 155.0.4283.62; Node also rejects invalid dates/zones. No global Temporal or Date prototype is installed. Retained evidence: `test-results/temporal-candidate-review.json`, `test-results/temporal-candidate-browser-review.json`, and isolated source/lockfile under `test-results/temporal-candidate-review/`.

The standalone minified helper plus dependencies measures **211.16 KB / 51.85 KB gzip**, retained in `test-results/temporal-candidate-bundle.log`. A 700-resolution Node diagnostic measures p95 0.183 ms / max 0.735 ms. These results do not prove application chunk delta, initial/offline loading behavior, production CSP, exact browser-floor/native-WebView coverage or reference-hardware budgets. The upstream project remains pre-1.0 with documented production-roadmap/maintenance risk; no library receives blanket approval from these probes.

[ADR-0009](../adr/0009-propose-explicit-civil-time-resolution.md) proposes replacing the date-fns-tz direction only for local scheduling conversion with this imported, lazily loaded helper. It is **Proposed**, not Accepted. Owner acceptance is now required before changing the product's selected date-conversion approach or installing the candidate. Existing UTC/IANA storage, support floors, formatting and all other Accepted choices remain unchanged.
