# Phase 1 application-shell verification

Date: 2026-08-29

Checklist scope: `UI-002`

Packages: `@coredrill/ui`, `@coredrill/web`

Decision changes: none

## Outcome

`UI-002` establishes Coredrill's responsive, accountless application shell.
Implementation commit `d50fceb` adds the six reviewed primary destinations,
Settings and vault controls, local-only global search, command and Add menus,
Inbox/outbox indicators, five explicit vault-health states, stable local routes,
and keyboard shortcuts with focus restoration.

The shell uses a 240-pixel desktop rail, a 64-pixel compact rail, and a mobile
bottom bar with Home, Pipeline, Add, Documents, and More. More retains Career
Profile, Network, Insights, Settings, and the current vault-health control. The
320-pixel layout, reduced motion, and Windows forced-colors treatment retain the
same tasks and accessible names rather than removing functionality.

The stable destination contract is:

| Destination    | Local route              |
| -------------- | ------------------------ |
| Home           | `/`                      |
| Pipeline       | `/pipeline?view=board`   |
| Documents      | `/documents`             |
| Career Profile | `/profile/basics`        |
| Network        | `/network/companies`     |
| Insights       | `/insights/pipeline`     |
| Settings       | `/settings/vault-backup` |

## Responsive and accessibility proof

The Playwright shell suite retains screenshots and axe JSON for five reviewed
scenarios:

- 1440-pixel light/comfortable desktop navigation, route, badge, local-only,
  and healthy-vault behavior;
- 1280-pixel dark/compact composition with a backup-due vault;
- local search, command, and Add-menu keyboard behavior, including focus return
  and a request ledger proving no external request;
- 800-pixel compact-rail navigation with every destination and the offline
  state explicitly explaining that local work remains available; and
- 320-pixel mobile navigation under forced colors and reduced motion, including
  More, vault access, complete content reflow, and no horizontal overflow.

The light desktop, dark desktop, and 320-pixel forced-colors screenshots were
visually reviewed. They retain readable hierarchy, complete navigation, visible
active/focus states, accessible utility controls, and a calm workspace at every
tested width. All three axe-reviewed states reported zero automated violations.

Component tests separately freeze the exact route inventory, Add and command
inventories, active-state and badge semantics, local-only copy, and all five
vault-health messages.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command                                                                                          | Result                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                 | Passed for all 23 workspace projects with the reviewed lockfile locally and in every hosted execution lane.                                                                                                                                                                                                            |
| `pnpm exec vitest run packages/ui/test/app-shell.test.tsx packages/ui/test/foundations.test.tsx` | Passed 2 files and 12 focused component/contract tests.                                                                                                                                                                                                                                                                |
| `pnpm test:app-shell`                                                                            | Passed all 5 exact-Chromium responsive, keyboard, local-request, and accessibility scenarios.                                                                                                                                                                                                                          |
| `pnpm test:coverage`                                                                             | Passed 40 files and 426 tests at 88.81% statements, 80.38% branches, 94.85% functions, and 91.70% lines overall.                                                                                                                                                                                                       |
| `pnpm check:affected HEAD`                                                                       | Passed affected UI/web builds, typechecks, and lints against the implementation base.                                                                                                                                                                                                                                  |
| `pnpm verify`                                                                                    | Passed with exit code 0 across formatting, architecture, dependency records, typecheck, lint, unit/coverage, 22-package build, UI browser proofs, extension packaging/transfer, document/browser/native storage, secure storage, archive recovery, schemas, licenses, secret scans, dependency audits, and Changesets. |
| [Foundation CI run 33260284056](https://github.com/seabAu/Coredrill/actions/runs/33260284056)    | Passed implementation commit `d50fceb` in the aggregate gate, exact Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native package lanes, extension transfer/reproducibility, and the full-history secret scan.                                                                                         |

Hosted shell proof is retained for both tested Chrome versions:

| Browser               |           Job | Artifact                                                                             | Artifact ID | SHA-256                                                            |
| --------------------- | ------------: | ------------------------------------------------------------------------------------ | ----------: | ------------------------------------------------------------------ |
| Chrome 151.0.7922.138 | `99120929016` | `coredrill-app-shell-chrome-151.0.7922.138-d50fceb85b9d577234d86b6c0fb2e08234cd9aea` |  9717065315 | `e5c9cb636c88d0a4b7095938a45648852c62f802be09b87bf033adb2d451beb1` |
| Chrome 152.0.7977.54  | `99120929027` | `coredrill-app-shell-chrome-152.0.7977.54-d50fceb85b9d577234d86b6c0fb2e08234cd9aea`  |  9717063767 | `81ff5eb319365aab27108171848d94cc777a4beed1693ceceb0dcbd7f4dfdcce` |

Both immutable artifacts expire on 2026-09-28. This committed report, component
tests, browser suite, and deterministic synthetic catalog remain reproducible
after hosted retention ends.

## Dependency and policy status

The reviewed exact additions are Tailwind CSS and its official Vite integration
4.3.3, Radix UI Dialog 1.1.23, and Radix UI Dropdown Menu 2.1.24. Tailwind runs
at build time over Coredrill's accepted CSS custom-property token system; Radix
supplies local interaction primitives whose content, actions, focus return, and
styling remain controlled by Coredrill.

The dependency inventory advances to version 1.17 with 47 direct dependencies,
621 audited npm resolutions (82 optional), zero known npm vulnerabilities, 354
reviewed JavaScript license records, and 498 reviewed Rust crates. The lockfile
SHA-256 is
`60c3e35de7f71cc0bc4bb877d35c9f0312d89e1b92d0700b752fd844a8ff293b`.

The known Rust audit baseline remains 14 unmaintained and 1 unsound transitive
warning, all already reviewed and allowlisted; this slice adds no Rust dependency.

## Implementation surfaces

- `packages/ui/src/app-shell.tsx` - shell contract, stable routes, responsive
  navigation, local search, commands, Add, vault health, and shortcuts.
- `packages/ui/styles.css` - desktop/compact/mobile composition, overlays,
  responsive reflow, focus, reduced-motion, and forced-colors behavior.
- `apps/web/src/app-shell.tsx`, `apps/web/src/app-shell.css`, and
  `apps/web/app-shell.html` - deterministic local shell catalog.
- `packages/ui/test/app-shell.test.tsx` - exact contract and semantic proof.
- `e2e/app-shell.spec.mjs` and `playwright.app-shell.config.mjs` - responsive,
  keyboard, local-request, screenshot, and axe proof.
- `.github/workflows/foundation.yml` - exact-Chrome proof execution and immutable
  artifact retention.
- `.changeset/responsive-application-shell.md` - UI/web change record.

## Boundaries and remaining work

- Search results and page content in this proof are synthetic local fixtures.
  The shell defines the UI boundary without inventing remote search, accounts,
  AI, a hosted database, scraping, outreach, or application automation.
- Automated axe checks are necessary regression evidence, not a WCAG conformance
  claim. Manual keyboard, zoom, screen-reader, and representative-participant
  gates remain assigned to the dedicated accessibility and user-research items.
- D-010's six-item navigation remains Provisional until `UXR-004` through
  `UXR-008` supply the required participant evidence. This implementation does
  not claim to lock its terminology or information architecture.
- `UI-003` is next for the skippable Quick start and Guided setup paths with a
  separate disposable demo vault. D-015 likewise remains Provisional pending
  first-run usability and storage-comprehension evidence.
- `FND-001` remains independently blocked on durable private conduct and
  vulnerability-reporting routes.
- No ADR is required because no Accepted decision changed.
