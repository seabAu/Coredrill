# Phase 3 resume import fixture review

Date: 2026-09-28
Checklist item: `Q3-001`
Implementation commits: `f1b30e61634410d33d5d52a2204d2ef462fd510a`, `aff3eb301b98ad166d8a4bbf790618bd7f1daa02`
Hosted run: [Foundation CI 36399789314](https://github.com/seabAu/Coredrill/actions/runs/36399789314)
Status: complete

## Outcome

Coredrill's accepted local Mammoth, PDF.js, and text import boundary now has a
versioned, deterministic synthetic review matrix for two DOCX layouts, ordinary
and varied PDF layouts, Markdown, an image-only scanned PDF, a representative
75-page PDF, a deliberately corrupt PDF, signature mismatch, corrupt DOCX,
unsupported type, and the 10 MiB input limit.

Every successful import remains an unverified `proposal`. The browser proof
checks exact source file identity, byte length, SHA-256 digest, block or
page-qualified source mappings, bounded excerpts, and final-page provenance.
No import accepts evidence, writes Career Profile state, invokes OCR, calls an
AI provider, or makes an external request.

## Versioned fixture matrix

[`fixture-manifest.json`](../../fixtures/imports/fixture-manifest.json) is the
machine-readable fixture inventory. A browser test independently rereads all
eight referenced files and requires every byte length and SHA-256 digest to
match the manifest.

| Case                       | File                          |  Bytes | SHA-256                                                            | Expected result                                                                                           |
| -------------------------- | ----------------------------- | -----: | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| DOCX baseline              | `synthetic-resume.docx`       | 37,150 | `a77c6c7003650c4bfe1dcab8842aafee234c78d1d85a20c598b168179d507098` | Eight source-mapped blocks spanning title, headings, paragraphs, bold, italic, safe link, and bullet list |
| Controlled DOCX round trip | `accessible-resume.docx`      |  9,248 | `77a10ffc85c90e6f98a3be2be331b7823f71085815e6eeab5303e0d174fb3652` | Five source-mapped blocks from the separately generated and rendered controlled export                    |
| PDF baseline               | `synthetic-two-page.pdf`      |  2,146 | `16f312880841ce831b7d02a15048c7e7bd7ff00dcb5b30f1c8937b2dc5ba5ad8` | Text retained with page-one and page-two mappings                                                         |
| Varied PDF                 | `synthetic-varied-layout.pdf` |  2,806 | `6419e0ae396dc97e60aac8e5d13033b81af48085db4f9b6292fad1cbacc4bda1` | Portrait, two-column, and landscape-page sentinels retained; final source points to page three            |
| Scanned PDF                | `synthetic-scanned.pdf`       | 20,485 | `d89effe845261ae7094d69809d1807daec1e40fcfdeb0b5109b4ba828270badc` | Zero extracted blocks and mappings plus the actionable explicit-local-OCR-or-paste warning                |
| Representative large PDF   | `synthetic-large.pdf`         | 45,202 | `1ecee665bd420212082da28d69c74b0162902660ea16ad85abdbf872fcd8909e` | 75 pages and 227 blocks; first and final sentinels retained; final mapping points to page 75              |
| Corrupt PDF                | `synthetic-corrupt.pdf`       |     73 | `2fe3dc3715054c90c866bf7587d79323c579ed2ae8ebe8c9b2cee53d18c6cce6` | Stable `corrupt_file` rejection with recovery guidance                                                    |
| Markdown baseline          | `synthetic-profile.md`        |    116 | `923c9554e6d6d0a3ace1ed0c78fe02e49e9acf487dfca5b27852382ee3e2f77f` | Heading, paragraph, and bullet-list mappings retain exact line pointers                                   |

The generator reproduced all seven files it owns with 7/7 unchanged hashes.
The second DOCX is referenced rather than regenerated here because it is the
accepted controlled export fixture with its own retained LibreOffice/Poppler
render proof. No real resume, job-seeker data, employer correspondence,
credential, or production artifact appears in the matrix.

## Real-browser importer proof

The 13-case document-browser suite exercises the actual browser import worker
and accepted adapters. The new and strengthened cases require:

- all eight manifest entries to match the checked-in bytes;
- both DOCX layouts to remain source-mapped proposals with exact file hashes;
- rich DOCX structures and safe marks to survive without raw imported HTML;
- the varied PDF's portrait, two-column, and landscape content to survive with
  the final sentinel mapped to page three;
- the 75-page PDF to retain first and final sentinels, 227 blocks, and a
  page-75 source pointer; the focused run completed that import in 463 ms on
  the local Windows reference environment, which is diagnostic rather than a
  public release SLO;
- the scanned PDF to produce no text or mappings and to request explicit local
  OCR or manual paste instead of performing hidden OCR;
- the corrupt PDF, mismatched PDF signature, corrupt DOCX, unsupported RTF,
  and an input one byte above 10 MiB to fail with stable actionable errors; and
- zero external requests throughout the DOCX, varied-PDF, scanned-PDF, text,
  and large-PDF journeys.

The suite does not bypass durable policy: import output is still only a
proposal. `EVD-004` continues to own extraction into pending field-level
proposals, and explicit user review remains required before evidence can be
accepted or merged.

## Render and visual review

All new or changed valid PDFs were rendered with Poppler 26.07.0 at 72 DPI.
The review covered 81 pages: two baseline pages, three varied-layout pages, one
scanned page, and all 75 large-document pages. Every page was present, readable,
unclipped, and free of overlap; portrait and landscape dimensions were retained;
the two-column witness stayed separated; and the large fixture showed the
expected sequential page sentinel through page 75.

The 73-byte corrupt PDF has no valid page to inspect. Poppler rejected it with
end-of-file, missing-trailer, and unreadable-xref errors, matching the product's
fail-closed `corrupt_file` behavior.

The two DOCX files were not changed by this slice. The baseline regenerated to
its accepted hash, and the controlled export is referenced at its accepted
hash. Their existing one-page LibreOffice/Poppler renders therefore remain the
visual witness recorded by the Phase 0 document editor/export verification.
No new DOCX was accepted without a current bundled renderer.

## Local verification

The complete `pnpm verify` gate passed on Windows at primary matrix commit
`f1b30e61634410d33d5d52a2204d2ef462fd510a` against the locked dependency graph.
Material results included:

- formatting, 19-package boundaries, foundation records, typecheck, lint,
  builds, generated schemas/reports, extension inspection, license policy,
  secret scanning, npm audit, and Changesets passed;
- 118 unit-test files and 899 tests passed, followed by the aggregate coverage
  gate;
- all 75 application-shell, five UI-foundation, seven onboarding, three
  resilience, eight browser-storage, 13 document-browser, and performance
  journeys passed;
- 13 native TypeScript tests and 11 Rust tests passed, with one platform-only
  secure-store test intentionally delegated to its redacted harness; and
- npm reported no known vulnerabilities. Rust audit retained only the seven
  already reviewed maintenance/unsoundness warnings.

Final commit `aff3eb301b98ad166d8a4bbf790618bd7f1daa02` adds only the
already-rendered controlled DOCX reference plus its manifest/browser assertions.
Focused verification on that exact head passed deterministic 8/8
referenced-fixture regeneration, `git diff --check`, and the 13-case real-browser
document suite. Python compilation, repository-wide typecheck and lint, and 899
unit tests had already passed for the primary matrix.

## Hosted verification

[Foundation CI 36399789314](https://github.com/seabAu/Coredrill/actions/runs/36399789314)
passed exact head `aff3eb301b98ad166d8a4bbf790618bd7f1daa02`. The aggregate
build/static/test/policy job, Chrome 151/152, Firefox 153/154, Windows, macOS,
Ubuntu, extension transfer/package inspection, and full-history secret scan all
completed successfully. The pull-request-only dependency-review job was skipped
as expected for the authorized direct push to `main`.

## Evidence boundary and decision review

This closes deterministic synthetic and automated browser coverage for
`Q3-001`; it does not claim that the importer handles every real-world resume,
that PDF visual reading order is semantically reconstructed, or that OCR is
available. It also does not substitute for the representative-user terminology
and action study still open under `Q3-002` or the assistive-technology/reference
device rows still open under `Q1-003` and Phase 6.

No Accepted product or architecture decision changed. The slice strengthens
the existing D-027 local import evidence without changing Mammoth, PDF.js,
Document IR, input limits, parser behavior, dependencies, schema, migrations,
network access, AI, or source policy. The Python file remains a test-only
deterministic fixture generator; it is not a product runtime or optional worker,
so D-028 is unchanged and no ADR or Changeset is required.
