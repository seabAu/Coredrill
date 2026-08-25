# Document editor, import, and export verification

Verified 2026-08-24 on Windows with Node.js 24.19.0, pnpm 11.22.0, Microsoft Edge
151.0.4129.101, LibreOffice, and Poppler.

## Accepted boundary

- Tiptap 3.30.2 owns only a restricted local editing surface backed by canonical
  document IR version 1; cloud, collaboration, conversion, and AI services are absent.
- Mammoth 1.12.1 and PDF.js 6.2.108 produce unconfirmed, source-mapped import proposals.
  External DOCX file access is disabled, imported HTML is parsed detached and never
  mounted, PDF.js uses its bundled worker, and scanned PDFs do not trigger implicit OCR.
- `docx` 9.7.1 creates controlled local OOXML. The PDF path uses semantic local
  HTML/CSS and the browser print engine. Both start from the same validated IR.
- Import size/page/depth/content limits, safe-link protocols, filename sanitation, and
  stable failure messages are enforced before durable application state is involved.

## Reproducible proof

`pnpm test:documents-browser` passes nine Microsoft Edge tests covering edit,
keyboard undo/redo, hostile paste sanitation, IR round-trip, a synthetic 100-page
document, DOCX/PDF/Markdown import and source mapping, scanned-PDF handling, stable
failure messages, semantic print preparation, DOCX packaging, and tagged PDF output.
The PDF assertion requires both a structure tree and marked-content metadata.

The final fixtures are documented in `fixtures/exports/README.md`. LibreOffice plus
Poppler rendered the DOCX to one page; Poppler rendered the generated PDF to one page.
Every page was inspected at original detail and the final comparison PNGs are checked
in. The reviewed DOCX SHA-256 is
`77a10ffc85c90e6f98a3be2be331b7823f71085815e6eeab5303e0d174fb3652`; the reviewed
PDF SHA-256 is
`a0e748e829532f17937d6840628ff9832bb64e53c1e3efa116c9f56e39599579`. The
[editor spike report](../evidence/document-editor-spike-report.md) records the
large-document measurement, and the [accessibility smoke report](../evidence/document-editor-accessibility-smoke.md)
records the keyboard, semantic, and visual review.

The repository aggregate gate passed formatting, boundaries, governance, typecheck,
lint, 143 unit tests, 92.75% statement coverage, all builds, nine document-browser
tests, four browser-storage tests, native SQLite/secure-store/recovery proof, generated
schema checks, advisory scans, license policy, secret policy, and Changesets status. The
`docx` dependency is exact-pinned, represented in the reviewed dependency inventory,
and covered by the same advisory/license gates.

Clean-commit [Foundation CI run 32772501057](https://github.com/seabAu/Coredrill/actions/runs/32772501057)
passed from commit `473d9105ab41d835ea20399a7d1905b828f64bb5`. Both exact Chrome
lanes ran the nine-test document suite and uploaded the editor/import/export artifact;
the aggregate frozen-install gate, extension lanes, Firefox storage lanes, full-history
secret scan, and Windows/macOS/Linux native package lanes also completed successfully.

## Known boundary

The print-generated PDF is structurally tagged by the supported Chromium engine; it is
not PDF/UA certification. DOCX rendering was compared in LibreOffice during this slice;
public-release validation still includes supported Microsoft Word and representative
assistive-technology/user journeys. OCR remains optional, local, explicit, and outside
the baseline.
