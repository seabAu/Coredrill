# Native boundary

This crate contains Coredrill's provisional Tauri shell and narrow native SQLite candidate. The desktop application exposes one capability-gated `native_storage_invoke` command. That command accepts a strict versioned protocol and keeps database connections behind opaque session identifiers; it does not expose general filesystem, shell, network, updater, or plugin access.

`coredrill-native-storage-probe` runs the exact same service over JSON Lines for repository-contract proof without requiring a WebView. Its input and values are never logged. The probe uses a caller-supplied temporary root; the Tauri entry point uses the operating system's application-data directory.

Portable export/restore, secure storage, attachments, installable bundling, and final adapter acceptance are intentionally absent until their later NAT checklist gates pass.
