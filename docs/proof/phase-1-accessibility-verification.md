# Phase 1 accessibility verification

Date: 2026-08-30

Checklist scope: `Q1-003`, `A11Y-001`

Implementation commit:
[`c42eacb35cfe5c304df1053a8de8a738ab2f70aa`](https://github.com/seabAu/Coredrill/commit/c42eacb35cfe5c304df1053a8de8a738ab2f70aa)

Decision changes: none

## Outcome

The available automated portion of the Phase 1 accessibility matrix passes.
The production application-shell suite now executes 59 cases: the 31 existing
semantic, keyboard, focus, state, forced-colors, reduced-motion, and reflow
journeys plus 19 core-route axe checks, four light/dark and
comfortable/compact appearance checks, and all five exact responsive
checkpoints in the accepted reference matrix.

`Q1-003` remains open. Automated checks do not establish WCAG conformance, and
this workspace cannot execute the required NVDA, VoiceOver, TalkBack, screen
magnification, or 200% browser text-resize manual matrix on the accepted
reference targets. Those absences are recorded as blockers rather than replaced
with synthetic claims.

## Finding resolved by the complete route matrix

The first complete-route execution found one serious axe `definition-list`
violation on the Job Company tab. Its Contacts and Other active roles buttons
were direct descendants of a `<dl>` grouping wrapper instead of being contained
by a definition description. The implementation now nests each action inside
its corresponding `<dd>`, preserves the visual hierarchy and 44-pixel control
target, and passes the route-specific axe check. No suppression, rule exclusion,
or baseline exception was added.

## Available matrix results

| Matrix case         | Evidence                                                                                                                                                                                                                                                           | Result                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `A11Y-AXE`          | Axe 4.13.0 across Home; Board/Table Pipeline; Documents; Career Profile; Network Companies/Contacts/Interactions; Insights; Settings; all six Job tabs; Company, Contact, and Document details; all six local workspace states; and four theme/density appearances | Passed with zero remaining violations                                                                                                       |
| `A11Y-REFLOW`       | 320-CSS-pixel Home, offline, permission-denied, selected Pipeline, 2,000-row Table, large Board, narrow Job Source, narrow Network contact, vault settings/deletion, onboarding, forced-colors, and reduced-motion cases                                           | Passed; page-level horizontal overflow is absent and intentionally wide Board/Table content owns its bounded local scroll region            |
| `A11Y-RESPONSIVE`   | Exact `360×800`, `768×1024`, `1024×768`, `1440×900`, and `1920×1080` checkpoints                                                                                                                                                                                   | Passed; the page reflows at each viewport, Home remains keyboard reachable from the appropriate navigation, and axe reports zero violations |
| Keyboard automation | Non-drag Board status movement and undo, Table editing/conflict errors, dialogs and menus, shortcuts, focus restoration, document-editor typing/heading/undo, and recovery actions                                                                                 | Supporting automation passed; `A11Y-KEYBOARD` remains open until the required manual keyboard-only canonical journey is retained            |
| Display automation  | Forced colors/high contrast emulation and reduced-motion behavior across complex/narrow states                                                                                                                                                                     | Supporting automation passed; `A11Y-DISPLAY` remains open because screen magnification and 200% text-resize manual review are not retained  |
| Semantic smoke      | Board/list grouping and announced move status, semantic Table, named dialogs/errors/status regions, editor textbox and heading structure, and route-level ARIA snapshots                                                                                           | Supporting evidence passed; manual screen-reader interpretation remains required                                                            |

The machine-readable reference matrix marks only `A11Y-AXE`, `A11Y-REFLOW`,
and `A11Y-RESPONSIVE` passed. Cases with incomplete manual obligations remain
`not-executed`; partial automation is not relabeled as a manual pass.

## Reproducible local verification

Run with Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the reviewed lockfile:

| Command                                  | Result                                                                                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:app-shell`                    | Passed all 59 application-shell cases after the definition-list correction                                                                                                                      |
| `pnpm --filter @coredrill/ui typecheck`  | Passed with no TypeScript errors                                                                                                                                                                |
| `pnpm --filter @coredrill/ui lint`       | Passed with no ESLint warnings or errors                                                                                                                                                        |
| Focused `job-workspace-content.test.tsx` | Passed 1 file and 5 component/contract tests                                                                                                                                                    |
| `pnpm check:foundation-records`          | Passed 49 direct dependencies, 3 toolchains, 16 execution targets, and all 10 accessibility records                                                                                             |
| `pnpm verify`                            | Passed the complete local gate, including 59 unit files/537 tests, coverage, 22 builds, 59 application-shell cases, browser/native storage, contracts, licenses, secrets, and dependency audits |

The previously retained UI-foundation suite adds deterministic contrast,
visible-focus, icon semantics, forced-colors, reduced-motion, and local-only
light/dark catalog evidence. The document-editor smoke adds named textbox,
multiline description, keyboard heading/undo, language, semantic export, and
rendered-output review evidence. Neither is represented as a screen-reader
journey.

## Hosted exact-browser proof

[Foundation CI run 33302060045](https://github.com/seabAu/Coredrill/actions/runs/33302060045)
binds implementation commit
`c42eacb35cfe5c304df1053a8de8a738ab2f70aa` to both exact accepted Chrome
generations. Each job executed the complete 59-case application-shell suite,
including the route, appearance, reflow, responsive, keyboard-supporting, and
axe checks described above.

| Browser                 | Hosted job                                                                                      | Retained application-shell artifact                                                                                                                                                     | Result |
| ----------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Chrome `151.0.7922.138` | [job 99231976036](https://github.com/seabAu/Coredrill/actions/runs/33302060045/job/99231976036) | `coredrill-app-shell-chrome-151.0.7922.138-c42eacb35cfe5c304df1053a8de8a738ab2f70aa`, artifact `9729311095`, SHA-256 `9f34c458c15d8ea28db131a83a28f2e374a31f7908586d0a335aa99062fba9a7` | Passed |
| Chrome `152.0.7977.54`  | [job 99231975873](https://github.com/seabAu/Coredrill/actions/runs/33302060045/job/99231975873) | `coredrill-app-shell-chrome-152.0.7977.54-c42eacb35cfe5c304df1053a8de8a738ab2f70aa`, artifact `9729313926`, SHA-256 `dc28fa450ddb29a313c782ac90ff024e003e05a82c23d32a84de9bd6f3359f53`  | Passed |

The exact-browser jobs are the accessibility automation authority. The wider
workflow completed successfully across its aggregate, exact Chrome/Firefox,
Windows, macOS, Ubuntu, extension, and full-history secret-scan jobs. Those
additional lanes do not substitute for the unavailable interactive assistive-
technology sessions.

## Manual matrix blockers

| Required case           | Accepted target                                          | Workspace status                        | Required next action                                                                                                                               |
| ----------------------- | -------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `A11Y-KEYBOARD`         | Manual keyboard-only canonical journey                   | Not retained                            | Execute the full journey without pointer input; record focus order, visible focus, traps, errors, dialogs, shortcuts, non-drag moves, and recovery |
| `A11Y-NVDA-EDGE`        | NVDA 2026.1.1 plus current Edge/Chromium on `HW-WIN-REF` | NVDA absent; target planned/unavailable | Provision the target and retain the exact NVDA/browser versions and journey results                                                                |
| `A11Y-NVDA-FF`          | NVDA 2026.1.1 plus current Firefox on `HW-WIN-REF`       | NVDA absent; target planned/unavailable | Run the same retained smoke/canonical matrix in Firefox                                                                                            |
| `A11Y-VOICEOVER-SAFARI` | VoiceOver with Safari 26.6.1 on `HW-MAC-REF`             | Physical target unavailable             | Provision the recorded Mac/Safari target and retain VoiceOver results                                                                              |
| `A11Y-IOS-VOICEOVER`    | Installed PWA on `HW-IOS-REF`                            | Physical target unavailable             | Run navigation, editing, offline, and share/import journeys with iOS VoiceOver                                                                     |
| `A11Y-ANDROID-TALKBACK` | Installed PWA on `HW-ANDROID-REF`                        | Physical target unavailable             | Run the same journeys and record the exact Android Accessibility Suite/TalkBack version                                                            |
| `A11Y-DISPLAY`          | Windows/manual display matrix                            | Partial automation only                 | Retain screen-magnification and browser text-resize-to-200% review in addition to the passing forced-colors/reduced-motion evidence                |

The current local host is `HW-LOCAL-DIAG` on Windows 10 and is not substituted
for `HW-WIN-REF`. The hosted macOS package lane does not expose an interactive
VoiceOver/Safari session, and the hosted Linux lane is not a replacement for any
accepted assistive-technology target.

## Handoff

Keep `Q1-003`, `A11Y-002` through `A11Y-006`, and the incomplete reference cases
open until their exact manual evidence exists. The independent `Q1-004` threat
review can proceed without weakening or hiding these accessibility blockers.
