# Native Windows package verification

- Date: 2026-08-24
- Checklist scope: `NAT-007`
- First target packaged: Windows x86-64
- Exact toolchain: Rust 1.98.0, Tauri/CLI 2.11.3, Node.js 24.19.0, pnpm 11.22.0
- Decision changes: none; D-022 remains Provisional, D-024 remains Accepted, and Q-003 remains open through `NAT-008`

## Outcome

Coredrill builds, installs, launches, measures, and uninstalls as a Windows current-user NSIS package from a clean commit. The package contains the shared local-first Vite application and the reviewed Tauri boundary. It does not contain the contract-only `coredrill-native-storage-probe.exe`, add an account/server dependency, grant a new WebView capability, or change an Accepted decision.

The installed shell stays hidden until Tauri reports `PageLoadEvent::Finished`, then exposes the stable native title `Coredrill` as its readiness signal. Normal launches show the window at that point; the exact proof-only argument keeps the benchmark window hidden. The harness performs five discarded warmups followed by 20 measured warm launches, samples the complete Coredrill/WebView2 process tree after readiness, and records raw values plus p50, p95, maximum, and failure count under `JW-TM-001` v1.2.0.

The Phase 0 package is deliberately an unsigned development artifact at version `0.0.0`. It uses Tauri's `downloadBootstrapper` WebView2 mode, so a machine without WebView2 needs network access during installation. Signing, notarization/provenance, updater/rollback, and an optional fully offline installer remain release work.

## Installer and privileged-boundary contract

`tauri.conf.json` enables only the Windows NSIS target for this slice, selects current-user installation, rejects downgrades, includes the Apache-2.0 license, and keeps the existing CSP/capability boundary. The contract-only storage probe now requires the non-default `native-storage-probe` Cargo feature. Normal and installer builds cannot select it accidentally, and both a static policy test and the installed-file proof reject a leaked probe.

The proof harness refuses to run if the ordinary `%LOCALAPPDATA%\Coredrill` installation directory already exists. It creates a GUID-scoped operating-system temporary root, passes that exact root as the NSIS `/D` target, and fails if the installer writes to the default location. Process cleanup verifies the executable path before sending close/kill operations; directory cleanup is confined to the generated prefix. The silent uninstaller must remove the program executable while leaving Tauri's separately rooted app-data directory intact.

Installer and application signatures are inspected with Windows Authenticode and recorded as `NotSigned`, rather than being treated as an implicit success. SHA-256 uses a local streaming implementation so the same harness runs under Windows PowerShell 5.1 and hosted PowerShell 7.

## Clean-commit artifact and benchmark

