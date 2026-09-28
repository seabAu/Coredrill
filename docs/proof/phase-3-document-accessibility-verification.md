# Phase 3 document accessibility verification

Date: 2026-09-28
Checklist item: `DOC-009`
Implementation commit: `d901634842d732eef1f9157336afbd1a922dc170`
Hosted run: [Foundation CI 36395556190](https://github.com/seabAu/Coredrill/actions/runs/36395556190)
Status: complete

## Outcome

Coredrill's local document editor and export review now have retained,
reproducible browser and rendered-artifact proof for keyboard focus, 200% text
resize, forced colors, reduced motion, 320-CSS-pixel reflow, semantic print,
multi-page pagination, and preservation of first and final content.

The production change keeps the editor, version history, utility actions, and
export controls readable by allowing them to wrap from their intrinsic content
size. The version-comparison table owns its narrow-screen overflow in a named,
focusable local region. Print CSS keeps headings with following content where
possible and applies two-line widow/orphan safeguards to paragraphs and list
items. No account, network, hosted converter, AI provider, or implicit OCR path
participates.

## Browser accessibility and reflow proof

The production application-shell suite proves the following behavior:

- Keyboard focus advances in order from Back to documents through Undo, Redo,
  Bold, Italic, Bullet list, Numbered list, the named multiline editor, and the
  optional version label. The formatting toolbar does not create a keyboard
  trap.
- At a 200% root text size in a 1,280 by 900 CSS-pixel viewport, the editor and
  version history wrap into readable rows at least 500 CSS pixels wide, the
  formatting toolbar and history remain visible, and the document root has no
  horizontal overflow.
- The application export review also has no document-level overflow at 200%
  text size. Its format controls stack, the semantic preview remains at least
  400 CSS pixels wide, and both the named preview and Print or save PDF action
  remain visible.
- At 320 by 900 CSS pixels with forced colors and reduced motion active, the
  document root remains exactly 320 pixels wide, the motion token collapses to
  `0.01ms`, and the editor toolbar/history remain visible. The comparison table
  retains its useful minimum width inside a named local-scroll region; the
  region receives keyboard focus and ArrowRight changes its scroll position.
- Automated axe analysis, an ARIA snapshot, and retained screenshots cover the
  narrow forced-color state. Axe analysis and a retained screenshot also cover
  the 200% export-review state.

These checks use production UI and CSS rather than a separate accessibility
prototype.

## Pagination and retained visual artifact

The real-browser document suite builds a long semantic document with one title,
nine experience sections, 36 long paragraphs, a final heading, and the exact
`FINAL-PAGINATION-SENTINEL` closing paragraph. It sends that document through
the production semantic print preview and browser PDF path, then requires:

- a bounded 4-12 page result; the retained witness is five Letter pages;
- tagged PDF structure through `/StructTreeRoot` and `/Marked true`;
- the title and final sentinel to survive local PDF re-import;
- the final sentinel's source pointer to identify the actual last page; and
- no hidden upload, conversion, OCR, or external request.

The retained PDF is
[`document-accessibility-pagination.pdf`](../../fixtures/exports/document-accessibility-pagination.pdf)
(`64,940` bytes, SHA-256
`8d6f17c008432454ec741604c38c83d1485b3f560c715f51ff2f85b68b1507f2`).
Its [manifest](../../fixtures/exports/document-accessibility-pagination.manifest.json)
records Edge/Skia m154 generation, Poppler 26.07.0 rendering at 110 DPI, the
five page-image hashes, and the visual review result.

All five rendered pages were inspected. Content is not clipped at page edges;
headings remain with following content; paragraph continuation is readable;
margins and color remain consistent; and the final heading and sentinel are
visible on page five.

The executable test generates and validates a fresh PDF on every run. The
checked-in PDF is a retained visual witness, not a claim of byte-deterministic
browser PDF generation: browser producer and timestamp metadata can change its
exact bytes.

## Local verification

The complete `pnpm verify` gate passed on Windows with Node 24.19.0 and the
locked dependency graph. Material results included:

- formatting, 19-package boundary policy, foundation records, typecheck, lint,
  builds, generated schemas/reports, extension package inspection, licenses,
  secrets, npm audit, and the reviewed RustSec warning policy passed;
- 118 unit-test files and 899 tests passed; aggregate coverage remained 81.24%
  statements, 74.44% branches, 83.29% functions, and 84.19% lines;
- all 75 application-shell journeys passed, including the new keyboard, 200%
  text-resize, forced-color, reduced-motion, and 320-pixel document checks;
- all 10 document-browser journeys passed, including the fresh tagged,
  multi-page PDF generation and local re-import witness;
- all UI-foundation, onboarding, performance, resilience, and eight
  browser-storage journeys passed; and
- thirteen native storage tests and 11 Rust tests passed, with one
  platform-only secure-store test intentionally delegated to its redacted
  harness.

`git diff --check`, the focused UI typecheck/lint/unit test, and focused browser
journeys also passed before the complete gate.

## Hosted verification

[Foundation CI 36395556190](https://github.com/seabAu/Coredrill/actions/runs/36395556190)
passed exact implementation commit
`d901634842d732eef1f9157336afbd1a922dc170`. Chrome 151 and 152 both ran the
complete document and responsive application-shell proof. Firefox 153/154,
Windows, Ubuntu, macOS, extension transfer/package inspection, the complete
build/static/policy gate, and the full-history secret scan also passed. The
pull-request-only dependency-review job was not applicable to the authorized
direct push to `main`.

## Evidence boundary and decision review

This report closes the available automated, rendered, and manual visual-review
scope of `DOC-009`. It does **not** claim full WCAG conformance or substitute
automation for NVDA, VoiceOver, TalkBack, screen-magnifier, exact browser zoom,
or representative-user evidence. The exact reference-device rows remain open
under `Q1-003`; manual release obligations remain open under `A11Y-002` through
`A11Y-006`; and representative Evidence-coverage terminology validation remains
`Q3-002`.

No Accepted product or architecture decision changed. This slice strengthens
the existing D-027 restricted Tiptap and semantic local-print implementation.
It adds no dependency, migration, schema, document IR, archive, network, AI, or
source-policy change. The UI/web patch behavior has a Changeset; no ADR is
required.
