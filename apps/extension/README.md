# Coredrill Capture extension

This private Phase 0 spike is a WXT Manifest V3 extension with Chromium side-panel and Firefox sidebar builds plus a popup fallback. It captures only the active page the user explicitly chooses, validates the result as a versioned Coredrill capture envelope, and stores it in a bounded local outbox.

Chromium exposes a strict pull/ack boundary only to the Phase 0 `https://app.coredrill.test` origin. Firefox uses explicit checksummed JSON export/import because direct web-page external messaging is not uniformly supported. The app must commit the complete envelope to SQLite before acknowledgement; a lost acknowledgement leaves the outbox item available for an idempotent retry.

The outbox persists a versioned retry schedule beside the unchanged version-1
capture items. Transfer pulls select the oldest due, non-exhausted item, record
the attempt before offering it, and enforce exponential backoff from five
seconds to five minutes with at most ten automatic attempts. Exact
acknowledgement removes both records. Items otherwise remain available for
export until their capture expiry; the panel warns within 24 hours and reports
disclosed expiry cleanup. Legacy outbox state is migrated in place without
changing the export contract.

Neither production manifest has host permissions, content scripts, background navigation, an account requirement, provider keys, or access to the Coredrill vault. The requested capabilities are `activeTab`, `scripting`, `storage`, and Chromium's WXT-generated `sidePanel` permission. The Firefox manifest declares no data collection.

## Production packages

The root `pnpm build` command emits exact unpacked production directories and store ZIPs for both targets. `pnpm check:extension-build` inspects the unpacked manifests and bundles; `pnpm check:extension-packages` compares each store ZIP to that inspection and verifies the restricted Firefox source-review ZIP.

Run `pnpm test:extension-source-package` for the clean rebuild proof. It extracts the source-review ZIP into a temporary root, installs the pinned dependency graph with a frozen lockfile in offline mode, rebuilds Firefox, and requires the rebuilt production directory, store ZIP, and source ZIP to match the originals byte for byte. Store publishing and credentials are outside these Phase 0 commands.
