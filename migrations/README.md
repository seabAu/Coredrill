# Migrations

Numbered forward SQL migrations in this directory are the reviewed source shared by browser and native SQLite adapters. Production adapters must apply them through `@coredrill/storage-core`, never through ORM auto-sync.

## Applied migration contract

- Filenames begin with one contiguous positive version and a stable descriptive token.
- Every migration is recorded transactionally in the strict `coredrill_schema_migration` ledger with its version, stable name, SHA-256 checksum, and application time.
- An already-applied version whose name or checksum differs from the reviewed source fails closed.
- The adapter updates `PRAGMA user_version` in the same transaction and rolls back the schema, ledger, and version together on failure.
- Browser and native adapters must consume the same SQL files and pass the same migration contract tests.

## Current migrations

| Version | File                                              | Purpose                                                      | SHA-256                                                            |
| ------- | ------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1       | `0001_vault.sql`                                  | Minimal strict local-vault root record                       | `a458377c8c59701e9be97a093afe63203d9dfc1b9cdcbd323ab5a6379fa1822d` |
| 2       | `0002_capture_inbox.sql`                          | Durable replay-identifiable capture receipts                 | `b6a44b450f90d40f3b90f6562a8d26964e5e0e9af5d1c308173897414f280925` |
| 3       | `0003_app_setting.sql`                            | Typed local settings with optimistic row versions            | `5d57de9ee80c8a1b9beb302c910c10710f88971a56f9bfa294cf1862aa6163ad` |
| 4       | `0004_location.sql`                               | Reusable explicit-precision locations                        | `45494f6f7fd3f0071f4ff22cb75f7e992495112bbf8b50fb513763323e4aa2f8` |
| 5       | `0005_company.sql`                                | Companies with local notes and archive state                 | `1bb0190be7e65154dc13653a2143025733d08367bbac35bbe958ae714f4675e5` |
| 6       | `0006_contact.sql`                                | Nullable, non-guessed contact points and confirmation state  | `a4a834bae52aa56f164c3d715a9bdaca6d7a94f5684ddca3af785a17a6aace6c` |
| 7       | `0007_job.sql`                                    | Core reviewed job records                                    | `c6b85c842bbaa47f30215826881f98457b1e2d4296121c041553ec87be529a5f` |
| 8       | `0008_job_source.sql`                             | Source identity, freshness, links, and content hash          | `46bc1c0f017545fa77dd9035f749bed07214718573973c8cf290c8d3c2bddfb2` |
| 9       | `0009_source_snapshot.sql`                        | Append-only source representations and extractor identity    | `202b908f5266a883bb977234f6acdcc569ce953703fba3e353762aad29abac1e` |
| 10      | `0010_provenance.sql`                             | Field-level source/method/excerpt/confidence evidence        | `2b55bc26068aef03953d5ec52b37f0f94f79783263c3e0ca7706a66cdca56470` |
| 11      | `0011_company_alias.sql`                          | Provenance-backed company aliases                            | `cd483c992a86de871b87cc01961d903089e7b15c769957e9c53a6e9877393149` |
| 12      | `0012_contact_point_provenance.sql`               | Hashed contact-field provenance links                        | `6bbe74d3ed2e879905032ca717b7cbdad5f836fdbdc7498c29b1edd9f06c61e1` |
| 13      | `0013_field_value.sql`                            | Candidate history, user confirmation, and supersession       | `76daa7c3e899d5c8238611c25e714257340cf2965dc920b5f4cac5d47dfdacd1` |
| 14      | `0014_status_definition.sql`                      | Custom stages mapped to stable reporting categories          | `480c766905306953b0ac2e64b37538456d9e8193d46ad356bf68636025539a1b` |
| 15      | `0015_job_current_status.sql`                     | Nullable current-stage projection on jobs                    | `48f3ec97fa43afc2553c5e599f1a4956236c52793957542dc730a00ea5adf685` |
| 16      | `0016_job_next_action.sql`                        | Nullable next-action time projection on jobs                 | `853dfbbc3c5edc2b851581e4f1164c542e5cbe2d06f888e44f9539ff6c9de557` |
| 17      | `0017_application.sql`                            | Explicit application attempts and selected-document links    | `2af15e2eb7cda5a5d098ed79430b1d169e2c5e5ee5d8f1c4609e0291b0b97a28` |
| 18      | `0018_status_event.sql`                           | Append-only application and job stage history                | `d587d4ad15c95a6be314db5b9a157b39a1f68ee9b4bdcfa5b7e99e9c019cb1b7` |
| 19      | `0019_interaction.sql`                            | Job/contact interaction timeline records                     | `c40fea3c5ff0f7158550d6b959b891cddf1786f388b83ddc4a3747211e8fe09e` |
| 20      | `0020_next_action.sql`                            | Action state and due-time records                            | `60618614c34d8da45ae56a7c48a22ada6289e917f5c7e12f320226294f6443b4` |
| 21      | `0021_interview.sql`                              | Time-zone-aware interview records                            | `8be74d8642e0e3569cb850fdfaf9008dcc732dff9ce2c4cf48f8dbd7a0e67397` |
| 22      | `0022_reminder.sql`                               | Local reminder state and firing timestamps                   | `8733bd0e014116147c0fa9fdb1d1b88a971ca486ab67bccc31f4593ef7feb29f` |
| 23      | `0023_tag.sql`                                    | User-defined tag records                                     | `e7534c2ac9c5ed2b711e8dc891a0594ade74d83256a95d19e14aa41bfe879a18` |
| 24      | `0024_job_tag.sql`                                | Idempotent job-to-tag assignments                            | `08f1e67e45e3e2d71ec13dad486bd17697084f50750c7306e177907eec28ede8` |
| 25      | `0025_saved_view.sql`                             | Versioned job-filter views and UI settings                   | `1a743c44b57c4739938427e098fdf95869ba13d73372bfa41fb4ee8c1e96d165` |
| 26      | `0026_document.sql`                               | Typed document identity and archive state                    | `97b51e02650c630d765e96490e342cc066d6e6959f80116dad3c86b3ac2dabfc` |
| 27      | `0027_document_version.sql`                       | Immutable canonical-IR document versions and lineage         | `a3afe47339e16effa50ca068abdbcfba4987383f3408bb7529fdbbd51a1e745a` |
| 28      | `0028_document_job_link.sql`                      | Purpose-qualified document-to-job relationships              | `97cfab23cf24a179def7540c48999a1a7f6a7d32c8ade40c63c3173c3fbf2cab` |
| 29      | `0029_attachment_manifest.sql`                    | Content-addressed attachment metadata without bytes          | `6305892c6e9e805cdaa43cac84f6509a4b6c7540ebf5319ff784a028cb1c8169` |
| 30      | `0030_document_version_attachment.sql`            | Logical version-to-attachment relationships                  | `b68c55bca6561ad49c301bab8ddb290cf919388ed4015cd6361996ca8312ce99` |
| 31      | `0031_document_style_example.sql`                 | Version-scoped style-example selections                      | `2f1fcbe6efc83a5b764a6694da5ad38f22dc48baa808895ff718f2fce55f4c91` |
| 32      | `0032_device.sql`                                 | Stable local device identity and audit heartbeat             | `14f973c2b620bc7ceee79202a8652d2c03bbf05e6b6605710fb216dbaad936eb` |
| 33      | `0033_integrity_probe.sql`                        | Transaction-scoped upgrade-integrity probe                   | `9952bc132c651d19d58c487730a375d3fa2afe2752813df498dedee4a7692371` |
| 34      | `0034_validate_existing_integrity.sql`            | Fail-closed audit, selection, and lineage validation         | `b4458f02b159299f4b40e4b83140b5d88aebc1eb6881967cb6865fd074873cfd` |
| 35      | `0035_drop_integrity_probe.sql`                   | Removal of the successful upgrade probe                      | `42a37ed5951826eb00a0d96e062ef1a78b401e9ff402b923facfb47ae1e271cb` |
| 36      | `0036_application_document_insert_guard.sql`      | Selected application-document kind validation on insert      | `351a6a4a334aeea1fe5fd69e0eef676d0b8fe23c69094a24544e1d1600459676` |
| 37      | `0037_application_document_update_guard.sql`      | Selected application-document kind validation on update      | `a72a42516fcd5b38e9b1aec7b12e162e91b6189e16e4f81d607330cd4e5da56c` |
| 38      | `0038_document_kind_update_guard.sql`             | Protection for selected resume and cover-letter kinds        | `cd71951d8bc20b6e177891e29669d2133f30194989b84f4f498948dbdc5d590e` |
| 39      | `0039_document_version_lineage_guard.sql`         | Database-enforced same-document consecutive lineage          | `bae6c96ec634332c6954cc31c2153abfff0e98ee4878a348e889a87b2c56f0bc` |
| 40      | `0040_document_version_update_guard.sql`          | Immutable document-version update guard                      | `4008bfe08460660cddc903702b4d09be0408b5bd401fdf9dcf780ce964e440be` |
| 41      | `0041_document_version_delete_guard.sql`          | Selected document-version deletion guard                     | `757e322984639b8b4b68c7d3e8ce9aacca3422a0475abb4fd04e8e0ccca83fcd` |
| 42      | `0042_source_snapshot_update_guard.sql`           | Append-only source-snapshot update guard                     | `54cf44bfd01aefb0505d8d279c539b515565c83676a56c5d3fab81c2d2a0386c` |
| 43      | `0043_status_event_update_guard.sql`              | Append-only status-event update guard                        | `6814589c50b51b1d4fbae43e43666b937a834412ce6edb52542154810aac4489` |
| 44      | `0044_interaction_update_guard.sql`               | Append-only interaction update guard                         | `406f6bf7883ca0063e34a4255142daf4fda7d2036da41d085683330ed5347ccc` |
| 45      | `0045_attachment_manifest_update_guard.sql`       | Immutable content-addressed manifest update guard            | `1c1620ba056017a190ece80a4a6fa976f29c88abf9fded279307f3a254456df6` |
| 46      | `0046_job_active_updated_index.sql`               | Active-job recency query index                               | `53c195c2b5d5270824d823e237fb235f99a67cce7aa14e2db62ce2485bbdc66e` |
| 47      | `0047_job_company_active_index.sql`               | Active company-job query index                               | `3b418746df40ea39aea7e9f0b32bda780b9c3a438d9725b9e559023da9a3eef1` |
| 48      | `0048_job_status_active_index.sql`                | Active pipeline-status query index                           | `ddedcd351762017cad4fabc7aa981080fc13adf76743f776d94bf6a1494f83f7` |
| 49      | `0049_job_next_action_active_index.sql`           | Active next-action projection index                          | `f5f074fdfa7f277c7b97ff1e6c78496757d869695a463412db6791351443edc9` |
| 50      | `0050_job_date_posted_active_index.sql`           | Active posting-date query index                              | `a88f9338d8d2bf075636fe846ecabc605c7f2beb36417c7731c11e84231a164d` |
| 51      | `0051_job_workplace_active_index.sql`             | Active workplace filter index                                | `0d269fcb1c9897a3b270dd53e350ac1b57ad4cc4b2a93316834a8a86a12572d3` |
| 52      | `0052_job_employment_active_index.sql`            | Active employment filter index                               | `cb479679d95aeb7913eaa86390604a98b981dcd2154abf856ebd144d4751f20e` |
| 53      | `0053_job_seniority_active_index.sql`             | Active seniority filter index                                | `bacb3697a1a598ecf27a06637f34059f5b639d1c4bcf47197e74001cf9e8df50` |
| 54      | `0054_job_location_active_index.sql`              | Active location filter index                                 | `a51a78df69044f74430dbcdb2b1a72b41ab1ca64fc6ca3e1d983427aa6cd0d5c` |
| 55      | `0055_job_normalized_title_active_index.sql`      | Active normalized-title filter index                         | `57c8082379681b017be0204d82df237e253b69e2596be0d9d6fd127e4cba38a4` |
| 56      | `0056_job_source_job_connector_index.sql`         | Correlated source-connector filter index                     | `457cd753bcdabced6f6466df116d5e07bc41f1c39d504a60073da956a1b1c0e0` |
| 57      | `0057_job_source_canonical_url_index.sql`         | Canonical-URL candidate index                                | `95cc5ae5f39b1dd4e552261484647b4aed595fef5fd1e14a04b465696a996905` |
| 58      | `0058_job_source_content_hash_index.sql`          | Source-content candidate index                               | `61249a5e0c9da5f3441e7b021c44729aaf69e512158a4c2124135f5554a32c51` |
| 59      | `0059_source_snapshot_timeline_index.sql`         | Source-snapshot timeline index                               | `d4ba210c308adb8e2e3bcf114015416cae9020666f21ff18b3a3ea508b2bf38d` |
| 60      | `0060_field_value_history_index.sql`              | Provenance candidate-history index                           | `76c79acd42b7076365fd2221cb18ab412171155943388542d70bb83b471e0bec` |
| 61      | `0061_application_active_job_index.sql`           | Active application-per-job index                             | `7a0946ebf9d542e247633e79f25c8e2f83771fbaea5e896d2fc6c90b46c9679b` |
| 62      | `0062_status_event_timeline_index.sql`            | Job status-history timeline index                            | `3c945385e6342d0eac11194042c541d9611918bcdf04e966e515cc875858e097` |
| 63      | `0063_interaction_timeline_index.sql`             | Job interaction timeline index                               | `d964327480df556c6d33af09ae100f846b2a6db100441b007810572422c5f997` |
| 64      | `0064_next_action_due_index.sql`                  | Due-action state index                                       | `a81ba7e6658ebd4b9c2c4d1878386a3c415d0a1555e848b504b27596cbd95457` |
| 65      | `0065_interview_application_starts_index.sql`     | Application interview timeline index                         | `0c1671a156202a86b06483f2773ca1d1a21b8266ad5eebf50cb348db590b66d7` |
| 66      | `0066_reminder_pending_index.sql`                 | Pending reminder schedule index                              | `ee25e33333c4fd4b3c2170d35dd85367fe9a8e727b6cb1e2221d41b705abad52` |
| 67      | `0067_job_tag_reverse_index.sql`                  | Reverse tag-to-job index                                     | `b95f73d39096fdf28135f4900680bad4988a9965d8fde417f9bbc49e94dfbdf0` |
| 68      | `0068_document_active_updated_index.sql`          | Active document recency index                                | `5b75d2261b2a015949f50c54d2174e3b8a91a4584ed4416aaebfbd63d530120a` |
| 69      | `0069_document_job_reverse_index.sql`             | Reverse job-to-document index                                | `b187747c1cd9a30f4fd4049d943540e9b91f6bd09548213a94411b64eaa8383c` |
| 70      | `0070_document_attachment_order_index.sql`        | Version attachment ordering index                            | `d0f1157c4d69a850b6eeee60c0bcc9324ebe33294de74b470da6170e434eae2d` |
| 71      | `0071_job_search_identity.sql`                    | Stable integer identity for lexical search                   | `c08393b9b71d04a9613c4da1472f44273185be6c7c5873eb16bf4cae45a5b431` |
| 72      | `0072_job_search_identity_backfill.sql`           | Existing-job search identity backfill                        | `bac819fc508dff45eb6d630398aa503763f97f35e0430ab1a2e24d3a8ef7d92c` |
| 73      | `0073_job_search_state.sql`                       | Search content/FTS revision state                            | `f88a5653d6489d50250b1f4f124ea48b89d31736b6c4c89f8c89db2c9b8a1e9e` |
| 74      | `0074_job_search_state_seed.sql`                  | Initial search revision record                               | `2dfb9896e0bf129430b85aea91f53b1d9f46670cd7034f8ffce76398759432bb` |
| 75      | `0075_job_search_content_view.sql`                | Current-schema lexical content view                          | `cd1640a4353cc769e704a6baae5d44d2381b87fc3aa1c04488a8a8667516925c` |
| 76      | `0076_job_search_job_insert_identity.sql`         | New-job search identity trigger                              | `b28c579ca4b71310176d4831625d088974d546421b2bdff050a33f9f4663a872` |
| 77      | `0077_job_search_job_insert_revision.sql`         | New-job search revision trigger                              | `e61e47791f9d6258b60c9e0f389d62424d2e2317d75eb707c686219794ed41a9` |
| 78      | `0078_job_search_job_update_revision.sql`         | Job-content search revision trigger                          | `37628e4733b9953473bd12b64794e812fda1b056f3ebc4df5e963fb9813d0d5e` |
| 79      | `0079_job_search_job_delete_revision.sql`         | Job-delete search revision trigger                           | `058c946c53083ba50c5c2363fca3d311db6f26d4231e8f543929108224e616c5` |
| 80      | `0080_job_search_company_update_revision.sql`     | Company-content search revision trigger                      | `93bd1cfd6fed9ebeec25fcc4f15ec85ab5fbf1cae7860d8471eba93976a01c88` |
| 81      | `0081_job_search_company_delete_revision.sql`     | Company-delete search revision trigger                       | `95ffa7ede4c6c81f447e451c733b936481e4df9f30720218386d4b792db97171` |
| 82      | `0082_job_search_application_insert_revision.sql` | Application-note search revision trigger                     | `ddfeff76f025fa67d785c3ebf73a130f30800d232dc5ddc9d4f8ad2c730cb021` |
| 83      | `0083_job_search_application_update_revision.sql` | Application-content search revision trigger                  | `bb0f8ee7bf5cffca6003e174a4be07a4a89b93350e4b009ae6a47f63e2e4050b` |
| 84      | `0084_job_search_application_delete_revision.sql` | Application-delete search revision trigger                   | `c430226cf4f613b35a26edf88e782acf3af3e42677fecde57b0eff88ca4f8d8b` |
| 85      | `0085_mutation_undo_token.sql`                    | Durable status and next-action undo preconditions            | `33677d39b5f0d7b75d8bb9236f426f6a442727ed96c090fd1e4832de2474b6bf` |
| 86      | `0086_mutation_undo_token_update_guard.sql`       | Single consume-transition guard for undo tokens              | `ef20acc31f9e370a63940bb657b26c96342f30997bb1739b64bc5254903f55cb` |
| 87      | `0087_mutation_undo_token_delete_guard.sql`       | Immutable undo-token audit-record guard                      | `4239bb1e8bc4d72a41d7d7e203a534fcff4d709d0c441e03ae15f5c7139c667f` |
| 88      | `0088_local_diagnostic_event.sql`                 | Strict privacy-safe local diagnostic event table             | `d59b4641d8dab1e526f2af8a4680799cd348be976d940c207f1e49f6bb6bdbeb` |
| 89      | `0089_diagnostic_event_recent_index.sql`          | Deterministic newest-first diagnostic lookup                 | `1f0cbb9a4141f8510f4dd8781e7df43143dc33ff125911547facc768480a6b49` |
| 90      | `0090_diagnostic_event_attribute_guard.sql`       | Database allowlist for diagnostic keys and scalar values     | `b9ad09e4015f3a1b49174781514af6e0f2b3295db57d3054b5fed45d4057b73f` |
| 91      | `0091_diagnostic_event_update_guard.sql`          | Immutable local diagnostic event update guard                | `b94d7e8578a26054f52bc0b5b05c2cbce5ae524251ca9c9d63b1eb2e8ad1c426` |
| 92      | `0092_diagnostic_event_retention.sql`             | One-thousand-event newest-first retention trigger            | `c24e41c3dbadb0e11d13c7bdf2b1df42fdd9fcd1e5beecf819b42f5b25d2b6f1` |
| 93      | `0093_capture_review_item.sql`                    | Durable capture-review queue and resolution state            | `d9ba9959810a88b2e2f3b50e3c6e230643e588763752bf273d9415a774b991cd` |
| 94      | `0094_capture_review_backfill.sql`                | Pending review state for existing capture receipts           | `a4053a05aa69cd54074633500f4d8d70b1fee110cba3f63b72e04af5dfeb8b1e` |
| 95      | `0095_capture_review_insert_trigger.sql`          | Automatic review state for new capture receipts              | `539486b092afb972bd38f470496641cde22dbceb2619d2a1bcad5f0c3a3efd2f` |
| 96      | `0096_capture_review_undo.sql`                    | Durable discard-undo preconditions and audit state           | `a8bb171eccfb6bc9610cfa9df6852869109337de633021ccb9ff8d8b9936074e` |
| 97      | `0097_capture_review_queue_index.sql`             | Deterministic review-state and snooze queue index            | `c7be2e597f33da0fc5235681ad8d09af124b7b5e7bbbf9e23d4766cb56ccdd8d` |
| 98      | `0098_capture_review_transition_guard.sql`        | Allowed review-state transition and row-version guard        | `bc25b1f226fd1cd551371a20bba94e2e559a2edf4ee7e364efdda389ec06f3e0` |
| 99      | `0099_capture_review_delete_guard.sql`            | Immutable capture-review lifecycle deletion guard            | `3b785b20db0b0a6d46e06c18a82c1eb4501f3e7f1378d4ffea08618424b8cd31` |
| 100     | `0100_capture_review_undo_consume_guard.sql`      | Single consume-transition guard for discard undo             | `19beecbd97c5606f68735133817edad431018a0ff70a26c8f0b9142e160fd88f` |
| 101     | `0101_capture_review_undo_delete_guard.sql`       | Immutable discard-undo audit-record guard                    | `9e4c6302798ceaca15334120147ba00704dabaa3369419f4987bc80e18343d66` |
| 102     | `0102_experience.sql`                             | Employment evidence and dated role history                   | `3c6d9a1a8c1d635b6e2312b964e6c347ab8e8d39f85e6749457ec05b96d3ce50` |
| 103     | `0103_education.sql`                              | Education evidence and safe date ranges                      | `2df463395cc0a86bad39abe87c12326f609fa9e04026bcfb0b65ef77bc89ccde` |
| 104     | `0104_project.sql`                                | Project evidence and optional reviewed links                 | `92bb32ea19a64206475d5a5cce23c1fc54fb021a729f6cfd9607c25aad0059e8` |
| 105     | `0105_skill.sql`                                  | Canonical skills and bounded aliases                         | `424c2759199543a282c459a774367b6b3e3b08ec7b5bfb989a2e099d60c1a3cb` |
| 106     | `0106_accomplishment.sql`                         | Result evidence with bounded structured metrics              | `d9eada42519c71d687e5e91986e1d475979957a009e09c58916cf3c1fce7520f` |
| 107     | `0107_certification.sql`                          | Certification evidence and validity dates                    | `e38bcb9a7306706fdb8b7f86b80c9ce29367106892df7f82c8fd7889ffe6ec50` |
| 108     | `0108_publication.sql`                            | Publication evidence and optional public links               | `ab10f94039a83bdee0450c37138414bdaaf2d689dfabb610439131574b1c02de` |
| 109     | `0109_volunteer_experience.sql`                   | Volunteer role evidence and date history                     | `0f137932ae3cb520ae58a2d0d9d798a5dffc2d5c81cded6169a3bd0f1249154b` |
| 110     | `0110_anecdote.sql`                               | Situation/action/result career stories                       | `4df506b2773abb5985ce47e557d8faf62face183fd92d49809158c336f55f649` |
| 111     | `0111_candidate_profile.sql`                      | Singleton candidate identity and work preferences            | `65fb06081129a2aa9bb2129116d39524e4e8dd92efd41e56dd699f160eace965` |
| 112     | `0112_anecdote_privacy_tags.sql`                  | Bounded Career Profile story privacy tags                    | `3d7beb402a18669257a88c789807b1e89cabb6e957ffd2f1760e649f600bee26` |
| 113     | `0113_resume_import_run.sql`                      | Immutable local resume import metadata and source mapping    | `b6830650eb9a7ffae09f26895561c7b565e116299f1186a60e4983fb3371921d` |
| 114     | `0114_career_import_proposal.sql`                 | Field-level pending proposals with provenance and confidence | `1c81bea79774ce12b66e210fadddd8136b94f1f06f4f0ca1865d8d46c835760e` |
| 115     | `0115_career_import_proposal_queue_index.sql`     | Deterministic pending resume-proposal queue index            | `46d344ad15971c9f0db630cc31a086011f133fd3013d75788932c642d5aec928` |
| 116     | `0116_skill_import_evidence.sql`                  | Optional source-document provenance for imported skills      | `baa44a3e66c563a20e6e5456224d6d93b442a3ad15d8aa545e8821fe1f040cdd` |
| 117     | `0117_skill_import_verification.sql`              | Explicit verification state for durable skill evidence       | `0df46ee0503daec7a938cb02141ff8aed6656d1e4b78cca846d6b86900a36627` |
| 118     | `0118_career_import_resolution.sql`               | Append-only resume proposal-group resolution ledger          | `e0d289d374483459480761c3d572401ca0614070894236e0dac6f70e98caf004` |
| 119     | `0119_career_import_resolution_proposal.sql`      | Immutable proposal membership for each explicit resolution   | `06c9195abe79872ed7bf82054662287bb2894f76539a69937e676d2b95d47e5d` |
| 120     | `0120_anecdote_evidence_link.sql`                 | Strict canonical evidence links for Career Profile stories   | `888ea7f5b55eba890ae75503702e4334213a92489bb00f32b4ddb81b2b76c5a0` |
| 121     | `0121_answer_library_entry.sql`                   | Answer provenance and explicit last-used state               | `c03c04dd09995ad390faf1df3d2165f522a7e5334bd49fb937bf00969c233dab` |
| 122     | `0122_answer_library_version.sql`                 | Per-version question and sensitivity metadata                | `7a72d95235de8fd27338f9e7f612d7a767070432df13707320728a560cafdcc4` |
| 123     | `0123_answer_library_entry_insert_guard.sql`      | Answer entry/document relationship guard                     | `044163a66e0af34741108d0ce7c9a5768577660070d6088e786644ef2290fc4e` |
| 124     | `0124_answer_library_document_update_guard.sql`   | Answer document identity guard                               | `ca313f2215376d98118b00ce2391dee25c062a451856c0f4f0fb0cacf0df65d8` |
| 125     | `0125_answer_library_version_insert_guard.sql`    | Answer metadata/version relationship guard                   | `978389958a6d3630aeb780bf4bae91d587e270437e45d7d7cfbbff792f09c1ae` |
| 126     | `0126_answer_library_version_update_guard.sql`    | Immutable answer-version metadata guard                      | `acc0afff6ae788d9cc1c881944312608f409b79ee5c691e7facacfe051f6e8f8` |
| 127     | `0127_job_requirement.sql`                        | Provenance-bound five-category job requirements              | `6372a38d07c3d5748ee77de27d875b868e1310c6d6d04eaf62ba79cbf5b73ef9` |
| 128     | `0128_job_requirement_job_order.sql`              | Deterministic per-job requirement ordering                   | `21bfe8d861ce2f55ec9ad0b36dd44922864d0b324d15169f6fa172c70cd5b71e` |
| 129     | `0129_job_requirement_source_update_guard.sql`    | Immutable extracted requirement source facts                 | `40d4b087a88cbbad411a4b3495ec0ad4c672f83efd0c9a86d45689f503850610` |
| 130     | `0130_skill_evidence.sql`                         | Strict skill-to-canonical-evidence relationships             | `d199bd204c9d60ad42783a35aa8acd4bfa47083c8baf2e620b7d803a1822f594` |
| 131     | `0131_job_requirement_evidence_selection.sql`     | Deliberate requirement-to-evidence selections                | `76d72132d40ad4b6ab0b302d60939ffefb3ac54daa11a177dd2b350f5e9ffb4c` |
| 132     | `0132_career_evidence_search_content.sql`         | Rebuildable career-evidence lexical search projection        | `48b66bbe7c465f87e6df01cbe77b5507250cf5ef9c117cdcfbc6cf20f50af120` |
| 133     | `0133_job_requirement_coverage_decision.sql`      | Versioned user-reviewed requirement coverage decisions       | `d3e364a6ee43f6c09556292ec22bf39a468c1398b3c5ef242212eda2cdd84e87` |

