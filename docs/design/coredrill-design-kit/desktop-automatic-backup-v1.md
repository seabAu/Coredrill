# Desktop automatic backup version 1

## Purpose and authority

This document defines the managed desktop backup-rotation boundary implemented
by `BKP-004`. It is a pickerless recovery checkpoint owned by the thin Rust
boundary. The WebView can request a checkpoint for an open native SQLite
session and choose a bounded retention count, but it cannot choose, discover,
or receive a filesystem path.

The version-1 automatic backup reuses the checksummed database-only recovery
envelope proven by `NAT-006`. It protects canonical SQLite data. It is not the
D-051 portable ZIP, does not contain attachments or JSON/CSV projections, and
does not claim encryption. Full clean-install recovery with representative
attachments remains `BKP-007`.

## Managed layout and protocol

The native storage layout adds one canonical app-data root:

```text
<Tauri app-data>/
  backups/<validated-database-leaf>/
    backup-<20-digit-unix-seconds>-<9-digit-nanoseconds>-<20-digit-sequence>.coredrill-db
```

The database leaf already satisfies the native storage filename contract. The
backup root and per-database directory are created and revalidated beneath the
canonical app-data root; directory links and external canonical targets fail
closed. A process-local sequence prevents same-clock filename collision.

`automatic_backup` extends native archive protocol version 1 with:

- an opaque open `sessionId`;
- integer `retentionCount` from 1 through 90; and
- no selected path, archive bytes, or schedule supplied by JavaScript.

The response exposes only the creation instant in Unix milliseconds, requested
retention, known-good and pruned counts, a cleanup-pending boolean, and the
existing schema/length/SHA-256 recovery metadata. It contains no path or
database name. The desktop application may invoke this checkpoint after its
configured startup or change policy; picker UI is never involved.

## Creation and verification order

One automatic checkpoint holds the serialized native session boundary and:

1. rejects a missing session, active transaction, unsafe retention, invalid
   database path, inaccessible managed backup root, or a directory already at
   its 512-entry operational bound;
2. verifies the active connection and creates a consistent SQLite online
   backup into a same-volume managed temporary file;
3. reopens that snapshot read-only with `SQLITE_OPEN_NOFOLLOW` and
   `trusted_schema=OFF`, then requires full integrity and the same schema;
4. calculates its byte length and SHA-256, writes the versioned recovery
   envelope through a same-directory temporary file, flushes it, and atomically
   publishes the timestamped filename;
5. rereads the published envelope, verifies length/checksum, extracts to
   managed temporary state, and repeats SQLite integrity/schema validation; and
6. only after that published backup is known-good, considers older verified
   backups for retention cleanup.

No backup operation writes to, closes, or replaces the active database.

## Rotation and failure semantics

Rotation enumerates at most 512 managed entries without following links. Exact
timestamped recovery files are independently verified; malformed, linked,
unexpected, or corrupt entries are retained and set `cleanupPending` rather
than being deleted automatically.

The new verified backup is never a prune candidate. Older verified files are
removed oldest-first until the requested retention is reached. Retention cannot
be less than one. Cleanup deletion or directory-sync failure does not invalidate
the new backup: the response remains successful with `cleanupPending: true`
and extra known-good backups are retained for a later pass.

A snapshot or publish failure returns `backup_failed`. A published artifact
that fails reread/checksum/SQLite verification is removed when possible and
returns `backup_verification_failed`. In both cases rotation has not started,
all earlier known-good backups remain, and the active vault is unchanged.
Errors are stable and content-free.

## Proof obligations

`BKP-004` requires filesystem and protocol tests proving:

- canonical per-database placement and timestamped unique names;
- online-snapshot checksum, SQLite integrity, schema, and post-publication
  reread verification;
- retention at two and one with oldest-first removal only after success;
- rejection of zero, fractional, and excessive retention before mutation;
- pre-publication and post-publication corruption failures preserving the
  prior file inventory and readable active database;
- cleanup failure retaining the new backup plus all older known-good backups,
  followed by successful deferred cleanup; and
- one final retained backup that still passes the recovery reader, with no path
  exposed through the TypeScript/Tauri protocol.
