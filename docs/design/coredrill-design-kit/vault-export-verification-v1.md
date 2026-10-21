# Portable export verification observations — version 1

Status: implementation scope; completion requires executable proof.
Date: 2026-10-21. Authority: INT-006, D-024/D-050/D-051 and browser recovery-health v1.

## Meaning and storage

An observation records that one exact archive's bytes matched a selected local
copy or were read back by the native save boundary at a stated instant. It is
not a successful restore, current-vault freshness, encryption or permanent file
possession claim. Imported/restored observations remain historical, including
when they originated in another browser/profile/device.

Canonical observations use the existing SQLite `app_setting` key
`vault-export-verifications-v1`: strict version, vault UUID and the latest 20
observations. Each observation retains archive UUID, archive creation instant,
schema version, byte length, lowercase SHA-256, verification instant and method
(`selected_local_copy` or `native_readback`). No path, file content, private
exception, document title or filesystem-access capability is stored. The
existing settings JSON/CSV export includes the value; no SQLite migration or
portable-container version change is needed.

## Mutation and read boundaries

Validated application commands/queries bind the original viewed vault. The
storage transaction checks exactly one matching current vault before reading or
changing settings. Reading missing observations is non-mutating. Corrupt or
foreign persisted shapes fail closed instead of being reset or substituted.

Recording preserves the immutable archive identity tuple, orders observations
deterministically and bounds retention. Repeating the same observation is
idempotent; a conflicting identity or an observation older than the retained
window is rejected without partial writes. Exact observation and reminder
updates commit together. Reminder success uses the verified instant, never the
later retry time, and cannot move an existing success instant backward or turn
an explicitly disabled reminder on. Neutral enable/disable/seven-day snooze
actions remain distinct from recording success.

## UI ownership and failure

The owned export session records only after its exact selected-file match or
correlated native saved-byte acknowledgement. Preparation, a browser download
handoff, cancellation and unconfirmed save/read never invoke recording. A
verified copy stays verified if recording fails: the UI explains that the file
and the historical record have different outcomes and offers an explicit
record-only retry. It must not resave a file or silently repeat verification.

Retry retains the original immutable evidence and verification instant. Busy,
navigation, reflow, disposal and cross-vault lifetime rules remain those of the
root export session. Settings reads actual stored observations and reminder
preferences after reload, with loading/empty/error/retry states and bounded,
accessible controls. No sample history or cached-only success is substituted.

## Proof required

Strict malformed/unknown/oversized/foreign-state contracts; original input
capture; idempotence/retention/conflicts; transactional rollback and wrong-vault
rejection; disabled-reminder preservation and monotonic success time; zero
preparation/handoff/cancellation/failure writes; distinct file-success versus
record-failure and record-only retry; real browser/native SQLite reload,
navigation, stale-owner, reflow, keyboard/axe and zero external requests.
Full local/extension/policy and exact hosted verification are required. This
observation record does not complete normal restore or INT-006 by itself.
