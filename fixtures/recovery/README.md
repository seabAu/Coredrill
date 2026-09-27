# Recovery fixtures

`phase-1-vault-v1.coredrill.zip` is the deterministic synthetic recovery fixture first introduced for `BKP-007`; its stable filename is retained for compatibility. `EVD-008` expands it through schema 126 with canonical Career Profile evidence, all eight story-evidence link kinds, resume-import proposal/resolution links, an application-sourced Answer Library entry/version, and two attachment relationships. Its adjacent JSON record pins the source archive, raw SQLite, canonical content, attachment hashes, and Phase 3 row inventory used by both the production browser adapter and native desktop boundary tests.

Regenerate it only after an intentional archive, schema, or representative-data change:

```powershell
$env:COREDRILL_UPDATE_RECOVERY_FIXTURE = "1"
pnpm exec playwright test --config=playwright.storage.config.mjs e2e/storage-recovery.spec.mjs
Remove-Item Env:COREDRILL_UPDATE_RECOVERY_FIXTURE
```

The fixture contains only invented company, job, workflow, career-evidence, document, answer, relationship, and attachment data. Do not add personal or production data.
