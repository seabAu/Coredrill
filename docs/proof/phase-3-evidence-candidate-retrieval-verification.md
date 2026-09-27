# Phase 3 evidence candidate retrieval verification

Date: 2026-09-27
Checklist item: `MAT-003`
Implementation commit: `ecd6265037ce8b8fa1b6520a27c51dbda55a181f`
Firefox proof correction: `3a158990d59317304ab8d38f1c349afa48c44fbd`
Hosted run: [Foundation CI 36335577747](https://github.com/seabAu/Coredrill/actions/runs/36335577747)
Status: complete

## Outcome

Coredrill now retrieves a bounded, deterministic set of career-evidence candidates for each job requirement from explicit skill aliases, skill-to-story and skill-to-accomplishment relations, and local full-text search. Each suggestion states why it was found and which retrieval mode produced it. Suggestions never become coverage evidence automatically: only an explicit user action creates a durable requirement-evidence selection, and the user can remove that selection explicitly.

The workflow remains accountless, local-first, offline-capable, useful with AI disabled, and free of new network access or extension permissions. It does not infer a coverage classification, ATS score, hiring probability, or verified fact from generated content.

## Deterministic retrieval contract

- Exact canonical-skill and reviewed-alias matches run before structured skill-to-story and skill-to-accomplishment expansion.
- FTS5 is capability-probed and used when available; a normalized-token fallback preserves retrieval when FTS5 is unavailable.
- Candidate scoring, tie-breaking, explanations, result limits, and relation traversal are bounded and deterministic.
- A frozen TypeScript, recovery, and AWS fixture proves recall-at-5 of `1`, zero excluded-evidence retrieval, stable ordering, accelerated/fallback parity, and repeatable explanations.
- Application queries return selected evidence separately from suggestions. Commands select or remove evidence only after validating the requirement, evidence kind, evidence identity, and actor.
- Durable selection is atomic: the selection and its audit event commit together or roll back together.

## Storage and recovery contract

- Schema migrations `0130` through `0132` add explicit skill-evidence relations, requirement-evidence selections, and search content without changing existing confirmed career facts.
- Repository-contract manifest version `4` contains 20 cases, including accelerated and fallback requirement-evidence retrieval plus explicit selection and removal.
- Portable export schema `132` contains 50 datasets and 100 readable CSV/JSON files; selected evidence and structured relations survive export and import.
- The clean recovery fixture proves one skill-evidence relation and one requirement-evidence selection after archive recovery.
- Recovery proof produced archive SHA-256 `04fcf508dd9319e857750d9dc35e5ac382f459fab296e82b4e399b42181d0fac` and content SHA-256 `bdbc6b227b71ba170cae11a6b404105c81a3901e4954308282e71b581ea1ec9d`.

## UI and browser proof

- The Requirements workspace separates selected evidence from suggested evidence and presents the explanation and retrieval mode for each candidate.
- The user can select a suggestion, observe the durable selected state, and remove it deliberately.
- The application-shell browser journey proves selection and removal with zero external requests.
- The interface deliberately omits `MAT-004` coverage labels until the separate explainable decision rules are implemented and proven.

## Local verification

- Focused application, storage, and UI verification passed 3 files and 14 tests after the atomic-selection review adjustment.
- Repository-wide typecheck passed all 33 tasks and lint passed all 22 package tasks plus repository tooling.
- Unit verification passed 103 files and 811 tests.
- The application-shell browser suite passed 71 tests, including the requirement-evidence selection/removal journey.
- Browser storage passed 8 tests at schema 132 with the version-4, 20-case repository manifest.
- Native verification passed 13 TypeScript integration tests plus 11 Rust tests, with the one platform-secure-store test intentionally delegated to its redacted proof harness.
- `pnpm verify` passed formatting, boundaries, foundation records, typecheck, lint, unit and coverage suites, production builds, extension inspection, all browser journeys, native recovery, contract schemas, licenses, secret scanning, dependency audits, and Changesets.
- Dependency policy remained clean: npm and Rust audits reported zero known vulnerabilities, with the same 7 reviewed Rust warnings allowed by policy.

## Hosted clean-commit verification

Foundation CI run `36335577747` completed successfully for exact proof-correction commit `3a158990d59317304ab8d38f1c349afa48c44fbd`, which contains implementation commit `ecd6265037ce8b8fa1b6520a27c51dbda55a181f`.

Required hosted jobs passed:

- build, static checks, tests, and policy (`108665858920`)
- native secure storage and packages on Ubuntu (`108665859408`), Windows (`108665859098`), and macOS (`108665859185`)
- browser storage on Chrome 151 (`108665859128`), Chrome 152 (`108665859046`), Firefox 153 (`108665859049`), and Firefox 154 (`108665859169`)
- extension transfer on Chromium and Firefox fallback (`108665859147`)
- full-history secret scan (`108665859067`)

The pull-request-only dependency review job (`108665859675`) was skipped as expected for a direct push to `main`. GitHub emitted only its scheduled Ubuntu runner-image migration notice; this is an upstream maintenance notice rather than a `MAT-003` failure.

## Decision review

No Accepted product or architecture decision changed. This slice implements D-031's deterministic-extraction and manual-review ordering, D-030 field-level provenance, and the accepted local SQLite/search boundary. It adds no AI inference, opaque score, hosted service, account requirement, scraper, extension permission, or dependency. No ADR was required for `MAT-003`.
