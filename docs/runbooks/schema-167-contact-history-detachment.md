# Schema167 — deleted-contact history detachment

## Purpose and scope

Migration0019 declares contact deletion SET NULL for recorded interaction links;
0044's unconditional update guard prevented that action. Paired166/167 correct
the conflict. They rewrite no existing row and do not expose a deletion UI,
field-use qualification, source acquisition or automatic expiry deletion.

Each migration is one prepared SQL statement:166 drops the old guard and167
creates its replacement. The ordinary migration runner applies both inside one
transaction. Schema166 is an intermediate implementation state, never an export
or restore milestone. Do not run only166 against a user vault or lower a schema
version to enable an older client.

## Preconditions and procedure

1. Use the pinned supported tools and ordinary complete migration loader.
2. Preserve a verified portable archive before upgrading an existing vault.
3. Validate exact source165 integrity and reviewed migration history; older
   supported sources first traverse their unchanged forward migrations.
4. Apply both166/167 transactionally, publishing checksums/ledger/user_version
   only within the same successful transaction. Do not alter migrations1–165.
5. Compare every canonical row and original ledger entry, verify current export
   inventory and run browser/native old/current recovery and normal reopen proof.

## Data and compatibility

Schema167 supports the same58 datasets/116 JSON/CSV files and version1 archives.
Source165 and earlier reviewed export milestones remain supported;166 does not.
Normal restore configuration retains160/164/165 alongside current167, with exact
source identity preserved until deliberate reopen applies ordinary migrations.
The new current fixture must be separately named167; never overwrite158/159/160/
164/165 archives or their records. Creation-time root schema stamps can remain
older until the existing explicit OpenVault operation refreshes operational
metadata; that is not a canonical row rewrite by this guard migration.

A subsequent deliberate contact deletion can detach only its interaction link.
Every other interaction field, including literal summary, occurrence, scheduling,
audit time and row version, stays exact. The contact's own receipt/provenance
links cascade; unrelated contacts and shared job/source evidence remain. The
guard rejects direct unlink/relink and ordinary history edits. This does not
claim erasure of free-text mentions or copies in external archives. Normal
deletion still needs viewed-context confirmation, concurrency/uncertain-state
handling, clear scope and browser/native UI proof; expiry alone cannot delete.

## Failure and recovery

Failure after either trigger-drop or trigger-create publication must restore
the old guard, ledger, schema and readable data. A later failed contact deletion
must restore the parent, receipt, links and all interaction references together.
Keep the original archive and use the reviewed restore preview/confirmation path
when recovery is required. Older clients reject167 rather than downgrading.

## Proof status

Focused actual Node migration and identical Node/browser/native v19/38 contract
proof passes. Current full units/types and failure lineage are recorded in the
[lifecycle proof](../proof/contact-field-use-lifecycle-preflight.md). The separately
named167 fixture now passes generation and no-update replay (six browser cases
each), and complete native recovery passes22 tests including all five preserved
sources and current167. Exact guard SQL, rows, ledger and attachment witnesses
remain asserted. Eight normal old/current browser/native restore/reopens, full
pnpm verify and final policy pass. The first extension Firefox startup failure
is retained; an unchanged repeat passes all nine cases. Ordinary checkpoint and
exact hosted verification remain tracked in that proof. No full INT-007 or
release gate closes on these focused results.
