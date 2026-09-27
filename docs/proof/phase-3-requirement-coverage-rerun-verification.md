# Phase 3 requirement-coverage rerun verification

Date: 2026-09-27
Checklist item: `MAT-007`
Implementation commit: `bdbdcfe431c9770e659d64abcceff6feb5b816d4`
Firefox proof correction: `3f89a908837fc833fbe90ca2dde9873ad26060d0`
Hosted run: [Foundation CI 36351572147](https://github.com/seabAu/Coredrill/actions/runs/36351572147)
Status: complete

## Outcome

Coredrill can now re-run requirement coverage after selected evidence or its source document changes and show a truthful field-level before/after comparison. The comparison retains the prior immutable snapshot, names changed coverage, evidence, and source-document provenance fields, and explicitly proves that a user-reviewed decision and its optimistic row version were not overwritten.

The capability remains accountless, local-first, offline-capable, and useful with AI disabled. A rerun is a read-only query: it performs no coverage, evidence, document, or provenance write and adds no schema, migration, dependency, network path, extension permission, provider call, account, hosted service, or automated application behavior.

## Versioned rerun contract

- `requirement-coverage-rerun-v1` validates and captures immutable snapshots of the current coverage result and user-selected evidence.
- Each selected item retains its evidence identity, kind, verification state, update time, and the latest linked source-document identity, version identity, version number, and content hash when one exists.
- The selected-evidence basis includes those source-document facts. Editing evidence or creating a new immutable document version therefore marks an existing reviewed decision stale without replacing its state, explanation, row version, or review history.
- The rerun query obtains a fresh bounded repository result, captures the new snapshot, and computes typed field changes across coverage, evidence, and source-document provenance.
- Every result reports `mutationPerformed: false` and whether the prior user decision was preserved. Runtime validation rejects malformed or unbounded snapshots rather than comparing ambiguous data.

## Storage and cross-adapter proof

- The requirement-evidence repository resolves source-document provenance through a hardcoded evidence-kind/table map and parameter-bound evidence IDs, then reads the latest immutable `document_version`. No caller-controlled table identifier enters SQL.
- The shared repository manifest advances to `phase-1-repository-contracts-v7` with 23 ordered cases.
- Its new case stores a user-reviewed Gap, snapshots linked employment evidence and resume version 1, edits the evidence and creates resume version 2, re-runs retrieval, and proves the Gap and row version remain unchanged while the decision becomes stale.
- The same case proves field-level evidence and source-document-version changes, retained provenance, and zero coverage mutation in Node SQLite, browser SQLite/OPFS, and native rusqlite.

## UI and browser proof

- The Requirements workspace exposes an explicit **Re-run and compare** action without changing the existing coverage decision controls.
- A named **Coverage changes since the last run** region reports the changed-field count and accessible Before/After values, including evidence and source-document provenance changes.
- The region states that the reviewed decision was preserved and that comparison does not edit evidence, documents, or provenance.
- Component tests cover rendering and bounded-model validation. The browser journey covers the rerun, narrow reflow, and zero external requests.
- The emitted browser proof was `MAT007_E2E_PROOF {"fieldDiffVisible":true,"userDecisionPreserved":true,"provenanceCompared":true,"coverageWrites":0,"narrowReflow":true,"externalRequests":0}`.

## Local verification

- `pnpm verify` passed formatting, boundaries, foundation records, all 33 typecheck tasks, all 22 package lint tasks plus tooling lint, 105 unit files and 844 tests, coverage, production builds, extension inspection, all browser journeys, native recovery, generated-contract checks, licenses, secret scanning, dependency audits, and Changesets.
- Coverage remained above policy floors at 82.48% statements, 75.43% branches, 84.30% functions, and 85.50% lines.
- The application-shell suite passed 71 tests. Browser storage passed 8 tests with the version-7, 23-case repository manifest. Native verification passed 13 TypeScript integration tests and 11 Rust tests, with one secure-store test intentionally delegated to its redacted platform harness.
- Focused application, storage, UI, and browser tests passed before the full run. Exact Firefox 153/154 proof subsequently passed in hosted CI after its final proof-count assertion was advanced from 22 to 23; both browsers had already returned the correct v7/23-case result.
- npm audit reported no known vulnerabilities. Rust audit reported no blocking vulnerability and retained the same seven reviewed warning-only advisories allowed by policy.
- `git diff --check`, Prettier, ESLint, and Changeset validation passed before the commits.

## Hosted clean-commit verification

Foundation CI run `36351572147` completed successfully for exact Firefox proof-correction commit `3f89a908837fc833fbe90ca2dde9873ad26060d0`, which contains implementation commit `bdbdcfe431c9770e659d64abcceff6feb5b816d4`.

Required hosted jobs passed:

- build, static checks, tests, and policy (`108711291543`)
- native secure storage and packages on Ubuntu (`108711291811`), Windows (`108711291729`), and macOS (`108711291690`)
- browser storage on Chrome 151 (`108711291860`), Chrome 152 (`108711291740`), Firefox 153 (`108711291883`), and Firefox 154 (`108711291822`)
- extension transfer on Chromium and Firefox fallback (`108711291680`)
- full-history secret scan (`108711291773`)

The pull-request-only dependency review job (`108711292326`) was skipped as expected for a direct push to `main`. GitHub emitted only existing runner-transition and third-party action Node-version notices; no MAT-007 failure or security finding was reported.

## Decision review

No Accepted product or architecture decision changed. This slice implements D-013's explainable evidence-coverage boundary by comparing reproducible facts instead of silently recalculating a user's judgment. It preserves SQLite as durable truth, immutable document versions, field-level provenance, explicit user control, and the prohibition on opaque ATS or hiring-probability scores. No ADR was required for `MAT-007`.
