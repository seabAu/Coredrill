# Phase 3 Answer Library verification

Date: 2026-09-27
Checklist item: `EVD-007`
Implementation commit: `f2903f36fe5ffc28ba38612d87e9d7d08f8c449d`
Hosted run: [Foundation CI 36322709650](https://github.com/seabAu/Coredrill/actions/runs/36322709650)
Status: complete

## Outcome

Coredrill now creates, edits, and retrieves reusable application answers through a local Answer Library. Each entry has an explicit `standard`, `sensitive`, or `restricted` classification; immutable creation provenance; optional source context; explicit last-used state; and append-only answer versions.

Manual entries have no source job. Entries copied from an application require an existing source job, and SQLite prevents deletion of that job while the provenance-bearing answer exists. Editing appends a version without rewriting the original source. Marking an answer used is a separate user action. Nothing automatically reuses an answer, drafts content, or treats generated content as evidence. The workflow remains local, accountless, offline-capable, and useful with AI disabled.

## Application and storage boundary

- `@coredrill/application` owns bounded Answer Library validation plus dedicated create, edit, mark-used, and list operations.
- New entries use the existing `document(kind = application_answer)` and immutable `document_version` model instead of introducing a parallel content system.
- `answer_library_entry` owns explicit sensitivity, immutable source kind/job/context, and nullable last-used state. An application source requires a canonical job; a manual source forbids one.
- `answer_library_version` maps each answer version to its immutable `document_version`. Edits append both records and advance the current-version pointer in one transaction.
- Repository and trigger guards reject malformed source combinations, provenance rewrites, version gaps, cross-document version links, stale edits, and mutation of immutable version rows.
- The source-job foreign key uses `ON DELETE RESTRICT`, so provenance cannot be silently severed. The durable answer/document lifecycle remains transactional SQLite truth.
- SQLite schema version advanced from 120 to 126. Portable export fixtures and the deterministic recovery archive advanced with it.

Reviewed migration checksums:

- `0121_answer_library_entry.sql`: `c03c04dd09995ad390faf1df3d2165f522a7e5334bd49fb937bf00969c233dab`
- `0122_answer_library_version.sql`: `7a72d95235de8fd27338f9e7f612d7a767070432df13707320728a560cafdcc4`
- `0123_answer_library_entry_insert_guard.sql`: `044163a66e0af34741108d0ce7c9a5768577660070d6088e786644ef2290fc4e`
- `0124_answer_library_document_update_guard.sql`: `ca313f2215376d98118b00ce2391dee25c062a451856c0f4f0fb0cacf0df65d8`
- `0125_answer_library_version_insert_guard.sql`: `978389958a6d3630aeb780bf4bae91d587e270437e45d7d7cfbbff792f09c1ae`
- `0126_answer_library_version_update_guard.sql`: `acc0afff6ae788d9cc1c881944312608f409b79ee5c691e7facacfe051f6e8f8`

## Use-case and repository proof

- Application tests prove valid manual creation, sensitivity and length validation, explicit mark-used behavior, and stable content-free failures.
- Repository tests create and edit answers, retain immutable provenance, append ordered versions, update current-version state, and roll back stale edits.
- Application-sourced answers require a live canonical job. The repository proves the source link and context survive edits and that job deletion is restricted while the answer retains that provenance.
- Storage guards and schema tests run through the same ordered migration manifest in Node SQLite, browser SQLite/OPFS, native rusqlite, and pinned Firefox jobs.

## Browser UI journey

The production Chromium application-shell journey:

1. Opens the Answer Library and creates a manual standard answer with source context.
2. Confirms the answer card exposes its classification, provenance, version, and unused state.
3. Enters explicit edit mode, changes the answer, promotes its classification to sensitive, and saves version 2.
4. Expands version history and confirms both immutable versions are available.
5. Uses the separate **Mark used now** action and confirms the last-used state updates.
6. Reloads from SQLite and proves the edited answer, sensitivity, provenance, history, and use state survive.
7. Runs automated accessibility analysis and asserts zero external requests.

## Local verification

- Focused application, repository, and UI verification passed 4 files and 10 tests during implementation.
- The focused real-browser Answer Library journey passed before the repository-wide gate.
- `pnpm verify` passed the complete repository gate: formatting, architecture/foundation records, typecheck, lint, 98 unit files and 789 tests, coverage, production builds, extension inspection, UI/accessibility, 71 application-shell journeys, performance, resilience, onboarding, document, browser storage/recovery, native SQLite/Rust, schema, license, secret, dependency-audit, and Changesets checks.
- Coverage passed at 82.36% statements, 75.42% branches, 83.90% functions, and 85.46% lines.
- Native verification passed 11 Rust tests with 1 intentionally ignored platform-specific test and 13 native TypeScript tests.
- Dependency policy remained clean: 520 JavaScript packages and 498 Rust crates passed license review; npm and Rust audits reported zero known vulnerabilities, with the same 7 reviewed Rust warnings allowed by policy.

## Recovery fixture

The representative synthetic Phase 1 recovery archive was regenerated against schema 126 and passed browser and native recovery verification:

- archive byte length: `1442887`
- archive SHA-256: `7700c428602d45277c09270357437bb7dcc51f99b458e787a8c71f741e77a369`
- database SHA-256: `85b0a786e57fc00123bcd0ac997dbca99a4d6c6dead001ec1712cbd43a8f98b5`
- content SHA-256: `0a71052be238347f3b8893f4fe4b14e26281a8939763efb464947ffa9ce9faff`

## Hosted clean-commit verification

Foundation CI run `36322709650` completed successfully for exact head SHA `f2903f36fe5ffc28ba38612d87e9d7d08f8c449d`. The required hosted jobs passed:

- build, static checks, tests, and policy (`108629500117`)
- native secure storage and packages on Ubuntu (`108629500190`), Windows (`108629499992`), and macOS (`108629500074`)
- browser storage on Chrome 151 (`108629500100`), Chrome 152 (`108629500132`), Firefox 153 (`108629500112`), and Firefox 154 (`108629500133`)
- extension transfer on Chromium and Firefox fallback (`108629500106`)
- full-history secret scan (`108629500053`)

The pull-request-only dependency review job (`108629500929`) was skipped as expected for a direct push to `main`.

## Decision review

No Accepted product or architecture decision changed. The slice reuses the accepted accountless/local-first baseline, TypeScript application/UI ownership, SQLite durable truth, canonical job provenance, immutable document versions, explicit sensitivity, and optimistic local edits. It adds no dependency, hosted service, account requirement, network access, scraper, AI call, or extension permission. No new ADR was required for `EVD-007`.
