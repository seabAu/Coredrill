# Phase 3 requirement comparison panels verification

Date: 2026-09-27
Checklist item: `MAT-005`
Implementation commit: `74ed147acb99cfba556daabd5768edfff04a9714`
Hosted run: [Foundation CI 36344621771](https://github.com/seabAu/Coredrill/actions/runs/36344621771)
Status: complete

## Outcome

Coredrill now presents listing parseability, literal-term matching, and qualification evidence as three separate named panels in the Requirements workspace. Each panel states the question it answers, shows only the evidence appropriate to that question, and names its limitations. The interface never combines the panels into an employer ATS score, fit percentage, or hiring probability.

The panels remain accountless, local-first, offline-capable, and useful with AI disabled. This slice adds no schema, migration, network path, AI inference, dependency, extension permission, or hosted-service requirement.

## Independent question contract

- **Listing parseability** reports recorded requirements, pending parser proposals, and user-confirmed categories. It describes only Coredrill's retained-listing parser; it does not claim to test a resume or predict an employer parser.
- **Literal-term matching** compares normalized requirement terms only with user-selected evidence. Suggestions are not treated as evidence. Observed and not-observed terms remain visible separately, and requirements without a selection remain explicitly not evaluated.
- **Qualification evidence** counts the existing per-requirement Strength, Partial, Gap, Unknown, and Not Applicable decisions. These remain explained judgments, not employer verification or an outcome prediction.
- Missing literal overlap never authorizes adding an unsupported skill or claim.
- Query and matched terms are bounded to 128 characters before rendering; displayed terms are trimmed and deduplicated case-insensitively.

## Component and browser proof

- The server-rendered UI contract passed 8 component tests, including three named panel regions, explicit limitations, all five qualification states, independent literal-term and coverage updates, and absence of a `100% match` claim.
- The application-shell browser suite passed 71 tests. Its MAT-005 journey proved three accessible panel regions, live selected-evidence term changes, separate coverage-state changes, zero aggregate-score elements, 320-pixel reflow without horizontal overflow, and zero external requests.
- The complete `job-requirements` automated accessibility route passed with no axe violations.
- The emitted browser proof was `MAT005_E2E_PROOF {"namedPanels":3,"parseabilitySeparate":true,"literalTermsSeparate":true,"qualificationEvidenceSeparate":true,"liveTermUpdate":true,"liveCoverageUpdate":true,"aggregateScores":0,"narrowReflow":true,"externalRequests":0}`.

## Local verification

- `pnpm verify` passed formatting, 19 package-boundary checks, foundation records, all 22 package typechecks and lint tasks, 103 files and 823 unit tests, coverage, production builds, extension checks, five UI-foundation cases, every browser suite, native Rust/TypeScript proofs, generated-contract checks, licenses, secret scanning, dependency audits, and Changesets.
- Performance, resilience, onboarding, document, browser-storage, native archive, native backup, and redacted secure-storage proofs remained green.
- npm audit reported no known vulnerabilities. Rust audit reported no blocking vulnerability and retained the same seven reviewed warning-only advisories allowed by policy.
- `git diff --check` passed before the implementation commit.

## Hosted clean-commit verification

Foundation CI run `36344621771` completed successfully for exact implementation commit `74ed147acb99cfba556daabd5768edfff04a9714`.

Required hosted jobs passed:

- build, static checks, tests, and policy (`108691216023`)
- native secure storage and packages on Ubuntu (`108691215911`), Windows (`108691216069`), and macOS (`108691215986`)
- browser storage on Chrome 151 (`108691216203`), Chrome 152 (`108691215988`), Firefox 153 (`108691216006`), and Firefox 154 (`108691216072`)
- extension transfer on Chromium and Firefox fallback (`108691216032`)
- full-history secret scan (`108691216058`)

The pull-request-only dependency review job (`108691216691`) was skipped as expected for a direct push to `main`. GitHub emitted only existing runner-transition and third-party action Node-version notices; no MAT-005 failure or security finding was reported.

## Decision review

No Accepted product or architecture decision changed. This slice implements D-013's requirement to keep parseability, literal-term coverage, and qualification evidence separate while prohibiting an opaque ATS or hiring-probability score. It reuses the accepted MAT-002 through MAT-004 read models and adds presentation-only derivation in `@coredrill/ui`. No ADR was required for `MAT-005`.
