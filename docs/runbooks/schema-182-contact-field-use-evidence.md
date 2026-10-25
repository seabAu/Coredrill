# Schema182 — independent contact field-use evidence

Status: implementation and focused Node SQL/export proof in progress. Not a
release, full recovery or normal review-UI completion claim.

## Purpose and compatibility

New migrations168–182 add `contact_source_snapshot`,
`contact_source_use_policy` and `contact_field_use_review`, their guards and
relationship/order indexes. They create no hidden jobs and rewrite no existing
contact values, manual-creation receipts or provenance. All migrations1–167 and
all existing158/159/160/164/165/167 recovery archives remain unchanged.

Only182 is the complete new export milestone.168–181 are intermediate states,
not portable-export/restore support promises. The version1 human-readable writer
retains every prior supported milestone including167, and adds the three new
datasets at182 for61 datasets/122 paired JSON/CSV files. SQLite remains the
lossless restore member. Root `vault.schema_version` may retain an older stamp
until ordinary explicit OpenVault updates operational metadata; the migration
ledger and SQLite `user_version` determine source-schema selection.

## Upgrade procedure

1. Keep a verified complete portable backup before upgrading a real vault.
2. Use the ordinary reviewed migration loader and pinned supported runtime;
   verify the entire historical ledger/checksum prefix first.
3. Apply all new SQL, ledger rows and `user_version` changes in one transaction.
   Never apply only a prefix, lower the version, or edit historical SQL.
4. Compare all prior canonical data and ledger identities. Legacy values stay
   unclassified: no manual/public/licensed origin is invented by migration.
5. Verify all61 current datasets, literal UTF-8 source/permission/review evidence
   and existing attachments in a separately named current182 recovery fixture.
   Preserve all six old fixture pairs and prove old/current browser/native
   restore/reopen before treating the milestone as recovery-proven.

## Retention and lifecycle

Sources are immutable literal UTF-8 evidence. Stored permission reviews describe
explicit user review of manually supplied material with retained terms spans;
they are not legal verification, network connector approval or permission to
send. Policy renewal uses a new identity. The only policy update is one-way
disable with retained evidence and a monotonic row version.

Field reviews retain the exact value hash, literal source span, policy identity,
explicit purpose, review deadline and expiry. An explicit per-field revision
orders reviews independently of clocks/UUID ordering. The only review update is
one-way revocation. Revocation/change/expiry cannot resurrect an older review;
a deliberate fresh reviewed record is needed. Expiry withholds basis and never
deletes a contact or overwrites user-confirmed data.

Detached field-review deletion rejects while its contact exists. Whole-contact
deletion cascades owned reviews; shared source/permission evidence and recorded
free-text history remain. Deletion UI/reconciliation must include this new
owned data before the complete feature is shipped. Complete vault deletion
still removes the local database, not copies in external archives.

## Failure and recovery

Every migration-publication failure must roll back new tables/triggers/indexes,
ledger and schema to the exact prior state. Failed review writes must preserve
all existing canonical data. Older clients reject the new schema instead of
downgrading. Use the normal validated archive inspector, explicit conflict
review and transactional replacement for recovery; never reuse the older
database-only privileged operation as a full-archive substitute.

## Required outstanding proof

Strict commands and an actual SQLite port now have focused Node proof for
independent byte/value hashing, sole viewed-vault/version/latest-review guards,
exact acknowledgement, redacted errors and observational uncertainty handling.
Normal deletion checks owned-review residuals. The identical v21/41 production
contract passes Node, Chromium, installed Playwright Firefox and real confined
native SQLite; this is selected contract execution, not the complete native
suite, exact supported Firefox release matrix or normal-UI completion.
Current182 fixture generation and no-update replay pass7 browser cases each;
complete native storage passes23 tests and normal160/164/165/167/182 browser/
real-Rust restore/reopen passes10 journeys. The separate182 fixture retains all
prior canonical data/attachments and contains nonempty permission/value evidence
and lifecycle states. Compare the [exact scope and retained failures](../proof/contact-field-use-persistence.md#schema182-fixture-restore-and-reopen-results).
Complete final-source verification and exact hosted proof remain required.
Normal explicit source-use/field review/revocation controls and their
offline/reload/privacy/accessibility/lifetime journeys remain subsequent work.
