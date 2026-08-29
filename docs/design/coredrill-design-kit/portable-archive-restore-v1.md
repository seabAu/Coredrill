# Portable archive restore version 1

## Purpose and authority

This document defines the adapter-neutral restore boundary for the D-051 version-1 portable archive implemented by `BKP-003`. Restore is always a preview followed by an explicit commit. Reading or previewing an archive cannot replace the active vault.

The `database.sqlite3` member is the lossless restore authority. Human-readable JSON/CSV files remain inspectable ownership and migration artifacts; restore validates their recorded bytes but does not reconstruct SQLite state from them.

## Archive inspection

The version-1 reader accepts only an in-memory ZIP within the reviewed 544 MiB container ceiling. Before any storage adapter receives candidate database bytes, it:

1. copies the caller-owned archive bytes and, when supplied, validates the whole-archive SHA-256;
2. rejects unsafe paths, duplicate names, compressed entries, excessive entry counts, entries above 256 MiB, or expanded payload above the 512 MiB writer ceiling plus the bounded manifest;
3. requires `manifest.json` to be the first entry and validates it against the strict version-1 contract;
4. requires the exact manifest-derived entry set with no missing or unrecorded member;
5. enforces canonical `data/` paths and content-addressed attachment paths; and
6. validates every database, data, and attachment byte length and SHA-256.

An unsupported manifest version, unsupported schema, malformed manifest, corrupt ZIP, checksum mismatch, unsafe entry, and oversized archive are distinct stable error codes. Messages contain no archive path or user content.

## Candidate database inspection

After archive inspection, the restore coordinator passes a copied `PortableDatabase` to a non-mutating adapter operation. The adapter must open only temporary candidate state, set `trusted_schema = OFF` where SQLite supports it, and require:

- `PRAGMA integrity_check` equals `ok`;
- `PRAGMA user_version` equals both the manifest and current supported schema; and
- exactly one vault row whose UUID equals the manifest vault identity.

The browser adapter imports the candidate under a temporary SAH-pool name, closes and removes it after inspection, and reopens the unchanged target. No preview operation replaces the target filename.

## Target snapshot and conflict preview

The adapter reports a stable target fingerprint that covers the current database bytes and attachment inventory. A present target also reports its vault ID, schema version, database checksum, and sorted unique attachment content IDs. Invalid or oversized adapter responses fail closed.

The coordinator exposes only immutable summary metadata; archive bytes and the adapter capability remain private to the preview object.

| Target state | Candidate relationship | Conflict | Required confirmation |
| --- | --- | --- | --- |
| Empty | New vault | `none` | `commit` |
| Present | Same database and attachment inventory | `identical` | `commit` |
| Present | Same vault identity with changes | `same_vault_replace` | `replace_same_vault` |
| Present | Different vault identity | `different_vault_replace` | `replace_different_vault` |

The preview also reports database create/replace/unchanged state and attachment add/reuse/remove counts. It never silently merges two vaults.

## Transactional commit

Commit accepts only the exact confirmation required by the coordinator-issued preview. Immediately before mutation, it re-inspects and exactly compares the target snapshot; any database or attachment drift makes the preview stale. It then re-reads the retained archive bytes and repeats archive, manifest, and entry checksum validation.

The adapter commit receives copied database and attachment bytes plus the expected target fingerprint. Its contract is atomic: replace the database and attachment set together, or leave the previous usable target intact. A successful preview is single-use. An adapter failure returns a stable `commit_failed` result and leaves the preview retryable after the adapter has preserved the old target.

The browser database-byte implementation validates the target checksum at its replacement boundary, retains the existing recovery snapshot behavior, and restores the original bytes if replacement or reopen validation fails. The Phase 1 browser proof carries no attachment payload because browser attachment persistence is not yet composed; generic port tests prove atomic database-plus-attachment handoff. `BKP-007` owns clean browser and desktop restoration of a full vault with attachments.

## Proof obligations

`BKP-003` requires all of the following:

- deterministic unit coverage for archive inspection, all conflict classes, confirmation, replay rejection, stale targets, commit rollback, version/schema/vault mismatch, unsafe entries, truncation, and checksum corruption;
- real browser SQLite proof that preview and corruption leave the active target unchanged, stale commit is rejected, and successful commit restores the exact database hash; and
- hosted current/previous Chrome and Firefox matrix evidence before the checklist item is complete.
