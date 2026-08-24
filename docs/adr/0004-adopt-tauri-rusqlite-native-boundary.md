# ADR-0004 — Adopt the Tauri/rusqlite native boundary

- **Status:** Accepted
- **Date:** 2026-08-24
- **Owners:** Project owner
- **Decision register IDs:** `D-022`, `D-024`, `Q-003`
- **Checklist IDs:** `NAT-001` through `NAT-008`

## Problem and evidence

D-022 provisionally selected Tauri 2, while Q-003 left the native SQLite adapter open between Tauri's official SQL plugin and a narrow first-party `rusqlite` command layer. The decision required shared migration/transaction behavior, app-data and attachment confinement, operating-system secure storage, recoverable export/restore, real installable packages, resource diagnostics, and cross-platform evidence.

`NAT-001` through `NAT-007` proved the Windows path: one capability-gated Tauri shell over the shared Vite frontend; strict versioned native database, secret, and archive commands; the shared callback-transaction and migration/repository suites against bundled native SQLite; canonical app-data paths; content-addressed attachments; Windows Credential Manager; picker-owned checksummed database recovery with atomic replacement and rollback; and an isolated current-user NSIS install/launch/uninstall lifecycle with startup and process-tree memory diagnostics.

`NAT-008` added exact target-confined providers for the macOS login Keychain and FreeDesktop Secret Service. On commit `a1cafce553750820afebd6a01c1079110280e818`, [Foundation CI run 32743465914](https://github.com/seabAu/Coredrill/actions/runs/32743465914) passed the aggregate repository gate, all exact browser lanes, full-history secret scanning, the Windows package regression, and real macOS 26 ARM64 and Ubuntu 26.04 x64 native jobs. Both new targets passed the shared native SQLite contracts, a redacted store/retrieve-inside-Rust/delete lifecycle, full production-boundary lint, package construction, probe exclusion, and a five-second launch from the retained package.

The dependency review is not equally favorable on every target. The 499-package Cargo lockfile has zero known vulnerabilities, but RustSec reports 14 unmaintained transitive packages plus `RUSTSEC-2024-0429` unsoundness in `glib 0.18.5`. Windows and macOS do not compile that GTK3 path. Linux does.

## Constraints

- The baseline remains accountless, local-first, offline-capable, and useful with AI disabled.
- SQLite remains durable truth in every supported full app mode, with one reviewed migration and repository model across browser and native adapters.
- TypeScript owns shared application/domain code. Rust remains a thin, versioned privileged boundary and does not become a second application layer.
- No generic SQL, filesystem, dialog, shell, network, or secret-read interface may cross the WebView boundary.
- Provider secrets must use the operating system's secure store or fail closed. There is no plaintext fallback.
- A package diagnostic is not signing, notarization, updater, clean-machine, reference-hardware, or public-release acceptance.
- A known unsound compiled dependency is not silently accepted into a public support promise merely because a synthetic package launches.

## Options considered

1. Accept Tauri plus the narrow `rusqlite` layer for Windows, macOS, and Linux immediately. This maximizes nominal platform breadth but turns a known Linux GTK3 unsoundness advisory into an undocumented release risk.
2. Accept Tauri plus `rusqlite` for continued Windows/macOS implementation, keep Linux package and secure-store execution as diagnostic CI, and direct Linux users to the already-supported local-first browser app until the native graph is safe.
3. Replace the first-party database command with Tauri's official SQL plugin. It provides less control over callback transactions, backup/recovery, request limits, and the exact privileged surface without resolving the GTK shell risk.
4. Replace Tauri with Electron. No blocking system-WebView or package defect was observed, and the larger Chromium/Node boundary would not solve the proven requirements more narrowly.
5. Drop the native shell and retain only the local web kit. This remains a fallback, but it discards the proven OS secure-store, native recovery, and installer capabilities without evidence of necessity.

## Decision and rationale

Adopt option 2.

D-022 is Accepted as the desktop implementation architecture: pinned Tauri 2 packages the shared frontend, and Rust exposes only the reviewed native database, provider-secret, and recovery commands. This acceptance selects the architecture for continued product work; it does not claim that any current Phase 0 artifact is ready for public distribution.

Q-003 is resolved in favor of the narrow first-party `rusqlite 0.40.1` adapter. It preserves shared callback transactions and migrations, bundled SQLite, bound values, connection/session ownership, online backup, recovery control, explicit limits, and the smallest proven IPC surface. The official SQL plugin is not selected.

D-024 remains Accepted without semantic change. The browser uses official SQLite WASM/OPFS, and accepted Windows/macOS native targets use bundled native SQLite through the same repositories and migrations.

Windows and macOS are accepted implementation targets. Their current unsigned or ad-hoc-signed packages remain diagnostics until the separate signing, updater/rollback, release provenance, clean-machine, and reference-hardware gates pass.

Linux native code remains buildable and continuously diagnostic: Ubuntu 26.04 proves the same database contract, FreeDesktop Secret Service lifecycle, AppImage build, extraction inspection, and launch. Public Linux desktop support is nevertheless deferred because its compiled Tauri/Wry GTK3 graph contains the unresolved `glib 0.18.5` unsoundness advisory and 14 maintenance warnings. The supported Linux fallback is the accountless browser app on an evidence-backed Chromium-family or Firefox desktop generation, with portable export/restore. The diagnostic AppImage must not be presented as a supported release.

## Consequences and migration

No SQLite schema, portable archive, capture contract, or user-data migration changes. The native protocols remain internal and versioned.

Desktop implementation may now proceed against one stable `DatabasePort` adapter instead of carrying the official SQL plugin as a live alternative. Platform-specific Tauri configuration overlays keep Windows NSIS, macOS app, and diagnostic Linux AppImage formats separate. Exact secure-store crates remain target-confined, so one OS does not compile or initialize another OS's provider.

The CI cost increases because macOS and Linux compile and execute the real native boundary. This is intentional risk evidence. Package artifacts expire after 30 days; redacted manifests and durable proof remain in the repository.

Linux users do not receive a native release promise at this gate. This is a narrower support surface, but it is honest and does not remove the complete local-first browser mode.

## Security, privacy, and source-policy impact

The decision adds no account, hosted database, telemetry, source connector, scraper, AI/provider call, or user-content fixture. All lifecycle values are synthetic. The proof harness captures subprocess output and fails if the synthetic secret appears.

Provider-secret IPC exposes store/status/delete only. Retrieved bytes stay inside Rust and are zeroized before release. Operations are serialized; unavailable or locked OS storage produces a stable content-free error and never falls back to SQLite, configuration, environment variables, or plaintext files.

Package inspection hashes files and link metadata without following package symlinks. Relative links that escape the extracted root are rejected, and the executable's real path must remain inside that root before launch. Normal absolute AppImage system links are counted as explicit host dependencies. The contract-only storage probe is rejected from all retained packages.

No source-policy decision changes.

## Documents, contracts, checklist IDs, and tests to update

- Design/goal/decision-register changes: promote D-022, retain D-024, resolve Q-003, record the Linux fallback/risk, and update runtime, technology, security, application-boundary, and ADR indexes.
- Contracts/migrations: none.
- Checklist IDs: close `NAT-008` only after the sanitized hosted manifests are retained and linked.
- Automated/manual proof: complete local `pnpm verify`; exact Windows/macOS/Linux native CI jobs; redacted secure-store lifecycles; Rust formatting/Clippy/tests; Cargo license/RustSec review; package build, extraction/signature inspection, probe exclusion, five-second launch, and immutable artifacts.

## Revisit trigger

Revisit Linux native support when an exact selected Tauri/Wry release removes or replaces the warned GTK3/`glib 0.18.5` path and the full Ubuntu package/secure-store suite passes again. Revisit Tauri or `rusqlite` if a supported target develops a blocking WebView, updater, signing, recovery, accessibility, or performance defect that cannot be isolated without widening the privileged boundary. Release gates alone do not reopen the architecture unless they reveal such a defect.
