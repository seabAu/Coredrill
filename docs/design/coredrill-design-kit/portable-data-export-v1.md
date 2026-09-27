# Portable human-readable data export version 1

## Purpose and authority

This document is the normative field-mapping record for the D-051 human-readable export implemented by `BKP-002`. It defines the paired `data/<dataset>.json` and `data/<dataset>.csv` projections carried by the version-1 portable archive. The archive's `database.sqlite3` remains the lossless restore source; these projections provide inspectability and migration independence without pretending that CSV preserves every SQLite distinction.

Version 1 reads one consistent transaction from current database schema `133` and retains reviewed compatibility with schema milestones `101`, `111`, `112`, `115`, `126`, `129`, and `132`. The writer emits only datasets and columns that exist at the selected source milestone: 30 Phase 1 datasets at schema 101, 40 datasets through the initial Career Profile schema, 42 through the import proposal queue, 47 through the completed evidence schema, 48 through provenance-bound requirements, 50 through requirement/evidence selection, and all 51 datasets at schema 133. The authoritative SQLite member remains the lossless restore source. A later schema change must either preserve this mapping deliberately or introduce a reviewed export version. The stored `vault.schema_version` is the schema at vault creation and need only be a positive integer; it is not the current migration level.

## Dataset envelope

Each JSON file is a strict UTF-8 JSON object with:

- `specVersion`: `1`;
- `dataset`: the dataset name below;
- `generatedAt`: the archive generation instant;
- `vaultId`: the selected vault UUID;
- `sourceSchemaVersion`: the exact reviewed source milestone (`101`, `111`, `112`, `115`, `126`, `129`, `132`, or `133`);
- `columns`: the ordered field names below;
- `rowCount`: the exact number of rows;
- `rows`: objects containing exactly those fields in that order; and
- `csv`: metadata declaring UTF-8, comma delimiter, header presence, CRLF records, empty-unquoted nulls, and formula-prefix hardening.

JSON text stored in SQLite is parsed into real JSON values. Object keys are sorted recursively so identical data produces identical bytes. SQLite boolean integers are emitted as JSON booleans. Other finite numbers, strings, and nulls retain their JSON representation; binary values are rejected.

## CSV representation

Each CSV file uses the same column and row order as its JSON partner. It follows the record and escaping conventions of [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180): UTF-8 text, a header record, comma delimiters, CRLF record endings, doubled embedded quotes, and quoted string fields. Embedded line endings are normalized to CRLF.

- SQL null is an empty unquoted field.
- Strings are always quoted, including the empty string, preserving the null/empty distinction.
- Booleans are `true` or `false`; finite numbers use their canonical JSON spelling.
- JSON-valued cells contain compact canonical JSON inside a quoted CSV string.
- To prevent spreadsheet formula execution, a string whose first character is whitespace, `=`, `+`, `-`, or `@` receives a leading apostrophe in CSV only. The paired JSON and SQLite database retain the original value.

Because formula hardening deliberately changes risky CSV text, CSV is an inspectable interchange view, not the authoritative restore representation.

## Included canonical datasets

Rows use the stable ordering in the final column. Every listed field is projected, including provenance links, relationship keys, user-confirmation state, row versions, and nullable values.

