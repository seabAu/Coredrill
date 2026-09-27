# Phase 3 requirement parsing and review verification

Date: 2026-09-27
Checklist item: `MAT-002`
Implementation commit: `56f103c47471deff900588f1c557f890e02bda4f`
Hosted run: [Foundation CI 36330863484](https://github.com/seabAu/Coredrill/actions/runs/36330863484)
Status: complete

## Outcome

Coredrill now provides an AI-independent, version-1 deterministic baseline that turns bounded, provenance-linked heading, list-item, and paragraph blocks into immutable pending requirement proposals. Each proposal carries a stable order and identity, one of the five accepted categories, bounded parse confidence, normalized and raw text, the exact source excerpt, source pointer, job identity, and provenance identity.

Parsing is read-only. A proposal does not become a requirement until the user explicitly accepts it. Acceptance creates one durable, user-confirmed `job_requirement` through the existing application and SQLite boundary; a category selected during review becomes the current category while the parser category remains the immutable source category. Rejection removes only the pending projection and does not alter the captured source or provenance. The workflow remains accountless, local-first, offline-capable, useful with AI disabled, and free of new network access or extension permissions.

## Deterministic parser contract

- Parse spec version `1` accepts only `heading`, `item`, and `paragraph` source blocks and rejects malformed job or provenance identities.
- Input is bounded to 512 blocks, 16,384 characters per source text, 4,096 characters per exact excerpt, 2,048 characters per source pointer, and 256 retained proposals.
- Reviewed heading context and explicit lexical rules classify `required`, `desired`, `responsibility`, `context`, and `constraint` proposals with fixed confidence values.
- Normalized meanings are deduplicated without rewriting the retained raw text or exact excerpt.
- Result objects, proposal arrays, and each proposal are frozen; repeated parsing of the same input produces the same output.
- The golden fixture covers all five categories, stable proposal ordering and IDs, explicit-rule precedence, ignored non-requirement prose, duplicate suppression, and an exact excerpt whose trailing newline must survive.

## Review-before-write contract

- `ParseJobRequirementsQuery` has no persistence port call and returns only pending proposal projections.
- `AcceptJobRequirementProposalCommand` revalidates the complete proposal, requires an explicit reviewed category, creates a local requirement identity, and makes exactly one repository call with `userConfirmed = true`.
- Acceptance preserves `sourceCategory` from the parser even when the reviewed current category differs.
- Ordinary direct requirement recording remains unconfirmed and initializes current and source categories identically.
- The repository validates explicit confirmation state and writes current category, source category, provenance, exact source facts, and confirmation atomically using the existing schema-129 transaction.
- No new table or migration is required; rejected proposals are ephemeral and cannot mutate `job_requirement`, `source_snapshot`, or `provenance`.

## UI and browser proof

- The Requirements tab distinguishes pending proposals from durable requirements and states that no record is created before explicit acceptance.
- Each proposal shows normalized meaning, parser category, parse confidence, exact source excerpt, and source pointer.
- The user can choose the category to record, accept, or reject. Accepted cards show the reviewed current category separately from the extracted source category.
- The browser journey accepts one proposal with a category override, confirms the preserved parser category and durable-confirmation presentation, rejects another proposal without source alteration, and then exercises the existing optimistic category-correction path.
- The same journey records zero external requests. The Requirements deep route passes automated Axe checks, and the full responsive suite retains keyboard navigation and narrow-screen reflow.

## Local verification

- Focused application, storage, and UI verification passed 4 files and 16 tests.
- Repository-wide typecheck passed all 33 tasks and lint passed all 22 package tasks plus repository tooling.
- Unit verification passed 101 files and 804 tests.
- The application-shell browser suite passed 71 tests, including the requirement proposal accept/recategorize/reject journey and the Requirements-route accessibility scan.
- Browser storage passed 8 tests at schema 129 with 48 datasets and 96 readable export files.
- Native verification passed 13 TypeScript integration tests plus 11 Rust tests, with the one platform-secure-store test intentionally delegated to its redacted proof harness.
- `pnpm verify` passed formatting, boundaries, foundation records, typecheck, lint, unit and coverage suites, production builds, extension inspection, all browser journeys, native recovery, contract schemas, licenses, secret scanning, dependency audits, and Changesets.
- Dependency policy remained clean: 520 JavaScript packages and 498 Rust crates passed license review; npm and Rust audits reported zero known vulnerabilities, with the same 7 reviewed Rust warnings allowed by policy.

## Hosted clean-commit verification

Foundation CI run `36330863484` completed successfully for exact implementation commit `56f103c47471deff900588f1c557f890e02bda4f`.

Required hosted jobs passed:

- build, static checks, tests, and policy (`108652386872`)
- native secure storage and packages on Ubuntu (`108652386779`), Windows (`108652386804`), and macOS (`108652386650`)
- browser storage on Chrome 151 (`108652386869`), Chrome 152 (`108652386763`), Firefox 153 (`108652387007`), and Firefox 154 (`108652386823`)
- extension transfer on Chromium and Firefox fallback (`108652386852`)
- full-history secret scan (`108652386831`)

The pull-request-only dependency review job (`108652387660`) was skipped as expected for a direct push to `main`. GitHub also emitted an upstream Node 20 deprecation notice for the pinned geckodriver setup action; both exact Firefox jobs passed under the runner's Node 24 compatibility path, so this is a maintenance notice rather than a `MAT-002` failure.

## Decision review

No Accepted product or architecture decision changed. This slice implements D-031's deterministic-extraction and manual-review ordering while preserving D-030 field-level provenance. It does not add AI classification, evidence retrieval, match decisions, an ATS score, or hiring probability. No new dependency, schema, hosted service, account requirement, scraper, extension permission, or ADR was required for `MAT-002`.
