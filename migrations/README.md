# Migrations

Numbered forward SQL migrations in this directory are the reviewed source shared by browser and native SQLite adapters. Production adapters must apply them through `@coredrill/storage-core`, never through ORM auto-sync.

## Applied migration contract

- Filenames begin with one contiguous positive version and a stable descriptive token.
- Every migration is recorded transactionally in the strict `coredrill_schema_migration` ledger with its version, stable name, SHA-256 checksum, and application time.
- An already-applied version whose name or checksum differs from the reviewed source fails closed.
- The adapter updates `PRAGMA user_version` in the same transaction and rolls back the schema, ledger, and version together on failure.
- Browser and native adapters must consume the same SQL files and pass the same migration contract tests.

## Current migrations

| Version | File                                         | Purpose                                                     | SHA-256                                                            |
| ------- | -------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| 1       | `0001_vault.sql`                             | Minimal strict local-vault root record                      | `a458377c8c59701e9be97a093afe63203d9dfc1b9cdcbd323ab5a6379fa1822d` |
| 2       | `0002_capture_inbox.sql`                     | Durable replay-identifiable capture receipts                | `b6a44b450f90d40f3b90f6562a8d26964e5e0e9af5d1c308173897414f280925` |
| 3       | `0003_app_setting.sql`                       | Typed local settings with optimistic row versions           | `5d57de9ee80c8a1b9beb302c910c10710f88971a56f9bfa294cf1862aa6163ad` |
| 4       | `0004_location.sql`                          | Reusable explicit-precision locations                       | `45494f6f7fd3f0071f4ff22cb75f7e992495112bbf8b50fb513763323e4aa2f8` |
| 5       | `0005_company.sql`                           | Companies with local notes and archive state                | `1bb0190be7e65154dc13653a2143025733d08367bbac35bbe958ae714f4675e5` |
| 6       | `0006_contact.sql`                           | Nullable, non-guessed contact points and confirmation state | `a4a834bae52aa56f164c3d715a9bdaca6d7a94f5684ddca3af785a17a6aace6c` |
| 7       | `0007_job.sql`                               | Core reviewed job records                                   | `c6b85c842bbaa47f30215826881f98457b1e2d4296121c041553ec87be529a5f` |
| 8       | `0008_job_source.sql`                        | Source identity, freshness, links, and content hash         | `46bc1c0f017545fa77dd9035f749bed07214718573973c8cf290c8d3c2bddfb2` |
| 9       | `0009_source_snapshot.sql`                   | Append-only source representations and extractor identity   | `202b908f5266a883bb977234f6acdcc569ce953703fba3e353762aad29abac1e` |
| 10      | `0010_provenance.sql`                        | Field-level source/method/excerpt/confidence evidence       | `2b55bc26068aef03953d5ec52b37f0f94f79783263c3e0ca7706a66cdca56470` |
| 11      | `0011_company_alias.sql`                     | Provenance-backed company aliases                           | `cd483c992a86de871b87cc01961d903089e7b15c769957e9c53a6e9877393149` |
| 12      | `0012_contact_point_provenance.sql`          | Hashed contact-field provenance links                       | `6bbe74d3ed2e879905032ca717b7cbdad5f836fdbdc7498c29b1edd9f06c61e1` |
| 13      | `0013_field_value.sql`                       | Candidate history, user confirmation, and supersession      | `76daa7c3e899d5c8238611c25e714257340cf2965dc920b5f4cac5d47dfdacd1` |
| 14      | `0014_status_definition.sql`                 | Custom stages mapped to stable reporting categories         | `480c766905306953b0ac2e64b37538456d9e8193d46ad356bf68636025539a1b` |
| 15      | `0015_job_current_status.sql`                | Nullable current-stage projection on jobs                   | `48f3ec97fa43afc2553c5e599f1a4956236c52793957542dc730a00ea5adf685` |
| 16      | `0016_job_next_action.sql`                   | Nullable next-action time projection on jobs                | `853dfbbc3c5edc2b851581e4f1164c542e5cbe2d06f888e44f9539ff6c9de557` |
| 17      | `0017_application.sql`                       | Explicit application attempts and selected-document links   | `2af15e2eb7cda5a5d098ed79430b1d169e2c5e5ee5d8f1c4609e0291b0b97a28` |
| 18      | `0018_status_event.sql`                      | Append-only application and job stage history               | `d587d4ad15c95a6be314db5b9a157b39a1f68ee9b4bdcfa5b7e99e9c019cb1b7` |
| 19      | `0019_interaction.sql`                       | Job/contact interaction timeline records                    | `c40fea3c5ff0f7158550d6b959b891cddf1786f388b83ddc4a3747211e8fe09e` |
| 20      | `0020_next_action.sql`                       | Action state and due-time records                           | `60618614c34d8da45ae56a7c48a22ada6289e917f5c7e12f320226294f6443b4` |
| 21      | `0021_interview.sql`                         | Time-zone-aware interview records                           | `8be74d8642e0e3569cb850fdfaf9008dcc732dff9ce2c4cf48f8dbd7a0e67397` |
| 22      | `0022_reminder.sql`                          | Local reminder state and firing timestamps                  | `8733bd0e014116147c0fa9fdb1d1b88a971ca486ab67bccc31f4593ef7feb29f` |
| 23      | `0023_tag.sql`                               | User-defined tag records                                    | `e7534c2ac9c5ed2b711e8dc891a0594ade74d83256a95d19e14aa41bfe879a18` |
| 24      | `0024_job_tag.sql`                           | Idempotent job-to-tag assignments                           | `08f1e67e45e3e2d71ec13dad486bd17697084f50750c7306e177907eec28ede8` |
| 25      | `0025_saved_view.sql`                        | Versioned job-filter views and UI settings                  | `1a743c44b57c4739938427e098fdf95869ba13d73372bfa41fb4ee8c1e96d165` |
| 26      | `0026_document.sql`                          | Typed document identity and archive state                   | `97b51e02650c630d765e96490e342cc066d6e6959f80116dad3c86b3ac2dabfc` |
| 27      | `0027_document_version.sql`                  | Immutable canonical-IR document versions and lineage        | `a3afe47339e16effa50ca068abdbcfba4987383f3408bb7529fdbbd51a1e745a` |
| 28      | `0028_document_job_link.sql`                 | Purpose-qualified document-to-job relationships             | `97cfab23cf24a179def7540c48999a1a7f6a7d32c8ade40c63c3173c3fbf2cab` |
| 29      | `0029_attachment_manifest.sql`               | Content-addressed attachment metadata without bytes         | `6305892c6e9e805cdaa43cac84f6509a4b6c7540ebf5319ff784a028cb1c8169` |
| 30      | `0030_document_version_attachment.sql`       | Logical version-to-attachment relationships                 | `b68c55bca6561ad49c301bab8ddb290cf919388ed4015cd6361996ca8312ce99` |
| 31      | `0031_document_style_example.sql`            | Version-scoped style-example selections                     | `2f1fcbe6efc83a5b764a6694da5ad38f22dc48baa808895ff718f2fce55f4c91` |
| 32      | `0032_device.sql`                            | Stable local device identity and audit heartbeat            | `14f973c2b620bc7ceee79202a8652d2c03bbf05e6b6605710fb216dbaad936eb` |
| 33      | `0033_integrity_probe.sql`                   | Transaction-scoped upgrade-integrity probe                  | `9952bc132c651d19d58c487730a375d3fa2afe2752813df498dedee4a7692371` |
| 34      | `0034_validate_existing_integrity.sql`       | Fail-closed audit, selection, and lineage validation        | `b4458f02b159299f4b40e4b83140b5d88aebc1eb6881967cb6865fd074873cfd` |
| 35      | `0035_drop_integrity_probe.sql`              | Removal of the successful upgrade probe                     | `42a37ed5951826eb00a0d96e062ef1a78b401e9ff402b923facfb47ae1e271cb` |
| 36      | `0036_application_document_insert_guard.sql` | Selected application-document kind validation on insert     | `351a6a4a334aeea1fe5fd69e0eef676d0b8fe23c69094a24544e1d1600459676` |
| 37      | `0037_application_document_update_guard.sql` | Selected application-document kind validation on update     | `a72a42516fcd5b38e9b1aec7b12e162e91b6189e16e4f81d607330cd4e5da56c` |
| 38      | `0038_document_kind_update_guard.sql`        | Protection for selected resume and cover-letter kinds       | `cd71951d8bc20b6e177891e29669d2133f30194989b84f4f498948dbdc5d590e` |
| 39      | `0039_document_version_lineage_guard.sql`    | Database-enforced same-document consecutive lineage         | `bae6c96ec634332c6954cc31c2153abfff0e98ee4878a348e889a87b2c56f0bc` |
| 40      | `0040_document_version_update_guard.sql`     | Immutable document-version update guard                     | `4008bfe08460660cddc903702b4d09be0408b5bd401fdf9dcf780ce964e440be` |
| 41      | `0041_document_version_delete_guard.sql`     | Selected document-version deletion guard                    | `757e322984639b8b4b68c7d3e8ce9aacca3422a0475abb4fd04e8e0ccca83fcd` |
| 42      | `0042_source_snapshot_update_guard.sql`      | Append-only source-snapshot update guard                    | `54cf44bfd01aefb0505d8d279c539b515565c83676a56c5d3fab81c2d2a0386c` |
| 43      | `0043_status_event_update_guard.sql`         | Append-only status-event update guard                       | `6814589c50b51b1d4fbae43e43666b937a834412ce6edb52542154810aac4489` |
| 44      | `0044_interaction_update_guard.sql`          | Append-only interaction update guard                        | `406f6bf7883ca0063e34a4255142daf4fda7d2036da41d085683330ed5347ccc` |
| 45      | `0045_attachment_manifest_update_guard.sql`  | Immutable content-addressed manifest update guard           | `1c1620ba056017a190ece80a4a6fa976f29c88abf9fded279307f3a254456df6` |

The Phase 0 tables remain compatible and continue to store the durable capture envelope before acknowledgement. Versions 3–45 implement the reviewed tracker, pipeline, saved-view, document-manifest, local-device, audit, and integrity persistence without promoting an Inbox receipt into a job, seeding provisional display vocabulary, storing attachment bytes in SQLite, or introducing an AI dependency. The archive timestamps are the local soft-delete representation; final multi-device tombstone/conflict semantics remain deferred to the required sync ADR. Broader indexes/FTS and binary attachment I/O remain owned by later checklist slices.
