---
"@coredrill/ui": patch
"@coredrill/web": patch
---

Restore status-action focus to a connected named context when its row or Board control disappears. Preserve intentional user focus changes during pending operations, and resolve post-render targets lazily so same-title jobs cannot receive another record's focus.
