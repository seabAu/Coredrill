# Phase 1 Home attention queue verification

Date: 2026-08-29

Checklist scope: `UI-004`

Packages: `@coredrill/ui`, `@coredrill/web`

Decision changes: none

## Outcome

`UI-004` establishes Home as a calm, local attention queue rather than a report
dashboard. Implementation commit `f1c7dad` adds a shared, typed `HomeDashboard`
with ready and empty states. The populated state orders `Now`, `Needs attention`,
`This week`, an optional snapshot, and `Continue` exactly as the reviewed interface
contract requires.

`Now` accepts at most three high-priority actions and rejects an overflowing model.
`Needs attention` covers capture review, unsupported claims, failed transfer, stale
follow-up, and backup risk. The weekly agenda remains compact, while the optional
snapshot contains only factual pipeline counts, response timing, and an explicitly
non-streak weekly target. Users can hide that snapshot without hiding core work.
Recent jobs and documents remain one action away, and quick Add, Paste, and Capture
actions remain available without an account, AI provider, or external request.

The empty state does not invent quotas or urgency. It offers three paths: add the
first job, import an existing tracker, or explore disposable sample data. It
explicitly says that no account, AI connection, or application target is required.

## Order, behavior, and accessibility proof

The application-shell Playwright suite retains screenshots and axe JSON while
exercising seven reviewed scenarios. Two Home scenarios prove that:

- the five populated sections appear in the required order;
- `Now` contains exactly three actions in the deterministic fixture;
- every reviewed attention kind is represented;
- Add, Paste, and Capture actions are reachable;
- the optional snapshot is described as a private planning aid rather than a
  streak, can be hidden, and leaves the attention sections intact;
- recent-item navigation emits a local typed action;
- the ready state produces no request outside the local test origin;
- the empty state exposes exactly the three reviewed starting paths without
  account, AI, or target pressure; and
- populated, empty, dark/compact, and 320-pixel forced-color layouts retain usable
  reflow with zero automated axe violations.

The populated desktop, empty desktop, and 320-pixel forced-color artifacts were
visually reviewed. They retain clear attention hierarchy, readable urgency and
provenance-adjacent context, visible actions, and no horizontal overflow. The
mobile full-page capture includes Playwright's fixed-position bottom-navigation
stitching artifact; the live viewport itself remains correctly fixed and usable.

