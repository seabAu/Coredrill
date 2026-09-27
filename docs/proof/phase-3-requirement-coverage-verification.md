# Phase 3 requirement coverage verification

Date: 2026-09-27
Checklist item: `MAT-004`
Implementation commit: `a686e5687f1be8fe4ca8f7070acdc7953a905ebc`
Firefox proof correction: `e206454af8a60d2294c1261160503713049769fa`
Hosted run: [Foundation CI 36341158160](https://github.com/seabAu/Coredrill/actions/runs/36341158160)
Status: complete

## Outcome

Coredrill now gives every job requirement an explicit, explained evidence-coverage decision: Strength, Partial, Gap, Unknown, or Not Applicable. Automatic decisions are deterministic and conservative. A context requirement is Not Applicable; a requirement with no selected evidence is Unknown; reliable selected evidence with a structured relation is Strength; and other selected evidence is Partial. Gap is never inferred automatically.

Users can deliberately override the automatic result. User-confirmed decisions remain durable when the requirement, evidence selection, evidence content, or verification state later changes; the interface marks the decision stale instead of silently replacing the user's judgment. Resetting returns the requirement to the current deterministic decision. The workflow remains accountless, local-first, offline-capable, useful with AI disabled, and free of any aggregate ATS or hiring-probability score.

## Decision and explanation contract

- The frozen rule version is `requirement-coverage-v1`.
- Automatic decisions distinguish no evidence from negative evidence: no selection produces Unknown, never Gap.
- Strength requires reliable evidence (`user_confirmed` or `source_backed`) plus a structured match reason beyond a lexical-only match.
- Selected evidence that does not satisfy the Strength rule produces Partial.
- Context requirements produce Not Applicable.
- Gap and every explicit override are user-reviewed decisions. Strength and Partial overrides require at least one selected evidence item.
- Every result includes a human-readable explanation, source (`automatic` or `user-confirmed`), rule version, and stale state.
- The stored user-decision basis includes the requirement row version and canonical selected-evidence identity, update time, and verification state. Later edits preserve the decision and surface staleness.

## Storage and recovery contract

- Migration `0133_job_requirement_coverage_decision.sql` adds the durable optimistic-locking record without changing confirmed requirement or evidence values.
- Repository-contract manifest version `5` contains 21 cases, including automatic Strength, explicit Gap, stale preservation after selection removal, reset to Unknown, and cross-adapter parity.
- Portable export schema `133` contains 51 datasets and 102 readable CSV/JSON files. Schema `132` remains accepted as a historical import and correctly omits the new dataset.
- The clean recovery fixture preserves one requirement-coverage decision and restores it with the associated evidence relationships and attachments.
- Recovery proof produced archive SHA-256 `3448d4078a0baf19fe04dd39a37cc750e185f953bd09d11554e292050224e289` and content SHA-256 `c532e9b9a7784e8dad1292c4aac7a72e8478dd6255d0791917eb608e8b396044`.

## UI and browser proof

- The Requirements workspace presents the decision, explanation, automatic/user-confirmed source, and stale warning next to the selected evidence.
- All five states are available without presenting an aggregate score. Strength and Partial cannot be selected when no evidence is selected.
- The application-shell journey proves automatic Unknown and Strength, every explicit state, reset to automatic behavior, stale Gap preservation after evidence removal, and final reset to Unknown.
- Accepting a parsed requirement creates its empty coverage-review row atomically, so a newly accepted requirement immediately receives an explained Unknown decision.
- The browser journey passed with zero external requests and the complete application-shell accessibility sweep passed.

## Local verification

- Focused application, repository, export, and UI verification passed 4 files and 32 tests after the final freshness-basis adjustment.
- Repository-wide typecheck passed all 33 tasks and lint passed all 22 package tasks plus repository tooling.
- The application-shell browser suite passed 71 tests, including the complete requirement-coverage journey.
- Browser storage passed 8 tests at schema 133 with the version-5, 21-case repository manifest and the 51-dataset/102-file export.
- Native verification passed 13 TypeScript integration tests plus 11 Rust tests, with the one platform-secure-store test intentionally delegated to its redacted proof harness.
- `pnpm verify` passed formatting, boundaries, foundation records, typecheck, lint, unit and coverage suites, production builds, extension inspection, all browser journeys, native recovery, contract schemas, licenses, secret scanning, dependency audits, and Changesets.
- Dependency policy remained clean: npm and Rust audits reported zero known vulnerabilities, with the same 7 reviewed Rust warnings allowed by policy.

## Hosted clean-commit verification

Foundation CI run `36341158160` completed successfully for exact Firefox proof-correction commit `e206454af8a60d2294c1261160503713049769fa`, which contains implementation commit `a686e5687f1be8fe4ca8f7070acdc7953a905ebc`.

Required hosted jobs passed:

- build, static checks, tests, and policy (`108681514631`)
- native secure storage and packages on Ubuntu (`108681514610`), Windows (`108681514906`), and macOS (`108681514774`)
- browser storage on Chrome 151 (`108681514677`), Chrome 152 (`108681514674`), Firefox 153 (`108681514714`), and Firefox 154 (`108681514668`)
- extension transfer on Chromium and Firefox fallback (`108681514644`)
- full-history secret scan (`108681514612`)

The pull-request-only dependency review job (`108681515228`) was skipped as expected for a direct push to `main`.

## Decision review

No Accepted product or architecture decision changed. This slice implements D-013's per-requirement evidence coverage and explainability rule, D-030's durable provenance, and D-031's deterministic-before-manual ordering. It adds no AI inference, opaque score, hosted service, account requirement, scraper, extension permission, or dependency. No ADR was required for `MAT-004`.
