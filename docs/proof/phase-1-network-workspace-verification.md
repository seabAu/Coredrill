# Phase 1 Network workspace verification

Date: 2026-08-29

Checklist scope: `UI-010`

Packages: `@coredrill/ui`, `@coredrill/web`

Decision changes: none

## Outcome

`UI-010` adds the three reviewed Network destinations to the shared application
shell. Implementation commit `cd0ac5f` provides:

- Companies master/detail views that relate jobs, contacts, interactions, notes,
  official sites, public facts and sources, outcomes, and salary observations;
- Contacts master/detail views whose identities and contact points retain one of
  the allowed origins (`user-entered`, `explicitly-public`, or `licensed`) and
  their provenance, while absent details remain visibly absent instead of being
  guessed;
- an append-only Interactions history and a bounded log-only composer for notes,
  calls, emails logged, meetings, referrals, and follow-ups; and
- neutral reminder snooze/disable controls with no manipulative urgency or
  automatic outreach.

The component validates bounded IDs, labels, URLs, notes, relationship counts,
interaction types, contact origins, and provenance before render. Public or
licensed contact points require a source URL; user-entered contact points forbid
one. Unsupported tabs, duplicate IDs, orphaned relationships, guessed-contact
states, and invalid provenance fail closed.

All actions remain typed intents. The deterministic proof host records only
privacy-safe action metadata and never echoes private interaction text. It makes
no durable write, connector call, enrichment request, account flow, AI request,
automatic outreach, or external network request.

## Component, responsive, and accessibility proof

The component suite freezes the three-tab, six-interaction-type,
three-contact-origin, and ten-action vocabularies across five tests. It proves
company relationships, explicit missing-contact treatment, source-bound public
contact details, append-only interaction semantics, bounded private drafts,
neutral reminder controls, and fail-closed validation.

The application-shell Playwright suite exercises 24 scenarios. Its two new
Network scenarios prove that:

- Companies, Contacts, and Interactions use stable direct routes and preserve
  browser back/forward history;
- company detail relates active jobs, people, public facts and sources, notes,
  outcomes, interactions, and salary observations without inventing evidence;
- contact identities and contact points expose allowed origin and provenance,
  while missing details remain explicit and the no-guess policy stays visible;
- submitting a private interaction emits only its type and character count,
  clears the draft, and never exposes its content;
- reminder controls are neutral and the complete journey makes zero external
  requests and reports zero axe violations; and
- a direct 360-pixel Contacts route in forced-colors/reduced-motion mode has no
  document-level horizontal overflow, while the provenance table owns its local
  overflow and remains keyboard focusable with a visible focus ring.

The retained desktop Contacts and Interactions screenshots and narrow
forced-colors Contacts screenshot were visually reviewed. The desktop
master/detail hierarchy is balanced and readable; the narrow layout reflows to
one column while retaining actions, provenance, local table overflow, and
keyboard access.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node node_modules/vitest/vitest.mjs run packages/ui/test/network-workspace.test.tsx`         | Passed 1 focused component file and 5 tests.                                                                                                                                                                                                                                                                               |
| `pnpm test:app-shell`                                                                         | Passed all 24 shell, Home, Pipeline, Board, Table, Job-workspace, Network, accessibility, focus, history, and responsive scenarios.                                                                                                                                                                                        |
| `pnpm test:coverage`                                                                          | Passed 48 files and 459 tests at 83.43% statements, 74.42% branches, 81.17% functions, and 85.98% lines overall.                                                                                                                                                                                                           |
| `pnpm verify`                                                                                 | Passed with exit code 0 across formatting, architecture, dependency records, typecheck, lint, unit/coverage, 22-package build, all UI browser proofs, extension packaging/transfer, document/browser/native storage, secure storage, archive recovery, schemas, licenses, secret scans, dependency audits, and Changesets. |
| [Foundation CI run 33273175179](https://github.com/seabAu/Coredrill/actions/runs/33273175179) | Passed on attempt 1 for implementation commit `cd0ac5f`; all build, policy, extension, Chrome 151/152, Firefox 153/154, and Windows/macOS/Ubuntu native package lanes completed successfully.                                                                                                                              |

Hosted application-shell proof is retained for both tested Chrome
versions:

| Browser               |           Job | Artifact                                                                             |  Artifact ID | SHA-256                                                            |
| --------------------- | ------------: | ------------------------------------------------------------------------------------ | -----------: | ------------------------------------------------------------------ |
| Chrome 151.0.7922.138 | `99155218507` | `coredrill-app-shell-chrome-151.0.7922.138-cd0ac5f2d8c7db564acf077f651a94dc180229be` | `9720724760` | `ad9fdab57eafe9ca41753f07eab23d3b30038a4fadf09633d5d2c1c3c8cf86f3` |
| Chrome 152.0.7977.54  | `99155218487` | `coredrill-app-shell-chrome-152.0.7977.54-cd0ac5f2d8c7db564acf077f651a94dc180229be`  | `9720727888` | `9dc5f85a3feabd80a0b9ca8094fd19ea5f73b5b4312da5dccfce15cba294b5bd` |

Both immutable artifacts expire on 2026-09-28. This committed report,
component tests, browser suite, and deterministic local fixtures remain
reproducible after hosted retention ends.

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

- `packages/ui/src/network-workspace.tsx` — validated Network model, stable tab
  routes, relationship views, provenance rules, append-only history, and typed
  local intents.
- `packages/ui/styles.css` — master/detail composition, timelines, forms,
  responsive reflow, local overflow ownership, focus, and forced-colors
  treatment.
- `apps/web/src/app-shell.tsx` — deterministic synthetic view-model composition
  and transparent non-persistent action host.
- `packages/ui/test/network-workspace.test.tsx` — vocabulary, relationship,
  provenance, privacy, and fail-closed contract tests.
- `e2e/app-shell.spec.mjs` — route/history journey, privacy-safe draft handling,
  zero-external-request ledger, accessibility, responsive overflow, ARIA, and
  screenshot proof.
- `.changeset/network-relationship-workspace.md` — UI/web change record.

## Boundaries and remaining work

- The standard composition remains a deterministic synthetic proof host.
  Production composition must use the accepted `APP-003` interaction commands
  and `APP-004` company/contact commands plus explicit read-query adapters
  before claiming canonical durability.
- External source links are visible evidence affordances and open only after an
  explicit user action; the proof journey makes no external request.
- No contact data is guessed or enriched, no interaction is sent, and no
  outreach is automated.
- Candidate status display names remain provisional while `Q-006` is open.
- Automated axe checks are necessary regression evidence, not a WCAG
  conformance claim. Manual keyboard, zoom, screen-reader, and
  representative-participant gates remain assigned to dedicated accessibility
  and user-research items.
- `UI-011` is next and owns scoped and global local search with keyboard result
  navigation.
- `FND-001` remains independently blocked on durable private conduct and
  vulnerability-reporting routes.
- No ADR is required because no Accepted decision changed.
