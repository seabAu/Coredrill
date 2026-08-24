# Native OS secure-storage verification

- Date: 2026-08-24
- Checklist scope: `NAT-005`
- Runtime target proven locally: Windows x86-64 / Windows Credential Manager
- Exact toolchain: Rust 1.98.0, Tauri 2.11.3, Node.js 24.19.0, pnpm 11.22.0
- Decision changes: none; this implements Accepted D-050 while D-022 remains Provisional and Q-003 remains open through `NAT-008`

## Outcome

Coredrill can store, verify, overwrite, and delete a synthetic provider secret through Windows Credential Manager without returning the secret to the WebView or printing it in the proof process. The privileged API exposes only `store`, `status`, and `delete`; there is intentionally no IPC `get` operation. A future provider adapter must consume a stored credential inside Rust at the moment of an explicitly approved provider call.

The command fails closed with `secure_storage_unavailable` when the reviewed OS backend cannot initialize or complete an operation. It does not fall back to SQLite, repository configuration, `localStorage`, an environment file, or any other plaintext store. macOS/Linux secure-store selection and any encrypted passphrase-backed fallback remain cross-platform acceptance work for `NAT-008`.

## Narrow native contract

The Tauri capability adds one generated permission for one versioned command, `native_secret_invoke`. Its strict tagged request contract accepts:

- `store(providerId, secret)` for a non-empty, bounded secret;
- `status(providerId)`, which reads only inside Rust and returns a boolean;
- `delete(providerId)`, which reports whether an entry existed.

Request IDs and provider IDs are length- and character-bounded, unknown fields are denied, and the three response shapes contain only lifecycle booleans plus the non-sensitive backend label. Platform failures are discarded rather than formatted: callers receive one stable, content-free error code and message.

Secret-bearing Rust strings implement zeroization on drop, including invalid-request and backend-failure paths. Retrieved byte buffers are zeroized before status returns. Windows Credential Manager operations are serialized under one mutex because the reviewed backend warns that same-entry calls from different threads may not sequence reliably. The selected store also clears its Windows API credential buffer; Coredrill does not claim control over copies temporarily owned by the WebView, operating system, or proof-process environment.

## Backend selection

The official Tauri secure-storage/keychain plugin is still a draft pull request, while the Tauri project has stated that Stronghold is no longer its recommended general secret-store path and is planned for deprecation before Tauri 3. Coredrill therefore uses the maintained keyring ecosystem directly behind its existing thin Rust boundary:

- `keyring-core` 1.0.0 supplies the platform-neutral entry contract;
- target-only `windows-native-keyring-store` 1.1.0 supplies Windows Credential Manager;
- its default `search` feature is disabled, so regex/search capability is not linked;
- `zeroize` 1.9.0 clears Coredrill-owned secret allocations.

This is implementation evidence under Provisional D-022, not a new Accepted architecture decision. It preserves Accepted D-050 exactly: desktop provider secrets use OS secure storage, and no unreviewed vault-encryption promise is introduced.

## Redacted integration proof

`tooling/scripts/run-native-secret-proof.mjs` generates a fresh synthetic value at runtime and passes it only to a filtered, ignored-by-default Rust integration test. The harness captures all child stdout/stderr and checks for the exact synthetic value before it can print any child output. If the value appears, the harness emits only a generic failure and withholds the captured stream.

The Rust test uses a unique provider entry, verifies the value retrieved from Windows Credential Manager matches inside Rust, zeroizes the retrieved buffer, deletes the entry, verifies absence, and proves a second delete is idempotent. An RAII cleanup guard deletes the unique entry even if a later assertion fails.

Local result:

```text
cargo test --locked --no-default-features --lib: 5 passed, 1 ignored
pnpm test:secure-storage:
NAT005_SECRET_PROOF {"backend":"windows-credential-manager","stored":true,"retrievedInsideRust":true,"deleted":true,"secretExposed":false}
cargo clippy --locked --all-targets --all-features -- -D warnings: no issues
```

