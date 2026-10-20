# Normal stored Overview and Company — verification

Date: 2026-10-19. This is core workspace integration, not closure of a milestone gate.

## Scope

Normal job Overview and Company now read the existing validated `pipeline.workspace` operation on the selected browser/native runtime. Reference-catalog views remain separate. No query contract, schema, dependency, permission or Accepted decision changes.

Overview renders actual normalized job details, optional dates/tags, the next action and its recorded time zone, scheduled-attention counts, recorded-history count and the latest unarchived application with its stored channel/time/notes. Scheduled interviews/reminders are not presented as completed activity. The application is expressly not a complete attempt list or evidence of employer receipt. Company renders the actual linked company, stored website/domain as inert text, notes, and unarchived contact/other-job counts. Counts do not imply verified contacts or currently open employer vacancies.

These remain read-only views. Compensation, job-note editing, normal activity commands, contact/other-role navigation, outcome/salary observations and full Source provenance are still separate work; no successful action or sample relationship substitutes for them.

Root-owned ephemeral read coordination survives side/full-page responsive frame replacement. It prevents overlapping reads, ignores disposed results, rejects wrong-job results, hides previous-job state immediately and preserves previously loaded same-job facts with an explicit stale warning when refresh fails. Unexpected adapter messages are never displayed. Refresh uses the existing ownership-aware focus helper, not unconditional focus theft.

## Local iteration and evidence

- Initial focused tests caught a test-only undeclared domain-package import; fixture brands now use the public DTO types without adding a package dependency. All nine reader/presentation tests pass. Strict typecheck passes all 34 tasks.
- The first browser/native iteration expected manually supplied capture notes to become a normalized description. Inspection confirms those notes remain source input while `job.description_text` is empty; both existing readers agree. The UI now says **Stored job description**, not retained source description. Tests preserve that distinction by checking the actual empty DTO and explicit absence rather than promoting source text into confirmed facts. Hostile normalized text is separately tested at the shared rendering sink.
- Four focused browser/native cases pass, then pass again after precise **unarchived** labels and a strengthened stale-read assertion. The late first-job query is awaited to completion and through animation frames before asserting the second job remains visible. Logs: `test-results/stored-details-focused-second.log` and `test-results/stored-details-final-focused.log` (both terminal 0). Initial failure remains in `test-results/stored-details-focused.log`.
- The new normal-root browser case creates both jobs through manual capture/review UI, not SQL or a fixture installer. It proves actual company identity, no invented normalized description, failed refresh with retained facts, explicit retry and keyboard focus recovery, held-read single flight across 320-pixel reflow, settled cross-job isolation, offline reload, no page errors/external requests and axe zero violations for both views.
- The existing native-root case now reads actual Overview/Company facts through the real Rust SQLite process under the simulated Tauri host, preserving the no-OPFS-fallback assertion. This is not an installed-desktop manual usability claim.
- `stored-details.json` in the resilience report records the actual query witness. `stored-overview-320.png` and `stored-company-320.png` are inspected: wrapped text, named refresh, explicit missing values and read-only boundary text are visible. Full-page sticky-shell compositing is not evidence of manual assistive-technology acceptance.

## Remaining verification

The first aggregate attempt exits 1 at lint: a now-unreachable Company fallback branch, a loose null equality and asynchronous lifetime-flag narrowing. A second attempt still rejects the narrowed lifetime property; both failed logs remain `test-results/stored-details-full-verify.log` and `test-results/stored-details-final-verify.log`. The repair follows the existing Timeline reader's explicit boolean getter across awaits, preserves disposal tests and uses an optional validated due-instant expression. Remaining fallback is Source only. Changed-source lint and all nine focused units then pass without suppressions; final aggregate verification is separate.

Final-source `pnpm verify` exits 0, directly observed with terminal marker `STORED_DETAILS_COMPLETE_VERIFY_EXIT=0` in `test-results/stored-details-complete-verify.log`: 144 unit files / 1,166 tests plus coverage; seven UI foundations, 76 shell, one diagnostic performance, 24 resilience, seven onboarding, 13 document and nine storage cases; native core 14 passed / one intentionally ignored, 14 native adapter cases, secure-store/archive/backup checks; format/type/lint/build, generated/architecture/foundation checks, licenses, secrets, audits and Changesets. npm reports no known vulnerabilities; Cargo retains ten allowed warnings. Source and fixtures remained frozen through this successful run. Clean-commit hosted verification remains. Keep independent human/reference-device and release gates open.

The predecessor unseeded canonical proof is pushed at `986e2528618d71252c849cddc88927c137e8a420`. Its [run 39344803133](https://github.com/seabAu/Coredrill/actions/runs/39344803133) is terminal **failure**. Both exact Chrome lanes and aggregate fail the explicit manual Partial assertion; extension separately fails a local-server socket request. Logs remain at `test-results/unseeded-hosted-{chrome151,chrome152,aggregate,extension}-failure.log`. That checkpoint lacked pending/readback ordering. The subsequent [ordering repair](requirement-review-ordering-verification.md) preserves all assertions and passes fresh hosted verification; the old failure is not rewritten.

## Hosted checkpoint

Overview/Company commit `a11dd0f` is included unchanged in clean commit `9ffc13e1f0ecc3300f597f4b92769e544b9047c7`, which passes every required job in [run 39348202319](https://github.com/seabAu/Coredrill/actions/runs/39348202319), including the normal browser/native detail cases and exact Chrome/Firefox, extension, aggregate and Windows/macOS/Ubuntu lanes. This closes hosted verification of this read-only composition, not the remaining writable activity/Company/Source/recovery workflows or manual gates.