The Phase 0 tables remain compatible and continue to store the durable capture envelope before acknowledgement. Versions 3–92 implement the reviewed tracker, pipeline, saved-view, document-manifest, local-device, audit, integrity, query-index, lexical-search, durable mutation-undo, and bounded privacy-safe diagnostic persistence. Versions 93–101 add durable capture-review lifecycle state, receipt backfill and insertion, a deterministic queue index, guarded transitions, atomic resolution links, and single-use discard undo. Versions 102–111 add the explicit Career Profile repository family without adding import, editor, AI, or network behavior. Version 112 adds bounded story privacy tags while keeping ordinary topic tags separate. Versions 113–115 store local resume import metadata and field-level pending proposals with source pointers, excerpts, confidence, and a deterministic queue index; they do not write Career Profile evidence or confer verification. Versions 116–119 add imported-skill provenance and verification state plus an append-only accept, merge, or reject ledger that retains exact proposal membership. Version 120 adds strict story-to-evidence links whose concrete foreign keys keep every relationship attached to one existing canonical Career Profile record. Versions 121–126 add Answer Library provenance and last-used state, bind every answer to the existing immutable document-version lineage, classify each version as standard, sensitive, or restricted, and guard those relationships and version metadata. Versions 127–129 add immutable requirement source facts plus explicit reviewed recategorization. Versions 130–132 add typed skill/evidence relations, deliberate requirement/evidence selections, and the normal career-evidence search view; the optional FTS5 table remains an adapter-owned rebuildable artifact. Save and merge promotion remains an explicit transaction and never silently overwrites a user-confirmed Career Profile entry. Diagnostic events retain only the versioned allowlisted operational envelope and at most 1,000 newest records. FTS5 artifacts remain capability-conditioned and rebuildable. Binary attachment I/O remains owned by a later checklist slice.

Versions 127–129 add provenance-bound job requirements and protect immutable extracted source facts. Versions 130–132 add strict skill relations, deliberate requirement evidence selections, and a regular career-evidence search projection. The FTS5 index over that projection remains capability-conditioned and rebuildable rather than durable truth; normalized-token fallback keeps retrieval available when FTS5 is absent.

Version 133 stores an optimistic user-reviewed coverage decision together with its requirement row version and canonical evidence-selection basis. If either basis changes, the read model keeps the user decision and marks it stale rather than silently replacing it.
