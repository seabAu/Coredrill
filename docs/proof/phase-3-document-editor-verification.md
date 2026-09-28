# Phase 3 document editor verification

Date: 2026-09-27
Checklist item: `DOC-003`
Implementation commits: `f68d2bdd42a3e314142739166f81173308b6f34e`, `263b0ad0bfd4e64bd9e1bee1295c951495aff80a`
Hosted run: [Foundation CI 36365297981](https://github.com/seabAu/Coredrill/actions/runs/36365297981)
Status: complete

## Outcome

Coredrill now provides a restricted structured document editor with safe paste, debounced durable autosave, reload recovery, undo and redo, explicit immutable version creation, and side-by-side version comparison. The editor works accountlessly, locally, offline, and with AI disabled.

This slice adds no deterministic or provider-backed generation, document export orchestration, Mark Applied flow, hosted service, account requirement, provider call, network permission, auto-submit, auto-apply, or automated outreach.

## Durable draft and version transaction

- Schema versions 146–148 add the durable document-editor draft, insert guards, and update guards. A draft is bound to its document and base version, has an optimistic `row_version`, and cannot target a nonexistent or mismatched document version.
- Explicit version creation atomically validates and consumes the expected draft into one immutable child version. A stale draft, stale row version, or mismatched base rolls the entire transaction back instead of overwriting user work.
- The shared repository contract is `phase-1-repository-contracts-v9`, manifest schema version 9, with 25 cases. The exact draft/version transaction runs against the shared Node, browser SQLite/OPFS, and native rusqlite adapters.
- Canonical document IR remains owned by the application boundary. The repository receives a validated normalized representation rather than editor-specific state.

## Editor, autosave, and recovery

- The Tiptap adapter exposes only the accepted restricted schema and commands. Hostile pasted markup is normalized into canonical document IR before persistence; unsafe tags, attributes, and URLs are not retained.
- Undo and redo preserve the local editing history while autosave persists the current canonical IR and plain text without silently creating document versions.
- The autosave coordinator debounces writes, serializes in-flight saves, retries retryable failures, and flushes pending work during lifecycle transitions. Reloading a document with a durable draft restores it and presents an explicit recovery notice.
- Creating a version is an explicit user action. It produces the exact next immutable version, clears only the consumed draft, and makes the new and prior versions available for comparison.
- The full application-shell suite caught an editor-lifecycle defect in which reparsing initial content recreated the autosave coordinator and canceled its timer. Memoizing the parsed initial content fixed the lifecycle; the focused journey then passed three consecutive runs before the complete verification run.

## Portable export and recovery

- Current portable export contains 55 datasets and 110 files, including document-editor drafts at schema 146 and later.
- Schema-145 milestone compatibility remains supported at 54 datasets and 108 files. Older supported archives therefore do not require a draft dataset that did not yet exist.
- The deterministic recovery fixture was regenerated at schema 148 and passes browser and native recovery validation.

## Browser journey proof

The browser journey edits a durable local document, exercises safe paste and undo, waits for autosave, reloads and recovers the draft, creates an immutable version, and compares it with the prior version. The request observer records zero requests outside the local test origin.

```text
DOC003_E2E_PROOF {"autosaveRecovered":true,"hostilePasteSanitized":true,"undoPreserved":true,"immutableVersionCreated":true,"comparisonVisible":true,"networkRequests":0}
```

The Documents route also passed its existing automated axe and ARIA coverage, keyboard interaction checks, deep-link/reload recovery, and zero-external-request assertions.

## Local verification

- `pnpm verify` passed formatting, package boundaries, foundation records, all 33 typecheck tasks, all 22 lint and build tasks, 111 unit files and 865 tests, coverage, extension checks, every browser suite, native TypeScript and Rust proofs, generated-contract checks, licenses, secret scanning, dependency audits, and Changesets.
- Coverage passed at 82.06% statements, 75.17% branches, 84.11% functions, and 85.07% lines.
- UI foundations passed 5 tests; the complete application-shell suite passed 73; performance passed 1; resilience 3; onboarding 7; dedicated document browser coverage 9; and browser storage 8.
- Native verification passed 13 TypeScript integration tests and 11 Rust library tests, with one secure-store test intentionally delegated to its redacted platform harness. Native secure-storage and archive harnesses passed.
- npm audit reported no known vulnerabilities. Rust audit reported no blocking vulnerability and retained the same seven reviewed warning-only advisories allowed by policy.
- Foundation inventory passed with 51 direct dependencies, 3 toolchains, 16 verification targets, and 10 accessibility cases. The reviewed lockfile hash is `222609e278cd8050cd53c490c1bf90d26ff62e931ef64b9c39923e851146f9ba`.

## Hosted clean-commit verification

Foundation CI run `36365297981` completed successfully for exact implementation commit `263b0ad0bfd4e64bd9e1bee1295c951495aff80a`.

Required hosted jobs passed:

- build, static checks, tests, and policy (`108750513276`)
- browser storage on Chrome 151 (`108750513380`), Chrome 152 (`108750513483`), Firefox 153 (`108750513407`), and Firefox 154 (`108750513441`)
- native secure storage and packages on Ubuntu 26.04 (`108750513494`), Windows (`108750513466`), and macOS 26 (`108750513416`)
- extension transfer on Chromium and Firefox fallback (`108750513465`)
- full-history secret scan (`108750513430`)

The pull-request-only dependency review job (`108750513962`) was skipped as expected for a direct push to `main`. GitHub emitted only existing runner-transition notices; no DOC-003 failure or security finding was reported.

## Decision review

No Accepted product or architecture decision changed. This slice implements D-042 and ADR-0008 through a restricted Tiptap adapter, durable guarded drafts, explicit immutable version creation, and exact comparison while preserving SQLite as durable truth and canonical document IR at the application boundary. Deterministic AI-disabled generation remains `DOC-004`; job/application document-set preparation remains `DOC-005`; export orchestration remains `DOC-006`; and Mark Applied remains `DOC-007`. No new ADR was required for `DOC-003`.
