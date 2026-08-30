# Phase 2 source-preview verification

Date: 2026-08-30

Branch: `main`

Implementation commit: `3df9d55b722f47e863b8d76418661b32a5e19755`

## Outcome

`CAP-004` is proven. Coredrill now opens durable capture receipts in an accountless, local-only Inbox review surface. Stored envelope JSON must pass the strict V1 dispatcher and reproduce its canonical semantic content hash before any preview is projected. Selected text, readable text, retained HTML, and structured JSON become inert strings; every field candidate remains separately visible with its value, provenance method, confidence, pointer, and retained or derived excerpt.

Activating a snapshot path or field-evidence control focuses the source region and highlights the retained matching text. The preview never visits a displayed source URL, performs no network request, promotes a candidate into a job, marks a value confirmed, or mutates durable capture data.

## Fail-closed projection boundary

`@coredrill/capture-core` parses each stored receipt through `safeParseCaptureEnvelope`, recomputes `createCaptureEnvelopeContentHashV1`, and rejects malformed or hash-drifted data before constructing the preview model. This check covers source metadata, captured content, and sorted field-candidate facts rather than trusting the receipt's stored hash.

Preview projection is content-shape-specific:

- selected and readable text are normalized into named text sections;
- JSON-LD and saved JSON values are deterministically serialized as inert text sections;
- retained HTML is rejected unless the caller supplies the reviewed detached HTML-to-text renderer; and
- unsupported or empty content returns a bounded failure rather than an incomplete trusted-looking preview.

The web renderer parses retained HTML in a detached document and removes script, style, template, noscript, frame, object/embed, SVG/MathML, image/media, link, and metadata elements. Only normalized `textContent` crosses into the preview model. The UI then uses ordinary React text children throughout; it has no captured-markup injection path.

## Evidence and navigation

The Inbox queue reports the capture method, source kind, captured time, and available evidence count. A selected receipt exposes:

- source metadata without a clickable/fetched source URL;
- one control for each retained snapshot section and its exact source path;
- one control for each field candidate and its exact provenance pointer;
- previous/next evidence traversal; and
- a focusable source region whose highlight is derived only from retained section text.

A pointer that maps to selected text, readable text, HTML-derived text, or structured JSON focuses that captured section. A field path such as `/fields/title` focuses the candidate's evidence record and best retained excerpt without implying that the candidate is resolved or user-confirmed. Loading, empty, parse/hash failure, and review states remain explicit.

## Hostile-content proof

The committed HTML fixture contains executable script, event handlers, an external image, an iframe, SVG, MathML, object/embed content, metadata/link nodes, and long unbroken hostile labels. The JSON fixture contains markup-shaped strings and script-like content. The Playwright case persists both through the real schema-92 capture inbox, reloads the app, opens each durable receipt, and proves:

- hostile HTML becomes readable inert text and no script executes;
- markup-shaped JSON is displayed as escaped text and creates no DOM element;
- neither fixture produces an external request;
- snapshot-path and field-excerpt controls move focus to the expected source region;
- the review surface has zero automated Axe violations; and
- a forced wide-glyph font still reflows at 360 CSS pixels with no page overflow.

The machine-readable result was:

```json
{
  "durableReceipts": 2,
  "hostileHtmlInert": true,
  "markupShapedJsonEscaped": true,
  "sectionPathFocused": true,
  "fieldExcerptFocused": true,
  "crossFontReflow": true,
  "narrowReflow": true,
  "axeViolations": 0,
  "externalRequests": 0
}
```

## Local verification

The final focused Playwright invocation passed the hostile source-preview case with the exact record above. The retained final `pnpm verify` invocation then exited successfully and reproduced:

- formatting, 19 package-boundary policies, and 49 dependency/foundation records;
- typecheck, lint, and build across 22 packages;
- 63 unit files and 558 tests;
- 81.58% statements, 74.32% branches, 81.25% functions, and 84.21% lines;
- all 63 application-shell cases, including CAP-003 and CAP-004, plus UI-foundation, performance, resilience, onboarding, document, and browser-storage suites;
- 12 native Vitest cases, 11 passing Rust tests plus one intentional secure-store harness exclusion, native secure-store/archive/backup proofs, and generated-contract drift checks;
- 520 npm and 498 Rust license records, workspace secret scanning, zero known npm vulnerabilities, and the existing 15 explicitly allowed Rust maintenance/unsoundness warnings; and
- a valid Changesets release record for capture-core, UI, and web.