Implementation commit [`49c920ebd6ad3159a33905aefa3504b34d7f3c02`](https://github.com/seabAu/Coredrill/commit/49c920ebd6ad3159a33905aefa3504b34d7f3c02) produced both manifests from a clean worktree. The checked-in raw evidence is [the local diagnostic manifest](artifacts/native-windows-package-local-diagnostic.json) and [the hosted diagnostic manifest](artifacts/native-windows-package-hosted-diagnostic.json).

| Measurement                                                     |                      Local Windows diagnostic |                     Hosted Windows diagnostic |
| --------------------------------------------------------------- | --------------------------------------------: | --------------------------------------------: |
| OS                                                              |                     Windows 10 Pro 10.0.19045 |     Windows Server 2025 Datacenter 10.0.26100 |
| CPU / logical processors                                        |                  Intel Core Ultra 9 285K / 24 |                             AMD EPYC 7763 / 4 |
| Memory                                                          |                          68,148,977,664 bytes |                          17,178,693,632 bytes |
| WebView2                                                        |                                151.0.4129.101 |                                 151.0.4129.86 |
| NSIS installer                                                  |                               3,012,347 bytes |                               3,017,964 bytes |
| Installed application                                           |                              11,646,464 bytes |                              11,665,920 bytes |
| Startup p50 / p95 / max                                         |                      546.0 / 618.5 / 678.0 ms |                      582.8 / 605.9 / 701.5 ms |
| Aggregate working set p50 / p95 / max                           | 324,526,080 / 328,298,496 / 379,486,208 bytes | 320,827,392 / 322,940,928 / 325,099,520 bytes |
| Aggregate private bytes p50 / p95 / max                         | 174,653,440 / 178,057,216 / 213,663,744 bytes | 115,388,416 / 118,349,824 / 119,136,256 bytes |
| Process count p50 / max                                         |                                         8 / 9 |                                         8 / 8 |
| Measured failures                                               |                                       0 of 20 |                                       0 of 20 |
| Probe excluded / uninstall removed program / app data preserved |                               yes / yes / yes |                               yes / yes / yes |

The local installer SHA-256 is `093f53bc7694d394fc6f6bfe16797307c9c20f43617fcee831342061ec250b21`; its application SHA-256 is `d110a8333714c6587a1527068ba83c65dff60742ba881e42e21d65eac9907a42`. The independently built hosted installer SHA-256 is `e946042a76e9254e6a7ee0f6952d861b034be86f82c839fbafac6b9227373159`; its application SHA-256 is `c6fc11e5a4e63d7aae88e4b0c7c558cfd66e50a08daa9bfbfb33e78516147105`. The different hashes and sizes are recorded honestly; this slice proves a pinned, repeatable build and verification process, not bit-for-bit reproducible Windows binaries.

The hosted first warmup took 14,193.7 ms while the new runner initialized its WebView environment. It is retained in raw evidence and discarded exactly as the reviewed warm-start method requires. All 20 measured hosted launches completed after the remaining warmups and stayed below the current `PERF-WARM` design target of 2,000 ms.

A later hosted extension-proof run exposed the original 15,000 ms first-warmup ceiling as brittle: its Windows package reached the installed-startup step but did not publish the page-load title before that cold-run timeout. The harness now permits 30,000 ms only for the discarded first warmup and records that allowance explicitly. The remaining four warmups and all 20 measured launches retain the 15,000 ms timeout, so this runner-resilience correction does not weaken the warm-start result or release target.

Both targets are marked `targetConformant: false`. They satisfy `NAT-007`'s first-OS artifact-and-recording requirement, but neither substitutes for the required Windows 11 25H2 plus `HW-WIN-REF` release-performance execution. Package signing/offline behavior and the reference-hardware gate therefore remain open release work; no supported-performance claim is made from these diagnostics.

## Hosted verification and retained artifact

[Foundation CI run 32737385492](https://github.com/seabAu/Coredrill/actions/runs/32737385492) completed successfully from the implementation commit. The [Windows native/Tauri job](https://github.com/seabAu/Coredrill/actions/runs/32737385492/job/97463364271) passed native SQLite contracts, Tauri app-data resolution, the redacted Credential Manager lifecycle, picker-owned archive recovery, all-target/all-feature Clippy, the NSIS build, installed measurement lifecycle, and artifact upload. The Linux quality job passed the complete repository gate, and the exact Chrome/Firefox plus full-history secret lanes also passed.

GitHub artifact [`9524224051`](https://github.com/seabAu/Coredrill/actions/runs/32737385492/artifacts/9524224051), named `coredrill-windows-nsis-49c920ebd6ad3159a33905aefa3504b34d7f3c02`, contains the hosted installer and raw manifest. GitHub reports 3,022,649 archive bytes, archive digest `sha256:4f915f431b789a4c89da3eb4f621162ca1d1577c377ed0d31c5ed445c6683657`, creation at 2026-08-24 14:26 UTC, and expiry at 2026-09-23 14:25 UTC. The checked-in hosted manifest preserves the durable measurement record after artifact expiry; the installer itself is intentionally not committed to Git.

## Complete local verification

The complete repository `pnpm verify` gate passed after the packaging changes: 25/25 typecheck tasks, 21/21 lint tasks, 19 unit-test files and 108 tests, 99.02% statements/95.29% branches/100% functions/99.19% lines, 21/21 builds, four browser-storage E2E tests, six passing Rust native tests plus one deliberately ignored real-secret test, nine TypeScript-to-real-Rust storage/path cases, the secure-store and archive proof harnesses, schema drift checks, both license policies, secret scanning, npm/RustSec audits, and Changesets status. The separate all-target/all-feature desktop Clippy gate also passed with warnings denied.

The dependency review remains unchanged: 309 npm packages and 442 registry crates pass license policy; pnpm and RustSec report zero known vulnerabilities. RustSec still reports 14 unmaintained transitive crates and the GTK3-path glib 0.18.5 unsoundness warning. Those cross-platform findings are not suppressed and remain explicit `NAT-008` decision evidence.

## Reproducible verification

| Command                                                    | Expected result                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm --filter @coredrill/desktop build:installer:windows` | Builds the current-user NSIS package without the contract probe                                 |
| `pnpm test:native-package`                                 | Performs isolated install, five warmups, 20 measured launches, resource sampling, and uninstall |
| `pnpm --filter @coredrill/desktop lint:desktop`            | Complete Tauri/package boundary passes Clippy with warnings denied                              |
| `pnpm verify`                                              | Full repository build/test/policy/audit gate passes                                             |

## Sources

- [Tauri Windows installer documentation](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri 2 configuration reference](https://v2.tauri.app/reference/config/)
- [Tauri `PageLoadEvent`](https://docs.rs/tauri/2.11.3/tauri/webview/enum.PageLoadEvent.html)
- [GitHub Actions artifact upload](https://github.com/actions/upload-artifact/releases/tag/v7.0.1)

## Remaining native slice

`NAT-008` must execute macOS/Linux secure-store and package evidence, make the cross-platform support/risk boundary explicit, and record the final D-022/D-024/Q-003 decision through an ADR. Public signing, updater/rollback, and reference-hardware performance remain separate release gates even if the Phase 0 adapter decision is accepted.