Mock-backend unit tests separately prove response redaction, lifecycle behavior, strict validation, and stable content-free backend errors without touching an OS store.

## Dependency, license, and advisory review

`JW-DI-001` v1.6.0 now validates all nine direct Cargo declarations, including target-specific and development sections, and binds them to Cargo lock SHA-256 `e9178e0b238e62e423f98eeb41d3f1825450e96b753c94b17588e6fe1ae687db`. License policy passes all 422 registry crates. RustSec scans 423 locked packages and reports zero vulnerabilities; the same 14 unmaintained and one GTK/glib unsoundness warning remain explicit Tauri cross-platform risks for `NAT-008`.

The first [NAT-004 hosted candidate run](https://github.com/seabAu/Coredrill/actions/runs/32724526225) passed the complete Windows native/Tauri job but exposed that its Tauri platform-test development dependency was not target-confined, causing the Linux portable gate to attempt a GTK build without system libraries. The manifest now confines that test dependency to Windows, while a new foundation-record test ensures both target dependencies are present in the reviewed inventory.

Implementation commit [`f8c22eb995f09b5226fc3f46313df9b1e82d4b46`](https://github.com/seabAu/Coredrill/commit/f8c22eb995f09b5226fc3f46313df9b1e82d4b46) passed [Foundation CI run 32726880717](https://github.com/seabAu/Coredrill/actions/runs/32726880717) from a clean hosted checkout. The [Windows native/Tauri job](https://github.com/seabAu/Coredrill/actions/runs/32726880717/job/97430061868) proved native SQLite, Tauri app-data resolution, the redacted real-OS secure-storage lifecycle, complete Rust lint, and the release Tauri build. The [Linux quality job](https://github.com/seabAu/Coredrill/actions/runs/32726880717/job/97430062112) passed the complete repository gate and both reviewed license inventories, confirming the Windows-only proof dependency no longer broadens portable compilation. Both pinned browser-version lanes and the full-history secret scan also passed.

## Reproducible verification

| Command                                                | Expected result                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `pnpm --filter @coredrill/desktop test:native-core`    | Five portable unit tests pass; the real OS proof remains ignored         |
| `pnpm test:secure-storage`                             | Real Windows lifecycle passes and emits only the redacted proof manifest |
| `pnpm --filter @coredrill/desktop lint:desktop`        | Complete native/Tauri boundary passes Clippy with warnings denied        |
| `pnpm check:foundation-records`                        | Exact manifest/lock and target-specific Cargo declarations pass          |
| `pnpm check:licenses`                                  | 309 npm records and 422 Cargo records pass policy                        |
| `cargo audit --file apps/desktop/src-tauri/Cargo.lock` | Zero vulnerabilities; 15 reviewed informational warnings                 |

## Sources

- [Tauri secure-storage plugin draft PR #2900](https://github.com/tauri-apps/plugins-workspace/pull/2900)
- [Tauri Stronghold/keychain guidance discussion](https://github.com/orgs/tauri-apps/discussions/7846)
- [keyring ecosystem repository and client guidance](https://github.com/open-source-cooperative/keyring-rs)
- [keyring-core 1.0.0 documentation](https://docs.rs/crate/keyring-core/1.0.0)
- [Windows native keyring store](https://github.com/open-source-cooperative/windows-native-keyring-store)
- [Windows Credential Manager API](https://learn.microsoft.com/en-us/windows/win32/secauthn/credentials-management)
- [zeroize 1.9.0 documentation](https://docs.rs/crate/zeroize/1.9.0)
- [RustSec advisory database](https://rustsec.org/)

## Remaining native slice

- `NAT-007`: installable first-OS artifact with measured size, startup, and memory.
- `NAT-008`: cross-platform secure-store/package evidence and the final D-022/D-024/Q-003 ADR decision.
