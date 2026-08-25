# 03 — Data model, search, and migrations

## Conventions

- UUIDv7 IDs generated locally; never rely on server sequences.
- UTC ISO timestamps plus explicit IANA timezone when a future local-time interpretation matters.
- Soft/archive state for user records; append-only history for statuses, interactions, generation runs, and source snapshots.
- Money uses integer minor units, ISO currency, interval (`hour`, `year`, etc.), and normalization metadata. Never binary floating point.
- User-entered and extracted rich text is stored as safe Markdown/plain text. Raw HTML snapshots are quarantined and sanitized before display.
- Every externally derived field can point to one or more provenance records.
- All tables carry `created_at`, `updated_at`, and `row_version` where sync/conflict detection may matter.

## Core entities

### Vault and settings

`vault(id, name, schema_version, created_at, last_opened_at)`  
`app_setting(key, json_value, updated_at)`  
`device(id, label, platform, created_at, last_seen_at)` — local now; sync later.

Secrets are not stored in ordinary settings.

### Candidate/career evidence

`candidate_profile(id, display_name, summary, target_roles_json, location_id, work_preferences_json)`

`experience(id, organization, role, start_date, end_date, current, description, source_document_id, verification_state)`

`education(id, institution, credential, field, start_date, end_date, details, verification_state)`

`skill(id, canonical_name, category, aliases_json)`

`skill_evidence(id, skill_id, evidence_entity_type, evidence_entity_id, proficiency, years_estimate, narrative, verification_state)`

`project(id, name, summary, url, start_date, end_date, verification_state)`

`accomplishment(id, parent_type, parent_id, action, result, metrics_json, verification_state)`

`certification(id, name, issuer, issued_date, expires_date, credential_url, verification_state)`

`anecdote(id, title, situation, action, result, tags_json, verification_state)`

Verification state: `imported`, `user_confirmed`, `source_backed`, `stale`, `disputed`. “Years of experience” is an estimate derived from dated evidence and user confirmation, not an unquestioned LLM output.

### Companies and contacts

`company(id, canonical_name, website_url, domain, location_id, notes, archived_at)`

`company_alias(id, company_id, alias, source_provenance_id)`

`contact(id, company_id, name, role, email, phone, public_profile_url, confidence, user_confirmed, notes)`

`contact_point_provenance(id, contact_id, field_name, value_hash, provenance_id)`

A contact field is nullable and never guessed. Store public data only when source policy permits and the user has a legitimate job-search purpose; support deletion and expiry review.

### Jobs and requirements

`job(id, company_id, title, normalized_title, description_text, employment_type, workplace_type, seniority, location_id, remote_region_json, date_posted, valid_through, current_status_id, next_action_at, archived_at)`

`job_source(id, job_id, connector_id, external_id, canonical_url, apply_url, first_seen_at, last_seen_at, content_hash, is_primary)`

`source_snapshot(id, job_source_id, captured_at, extractor_id, extractor_version, raw_text, sanitized_html, structured_json, content_hash, retention_class)`

`job_requirement(id, job_id, kind, normalized_text, raw_text, skill_id, required_level, years_min, years_max, confidence, user_confirmed, sort_order)`

Requirement kind: `required`, `preferred`, `responsibility`, `education`, `certification`, `work_authorization`, `other`.

`job_tag(job_id, tag_id)` and `tag(id, name, color)`.

### Field provenance

`provenance(id, source_snapshot_id, extraction_method, source_pointer, source_excerpt, confidence, captured_at, license_note)`

`field_value(id, entity_type, entity_id, field_name, normalized_json, provenance_id, is_user_confirmed, superseded_by_id)`

The main entity contains the current resolved value for efficient queries. `field_value` retains candidates/history and explains why it was chosen. User confirmation wins until the user accepts a new value.

### Pipeline and interactions

`status_definition(id, name, category, color, is_system, sort_order, terminal)`

Seed categories: `viewed`, `saved`, `preparing`, `applied`, `response`, `interview`, `offer`, `rejected`, `withdrawn`, `archived`. Users can add named statuses without breaking aggregate reporting because each maps to a category.

`status_event(id, job_id, application_id, from_status_id, to_status_id, occurred_at, note)` — append-only; current status is a maintained projection.

`interaction(id, job_id, contact_id, type, occurred_at, direction, summary, next_action_at)`

`interview(id, application_id, stage_name, starts_at, timezone, duration_minutes, location_or_url, contact_ids_json, preparation_notes, outcome)`

`application(id, job_id, applied_at, channel, current_status_id, selected_resume_version_id, selected_cover_letter_version_id, notes)`

One job may have multiple applications only when the user explicitly creates them; otherwise enforce one active application per job.

### Documents and generation

`document(id, kind, title, source, accepted_as_style_example, archived_at)`

`document_version(id, document_id, version_number, content_markdown, content_plain, template_id, created_by, created_at, parent_version_id, content_hash)`

Kind: `resume`, `cover_letter`, `application_answer`, `follow_up`, `other`.

`document_job_link(document_id, job_id, purpose)`

`prompt_template(id, external_key, version, purpose, template_json, active, created_at)`

`generation_run(id, purpose, job_id, document_version_id, provider_kind, model_id, model_version, prompt_template_id, context_manifest_json, request_hash, started_at, completed_at, status, error_code, token_usage_json, cost_minor_units, currency, data_destination)`

