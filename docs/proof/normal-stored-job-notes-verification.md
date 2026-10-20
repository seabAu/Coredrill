# Normal Timeline local notes — verification

Date: 2026-10-20. Scope: `INT-002`, complete at exact hosted-green `c594637`.
Runtime/storage, normal UI, owned draft lifetime, browser/native/offline journeys,
full local/extension/policy checks and exact hosted witnesses pass. Earlier
checkpoints and failures below remain historical evidence. No milestone or
independent human/manual/release gate closes through this integration item.

## Runtime and storage prerequisite

`createStoredJobNoteApi` exposes only `recordNote`, composed in the selected
browser/native runtime as `jobNotes`. It reuses the validated activity operation
with fixed note type, unknown direction, no contact and operation-owned occurrence
and audit instants. The normal note limit is 2,000 UTF-16 code units, matching the
existing quick-note presentation; empty/blank, oversized, NUL-bearing and invalid
job inputs fail before storage. Exact accepted text, including spacing, newlines,
Unicode and markup-shaped strings, is not trimmed or truncated. Caller-supplied
contact, type, direction and occurrence-time extras cannot change the operation.

The narrow `createDatabaseJobNotePort` checks an existing unarchived job and appends
and reads back the interaction in the same transaction. It cannot schedule or
send anything and does not rewrite the job. Existing append-only SQLite guards
protect recorded note history. This is distinct from future editable job notes.

## Bounded draft coordination prerequisite

The root-ready coordinator owns one session draft, not canonical history. A
different job cannot silently replace it; discard requires its exact owner and
an explicit action. Pending acknowledgement blocks editing, discard and duplicate
submissions. Only a matching acknowledged result clears text. Unknown failures
retain the exact draft with content-free copy advising history refresh before a
manual retry, without automatically resubmitting. Disposal suppresses late UI
publication. This is not an exactly-once guarantee after an ambiguous write outcome.

Normal UI wiring must keep this coordinator alive above responsive frame and tab
replacement, preserve the draft when another job is opened, explain its owner,
offer deliberate discard, warn before unloading unsaved/pending work, and request
canonical history readback after acknowledgement. A readback failure must never
become a second write or erase acknowledged-save state.

## Focused proof and repairs

Final focused run passes 38 tests across runtime, root-ready coordinator and actual
Node SQLite repository tests. Log:
`test-results/stored-job-notes-coordination-focused.log`. The four new SQLite
cases cover active/archived/missing jobs and wrong interaction kind, exact inert
text, job non-mutation and append-only update rejection. Runtime tests cover the
fixed operation shape, limit, pre-storage validation, redaction and echo checks.
Coordinator tests cover bounded ownership, pending single flight, explicit
discard, retained failure text and suppressed disposed acknowledgement.

The first runtime mock targeted a root package specifier rather than the actual
workspace dist module identity; four positive/error-echo cases failed while actual
SQLite cases passed. Change only the mock target, preserving production behavior
and assertions. Failed log: `test-results/stored-job-notes-runtime-focused.log`;
repaired 27-case log: `test-results/stored-job-notes-runtime-focused-repair.log`.
Strict typecheck then caught a test fixture using the manual-new-job port to
represent an archived existing job; use the concrete repository fixture instead,
without widening the manual-create contract. Failed type log:
`test-results/stored-job-notes-typecheck.log`.

Final strict typecheck passes all 35 tasks, log
`test-results/stored-job-notes-coordination-typecheck.log`; changed runtime,
storage and tooling sources pass strict lint without suppressions. Input
validation explicitly accepts unknown data rather than comparing impossible
typed null literals. No schema, external dependency, permission, sending feature
or Accepted decision change.

## Independent Source checkpoint

