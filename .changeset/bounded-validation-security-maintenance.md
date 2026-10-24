---
"@coredrill/contracts": patch
"@coredrill/documents": patch
"@coredrill/web": patch
---

Align Zod at the fixed 4.6.6 release and update four vulnerable existing build-tool
transitive dependencies to reviewed compatible fixes. Retain unchanged release-age,
script, advisory and permission policies. No stored schema or accepted technology
choice changes; bounded collection cardinality is rejected before element parsing.
Keep validated JSON values independently owned, reject non-serializable cycles,
and preserve all published standalone JSON Schema artifacts unchanged.
