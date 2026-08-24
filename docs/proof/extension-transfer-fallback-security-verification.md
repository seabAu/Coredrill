# Extension transfer, fallback, and security verification

Date: 2026-08-24
Scope: `EXT-004` through `EXT-006`
Status: implementation and local proof complete; clean-commit hosted proof pending

## Outcome

The Phase 0 extension bridge now transfers one validated outbox item at a time from the exact `https://app.coredrill.test` origin, persists the complete source envelope in SQLite schema version 2 before acknowledgement, retains it for retry when acknowledgement is withheld or fails, and removes only an exact ID/checksum/content-hash/nonce/sequence match. The app treats an exact repeated offer as an idempotent duplicate and treats any collision across those replay identifiers as a security failure.

`app.coredrill.test` is a deliberately non-deployable [special-use test domain](https://www.rfc-editor.org/rfc/rfc6761#section-6.2), not a silently selected public product domain. It lets Phase 0 prove an exact HTTPS origin without claiming an owner deployment decision. A release build must replace this single match with the selected isolated app origin and rerun the same inspector/E2E proof.

Firefox MV3 uses the already-approved explicit JSON fallback because Firefox does not expose Chrome's web-page external messaging path. The Firefox build has a stable `capture@coredrill.local` Gecko ID, declares `required: ["none"]` data collection, includes no `externally_connectable` or content-script entry, and exports the same bounded checksummed outbox contract for strict app import.

## Transfer and durable acknowledgement

The shared `@coredrill/extension-bridge` protocol accepts only two exact, versioned page requests:

- `capture.transfer.pull.v1` with a bounded cryptographic request ID;
- `capture.transfer.ack.v1` with the exact offered envelope ID, SHA-256, content hash, nonce, and sequence.

The extension increments and durably stores `attemptCount` before returning an offer. The app revalidates the request correlation, extension ID, envelope schema/size, checksum, expiry, and sender kind/ID. Migration `0002_capture_inbox.sql` then commits the complete envelope plus replay identifiers to the shared SQLite database. Only after that transaction fulfills does the app return the exact acknowledgement. A failed or deliberately omitted acknowledgement leaves the extension item queued; the next pull returns attempt 2 and the app deduplicates it against the existing durable receipt before acknowledging it.

This is a pull/ack data boundary, not a page-controlled fetch API. No request contains a URL to fetch, and neither target adds a host permission.

## Local real-browser proof

Command:

```text
pnpm test:extension-transfer
```

Result: 2/2 E2E tests passed.

- Playwright Chromium `149.0.7827.55` loaded the exact unpacked `chrome-mv3` production directory in a persistent context, discovered extension ID `holjbedmdgepcgdfhpdmnkmjnihihlee`, queued one real outbox item, and transferred it from `https://app.coredrill.test`.
- The first app receipt committed to SQLite schema 2 while acknowledgement was intentionally withheld. After closing/reloading the app, the retry arrived as attempt 2, matched exactly one existing receipt, acknowledged successfully, and reduced the extension outbox to zero.
- The same live boundary rejected an oversized/extra-field request, a wrong envelope ID, an acknowledgement replay after removal, and an unrelated HTTPS origin. The app retained one receipt throughout.
- Playwright Firefox `151.0` imported the Firefox JSON export twice and recorded one durable `manual_export` receipt (`imported: 1`, then `duplicates: 1`). A changed export checksum was rejected without changing the receipt count.

Machine-readable output is written to `test-results/extension-transfer.json`. The clean-commit hosted run and immutable uploaded artifact will be recorded here before the checklist items are marked complete.

## Security and compatibility tests

The focused `transfer-security.test.ts` suite adds seven cases covering:

- acknowledgement loss and incremented retry;
- exact acknowledgement and acknowledgement-before-offer rejection;
- wrong envelope ID and altered checksum rejection;
- exact-key and 2 KiB request limits, including rejection of a page-controlled fetch-shaped message;
- expected request ID and extension ID validation;
- changed payload, checksum, expiry, and expired-export rejection;
- bounded outbox export checksum verification and acknowledgement replay rejection.

The extension sender-policy test additionally rejects wrong origin, URL/origin disagreement, child frames, extension/native senders, incognito tabs, and opaque origins. Chrome documents `origin`, frame URL, and top-level `frameId` on `MessageSender`; the implementation requires all of them to agree. The manifest separately restricts web messaging to the one reviewed origin. See [Chrome external messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#external-webpage), [Chrome `MessageSender`](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender), and [MDN `externally_connectable`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/externally_connectable).

## Local verification snapshot

- build: 22/22 workspace tasks passed; both production extension targets built;
- production inspector: Chromium and Firefox exact permissions, manifests, CSP, entrypoints, transfer mode, local assets, and no remote/eval code passed;
- typecheck: 28/28 tasks passed;
- lint: 22/22 workspace tasks plus root tooling passed;
- unit/security: 23 files, 134 tests passed;
- native shared migration proof: 9 TypeScript/native-process tests plus 6 Rust tests passed (1 platform proof intentionally ignored in the ordinary Rust run);
- browser SQLite schema-2 lifecycle: 4/4 Edge E2E tests passed;
- dependency review: unchanged 459-entry resolved graph, zero advisories at every severity, 348 npm license records and 498 Cargo crate license records passed;
- `pnpm-lock.yaml` SHA-256: `58340bbd70a44324afa62d80e902cffb10254a54b940055b2eb3893a4ec79d11`;
- migration 0002 SHA-256: `b6a44b450f90d40f3b90f6562a8d26964e5e0e9af5d1c308173897414f280925`.

## Decision status

This slice implements the transfer/fallback/security portion of provisional `D-023` without changing an Accepted decision. `D-023` and `Q-005` remain open until `EXT-007` completes the final artifact/secret review and `EXT-008` records the WXT/side-panel decision. No ADR is required for this partial gate.
