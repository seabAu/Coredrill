# Phase 2 supplied-capture verification

Date: 2026-08-30  
Branch: `main`  
Implementation commit: `e2600b5d768fdb115c7a2bf667820683f1cd1c2d`

## Outcome

`CAP-003` is proven. Coredrill now accepts an explicit manual form, pasted listing text, a pasted HTTP(S) URL, and saved HTML, text, or JSON from the shared Add surface. Every successful route constructs a strictly validated `CaptureEnvelopeV1`, preserves user-supplied title/company provenance, and commits a durable schema-92 inbox receipt before reporting success. A pasted URL is never fetched, saved HTML never enters a live document, and no capture is silently promoted into a job.

## User-invoked local routes

The capture dialog exposes three plainly named modes:

- **Manual form** requires a title and optionally accepts company, source URL, and notes.
- **Paste text or URL** accepts listing text or recognizes a complete HTTP(S) URL supplied by itself. URL fragments are removed, credentials and non-HTTP(S) schemes are rejected in the explicit URL field, and no network retrieval occurs.
- **Saved file** accepts `.html`/`.htm`, `.txt`, and `.json` only. Files are read locally and are never uploaded.

The dialog states the accountless, local-only, AI-disabled, no-fetch, review-required boundary. Validation failures retain the user's form state and return a bounded message. The Add menu's Add job, Paste listing, and Capture URL actions plus Home's Add job action open these implemented paths; existing keyboard focus restoration and Escape behavior remain covered by the shell suite.

## Bounded and inert input handling

Saved inputs are limited to 2 MiB before reading. Plain or HTML-derived readable text must fit the V1 512 KiB text bound. JSON must parse, contain only JSON values, and stay within 10,000 traversed values and 32 levels of nesting before it is offered to the envelope boundary.

Saved HTML is parsed with `DOMParser` in a detached document. Script, style, template, noscript, iframe, object, embed, SVG, and MathML elements are removed. Only normalized readable text is retained in `content.readableText`; neither live nodes nor captured HTML are rendered. The hostile E2E fixture includes a script and an external tracking image. It proves that the script never runs, the image is never requested, and the durable envelope contains only `Security Engineer SecureCo`.

Invalid JSON fails before the receiver is called, so the durable inbox row count remains unchanged. Unsupported types, empty/oversize files, oversize text, unsafe explicit URLs, over-complex JSON, and an empty supplied draft similarly fail closed.

## One envelope and inbox boundary

`@coredrill/capture-core` uses one internal V1 construction path for extension and supplied input. Supplied title/company fields become `method: "user"`, confidence-1 field candidates whose capture source ID equals the envelope UUID and whose captured time equals the envelope time. The builder computes the canonical semantic content hash and then validates the final envelope through the versioned contracts dispatcher.

The web receiver allocates the sequence for sender `coredrill.web.local-capture` and completes construction inside the existing SQLite transaction. It queues the envelope through the existing outbox validator to verify the complete transport checksum and expiry, then reuses the idempotent inbox writer. The UI reports success only after commit.

No migration was needed. `received_via = "manual_export"` remains the existing user-supplied import transport channel, while each envelope retains its specific `captureMethod` and `sourceKind`: `manual_entry`, `pasted_listing`, `saved_html`, `saved_text`, or `saved_json`. Retaining schema 92 preserves compatibility with the committed Phase 1 recovery archive. The route creates neither a hosted store nor a reviewed job record.

## Focused and end-to-end proof

The capture-core suite adds 10 total builder tests. Its supplied-input cases create manual, paste, saved-text, saved-HTML-text, and saved-JSON envelopes through the same strict contract; recompute every content hash; verify provenance-bearing user candidates; and reject empty or schema-invalid drafts.

The final local `pnpm test:app-shell` run passed 62/62 Playwright cases. The two new cases prove:

- manual, pasted-text, and pasted-URL receipts survive a page reload;
- URL fragments are normalized and no external request occurs;
- title provenance points to the envelope UUID with `method: "user"`;
- saved HTML becomes inert readable text and executes no script;
- saved text and JSON retain their distinct source kinds and content shapes;
- invalid JSON writes no partial receipt;
- all successful receipts remain at schema version 92; and
- both open capture states have zero automated Axe violations.

The machine-readable result was:

```json
{
  "schemaVersion": 92,
  "manual": true,
  "pastedText": true,
  "pastedUrlWithoutFetch": true,
  "savedHtmlAsInertText": true,
  "savedText": true,
  "savedJson": true,
  "invalidJsonRejected": true,
  "durableReceipts": 3,
  "externalRequests": 0
}
```

## Local verification

