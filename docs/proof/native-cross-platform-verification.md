# NAT-008 cross-platform native verification

## Outcome

`NAT-008` has the implementation and hosted evidence required for the final native-adapter decision. [ADR-0004](../adr/0004-adopt-tauri-rusqlite-native-boundary.md) accepts the pinned Tauri 2 shell and narrow first-party `rusqlite` layer for continued Windows/macOS implementation, keeps D-024's canonical SQLite semantics unchanged, and resolves Q-003.

Linux database, FreeDesktop Secret Service, AppImage, extraction, and launch diagnostics pass, but public Linux native support remains explicitly deferred. Its compiled Tauri/Wry GTK3 path retains `RUSTSEC-2024-0429` unsoundness in `glib 0.18.5` plus 14 unmaintained-package warnings. The supported Linux fallback is Coredrill's accountless local-first browser mode on an evidence-backed Chromium-family or Firefox generation, with portable export/restore.

This outcome does not claim public distribution readiness. Signing/notarization, updater/rollback, release provenance, clean-machine execution, reference hardware, and public-release documentation remain later gates.

## Reviewed implementation boundary

- Tauri `2.11.3` / CLI `2.11.3` packages the shared Vite frontend behind the existing CSP and exact generated command permissions.
- `rusqlite 0.40.1` with bundled SQLite and online backup remains the only selected native database adapter.
- Platform configuration overlays restrict bundle formats to Windows NSIS, macOS app, and diagnostic Linux AppImage.
- Provider stores are exact and target-confined: `windows-native-keyring-store 1.1.0`, `apple-native-keyring-store 1.0.2` with only `keychain`, and `zbus-secret-service-keyring-store 1.0.1` with only `crypto-rust`.
- Store/status/delete is serialized. Retrieved proof material remains inside Rust, owned buffers are zeroized, errors are content-free, and unavailable storage fails closed.
- The package inspector rejects the native storage probe, hashes package content, rejects escaping relative links, records absolute AppImage system links rather than following them, realpath-confines the launch target, and requires it to remain alive for five seconds.

## Complete local gate

The Windows development host completed `pnpm verify` after the cross-platform implementation:

- formatting, 19 import-boundary policies, dependency/test-matrix records, generated schemas, secrets, license policy, npm audit, Cargo audit, and Changesets passed;
- 25 typecheck tasks and 21 lint/build tasks passed;
- 19 unit files passed 110 tests;
- coverage was 99.02% statements, 95.29% branches, 100% functions, and 99.19% lines;
- four browser-storage E2E tests passed;
- the native storage contract passed nine tests;
- portable Rust library tests passed six tests with the real OS lifecycle ignored outside its redacted harness;
- the Windows Credential Manager harness stored, retrieved only inside Rust, deleted, and emitted no synthetic secret;
- the native recovery proof passed cancellation, corruption rejection, atomic replacement, rollback, and reopen durability.

Focused cross-platform policy gates also passed: all-feature production Clippy, portable all-target test Clippy, shell syntax, native-package unit assertions, 498 resolved Cargo license records, and a RustSec scan of 499 lockfile packages with zero known vulnerabilities.

## Hosted clean-commit proof

