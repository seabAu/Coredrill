# Native boundary

This crate contains Coredrill's accepted Tauri shell and narrow native `rusqlite` boundary. The desktop application exposes separate capability-gated commands for database operations, OS secret lifecycle, and recovery archives. Each accepts a strict versioned protocol and keeps database connections behind opaque session identifiers; none exposes general filesystem, shell, network, updater, or arbitrary plugin access.

`coredrill-native-storage-probe` runs the exact same service over JSON Lines for repository-contract proof without requiring a WebView. Its input and values are never logged. The probe uses a caller-supplied temporary app-data root; the Tauri entry point forwards the operating system's application-data directory exactly as resolved by pinned Tauri.

The service canonicalizes separate `databases/`, `attachments/sha256/`, and
per-database `backups/` roots. Attachment paths are lowercase
SHA-256-addressed and sharded; arbitrary attachment and backup paths do not
cross IPC. Picker export/restore remains inside Rust. The same archive command
also creates pickerless timestamped automatic checkpoints through SQLite's
online-backup API, verifies their recovery envelope and temporary SQLite reopen
before rotating older known-good files, and retains extra backups when cleanup
fails. Retention is bounded from one through 90 and never removes the newly
verified last-known-good backup. These database-only artifacts are distinct
from the D-051 portable archive with attachments and human-readable exports.

Provider secrets use one exact, target-confined operating-system backend: Windows Credential Manager, the macOS login Keychain, or FreeDesktop Secret Service. Each lifecycle is serialized; unavailable or locked secure storage fails closed with a stable content-free error, and there is no plaintext fallback. The redacted proof harness retrieves its synthetic value only inside Rust, zeroizes Coredrill-owned buffers, deletes the entry, and emits booleans plus the backend name rather than secret material.

The main window remains hidden until its bundled page finishes loading; the NAT-007 benchmark flag keeps it hidden while exposing readiness only through the native window title. Platform overlay configs restrict Phase 0 packaging to Windows NSIS, a macOS app, and Linux AppImage respectively. The Windows bundle is an unsigned, English, current-user installer with downgrade blocking, includes the Apache-2.0 license, and uses Tauri's `downloadBootstrapper` WebView2 mode. The macOS bundle is ad-hoc signed for proof only. The Linux package is diagnostic while the GTK3 shell graph retains an unresolved RustSec unsoundness warning; the local browser app plus portable export is the supported Linux fallback. [ADR-0004](../../../docs/adr/0004-adopt-tauri-rusqlite-native-boundary.md) accepts this architecture boundary. Public signing/notarization, updater, release provenance, an optional fully offline installer variant, attachment manifest/content operations, clean-machine checks, and reference-hardware performance remain later release gates.
