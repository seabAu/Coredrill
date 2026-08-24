# Desktop application

Provisional Tauri 2 composition root for the shared `@coredrill/web` frontend. Rust remains a thin privileged boundary, and D-022 remains Provisional until `NAT-007` and `NAT-008` close installable packaging, resource measurement, cross-platform evidence, and the final adapter decision.

Useful commands:

- `pnpm --filter @coredrill/desktop build:native-probe` builds the no-WebView contract-test process.
- `pnpm test:storage-native` runs the shared database contracts against that real Rust/SQLite process.
- `pnpm --filter @coredrill/desktop test:platform` verifies pinned Tauri app-data resolution on the current desktop platform.
- `pnpm --filter @coredrill/desktop build:desktop` builds the web frontend and a non-bundled desktop executable.
- `pnpm --filter @coredrill/desktop build:installer:windows` builds the Windows current-user NSIS installer.
- `pnpm --filter @coredrill/desktop build:bundle:macos` builds the Phase 0 ad-hoc-signed macOS application bundle on macOS.
- `pnpm --filter @coredrill/desktop build:bundle:linux` builds the Phase 0 diagnostic AppImage on Linux.
- `pnpm test:native-package` silently installs that package into a validated temporary root, measures five discarded warmups plus 20 page-load-complete launches, aggregates the Coredrill/WebView2 process tree, and uninstalls the program without deleting app data.
- `pnpm test:native-platform-package` inspects and smoke-launches an already-built macOS app or Linux AppImage while rejecting any bundled storage probe. It does not confer release acceptance.

The Windows Phase 0 installer is unsigned and uses Tauri's default WebView2 download-bootstrapper mode when a supported system lacks the runtime. The macOS app uses an ad-hoc signature for package-integrity proof only; it is neither Developer ID signed nor notarized. The Linux AppImage is diagnostic while its upstream GTK3 graph carries an unresolved RustSec unsoundness warning. None is a public release. The checked-in icon is a neutral generated build resource, not approved product branding.
