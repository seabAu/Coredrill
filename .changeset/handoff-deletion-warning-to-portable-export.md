---
"@coredrill/web": patch
"@coredrill/ui": patch
"@coredrill/desktop": patch
---

Hand off deletion warnings to existing owned portable-export controls with safe focus restoration. Retire the destructive preview without implicit consent, preparation, saving or deletion, preserve prepared bytes, and block deletion controls while another vault/export operation is pending.

Reject unreviewed native storage operation/value fields so mixed vault requests cannot be interpreted as database operations. The diagnostic probe routes only read-only native deletion previews; shipped permissions and valid protocol requests are unchanged.
