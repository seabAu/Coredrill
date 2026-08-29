# Phase 1 Job workspace core tabs verification

Date: 2026-08-29

Checklist scope: `UI-009`

Packages: `@coredrill/ui`, `@coredrill/web`

Decision changes: none

## Outcome

`UI-009` fills the shared Job workspace from `UI-008` with four validated,
local-first content contracts. Implementation commit `8940bb5` adds:

- Overview normalized facts, description, tags, disclosed compensation,
  application deadline/context, next action, user notes, and a bounded quick
  timeline-note intent;
- Timeline attention counts and semantic chronology for status, interactions,
  interviews, reminders, notes, and outcomes, with status/outcome history
  explicitly append-only and editing offered only for note events;
- Company relationship context for other active roles, contacts, notes,
  outcomes, salary observations, domain, and website, while keeping missing
  companies and contact details explicit rather than inferred; and
- Source snapshot, extraction, comparison, freshness, URLs, field provenance,
  and manual refresh-policy context, including the permanent rule that new
  candidates never silently replace user-confirmed values.

The component validates bounded identity, descriptions, notes, tags, counts,
timeline kinds and IDs, editability rules, and source provenance before render.
It fails closed for duplicate event IDs, editable immutable events, unsupported
tabs, and invalid relationship content. All actions leave the shared UI as typed
intents; the proof host performs no durable write, connector call, account flow,
AI request, automatic refresh, outreach, or external network request.

## Component, responsive, and accessibility proof

The component suite freezes the four-tab and thirteen-action vocabularies and
proves normalized Overview facts, the 2,000-character quick-note bound,
semantic ordered chronology, note-only editing, company/contact policy copy,
source provenance, user-confirmation protection, and fail-closed validation.

The application-shell Playwright suite exercises 22 scenarios. Its two new
dedicated scenarios prove that:

- a wide Pipeline opens the Overview inside the 640-pixel contextual workspace
  with disclosed compensation, deadline, next action, notes, and quick entry;
- submitting a quick note emits only its character count and explicit
  non-persistence status, clears the input, and does not expose the note text;
- Timeline route history, semantic chronology, one editable note, immutable
  status events, interaction entry, interview scheduling, and follow-up actions
  remain reachable;
- Company exposes relationship counts, notes/actions, and an explicit rule
  against guessed email addresses or automated outreach;
- Source exposes the provenance table, snapshot/change/manual-refresh controls,
  confirmation policy, and connector-policy boundary;
- the complete tab journey makes zero external requests and reports zero axe
  violations; and
- a direct 360-pixel Source route in forced-colors/reduced-motion mode has no
  document-level horizontal overflow, while the wide provenance table owns its
  local overflow and is keyboard focusable with a visible focus ring.

