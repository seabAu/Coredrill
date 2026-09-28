# Phase 3 local document export verification

Date: 2026-09-28
Checklist item: `DOC-006`
Implementation commit: `7cf4f911130fb608afb65df3d6fb40458dd60ac4`
Hosted run: [Foundation CI 36379166728](https://github.com/seabAu/Coredrill/actions/runs/36379166728)
Status: complete

## Outcome

Coredrill now exports the exact immutable resume, cover-letter, or answer
version selected for an application as a controlled DOCX, a local semantic
browser-print PDF, or UTF-8 plain text. The Job workspace displays the selected
version, creation time, source hash, collision-safe filename, semantic preview,
estimated pagination, and format-specific warnings before export.

The workflow remains accountless, local-first, offline-capable, and useful with
AI disabled. It does not mutate a document, upload content, submit an
application, mark an application as applied, or claim that an external system
received the file.

## Exact-version and file boundaries

- Export review loads the application's existing immutable document history and
  matches the selected version ID exactly. A recoverable editor draft is never
  substituted for that version.
- DOCX and plain-text export return local bytes, media type, extension, and
  SHA-256 identity. PDF uses the same local semantic preview through the
  browser/Tauri print path; no network converter or hidden provider is used.
- Filenames remove Windows-reserved and control characters and retain the full
  normalized immutable version UUID plus version number in a reserved suffix.
  Long user-visible names therefore cannot truncate the collision-safe identity.
- Public DOCX package metadata is limited to controlled title, creator,
  subject, keywords, and generic description fields. Local job, company, and
  document/version identifiers are not embedded in the public file.
- Warning codes are stable and content-free. PDF review warns that print paper,
  margin, and scaling settings can change pagination; plain text warns that
  formatting is removed. The restricted ATS-friendly DOCX path emits no false
  unsupported-format warning.

## Rendered and browser proof

- The integrated application-shell journey selected immutable version
  `0199b300-0000-7000-8000-00000000000e`, opened its export review from the
  application document set, and proved the displayed identity and source hash
  stayed exact for all three formats.
- Downloaded DOCX bytes had the ZIP package signature and controlled core
  properties. Expanded-package inspection found no local version ID, company
  name, or job title in public metadata. Downloaded plain text matched the exact
  selected content.
- The generated PDF was rendered and visually inspected. `pdfinfo` reported one
  Letter page, tagged structure, no JavaScript, no forms, and no custom
  metadata. The test also asserted exactly one PDF page object and the intended
  safe print title at print time.
- `DOC006_E2E_PROOF` records all three formats, warnings, safe filenames, exact
  version identity, and zero external requests. Axe, ARIA relationships,
  keyboard operation, and a 320-pixel viewport passed without horizontal
  overflow.
- Existing rich rendered golden fixtures continue to prove headings, ordered
  and unordered lists, links, and supported inline marks across DOCX, PDF, and
  text. The integrated application fixture intentionally uses a small exact
  version so byte/content identity remains easy to audit.

## Local verification

- Formatting, complete TypeScript typecheck, lint, and all production builds
  passed.
- All 116 unit-test files passed with 894 tests, including the long-name
  filename case that proves the immutable identity suffix survives truncation.
- The document browser suite passed all 9 tests; the complete
  application-shell suite passed all 74 tests; the final focused export journey
  passed after the print-title and one-page assertions were added.
- All 19 package-boundary policies, 51 dependency/execution foundation records,
  3 toolchain records, 16 release targets, and 10 accessibility records passed.
- The 520-package JavaScript license inventory, 498-crate Rust license
  inventory, tracked/unignored workspace secret scan, and `git diff --check`
  passed.

## Hosted clean-commit verification

Foundation CI run `36379166728` completed successfully for exact implementation
commit `7cf4f911130fb608afb65df3d6fb40458dd60ac4`.

Required hosted jobs passed:

- build, static checks, tests, and policy (`108791128466`)
- browser storage on Chrome 151 (`108791128487`), Chrome 152 (`108791128455`),
  Firefox 153 (`108791128562`), and Firefox 154 (`108791128622`)
- native secure storage and packages on Ubuntu 26.04 (`108791128541`), Windows
  (`108791128398`), and macOS 26 (`108791128491`)
- extension transfer on Chromium and Firefox fallback (`108791128573`)
- full-history secret scan (`108791128565`)

The pull-request-only dependency review job (`108791129271`) was skipped as
expected for a direct push to `main`.

## Decision review

No Accepted product or architecture decision changed. This slice implements
the local export portion of D-027 and D-042 while preserving immutable submitted
identity as a separate explicit action. No dependency or ADR was added.

Mark Applied and exact submitted snapshots remain `DOC-007`; import/export
relationship round-trip remains `DOC-008`; and document accessibility, print,
pagination, and high-zoom completion remains `DOC-009`.
