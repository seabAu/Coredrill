# Phase 3 Documents workspace verification

Date: 2026-09-27
Checklist item: `DOC-002`
Implementation commit: `b9b9539b172a72b0476e33242eeb1a473155ce01`
Hosted run: [Foundation CI 36358701361](https://github.com/seabAu/Coredrill/actions/runs/36358701361)
Status: complete

## Outcome

Coredrill now renders the six accepted Documents views—All, Resumes, Cover letters, Answers, Templates, and Submitted—from durable local SQLite records. The workspace exposes current version, base/template/job lineage, related job and company, last edit, latest-version export state, claim-evaluation state, and the exact submitted version independently from a newer current version.

The surface remains accountless, local-first, offline-capable, and useful with AI disabled. It is explicitly read-only and adds no editor command, generation path, export orchestration, Mark Applied action, provider call, network permission, hosted service, auto-submit, auto-apply, or automated outreach.

## Durable read model and boundary

- `DocumentWorkspaceRepository` joins the accepted document, immutable version, lineage, job/company, attachment/export, submitted-snapshot, and evidence-provenance records without introducing canonical UI state.
- Local search includes title, base/template/job/company metadata, the latest immutable document's `content_plain`, and active Career Profile evidence whose provenance points to the document through `source_document_id`.
- `createDocumentsWorkspaceOperations` validates the adapter result before it reaches the UI. The boundary limits the result to 5,000 records, validates typed IDs/timestamps/enums and bounded text, and fails closed when stored metadata violates the reviewed shape.
- The latest attachment relation determines only whether the current immutable version has an export available. Submitted items retain their separately recorded exact version and `file` or `plain_text` format.
- Claim status is deliberately `not_evaluated`. Coredrill does not infer claim support before the later claim ledger and review workflow exist.

## Six-view and submitted-version proof

The deterministic local reference fixture creates six documents and returns these counts:

| View          | Records |
| ------------- | ------: |
| All           |       6 |
| Resumes       |       3 |
| Cover letters |       2 |
| Answers       |       1 |
| Templates     |       1 |
| Submitted     |       3 |

The browser journey proves a Northstar job-derivative resume is currently version 2, derives from the named base and template, relates to the Product Operations Lead role at Northstar Health, and has a latest-version export available. Its submitted snapshot independently retains exact file version 1. The Submitted view also exposes the exact cover-letter and answer items instead of substituting their current versions.

Search proved both post-submission current document text and the linked-evidence sentinel. The emitted result was:

```text
DOC002_E2E_PROOF {"views":{"all":6,"resumes":3,"coverLetters":2,"answers":1,"templates":1,"submitted":3},"currentResumeVersion":2,"submittedResumeVersion":1,"lineageRole":"job_derivative","exportStatus":"exported","claimStatus":"not_evaluated","contentSearch":true,"linkedEvidenceSearch":true,"accountRequired":false,"networkRequired":false,"aiRequired":false,"externalRequests":0}
```

## Interaction, accessibility, and responsive proof

- The six views use one accessible tab list and tab panel. Arrow Right and End move focus and selection through the roving tab stops.
- The workspace names its local read-only capability boundary and states that nothing on the surface uploads or submits a document.
- The Documents route passed automated axe inspection and an ARIA snapshot.
- At a 320-by-900 viewport, `clientWidth` and `scrollWidth` were both exactly 320 pixels and the local search control remained visible.
- The browser request observer recorded zero requests outside the local test origin.

## Local verification

- Focused application, storage, and UI tests passed 13 tests across 3 files.
- Focused Documents browser verification passed all 3 selected Playwright cases.
- `pnpm verify` passed formatting, package boundaries, foundation records, all 33 typecheck tasks, all 22 lint and build tasks, 107 unit files and 850 tests, coverage, extension checks, every browser suite, native TypeScript and Rust proofs, generated-contract checks, licenses, secret scanning, dependency audits, and Changesets.
- Coverage passed at 82.38% statements, 75.31% branches, 84.32% functions, and 85.38% lines.
- The complete application-shell suite passed 72 tests; the Documents browser suite passed 3 tests. UI foundations passed 5 tests, performance 1, resilience 3, onboarding 7, document editor/import/export 9, and browser storage 8.
- Native verification passed 13 TypeScript integration tests and 11 Rust tests, with one secure-store test intentionally delegated to its redacted platform harness.
- npm audit reported no known vulnerabilities. Rust audit reported no blocking vulnerability and retained the same seven reviewed warning-only advisories allowed by policy.

## Hosted clean-commit verification

Foundation CI run `36358701361` completed successfully for exact implementation commit `b9b9539b172a72b0476e33242eeb1a473155ce01`.

Required hosted jobs passed:

- build, static checks, tests, and policy (`108731438109`)
- native secure storage and packages on Ubuntu (`108731438159`), Windows (`108731438204`), and macOS (`108731438063`)
- browser storage on Chrome 151 (`108731438146`), Chrome 152 (`108731438142`), Firefox 153 (`108731438218`), and Firefox 154 (`108731438259`)
- extension transfer on Chromium and Firefox fallback (`108731438154`)
- full-history secret scan (`108731438206`)

The pull-request-only dependency review job (`108731438963`) was skipped as expected for a direct push to `main`. GitHub emitted only existing runner-transition and third-party action Node-version notices; no DOC-002 failure or security finding was reported.

## Decision review

No Accepted product or architecture decision changed. This slice implements D-042 and the accepted Documents information architecture using SQLite as durable truth, a runtime-validated application boundary, and shared TypeScript UI. Exact submitted identities remain immutable and separate from newer drafts. Editing, safe paste, autosave/recovery, undo, version creation, and comparison remain `DOC-003`; deterministic AI-disabled generation remains `DOC-004`; export orchestration remains `DOC-006`; Mark Applied remains `DOC-007`. No ADR was required for `DOC-002`.
