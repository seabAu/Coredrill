---
"@coredrill/web": patch
"@coredrill/storage-native": patch
"@coredrill/desktop": patch
"@coredrill/ui": patch
---

Open the normal workspace at `/`, retaining the storage harness at `/storage-verification.html`. Select native SQLite and immutable native attachments in Tauri with no browser-storage fallback. Compose session-owned native vault deletion through its existing reviewed command, preserve typed recovery failures, and retain deletion/cleanup warnings after hiding the deleted workspace. Browser-only diagnostics and service-worker/persistence operations remain unavailable on native. No dependency version, schema, permission, or Accepted architecture decision changes.

Keep package-launch benchmark storage in a confined `startup-diagnostics/` application-data subroot so loading the real workspace cannot open or migrate a user's production vault. Normal launches retain the platform-resolved production root.
