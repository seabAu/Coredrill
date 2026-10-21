---
"@coredrill/storage-core": patch
"@coredrill/application": patch
"@coredrill/storage-browser": patch
"@coredrill/storage-native": patch
"@coredrill/web": patch
---

Add complete portable-vault archive preparation over the existing data projection and writer. Bind the viewed vault, verify database snapshots before and after assembly, include every retained attachment manifest and reject source drift or missing/corrupt content without saving, retrying or advancing backup reminders.

Add an explicit unencrypted-consent application query with copied operation/vault context, bounded byte and acknowledgement validation, redacted failures and an honest prepared-not-saved result. Saving and normal Settings composition remain separate.

Compose preparation through the host-selected runtime and an optional coordinator-owned query/export read lease. Capture SQLite bytes, complete data projections and migration history together to prevent exact-restore ABA mismatches; check the already-allowlisted SQLite data version for commits on other connections, and expire scoped capabilities after success or failure. Existing native/browser protocols and permissions are unchanged. Normal Settings, saving and restore composition remain unfinished.
