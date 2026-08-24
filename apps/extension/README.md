# Coredrill Capture extension

This private Phase 0 spike is a WXT Manifest V3 extension with Chromium side-panel and Firefox sidebar builds plus a popup fallback. It captures only the active page the user explicitly chooses, validates the result as a versioned Coredrill capture envelope, and stores it in a bounded local outbox.

Chromium exposes a strict pull/ack boundary only to the Phase 0 `https://app.coredrill.test` origin. Firefox uses explicit checksummed JSON export/import because direct web-page external messaging is not uniformly supported. The app must commit the complete envelope to SQLite before acknowledgement; a lost acknowledgement leaves the outbox item available for an idempotent retry.

Neither production manifest has host permissions, content scripts, background navigation, an account requirement, provider keys, or access to the Coredrill vault. The requested capabilities are `activeTab`, `scripting`, `storage`, and Chromium's WXT-generated `sidePanel` permission. The Firefox manifest declares no data collection.
