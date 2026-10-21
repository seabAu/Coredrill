# Native complete portable archive input verification

Date: 2026-10-21. Checklist: prerequisite of INT-006, which remains open.
Contract: [native portable input v5](../design/coredrill-design-kit/native-portable-read-v5.md).

## Scope

Add complete-ZIP selection without replacing the database. Rust owns the picker and bounded read handle; TypeScript owns inspection and restore policy. One read handle or save stage is allowed globally. Paths never enter shipped requests/results; no permission, dependency, SQLite schema, archive format or Accepted decision changes. Internal frontend/Rust IPC advances together to 5.

The excluded diagnostic host receives a synthetic selected input path through argv, not WebView messages. Existing synthetic recovery fixtures are reused with their recorded provenance; no real vault, document or credential is used.

## Executed proof so far

- `native-portable-read-types-initial.log`: strict types correctly reject the old save test's literal IPC-4 assertion after the version change. The assertion is deliberately advanced to 5, and the old-version test is strengthened with a valid control plus explicit IPC-4 rejection rather than allowing all negative cases to pass for the wrong reason.
- `native-portable-read-rust-initial.log`: initial Rust compilation identifies a missing session-reset initializer and two missing strict dispatcher cases. Both are corrected; explicit session-reset state is added wherever a NativeSession is recreated, with the same feature gates as existing save staging.
- `native-portable-read-rust-compile-fixed.log`: 21 existing Rust core cases pass plus the separately owned ignored secret case. This predates the new file/lifetime tests and is compilation/regression evidence only.
- `native-portable-read-rust-focused.log`: 23 Rust cases pass plus the ignored secret case, including bounded actual-file transfer, exact source/target bytes, cancellation/order/replay, invalid/oversized/changed/truncated/grown input, strict requests/old versions and Unix-only direct-symlink rejection.
- `native-portable-read-rust-lifetime.log`: expanded 24 Rust cases pass plus the ignored secret case, adding cross-session isolation, transaction denial, expiry, close/WebView retirement and save/read mutual exclusion.
- `native-portable-read-transport-focused.log`: three TypeScript files / 38 tests pass, covering new transport/parser negatives and existing save behavior. `native-portable-read-types-fixed.log` passes strict native source/test types at that checkpoint. Later response-envelope strictness and real-process tests still require final-source repetition.
- `native-portable-read-real-process.log`: Rust cases pass, but the new real-process case exceeds Vitest's unchanged five-second default while comparing large byte arrays through per-element deep assertions. No production timeout or success claim is changed.
- `native-portable-read-real-process-fixed.log`: the same exact-content requirement uses byte-for-byte `Buffer.equals` instead of per-element assertion traversal; actual native selection/shared archive inspection/temporary SQLite preview/retirement and unchanged target succeed in 1.64 seconds under the same limit. This targeted run skips 18 unrelated cases, which still need final full repetition.

## Remaining verification and product work

### Final focused checkpoint

All 35 workspace type/build tasks pass in `native-portable-read-final-types.log`. Initial cleanup lint findings (`no-unsafe-finally`, followed by `no-empty-function`) are retained in the workspace/final lint logs and corrected through explicit success/failure cleanup, without disabling rules. `native-portable-read-final-checks.log` then passes all 22 workspace lint tasks, no-feature/all-target and probe Clippy, actual all-feature desktop lib/bin Clippy, and four focused TypeScript files / 57 tests including all 19 actual native-adapter cases; terminal `NATIVE_PORTABLE_READ_FINAL_CHECKS_EXIT=0`. The same five-second native case limit remains unchanged.

The preceding `34d0c44` hosted Windows job `119182356418` fails its existing query/execute/archive-boundary test at 5,015 ms; 17 other native cases pass. The completed job's own API log is retained as `restore-preview-lifetime-hosted-windows-job.log` while the overall run is still active. The normal CLI initially withholds logs until the run ends (`restore-preview-lifetime-hosted-windows-failure.log`). No coordinator defect or root cause is established by that timeout. The existing test retains every assertion and timeout, now adds content-free per-operation timing and finally cleanup to locate any recurrence. This is diagnostic coverage, not a claimed production repair. Full native tests pass locally with these diagnostics; exact hosted verification remains required.

The first full `pnpm verify` run (`native-portable-read-full-verify.log`) passes formatting, boundaries, foundation records, all types/lint and 1,872 units, but the remaining per-element byte assertion in the new large-chunk transport case hits its unchanged five-second default under full-suite contention. Terminal `NATIVE_PORTABLE_READ_VERIFY_EXIT=1` is retained. That assertion is changed to exact `Buffer.equals`, matching the real-process fix without removing a byte or increasing a timeout. All three transport/protocol files / 38 cases pass afterward in `native-portable-read-byte-comparison-fixed.log`. Full final-source verification must be repeated; no success is inferred from a focused repeat.

Full `pnpm verify`, separate extension, final policy and exact committed hosted verification remain pending. No source is committed or pushed for this slice yet. The preceding `34d0c44` hosted run `39588226575` is live and must not be superseded.

