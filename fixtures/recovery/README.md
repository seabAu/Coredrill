# Recovery fixtures

`phase-1-vault-v1.coredrill.zip` is the deterministic synthetic recovery fixture first introduced for `BKP-007`; its stable filename is retained for compatibility. `EVD-008` expands it through schema 126 with canonical Career Profile evidence, all eight story-evidence link kinds, resume-import proposal/resolution links, an application-sourced Answer Library entry/version, and two attachment relationships. Its adjacent JSON record pins the source archive, raw SQLite, canonical content, attachment hashes, and Phase 3 row inventory used by both the production browser adapter and native desktop boundary tests.

The schema-158 files are now preserved unchanged as legacy recovery/upgrade evidence. The current fixture is separately named `phase-1-vault-schema-159-v1.coredrill.zip`, with adjacent JSON metadata. Regenerate only this current fixture after an intentional archive, schema, or representative-data change:

```powershell
$env:COREDRILL_UPDATE_RECOVERY_FIXTURE = "1"
pnpm exec playwright test --config=playwright.storage.config.mjs e2e/storage-recovery.spec.mjs
Remove-Item Env:COREDRILL_UPDATE_RECOVERY_FIXTURE
```

The fixture contains only invented company, job, workflow, career-evidence, document, answer, relationship, and attachment data. Do not add personal or production data.

The schema-158 revision adds a separate exact reusable-version copy and immutable `document_derivation_origin` row. The older tailored submitted derivative retains unknown exact source-version origin; it is not backfilled. Browser and native restore compare the retained origin dataset and count as well as the existing submitted/current/draft document identities.

Schema 159 adds only `next_action_job_created_idx`; there are still 57 canonical datasets, 114 JSON/CSV files and two synthetic attachments. The current archive is 1,821,486 bytes, SHA-256 `e24c15a146f6378083215cef2775e30814de68d1e8a8d3cefc06f6b15b870312`. Browser tests compare every dataset row and original migration ledger entry before restore, after legacy restore and after applying only migration 159. Native tests restore both fixtures and compare every exported dataset before/after upgrade or no-op migration. Original archive/payload hash validation remains separate from subsequent SQLite re-export byte hashes, which need not be stable across engine/runtime versions.
