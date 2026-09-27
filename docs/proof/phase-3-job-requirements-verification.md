# Phase 3 job-requirements verification

Date: 2026-09-27
Checklist item: `MAT-001`
Implementation commit: `1def8559a524f51fc58b80e872e4ebd11f83b414`
Hosted run: [Foundation CI 36328542049](https://github.com/seabAu/Coredrill/actions/runs/36328542049)
Status: complete

## Outcome

Coredrill now stores each job requirement as a durable, provenance-bound local record with one explicit category (`required`, `desired`, `responsibility`, `context`, or `constraint`), bounded extraction confidence, the exact source excerpt, and a source pointer and extraction method. A user can correct the category without replacing the extracted source fact: the source category and excerpt remain immutable, the corrected category becomes user-confirmed, and optimistic row-version checks prevent stale writes.

The Requirements tab presents extraction confidence as a parsing aid rather than employer verification, evidence coverage, an ATS score, or a hiring-probability prediction. It shows the source category and current category separately, keeps the exact excerpt visible, and exposes an explicit category correction control. The workflow remains accountless, offline-capable, useful with AI disabled, and free of new network access or extension permissions.

## Domain and application contract

- The shared domain accepts only the five approved requirement categories and validates bounded confidence, stable IDs, source excerpts, and timestamps.
- The application layer exposes typed record, list, and category-correction operations. Recording requires the extracted source category and current category to agree; user correction changes only the current category, sets durable confirmation, and requires the expected row version.
- Validation, not-found, and optimistic-concurrency outcomes remain typed at the application boundary.
- Exact source excerpts are not trimmed or rewritten while being validated, so the display and export surfaces retain the captured wording byte for byte.

## SQLite and provenance contract

- Migration `0127_job_requirement.sql` creates the durable `job_requirement` table at schema 127.
- Migration `0128_job_requirement_job_order.sql` adds the stable job/order lookup index at schema 128.
- Migration `0129_job_requirement_source_update_guard.sql` adds a database guard at schema 129 that rejects changes to the extracted text, source category, provenance record, source confidence, source order, and creation time.
- Repository creation joins provenance through listing snapshot and job source to prove the provenance belongs to the same job. A non-null exact excerpt is mandatory.
- Category correction uses compare-and-swap row versions, records user confirmation, and cannot silently replace any source fact.
- Repository tests cover valid creation and ordering, cross-job provenance rejection, missing excerpts, database-enforced source immutability, successful correction, and stale correction conflicts.

## UI and comprehension proof

- The job workspace includes a first-class Requirements tab with category, source category, exact source excerpt, confidence, extraction method, and source pointer.
- The interface explicitly says extraction confidence is not employer verification or hiring probability, and that evidence coverage is evaluated separately.
- The category selector sends an optimistic correction carrying the current row version and updates the proof host only after success.
- Server-rendered UI tests and the real-browser core-tab journey cover the requirements content, exact source excerpt, manual correction, responsive navigation, and automated accessibility checks.

## Export and recovery

The version-1 portable archive supports schema 129 while preserving reviewed historical projections for schemas 101, 111, 112, 115, and 126. Current schema 129 exports 48 datasets as 48 JSON and 48 CSV files, for 96 human-readable files. Schema 126 remains compatible at 47 datasets and 94 files.

The deterministic cross-adapter recovery fixture includes one provenance-bound, user-corrected job requirement in addition to the existing Phase 3 evidence inventory. Browser and native recovery proofs restore the requirement and its immutable source facts.

Fixture identity:

- schema version: `129`
- archive byte length: `1530234`
- archive SHA-256: `4d5fd6b6d783003d11136bad72ede750ace3212fa212c1d2b7e6c754aa8a9b3f`
- database SHA-256: `83892ee22e693ddc03a49c7cad561f0fd944d932578311439ab5af2cf48afc91`
- content SHA-256: `ff762ac8d12b6d1e05f9dee9a3aabd38b172ae84ed66982ecb5694a144660c59`
- human-readable data files: `96`
- managed attachments: `2`
- restored job requirements: `1`

## Local verification

- Focused domain, application, repository, UI, and portable-export verification passed 5 files and 32 tests.
- Repository-wide typecheck passed all 33 tasks.
- The application-shell browser suite passed 71 tests, including the Requirements correction and exact-excerpt journey.
- Browser storage passed 8 tests at schema 129 with 48 datasets and 96 readable files.
- Native verification passed 13 TypeScript integration tests plus 11 Rust tests, with the one platform-secure-store test intentionally delegated to its redacted proof harness.
- `pnpm verify` passed formatting, boundaries, foundation records, typecheck, lint, 100 unit files and 800 tests, coverage, production builds, extension inspection, browser journeys, native recovery, contract schemas, licenses, secret scanning, dependency audits, and Changesets.
- Dependency policy remained clean: 520 JavaScript packages and 498 Rust crates passed license review; npm and Rust audits reported zero known vulnerabilities, with the same 7 reviewed Rust warnings allowed by policy.
- The local Windows host has Firefox but no configured GeckoDriver, so the branded-Firefox command correctly reported that environment prerequisite. The exact current/previous Firefox lanes are mandatory in hosted CI and provide the release proof below.

## Hosted clean-commit verification

Foundation CI run `36328542049` completed successfully for exact implementation commit `1def8559a524f51fc58b80e872e4ebd11f83b414`.

Required hosted jobs passed:

- build, static checks, tests, and policy (`108645899734`)
- native secure storage and packages on Ubuntu (`108645899717`), Windows (`108645899695`), and macOS (`108645899722`)
- browser storage on Chrome 151 (`108645899795`), Chrome 152 (`108645899852`), Firefox 153 (`108645899754`), and Firefox 154 (`108645899826`)
- extension transfer on Chromium and Firefox fallback (`108645899615`)
- full-history secret scan (`108645899782`)

The pull-request-only dependency review job (`108645900345`) was skipped as expected for a direct push to `main`.

## Decision review

No Accepted product or architecture decision changed. This slice implements D-030 field-level provenance and prepares the per-requirement surfaces required by D-013 without calculating evidence coverage, literal-term coverage, parseability, an ATS score, or hiring probability. The proposed category terminology in the older data-model sketch was aligned to the already accepted product-interface vocabulary. No new dependency, hosted service, account requirement, AI call, scraper, extension permission, or ADR was required for `MAT-001`.