| Dataset | Ordered fields | Stable row order |
| --- | --- | --- |
| `vault` | `id`, `name`, `schema_version`, `created_at`, `last_opened_at` | `id` |
| `app_setting` | `key`, `json_value`, `updated_at`, `row_version` | `key` |
| `capture_inbox` | `envelope_id`, `content_hash`, `envelope_checksum`, `sender_id`, `sender_sequence`, `sender_nonce`, `captured_at`, `expires_at`, `received_at`, `received_via`, `envelope_json` | `envelope_id` |
| `capture_review_item` | `envelope_id`, `state`, `snoozed_until`, `resolution_kind`, `resolved_job_id`, `updated_at`, `row_version` | `envelope_id` |
| `location` | `id`, `label`, `address_locality`, `region`, `postal_code`, `country_code`, `latitude`, `longitude`, `precision`, `source`, `created_at`, `updated_at`, `row_version` | `id` |
| `company` | `id`, `canonical_name`, `website_url`, `domain`, `location_id`, `notes`, `archived_at`, `created_at`, `updated_at`, `row_version` | `id` |
| `contact` | `id`, `company_id`, `name`, `role`, `email`, `phone`, `public_profile_url`, `confidence`, `user_confirmed`, `notes`, `archived_at`, `created_at`, `updated_at`, `row_version` | `id` |
| `job` | `id`, `company_id`, `title`, `normalized_title`, `description_text`, `employment_type`, `workplace_type`, `seniority`, `location_id`, `remote_region_json`, `date_posted`, `valid_through`, `current_status_id`, `next_action_at`, `archived_at`, `created_at`, `updated_at`, `row_version` | `id` |
| `job_source` | `id`, `job_id`, `connector_id`, `external_id`, `canonical_url`, `apply_url`, `first_seen_at`, `last_seen_at`, `content_hash`, `is_primary`, `created_at`, `updated_at`, `row_version` | `job_id`, `id` |
| `source_snapshot` | `id`, `job_source_id`, `captured_at`, `extractor_id`, `extractor_version`, `raw_text`, `sanitized_html`, `structured_json`, `content_hash`, `retention_class`, `created_at`, `row_version` | `job_source_id`, `captured_at`, `id` |
| `provenance` | `id`, `source_snapshot_id`, `extraction_method`, `source_pointer`, `source_excerpt`, `confidence`, `captured_at`, `license_note`, `created_at`, `row_version` | `source_snapshot_id`, `captured_at`, `id` |
| `job_requirement` | `id`, `job_id`, `category`, `source_category`, `normalized_text`, `raw_text`, `provenance_id`, `confidence`, `user_confirmed`, `sort_order`, `created_at`, `updated_at`, `row_version` | `job_id`, `sort_order`, `id` |
| `company_alias` | `id`, `company_id`, `alias`, `source_provenance_id`, `created_at`, `row_version` | `company_id`, `alias`, `id` |
| `contact_point_provenance` | `id`, `contact_id`, `field_name`, `value_hash`, `provenance_id`, `created_at`, `row_version` | `contact_id`, `field_name`, `id` |
| `field_value` | `id`, `entity_type`, `entity_id`, `field_name`, `normalized_json`, `raw_json`, `provenance_id`, `is_user_confirmed`, `user_confirmation_id`, `confirmed_at`, `confirmed_value_hash`, `superseded_by_id`, `created_at`, `updated_at`, `row_version` | `entity_type`, `entity_id`, `field_name`, `created_at`, `id` |
| `status_definition` | `id`, `name`, `category`, `color`, `is_system`, `sort_order`, `terminal`, `archived_at`, `created_at`, `updated_at`, `row_version` | `sort_order`, `id` |
| `application` | `id`, `job_id`, `applied_at`, `channel`, `current_status_id`, `selected_resume_version_id`, `selected_cover_letter_version_id`, `notes`, `archived_at`, `created_at`, `updated_at`, `row_version` | `job_id`, `created_at`, `id` |
| `status_event` | `id`, `job_id`, `application_id`, `from_status_id`, `to_status_id`, `occurred_at`, `note`, `created_at`, `row_version` | `job_id`, `occurred_at`, `id` |
| `interaction` | `id`, `job_id`, `contact_id`, `type`, `occurred_at`, `direction`, `summary`, `next_action_at`, `created_at`, `updated_at`, `row_version` | `job_id`, `occurred_at`, `id` |
| `next_action` | `id`, `job_id`, `application_id`, `interaction_id`, `title`, `due_at`, `timezone`, `state`, `completed_at`, `created_at`, `updated_at`, `row_version` | `job_id`, `created_at`, `id` |
| `interview` | `id`, `application_id`, `stage_name`, `starts_at`, `timezone`, `duration_minutes`, `location_or_url`, `contact_ids_json`, `preparation_notes`, `outcome`, `created_at`, `updated_at`, `row_version` | `application_id`, `starts_at`, `id` |
| `reminder` | `id`, `job_id`, `next_action_id`, `interview_id`, `remind_at`, `timezone`, `state`, `note`, `fired_at`, `created_at`, `updated_at`, `row_version` | `job_id`, `remind_at`, `id` |
| `tag` | `id`, `name`, `color`, `archived_at`, `created_at`, `updated_at`, `row_version` | `name`, `id` |
| `job_tag` | `job_id`, `tag_id`, `created_at`, `row_version` | `job_id`, `tag_id` |
| `saved_view` | `id`, `scope`, `name`, `filter_ast_version`, `filter_ast_json`, `ui_settings_json`, `is_system`, `archived_at`, `created_at`, `updated_at`, `row_version` | `scope`, `name`, `id` |
| `document` | `id`, `kind`, `title`, `source`, `archived_at`, `created_at`, `updated_at`, `row_version` | `created_at`, `id` |
| `document_version` | `id`, `document_id`, `version_number`, `content_ir_version`, `content_ir_json`, `content_plain`, `template_id`, `created_by`, `created_at`, `parent_version_id`, `content_hash`, `label` | `document_id`, `version_number`, `id` |
| `document_job_link` | `document_id`, `job_id`, `purpose`, `created_at` | `document_id`, `job_id`, `purpose` |
| `attachment_manifest` | `content_id`, `media_type`, `byte_length`, `created_at` | `content_id` |
| `document_version_attachment` | `document_version_id`, `content_id`, `purpose`, `logical_name`, `sort_order`, `created_at` | `document_version_id`, `content_id`, `purpose` |
| `document_style_example` | `document_version_id`, `created_at` | `document_version_id` |
| `experience` | `id`, `organization`, `role`, `start_date`, `end_date`, `is_current`, `description`, `source_document_id`, `verification_state`, `archived_at`, `created_at`, `updated_at`, `row_version` | `id` |
| `education` | `id`, `institution`, `credential`, `field`, `start_date`, `end_date`, `details`, `source_document_id`, `verification_state`, `archived_at`, `created_at`, `updated_at`, `row_version` | `id` |
| `project` | `id`, `name`, `summary`, `url`, `start_date`, `end_date`, `source_document_id`, `verification_state`, `archived_at`, `created_at`, `updated_at`, `row_version` | `id` |
| `skill` | `id`, `canonical_name`, `category`, `aliases_json`, `source_document_id`, `verification_state`, `archived_at`, `created_at`, `updated_at`, `row_version` | `canonical_name`, `id` |
| `accomplishment` | `id`, `parent_type`, `parent_id`, `action`, `result`, `metrics_json`, `source_document_id`, `verification_state`, `archived_at`, `created_at`, `updated_at`, `row_version` | `id` |
| `certification` | `id`, `name`, `issuer`, `issued_date`, `expires_date`, `credential_url`, `source_document_id`, `verification_state`, `archived_at`, `created_at`, `updated_at`, `row_version` | `id` |
| `publication` | `id`, `title`, `publisher`, `published_date`, `url`, `summary`, `source_document_id`, `verification_state`, `archived_at`, `created_at`, `updated_at`, `row_version` | `id` |
| `volunteer_experience` | `id`, `organization`, `role`, `start_date`, `end_date`, `is_current`, `description`, `source_document_id`, `verification_state`, `archived_at`, `created_at`, `updated_at`, `row_version` | `id` |
| `anecdote` | `id`, `title`, `situation`, `action`, `result`, `tags_json`, `privacy_tags_json`, `source_document_id`, `verification_state`, `archived_at`, `created_at`, `updated_at`, `row_version` | `id` |
| `candidate_profile` | `id`, `singleton_key`, `display_name`, `summary`, `target_roles_json`, `location_id`, `work_preferences_json`, `created_at`, `updated_at`, `row_version` | `singleton_key` |
| `import_run` | `id`, `kind`, `source_name`, `source_format`, `source_media_type`, `source_byte_length`, `source_hash`, `source_mapping_json`, `started_at`, `completed_at`, `status`, `summary_json` | `started_at`, `id` |
| `career_import_proposal` | `id`, `import_run_id`, `target_kind`, `field_name`, `group_key`, `proposed_value`, `source_pointer`, `source_excerpt`, `confidence`, `evidence_status`, `review_state`, `created_at`, `row_version` | `import_run_id`, `group_key`, `id` |
| `career_import_resolution` | `id`, `import_run_id`, `group_key`, `target_kind`, `decision`, `target_id`, `resolved_values_json`, `resolved_at`, `row_version` | `import_run_id`, `group_key`, `id` |
| `career_import_resolution_proposal` | `resolution_id`, `proposal_id`, `linked_at` | `resolution_id`, `proposal_id` |
| `anecdote_evidence_link` | `anecdote_id`, `evidence_kind`, `evidence_id`, `experience_id`, `education_id`, `project_id`, `skill_id`, `accomplishment_id`, `certification_id`, `publication_id`, `volunteer_experience_id`, `created_at` | `anecdote_id`, `evidence_kind`, `evidence_id` |
| `skill_evidence` | `id`, `skill_id`, `evidence_kind`, `evidence_id`, `experience_id`, `education_id`, `project_id`, `accomplishment_id`, `certification_id`, `publication_id`, `volunteer_experience_id`, `anecdote_id`, `narrative`, `verification_state`, `created_at` | `skill_id`, `evidence_kind`, `evidence_id` |
| `job_requirement_evidence_selection` | `requirement_id`, `evidence_kind`, `evidence_id`, `experience_id`, `education_id`, `project_id`, `skill_id`, `accomplishment_id`, `certification_id`, `publication_id`, `volunteer_experience_id`, `anecdote_id`, `selected_at` | `requirement_id`, `evidence_kind`, `evidence_id` |
| `job_requirement_coverage_decision` | `requirement_id`, `coverage_state`, `requirement_row_version`, `selection_basis`, `decided_at`, `updated_at`, `row_version` | `requirement_id` |
| `answer_library_entry` | `document_id`, `source_kind`, `source_job_id`, `source_context`, `last_used_at`, `created_at` | `created_at`, `document_id` |
| `answer_library_version` | `document_version_id`, `question`, `sensitivity` | `document_version_id` |