The retained desktop and narrow forced-colors screenshots were visually
reviewed. Contextual mode keeps Pipeline visible without duplicating the Job
workspace, and the narrow full-page mode reflows controls and facts into one
column while keeping Source actions and provenance reachable.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command                                                                                                                                 | Result                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node node_modules/vitest/vitest.mjs run packages/ui/test/job-workspace-content.test.tsx packages/ui/test/job-workspace-frame.test.tsx` | Passed 2 focused component files and 9 tests.                                                                                                                                                                                                                                                                              |
| `pnpm test:app-shell`                                                                                                                   | Passed all 22 shell, Home, Pipeline, Board, Table, Job-workspace, accessibility, focus, history, and responsive scenarios.                                                                                                                                                                                                 |
| `pnpm test:coverage`                                                                                                                    | Passed 47 files and 454 tests at 83.64% statements, 74.32% branches, 81.85% functions, and 86.29% lines overall.                                                                                                                                                                                                           |
| `pnpm verify`                                                                                                                           | Passed with exit code 0 across formatting, architecture, dependency records, typecheck, lint, unit/coverage, 22-package build, all UI browser proofs, extension packaging/transfer, document/browser/native storage, secure storage, archive recovery, schemas, licenses, secret scans, dependency audits, and Changesets. |
| [Foundation CI run 33271292346](https://github.com/seabAu/Coredrill/actions/runs/33271292346)                                           | Passed on attempt 2 for implementation commit `8940bb5`; all build, policy, extension, browser, and native package lanes completed successfully.                                                                                                                                                                           |

Attempt 1 passed every lane except Firefox 153 job `99150105867`, which timed
out after 30 seconds while running the pre-existing Phase 1 repository-contract
harness. Firefox 154 passed the identical command, and the failure was unrelated
to the UI-only change. The failed lane alone was rerun without a code change;
Firefox 153 job `99151679673` passed in 54 seconds, and the aggregate run
concluded successfully on attempt 2.

Hosted application-shell proof is retained for both tested Chrome versions:

| Browser               |           Job | Artifact                                                                             |  Artifact ID | SHA-256                                                            |
| --------------------- | ------------: | ------------------------------------------------------------------------------------ | -----------: | ------------------------------------------------------------------ |
| Chrome 151.0.7922.138 | `99150105958` | `coredrill-app-shell-chrome-151.0.7922.138-8940bb538dd761b7ec5686902a887482be2fd916` | `9720205170` | `8e86a959bb188fb5f290efee2dffa7f2746e2233feaf8809912ca9bb62457d66` |
| Chrome 152.0.7977.54  | `99150105938` | `coredrill-app-shell-chrome-152.0.7977.54-8940bb538dd761b7ec5686902a887482be2fd916`  | `9720205459` | `bb936155d8f5ba79371045a5aaf6d63947c5559e0426762528252ad871f789a3` |

Both immutable artifacts expire on 2026-09-28. This committed report, component
tests, browser suite, and deterministic local fixtures remain reproducible after
hosted retention ends.

## Dependency and policy status

This slice adds no dependency. The dependency inventory remains version 1.17
with 47 direct dependencies, 621 audited npm resolutions (82 optional), zero
known npm vulnerabilities, 354 reviewed JavaScript license records, and 498
reviewed Rust crates. The lockfile SHA-256 remains
`60c3e35de7f71cc0bc4bb877d35c9f0312d89e1b92d0700b752fd844a8ff293b`.

The known Rust audit baseline remains 14 unmaintained and 1 unsound transitive
warning, all already reviewed and allowlisted; this slice adds no Rust
dependency.

## Implementation surfaces

- `packages/ui/src/job-workspace-content.tsx` — validated content model, four
  core panels, semantic history, nullable relationships, typed local intents,
  and provenance policy.
- `packages/ui/styles.css` — card/fact/timeline/table composition, responsive
  reflow, local overflow ownership, focus, and forced-colors treatment.
- `apps/web/src/app-shell.tsx` — deterministic synthetic view-model composition
  and transparent non-persistent action host inside both workspace modes.
- `packages/ui/test/job-workspace-content.test.tsx` — vocabulary, rendering,
  immutable-event, provenance, and fail-closed contract tests.
- `e2e/app-shell.spec.mjs` — complete tab journey, privacy-safe note intent,
  accessibility, local-only network ledger, responsive overflow, ARIA, and
  screenshot proof.
- `.changeset/job-workspace-core-tabs.md` — UI/web change record.

## Boundaries and remaining work

- The standard composition remains a deterministic synthetic proof host.
  Production composition must consume the accepted `APP-005` Job-workspace DTO
  for its existing fields and add explicit application read queries for complete
  timeline rows, contacts, and field-provenance rows before claiming canonical
  content or wiring durable mutations.
- Requirements and Documents retain their stable route identities and existing
  placeholders for their dedicated later slices.
- No field is presented as AI-verified, no opaque score is introduced, and no
  missing contact or company fact is guessed.
- Candidate status display names remain provisional while `Q-006` is open.
- Automated axe checks are necessary regression evidence, not a WCAG conformance
  claim. Manual keyboard, zoom, screen-reader, and representative-participant
  gates remain assigned to dedicated accessibility and user-research items.
- `UI-010` is next and owns Network company, contact, and interaction views.
- `FND-001` remains independently blocked on durable private conduct and
  vulnerability-reporting routes.
- No ADR is required because no Accepted decision changed.
