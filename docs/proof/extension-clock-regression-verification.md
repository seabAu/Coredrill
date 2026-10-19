# Extension adversarial fixture clock regression

Date: 2026-10-19  
Scope: verification maintenance for `PEX-007` while `Q3-005` remains active  
Status: complete local extension and aggregate gates; hosted verification pending

## Evidence and cause

[Foundation CI run 39221886529](https://github.com/seabAu/Coredrill/actions/runs/39221886529)
at `ba0d7ea00f70332aec0906de42d69332264b50d4` failed the hostile-page
extension fixture at its successful-queue assertion. Its draft used the fixed
capture instant `2026-09-27T05:00:00.000Z`, but the production service worker
checked expiry against its actual October 19 clock. The unchanged envelope
builder binds expiry to the original capture instant, and the outbox correctly
rejects an expired envelope. This was stale success-fixture data, not evidence
that the production expiry boundary should change.

## Repair and regression proof

The success fixture now records its capture instant when it queues the current
synthetic page. It asserts that the exact instant survives in the stored
envelope. Before that successful queue, it explicitly sends the same snapshot
with an eight-day-old instant to the real production service worker, asserts
`envelope_expired`, and reads extension-local storage to prove no item queued.
The subsequent valid queue must still contain exactly one item.

The hostile prompt/title, redirect, cross-origin iframe exclusion, immutable
SPA snapshot, and zero-exfiltration assertions remain. There is no fake clock,
retry, relaxed assertion, runtime change, permission change, dependency change,
schema change, or Accepted decision change.

`pnpm test:extension-transfer` passes all seven tests locally, including the
complete capture/review journey, preview, both adversarial cases, exact
transfer/replay/restart recovery, storage failure preservation, and Firefox's
checksummed manual fallback. `PEX007_HOSTILE_PAGE_PROOF` records
`expiredDraftRejectedWithoutQueuing: true` and `exfiltrationRequests: 0`.

The subsequent full `pnpm verify` passed: 120 unit files / 909 tests, coverage,
33 typecheck tasks, 22 lint/build tasks, 19 boundary policies, all 76 app-shell
tests, four production resilience tests, seven onboarding tests, 13 document
browser tests, eight browser storage tests, 13 native TypeScript tests, and
11 native Rust tests. The separately delegated secure-store harness passed,
as did archive/backup, generated-schema, package, license, secret, and Changeset
checks. npm reported zero known vulnerabilities; Cargo reported zero
vulnerabilities and the same ten reviewed informational warnings documented in
the [dependency maintenance proof](dependency-security-maintenance-2026-10-19.md).

## Remaining work

Obtain green clean-commit hosted verification.
This maintenance proof does not close `Q3-005`, production document/application
creation, any representative-user gate, or publication blockers.
