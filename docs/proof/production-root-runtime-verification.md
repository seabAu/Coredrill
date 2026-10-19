# Production root and host-selected runtime integration

Status: complete local gate and Windows package regression pass; fresh hosted verification pending.

## Scope and implementation

- `/` and the PWA manifest/fallback now open the normal workspace. The explicit storage harness is `/storage-verification.html`; `app-shell.html` remains an alias. Diagnostic tests name their diagnostic entry rather than treating it as the product root.
- Host evidence selects the runtime once. Native opens use `TauriNativeStorageTransport` and native `coredrill.sqlite3`; web retains its existing OPFS database identity. Concurrent opens share one attempt; a failed attempt permits retry but never changes adapters. Explicit browser-only capabilities reject on native.
- Normal document exports use native hash-addressed put/read on desktop and the browser attachment store on web. SQLite remains canonical metadata. No new native command, permission, schema or external dependency version is introduced.
- Native deletion preview/delete bind the actual open session over vault protocol 1. Response identity is validated. Only reviewed native errors become typed application recovery failures. Successful deletion closes/forgets the session; the workspace is hidden and cleanup-pending remains visible instead of being lost to an immediate reload. Browser pending cleanup does not claim native restart recovery.
- An opaque local UI-generation token invalidates stale tabs/pages after deletion. It contains no canonical or private content. Cross-tab invalidation requires available localStorage and remains a separate proof obligation.
- Packaged launch benchmarks now select a confined `startup-diagnostics/` application-data subroot. The normal root auto-opens storage, so retaining the former benchmark root would risk migrating an actual user vault. Normal launches remain unchanged. Diagnostic root tests cover non-mutation of a production sentinel, stable confinement and rejection of an existing non-directory target. These synthetic diagnostics are retained separately; no production data is removed.

## Focused executable evidence

Commands run with the pinned repository toolchain:

```text
pnpm exec vitest run tooling/tests/runtime-database.test.mjs tooling/tests/native-vault-errors.test.mjs tooling/tests/vault-lifecycle.test.mjs packages/storage-native/test/vault-protocol.test.ts
pnpm typecheck
pnpm exec playwright test --config=playwright.resilience.config.mjs e2e/stored-pipeline-navigation.spec.mjs e2e/phase-1-resilience.spec.mjs
pnpm exec playwright test --config=playwright.resilience.config.mjs e2e/native-runtime.spec.mjs e2e/stored-vault-deletion.spec.mjs
```

- 21 focused unit tests pass: host selection/single-flight/failure/retry/close, native session-owned preview/delete, response mismatch, reviewed failure mapping, unknown/lookalike rejection, opaque view-generation invalidation and unavailable-localStorage behavior.
- All 34 typecheck tasks pass.
- Root-entry browser discovery and offline resilience: two tests pass, no unexpected/flaky cases.
- Native root capture/review, normal Pipeline discovery, application preparation, reusable document creation, job-specific copy, DOCX export/retention and reload pass against an actual isolated Rust SQLite process. Downloaded DOCX bytes equal the confined native hash-addressed payload exactly; the companion failure test proves no browser-storage fallback. Browser OPFS, worker, persistence and service-worker calls are forbidden in these tests. Only the Tauri host bridge is simulated: this is **not packaged WebView or installed-app UI proof**. Temporary synthetic files are confined to a unique OS temporary directory, never the user's production vault.
- Two settings-deletion tests pass with an explicitly initialized synthetic vault identity. Actual browser deletion runs; one test substitutes only the returned cleanup status to prove warning presentation. The workspace and private editor disappear, axe reports no violations, and returning to the empty workspace finds no document cards. These tests do not prove production onboarding or actual cleanup failure recovery.

## Remaining proof and product boundaries

