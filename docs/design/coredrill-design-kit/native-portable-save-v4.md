# Native complete portable archive save — IPC version 4

Status: implemented; see [checkpoint-specific verification](../../proof/native-portable-save-verification.md) for local/hosted evidence. INT-006 remains open. This document records the version-4 save introduction; [IPC version 5](native-portable-read-v5.md) subsequently adds non-mutating input and requires aligned frontend/Rust versions while retaining these save operation semantics.
Date: 2026-10-21. Authority: ADR-0004, D-020/D-024/D-050/D-051 and INT-006.

## Purpose and ownership

The existing `export` picker writes a database-only recovery format. It must not
be relabeled a complete portable ZIP. Shared TypeScript prepares and validates
the complete version-1 archive; Rust provides only confined local saving of its
exact bytes. The existing `native_archive_invoke` command gains version-4 save
operations. No generic filesystem/dialog command or permission is added.

`portable_save_begin` binds a live session, original vault UUID, archive UUID,
exact byte length and lowercase SHA-256. `portable_save_append` binds that same
session/archive and the exact next offset; each nonempty chunk is at most 1 MiB.
`portable_save_finish` repeats the exact vault/archive/length/hash tuple and requests the native picker only after complete staged bytes
match their declared length/hash and the session still owns the viewed vault.
`portable_save_abort` releases that session's staging without selecting a file.
Responses contain correlated identities/counts/hashes, never filesystem paths.

## Resource and lifetime limits

The archive ceiling remains 544 MiB; no entry/payload/reader limit is increased.
Rust retains at most one staged archive across the service's live sessions, in
bounded memory rather than an unencrypted staging file inside the managed vault.
Memory grows only with accepted chunks, not a caller's declared length; allocation
failure must return a stable error. The WebView never serializes an entire large
ZIP as one JSON number array. TypeScript snapshots bytes before asynchronous work
and serializes the full operation on the existing adapter queue.

Staging expires after 15 minutes. Append/finish reject expiry; beginning another
save may release expired staging but cannot replace a live pending save. Abort,
finish/cancellation, session close/deletion/replacement, WebView retirement and
process termination release the staged memory. A finished/cancelled handle cannot
be replayed. Explicit retry starts a new staging operation from the retained UI
artifact; no automatic save retry or browser fallback is permitted.

## Picker and publication

Rust derives a default `coredrill-<archive UUID>.coredrill.zip` filename and owns
the ZIP-filtered OS picker. The selected target must be absolute, outside managed
app data, with a canonical parent and no existing symlink/directory target. A
cancelled picker writes no destination and releases staging. Current session and
vault ownership are rechecked after the picker; intervening ordinary edits are
allowed because this is an explicitly dated earlier snapshot, not a current-vault
backup claim. Changed vault identity or closed session fails before publication.

Publication writes a same-directory exclusive temporary file, uses private Unix
creation permissions, flushes/syncs and verifies its exact bytes before atomic
replacement, then independently verifies target length/hash. Failure before
replacement preserves an existing target. A failure after publication is an
unconfirmed save, never a claim that no file exists; the user must inspect the
destination before an explicit retry. Native paths remain private to Rust.

## Evidence and compatibility

Frontend and Rust update from IPC 3 to 4 together; older versions fail closed.
The normal runtime independently re-inspects the complete ZIP and its manifest
vault/archive/schema/checksum before invoking the native save port; Rust remains
an opaque byte-publication boundary rather than a second ZIP/domain implementation.
SQLite, ZIP manifest/container and legacy recovery-file versions do not change.
No canonical export history/reminder timestamp is written by staging or saving.
A verified save acknowledgement proves those exact bytes were read back at that
time, not permanent possession, latest-vault contents or a successful restore.

Proof must cover bounded/ordered owned transport and acknowledgements, unknown
fields/old versions, forged metadata, wrong session/vault/archive, overlapping
staging, incomplete/corrupt bytes, cancellation, replay, close/retirement,
transaction rejection, confinement, exact existing-target replacement and
pre-publication fault preservation. Actual normal Settings must use the runtime
port with no browser picker/download fallback. Real process/file tests are not
an installed OS picker or packaged WebView usability claim. Full local/hosted
verification and normal restore remain separate completion requirements.
