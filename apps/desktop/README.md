# Desktop application

Provisional Tauri 2 composition root for the shared `@coredrill/web` frontend. Rust remains a thin privileged boundary, and D-022 remains Provisional until `NAT-004` through `NAT-008` close the app-data, secure-store, native export/restore, packaging, and platform gates.

Useful commands:

- `pnpm --filter @coredrill/desktop build:native-probe` builds the no-WebView contract-test process.
- `pnpm test:storage-native` runs the shared database contracts against that real Rust/SQLite process.
- `pnpm --filter @coredrill/desktop build:desktop` builds the web frontend and a non-bundled desktop executable.

The checked-in icon is a neutral generated build resource, not approved product branding.
