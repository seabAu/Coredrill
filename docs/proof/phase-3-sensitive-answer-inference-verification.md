# Phase 3 sensitive-answer inference verification

Date: 2026-09-27
Checklist item: `MAT-006`
Implementation commit: `be2cb11855291e824a4d172c511d15470419443a`
Firefox proof correction: `0c74262502e305b30feecae2563e8aed76053802`
Hosted run: [Foundation CI 36348151312](https://github.com/seabAu/Coredrill/actions/runs/36348151312)
Status: complete

## Outcome

Coredrill now treats work authorization, immigration or citizenship status, visa sponsorship, legal eligibility attestations, demographic and EEO questions, veteran status, disability, and medical questions as direct private answers. They remain visibly **Unanswered** until the user supplies an answer directly. Career Profile values, selected or suggested evidence, documents, Answer Library entries, and generated text cannot populate or establish those answers.

The policy remains accountless, local-first, offline-capable, and effective with AI disabled. This slice adds no schema, migration, dependency, network path, extension permission, provider call, account, hosted service, form mutation, or submission capability.

## Versioned policy contract

- `application-question-policy-v1` classifies the eight documented application-question groups plus a fail-closed Unknown group.
- Work-authorization/legal and demographic/EEO/medical/disability groups use `direct-private-answer`: generated drafts and profile proposals are disabled, and a value may be returned only from the explicit `directUserAnswer` input.
- Candidate values from Career Profile, career evidence, documents, the Answer Library, and generation are counted as ignored and never become an answer for a direct-private question.
- Logistics can expose only an explicit profile setting as an unconfirmed proposal. Compensation, signatures/acknowledgments, and unknown questions remain unset.
- The application test matrix covers authorization, visa sponsorship, citizenship, race/EEO, gender, veteran status, disability/medical status, a direct user answer, logistics confirmation, compensation, signature, unknown, and the three draftable groups.

## Storage and evidence boundary

- `requirement-coverage-v2` checks the question policy before evidence coverage. Unrelated selected evidence cannot turn a private question into Strength or Partial; the deterministic state remains Unknown with a direct-answer explanation.
- The requirement-evidence repository classifies the requirement before loading Career Profile search content. Direct-private retrieval returns no query terms or candidates and does not run FTS or relation expansion.
- Evidence selection and coverage-decision writes are rejected before target evidence or existing selections are read. Removal and reset remain available to clean up historical links or labels without silently deleting them.
- A historical user-reviewed coverage label may remain available for review, but it is explicitly not an answer. The UI still reports the private answer itself as Unanswered.
- Repository-contract manifest `phase-1-repository-contracts-v6` contains 22 ordered cases. Its new negative case seeds matching work-authorization evidence, proves retrieval returns nothing, proves select and coverage writes fail, and directly verifies that no selection or decision row was stored.

## UI and browser proof

- The Requirements workspace renders a named **Private answer required** region with status **Unanswered** and explicitly names Career Profile, evidence, documents, and Answer Library as prohibited inference sources.
- The private region has no coverage selector, evidence candidates, Select evidence control, or hidden answer value. Any historical evidence link is labeled ignored and can only be removed.
- Component tests isolate the private region and prove the inference controls are absent.
- The application-shell journey passed with zero external requests, no durable answer write, automated accessibility coverage, and 320-CSS-pixel reflow without horizontal overflow.
- The emitted browser proof was `MAT006_E2E_PROOF {"sensitiveAnswerStatus":"Unanswered","inferenceSourcesNamed":4,"coverageControls":0,"evidenceSelectionControls":0,"durableAnswerWrites":0,"narrowReflow":true,"externalRequests":0}`.

## Local verification

- `pnpm verify` passed formatting, boundaries, foundation records, all 33 typecheck tasks, all 22 package lint tasks plus tooling lint, 104 unit files and 840 tests, coverage, production builds, extension inspection, all browser journeys, native recovery, generated-contract checks, licenses, secret scanning, dependency audits, and Changesets.
- The application-shell suite passed 71 tests. Browser storage passed 8 tests with the version-6, 22-case repository manifest. Native verification passed 13 TypeScript integration tests and 11 Rust tests, with one secure-store test intentionally delegated to its redacted platform harness.
- The focused Chrome MAT-006 journey and browser SQLite contract passed before the full run. Exact Firefox 153/154 proof subsequently passed in hosted CI after the Firefox harness expectation was advanced from manifest `5`/21 cases to `6`/22 cases.
- npm audit reported no known vulnerabilities. Rust audit reported no blocking vulnerability and retained the same seven reviewed warning-only advisories allowed by policy.
- `git diff --check` and Changeset validation passed before the implementation commit.

## Hosted clean-commit verification

Foundation CI run `36348151312` completed successfully for exact Firefox proof-correction commit `0c74262502e305b30feecae2563e8aed76053802`, which contains implementation commit `be2cb11855291e824a4d172c511d15470419443a`.

Required hosted jobs passed:

- build, static checks, tests, and policy (`108701574489`)
- native secure storage and packages on Ubuntu (`108701574248`), Windows (`108701574231`), and macOS (`108701574188`)
- browser storage on Chrome 151 (`108701574281`), Chrome 152 (`108701574208`), Firefox 153 (`108701574178`), and Firefox 154 (`108701574251`)
- extension transfer on Chromium and Firefox fallback (`108701574035`)
- full-history secret scan (`108701574232`)

The pull-request-only dependency review job (`108701575061`) was skipped as expected for a direct push to `main`. GitHub emitted only existing runner-transition and third-party action Node-version notices; no MAT-006 failure or security finding was reported.

## Decision review

No Accepted product or architecture decision changed. This slice implements D-003's user-controlled-assistance boundary, D-013's requirement that evidence coverage not masquerade as an answer or employer judgment, and the existing privacy rules for highly sensitive application data. It adds no autofill, auto-submit, AI inference, hosted requirement, or new durable sensitive-answer store. No ADR was required for `MAT-006`.
