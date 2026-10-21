---
"@coredrill/web": patch
---

Capture company refresh focus before a pending read disables its control, and restore only after the ready state commits. Preserve read ownership through same-selection invalidation and leave deliberate focus elsewhere unchanged.