Component tests separately freeze the five attention kinds, three urgency levels,
section order, optional-snapshot language, empty-state promises, recent-item link,
and the runtime maximum of three `Now` actions.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                              | Passed for all 23 workspace projects with the unchanged reviewed lockfile in every hosted execution lane.                                                                                                                                                                                                                  |
| `pnpm exec vitest run packages/ui/test/home-dashboard.test.tsx`                               | Passed 1 focused component file and 4 contract tests.                                                                                                                                                                                                                                                                      |
| `pnpm test:app-shell`                                                                         | Passed all 7 shell, Home, accessibility, request-ledger, focus, navigation, and responsive scenarios.                                                                                                                                                                                                                      |
| `pnpm test:coverage`                                                                          | Passed 42 files and 433 tests at 86.79% statements, 77.25% branches, 88.55% functions, and 89.48% lines overall.                                                                                                                                                                                                           |
| `pnpm --filter @coredrill/web build`                                                          | Passed and emitted the application-shell entry plus existing application entries.                                                                                                                                                                                                                                          |
| `pnpm verify`                                                                                 | Passed with exit code 0 across formatting, architecture, dependency records, typecheck, lint, unit/coverage, 22-package build, all UI browser proofs, extension packaging/transfer, document/browser/native storage, secure storage, archive recovery, schemas, licenses, secret scans, dependency audits, and Changesets. |
| [Foundation CI run 33263544466](https://github.com/seabAu/Coredrill/actions/runs/33263544466) | Passed final implementation commit `f1c7dad` in the aggregate gate, exact Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native package lanes, extension transfer/reproducibility, and the full-history secret scan.                                                                                       |

Hosted application-shell proof is retained for both tested Chrome versions:

| Browser               |           Job | Artifact                                                                             | Artifact ID | SHA-256                                                            |
| --------------------- | ------------: | ------------------------------------------------------------------------------------ | ----------: | ------------------------------------------------------------------ |
| Chrome 151.0.7922.138 | `99129450358` | `coredrill-app-shell-chrome-151.0.7922.138-f1c7dad286e29d7e4a6dc1545ebc253a034006c0` |  9717966405 | `0b1e680918fee39f4116208bc874407b1ad81fd712b220f5656660f4039fb6a1` |
| Chrome 152.0.7977.54  | `99129450437` | `coredrill-app-shell-chrome-152.0.7977.54-f1c7dad286e29d7e4a6dc1545ebc253a034006c0`  |  9717964998 | `9c5298643077d3996b7bde7c41d16176ff2e49b86dbdf15d116e8fe71656810d` |

Both immutable artifacts expire on 2026-09-28. This committed report, component
tests, browser suite, and deterministic synthetic Home model remain reproducible
after hosted retention ends.

## Dependency and policy status

This slice adds no dependency. The dependency inventory remains version 1.17 with
47 direct dependencies, 621 audited npm resolutions (82 optional), zero known npm
vulnerabilities, 354 reviewed JavaScript license records, and 498 reviewed Rust
crates. The lockfile SHA-256 remains
`60c3e35de7f71cc0bc4bb877d35c9f0312d89e1b92d0700b752fd844a8ff293b`.

The known Rust audit baseline remains 14 unmaintained and 1 unsound transitive
warning, all already reviewed and allowlisted; this slice adds no Rust dependency.

## Implementation surfaces

- `packages/ui/src/home-dashboard.tsx` - typed ready/empty models, reviewed
  section order, bounded `Now` actions, attention cards, agenda, optional snapshot,
  recent items, and empty paths.
- `packages/ui/styles.css` - wide, compact, mobile, reduced-motion, and
  forced-colors Home composition.
- `apps/web/src/app-shell.tsx` - deterministic populated/empty proof composition,
  snapshot dismissal, local action reporting, and recent-item navigation.
- `packages/ui/test/home-dashboard.test.tsx` - frozen vocabulary, order, empty
  promises, and maximum-action contract.
- `e2e/app-shell.spec.mjs` - Home behavior, request-ledger, screenshot, axe, and
  responsive proof inside the existing shell suite.
- `.changeset/home-attention-queue.md` - UI/web change record.

## Boundaries and remaining work

- The shared UI consumes immutable read models and emits typed actions; it neither
  owns canonical storage nor performs network requests. The browser catalog is a
  deterministic proof host, so its React state and synthetic fixtures are
  explicitly noncanonical. Product composition must obtain these projections from
  the existing application and SQLite boundaries.
- Snapshot counts and timing are transparent factual summaries. This slice adds no
  opaque ATS score, hiring probability, generated evidence, autonomous outreach,
  or application target pressure.
- Capture, retry, follow-up, backup, and recent-item controls record local typed
  intent for their dedicated flows; they do not silently mutate confirmed data,
  submit an application, contact another person, or broaden permissions.
- Automated axe checks are necessary regression evidence, not a WCAG conformance
  claim. Manual keyboard, zoom, screen-reader, and representative-participant gates
  remain assigned to the dedicated accessibility and user-research items.
- D-010 remains Provisional until navigation findability research is completed.
  This implementation uses the current Home destination without claiming to lock
  that navigation language.
- `UI-005` is next for the Pipeline header, peer view switch, visible filter chips,
  saved views, and selection/bulk-action shell.
- `FND-001` remains independently blocked on durable private conduct and
  vulnerability-reporting routes.
- No ADR is required because no Accepted decision changed.
