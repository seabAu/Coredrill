# ADR-0006 — Adopt the Tiptap local document baseline

- **Status:** Accepted
- **Date:** 2026-08-24
- **Owners:** Project owner
- **Decision register IDs:** `D-027`, `Q-004`
- **Checklist IDs:** `EDT-001` through `EDT-006`
- **Amended by:** [ADR-0007](0007-patch-tiptap-prototype-manipulation.md), which supersedes only the exact Tiptap package pin with 3.30.4

## Problem and evidence

`D-027` provisionally selected Tiptap's open-source core for structured editing while
`Q-004` required proof of round-trip fidelity, accessibility, paste sanitation, large
documents, local imports/exports, and license compatibility. The choice must preserve
an accountless, offline-capable product whose canonical data and version history remain
owned by Coredrill rather than by an editor or hosted conversion service.

The Phase 0 spike defines versioned document IR 1 and restricts Tiptap 3.30.2 to
paragraphs, three heading levels, ordered/bullet lists, text, bold, italic, and safe
HTTP(S)/mail links. Real-browser tests prove keyboard edit/undo/redo, hostile-paste
sanitation, deterministic IR round-trip, and a 2,100-block synthetic 100-page workload.
Local Mammoth and PDF.js adapters map synthetic DOCX/PDF/text fixtures to explicit
unconfirmed proposals with page/line or block source references, stable limits and
errors, and an explicit scanned-file path without hidden OCR or network use.

The local export spike maps the same validated IR to controlled `docx` 9.7.1 OOXML and
semantic print HTML/CSS. The generated PDF contains Chromium's structure tree and
marked-content metadata. Final DOCX and PDF fixtures each render as one unclipped page
with matching hierarchy, paragraphs, list, link, and emphasis. Keyboard and
screen-reader-facing semantics pass the focused smoke report. All selected npm
dependencies are exact-pinned and pass the repository's advisory and license gates.

## Constraints

- Canonical document content is Coredrill's versioned IR; Tiptap JSON is an editable
  adapter representation, not durable truth by itself.
- Editing, import, and export work locally and remain useful with AI disabled.
- Imports are untrusted proposals. User-confirmed facts are never silently overwritten.
- Raw imported HTML is never mounted, unsafe links are rejected, and no remote asset,
  hosted conversion, Tiptap Cloud, collaboration, or AI dependency enters the baseline.
- DOCX exports use controlled semantic styles and ordinary flow content. PDF exports use
  the reviewed semantic print path; neither format is presented as accessibility
  certification without separate conformance evidence.

## Options considered

1. Adopt the proven restricted Tiptap core with locally owned IR/import/export adapters.
2. Use Lexical behind the same IR. It remains a viable fallback but would duplicate the
   completed schema, sanitation, accessibility, and stress proof without an observed
   advantage.
3. Use a Markdown/textarea editor. This is simpler but does not meet the proven
   structured heading/list/mark editing and accessible rich-export needs.
4. Adopt hosted editor conversion/collaboration services. This conflicts with the
   accountless offline baseline and creates avoidable data-egress and availability risk.

## Decision and rationale

Adopt option 1. Tiptap open-source core 3.30.2 is the accepted structured editor
baseline behind Coredrill's restricted schema and versioned IR. Mammoth 1.12.1 and
PDF.js 6.2.108 are accepted local proposal importers. `docx` 9.7.1 is the accepted
controlled DOCX writer, and semantic browser/Tauri print HTML/CSS is the accepted PDF
path.

The boundary is accepted because the implementation proves the failure-prone behavior
directly: hostile paste and imports cannot expand the schema, source references survive,
scanned PDFs fail into an explicit user choice, large documents stay inside the
diagnostic budget, keyboard semantics work, filenames are sanitized, and final outputs
are inspectable local files. Coredrill retains the content model and can replace an
adapter without migrating durable meaning.

## Consequences and migration

Future document versions require explicit IR migrations and immutable version creation;
they must not rewrite user-confirmed history in place. Editor features outside the
accepted node/mark set require schema, round-trip, import/export, accessibility, and
performance evidence before addition. Browser export controls should load the DOCX
adapter on demand in production UI so its package cost does not burden unrelated routes.

The checked-in synthetic fixtures are the regression baseline. Microsoft Word and
broader screen-reader/usability coverage remain public-release validation rather than
being implied by this Phase 0 architecture decision. If a Tiptap, DOCX, browser-print,
licensing, or accessibility regression cannot be contained behind the adapters, the
fallback is Lexical or a simpler Markdown editor using the same canonical IR.

## Verification and revisit trigger

Verification is recorded in [document editor/export verification](../proof/document-editor-export-verification.md),
the [browser spike report](../evidence/document-editor-spike-report.md), the
[accessibility smoke report](../evidence/document-editor-accessibility-smoke.md), and
the synthetic import/export fixtures.

Revisit this ADR when the accepted schema expands materially; representative user or
assistive-technology testing exposes a blocking interaction; DOCX/Word or PDF output
fails the supported release matrix; a dependency introduces a security/license/cloud
requirement; collaboration becomes a validated product requirement; or another editor
proves a material quality, performance, accessibility, or maintenance advantage behind
the same versioned IR.
