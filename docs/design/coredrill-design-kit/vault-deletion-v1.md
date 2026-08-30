# Vault deletion version 1

## Purpose and authority

This document defines the `BKP-006` destructive local-vault boundary. It
implements the typed confirmation, recoverability warning, attachment cleanup,
managed-backup cleanup, and provider-secret cleanup required by the product,
interface, security, and testing authorities.

Deletion is local and accountless. It does not contact a hosted service, revoke
an account, alter an external portable archive, or imply that Coredrill can
erase copies the user saved outside the app. It adds no sync or remote-deletion
semantics.

## Exact user confirmation

The read-only preview identifies one active vault by its durable vault ID and
current name. The required phrase is exactly:

```text
DELETE <vault name>
```

The comparison is case-sensitive and whitespace-sensitive. Coredrill does not
trim, normalize, or accept the vault name alone. The interface may enable the
final button only after an exact match, but the application boundary and every
privileged adapter must validate the target-bound phrase again. A stale
preview, changed vault identity/name, missing confirmation, or replay is
rejected before destructive work.

The preview and result are immutable and path-free. They expose only the vault
identity/name, storage mode, bounded counts, recovery state, stable warning or
error codes, and an opaque single-use preview identifier. Database paths,
attachment paths, backup paths, provider identifiers, keychain account names,
and native exception text never cross into the UI.

## Deletion scope

A successful version-1 deletion removes all app-managed local material owned
only by the target vault:

- the active SQLite database and its WAL/SHM sidecars;
- content-addressed attachment bytes referenced by the target vault and by no
  other managed vault;
- the target database's managed automatic-backup directory and every recovery
  artifact beneath it;
- vault-scoped provider secrets registered for the target vault in operating-
  system secure storage; and
- ephemeral runtime/cache state for the deleted vault.

An attachment referenced by another managed vault is preserved and reported
only as a count. Another database, another vault's backup directory, and
another vault's secrets are never deletion targets. Rebuildable search indexes
inside the target database disappear with that database.

External portable archives and user-readable exports are outside Coredrill's
managed app-data roots and remain untouched. They are the only supported
recovery path after a completed deletion. A recorded successful export instant
means only that Coredrill completed an export at that time; it does not prove
that the user still possesses the file.

Browser mode currently has no app-managed attachment-byte store, automatic
backup directory, or browser provider-secret implementation. Their preview
counts are therefore zero, and deletion removes the target origin's SQLite
vault only. A future browser attachment or BYOK-secret store must implement the
same complete cleanup contract before it can ship.

## Provider-secret ownership

Desktop provider secrets are vault-scoped by both durable vault ID and reviewed
provider ID. An ordinary provider ID alone is not a deletion authority. The
canonical database retains a strict version-1 registry of provider IDs whose
secrets may exist for that vault; secret bytes never enter SQLite, JavaScript,
logs, diagnostics, or deletion proof.

The combined native deletion boundary reads and validates that registry before
closing the database, then asks the OS secure-store service to delete only the
derived vault/provider accounts. Missing entries are idempotent success. If the
registry is malformed or secure storage is unavailable, deletion fails before
the active vault database is removed. A partially completed secret cleanup may
require the user to re-enter a credential, but it must not cause user-data
loss; the staged vault content is restored before failure is returned.

## Failure-safe native sequence

The desktop adapter owns one serialized, capability-gated operation. It:

1. validates protocol, session, target vault ID, current vault name, exact
   confirmation phrase, schema, provider-secret registry, attachment inventory,
   other-vault attachment references, and managed-path confinement;
2. creates a unique same-volume deletion staging directory under app data;
3. closes the target connection and atomically renames the target database
   files, unshared attachments, and target backup directory into staging;
4. rolls every rename back and reopens the vault if staging fails;
5. deletes the registered vault-scoped OS secrets while the restorable local
   content remains staged;
6. restores staged content if secret cleanup fails; and
7. removes the staging tree only after all secret cleanup succeeds.

If final staging cleanup cannot finish, the active vault is deleted but the
result is `cleanup_pending`, not a clean-completion claim. The managed staging
identifier is retained internally for bounded retry and is never exposed as a
path. A purge-approved marker distinguishes safe startup cleanup from staged
content that may still require rollback; desktop storage retries only marked
purges when it initializes. Another vault may still open. A rollback failure
becomes a stable `recovery_failed` state and cannot be reported as successful
deletion.

The browser adapter serializes the same preview-bound operation under its
exclusive origin Web Lock. It rechecks the sole vault row and exact phrase,
closes the Worker database, deletes the SAH-pool database, releases the lock,
and clears the expected-database session state. A mismatch or Worker failure
does not become a success response.

## Recoverability warning and interface

Settings → Vault & Backup places `Delete local vault` after export and restore,
visually separated from ordinary backup controls. Opening it creates an
accessible modal whose title names the vault and whose initial focus is on the
warning, not the final destructive button.

The warning states:

- deletion has no in-app undo;
- the database, unshared attachments, managed automatic backups, and
  vault-scoped provider secrets included by the preview will be removed;
- automatic backups are removed with the vault and therefore are not a recovery
  path;
- an external portable archive is the only supported restore source;
- the most recent successful export time is recorded or explicitly unknown,
  and Coredrill cannot verify that the file still exists; and
- other vaults, shared attachment bytes, and external archives are unaffected.

The modal offers `Cancel`, `Export portable archive`, and the final `Delete
local vault` action. Export leaves deletion pending and does not silently submit
the form. The final action exposes busy progress, prevents double submission,
announces success or stable failure, and restores focus safely on cancel/error.
After clean success the app clears target state and returns to accountless
onboarding. A `cleanup_pending` result instead shows the remaining local-cleanup
warning and the bounded desktop-startup retry behavior.

The interface never uses a countdown, timeout, shame, repeated urgency, or a
prechecked confirmation. Color is not the only destructive-state signal. The
dialog remains keyboard and screen-reader operable, reflows at 320 CSS pixels,
supports forced colors and reduced motion, and makes no network request.

## Proof obligations

`BKP-006` requires unit, component, real-browser, and native security proof
that:

- preview is non-mutating, path-free, bounded, and bound to one current vault;
- wrong case, whitespace, name, ID, preview, extra fields, replay, and direct
  privileged invocation without exact confirmation fail before deletion;
- browser deletion removes the real SQLite vault and a reopen is empty;
- native deletion removes database/WAL/SHM, unshared attachment bytes, managed
  backups, and registered vault-scoped secrets;
- another vault, shared attachments, another vault's secrets/backups, and
  external portable archives remain byte-for-byte intact;
- injected staging and secret failures restore usable vault content, while a
  final cleanup failure returns `cleanup_pending` rather than clean success;
- successful UI submission requires the exact phrase, cannot double-submit,
  clears target UI state, and offers a portable export before deletion;
- cancel/error focus, announcements, 320-pixel reflow, forced colors, and no
  external request pass; and
- current/previous Chrome and Firefox plus supported native CI lanes execute
  the production boundaries.
