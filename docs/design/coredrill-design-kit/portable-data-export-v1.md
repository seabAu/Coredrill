# Portable human-readable data export version 1

## Purpose and authority

This document is the normative field-mapping record for the D-051 human-readable export implemented by `BKP-002`. It defines the paired `data/<dataset>.json` and `data/<dataset>.csv` projections carried by the version-1 portable archive. The archive's `database.sqlite3` remains the lossless restore source; these projections provide inspectability and migration independence without pretending that CSV preserves every SQLite distinction.

Version 1 reads one consistent transaction from database schema `92`. A schema change must either preserve this mapping deliberately or introduce a reviewed export version. The stored `vault.schema_version` is the schema at vault creation and need only be a positive integer; it is not the current migration level.

## Dataset envelope

Each JSON file is a strict UTF-8 JSON object with:

- `specVersion`: `1`;
- `dataset`: the dataset name below;
- `generatedAt`: the archive generation instant;
- `vaultId`: the selected vault UUID;
- `sourceSchemaVersion`: `92`;
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
| `location` | `id`, `label`, `address_locality`, `region`, `postal_code`, `country_code`, `latitude`, `longitude`, `precision`, `source`, `created_at`, `updated_at`, `row_version` | `id` |
| `company` | `id`, `canonical_name`, `website_url`, `domain`, `location_id`, `notes`, `archived_at`, `created_at`, `updated_at`, `row_version` | `id` |
| `contact` | `id`, `company_id`, `name`, `role`, `email`, `phone`, `public_profile_url`, `confidence`, `user_confirmed`, `notes`, `archived_at`, `created_at`, `updated_at`, `row_version` | `id` |
| `job` | `id`, `company_id`, `title`, `normalized_title`, `description_text`, `employment_type`, `workplace_type`, `seniority`, `location_id`, `remote_region_json`, `date_posted`, `valid_through`, `current_status_id`, `next_action_at`, `archived_at`, `created_at`, `updated_at`, `row_version` | `id` |
| `job_source` | `id`, `job_id`, `connector_id`, `external_id`, `canonical_url`, `apply_url`, `first_seen_at`, `last_seen_at`, `content_hash`, `is_primary`, `created_at`, `updated_at`, `row_version` | `job_id`, `id` |
| `source_snapshot` | `id`, `job_source_id`, `captured_at`, `extractor_id`, `extractor_version`, `raw_text`, `sanitized_html`, `structured_json`, `content_hash`, `retention_class`, `created_at`, `row_version` | `job_source_id`, `captured_at`, `id` |
| `provenance` | `id`, `source_snapshot_id`, `extraction_method`, `source_pointer`, `source_excerpt`, `confidence`, `captured_at`, `license_note`, `created_at`, `row_version` | `source_snapshot_id`, `captured_at`, `id` |
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

## Explicit exclusions

The following are runtime, derived, diagnostic, or migration machinery and do not belong in the human-readable projection: `coredrill_schema_migration`, `device`, `diagnostic_event`, `job_fts`, `job_search_identity`, `job_search_state`, `mutation_undo_token`, and SQLite internal tables. The portable archive still carries the complete SQLite database, so these exclusions do not remove restore state.

## Limits and failure behavior

The writer accepts at most 64 columns and 250,000 rows per dataset. It rejects a cell above 16 MiB, a generated data file above 128 MiB, or combined JSON/CSV data above 384 MiB. Invalid caller UUID/timestamp input fails before opening a transaction. Schema drift, a missing or mismatched vault, query failure, invalid JSON/boolean/binary/non-finite data, contract failure, or size overflow yields a stable redacted typed error and no successful partial bundle.

All 29 queries execute within one `DatabasePort` transaction. Only after every dataset validates are the 58 ordered files returned to the portable archive writer.
