# Schema165 — contact interaction history index

## Summary and trigger

Add `interaction_contact_history_idx(contact_id, occurred_at DESC, id ASC)`
through migration165. The preceding synthetic20,000-row actual-SQL diagnostic
shows an unindexed scan and temporary sort; the candidate eliminates both.
Timings are local diagnostics, not reference-hardware release proof.

## Preconditions

- Use the pinned supported toolchain and the ordinary reviewed migration loader.
- Preserve and verify a portable archive before upgrading an existing vault.
- Source164 is the immediate predecessor; earlier supported sources traverse
  their unchanged reviewed forward migrations first.
- The operation is offline. Index creation needs additional local space;
  there is no new permission, server, credential or external data source.

## Data and compatibility impact

Only an index, migration-ledger entry and SQLite schema-version metadata are
added. No canonical row, contact field, provenance, receipt or attachment is
rewritten. Ordinary later vault opening may refresh its operational root stamp;
that is existing bootstrap behavior, not a canonical rewrite by migration165.
Portable archive/data contracts remain version1, with58 datasets/116 files.
The writer retains schema164 and all earlier reviewed milestones. Normal restore
retains160 and164 sources, validates their exact source schema at commit, and
applies ordinary forward migrations only on deliberate reopen.

Older clients fail closed on165; never drop the index/ledger or lower
`user_version` as a downgrade procedure. JSON/CSV remains the human-readable
escape hatch, and the preserved164 archive remains an older-client recovery
option only when intentionally restoring that earlier snapshot.

## Procedure

1. Validate the source integrity, exact schema and reviewed migration history.
2. Preserve a verified export/recovery checkpoint and sufficient local space.
3. Apply the normal transactional migration runner; it records the exact SQL
   checksum and schema version only in the same successful transaction.
4. Verify index columns/directions, current export inventory and canonical rows.
5. Verify source164 and current165 recovery through both storage adapters.

## Failure and recovery

An index/ledger failure must roll back the new index, ledger and schema version
while preserving the prior readable vault. Do not mark a failed attempt complete
or silently retry writes. Keep the original export and use the reviewed restore
preview/confirmation procedure when recovery is necessary. A corruption failure
must preserve the original input and provide the existing explicit recovery path.

## Proof status

Four actual Node SQLite migration cases now pass, including164→165 row/export/
receipt preservation, index shape/query planning, post-index rollback and
older-runner refusal. The full corrected unit sweep, workspace types/lint,
format and policy checks also pass. Preserved158/159/160/164-source browser
upgrades and the current165 fixture generation and no-update replay pass all
five browser cases. The real-native storage suite passes21 cases, including
all five recovery milestones, with24 Rust cases passing and the existing
secure-store case intentionally ignored. Normal app160/164→165 restore/reopen
also passes in the offline browser and real-native proof host, preserving every
canonical field and source164 receipt. Two added history contracts pass through
the same exact v15/34 manifest on Node/browser/native. Normal history UI passes
15 serial populated browser/native/lifetime executions. Complete final-source
local verification and serial extension pass; new exact hosted verification
remains required. The
[history verification record](../proof/contact-interaction-history-verification.md)
is authoritative for executed results; this runbook is not a completion claim.
