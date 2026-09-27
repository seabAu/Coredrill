# Phase 2 production extension outbox verification

Date: 2026-09-26  
Checklist item: `PEX-003`  
Implementation commit: `74d779052ae3c7e75758c81a337cfe577b3ceafb`  
Hosted run: [Foundation CI 36292023588](https://github.com/seabAu/Coredrill/actions/runs/36292023588)

## Outcome

The production WXT extension now persists a strict retry record beside every
bounded, checksummed outbox item. A transfer pull selects the oldest due,
non-exhausted capture, writes its incremented attempt and next eligible retry
before returning the offer, and applies deterministic exponential backoff from
five seconds to five minutes with at most ten automatic attempts. An exhausted
item remains exportable and cannot block another eligible capture.

The private browser-storage aggregate migrates from version 1 to version 2 in
place while `CaptureEnvelopeV1`, `OutboxStateV1`, transfer version 1, and the
checksummed Firefox export remain compatible. Exact acknowledgement removes
the outbox and retry records together. Lost acknowledgement, full persistent
browser-profile restart, and rejected storage writes preserve the capture for
retry or export. Expiry is the only other cleanup path; it removes both records
and reports the count separately from acknowledgement.

No Accepted decision changed, so no ADR was required.

## Executable proof

### Retry, migration, acknowledgement, and expiry unit proof

`packages/extension-bridge/test/retry.test.ts` proves:

- strict, one-to-one retry metadata validation and legacy-state migration;
- deterministic first and subsequent exponential delays;
- rejection of an early pull without incrementing the attempt;
- a ten-attempt cap that retains the capture for export;
- an exhausted item cannot block a newer due capture;
- exact acknowledgement removes outbox and retry records together;
- a 24-hour expiry warning and synchronized expiry pruning; and
- adding an item cannot change an existing item's schedule.

Extension boundary tests prove the exact `outbox.status.v2` request/response
shape and reject extra or malformed status facts.

### Persistent browser restart and storage-fault E2E

`e2e/extension-transfer.spec.mjs` uses the production Chromium build and a
persistent browser profile. It withholds the first acknowledgement, verifies
that an immediate pull receives `retry_not_due`, inspects the persisted
attempt/schedule/error facts, closes the entire browser context, and reopens
the same profile. The same extension identity and retry schedule are restored;
the due second attempt reaches SQLite as an exact duplicate and is then
acknowledged and removed.

The same suite downgrades stored state to the legacy version-1 aggregate and
proves an in-place version-2 migration. A separate quota-pressure case fills
real extension local storage, receives `storage_failed` for a new queue write,
and proves that the previously durable outbox remains byte-for-byte unchanged
and readable after the pressure is removed.

## Boundary and package proof

Production Chrome and Firefox packages retain only the reviewed permissions:

- Chrome: `activeTab`, `scripting`, `sidePanel`, `storage`;
- Firefox: `activeTab`, `scripting`, `storage`;
- host and optional host permissions: none;
- remote assets/imports and `eval` calls: zero; and
- secret findings: zero.

The retry lifecycle adds no source fetch, content script, page surveillance,
hosted account, full-vault data, provider key, field confirmation, application
submission, or outreach behavior.

## Local verification

`pnpm verify` passed with pinned Node 24.19.0 and pnpm 11.22.0:

- formatting, 19 import-boundary policies, and foundation-record drift;
- 33 TypeScript/Rust typecheck tasks and 22 lint tasks;
- 86 unit files / 734 tests plus the coverage run;
- 22 production build tasks and current UI/extraction generated reports;
- extension build and package inspection;
- 5 UI-foundation, 66 app-shell, 1 performance, 3 resilience, 7 onboarding,
  9 document, and 7 browser-storage E2E tests;
- 12 native TypeScript tests and 11 Rust tests passed with 1 reviewed ignored
  secure-store harness test;
- native secure-storage and archive/backup proof;
- generated-schema, license, secret, and Changesets checks;
- 520 npm and 498 Rust license records; and
- zero known npm or Rust vulnerabilities, with seven pre-existing reviewed
  Rust warnings.

The separate production extension matrix passed **4/4**: Chromium preview,
Chromium persistent restart/retry/deduplication, Chromium storage-failure
retention, and Firefox checksummed manual fallback. The focused extension
matrix passed **6 files / 32 tests**.

## Hosted verification

Foundation CI run 36292023588 passed from the implementation commit. The
foundation gate, full-history secret scan, production Chromium/Firefox
extension transfer matrix, Chrome 151 and 152 browser-storage jobs, Firefox
153 and 154 browser-storage jobs, and native Windows, macOS, and Ubuntu package
jobs all completed successfully. The pull-request-only dependency review was
correctly skipped on this direct `main` push.

## Residual scope

The public app/extension compatibility handshake, exact production origin and
extension-ID compatibility, and hosted transfer/fallback behavior remain owned
by `PEX-004` and `PEX-005`. This slice does not claim those later behaviors.
