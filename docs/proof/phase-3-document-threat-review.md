# Phase 3 document parser, editor, and export threat review

Date: 2026-09-30
Checklist items: `Q3-004`, `SEC-005`
Implementation commits: `2104b47f8cd15ae1ea71f83a70a2b390dd288eab`, `b62aa1cdea53752408a10e8b9cb5dc0d90af65c6`
Hosted run: [Foundation CI 36730231318](https://github.com/seabAu/Coredrill/actions/runs/36730231318)
Status: complete

## Outcome and method

The repository-backed structured self-review traced untrusted local PDF, DOCX,
Markdown/text, editor paste, canonical document IR, generated DOCX/PDF/text,
retained export bytes, attachment metadata, and public filenames across their
trust boundaries. It reviewed the exact accepted dependency graph and the
existing SQL, portable-archive, attachment, and CSV/formula controls required
by `SEC-005`.

The review closed every demonstrated in-scope finding. It does not claim to be
a penetration test, malware scan of user-selected files, independent security
assessment, or representative-user/accessibility study. No real resume,
applicant data, credential, private employer material, or production document
was used.

## Assets, trust boundaries, and invariants

| Surface               | Untrusted input or boundary                                      | Protected asset/invariant                           | Enforced control                                                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local import picker   | User-selected filename, media type, and bytes                    | UI availability and bounded memory work             | Reject empty or over-10-MiB files before `File.arrayBuffer()`; recheck byte length and signature in the parser                                                                                                        |
| DOCX archive          | ZIP headers, paths, flags, counts, and compressed members        | Parser availability and path isolation              | Central/local-header agreement, safe unique relative names, reviewed flags/methods, required OOXML entries, 2,048-entry limit, 16-MiB member limit, and 32-MiB cumulative declared expansion limit                    |
| DOCX conversion       | Mammoth and malformed OOXML                                      | Main UI thread and network boundary                 | Dedicated terminating module worker, 30-second deadline, disabled external-file access, inert image replacement, no embedded style map, bounded output/messages, and prebundled self-hosted worker code               |
| PDF conversion        | PDF objects, pages, strings, and image-only files                | UI availability, provenance, and no implicit OCR    | Bundled PDF.js worker, 10-MiB/500-page limits, page/block/text budgets, text-only extraction, explicit scanned-PDF outcome, and no automatic external request                                                         |
| Text conversion       | UTF-8 bytes, NULs, lines, and paragraphs                         | Bounded canonical input                             | Fatal UTF-8 decoding, NUL rejection, total-character and block budgets before IR construction                                                                                                                         |
| Canonical IR          | Recursive objects, arrays, text, marks, and links                | Stable validation and renderer safety               | Preflight depth/node/character budgets before recursive Zod parsing, closed versioned schema, safe-link allowlist, and immutable normalized output                                                                    |
| Editor and paste      | Clipboard HTML/text and local edits                              | Canonical history, provenance, and user work        | Tiptap 3.30.5 restricted schema, no raw-HTML/Markdown/cloud/collaboration extension, unsafe-link removal, sanitized paste, recoverable SQLite draft, explicit immutable version creation, and optimistic transactions |
| Export                | Canonical IR, metadata, links, filenames, and retained PDF bytes | Truthful local artifacts and exact version identity | Reparse IR, DOM text APIs, safe links, controlled `docx` package, semantic local print HTML, sanitized collision-safe filename, metadata exclusion, and no submission mutation                                        |
| Retained export       | Browser-selected PDF bytes                                       | Attachment storage and content identity             | Reject empty or over-16-MiB files before reading, recheck application-layer size and PDF magic, content-address bytes, and treat retained content as opaque rather than executable                                    |
| Cross-cutting runtime | Bundled scripts/workers and rendered text                        | Local-first/no-egress baseline                      | React text rendering, no `eval` or raw-HTML rendering, Tauri CSP/self-hosted assets, zero-external-request browser assertions, secret scan, and exact-graph advisory/license gates                                    |

Successful resume imports remain pending proposals with exact SHA-256,
source pointer/excerpt, parser method/version, and unverified state. The
application boundary retains additional 2,000-block, 4,000-proposal, and
100-warning ceilings. User-confirmed values are never silently overwritten.

## Findings and remediation

| ID           | Severity before fix | Finding                                                                                                                                                                                         | Resolution and proof                                                                                                                                                                                                                                                                                                                                                                                          | Status                        |
| ------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `Q3-004-F01` | High                | DOCX bytes reached Mammoth without an independent OOXML member-count or expanded-byte budget, and conversion ran on the UI thread. This was the deferred `Q1-004-F03` finding.                  | [`docx-archive.ts`](../../packages/documents/src/docx-archive.ts) fails closed on unsafe/malformed archives before conversion; [`docx-import.worker.ts`](../../packages/documents/src/docx-import.worker.ts) isolates bounded conversion. Synthetic real and adversarial archives cover excessive expansion, encryption, path-shaped/duplicate names, flag/header disagreement, and missing required entries. | Resolved; closes `Q1-004-F03` |
| `Q3-004-F02` | Medium              | Resume and retained-PDF pickers read the complete browser `File` before rejecting an oversize input.                                                                                            | Both production pickers now reject by `File.size` before `arrayBuffer()`, while parser/application boundaries recheck actual bytes. Production E2E monkeypatches `File.prototype.arrayBuffer` and proves zero reads for 10-MiB-plus-one resume and 16-MiB-plus-one retained PDF inputs.                                                                                                                       | Resolved                      |
| `Q3-004-F03` | Medium              | Recursive Zod parsing could traverse an adversarially deep/broad IR before the later depth and aggregate-node checks.                                                                           | The public parser now runs iterative structural depth/node/content-array/character preflight before the recursive closed schema. Deep and broad adversarial fixtures fail with bounded validation issues.                                                                                                                                                                                                     | Resolved                      |
| `Q3-004-F04` | High                | The 2026-09-30 exact-graph audit exposed 16 new transitive development/build-tool advisories through `fast-uri` 3.1.6, `undici` 6.28.0, `ip-address` 10.5.0, and `brace-expansion` 2.1.4/5.0.9. | Exact version-scoped overrides select release-age-eligible `fast-uri` 3.1.8, `undici` 6.28.1, `ip-address` 10.7.1, and `brace-expansion` 2.1.7/5.0.12. The lock-bound all-severity audit reports zero known npm vulnerabilities; licenses remain accepted.                                                                                                                                                    | Resolved                      |
| `Q3-004-F05` | Low                 | Clean hosted Chrome 151/152 first discovered Mammoth only when the worker loaded, causing Vite dependency re-optimization and a page reload during the document test.                           | The web composition root explicitly prebundles the linked package's nested Mammoth dependency. A forced fresh optimization includes it, the 13-test local document suite passes, and the replacement hosted matrix supplies clean-install proof.                                                                                                                                                              | Resolved                      |

No Accepted product, data, permission, provider, deployment, or editor decision
changed. The Tiptap 3.30.5, Mammoth 1.12.1, PDF.js 6.2.108, and `docx`
9.7.1 selections remain in force, so no ADR was required.

## `SEC-005` cross-surface closure

The document-parser work completes the last deferred part of `SEC-005`; the
other named surfaces already have retained security proof:

- SQL values remain parameter-bound and the native authorizer denies attached
  databases, unsafe pragmas/functions, file-control SQL, and unknown actions;
  see the [Phase 1 threat review](phase-1-threat-review.md).
- Portable archive extraction validates checksums, bounded entry counts/sizes,
  exact safe relative paths, collisions, symlinks, and atomic replacement; see
  [portable archive restore verification](phase-1-portable-archive-restore-verification.md).
- Attachment names/types/sizes and managed content-addressed paths fail closed
  in shared/native contracts, while orphan cleanup and deletion are explicit;
  see the Phase 1 threat and archive proofs.
- Human-readable CSV exports prefix spreadsheet-formula triggers, quote fields,
  preserve UTF-8, and round-trip hostile cells; see [human-readable data export
  verification](phase-1-human-readable-data-export-verification.md).
- The expanded `test:security` command now runs 10 focused files and 51 tests,
  including DOCX archive, document IR, text import, application-retention,
  archive/attachment, SQL/search, diagnostics, and export-injection cases.

## Verification

The complete local `pnpm verify` passed against the frozen lockfile at the
primary implementation commit:

- formatting, 19 import-boundary policies, foundation records, typecheck,
  lint, production builds, generated schemas/reports, extension package
  inspection, license policy, secret scanning, and Changesets status;
- 119 unit-test files and 908 tests plus the aggregate coverage gate;
- 76 production app-shell, five UI-foundation, seven onboarding, three
  resilience, 13 document-browser, eight browser-storage, and performance
  journeys;
- 13 native TypeScript tests and 11 Rust tests, with platform secret-store and
  archive/backup harnesses; and
- 520 npm license records, 498 Rust crate license records, zero known npm or
  Rust vulnerabilities, and the same seven reviewed Rust maintenance/
  unsoundness warnings allowed by policy.

The focused security command passed all 51 tests. Production browser proof
retained zero external requests for document/resume import and export review,
rejected oversize files before browser reads, preserved hostile-paste
sanitation, and emitted the self-hosted DOCX and PDF worker assets. After the
clean-hosted optimizer finding, the exact follow-up passed forced fresh
dependency optimization, web lint, and all 13 document-browser tests; the
replacement hosted matrix below supplies the clean exact-final-commit gate.

[Foundation CI 36730231318](https://github.com/seabAu/Coredrill/actions/runs/36730231318)
passed exact implementation commit
`b62aa1cdea53752408a10e8b9cb5dc0d90af65c6`. The aggregate
build/static/test/policy job, Chrome 151/152, Firefox 153/154, Windows, macOS,
Ubuntu, extension transfer/package inspection, and full-history secret scan all
completed successfully. The pull-request-only dependency-review job was
skipped as expected for the authorized direct push to `main`.

## Residual risks and follow-up

| ID           | Residual risk                                                                                                                                                                                       | Disposition, owner, and trigger                                                                                                                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Q3-004-R01` | Browser deployment headers are not yet observable because no public hosted origin is selected.                                                                                                      | Retain `Q1-004-F02`; deployment/security owners close it through `DEP-002`/`SEC-002` when the public target exists. Tauri CSP and self-hosted build assets are already enforced.                                                                                         |
| `Q3-004-R02` | Browser workers have no portable hard heap quota. A malicious compressor that lies consistently in ZIP headers can still consume worker memory until failure or the 30-second termination deadline. | Accepted low residual for local user-selected input after archive budgets, worker isolation, bounded output, and termination. Security owner revisits before public beta, after a browser memory-quota API becomes usable, or if fuzzing/crash telemetry shows pressure. |
| `Q3-004-R03` | A retained PDF is size/signature checked and stored opaquely; Coredrill does not certify it as benign or fully conforming.                                                                          | Accepted low residual. Coredrill does not execute or render the retained bytes, and external PDF-viewer security remains outside the application boundary. Revisit if in-app rendering or automatic sharing is proposed.                                                 |
| `Q3-004-R04` | This was a structured maintainer review with synthetic adversarial tests, not independent penetration testing or a broad fuzz campaign.                                                             | `SEC-009` and Phase 6 security work retain ownership. Revisit before public beta and after any parser/editor/export boundary expansion.                                                                                                                                  |

Representative-user terminology/action validation (`Q3-002`), manual
assistive-technology/reference-device evidence (`Q1-003`/Phase 6), the full
canonical Phase 3 journey (`Q3-005`), and `GATE-3` remain separate work.
