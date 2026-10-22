---
"@coredrill/application": patch
"@coredrill/storage-core": patch
"@coredrill/web": patch
---

Add strict viewed-vault selected-contact read, explicit manual creation and
optimistic notes contracts with transactional SQLite persistence. Schema161–164
adds immutable value-bound manual-creation evidence without classifying legacy
contacts. Schema164 exports58 datasets /116 paired JSON/CSV files; older export
milestones, including schema160, remain supported. Existing methods stay nullable
and are never inferred or promoted to public/licensed basis. Normal contact UI
and source-backed provenance navigation remain separate integration work.

Keep the immediately preceding schema160 archive usable through normal restore
after this schema164 upgrade. Older compatibility is explicit, bounded and copied
before inspection; default callers retain exact-schema rejection. Source schema
identity survives preview and commit, and deliberate reopen applies the reviewed
forward migrations without inventing contact evidence or weakening integrity.
