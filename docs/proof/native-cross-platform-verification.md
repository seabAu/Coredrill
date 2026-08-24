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

[Foundation CI run 32743465914](https://github.com/seabAu/Coredrill/actions/runs/32743465914) passed on immutable commit `a1cafce553750820afebd6a01c1079110280e818`:

| Job                                                                                                                 |        Result | Evidence                                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | ------------: | ----------------------------------------------------------------------------------------------------- |
| [Aggregate build/static/tests/policy](https://github.com/seabAu/Coredrill/actions/runs/32743465914/job/97483399190) | Pass in 6m34s | Complete repository gate and retained license reports                                                 |
| [macOS 26 ARM64](https://github.com/seabAu/Coredrill/actions/runs/32743465914/job/97483399597)                      | Pass in 6m21s | Native SQLite, Keychain, lint, app build, ad-hoc signature, probe exclusion, launch, upload           |
| [Ubuntu 26.04 x64](https://github.com/seabAu/Coredrill/actions/runs/32743465914/job/97483399564)                    | Pass in 9m27s | Native SQLite, Secret Service, lint, AppImage, extraction/link proof, probe exclusion, launch, upload |
| [Windows package regression](https://github.com/seabAu/Coredrill/actions/runs/32743465914/job/97483399297)          |   Pass in 12m | Existing app-data, Credential Manager, recovery, NSIS, installed lifecycle, resource measurement      |
| Exact Chrome 152/151 and Firefox 154/153                                                                            |          Pass | Browser SQLite/OPFS lifecycle remained green                                                          |
| Full-history secret scan                                                                                            |          Pass | Checksum-pinned scanner over full repository history                                                  |

Both cross-platform jobs checked out a clean `a1cafce...` worktree and used only synthetic fixture `NAT007-EMPTY-SHELL` with SHA-256 `a81fa89661b5152097084929381742c7121c952422e3a5fd9265b103e32d5e35`.

## Retained package evidence

### macOS diagnostic

- Platform: macOS 26.5.2, ARM64 hosted runner.
- App: `Coredrill.app`, bundle ID `app.coredrill.desktop`, version `0.0.0`.
- Directory content: 13,473,166 bytes, four entries, SHA-256 `8903a4c9e80c4756bfc9426bd72764ce2b8450ab70bd3d1f65e6bc40a9ec96d5`.
- Executable: 13,436,256 bytes, SHA-256 `8b85baaa8d183873d0b2ebbddbcee0f18df5f047c7821fcbd943dab470ac7cbf`; the downloaded retained executable matched this digest.
- Signature: verifiable ad-hoc signature. This is not Developer ID signing or notarization.
- Proof: storage probe excluded; packaged executable remained alive for five seconds.
- Artifact: [`coredrill-macos-app-a1cafce...`](https://github.com/seabAu/Coredrill/actions/runs/32743465914/artifacts/9526336212), 13,476,416-byte archive, digest `sha256:dfcd7e6a98d94b179c77783df8be1c3f414cf7fc4a157c1856bc50f87d82742c`, expires 2026-09-23.

### Linux diagnostic

- Platform: Ubuntu 26.04 LTS, x64 hosted runner.
- AppImage: 84,273,656 bytes, SHA-256 `922370fa6550d777145171b92fb9aeea1f79a9cf7535141a5eab5e7e496a301f`; the downloaded retained AppImage matched this digest.
- Extracted tree: 270,805,647 bytes, 316 entries, SHA-256 `d2a8e52279bae2c901b72d477b11d82f2c167dd63280542292e282d5b5c3e7f6`.
- Links: one absolute system link and 18 relative links; every relative link remained confined.
- Proof: storage probe excluded; extracted `AppRun` realpath remained inside the package and stayed alive for five seconds.
- Artifact: [`coredrill-linux-appimage-a1cafce...`](https://github.com/seabAu/Coredrill/actions/runs/32743465914/artifacts/9526461540), 84,276,163-byte archive, digest `sha256:9d3860fc4d1ffad2f088d6fa4c9c11ad6625eac4c6e7ba55f5b7a95ac35b6e25`, expires 2026-09-23.

The first retained manifests used `uname -a`, which unnecessarily included an ephemeral hosted-runner name. No user or workstation data was involved. The proof harness now records only `uname -srm`; checklist closure waits for the sanitized rerun and durable repository copies.

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
