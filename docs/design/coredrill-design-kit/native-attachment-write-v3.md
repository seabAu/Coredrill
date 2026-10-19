# Native attachment write — archive IPC version 3

Status: implemented and locally verified runtime prerequisite; hosted verification pending.
Date: 2026-10-19. Authority: ADR-0004 and the existing local-first ownership,
native confinement and content-addressed attachment decisions.

## Contract

Archive IPC version 3 adds `attachment_put` to the existing
`native_archive_invoke` command. It accepts only an opaque live session ID and
an attachment containing lowercase SHA-256 `contentId`, equal `sha256`, exact
integer `byteLength`, and bytes. The existing 256 MiB per-entry ceiling applies.
Rust's tagged request and nested payload reject unknown fields. There is no
caller-supplied path, filename, MIME claim, directory, overwrite option, remote
URL, arbitrary filesystem command, or new Tauri permission.

TypeScript snapshots bytes before asynchronous hashing, verifies metadata/hash
before IPC, serializes writes with the adapter queue, and validates the matching
`attachment_stored` identity/length/hash acknowledgement. Rust independently
revalidates hash and length; the session must exist, own a valid managed database,
and have no active SQLite transaction. The command does not update SQLite.
Application commands remain responsible for manifest and relationship writes.

## Filesystem and failure behavior

The existing managed layout derives both shard directories and the final name
from the digest, checks managed paths and rejects links/escapes. An identical
existing payload is reused. An existing different/corrupt payload fails closed;
ordinary writing is not an implicit repair. New payloads use the existing
same-directory temporary file, flush/sync, atomic publication and verified
readback. Errors are stable/content-free; paths and bytes are not diagnostic
fields.

Attachment reads inspect file type/length and bound the read even if the file
grows after metadata inspection. Explicit archive restore retains its repair
semantics: it may replace a corrupt oversized existing payload without first
reading it into memory. Ordinary `attachment_put` cannot do that.

A database command failing after payload publication may leave an unreferenced
content-addressed file, as in the browser adapter. This is not a saved document
or export record. Canonical metadata remains in SQLite; no file is selected or
submitted merely because its bytes were retained. Retry can safely reuse the
same bytes. Future garbage collection must respect all manifest references.

## Compatibility

Frontend and Rust archive IPC must update together from version 2 to 3; old
versions fail closed. Storage IPC, secret/vault protocols, recovery file format
1, portable ZIP contracts, current SQLite schema 158 and stored user data do not
change. No data migration or Accepted architecture decision change is required.

## Required proof

Protocol tests cover input identity/length/hash rejection before IPC, immutable
byte snapshots, bounded acknowledgements, identity drift and old-version
rejection. Real Rust transport tests cover exact binary write/read, repeated
write, unchanged SQLite export hash, close/reopen durability, confined location,
direct forged payload rejection, active-transaction and closed-session rejection,
and refusal to overwrite a corrupt existing payload. Existing archive restore
and recovery proofs must continue passing. Production/native runtime composition
and export UI integration are subsequent work, not claimed by these tests.
