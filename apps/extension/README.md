# Coredrill Capture extension

This private Phase 0 spike is a WXT Manifest V3 extension with a Chromium side panel and popup fallback. It captures only the active page the user explicitly chooses, validates the result as a versioned Coredrill capture envelope, and stores it in a bounded local outbox.

The production manifest has no host permissions, content scripts, background navigation, account requirement, provider keys, or access to the Coredrill vault. The only requested capabilities are `activeTab`, `scripting`, `storage`, and WXT's generated `sidePanel` permission.
