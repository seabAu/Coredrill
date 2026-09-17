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

## Security maintenance verification

The original editor/import/export proof above remains an historical record of the
3.30.2 baseline. On 2026-09-03, accepted [ADR-0007](../adr/0007-patch-tiptap-prototype-manipulation.md)
amended only that exact dependency version: all six aligned Tiptap packages moved to
3.30.4 to remove the reviewed prototype-manipulation advisory. No editor contract,
document IR, schema, product behavior, permission, service, or architecture changed.

Commit `03b760fa753a841efa49f62f449cb6779ba10854` passed the complete local
foundation gate as part of final implementation head
`230e771a60609e6e14ceb0867a107fdd1188002c`, including both exact Chrome lanes'
nine document-browser tests. The exact head then passed
[Foundation CI run 33723649238](https://github.com/seabAu/Coredrill/actions/runs/33723649238),
including the aggregate frozen-install/advisory gate, Chrome 151 and 152 document
artifacts, Firefox storage lanes, full-history secret scan, extension transfer, and
Windows/macOS/Linux installed-package proof. The npm audit reported no known
vulnerabilities. Immutable document-editor artifacts were `9881242703`
(`sha256:c5e34268bf8903f84c1bbd7af8ad88ee87eea6474a8d12047327a8471574007d`)
for Chrome 151 and `9881264041`
(`sha256:3d51fd0e145c6c4c0d498520f253c708d27c6cc554d85484f556148db13a861c`)
for Chrome 152; both were unexpired when this supplement was recorded.

### 2026-09-17 Markdown ReDoS maintenance

Accepted [ADR-0008](../adr/0008-patch-tiptap-markdown-redos.md) supersedes only
ADR-0007's exact dependency pin. The complete resolved Tiptap family moved from 3.30.4
to 3.30.5, the first release patched for `GHSA-j95f-988m-3j2f`. Coredrill still does
not enable Tiptap Markdown ingestion, and the canonical document IR, restricted schema,
local import/export boundary, permissions, persistence, and user behavior are unchanged.

Implementation commit `8e9c1457ed8fafbf0c7349bd59d516bc7025763e` passed the
complete local foundation gate, including all nine document-browser tests, hostile paste
sanitation, deterministic IR round-trip, the synthetic 100-page editor case, local
DOCX/PDF import, and accessible DOCX/tagged print-PDF export. The refreshed exact graph
passed 520-package npm and 498-crate Rust license policy checks; npm reported no known
vulnerabilities.

The exact commit then passed
[Foundation CI run 35259770050](https://github.com/seabAu/Coredrill/actions/runs/35259770050).
Both Chrome document lanes, the aggregate frozen-install/advisory gate, Firefox storage,
full-history secret scan, extension transfer, and Windows/macOS/Linux installed-package
proof completed successfully.

## Known boundary

The print-generated PDF is structurally tagged by the supported Chromium engine; it is
not PDF/UA certification. DOCX rendering was compared in LibreOffice during this slice;
public-release validation still includes supported Microsoft Word and representative
assistive-technology/user journeys. OCR remains optional, local, explicit, and outside
the baseline.