No dependency or lockfile change was required. The Linux hosted failure from an unbroken hostile label was reproduced locally with a wide monospace font; the final style rule applies `min-width: 0` and `overflow-wrap: anywhere` to every untrusted queue, location, and evidence-label child, and the regression stays in the committed browser proof.

## Hosted clean-commit proof

The exact implementation commit ran in [Foundation CI run 33316329358](https://github.com/seabAu/Coredrill/actions/runs/33316329358). The [Chrome 151 job 99270364602](https://github.com/seabAu/Coredrill/actions/runs/33316329358/job/99270364602) emitted the exact CAP-004 record above and passed all 63 application-shell tests in 2.5 minutes. The [Chrome 152 job 99270364615](https://github.com/seabAu/Coredrill/actions/runs/33316329358/job/99270364615) independently emitted the same record and passed all 63 tests in 2.0 minutes.

Their immutable app-shell artifacts are:

- [`coredrill-app-shell-chrome-151.0.7922.138-3df9d55b722f47e863b8d76418661b32a5e19755`](https://github.com/seabAu/Coredrill/actions/runs/33316329358/artifacts/9733617686), artifact ID `9733617686`, 73,385,966 bytes, digest `sha256:c50d6b70d42ea6724af0b0b971fc53c1b6b51e003a0d0efc4703231e1da2a677`.
- [`coredrill-app-shell-chrome-152.0.7977.54-3df9d55b722f47e863b8d76418661b32a5e19755`](https://github.com/seabAu/Coredrill/actions/runs/33316329358/artifacts/9733604349), artifact ID `9733604349`, 73,383,267 bytes, digest `sha256:ca22dcd0f232c8eda357bd9f947061276ad3687b1d6717cfd26193fa9ee95f27`.

The [aggregate quality job 99270364599](https://github.com/seabAu/Coredrill/actions/runs/33316329358/job/99270364599) reran the complete foundation gate, emitted the same CAP-004 record, passed the 63-case browser suite, found no known npm vulnerabilities, and retained the 15 reviewed Rust warnings. The same run also completed the two pinned Firefox repository/storage lanes, extension-transfer packaging, full-history secret scan, and Windows/macOS/Linux native package lanes successfully.

## Reviewed files

- `packages/capture-core/src/source-preview.ts` and its tests — strict receipt parsing, semantic-hash verification, inert projection, evidence construction, and failure states.
- `apps/web/src/source-text.ts` — detached, allow-nothing executable/media HTML-to-text rendering.
- `packages/ui/src/capture-inbox-review.tsx` and `packages/ui/styles.css` — accessible queue, evidence controls, focus/highlight behavior, and cross-font narrow reflow.
- `apps/web/src/app-shell.tsx` — Inbox-only durable receipt loading and fail-closed preview composition.
- `fixtures/capture/hostile-source.html`, `fixtures/capture/hostile-source.json`, and their fixture record — reviewed hostile inputs.
- `e2e/source-preview.spec.mjs` — durable reload, inertness, no-network, excerpt/path focus, Axe, and cross-font reflow proof.
- `01-product-ui-and-journeys.md`, `02-runtime-architecture.md`, `04-capture-extraction-sources.md`, `06-security-sync-deployment-testing.md`, and `09-interface-system.md` — implemented journey, runtime, capture, security, and interface boundaries.
- `.changeset/inert-source-previews.md` — release/governance record.

## Scope and decisions

This slice adds no database migration, external dependency, connector, crawler, background surveillance, account, hosted service, AI integration, automatic merge, or automatic job creation. It realizes the accepted local-first, provenance, validation, review, and hostile-content decisions without changing one, so no ADR is required.

`CAP-005` is the next smallest unblocked slice: retain and reconcile all field candidates and explicit conflicts while proving that newly extracted values cannot overwrite a user-confirmed value. `GATE-1`, the representative participant study, and `FND-001` remain independently open on their recorded external owners; none is reinterpreted as complete here.
