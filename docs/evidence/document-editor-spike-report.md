# Document editor and import spike report

- Run date: 2026-08-24
- Host: Windows, Microsoft Edge 151.0.4129.101
- Editor: Tiptap 3.30.2 with a restricted Coredrill schema
- Importers: Mammoth 1.12.1 and PDF.js 6.2.108, all processing local
- Exporters: `docx` 9.7.1 and semantic browser print, all processing local
- Test command: `pnpm test:documents-browser`

## Result

All nine browser tests passed. The proof covers edit/undo/redo, keyboard and
screen-reader-facing semantics, hostile HTML paste sanitation, lossless canonical-IR
round-trip, DOCX/PDF/Markdown source mapping, scanned PDF handling without implicit OCR,
stable failure messages, a synthetic 100-page document, controlled DOCX packaging, and
tagged semantic PDF output.

The 100-page document contained 2,100 blocks and a serialized editor payload of 288,359
characters. Loading took 16.2 ms and the measured edit transaction took 19.8 ms on this
host. The diagnostic acceptance budgets are 5,000 ms for load and 500 ms for one edit.

## Fixture visual verification

The synthetic DOCX rendered to one unclipped letter page with ordinary paragraphs,
headings, a plain contact line, and semantic bullets. The text PDF rendered to two
unclipped letter pages. The scanned PDF rendered to one page whose visible content is
entirely raster data. The final exported DOCX and PDF each rendered as one unclipped
letter page with matching content and a white page background. Every rendered page was
inspected at original detail; comparison PNGs are checked in under
`fixtures/exports/rendered/`.

## Security and evidence boundary

The DOCX adapter parses Mammoth output in a detached document and only maps a whitelist
of structural nodes and marks into the canonical IR; imported HTML is never mounted.
External file access is disabled, images are omitted, unsafe links become plain text,
and every import result is explicitly marked `proposal`. PDF.js uses a bundled worker.
Scanned files receive an actionable local-OCR/manual-paste option and are never sent to
a service automatically.