`INT-001` comparison controls are pushed at
`5a34d29b4b8fdafab7200ec1524b087d186c13f4`. Exact
[Foundation CI 39371142252](https://github.com/seabAu/Coredrill/actions/runs/39371142252)
now passes every required job, terminal success. The [Source controls scope audit
and retained aggregate log](stored-listing-comparison-controls-verification.md#hosted-controls-checkpoint-and-integration-completion)
complete `INT-001`, not these subsequent note changes. Human/manual/reference-device
and publication gates remain open independently.

## Normal UI initial checkpoint

The shared controlled form displays bounded exact text, explicit unsaved-session
and append-only/no-sending boundaries, pending acknowledgement, redacted failure,
distinct acknowledged success and two-step discard. A foreign job's unsaved draft
blocks new entry without mounting that draft's text. Root-owned coordination stays
alive across tabs, workspace close and responsive frame replacement; vault deletion
disposes it. History refresh is queued after acknowledgement and is read-only,
never a repeat note save. Focus restoration remains interaction/owner scoped.

The four focused files pass 43 tests, log
`test-results/stored-job-note-ui-focused.log`, including five presentation cases.
All 35 strict typecheck tasks pass at the final initial UI checkpoint, log
`test-results/stored-job-note-ui-final-typecheck.log`; changed UI/runtime sources
pass strict lint without suppressions after using the existing modern
`preventDefault()` unload pattern and optional-chain cleanup.

The first production run selected only the two native cases because the new
browser spec was not yet registered in the explicit resilience suite manifest;
`test-results/stored-job-note-browser-native.log` is native proof only, not a
browser claim. After registering the spec, all three browser/native cases pass,
terminal `STORED_JOB_NOTE_REGISTERED_EXIT=0`, log
`test-results/stored-job-note-browser-native-registered.log`. Both real browser
OPFS and actual Rust SQLite create the note through normal UI, preserve exact
Unicode/spacing/markup-shaped text in the canonical record, request automatic
history readback, keep the job/application projections unchanged except the
derived last-interaction/count facts, retain the same note identity after reload,
preserve unsaved text across tabs/320px reflow and report zero scoped axe issues
or external requests. Native storage retains zero browser fallback. The small
320px form screenshot was inspected for readable wrapped text and controls; its
sticky-shell overlap at the top is not claimed as full-heading/manual acceptance.

The first expanded lifetime run fails after its one-shot dialog listener observes
the before-unload warning but the subsequent expected draft is empty, log
`test-results/stored-job-note-lifetime-browser-native.log`, terminal
`STORED_JOB_NOTE_LIFETIME_EXIT=1`. Native cases and the existing normal Timeline
case pass in that run. Installed Playwright 1.61.1 `coreBundle.js` shows
`DialogManager.removeDialogHandler` closes open dialogs after the last handler is
removed, and `Dialog._close()` accepts before-unload. A one-shot observer therefore
can remove dialog delivery before asynchronous dismissal completes. The
[official dialog guide](https://playwright.dev/docs/dialogs#beforeunload-dialog)
uses a persistent handler. The repaired test retains that handler until dismissal
and navigation settle and additionally checks unchanged `performance.timeOrigin`;
the original exact-draft assertion is retained. Rerun:
`test-results/stored-job-note-lifetime-dialog-repair.log` also fails: the test still
waited on `page.reload()` for a document load after cancelling that navigation, and
teardown eventually closed the page. This is not a passing repair or evidence of
draft durability. The next test requests an actual `window.location.reload()`
without a wait-for-new-document API; it still handles the real browser warning,
dismisses it, awaits the request, and asserts both unchanged document identity and
the original exact retained text. It passes the full expanded browser journey,
terminal `STORED_JOB_NOTE_RELOAD_REQUEST_EXIT=0`, log
`test-results/stored-job-note-lifetime-reload-request.log`. No product behavior,
assertion or timeout is relaxed for either diagnostic repair.

## Final focused journeys

All four selected production cases pass, terminal
`STORED_JOB_NOTE_FINAL_FOCUSED_EXIT=0`, log
`test-results/stored-job-note-final-focused-journeys.log`: normal browser note
creation/lifetime, both actual-native/unavailable-IPC cases, and the unchanged
normal Timeline history journey. The expanded note test additionally holds an
older actual history result across an acknowledged write: invalidation waits for
that read to drain and then fetches the new note, with exactly one write. It also
proves redacted write failure with retained text and explicit retry, acknowledged
save surviving a failed history read without repeat write, foreign-job draft
retention, two-step discard, responsive held single flight, preserved deliberate
focus, settled late cross-job acknowledgement isolation and exactly one retained
note after reload. Success is always delegated to the actual runtime; no fake
successful write result or seeded job is used.

The final `stored-note-320-full.png` browser screenshot was inspected from the top
of the page: the note heading, boundary copy, labeled input, save acknowledgement,
history refresh and append-only literal note are reachable and wrap readably.
Fixed mobile-shell compositing and font-glyph fallback are not claimed as manual
assistive-technology or installed-WebView acceptance. Complete final-source and
hosted verification remain required before closing `INT-002`.

## Complete local verification

The unchanged final implementation and fixtures pass complete `pnpm verify`,
terminal `STORED_JOB_NOTE_VERIFY_EXIT=0`, log
`test-results/stored-job-note-full-verify.log`. Both unit and coverage pass 157
files / 1,524 tests. All 35 typecheck tasks, lint and builds pass. Browser suites
pass seven UI-foundation, 76 shell, one diagnostic performance, 29 resilience,
seven onboarding, thirteen document and nine browser-storage cases. The full
resilience run explicitly includes every content-free note lifetime witness,
normal note UI, real Rust SQLite and the original status-focus assertions. Native
adapter tests pass fourteen cases; Rust core passes fourteen with one intentionally
ignored environment-specific case. Secure storage, archive/backup recovery,
generated schemas, boundary/foundation, extension build/package, license, secret,
dependency audits and Changesets finish successfully. npm reports no known
vulnerabilities; Cargo retains ten explicitly allowed warnings. This does not
establish a cause or fix for unrelated historical focus failures.

The same final sources and fixtures pass all nine separate extension cases,
terminal `STORED_JOB_NOTE_EXTENSION_EXIT=0`, log
`test-results/stored-job-note-extension.log`. Canonical extension capture/correction,
durable transfer/restart, hostile and oversized input, and checksummed Firefox
manual fallback pass. Only documentation changes follow these passing full runs.

Final whole-repository formatting and boundary/foundation/license/secret policy
checks pass, terminal `STORED_JOB_NOTE_POLICY_EXIT=0`, log
`test-results/stored-job-note-final-policy.log`. `git diff --check` is clean.
Exact clean-commit hosted verification remains pending.

## Hosted failure and responsive recovery follow-up

Exact commit `afeb5548f4e5693c5a66b22ffc5ee1525d3b7bfc` finishes
[run 39374605483](https://github.com/seabAu/Coredrill/actions/runs/39374605483)
with failure in aggregate job `118469809638` and Chrome 151 job `118469809645`.
Both fail the same 320px no-horizontal-overflow assertion after exact note save
and canonical readback. All other required jobs pass. Retained logs are
`test-results/stored-job-note-hosted-aggregate-failure.log` and
`test-results/stored-job-note-chrome151-hosted-failure.log`; synthetic artifact
`12243128224` was downloaded for inspection. This is not hosted completion.

The aggregate error snapshot still shows contextual width controls and the
underlying Table at 320px. Local Edge passes the original journey and added
Arial/monospace metrics. A deterministic suppressed breakpoint notification
reproduces the stranded contextual mode even after tab-driven renders, log
`test-results/stored-note-missed-breakpoint-before.log`, terminal 1. The existing
effect only listened for future changes and did not reconcile current matches
when subscribing. It now reconciles immediately as well. This proves recovery
from that missed-event condition; the exact scheduling of the hosted event loss
is not directly observed, so a fresh hosted result is still required.

The repaired deterministic case, original note/lifetime journey and native
regression pass in the seven-case focused run recorded at
`test-results/workspace-status-note-responsive-focused.log`, terminal
`WORKSPACE_STATUS_NOTE_FOCUSED_EXIT=0`. Content-free geometry witnesses and wider
font checks strengthen the original no-overflow assertion rather than relaxing
it. Full final-source, extension and fresh hosted verification remain.

The final shared status/responsive sources subsequently pass complete
`pnpm verify`, terminal `WORKSPACE_STATUS_FINAL_VERIFY_EXIT=0`, log
`test-results/workspace-status-final-verify.log`, including both note regressions
and all 32 resilience journeys. All nine separate extension cases pass, terminal
`WORKSPACE_STATUS_FINAL_EXTENSION_EXIT=0`. These final-source checks retain the
original note no-overflow assertion, strengthened font/geometry coverage and
the deterministic missed-notification regression. Exact clean-commit hosted
verification is still required; the failed `afeb554` run remains failed.

## `INT-002` scope audit

- Explicit normal Timeline note entry invokes the validated fixed-shape activity
  operation and selected SQLite runtime; no catalog fixture or successful write
  shortcut substitutes for a user action.
- Actual Node SQLite tests prove active/missing/archived scope, append-only guards
  and unchanged job rows. Normal browser and real-native journeys prove exact
  stored text/identity and reload through the shared composition. These are
  distinct proof scopes, not a claim that every negative runs in every adapter.
- One bounded owner-tagged session draft survives tabs, responsive replacement
  and job navigation. Another job cannot replace it or display its private text.
  Discard is explicit and confirmed; real unload cancellation preserves the same
  document and draft. No crash-proof or forced-close durability is claimed.
- Pending acknowledgement blocks overlapping writes/edit/discard. Failures retain
  exact text and redact adapter messages. Matching acknowledgement clears text;
  failed/held history reads are separate and never retry the write automatically.
- Browser lifetime proof covers held older-read invalidation, deliberate focus,
  cross-job late acknowledgement, readback failure, explicit retry/discard, offline
  reload, zero egress, 320px reflow and scoped automated accessibility. Readable
  screenshots were inspected without closing manual/reference-device gates.
- No sending, scheduling, editable-job-note mutation, external dependency, schema,
  archive version, permission or Accepted decision changes. Exact hosted proof remains pending
  before marking this integration item complete.

## Hosted regression-witness follow-up at fbcda1e (2026-10-20)

Exact hosted run `39379112047` fails only its aggregate job: the added missed-breakpoint regression expects a dropped callback on a replaceable application subscription, but observes zero. Both exact Chrome lanes and every other required non-aggregate job pass; the aggregate's other 31 resilience cases, including normal note and header journeys, pass. The failed snapshot shows full-page mode and retained exact note text, so this is not evidence of recurring page overflow. The [prerequisite follow-up](normal-next-action-verification.md#prerequisite-full-checkpoint-and-predecessor-hosted-follow-up) retains raw logs/artifact and records the independent native-transition observer, unchanged draft/layout/overflow assertions and timeout, a passing focused run, and failure at contextual-vs-full-page when immediate production reconciliation is deliberately removed. The production fix is restored. Fresh final-source/hosted proof remains; `INT-002` stays unchecked.

## Exact hosted completion at c594637

Commit `c5946371321e306cae082778a76433064390cfcf` passes every required job in [Foundation CI 39382637084](https://github.com/seabAu/Coredrill/actions/runs/39382637084), terminal success. Aggregate `118495020986` explicitly passes the repaired missed-breakpoint regression, the normal offline note/lifetime journey and real-native runtime note behavior, with all 32 resilience cases green. Retained log: `test-results/next-action-prerequisite-hosted-aggregate-success.log`.

Together with the requirement-by-requirement implementation and local/extension/policy proof above, this closes `INT-002`: bounded exact inert text, owner-only retained drafts, pending single flight, active-job rejection, explicit retry/discard, acknowledged-save/read failure separation, unload cancellation, held older-history invalidation, cross-job/late-result isolation, narrow/keyboard/accessibility and browser/native/reload behavior are covered. The prior two hosted failures remain failures. This does not prove editable job notes, task scheduling, sending, manual assistive-technology/reference-device acceptance, public distribution or any milestone gate.
