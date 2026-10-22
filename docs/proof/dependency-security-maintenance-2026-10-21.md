# Dependency security maintenance — 2026-10-21

Status: complete patched local gate, serial extension, final policy and exact ed5d733 hosted verification.

## Exact hosted closure

[Run39689728116](https://github.com/seabAu/Coredrill/actions/runs/39689728116)
is terminal success at `ed5d73332ea397025ae63d53012579486877e575` with every
required job successful; PR-only dependency review skips. Watch73420 is consumed
exit0, `CONTACT_DIRECTORY_COMPANY_FOCUS_HOSTED_EXIT=0`. Inspected retained
aggregate log proves the complete patched gate,2214 passing units plus one
platform skip in both unit/coverage runs,55 resilience cases, actual browser/
native contracts and a final audit with no known npm vulnerabilities. Reviewed
Cargo warnings remain. Exact Chrome/Firefox and all three native lanes succeed.
[Full scoped closure](contact-directory-verification.md#exact-hosted-prerequisite-closure--2026-10-21)
does not prove later uncommitted contact-workspace sources. Earlier live/pending
statements and original failed/interrupted attempts below are historical.

## Exact pushed checkpoint

The reviewed graph is pushed at `ed5d73332ea397025ae63d53012579486877e575`. [Foundation CI39689728116](https://github.com/seabAu/Coredrill/actions/runs/39689728116) is live under watch73420, requiring `CONTACT_DIRECTORY_COMPANY_FOCUS_HOSTED_EXIT` in `contact-directory-company-focus-hosted-watch.log`. No complete hosted pass is claimed; do not supersede its live run or treat the older failed30e51f1 run as patched proof. Only post-push result docs change during this checkpoint; all original failures/interruptions remain preserved.

The resumed company-focus/contact-directory full gate passes functional, coverage, build, browser/native, archive/credential/schema/license and secret checks, then fails npm audit with two moderate findings in existing @vitest/mocker4.1.11. Session8945 is consumed exit1, `CONTACT_DIRECTORY_COMPANY_FOCUS_RESUMED_VERIFY_EXIT=1` in `contact-directory-company-focus-resumed-verify.log`. The preceding39792 attempt is interrupted, not passed. Keep both records; do not suppress or mislabel the findings.

## Official review and bounded selection

- [Manual mock registration advisory](https://github.com/advisories/GHSA-qxg6-89mg-rqv8): unescaped manual-mock module generation via the public interceptor registration is patched in4.1.12. This concerns clients able to reach a development server with that plugin path; it does not establish production-vault compromise.
- [Windows redirect traversal advisory](https://github.com/advisories/GHSA-xp26-3454-mjgp): inconsistent backslash normalization can bypass the redirect path allowlist;4.1.12 backports the fix. The upstream record distinguishes the public interceptor handlers from Vitest Browser Mode.
- The [official4.1.12 release](https://github.com/vitest-dev/vitest/releases/tag/v4.1.12) backports mock hardening. Official npm metadata confirms both vitest4.1.12 and @vitest/coverage-v8 4.1.12 were published October15, beyond the unchanged1440-minute minimum release age. Registry latest is5.0.5; it is not selected. This stays on the existing4.1 maintenance line.
- Both packages are MIT. Vitest accepts Node24 and Vite8, covering pinned Node24.19.0 /Vite8.2.4. Coverage's exact Vitest peer requires matching4.1.12. Root manifests align both direct development pins, with dependent Vitest-family resolutions to be reviewed in the generated lockfile. No product runtime library is added.
- Vitest integrity: `sha512-5eWdz2yb3ajxWF3C8C4TjkXl7FGm3n2E/VlazALrQHzK7nYMSGFnCZto0bbPNl77AwkOZVLk0YnBAejUu0NiWA==`.
- Coverage integrity: `sha512-6S7/iVknKglLAxMFxQGNppBI0iqJS2NgM6FBxavitj7KaDq/vywOWGf6dGu7F2L1Qy0G6S3uTp7aGshHrzK8JA==`.

Current source search finds no direct mockerPlugin/interceptorPlugin/@vitest/mocker registration in apps, packages, tooling or the test config. The Vitest config is unit/coverage-only and does not start a public mocker server. This reduces observed exposure, but does not waive the advisory gate or prove every upstream path unreachable. No real-user exploitation test is performed.

Document10 explicitly leaves compatible library versions open to security review rather than freezing them; prior October20 maintenance applies this rule. This changes no Accepted architecture, library/platform choice, runtime support floor, editor/Temporal pin, source policy, permission or stored schema. No ADR or audit exception is required. Preserve contact/query and focus work plus recovery stash2697.

## Required proof

### Complete local patched gate

Final formatting and existing repository policy pass, session70419 consumed exit0: `CONTACT_DIRECTORY_COMPANY_FOCUS_FINAL_POLICY_EXIT=0` in `contact-directory-company-focus-final-policy.log`. Exact inventory/lock binding, boundaries, licenses and secrets remain clean. Only result documentation follows. Commit/push and separately identified exact hosted proof remain; no earlier failed/interrupted run is relabeled.

Separate serial extension session47635 is consumed exit0: all9 cases pass in29.0s, `CONTACT_DIRECTORY_COMPANY_FOCUS_PATCHED_EXTENSION_EXIT=0` in `contact-directory-company-focus-patched-extension.log`. Only result docs follow complete patched source/lock/inventory verification. Final policy/exact commit/hosted proof remains; earlier live/pending extension statements below are historical.

Fresh whole `pnpm verify` session84988 is consumed exit0, `CONTACT_DIRECTORY_COMPANY_FOCUS_PATCHED_VERIFY_EXIT=0`. Retained `contact-directory-company-focus-patched-verify.log` passes195 unit files /2215 tests in both unit/coverage runs;35 types,22 lint/build tasks;7 UI foundations /76 app-shell /1 performance /55 resilience /7 onboarding /13 document-browser /11 browser-storage /19 native-storage cases;24 Rust-core passes /1 intentional ignore, secure-store/archive/backup/schema/license/secret/advisory/Changesets gates. Final npm audit is clean; Cargo retains10 reviewed allowed warnings. Product tests and policies are unchanged. Separate serial extension47635 is live; require `CONTACT_DIRECTORY_COMPANY_FOCUS_PATCHED_EXTENSION_EXIT`. Only result documentation follows this complete gate; final policy and a new exact commit/hosted run remain.

Earlier live/pending statements below are historical and superseded by this terminal local result. The older8945 audit failure and interrupted39792 remain preserved, not relabeled.

Fresh patched complete verification is live as session84988 / `contact-directory-company-focus-patched-verify.log`, requiring `CONTACT_DIRECTORY_COMPANY_FOCUS_PATCHED_VERIFY_EXIT`. All product source/tests and patched manifest/lock/inventory are frozen. Observe this same handle; older8945 is consumed audit-failure and39792 interrupted, not live. A complete patched/hosted pass is not yet claimed.

Reviewed lockfile diff contains only the two direct pins and nine aligned Vitest-family version/integrity/snapshot changes. Scripts-disabled lock resolution passes `CONTACT_FOCUS_VITEST_SECURITY_LOCK_EXIT=0`. Frozen scripts-disabled install replaces exactly9 packages, `CONTACT_FOCUS_VITEST_SECURITY_INSTALL_EXIT=0`; fresh audit JSON reports zero findings at every severity across937 resolutions /108 optional. Existing license policy passes831 npm records across23 roots and498 Cargo crates. Combined review session19417 is consumed exit0, `CONTACT_FOCUS_VITEST_SECURITY_REVIEW_EXIT=0`. Logs use the matching `contact-focus-vitest-security-*.log` / `*-audit.json` names. Inventory1.31.0 binds the graph to SHA-256 `67b1363c11e00f83dc4cd4c463dfb506d79ae9dab3c688831514661eb064c336`; no policy, override or Accepted decision changed.

Review scripts-disabled lockfile resolution and reject unrelated upgrades; perform a frozen scripts-disabled install, fresh all-severity audit and license review, then bind the reviewed inventory to the actual lock hash/counts. Run complete final-source `pnpm verify`, serial extension and final policy checks on the patched graph. Obtain a new exact commit/hosted run. Earlier local passes and failed30e51f1 CI39665888249 do not prove this graph. Full INT-007 remains open.
