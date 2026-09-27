# Phase 2 production extension preview verification

Date: 2026-09-26  
Checklist item: `PEX-002`  
Implementation commit: `0aebd3447778a10934d0d3a37d87e40654b66c97`
Hosted run: [Foundation CI 36289223729](https://github.com/seabAu/Coredrill/actions/runs/36289223729)

## Outcome

The production WXT side panel now presents a bounded provisional job preview
before queueing. It shows editable title and company, location, salary,
detected source signal and hostname, minimum detected-field confidence, exact
capture time with a non-live freshness disclosure, selected page text, and a
bounded local note. The user can explicitly recapture selected page text,
retain in-panel edits, and queue only after review.

The change does not mutate `PageCaptureSnapshotV1` or `CaptureEnvelopeV1`.
`ExtensionCaptureDraftV1` is a strict in-memory/privileged-message boundary
that binds the validated snapshot to a capture instant plus optional bounded
title/company corrections and note. Queue construction retains every original
detected candidate and adds corrections and `capture_note` as separate
method-`user` candidates with exact draft pointers. These candidates have no
`userConfirmation`, so editing a preview cannot silently create trusted data.

No Accepted decision changed, so no ADR was required.

## Executable proof

### Strict draft and envelope proof

`packages/capture-core/test/capture-envelope-builder.test.ts` proves:

- exact version-1 draft shape and ISO capture instant validation;
- 1,024-character title/company and 4,096-character note bounds;
- rejection of extra properties, empty correction objects, forbidden control
  characters, and oversized input;
- original JSON-LD title/company candidates remain unchanged;
- corrected title/company and local note become separate `user` candidates;
- no generated candidate is confirmed; and
- the unchanged envelope schema and semantic content hash validate.

`apps/extension/test/capture-preview.test.ts` proves deterministic inert
projection of Schema.org location/salary, source hostname and signal,
confidence, user-correction labels, and capture-only freshness buckets.

Focused result: **3 files, 20 tests passed**.

### Production side-panel browser E2E

`e2e/extension-preview.spec.mjs` loads the built
`chrome-extension://.../sidepanel.html` surface and uses a deterministic
synthetic capture response at the same strict extension-message boundary used
by the production `activeTab` action. Queueing continues through the real
background worker and browser local storage. This split is necessary because
headless Chromium does not expose a browser-toolbar click that grants
`activeTab`; live-DOM extraction remains covered by the existing serialized
capture fixture tests.

The browser proof verifies:

- title, company, remote location, salary, source, 98% confidence, and
  capture-time freshness are visible;
- a title correction and bounded note remain after selected-text recapture;
- the second selected-text snapshot, not the first, enters the envelope;
- original detected and user-authored candidates coexist with no confirmation;
- the source URL is not fetched during preview, recapture, or queueing; and
- queueing occurs only after the explicit **Send to Workspace** action.

The complete extension matrix passed **3/3**: production Chromium preview,
durable Chromium transfer/retry/deduplication, and Firefox checksummed manual
fallback.

## Boundary and package proof

Production Chrome and Firefox builds and store ZIPs retain only the reviewed
permissions:

- Chrome: `activeTab`, `scripting`, `sidePanel`, `storage`;
- Firefox: `activeTab`, `scripting`, `storage`;
- host permissions: none;
- optional host permissions: none;
- remote assets/imports: zero;
- `eval` calls: zero; and
- secret findings: zero.

The 55-file Firefox source-review ZIP rebuilt byte-identically from the frozen
offline lockfile. The preview performs no navigation observation, source
fetch, background page surveillance, permission expansion, field
confirmation, automatic application, or outreach.

## Full local verification

`pnpm verify` passed with pinned Node 24.19.0 and pnpm 11.22.0:

- formatting, 19 import-boundary policies, and foundation-record drift;
- 33 TypeScript/Rust typecheck tasks;
- 22 lint tasks;
- 85 unit files / 728 tests;
- coverage: 83.71% statements, 77.42% branches, 84.24% functions, 86.74% lines;
- 22 production build tasks;
- extension build/package inspection;
- 5 UI-foundation, 66 app-shell, 1 performance, 3 resilience, 7 onboarding,
  9 document, and 7 browser-storage E2E tests;
- 12 native TypeScript tests and 11 Rust tests passed with 1 reviewed ignored
  secure-store harness test;
- native secure-storage and archive/backup proof;
- generated-schema, UI contrast, and extraction-quality drift checks;
- 520 npm and 498 Rust license records;
- tracked/unignored secret scan;
- zero known npm or Rust vulnerabilities (seven pre-existing allowed Rust
  warnings); and
- Changesets status.

## Hosted verification

Foundation CI run 36289223729 passed from the implementation commit. The
foundation gate, full-history secret scan, Chromium/Firefox extension transfer
matrix, Chrome 151 and 152 browser-storage jobs, Firefox 153 and 154
browser-storage jobs, and native Windows, macOS, and Ubuntu jobs all completed
successfully. The pull-request-only dependency review was correctly skipped on
this direct `main` push.

## Residual scope

Outbox backoff, expiry warning behavior, crash/restart recovery, and related
failure states remain owned by `PEX-003`. App handshake, version mismatch, and
the hosted transfer path remain `PEX-004` and `PEX-005`. This slice does not
claim those later behaviors.
