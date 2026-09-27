# Phase 3 manual Career Profile editor verification

Date: 2026-09-27
Checklist item: `EVD-003`
Implementation commit: `30a2b4ced883e5825d4bbbd489e70025bfa39b38`
Hosted run: [Foundation CI 36310482403](https://github.com/seabAu/Coredrill/actions/runs/36310482403)
Status: complete

## Outcome

Coredrill now provides manual, local-first editors for all nine accepted Career Profile entry areas: basics/preferences, employment, education, projects, skills, accomplishments, certifications, publications, and volunteer work. The workspace remains accountless, offline-capable, and useful with AI disabled.

This slice deliberately excludes resume import, proposal/conflict resolution, story/evidence linking, Answer Library behavior, and AI assistance. Those capabilities remain assigned to later checklist items.

## Application and storage boundary

- `@coredrill/application` owns adapter-neutral Career Profile input, output, command, and query contracts for the nine manual entry kinds.
- Validation rejects missing or unbounded text, unsafe or non-HTTP(S) URLs, invalid calendar dates, inverted ranges, and current roles with an end date before a storage port can run.
- Evidence-bearing manual rows are forced to `sourceDocumentId: null` and `verificationState: "user_confirmed"`; callers cannot invent imported or source-backed status through this boundary.
- Returned values are copied and frozen, and typed or unknown adapter failures become stable, content-free application errors.
- Browser composition maps the narrow application port to the existing durable Career Profile repositories after applying the reviewed migrations. SQLite/OPFS remains durable truth; React state is refreshed from the database after writes and on reload.
- No database migration, external request capability, hosted dependency, or AI capability was added.

## Interface and end-to-end proof

- The Career Profile workspace exposes a nine-section tablist with arrow, Home, and End keyboard navigation and one bounded editor per section.
- Field-specific validation errors stay associated with their controls, and saved evidence-bearing entries are visibly labeled user-confirmed.
- Component tests cover the section set, roving keyboard focus, validation rendering, save behavior, and later-slice exclusions.
- The browser journey rejects an inverted employment range, saves a valid manual employment entry, observes its user-confirmed state, reloads the application, and proves the entry survives from durable storage.
- The same journey passes automated accessibility analysis and an ARIA snapshot, captures wide and 320-pixel screenshots, verifies narrow-screen reflow, and asserts that no external network request occurs.

## Local verification

- Focused application and UI verification passed 2 files and 9 tests.
- The focused Chromium Career Profile journey passed before the repository-wide gate.
- `pnpm verify` passed the complete repository gate: formatting, boundaries, foundation records, 91 unit-test files with 759 passing tests, 67 application-shell journeys, browser/storage/native suites, policy checks, license inventories, secret checks, dependency audits, and Changesets status.
- Unit coverage passed at 83.56% statements, 77.29% branches, 84.81% functions, and 86.63% lines.
- Native verification passed 11 Rust tests with 1 intentionally ignored platform-specific test and 13 native TypeScript tests.
- Dependency policy remained clean: 520 JavaScript packages and 498 Rust crates passed license review; npm and Rust audits reported zero known vulnerabilities, with the same 7 reviewed Rust advisories/warnings allowed by policy.

## Hosted clean-commit verification

Foundation CI run `36310482403` completed successfully for exact head SHA `30a2b4ced883e5825d4bbbd489e70025bfa39b38`:

- Full-history secret scan: job `108597441990`, passed.
- Build, static checks, tests, and policy: job `108597456917`, passed.
- Chrome `151`: job `108597458141`, passed.
- Chrome `152`: job `108597441670`, passed.
- Firefox `153`: job `108597464817`, passed.
- Firefox `154`: job `108597456870`, passed.
- Windows native storage, installed startup, and package: job `108597442056`, passed.
- macOS native secure storage and package: job `108597456420`, passed.
- Ubuntu native secure storage and package: job `108597455803`, passed.
- Extension transfer fallback: job `108597441037`, passed.

The extension-transfer job's first attempt encountered a transient `route.fetch: socket hang up` while Vite served a migration module. Six of seven extension tests had already passed, including the canonical capture review and Firefox fallback. Re-running only that failed job, without a code change, passed and completed the run successfully.

## Decision review

No Accepted product or architecture decision changed. The slice follows the existing TypeScript application/UI ownership boundary, SQLite durable-truth decision, local-first and offline-capable baseline, provenance and user-confirmation rules, and prohibition on treating generated content as verified evidence. No new ADR was required for `EVD-003`.
