# Phase 3 resume import conflict-resolution verification

Date: 2026-09-27
Checklist item: `EVD-005`
Implementation commit: `b1c007f5e33cca30a3289690b8f6ca48ed62c2e9`
Hosted run: [Foundation CI 36316559758](https://github.com/seabAu/Coredrill/actions/runs/36316559758)
Status: complete

## Outcome

Coredrill now groups pending resume fields into reviewable employment and skill proposals, detects duplicate roles, overlapping or ambiguous dates, and duplicate or aliased skills, and retains the exact source excerpts, pointers, and extraction confidence during review. Every group requires an explicit accept, merge, or reject decision.

Employment acceptance requires either complete exact dates or a deliberate “keep dates unknown” choice. Accepted rows remain labeled imported and not user-confirmed. Merge validates a compatible saved candidate and records the evidence relationship without updating that candidate. Reject creates no Career Profile evidence. Every decision and its exact proposal membership survives reload in local SQLite.

## Application and storage boundary

- `@coredrill/application` owns the pure conflict analyzer and the validated resolution command. Duplicate employment uses normalized organization/title matching; date overlap is surfaced separately; skill matching uses a bounded reviewed alias vocabulary rather than AI inference.
- The command validates the import/group identity, decision, target identity, and employment date policy before calling the port. Invalid or stale decisions fail closed with stable content-free errors.
- Migrations `0116`–`0119` add optional skill source-document provenance, explicit skill verification state, the append-only `career_import_resolution` ledger, and immutable proposal membership in `career_import_resolution_proposal`.
- The repository resolves one complete proposal group in one transaction. Acceptance inserts only imported evidence, merge validates but never updates the candidate row, rejection inserts no evidence, and any failure rolls back the resolution and keeps every proposal pending.
- Pending queries exclude only proposals linked to a committed resolution. Immutable proposal rows continue to retain the original source excerpt, pointer, value, confidence, and file/import mapping.
- SQLite schema version advanced from 115 to 119. Portable export retains the previously reviewed source versions and adds schema 119.

Reviewed migration checksums:

- `0116_skill_import_evidence.sql`: `baa44a3e66c563a20e6e5456224d6d93b442a3ad15d8aa545e8821fe1f040cdd`
- `0117_skill_import_verification.sql`: `0df46ee0503daec7a938cb02141ff8aed6656d1e4b78cca846d6b86900a36627`
- `0118_career_import_resolution.sql`: `e0d289d374483459480761c3d572401ca0614070894236e0dac6f70e98caf004`
- `0119_career_import_resolution_proposal.sql`: `06c9195abe79872ed7bf82054662287bb2894f76539a69937e676d2b95d47e5d`

## Conflict and transaction proof

- Application tests expose duplicate roles, ambiguous dates, overlapping organization/date ranges, normalized skill aliases, and retained source excerpts. They prove employment acceptance cannot proceed without an explicit date decision and that reject/merge inputs contain no replacement values.
- Storage tests prove skill acceptance creates `verification_state = imported`, reject creates no Career Profile row, merge preserves an exact user-confirmed employment row, and all three decisions retain their source excerpt through the append-only ledger.
- An invalid skill merge rolls back completely: no resolution row is written and the complete proposal group remains pending.
- The UI groups fields, names every conflict, keeps excerpts/pointers expandable, shows extraction confidence, requires the employment date decision, and exposes explicit Accept as imported, Merge with candidate, and Reject proposal actions.

## Real-file browser journey

The Chromium journey uses the checked-in synthetic DOCX through the production document/import boundary:

1. Save a user-confirmed `Product Engineer` role at `Coredrill Labs` with exact dates.
2. Import the DOCX and observe the grouped duplicate-role and ambiguous-date conflicts with the original source excerpt.
3. Choose the named merge candidate.
4. Verify the proposal group leaves the pending queue and the status says the existing entry was not overwritten.
5. Reload from SQLite and prove the original dates and user-confirmed badge remain unchanged while the resolved duplicate does not return.
6. Run automated accessibility analysis and assert zero external requests.

## Local verification

- The focused application, Career Profile, storage, and UI suite passed 4 files and 20 tests before the reject-path expansion.
- The complete unit suite passed 94 files and 776 tests.
- The focused real-DOCX conflict journey passed in Chromium before the repository-wide gate.
- `pnpm verify` passed the complete repository gate: formatting, boundaries, foundation records, typecheck, lint, unit and coverage gates, production builds, extension package inspection, 5 UI-foundation journeys, 69 application-shell journeys, performance/resilience/onboarding/document/storage suites, native SQLite and Rust tests, schema checks, license inventories, secret scans, dependency audits, and Changesets status.
- Native verification passed 11 Rust tests with 1 intentionally ignored platform-specific test and 13 native TypeScript tests.
- Dependency policy remained clean: 520 JavaScript packages and 498 Rust crates passed license review; npm and Rust audits reported zero known vulnerabilities, with the same 7 reviewed Rust advisories/warnings allowed by policy.

## Recovery fixture

The representative synthetic Phase 1 recovery archive was regenerated against schema 119 and passed browser and native recovery verification:

- archive byte length: `1392167`
- archive SHA-256: `00712b8119271401170258a0dec30590285e8ecd6d710a223ee0610fb6aba883`
- database SHA-256: `72bddc310830d358b805a36793c0e2b6937c4253bb50c450743b1f30629fc592`
- content SHA-256: `66b5a5c5ab9fab19a56c54d230f5d2a46207e0a90fd23fa30ce13e739dc3c9e6`

## Hosted clean-commit verification

Foundation CI run `36316559758` completed successfully for exact head SHA `b1c007f5e33cca30a3289690b8f6ca48ed62c2e9`. The required hosted jobs passed:

- build, static checks, tests, and policy (`108612248944`)
- native secure storage and packages on Ubuntu (`108612248865`), Windows (`108612248972`), and macOS (`108612249006`)
- browser storage on Chrome 151 (`108612248957`), Chrome 152 (`108612248946`), Firefox 153 (`108612248997`), and Firefox 154 (`108612249007`)
- extension transfer on Chromium and Firefox fallback (`108612249027`)
- full-history secret scan (`108612248973`)

The pull-request-only dependency review job (`108612249865`) was skipped as expected for a direct push to `main`.

## Decision review

No Accepted product or architecture decision changed. The slice reuses the accepted accountless/local-first baseline, TypeScript application/UI ownership, SQLite durable truth, explicit proposal review, provenance retention, and prohibition on silently overwriting user-confirmed evidence. It adds no dependency, hosted service, account requirement, network access, scraper, AI call, or extension permission. No new ADR was required for `EVD-005`.
