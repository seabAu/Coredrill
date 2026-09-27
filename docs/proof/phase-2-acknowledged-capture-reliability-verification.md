# Phase 2 acknowledged-capture reliability verification

Date: 2026-09-27  
Checklist item: `Q2-002`  
Implementation commit: `7c193ed67b05d4e137527885979627f1833c4ae4`  
Hosted run: [Foundation CI 36299203941](https://github.com/seabAu/Coredrill/actions/runs/36299203941)  
Status: complete

## Outcome

An acknowledged capture now has explicit fault-injection proof across both
sides of the extension/app acknowledgement boundary and across database
upgrade. Before acknowledgement, the extension retains one retryable outbox
item while the app retains one durable receipt. After acknowledgement, a
second complete browser/app restart retains that exact receipt while the
extension outbox remains empty. Upgrading a receipt created at schema 2 to the
current schema preserves every selected column without duplication.

The existing legacy extension-state fixture separately proves the version-1
browser-storage aggregate upgrades in place to version 2. Together these tests
cover browser/app restart, extension aggregate upgrade, and app database
upgrade without weakening durable-before-ack ordering.

No Accepted decision changed, so no ADR was required.

## Fault model and assertions

### Crash before acknowledgement

`e2e/extension-transfer.spec.mjs` runs the production Chromium extension in a
persistent browser profile and the production browser SQLite adapter behind
the reserved HTTPS test origin. The test:

1. queues a capture and commits its validated receipt to SQLite without
   acknowledging it;
2. confirms the extension has recorded the retry attempt and schedule;
3. closes the database and entire browser context;
4. reopens the same profile and confirms the same extension identity, one
   retryable outbox item, and the original retry schedule; and
5. retries the exact envelope, classifies it as an idempotent duplicate,
   acknowledges it, and leaves one receipt and zero outbox items.

### Crash after acknowledgement

The same test then queues semantically identical content, confirms the durable
receiver deduplicates and acknowledges it, closes the database and entire
browser context again, and reopens the same persistent profile. The reopened
extension reports `outboxCount: 0`; the reopened app reports exactly one
receipt with the original envelope ID, envelope checksum, and content hash.

This distinguishes an acknowledged capture from an unacknowledged retryable
item: both are preserved, but only the latter remains in the extension outbox.

### Upgrade after acknowledgement

`packages/storage-core/test/tracker-repositories.test.ts` applies migrations 1
and 2 to a clean SQLite database, inserts one acknowledged `capture_inbox`
receipt, captures every stored field, and then applies all migrations through
schema 101. It asserts the final schema version and exact equality of the only
receipt before and after upgrade.

`packages/extension-bridge/test/retry.test.ts` retains the complementary
legacy extension-state upgrade proof: a version-1 aggregate is migrated to
the current version-2 state without losing its queued capture.

## Local verification

The focused checks passed with pinned Node 24.19.0 and pnpm 11.22.0:

- `pnpm exec vitest run packages/storage-core/test/tracker-repositories.test.ts`
  — 1 file / 7 tests;
- `pnpm exec playwright test --config=playwright.extension.config.mjs
--project=chromium-extension-transfer e2e/extension-transfer.spec.mjs` — 2
  tests, including both pre-ack and post-ack persistent-profile restarts; and
- the production proof record reported
  `acknowledgedReceiptSurvivedRestart: true`,
  `acknowledgedOutboxStayedEmpty: true`, `retryAttempt: 2`, and zero duplicate
  receipts.

`pnpm verify` also passed. It covered formatting, 19 import-boundary policies,
foundation records, 33 typecheck tasks, 22 lint tasks, 87 unit files / 740
tests plus coverage, 22 builds, production package inspection, all existing
browser suites, 12 native TypeScript tests, 11 Rust tests with one reviewed
ignored secure-store harness test, native secret/archive/backup proof, schema,
license, secret, npm advisory, Rust advisory, and Changesets gates. npm and
Rust had zero known vulnerabilities; the seven existing reviewed Rust
warnings remain.

## Hosted clean-commit verification

Foundation CI run 36299203941 passed from the implementation commit. All ten
required lanes completed successfully: the aggregate foundation gate, the
production Chromium/Firefox extension transfer and fallback matrix, Chrome
151 and 152, Firefox 153 and 154, native Windows/macOS/Ubuntu package proof,
and the full-history secret scan. The dedicated extension lane rebuilt and
inspected both store packages, reproduced Firefox from the source-review ZIP,
ran the acknowledged-transfer fault injection, and uploaded immutable proof.
The pull-request-only dependency review was correctly skipped for the direct
`main` push.

## Residual scope

This proof covers acknowledged-capture data loss and duplication, not the
human speed/accuracy study in `Q2-001`, the review Inbox accessibility work in
`Q2-003`, connector policy audit in `Q2-004`, or the canonical Phase 2 journey
in `Q2-005`. Public hosted transfer remains blocked on owner-selected release
origins and extension identities.
