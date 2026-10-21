---
"@coredrill/application": patch
"@coredrill/storage-native": patch
"@coredrill/desktop": patch
"@coredrill/web": patch
"@coredrill/ui": patch
---

Save complete portable ZIP archives from native Settings through a Rust-owned picker and exact-byte publication/readback. Archive IPC v4 bounds ordered chunks and one session-owned staged archive, rejects identity drift, and releases staging on cancellation, abort and session retirement. No paths or generic filesystem permissions enter the WebView. Shared runtime inspection validates the complete archive before saving, and cancellation/unconfirmed publication cannot invent backup history. Persistent export evidence and normal restore remain separate work.