Do not store raw provider credentials or hidden chain-of-thought. Store the rendered prompt only if the user's privacy setting permits; always store a manifest of which local evidence IDs/templates were used.

`claim(id, generation_run_id, document_version_id, text, claim_kind, support_state, user_disposition)`

`claim_evidence(claim_id, evidence_type, evidence_id, support_strength, rationale)`

Support states: `supported`, `partially_supported`, `unsupported`, `non_factual`. Unsupported factual claims block “verified” export until edited or explicitly acknowledged.

### Salary and labor data

`salary_observation(id, job_id, company_id, occupation_code, location_id, min_minor, max_minor, currency, interval, source_kind, source_id, observed_at, confidence, caveats_json)`

`labor_dataset(id, provider, dataset_name, release_version, retrieved_at, license_url, checksum)`

`labor_stat(id, dataset_id, occupation_code, geography_code, period, currency, interval, percentile, value_minor, sample_notes)`

`compensation_estimate(id, job_id, generated_at, occupation_mapping_json, geography_mapping_json, band_min_minor, band_max_minor, target_minor, confidence, explanation_json)`

All estimates remain reproducible from input observations/dataset versions.

### Capture/import/connectors

`capture_envelope(id, spec_version, captured_at, source_url, source_kind, page_title, payload_json, content_hash, extension_version, state, error_code)`

`import_run(id, kind, source_name, source_hash, mapping_json, started_at, completed_at, status, summary_json)`

`connector(id, kind, display_name, version, enabled, policy_state, terms_url, policy_reviewed_at, last_success_at, kill_reason)`

`connector_run(id, connector_id, started_at, completed_at, request_summary_json, status, result_count, error_code)`

## Location

`location(id, label, address_locality, region, postal_code, country_code, latitude, longitude, precision, source)`

- Coordinates are optional and precision is explicit.
- Radius uses great-circle distance locally.
- Driving time is a separate optional routing-provider result with timestamp/provider; never approximate it as radius.
- Remote eligibility is modeled separately from office location.

## Filter AST

```ts
type FilterNode =
  | { type: "group"; op: "and" | "or"; negated: boolean; children: FilterNode[] }
  | { type: "predicate"; field: FilterField; operator: FilterOperator; value: JsonValue };
```

Validate maximum depth/count and field/operator compatibility. Compile to parameterized SQL through an allowlist. Saved views store versioned AST JSON and UI settings.

## Indexes and constraints

- Unique `job_source(connector_id, external_id)` where external ID exists.
- Index/candidate unique on normalized canonical URL and content hash.
- Index jobs by current status, company, dates, next action, workplace type, normalized title.
- FTS over job title/description/company/requirements/notes and career evidence, with contentless/external-content tables as appropriate.
- Unique document version per document/version number.
- Status and generation history append-only through repository rules/triggers where practical.
- Foreign keys enabled in both SQLite adapters; migration tests confirm it.
- Check money ranges (`min <= max`), date ranges, confidence 0–1, and nonnegative years.

## Migrations and compatibility

- Numbered forward migrations are common to browser and native adapters.
- Never rely on ORM auto-sync in production.
- Before migration: verify schema version, create/confirm export checkpoint, test available space.
- Migration runs in a transaction when SQLite permits; complex table rebuilds use a tested staged script.
- Portable exports include app version, schema version, migration history, attachment checksums, and encryption metadata.
- Older clients fail safely on newer schema; they never attempt a downgrade write.
- Every release tests fresh install, each supported upgrade path, failed migration rollback, export/restore, and cross-adapter logical equivalence.

The first shared migration, `migrations/0001_vault.sql`, creates the strict vault root. `migrations/0002_capture_inbox.sql` adds the durable extension receipt needed to commit a validated source envelope before acknowledgement; it records envelope ID, content hash, checksum, sender ID/sequence/nonce, timestamps, receipt path, and complete envelope JSON, but does not promote the capture into a reviewed job record. Phase 1 migrations `0003` through `0013` add settings, locations, companies, contacts, jobs, job sources, immutable source snapshots, provenance, company aliases, contact-point provenance, and retained field-value candidates. User confirmation metadata is all-or-none, and a confirmed field candidate can be superseded only through the focused explicit replacement transaction.

The storage-core migration runner validates contiguous positive versions, stable kebab-case names, lowercase SHA-256 checksums, and nonempty SQL. It creates a strict `coredrill_schema_migration(version, name, sha256, applied_at)` ledger, verifies every previously applied row against reviewed source, applies new SQL and `PRAGMA user_version` in one adapter transaction, and fails closed on source drift. A shared repository contract suite applies all migrations and exercises parameter binding, foreign-key rollback, candidate retention, and explicit confirmed replacement against browser and native SQLite. The schema remains incomplete until the later Phase 1 repository slices add pipeline, application, document, audit/tombstone, index, and FTS structures with their own compatibility proof.

## Future sync readiness

Reserve `row_version`, `updated_at`, and stable IDs now; add an append-only `sync_op` table only when sync is implemented. Do not burden v1 with a speculative CRDT. The later sync ADR must define per-entity conflict rules, tombstones, attachment handling, encryption, compaction, and device removal before a server endpoint exists.
