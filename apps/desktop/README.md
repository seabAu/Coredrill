# Desktop application

Provisional Tauri 2 composition root for the shared `@coredrill/web` frontend. Rust remains a thin privileged boundary, and D-022 remains Provisional until `NAT-007` and `NAT-008` close installable packaging, resource measurement, cross-platform evidence, and the final adapter decision.

Useful commands:

- `pnpm --filter @coredrill/desktop build:native-probe` builds the no-WebView contract-test process.
- `pnpm test:storage-native` runs the shared database contracts against that real Rust/SQLite process.
- `pnpm --filter @coredrill/desktop test:platform` verifies pinned Tauri app-data resolution on the current desktop platform.
- `pnpm --filter @coredrill/desktop build:desktop` builds the web frontend and a non-bundled desktop executable.
- `pnpm --filter @coredrill/desktop build:installer:windows` builds the Windows current-user NSIS installer.
- `pnpm test:native-package` silently installs that package into a validated temporary root, measures five discarded warmups plus 20 page-load-complete launches, aggregates the Coredrill/WebView2 process tree, and uninstalls the program without deleting app data.

The Phase 0 installer is unsigned and uses Tauri's default WebView2 download-bootstrapper mode when a supported Windows system lacks the runtime. It is proof, not a public release. The checked-in icon is a neutral generated build resource, not approved product branding.
