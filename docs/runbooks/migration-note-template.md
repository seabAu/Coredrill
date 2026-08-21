# Migration note — VERSION / SCHEMA

## Summary and trigger

Name the schema, archive, capture, prompt, or sync version transition and why it is necessary.

## Preconditions

- Supported source versions:
- Required free space/tool version:
- Backup/export checkpoint:
- Offline/network requirements:

## Data and compatibility impact

- Tables/contracts/attachments affected:
- Forward compatibility:
- Older-client behavior:
- Human-readable export/downgrade escape hatch:

## Procedure

1. Validate version and integrity.
2. Create/verify recovery checkpoint.
3. Apply bounded transactional/staged changes.
4. Verify canonical hashes and invariants.

## Failure and recovery

- Rollback behavior:
- Corruption/interruption handling:
- User-visible recovery path:

## Proof

- Fresh install:
- Supported upgrade matrix:
- Failed migration/rollback:
- Browser/native logical equivalence:
- Export/restore/checksums:
