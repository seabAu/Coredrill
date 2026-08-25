# Migrations

Numbered forward SQL migrations in this directory are the reviewed source shared by browser and native SQLite adapters. Production adapters must apply them through `@coredrill/storage-core`, never through ORM auto-sync.

## Applied migration contract

- Filenames begin with one contiguous positive version and a stable descriptive token.
- Every migration is recorded transactionally in the strict `coredrill_schema_migration` ledger with its version, stable name, SHA-256 checksum, and application time.
- An already-applied version whose name or checksum differs from the reviewed source fails closed.
- The adapter updates `PRAGMA user_version` in the same transaction and rolls back the schema, ledger, and version together on failure.
- Browser and native adapters must consume the same SQL files and pass the same migration contract tests.

## Current migrations

| Version | File                                | Purpose                                                     | SHA-256                                                            |
| ------- | ----------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| 1       | `0001_vault.sql`                    | Minimal strict local-vault root record                      | `a458377c8c59701e9be97a093afe63203d9dfc1b9cdcbd323ab5a6379fa1822d` |
| 2       | `0002_capture_inbox.sql`            | Durable replay-identifiable capture receipts                | `b6a44b450f90d40f3b90f6562a8d26964e5e0e9af5d1c308173897414f280925` |
| 3       | `0003_app_setting.sql`              | Typed local settings with optimistic row versions           | `5d57de9ee80c8a1b9beb302c910c10710f88971a56f9bfa294cf1862aa6163ad` |
| 4       | `0004_location.sql`                 | Reusable explicit-precision locations                       | `45494f6f7fd3f0071f4ff22cb75f7e992495112bbf8b50fb513763323e4aa2f8` |
| 5       | `0005_company.sql`                  | Companies with local notes and archive state                | `1bb0190be7e65154dc13653a2143025733d08367bbac35bbe958ae714f4675e5` |
| 6       | `0006_contact.sql`                  | Nullable, non-guessed contact points and confirmation state | `a4a834bae52aa56f164c3d715a9bdaca6d7a94f5684ddca3af785a17a6aace6c` |
| 7       | `0007_job.sql`                      | Core reviewed job records                                   | `c6b85c842bbaa47f30215826881f98457b1e2d4296121c041553ec87be529a5f` |
| 8       | `0008_job_source.sql`               | Source identity, freshness, links, and content hash         | `46bc1c0f017545fa77dd9035f749bed07214718573973c8cf290c8d3c2bddfb2` |
| 9       | `0009_source_snapshot.sql`          | Append-only source representations and extractor identity   | `202b908f5266a883bb977234f6acdcc569ce953703fba3e353762aad29abac1e` |
| 10      | `0010_provenance.sql`               | Field-level source/method/excerpt/confidence evidence       | `2b55bc26068aef03953d5ec52b37f0f94f79783263c3e0ca7706a66cdca56470` |
| 11      | `0011_company_alias.sql`            | Provenance-backed company aliases                           | `cd483c992a86de871b87cc01961d903089e7b15c769957e9c53a6e9877393149` |
| 12      | `0012_contact_point_provenance.sql` | Hashed contact-field provenance links                       | `6bbe74d3ed2e879905032ca717b7cbdad5f836fdbdc7498c29b1edd9f06c61e1` |
| 13      | `0013_field_value.sql`              | Candidate history, user confirmation, and supersession      | `76daa7c3e899d5c8238611c25e714257340cf2965dc920b5f4cac5d47dfdacd1` |
| 14      | `0014_status_definition.sql`        | Custom stages mapped to stable reporting categories         | `480c766905306953b0ac2e64b37538456d9e8193d46ad356bf68636025539a1b` |
| 15      | `0015_job_current_status.sql`       | Nullable current-stage projection on jobs                   | `48f3ec97fa43afc2553c5e599f1a4956236c52793957542dc730a00ea5adf685` |
| 16      | `0016_job_next_action.sql`          | Nullable next-action time projection on jobs                | `853dfbbc3c5edc2b851581e4f1164c542e5cbe2d06f888e44f9539ff6c9de557` |
| 17      | `0017_application.sql`              | Explicit application attempts and selected-document links   | `2af15e2eb7cda5a5d098ed79430b1d169e2c5e5ee5d8f1c4609e0291b0b97a28` |
| 18      | `0018_status_event.sql`             | Append-only application and job stage history               | `d587d4ad15c95a6be314db5b9a157b39a1f68ee9b4bdcfa5b7e99e9c019cb1b7` |
| 19      | `0019_interaction.sql`              | Job/contact interaction timeline records                    | `c40fea3c5ff0f7158550d6b959b891cddf1786f388b83ddc4a3747211e8fe09e` |
| 20      | `0020_next_action.sql`              | Action state and due-time records                           | `60618614c34d8da45ae56a7c48a22ada6289e917f5c7e12f320226294f6443b4` |
| 21      | `0021_interview.sql`                | Time-zone-aware interview records                           | `8be74d8642e0e3569cb850fdfaf9008dcc732dff9ce2c4cf48f8dbd7a0e67397` |
| 22      | `0022_reminder.sql`                 | Local reminder state and firing timestamps                  | `8733bd0e014116147c0fa9fdb1d1b88a971ca486ab67bccc31f4593ef7feb29f` |
| 23      | `0023_tag.sql`                      | User-defined tag records                                    | `e7534c2ac9c5ed2b711e8dc891a0594ade74d83256a95d19e14aa41bfe879a18` |
| 24      | `0024_job_tag.sql`                  | Idempotent job-to-tag assignments                           | `08f1e67e45e3e2d71ec13dad486bd17697084f50750c7306e177907eec28ede8` |
| 25      | `0025_saved_view.sql`               | Versioned job-filter views and UI settings                  | `1a743c44b57c4739938427e098fdf95869ba13d73372bfa41fb4ee8c1e96d165` |

The Phase 0 tables remain compatible and continue to store the durable capture envelope before acknowledgement. Versions 3–25 implement the reviewed tracker, pipeline, tag, and saved-view persistence without promoting an Inbox receipt into a job or seeding provisional display-stage or saved-view vocabulary. Document records, broader indexes/FTS, tombstones, and attachments remain owned by later checklist slices.
