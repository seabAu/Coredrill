# Phase 3 document-lineage and submitted-snapshot verification

Date: 2026-09-27
Checklist item: `DOC-001`
Implementation commit: `3a07cec20fe79d6fc3f7c46d459ce08def133ac9`
Firefox proof correction: `afe69d4163dd56c620af548276bf036671c79fce`
Hosted run: [Foundation CI 36354835973](https://github.com/seabAu/Coredrill/actions/runs/36354835973)
Status: complete

## Outcome

Coredrill now stores reusable base documents, templates, and job-specific derivatives as typed lineage over immutable document versions. Each application attempt can retain one exact submitted snapshot whose ordered items identify the precise resume, cover-letter, answer, follow-up, or other document version used. File items additionally retain the exact content-addressed attachment relation and purpose; plaintext items retain the exact immutable document version.

The capability remains accountless, local-first, offline-capable, and useful with AI disabled. This slice adds the durable model and shared repositories only. It does not add a document view, generation, provider call, network path, hosted service, extension permission, Mark Applied orchestration, auto-submit, auto-apply, or automated outreach.

## Durable lineage model

- Migrations 134–136 add `document_lineage` with explicit `base`, `template`, and `job_derivative` roles.
- A derivative references one typed base document, one job, and optionally one typed template document. It does not copy version content.
- Insert guards reject malformed or cross-role lineage, while update guards preserve the lineage identity once recorded.
- Existing immutable `document_version` rows remain the content history and continue to own their source/evidence relationships.

## Exact submitted-snapshot model

- Migrations 137–145 add `submitted_snapshot`, ordered `submitted_snapshot_item` rows, one-resume and one-cover-letter constraints, typed insert guards, immutable update guards, and post-snapshot application-field guards.
- A snapshot belongs to one application attempt and may be created only when the application is already applied with matching job, application channel, applied time, selected resume, and selected cover letter.
- Resume and cover-letter items must reference the exact selected document versions. Answer items must reference `application_answer` documents; other items are limited to `follow_up` or `other` documents.
- A file item has a composite foreign key to the exact `document_attachment(document_version_id, content_id, attachment_purpose)` relation. A plaintext item retains its exact document-version identity without inventing a file.
- Snapshot creation and every item insert run in one `DatabasePort` transaction. The contract deliberately submits an invalid selected-resume snapshot and proves that both the item and header roll back.
- After a snapshot exists, application job identity, applied time, application channel, and selected document identities cannot be silently changed. Snapshot and item identity fields are immutable; normal user-directed application or vault deletion remains available through the existing typed deletion boundary.

## Shared repository and adapter proof

- `DocumentLineageRepository` and `SubmittedSnapshotRepository` expose the typed shared boundary through `@coredrill/storage-core`.
- The shared manifest advances to `phase-1-repository-contracts-v8`, schema 145, with 24 ordered cases.
- The `snapshotSubmittedDocuments` case proves base/template/derivative round trips, invalid-snapshot atomic rollback, exact submitted file and answer versions, immutable lineage, frozen selected-resume identity, and retained attachment relations.
- The same manifest runs through Node SQLite, browser SQLite/OPFS, and native rusqlite. Hosted Firefox 153 and 154 also returned the expected version-8, 24-case result after the dedicated harness expectations were aligned.

## Export and recovery proof

- Portable human-readable export version 1 now includes `document_lineage`, `submitted_snapshot`, and `submitted_snapshot_item`.
- A schema-145 vault exports 54 datasets and 108 CSV/JSON data files. Schema-133 compatibility remains explicit at 51 datasets and excludes the three later tables rather than fabricating empty historical data.
- The clean-install recovery fixture was regenerated from schema 145. Its archive SHA-256 is `67206524b4481b6ea7a5b7e2fefc3930102595eba08ff822101ffbd1432f6f3a`; its content SHA-256 is `19b84fbd12edd22e890afe0c9dbac448e7ad7fc06f73cbb81667910461b3bf80`.
- Browser recovery proved the archive database matches the restored database, both attachments survive, and all evidence/document relationships reopen in a clean profile.

## Local verification

- `pnpm verify` passed formatting, boundaries, foundation records, all 33 typecheck tasks, all 22 package lint tasks plus tooling lint, 105 unit files and 844 tests, coverage, production builds, extension inspection, all browser journeys, native recovery, generated-contract checks, licenses, secret scanning, dependency audits, and Changesets.
- The application-shell suite passed 71 tests. Browser storage passed all 8 tests with schema 145, 54 datasets, and 108 files. The document suite passed all 9 editor/import/export tests.
- Native verification passed 13 TypeScript integration tests and 11 Rust tests, with one secure-store test intentionally delegated to its redacted platform harness.
- Focused storage verification passed the lineage/snapshot contract, portable export compatibility, browser SQLite/OPFS, native rusqlite, and clean recovery-fixture tests before the full run.
- npm audit reported no known vulnerabilities. Rust audit reported no blocking vulnerability and retained the same seven reviewed warning-only advisories allowed by policy.
- `git diff --check`, Prettier, ESLint, contract generation, license policy, secret scanning, and Changeset validation passed.

## Hosted clean-commit verification

Foundation CI run `36354835973` completed successfully for Firefox proof-correction commit `afe69d4163dd56c620af548276bf036671c79fce`, which contains implementation commit `3a07cec20fe79d6fc3f7c46d459ce08def133ac9`.

Required hosted jobs passed:

- build, static checks, tests, and policy (`108720629641`)
- native secure storage and packages on Ubuntu (`108720629606`), Windows (`108720629676`), and macOS (`108720630020`)
- browser storage on Chrome 151 (`108720629628`), Chrome 152 (`108720630099`), Firefox 153 (`108720629653`), and Firefox 154 (`108720630129`)
- extension transfer on Chromium and Firefox fallback (`108720629917`)
- full-history secret scan (`108720629422`)

The pull-request-only dependency review job (`108720630218`) was skipped as expected for a direct push to `main`. GitHub emitted only existing runner-transition and third-party action Node-version notices; no DOC-001 failure or security finding was reported.

## Decision review

No Accepted product or architecture decision changed. This slice implements D-042's immutable submitted-artifact identity while preserving SQLite as durable truth, TypeScript-owned shared repositories, Rust as a thin privileged boundary, content-addressed attachments, field-level provenance, explicit user control, and the AI-disabled baseline. Mark Applied orchestration remains deliberately scoped to `DOC-007`; document views and editor workflow remain `DOC-002` and `DOC-003`. No ADR was required for `DOC-001`.