The preceding run subsequently ends terminal failure only in Windows, watch `RESTORE_PREVIEW_LIFETIME_HOSTED_EXIT=1`; every other required job, including the aggregate, succeeds. Its aggregate and failed Windows job logs are retained and [the exact outcome](restore-preview-lifetime-verification.md#terminal-hosted-outcome) is recorded without a production root-cause claim. The live-run restriction is now satisfied by authoritative terminal state, not by a timeout. This native-input slice still requires its own exact hosted proof.

### Live final-source full run

The repeated run is live as session 66669, writing `test-results/native-portable-read-final-verify.log` with eventual marker `NATIVE_PORTABLE_READ_FINAL_VERIFY_EXIT`. It passes formatting, boundaries/foundation records, all 35 workspace type/build tasks, all 22 lint tasks, 175 files / 1,873 unit and coverage cases, all 22 builds and seven UI foundation cases so far. Remaining browser/native/recovery/policy/audit gates and terminal full success are not inferred. No production/test source changes follow this launch; only result documentation. Resume the same process, never restart solely on observation timeout. Separate extension runs only after full verification ends.

### Complete local gate

That same process finishes `NATIVE_PORTABLE_READ_FINAL_VERIFY_EXIT=0`: complete `pnpm verify` passes 175 files / 1,873 units and coverage, all 35 workspace type/build tasks, lint/build, seven UI foundations, 76 shell, one diagnostic-only performance case, 41 resilience, seven onboarding, 13 document-browser, all 11 browser-storage and all 19 native-adapter cases. Rust core has 24 passes plus one ignored secret case separately exercised through the redacted harness. Native archive/automatic backup, schema, 520 npm / 498 Cargo licenses, secrets, audits and Changesets checks pass. npm reports no known advisories; Cargo retains ten reviewed allowed warnings.

Final-source normal native tracking/documents pass in 35.7 / 33.8 seconds under unchanged 120-second limits. The complete-archive selection/shared inspection/preview and exact unchanged target case repeats in the actual native suite; the existing archive-boundary case with new stage diagnostics also passes. This is not a production root-cause claim for the earlier hosted timeout. No production/test changes follow full success; only result/status documentation, including the historical v4 contract's pointer to v5 and checkpoint-specific proof. The separate extension suite now runs serially as session 91140 / `native-portable-read-extension.log`. Final policy, commit/push and exact hosted verification remain pending. INT-006 stays open.

All nine separate extension cases subsequently pass serially in `native-portable-read-extension.log`, terminal `NATIVE_PORTABLE_READ_EXTENSION_EXIT=0`. No production/test changes follow. Final formatting/policy and exact committed hosted verification remain required; manual/reference-device/public-release gates remain open.

Final whole-workspace formatting and policy pass `NATIVE_PORTABLE_READ_FINAL_POLICY_EXIT=0` in `native-portable-read-final-policy.log`: 19 import boundaries; 51 dependencies / three toolchains / 16 execution targets / ten accessibility cases; 520 npm / 498 Cargo licenses and secrets. Diff whitespace is clean. Only result documentation follows these checks; no production/test changes follow full verification. Commit/push and exact hosted proof remain required. Internal IPC 5 is the only version change; no dependency, schema, permission, archive file format or Accepted decision changes.

## Pushed checkpoint

Exact `3dacb3e441d68f554bba58d61da0c6035e34103d` is pushed to origin/main from a clean tree. [Run 39592490890](https://github.com/seabAu/Coredrill/actions/runs/39592490890) is confirmed in progress. One watch is retained as session 59339, writing `test-results/native-portable-read-hosted-watch.log` with eventual marker `NATIVE_PORTABLE_READ_HOSTED_EXIT`. Resume the same handle or inspect authoritative external state; observation timeout is not terminal and cannot justify restart or a superseding push. No hosted success is inferred. Normal restore integration and INT-006 remain unfinished.

This is not normal restore UI, clean recovery, installed OS-picker usability, reference-device performance, manual accessibility, a complete native privilege/TOCTOU audit or SEC-003 closure. Root-owned lifetime/single-flight coordination with export/deletion, browser selection, normal Settings/clean startup entry, exact preview/confirmation/commit, and browser/native failure/reflow/reload/exact-content recovery remain required for INT-006.

## Terminal hosted outcome and measured test-harness repair

The same exact run `39592490890` subsequently ends terminal failure (`NATIVE_PORTABLE_READ_HOSTED_EXIT=1` in `native-portable-read-hosted-watch.log`). Windows, macOS, Ubuntu diagnostic, Chrome 151/152, Firefox 153/154, extension and secret jobs pass. Aggregate `119196645440` passes units but its coverage invocation exceeds the unchanged five-second timeout in the new multi-chunk input case. The failed aggregate output is retained in `native-portable-read-hosted-aggregate-failure.log`; this commit is not a hosted-green checkpoint.

Content-free profiling isolates the negated reference matcher `expect(selected.bytes).not.toBe(bytes)`: it spends 1,290 ms traversing the equal-content 1 MiB-plus arrays, while the actual parse/copy samples take tens of milliseconds. The equivalent boolean identity assertion `expect(selected.bytes === bytes).toBe(false)` takes 0 ms, and the unchanged case takes 61 ms (whole selected test 62 ms) in `native-portable-read-identity-assertion-fixed.log`. Before evidence is retained in `native-portable-read-identity-assertion-diagnostic.log`. Temporary timers are removed. Exact content, digest, chunk, independent ownership and five-second timeout requirements remain unchanged; no production parser or timeout change is justified. This uncommitted test-only repair still requires complete local and exact committed hosted verification with the normal restore composition.
