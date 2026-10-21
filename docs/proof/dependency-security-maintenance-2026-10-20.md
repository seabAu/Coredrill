# Dependency security maintenance — 2026-10-20

Status: complete local and exact hosted verification at `a5851c1` / run `39536020133`.

The completion prerequisite's initial full gate passed functional, coverage, build, browser/native, recovery, schema, license and secret checks, then failed npm audit with six findings: three advisories affecting both Vite 8.2.2's bundled editor-launch implementation and standalone launch-editor 2.14.1. The failed run is retained as `test-results/task-completion-full-verify.log`, terminal `TASK_COMPLETION_VERIFY_EXIT=1`. It is not called green. Separate nine-case extension proof passed on that older graph and must be rerun after patching.

## Official review and bounded changes

The [Windows existence-check bypass](https://github.com/advisories/GHSA-587h-7wmj-h5pm), [Windows percent escaping](https://github.com/advisories/GHSA-698v-4r3x-3vcv) and [editor argument interpretation](https://github.com/advisories/GHSA-r825-w8mm-5pxw) advisories identify launch-editor 2.14.2 and Vite 8.2.4 as patched versions. The official [Vite release](https://github.com/vitejs/vite/releases/tag/v8.2.4) and [launch-editor release](https://github.com/vitejs/launch-editor/releases/tag/v2.14.2) are dated October 6, beyond the unchanged 24-hour release-age minimum.

Official npm metadata confirms MIT licenses and Vite's Node requirement `^20.19.0 || >=22.12.0`, compatible with pinned Node 24.19.0. Registry latest Vite is 8.3.4, explicitly recorded rather than silently adopted; this repair stays on the existing 8.2 maintenance line. The upstream peer ranges of WXT, its React module, PWA, Tailwind and Vitest include Vite 8; pnpm's reviewed override renders their resolved peer entries as 8.2.4. No new consumer library is introduced.

- Web's exact direct Vite pin moves 8.2.2 → 8.2.4. A selective `vite@8.2.2` override aligns the existing locked consumers.
- A selective `launch-editor@2.14.1` override moves the standalone Changesets path to 2.14.2. Existing shell-quote 1.11.0 override remains.
- Reviewed lockfile diff contains only those two version/integrity changes and dependent peer/snapshot references. Frozen install downloads two patched packages; other added/relinked entries are peer-instance relinks, not unrelated upgrades.
- Vite integrity: `sha512-lfauXnrf2x0p+UoA+wXh0dgFWnUjCyG6Js95KBkgaCwUU9k0DAHI4W6Q0WCx+h+5g+Alce1y4Zi2QjjK0UvGBw==`.
- launch-editor integrity: `sha512-NHJEb30MGBCkmZXLZwz25t37QR4aY03ZzPYUJXOJaOa92uWwExI9SBQUuIznBYc1xkD7cJNGX7oc3Nl3sq2kQQ==`.

Document 10 explicitly leaves library versions subject to compatible security review rather than freezing them. This changes no Accepted frontend/library/platform choice, runtime support floor, source policy, permission, schema or editor decision, so no new ADR or exception is needed. Tiptap remains at accepted 3.30.5; ADR-0009 remains Proposed, and no scheduling converter is installed. The lifecycle work is preserved.

## Current proof

- Scripts-disabled lockfile resolution: `test-results/task-completion-security-lock-review.log`.
- Scripts-disabled frozen install: `test-results/task-completion-security-frozen-install.log`.
- Fresh audit: `test-results/task-completion-security-audit.json`, zero findings at all severities across 935 resolutions, including 108 optional resolutions.
- Existing license policy: `test-results/task-completion-security-licenses.log`, 520 npm and 498 Cargo license records pass.
- Combined review finishes terminal `TASK_COMPLETION_SECURITY_REVIEW_EXIT=0`.
- Inventory v1.29.0 binds the reviewed graph to SHA-256 `5d0075b47fa68055a2fb09b27c3fa1df73ecd3545a7633e39b44727e82289269`.

The audit gate and release-age/peer/license policies are unchanged. Fresh complete verification, extension regression and exact hosted evidence are still required; the preceding task-entry hosted success does not verify this patched graph.

## Final local patched verification

Fresh complete `pnpm verify` passes terminal `TASK_COMPLETION_PATCHED_VERIFY_EXIT=0`, retained in `test-results/task-completion-patched-full-verify.log`: 161 unit files / 1,617 tests plus coverage, 35 typecheck tasks, lint/build, seven UI / 76 shell / one diagnostic performance / 34 resilience / seven onboarding / 13 document / nine browser-storage cases, 14 actual native-adapter cases, Rust core and separate secure-store/archive/recovery/schema/license/secret/advisory/Changesets gates. Final npm audit reports no known vulnerabilities; Cargo retains ten reviewed allowed warnings, not zero warnings.

All nine separate extension cases pass terminal `TASK_COMPLETION_PATCHED_EXTENSION_EXIT=0`, in `test-results/task-completion-patched-extension.log`. This includes the real canonical transfer and Firefox manual fallback on the patched graph. Only documentation changes follow these full/extension gates. Final documentation policy, commit/push and exact hosted observation remain.

Final formatting and existing policy pass terminal `TASK_COMPLETION_POLICY_EXIT=0` in `test-results/task-completion-final-policy.log`; exact inventory/lock binding, boundaries, licenses and secrets are clean. Only result documentation follows. Exact hosted verification remains required after commit/push.

## Exact hosted patched checkpoint

The reviewed graph is pushed at `a5851c1d3a38e80cf982e83c824c18e20b0e55c6`. [Run 39536020133](https://github.com/seabAu/Coredrill/actions/runs/39536020133) is terminal success across every required job. Retained aggregate `119012732668` explicitly passes clean npm audit, all 34 resilience journeys, actual Rust runtime and shared browser repository contracts. Exact Chrome/Firefox, extension, Windows/macOS/diagnostic Ubuntu packages and full-history secret lanes also pass. The old six-finding run remains recorded; no finding was excluded. This closes the security-maintenance checkpoint, not the remaining product/task lifecycle or independent human/manual gates.
