# Phase 3 resume import proposal verification

Date: 2026-09-27
Checklist item: `EVD-004`
Implementation commit: `74edd298cd8b11e2e60097f1cbd1774c5c74da4e`
Hosted run: [Foundation CI 36313569310](https://github.com/seabAu/Coredrill/actions/runs/36313569310)
Status: complete

## Outcome

Coredrill now imports local PDF, DOCX, Markdown, and text resumes into a durable field-level proposal queue. Every extracted value remains visibly pending and not verified, retains its source file hash, page/paragraph/line pointer, source excerpt, and extraction confidence, and survives reload from SQLite.

This slice deliberately does not accept or reject proposals, resolve duplicate role/date/skill conflicts, write imported values into Career Profile evidence, invoke AI, or perform network I/O. Those review transitions remain assigned to `EVD-005`.

## Application and storage boundary

- `@coredrill/application` owns the adapter-neutral resume-import command, pending-queue query, bounded deterministic proposal extractor, stable errors, and reviewed target/field contracts.
- The boundary accepts only the existing reviewed `docx`, `pdf`, and normalized `text` formats, validates source metadata and hashes, caps blocks, text, warnings, and proposal counts, and forces every result to `evidenceStatus: "proposal"` and `reviewState: "pending"`.
- The web composition dynamically loads the existing local document adapter only after an explicit file choice. Signature/limit validation, normalized blocks, SHA-256 hashing, and source mappings stay inside the reviewed document boundary.
- Migrations `0113`–`0115` add `import_run`, `career_import_proposal`, and the deterministic pending-queue index. Import metadata and all proposal rows commit atomically; an invalid proposal rolls back the whole import.
- Repository tests prove that import writes leave `candidate_profile`, `experience`, `education`, `project`, `skill`, `accomplishment`, `certification`, `publication`, and `volunteer_experience` unchanged.
- SQLite schema version advanced from 112 to 115. Portable export retains compatibility with source versions 101, 111, and 112.

Reviewed migration checksums:

- `0113_resume_import_run.sql`: `b6830650eb9a7ffae09f26895561c7b565e116299f1186a60e4983fb3371921d`
- `0114_career_import_proposal.sql`: `1c81bea79774ce12b66e210fadddd8136b94f1f06f4f0ca1865d8d46c835760e`
- `0115_career_import_proposal_queue_index.sql`: `46d344ad15971c9f0db630cc31a086011f133fd3013d75788932c642d5aec928`

## Golden and end-to-end proof

- Application golden fixtures cover normalized DOCX, PDF, and text inputs plus unclassified content, source pointers/excerpts, confidence, proposal state, validation failures, and stable port errors.
- Storage tests cover provenance-preserving reload, zero-proposal scanned-file warnings, zero Career Profile writes, and atomic rollback.
- The real browser journey imports checked-in synthetic DOCX, two-page PDF, and Markdown files through the actual document adapters and queues 7, 5, and 2 proposals respectively.
- The journey observes all 14 proposals after a full reload while the Career Profile entry count remains zero. It asserts the exact source excerpts and page/paragraph/line pointers, no user-confirmed labeling, and no external network requests.
- Automated accessibility analysis, an ARIA snapshot, wide-screen proof, and a 320-pixel reflow proof all pass.
- A scanned PDF can remain as a zero-proposal queue item with the existing actionable local/explicit OCR warning; the source file is not modified.

## Local verification

- Focused application, storage, and UI verification passed 3 files and 13 tests; the expanded schema-focused suite passed 8 files and 33 tests.
- The focused real-file Chromium resume-import journey passed before the repository-wide gate.
- `pnpm verify` passed the complete repository gate: formatting, boundaries, foundation records, 93 unit-test files with 769 passing tests, build, 68 application-shell journeys, browser/storage/native suites, policy checks, license inventories, secret checks, dependency audits, and Changesets status.
- Unit coverage passed at 83.30% statements, 77.00% branches, 84.86% functions, and 86.39% lines.
- Native verification passed 11 Rust tests with 1 intentionally ignored platform-specific test and 13 native TypeScript tests.
- The exact extension-transfer command also passed locally with 7 of 7 Chromium/Firefox tests after the first hosted attempt encountered a runner socket failure.
- Dependency policy remained clean: 520 JavaScript packages and 498 Rust crates passed license review; npm and Rust audits reported zero known vulnerabilities, with the same 7 reviewed Rust advisories/warnings allowed by policy.

## Recovery fixture

The representative Phase 1 recovery archive was regenerated against schema 115 and passed browser and native recovery verification:

- archive byte length: `1333940`
- archive SHA-256: `bb1aaae07143878484a5ff02b7609f93dbb009b3719eb9812937fe6854409d18`
- database SHA-256: `d0fe1206bb5782335775ae181871a2a87f4fd1f7c1719559e2507ea1b0e8c0a6`
- content SHA-256: `c4fe48448ee8587ddc9cf5b2d007e690338593535f1fac08caf58b0c461139f9`

## Hosted clean-commit verification

Foundation CI run `36313569310`, attempt 2, completed successfully for exact head SHA `74edd298cd8b11e2e60097f1cbd1774c5c74da4e`:

- Full-history secret scan: job `108606228500`, passed.
- Build, static checks, tests, and policy: job `108606249496`, passed.
- Chrome `151`: job `108606228148`, passed.
- Chrome `152`: job `108606228635`, passed.
- Firefox `153`: job `108606243339`, passed.
- Firefox `154`: job `108606251820`, passed.
- Windows native storage, installed startup, and package: job `108606250797`, passed.
- macOS native secure storage and package: job `108606249397`, passed.
- Ubuntu native secure storage and package: job `108606252871`, passed.
- Extension transfer fallback: job `108606227530`, passed.

The extension-transfer job's first attempt, job `108603951173`, encountered a transient `route.fetch: socket hang up` while Vite served migration `0049`. Six of seven tests had passed, including the Firefox fallback at schema 115. The exact suite passed locally 7 of 7, and rerunning only that failed hosted job without a code change passed and completed the run successfully.

## Decision review

No Accepted product or architecture decision changed. The slice reuses the accepted TypeScript document/application/UI ownership boundary, SQLite durable truth, local-first and offline-capable baseline, provenance requirements, and prohibition on silently treating generated or extracted content as verified evidence. No dependency was added and no new ADR was required for `EVD-004`.
