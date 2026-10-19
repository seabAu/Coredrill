# Native document session lifetime

Status: deterministic focused tests, complete local gate and fresh Windows package regression pass; hosted verification pending.

## Observed failure and boundary

[Hosted run 39296581994](https://github.com/seabAu/Coredrill/actions/runs/39296581994), commit `3f5b313`, failed the real-process native root journey in Chrome 152 and the aggregate gate after page reload: the stored Pipeline did not reappear. All Windows/macOS/Ubuntu native lanes, Chrome 151, both Firefox lanes and extension transfer passed. The failed job did not retain an error-context artifact, so the log alone does not uniquely establish the timeout's cause.

Code inspection exposed a genuine lifecycle gap: the native service retained connections after their WebView document was gone. A document destroyed after Rust BEGIN but before JavaScript COMMIT/ROLLBACK could leave a writer transaction blocking its replacement. The new Rust unit test deterministically demonstrates `sqlite_busy` from that abandoned transaction before retirement; this establishes the mechanism, not a claim that every navigation timeout has this cause.

## Repair

- The privileged host retires sessions on main `PageLoadEvent.Started` and main-window destruction. The existing capability authorizes only the bundled main window, so all current sessions share this owner. Any additional authorized window requires per-owner scoping before enabling it.
- Retirement rolls back active transactions and closes every retired connection. It does not delete databases, attachments, backups, secrets, or committed user records. Session numbering is not reset, so an old token cannot identify a new connection.
- This is a Rust host-lifecycle method, not a shipped IPC operation or new permission. The probe-only binary accepts one exact host-retirement control for integration tests and remains excluded from packages.
- The real-process browser bridge assigns an opaque per-document identity and models host retirement before the next document's first operation. Retired document calls cannot switch ownership back.

## Focused evidence

```text
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --no-default-features --lib retiring_a_document
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --no-default-features --features desktop-shell --lib -- -D warnings
pnpm exec playwright test --config=playwright.resilience.config.mjs e2e/native-runtime.spec.mjs --repeat-each=3
```

The Rust test passes: an abandoned write blocks a second writer, retirement invalidates both old tokens, preserves the committed row and exact attachment bytes, rolls back only the uncommitted row, permits a fresh transaction, and is idempotent. Actual desktop-feature Clippy passes. All six browser cases pass across three repetitions. The journey deliberately withholds a successful Rust BEGIN acknowledgement, reloads the page while that transaction remains active, and then rediscovers the committed job, creates/retains an exact DOCX and survives further reloads without invoking browser storage.

The Tauri host bridge is simulated in this integration test; the backend is the actual Rust process. This does not establish a full installed-app workflow, reference-device performance, manual accessibility or release acceptance. `Q3-005` remains open. No Accepted decision, source policy, dependency, schema or protocol version changes.

## Complete local gate

`pnpm verify` exits 0 on the working tree containing this repair and the independent bootstrap prerequisite: 135 unit files / 1,082 tests, coverage, all browser suites (including 14 resilience journeys), 14 real native-adapter tests, Rust core tests (14 passed plus one intentionally ignored platform-secret case), the separate redacted secure-store harness, archive/backup/recovery, policy/license/secret checks and audits. npm reports no known vulnerabilities; Cargo retains ten reviewed allowed warnings. A repeated unit run retains exact passing counts in ignored `test-results/local-vault-bootstrap-unit.json`. Clean-commit hosted results remain required.

Fresh `pnpm --filter @coredrill/desktop build:installer:windows` and `pnpm test:native-package` both exit 0. The NSIS installer is 4,146,551 bytes, SHA-256 `7b00c0bfe065f7723adb5b312757de9140ec45b313228494408a1efce1040131`. Twenty measured launches report zero failures, page-load p95 527.4 ms and aggregate working-set p95 379,183,104 bytes. Uninstall removes the test installation and preserves application data; benchmarks use the confined diagnostic subroot. The ignored manifest is `apps/desktop/src-tauri/target/nat007/native-package-proof.json`. This dirty-worktree page-load regression is not a full packaged reload/workflow, reference-hardware, signing or release gate.