[Foundation CI run 32746186411](https://github.com/seabAu/Coredrill/actions/runs/32746186411) passed on immutable commit `0a1c8bd11eacac1a103c3cb1b6a574c1919f8d1d`:

| Job                                                                                                                 |         Result | Evidence                                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | -------------: | ----------------------------------------------------------------------------------------------------- |
| [Aggregate build/static/tests/policy](https://github.com/seabAu/Coredrill/actions/runs/32746186411/job/97492167361) |  Pass in 5m43s | Complete repository gate and retained license reports                                                 |
| [macOS 26 ARM64](https://github.com/seabAu/Coredrill/actions/runs/32746186411/job/97492167565)                      |  Pass in 6m15s | Native SQLite, Keychain, lint, app build, ad-hoc signature, probe exclusion, launch, upload           |
| [Ubuntu 26.04 x64](https://github.com/seabAu/Coredrill/actions/runs/32746186411/job/97492167549)                    |  Pass in 9m43s | Native SQLite, Secret Service, lint, AppImage, extraction/link proof, probe exclusion, launch, upload |
| [Windows package regression](https://github.com/seabAu/Coredrill/actions/runs/32746186411/job/97492167843)          | Pass in 12m14s | Existing app-data, Credential Manager, recovery, NSIS, installed lifecycle, resource measurement      |
| Exact Chrome 152/151 and Firefox 154/153                                                                            |           Pass | Browser SQLite/OPFS lifecycle remained green                                                          |
| Full-history secret scan                                                                                            |           Pass | Checksum-pinned scanner over full repository history                                                  |

Both cross-platform jobs checked out a clean `0a1c8bd...` worktree and used only synthetic fixture `NAT007-EMPTY-SHELL` with SHA-256 `a81fa89661b5152097084929381742c7121c952422e3a5fd9265b103e32d5e35`.

## Retained package evidence

### macOS diagnostic

- Platform: macOS 26.5.2, ARM64 hosted runner.
- App: `Coredrill.app`, bundle ID `app.coredrill.desktop`, version `0.0.0`.
- Directory content: 13,473,166 bytes, four entries, SHA-256 `8903a4c9e80c4756bfc9426bd72764ce2b8450ab70bd3d1f65e6bc40a9ec96d5`.
- Executable: 13,436,256 bytes, SHA-256 `8b85baaa8d183873d0b2ebbddbcee0f18df5f047c7821fcbd943dab470ac7cbf`; the downloaded retained executable matched this digest.
- Signature: verifiable ad-hoc signature. This is not Developer ID signing or notarization.
- Proof: storage probe excluded; packaged executable remained alive for five seconds.
- Artifact: [`coredrill-macos-app-0a1c8bd...`](https://github.com/seabAu/Coredrill/actions/runs/32746186411/artifacts/9527372579), 13,476,242-byte archive, digest `sha256:2e6ccd8b46c7a1cefced0dc59a0407c6e8fe4583b2f448c378924cb23000d367`, expires 2026-09-23.
- Durable raw manifest: [`native-macos-package-hosted-diagnostic.json`](artifacts/native-macos-package-hosted-diagnostic.json), byte-for-byte matched to the downloaded hosted manifest. Its `uname` is limited to `Darwin 25.5.0 arm64`.

### Linux diagnostic

- Platform: Ubuntu 26.04 LTS, x64 hosted runner.
- AppImage: 84,273,656 bytes, SHA-256 `85b318955ae770bd74483bf1ee9c52c2c48a6c86bd1d79a3ed64310fa5809cd7`; the downloaded retained AppImage matched this digest.
- Extracted tree: 270,805,647 bytes, 316 entries, SHA-256 `d2a8e52279bae2c901b72d477b11d82f2c167dd63280542292e282d5b5c3e7f6`.
- Links: one absolute system link and 18 relative links; every relative link remained confined.
- Proof: storage probe excluded; extracted `AppRun` realpath remained inside the package and stayed alive for five seconds.
- Artifact: [`coredrill-linux-appimage-0a1c8bd...`](https://github.com/seabAu/Coredrill/actions/runs/32746186411/artifacts/9527509533), 84,276,087-byte archive, digest `sha256:935ebd917a8e0112994f63ef2f87e04ea0e44ec6542ee92af0ce3091598c3092`, expires 2026-09-23.
- Durable raw manifest: [`native-linux-package-hosted-diagnostic.json`](artifacts/native-linux-package-hosted-diagnostic.json), byte-for-byte matched to the downloaded hosted manifest. Its `uname` is limited to `Linux 7.0.0-1011-azure x86_64`.

The proof harness records `uname -srm`, not `uname -a`; neither durable manifest contains an ephemeral runner hostname, user data, or workstation data. Local SHA-256 checks independently matched the downloaded macOS executable and Linux AppImage to their manifest values. The Windows regression artifact from the same green run is [`coredrill-windows-nsis-0a1c8bd...`](https://github.com/seabAu/Coredrill/actions/runs/32746186411/artifacts/9527606157), a 3,024,493-byte archive with digest `sha256:aa75e5bb12fcf72c6da48c235a605fde1e634a6097afcb79701bc7ca15847d85`.

## Dependency and support decision

`cargo audit --file apps/desktop/src-tauri/Cargo.lock` scanned 499 packages and found zero vulnerabilities. It reported 15 allowed warnings: 14 unmaintained transitive packages and `RUSTSEC-2024-0429` unsoundness in `glib 0.18.5`. That GTK3 path is compiled by Linux, not Windows or macOS.

The green Ubuntu package proves that Coredrill can build and execute there; it does not make the known unsound graph acceptable for public support. Linux remains a continuous diagnostic lane and an explicit unsupported native target. This risk is recorded rather than suppressed.

The official Tauri SQL plugin remains unselected because the first-party `rusqlite` layer is the only candidate that has passed the exact shared callback-transaction, migration, bound-value, recovery, and package boundaries while retaining the narrowest IPC.

## Remaining release gates

- Developer/code signing, macOS notarization, checksums/SBOM/provenance, and updater/rollback rehearsal.
- Windows 11 25H2 on `HW-WIN-REF` and Mac mini M1 reference-hardware performance.
- Clean-machine installation on every declared public target.
- Optional fully offline Windows installer behavior.
- Removal/replacement or explicit future risk decision for the Linux GTK3/`glib` path before Linux native support.
- Full D-051 portable archive with attachments, manifest assembly, and human-readable exports.
