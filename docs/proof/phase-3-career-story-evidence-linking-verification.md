# Phase 3 career story and evidence-linking verification

Date: 2026-09-27
Checklist item: `EVD-006`
Implementation commit: `64e31e3f851fb9607f5e58d303bf679e8add6338`
Parity-fix commit: `9ce91c39d63c2bc2fadc4858ba42baa5a769556e`
Hosted run: [Foundation CI 36319829485](https://github.com/seabAu/Coredrill/actions/runs/36319829485)
Status: complete

## Outcome

Coredrill now creates and edits Career Profile stories in Situation/Action/Result form. A story retains ordinary tags, optional reviewed privacy tags, source-document and verification state, and typed links to existing employment, education, project, skill, accomplishment, certification, publication, or volunteer evidence.

Links reference canonical Career Profile records instead of copying their values. Creating a story and all of its selected links is one transaction. Editing a story uses its row version, replaces the complete selected link set atomically, and cannot silently rewrite source-document or verification fields. The workflow remains local, accountless, offline-capable, and useful with AI disabled.

## Application and storage boundary

- `@coredrill/application` owns bounded story validation and dedicated create, update, and list operations. Callers cannot choose source or verification state for a new story; local creation is source-free and user-confirmed.
- The update port contains story content, typed evidence references, expected row version, and audit time only. It does not expose source-document or verification fields.
- Migration `0120_anecdote_evidence_link.sql` adds the strict `anecdote_evidence_link` table. Each row carries a typed evidence identity plus exactly one matching concrete foreign key to canonical Career Profile evidence.
- The composite primary key rejects duplicate typed links. Concrete foreign keys reject missing targets, and cascading deletion removes relationships without duplicating or rewriting evidence.
- The repository validates all target records as active before link insertion. A missing target rolls back the story create or edit, including the story row and any earlier links in the same transaction.
- Optimistic story edits require the expected row version, update bounded story content and privacy state, replace links, and increment the row version in one transaction.
- The independent shared Career Profile repository contract advanced to `phase-3-career-repositories-v3`, schema version 3, with four ordered cases. Node SQLite, browser SQLite/OPFS, native rusqlite, and pinned Firefox execute the same manifest.
- SQLite schema version advanced from 119 to 120. Portable export fixtures and the deterministic recovery archive advanced with it.

Reviewed migration checksum:

- `0120_anecdote_evidence_link.sql`: `888ea7f5b55eba890ae75503702e4334213a92489bb00f32b4ddb81b2b76c5a0`

## Use-case and repository proof

- Application tests prove local creation is source-free and user-confirmed, update results preserve source and verification returned by the port, malformed fields and duplicate/invalid links fail before persistence, and storage conflicts become stable content-free failures.
- Repository tests create a story linked to canonical employment and skill rows, replace its link set during edit, retain story provenance and verification, and increment the row version.
- A missing evidence target rolls back story creation completely. Duplicate link input is rejected without leaving a partial story row.
- The shared adapter contract creates and edits one story with canonical evidence links, proves link replacement and preserved source/verification/privacy state, and proves a missing target rolls back the complete edit.

## Browser UI journey

The production Chromium application-shell journey:

1. Creates canonical Work and Skill evidence through the manual Career Profile boundary.
2. Opens Stories and saves a Situation/Action/Result story linked to both existing records with a privacy tag.
3. Confirms the card exposes privacy, verification, and link count.
4. Enters explicit edit mode, changes the Result, removes the Skill link, and saves with the expected row version.
5. Reads the production application API to prove row version 2, `sourceDocumentId = null`, `verificationState = user_confirmed`, the retained privacy tag, and exactly the remaining canonical Work link.
6. Reloads from SQLite and proves the edited content and relationship survive.
7. Runs automated accessibility analysis and asserts zero external requests.

## Local verification

- Focused application, repository, shared-contract, and UI verification passed 4 files and 12 tests during implementation.
- The focused real-browser STAR journey and the browser SQLite Career Profile contract each passed before the repository-wide gate.
- `pnpm verify` passed the complete repository gate: formatting, architecture/foundation records, typecheck, lint, 96 unit files and 783 tests, coverage, production builds, extension inspection, UI/accessibility, 70 application-shell journeys, performance, resilience, onboarding, document, browser storage/recovery, native SQLite/Rust, schema, license, secret, dependency-audit, and Changesets checks.
- Coverage passed at 82.74% statements, 75.87% branches, 84.30% functions, and 85.81% lines.
- Native verification passed 11 Rust tests with 1 intentionally ignored platform-specific test and 13 native TypeScript tests.
- Dependency policy remained clean: 520 JavaScript packages and 498 Rust crates passed license review; npm and Rust audits reported zero known vulnerabilities, with the same 7 reviewed Rust warnings allowed by policy.

## Recovery fixture

The representative synthetic Phase 1 recovery archive was regenerated against schema 120 and passed browser and native recovery verification:

- archive byte length: `1408768`
- archive SHA-256: `9bbd228ff520670f018cec6b6912341b64a28ffda0afa84908912c678b9ef090`
- database SHA-256: `43ce8a2ff9553122749a92edae2c09222be5656066f2e59f39749274ea0c9c2a`
- content SHA-256: `cb48dc242ffa83164cde2ab92cd71dac7d228116097b6a400cf9785d5f62b202`

## Hosted clean-commit verification

The first hosted run for implementation commit `64e31e3f851fb9607f5e58d303bf679e8add6338` correctly exposed that the pinned Firefox proof script still expected Career Profile contract v2 with three cases. The contract implementation itself passed in Chromium and native adapters. Commit `9ce91c39d63c2bc2fadc4858ba42baa5a769556e` advanced the independent Firefox expectation to v3 with four cases.

Foundation CI run `36319829485` then completed successfully for exact head SHA `9ce91c39d63c2bc2fadc4858ba42baa5a769556e`. The required hosted jobs passed:

- build, static checks, tests, and policy (`108621553636`)
- native secure storage and packages on Ubuntu (`108621553643`), Windows (`108621553609`), and macOS (`108621553590`)
- browser storage on Chrome 151 (`108621553673`), Chrome 152 (`108621553606`), Firefox 153 (`108621553615`), and Firefox 154 (`108621553646`)
- extension transfer on Chromium and Firefox fallback (`108621553469`)
- full-history secret scan (`108621553739`)

The pull-request-only dependency review job (`108621554269`) was skipped as expected for a direct push to `main`.

## Decision review

No Accepted product or architecture decision changed. The slice reuses the accepted accountless/local-first baseline, TypeScript application/UI ownership, SQLite durable truth, canonical Career Profile evidence, explicit provenance and verification semantics, privacy tagging, and optimistic local edits. It adds no dependency, hosted service, account requirement, network access, scraper, AI call, or extension permission. No new ADR was required for `EVD-006`.
