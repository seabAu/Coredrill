---
"@coredrill/application": patch
"@coredrill/ui": patch
"@coredrill/storage-browser": patch
"@coredrill/storage-native": patch
"@coredrill/web": patch
---

Connect local portable archive review and explicit restore confirmation to Settings and clean-start recovery. Bind the viewed vault, exact archive metadata and target fingerprint; retain one root-owned private preview and reject replay or drift. Retire normal-restore storage sessions inside the held queue slot so queued old-vault writes cannot follow replacement. Require local reopening after a commit attempt and never automatically retry uncertain acknowledgements. Existing archive formats, database schema, native permissions and accepted dependency decisions are unchanged.
