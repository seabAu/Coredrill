# Native boundary

This crate contains Coredrill's provisional Tauri shell and narrow native SQLite candidate. The desktop application exposes one capability-gated `native_storage_invoke` command. That command accepts a strict versioned protocol and keeps database connections behind opaque session identifiers; it does not expose general filesystem, shell, network, updater, or plugin access.

`coredrill-native-storage-probe` runs the exact same service over JSON Lines for repository-contract proof without requiring a WebView. Its input and values are never logged. The probe uses a caller-supplied temporary app-data root; the Tauri entry point forwards the operating system's application-data directory exactly as resolved by pinned Tauri.

The service canonicalizes separate `databases/` and `attachments/sha256/` roots. Attachment paths are lowercase SHA-256-addressed and sharded; arbitrary attachment paths do not cross IPC. Attachment manifest/content operations, portable export/restore, secure storage, installable bundling, and final adapter acceptance remain later NAT checklist gates.