`pnpm install --frozen-lockfile` passed against lockfile SHA-256 `9d29afa39902555eb9cc20753df52b9e50245a13a3131f8b7545030d84e25b9c`. The only dependency change is the reviewed `workspace:*` edge from `@coredrill/web` to `@coredrill/capture-core`; the exact graph remains 935 external resolutions and 520 license records.

The retained final `pnpm verify` invocation exited successfully. It reproduced:

- formatting, 19 package-boundary policies, and 49 dependency/foundation records;
- typecheck, lint, and build across 22 packages;
- 61 unit files and 552 tests;
- 81.92% statements, 74.52% branches, 81.62% functions, and 84.56% lines;
- 62 application-shell/browser cases including the CAP-003 proof, plus UI, performance, resilience, onboarding, document, and storage browser suites;
- 12 native Vitest cases, 11 passing Rust tests plus one intentional secure-store harness exclusion, native secure-store/archive/backup proofs, and generated-contract drift checks;
- 520 npm and 498 Rust license records, workspace secret scanning, zero known npm vulnerabilities, and the existing 15 explicitly allowed Rust maintenance/unsoundness warnings; and
- a valid Changesets release record for capture-core and web.

## Hosted clean-commit proof

The exact implementation commit completed [Foundation CI run 33313215772](https://github.com/seabAu/Coredrill/actions/runs/33313215772) successfully across the aggregate gate, two pinned Chrome versions, two pinned Firefox versions, extension transfer, full-history secret scan, and Windows/macOS/Linux native package lanes.

The [Chrome 151 job 99261865246](https://github.com/seabAu/Coredrill/actions/runs/33313215772/job/99261865246) ran 62 application-shell tests and emitted the exact CAP-003 record above before passing in 2.1 minutes. The [Chrome 152 job 99261865286](https://github.com/seabAu/Coredrill/actions/runs/33313215772/job/99261865286) independently emitted the same record and passed all 62 tests in 2.4 minutes. Their immutable app-shell artifacts are:

- [`coredrill-app-shell-chrome-151.0.7922.138-e2600b5d768fdb115c7a2bf667820683f1cd1c2d`](https://github.com/seabAu/Coredrill/actions/runs/33313215772/artifacts/9732685576), artifact ID `9732685576`, 73,127,032 bytes, digest `sha256:7c664e138d9ff4f3e90c85cfcdf1c67ae0510a2a98bf1ba213e687f00abb3ad0`.
- [`coredrill-app-shell-chrome-152.0.7977.54-e2600b5d768fdb115c7a2bf667820683f1cd1c2d`](https://github.com/seabAu/Coredrill/actions/runs/33313215772/artifacts/9732692022), artifact ID `9732692022`, 73,124,129 bytes, digest `sha256:771a824cbbacd639c06286a65b3c50d694c9e912a2d783720eb39282bd566562`.

The [aggregate quality job 99261865269](https://github.com/seabAu/Coredrill/actions/runs/33313215772/job/99261865269) reran the complete foundation gate, emitted the same CAP-003 record, passed the 62-case browser suite, found no known npm vulnerabilities, and retained the 15 reviewed Rust warnings. The hosted run also proves the unchanged schema-92 recovery archive on both Firefox and Chrome and completed every native package lane successfully.

## Reviewed files

- `packages/capture-core/src/envelope.ts` and its builder tests — shared V1 construction, user provenance, semantic checksum, and strict validation.
- `apps/web/src/supplied-capture.ts` — URL, text, file, JSON-complexity, and inert-HTML boundaries.
- `apps/web/src/capture-entry-dialog.tsx`, `app-shell.tsx`, and `app-shell.css` — accessible local capture composition.
- `apps/web/src/extension-transfer.ts` — transactional local sender sequence, outbox validation, and durable inbox reuse.
- `e2e/supplied-capture.spec.mjs` — durable, reload, provenance, hostile-content, no-fetch, and Axe proof.
- `01-product-ui-and-journeys.md`, `02-runtime-architecture.md`, and `04-capture-extraction-sources.md` — implemented journey, runtime, and capture constraints.
- `.changeset/local-captures-enter.md` and the refreshed dependency inventory — release and governance records.

## Scope and decisions

This slice adds no external dependency, database migration, connector, crawler, background surveillance, account, hosted service, AI integration, automatic merge, or automatic job creation. It realizes the accepted local-first capture, provenance, validation, and review decisions without changing one, so no ADR is required.

`CAP-004` is the next smallest unblocked slice: sanitized source preview and excerpt/path navigation with hostile XSS fixtures and a UI test. `GATE-1`, the representative participant study, and `FND-001` remain independently open on their recorded external owners; none is reinterpreted as complete here.
