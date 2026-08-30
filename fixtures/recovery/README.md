# Recovery fixtures

`phase-1-vault-v1.coredrill.zip` is the deterministic, synthetic Phase 1 recovery fixture for `BKP-007`. Its adjacent JSON record pins the source archive, raw SQLite, canonical content, and attachment hashes used by both the production browser adapter and native desktop boundary tests.

Regenerate it only after an intentional archive, schema, or representative-data change:

```powershell
$env:COREDRILL_UPDATE_RECOVERY_FIXTURE = "1"
pnpm test:storage-browser -- --grep "committed Phase 1 vault"
Remove-Item Env:COREDRILL_UPDATE_RECOVERY_FIXTURE
```

The fixture contains only invented company, job, workflow, document, and attachment data. Do not add personal or production data.