- Complete `pnpm verify` exits 0: 134 unit files / 1,067 tests, coverage, all builds, six UI-foundations tests, 76 catalog tests, one diagnostic performance test, 14 resilience journeys, seven onboarding tests, 13 document tests, nine browser-storage tests, 14 real native-adapter tests, and secure-store/archive/backup/policy/license/audit gates. Rust core tests pass 13 with one deliberately ignored platform-secret case; the separate redacted platform-secret harness passes. npm reports no known vulnerabilities; Cargo retains ten reviewed allowed warnings. The final native test path correction was exercised by the native phase and followed by fresh formatting/typecheck (34 tasks) checks.
- Actual `desktop-shell` Clippy with `-D warnings` passes, including the isolated startup-diagnostic root. Fresh hosted CI remains pending at this checkpoint.
- Actual packaged WebView startup/navigation/export behavior is not established by a simulated host bridge.
- Normal writes can currently precede a vault identity; the separate onboarding catalog is transient. Genuine production setup and durable identity/name/health projection must be composed. Normal badges now use a generic Local workspace name and explicit unverified health, never the catalog's invented name or healthy state. No synthetic identity is silently installed by this change.
- Settings backup/restore controls, durable Pipeline mutations, stored job subviews, complete vault search and the fully unseeded Phase 3 journey remain unfinished. `Q3-005` and milestone gates stay open.

## Decisions

No Accepted decision changes; no new ADR. Apache-2.0, local/accountless/offline/AI-disabled operation and source-policy restrictions remain unchanged. The lockfile adds only the existing workspace-native edge to web.

## Windows package regression

`pnpm --filter @coredrill/desktop build:installer:windows` and `pnpm test:native-package` both exit 0. The freshly built NSIS installer is 4,144,429 bytes, SHA-256 `b334afb5b5d9f14e4e2bc04ac3fd54854d3aaf5a94965ab64af08d09f2b47b95`. Five warmups and 20 measured launches report zero failures, page-load p95 569 ms, aggregate working-set p95 390,844,416 bytes and private-byte p95 225,296,384 bytes. Temporary test installations were uninstalled; application data was preserved. The retained diagnostic manifest is `apps/desktop/src-tauri/target/nat007/native-package-proof.json` (ignored, dirty-worktree diagnostic, not a clean release artifact).

Post-run read-only SQLite inspection of the isolated `startup-diagnostics/databases/coredrill.sqlite3` reports `user_version = 158`. The benchmark root is separate from the production database root. The window-title readiness signal remains Tauri `PageLoadEvent.Finished`, not a complete application-ready or workflow signal. These observations are diagnostic, not reference-hardware performance, manual accessibility, signing, public-release acceptance, or full packaged workflow proof.

The first full-gate attempt correctly rejected stale lockfile-bound supply-chain records. Fresh `pnpm check:licenses` passes for 520 packages and 498 crates; `pnpm audit --audit-level=low` reports no known vulnerabilities. Inventory 1.28.1 is rebound to SHA-256 `29dba2a1e56f8c9fac9629c5868e7dc78656a7d150127ac73bb0fc004e15afe8`; the external resolution graph is unchanged. Earlier security-maintenance details remain applicable and are not relabeled as a new version selection.

An intermediate full-gate run reached storage browser tests while source changes were still occurring and failed two evaluations interrupted by navigation. The same three benchmark/lifecycle tests then passed unchanged with optimizer diagnostics, and passed again with the optimizer cache safely moved aside for a cold scan. This does not establish a root cause; no retry, sleep or assertion weakening was added. The subsequent complete gate passed. The original ignored cache is recoverably retained under `apps/web/node_modules/.vite-runtime-proof-backup/`.

Hosted predecessor [39292355776](https://github.com/seabAu/Coredrill/actions/runs/39292355776), commit `0c0fb64`, passed quality/policy, extension, browser and Ubuntu native lanes but failed Windows/macOS on the same new attachment-test assertion. `realpath(file)` was compared to a path built from an uncanonicalized temporary root: macOS `/var` aliases resolve through `/private/var`, while the Windows runner's `RUNNER~1` expands to its long name. The test now canonicalizes only the owned root before constructing the expected shard/leaf path. Exact leaf equality, byte readback, reopen durability, forged-input and corrupt-payload preservation checks remain. Fresh hosted verification of this correction is required.

Follow-up [39296581994](https://github.com/seabAu/Coredrill/actions/runs/39296581994), commit `3f5b313`, confirms all native platform lanes pass with that root correction. Its aggregate and Chrome 152 lanes instead fail the native-host Pipeline reload check. See the separate [document session lifetime repair](native-document-session-lifetime-verification.md) for deterministic orphan-transaction proof and the host-owned repair; the overall hosted gate is not green yet.
