# Recovery fixtures

`phase-1-vault-v1.coredrill.zip` is the deterministic synthetic recovery fixture first introduced for `BKP-007`; its stable filename is retained for compatibility. `EVD-008` expands it through schema 126 with canonical Career Profile evidence, all eight story-evidence link kinds, resume-import proposal/resolution links, an application-sourced Answer Library entry/version, and two attachment relationships. Its adjacent JSON record pins the source archive, raw SQLite, canonical content, attachment hashes, and Phase 3 row inventory used by both the production browser adapter and native desktop boundary tests.

The schema-158, schema-159, schema-160 and schema-164 files are preserved unchanged as legacy recovery/upgrade evidence. The current fixture is separately named `phase-1-vault-schema-165-v1.coredrill.zip`, with adjacent JSON metadata. Regenerate only this current fixture after an intentional archive, schema, or representative-data change:

```powershell
$env:COREDRILL_UPDATE_RECOVERY_FIXTURE = "1"
pnpm exec playwright test --config=playwright.storage.config.mjs e2e/storage-recovery.spec.mjs
Remove-Item Env:COREDRILL_UPDATE_RECOVERY_FIXTURE
```

The fixture contains only invented company, job, workflow, career-evidence, document, answer, relationship, and attachment data. Do not add personal or production data.

After generation, unset the update flag and rerun the same tests to require
byte-for-byte deterministic comparison. Never repoint the writer at a preserved
older fixture merely because a schema update changes current archive bytes.

Schema165 adds only `interaction_contact_history_idx`; its archive is1,858,934
bytes, SHA-256`5b91a75978356e52bbc1b118de9f918d082277d6037470727c71094dccdd0260`.
The SQLite member has SHA-256`a3b595dc27b65db933eed4c1bd8007c8a0a8645bd4d48bf0ad2d5a17a2164d5a`.
There are still58 datasets/116 files and two attachments. Its version1 content
hash is`e9ec9e72dcee225d1f99a6e78a4eedefd950533db7f439fa252098775754e2ee`.
This hash differs from164 because the existing descriptor includes schema and
complete JSON metadata, not because index creation rewrites canonical rows.
Browser proof compares every canonical dataset and prior ledger entry, all CSV
bytes/attachments and all JSON fields except the intentional source-version
metadata advance. Generation and an unchanged no-update replay pass; real native
restore also covers all five milestones and retains the164/165 manual receipts.
Normal app restore/reopen and full new-source/hosted verification remain separate
requirements in [the history proof](../../docs/proof/contact-interaction-history-verification.md).

The schema-158 revision adds a separate exact reusable-version copy and immutable `document_derivation_origin` row. The older tailored submitted derivative retains unknown exact source-version origin; it is not backfilled. Browser and native restore compare the retained origin dataset and count as well as the existing submitted/current/draft document identities.

Schema 159 adds only `next_action_job_created_idx`; its preserved archive is 1,821,486 bytes, SHA-256 `e24c15a146f6378083215cef2775e30814de68d1e8a8d3cefc06f6b15b870312`.

Schema 160 adds only `reminder_next_action_job_state_idx`; there are still 57 canonical datasets, 114 JSON/CSV files and two synthetic attachments. The current archive is 1,829,909 bytes, SHA-256 `420d1b7c58e817dd5b54a620611ecffbc6457bbc3a057e031de6590d10e2becd`. Browser tests compare every dataset row and original migration ledger entry before restore, after legacy restore and after applying only the missing migrations through 160. Native tests restore all three fixtures and compare every exported dataset before/after upgrade or no-op migration, including expected index presence before and after. Original archive/payload hash validation remains separate from subsequent SQLite re-export byte hashes, which need not be stable across engine/runtime versions.

Schema164 adds guarded immutable manual-contact creation evidence:58 datasets /116 files, still two synthetic attachments. Its separately generated hardened archive is1,850,514 bytes, SHA-256`e970b4237c9b69f9d72a48fd4e603cafbae13303c2c46e8fb35f7d3ed0171027`; canonical content SHA-256 remains`de0cdadec230b30433bb68e99f06b143d8eea31b1faf39984fc2dfe6fc281ac1`. The earlier uncommitted candidate is retained under test-results before the reviewed alternate-key/hidden-rowid immutability correction; no158/159/160 fixture is regenerated. The fixture-only harness creates one synthetic contact through the actual viewed-vault application command and SQLite adapter, retaining the exact initial name/email/profile hashes and null role/phone hashes. It is not a normal-app seed or public/license claim. Current browser/native recovery tests preserve all prior rows and ledger identities through158/159/160 upgrades, require the new receipt dataset to stay empty for those legacy archives, and compare the nonempty164 receipt against exact restored values. Whole-vault browser deletion removes the restored storage and attachments. Normal browser/native UI tests separately select the preserved160 archive, keep its source schema through review/commit and deliberately reopen at164; they do not replace harness evidence or claim an installed picker/WebView. The older schema160 paragraph above describes its original checkpoint, not the current milestone.
