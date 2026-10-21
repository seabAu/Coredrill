# Restore terminal-status follow-up

Scope: finish INT-006 failure status consistently after selection/read/guard failures and uncertain commit acknowledgements. No restore, ownership, confirmation, storage, permission, dependency or schema change. This is a follow-up to pushed `4c9e00e8f71e44b4c6188ea64f4e614810c9a050`, not retroactive proof for that commit. Its exact CI run `39603978984` was observed through the retained watch until terminal failure; it was not superseded while live. The owner separately accepts ADR-0009; the decision record is included without installing its dependency or adopting scheduling behavior in this restore repair.

## Observed failures

`restore-terminal-status-before.log` fails three regressions before the fix: invalid/failed file reads return to idle but still announce Reading; a thrown commit acknowledgement requires reopening but still announces Restoring; and a mutex-denied commit retains its review but still announces Restoring. Busy is already false and no implicit retry occurs, so the continuing-progress messages are inaccurate.

The first real Settings proof (`restore-terminal-status-browser.log`) also exposes that the shared export/deletion mutation guard converts a thrown File read into its generic uncertain-write error before the restore controller can classify it. The test fails honestly. That result is not a reason to claim the restore might have been submitted: file reading precedes preview and commit.

## Repair and focused proof

The bounded local read now catches and redacts its own errors inside the same exclusive callback, returning a known pre-submit failure to the generic guard. The mutex still covers the entire read/preview operation. Completed failures publish a stopped status; a commit refused before entry preserves the exact review and confirmation with an explicit not-submitted status; a thrown acknowledgement after entry publishes the same unconfirmed/reopen/no-automatic-retry status as a returned failure. No underlying write or retry behavior is changed.

`restore-terminal-status-mutex-focused.log` passes all 14 session cases, including a real export/deletion mutex around a failed file read, unexpected native selection/preview exceptions, thrown and denied pre-submit guards, thrown and returned post-submit failures, retained review/confirmation, disposal, no provider/private path disclosure and no implicit retries.

`restore-terminal-status-browser-fixed.log` passes the actual normal Settings journey in 1.6 seconds: a one-shot synthetic File read error produces stopped progress and a redacted no-restore-submitted alert, leaves the file picker usable with no confirmation button, preserves the exact database SHA-256, and permits an explicit fresh valid archive review/discard while preserving that same database hash. The source archive is generated through ordinary export controls from an accountless synthetic workspace.

## Complete local status-fix verification

`restore-terminal-status-final-verify.log` finishes `RESTORE_TERMINAL_STATUS_FINAL_VERIFY_EXIT=0`: 1,917 units and coverage, 35 typechecks, 22 lint/build tasks, seven UI foundations, 76 shell, 46 resilience, seven onboarding, 13 document-browser, 11 browser-storage, 19 native-adapter cases and the remaining Rust/archive/schema/license/secret/audit/Changesets gates. npm reports no known vulnerabilities; Cargo retains ten reviewed allowed warnings. This is before the separate test-only native bridge encoding change, so a fresh complete gate is required for final source.

## Remaining verification

The first final-source bridge/status full run (`restore-status-json-bridge-final-verify.log`) stops at the unrelated existing Windows process-sampler case: its PowerShell subprocess exceeds its unchanged 20-second limit, while 1,916 other units pass. No packaging source or test limit changes. The isolated six-case packaging suite then passes in 14.67 seconds (`restore-native-packaging-timeout-recheck.log`, `RESTORE_NATIVE_PACKAGING_RECHECK_EXIT=0`). Retain the failed full run; the isolated pass does not replace complete verification. The three focused real-native journeys pass with JSON transport, including existing/clean recovery in 38.1 seconds (`restore-native-json-bridge-focused.log`).

Verify the measured test-only native bridge encoding follow-up, then fresh complete `pnpm verify`, serial extension, final formatting/policy, commit/push and its own exact hosted proof. The earlier commit's run has terminated with aggregate/Chrome-151 failure, retained in the normal-restore proof; no result for it proves this follow-up. INT-006 remains unchecked until the complete required proof exists. The overall product goal and owner-dependent research/manual-accessibility/reference-hardware gates remain open. The owner separately accepted ADR-0009 on 2026-10-21; dependency installation and scheduling integration are not part of this restore repair.

## Complete final-source local gate

The unchanged-source repeat finishes `RESTORE_STATUS_JSON_BRIDGE_FINAL_RECHECK_EXIT=0` in `restore-status-json-bridge-final-recheck.log`: 181 unit files / 1,917 tests and coverage, all 35 typechecks, 22 lint/build tasks, seven UI foundations, 76 shell, one diagnostic performance, 46 resilience, seven onboarding, 13 document-browser, 11 browser-storage and 19 native-adapter cases. Rust core passes 24 tests, with its ignored synthetic secure-store case exercised separately; archive/backup/schema, 520 npm / 498 Cargo licenses, secrets, audit and Changesets pass. npm reports no known vulnerabilities; Cargo retains ten reviewed allowed warnings. No reference-hardware or installed-WebView/manual-accessibility acceptance is inferred.

Final native tracking/document-existing-and-clean-recovery journeys pass in 42.6 / 34.6 seconds with unchanged limits, all production protocol validation and exact recovered content/retained bytes. The failed local-read case repeats in 1.8 seconds, preserving database identity and permitting explicit fresh review. Only result documentation follows full success. Separate serial extension, final formatting/policy and exact committed hosted proof remain required; INT-006 remains unchecked.

All nine separate Chromium/Firefox extension regression cases subsequently pass serially in 28.4 seconds, `RESTORE_STATUS_JSON_BRIDGE_EXTENSION_EXIT=0` in `restore-status-json-bridge-extension.log`. No production/test source changes follow either successful gate. Final formatting/policy and exact committed hosted proof remain required.

Final whole-workspace formatting and policy finish `RESTORE_STATUS_JSON_BRIDGE_FINAL_POLICY_EXIT=0`: 19 import boundaries, 51 direct dependencies / three toolchains / 16 execution targets / ten accessibility cases, 520 npm / 498 Cargo licenses and secret scan. `git diff --check` passes. Refreshed origin/main has no intervening commits. Only this terminal-result documentation follows; commit/push and its own exact hosted proof remain. No earlier failed CI run is relabeled successful; INT-006 stays unchecked.
