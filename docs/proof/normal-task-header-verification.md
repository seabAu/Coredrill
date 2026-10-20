# Canonical task header readback — in progress

Date: 2026-10-20. Independent `INT-004` readback follow-through while ADR-0009 remains Proposed. This does not adopt a converter, implement the task form or complete task lifecycle support.

## Requirements and implementation

- Read the pending task from the validated canonical stored Pipeline snapshot, not the date-only Table projection or a synthetic reference record.
- Render Not set only when the canonical next-action value is null. Unavailable facts remain explicitly unavailable. A pending task with null due instant renders its exact title and Unscheduled, not Not set.
- Scheduled tasks retain the complete title and full UTC instant, including seconds/milliseconds. This is presentation of an already validated instant, not local-clock conversion or an invented IANA zone. The Overview retains the stored zone separately.
- Preserve reference-catalog rendering. Readback must survive offline/reload through browser and actual Rust storage paths.
- Retain all 512 permitted title characters as inert text and wrap long metadata within the header at 320 pixels, without truncation or page overflow.

`storedJobHeaderNextAction` makes the explicit unavailable/null/unscheduled/scheduled projection. The normal shell uses the matching canonical job summary; reference catalog keeps its prior date presentation. Shared metadata definition text now permits wrapping anywhere. No SQL, write, migration, external dependency, network, permission or Accepted decision changes enter this slice.

## Regressions and focused proof

1. The first expanded runtime journey fails because the real scheduled header renders only `Due 2026-11-01T05:30:00.000Z`, losing the stored task title. Retained log: `test-results/task-header-before.log`.
2. After canonical title projection, the 512-character unbroken-title fixture reproduces 320px page overflow. Retained log: `test-results/task-header-with-title.log`. Header metadata wrapping repairs this.
3. Browser readback/reflow then passes, but the shared helper leaves the viewport at 320px, causing the existing later native Table status-edit click to be intercepted by pinned cells. Retained failure: `test-results/task-header-reflow-repair.log`. The helper now restores its captured original viewport after proving the narrow header; the existing Table click and all its assertions remain unchanged. No unrelated product Table defect or fix is inferred.
4. Fresh final focused run passes all three browser/native cases, terminal `TASK_HEADER_FINAL_FOCUSED_EXIT=0`, retained in `test-results/task-header-final-focused.log`. It includes missing-context/stale/caller-link protection, exact UTC/IANA and unscheduled null-pair persistence, reload, undo/replay, the full 512-character inert title, narrow no-overflow and zero scoped axe violations. Normal task-entry UI and installed native WebView behavior are not claimed.
5. Seven presentation unit cases pass, including new unknown/no-task/unscheduled distinctions and exact full title/UTC precision. Strict changed-source lint and all 35 workspace typecheck tasks pass, terminal `TASK_HEADER_TYPECHECK_EXIT=0`, retained in `test-results/task-header-typecheck.log`.

The scheduled narrow screenshot is retained as `task-header-512-320.png` in both browser/native runtime output directories. The browser image was visually inspected: full inert title, full UTC suffix, distinct Overview zone and controls remain reachable with wrapping. Full-page capture composites the existing sticky navigation within the tall image; this is not manual assistive-technology or reference-device acceptance.

## Remaining verification and authority

Complete final-source local verification, separate extension regression and exact clean-commit hosted proof remain. Run `39385695544` verifies predecessor `1554939`, not these current uncommitted header changes. Keep `INT-004` unchecked: real converter, normal form, shared React task feedback/undo and complete normal-user lifetime/failure/reflow journeys remain unfinished. ADR-0009 stays Proposed; goal continuation does not accept it or authorize candidate product installation. No scope reduction to UTC-only scheduling is made by displaying existing instants in UTC.

The predecessor is now terminal hosted success in exact run `39385695544`, with its aggregate task/native witnesses inspected. The current header `pnpm verify` remains live in `test-results/task-header-full-verify.log`; all 160 unit files / 1,593 tests and coverage, 35 typecheck tasks, lint/build, seven UI cases, 76 shell cases and the diagnostic performance case have passed so far. Remaining browser/native/recovery/policy stages are not yet terminal. The predecessor's green result does not verify these header edits.

## Final local verification

The above partial run now finishes with terminal `TASK_HEADER_FULL_VERIFY_EXIT=0`, retained in `test-results/task-header-full-verify.log`: all 160 unit files / 1,593 tests and coverage, 35 typecheck tasks, lint/build, seven UI, 76 shell, one diagnostic performance, 33 resilience, seven onboarding, 13 document and nine browser-storage cases pass. Native adapter's 14 cases, Rust's 14 passed / one intentionally ignored suite, separate secure-store harness, archive/backup/recovery, schema, boundary, inventory, license, secret and Changesets gates pass. npm reports no known vulnerabilities; Cargo retains ten reviewed allowed warnings. Existing bundle/dynamic-import warnings are not performance acceptance.

Only documentation changes follow that final full run. Separate extension regression, final documentation/policy and exact clean-commit hosted proof remain before declaring this independent readback checkpoint verified. `INT-004` normal creation/converter/shared React task feedback and lifecycle work remains incomplete; the full goal and independent human/manual/release gates remain open. ADR-0009 remains Proposed, and the product dependency graph is unchanged.

All nine separate extension cases now pass, terminal `TASK_HEADER_EXTENSION_EXIT=0`, retained in `test-results/task-header-extension.log`. Final whole-repository formatting and policy pass, terminal `TASK_HEADER_POLICY_EXIT=0`, retained in `test-results/task-header-final-policy.log`: 19 package-boundary policies, 51 direct dependencies / three toolchains / 16 execution targets / ten accessibility cases, 520 npm / 498 Cargo licenses and secret scan. `git diff --check` is clean. Only documentation changes follow these terminal results. Exact clean-commit hosted proof remains; no current integration or milestone checkbox is closed by this independent header slice.