Schema 111 omits `anecdote.privacy_tags_json`; schema 112 adds it. Schemas 111, 112, and 115 omit the later `skill.source_document_id` and `skill.verification_state` columns; schema 126 includes both. Schema 129 adds `job_requirement`. Schemas 130 and 131 add `skill_evidence` and `job_requirement_evidence_selection`; schema 132 adds only a derived view and therefore no additional user dataset. Schema 133 adds `job_requirement_coverage_decision`. This compatibility filtering is explicit and tested rather than relying on failed queries.

## Explicit exclusions

The following are runtime, derived, diagnostic, short-lived undo, or migration machinery and do not belong in the human-readable projection: `capture_review_discard_undo_token`, `coredrill_schema_migration`, `device`, `diagnostic_event`, `job_fts`, `job_search_identity`, `job_search_state`, `mutation_undo_token`, and SQLite internal tables. The portable archive still carries the complete SQLite database, so these exclusions do not remove restore state.

## Limits and failure behavior

The writer accepts at most 64 columns and 250,000 rows per dataset. It rejects a cell above 16 MiB, a generated data file above 128 MiB, or combined JSON/CSV data above 384 MiB. Invalid caller UUID/timestamp input fails before opening a transaction. Schema drift, a missing or mismatched vault, query failure, invalid JSON/boolean/binary/non-finite data, contract failure, or size overflow yields a stable redacted typed error and no successful partial bundle.

At schema 133, all 51 queries execute within one `DatabasePort` transaction. Only after every dataset validates are the 102 ordered files returned to the portable archive writer. A schema-inventory test fails if any durable table is neither exported nor present in the reviewed runtime-exclusion list.
