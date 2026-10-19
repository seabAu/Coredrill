---
"@coredrill/storage-native": patch
"@coredrill/desktop": patch
---

Add session-owned, immutable content-addressed attachment writes for native document exports. Native archive IPC advances from version 2 to 3; frontend/backend must update together. Archive file format 1, portable ZIP contracts and SQLite schema remain unchanged. No generic filesystem path or new permission is exposed.
