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
`device(id, label, platform, created_at, updated_at, last_seen_at, row_version)` — stable local identity and heartbeat now; cryptographic device authorization/removal remains sync-later work.

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

`next_action(id, job_id, application_id, interaction_id, title, due_at, timezone, state, completed_at)`

`interview(id, application_id, stage_name, starts_at, timezone, duration_minutes, location_or_url, contact_ids_json, preparation_notes, outcome)`

`application(id, job_id, applied_at, channel, current_status_id, selected_resume_version_id, selected_cover_letter_version_id, notes)`

`reminder(id, job_id, next_action_id, interview_id, remind_at, timezone, state, note, fired_at)`

`mutation_undo_token(id, kind, job_id, status_application_id, status_event_id, previous_status_id, expected_status_id, expected_application_row_version, next_action_id, expected_next_action_row_version, previous_next_action_at, expected_next_action_at, expected_job_row_version, created_at, consumed_at)`

Undo tokens are durable, immutable audit records except for one fresh-to-consumed transition. They retain exact row-version and projection preconditions rather than private display content. A status undo restores maintained projections and keeps the referenced append-only status event. A next-action undo dismisses its referenced action and linked pending reminders instead of deleting them. Replay and any mismatch caused by a later edit fail without partial writes.

One job may have multiple applications only when the user explicitly creates them; otherwise enforce one active application per job.

### Local diagnostics

`diagnostic_event(event_id, spec_version, occurred_at, app_version, delivery, category, name, severity, outcome, operation_id, code, duration_ms, attributes_json, redacted_attribute_count)`

Diagnostic events are immutable operational records, not user-content history. Category/name/code, scalar attribute keys, and string values are explicit allowlists; `delivery` is always `local`; arbitrary strings, nested values, paths, URLs, credentials, and job/applicant content are rejected. SQLite retains the newest 1,000 events in deterministic `occurred_at DESC, event_id DESC` order. The user-copyable version-1 support bundle contains at most 200 revalidated unique events and is assembled on demand rather than stored as a second canonical record.

### Documents and generation

`document(id, kind, title, source, archived_at, created_at, updated_at, row_version)`

`document_version(id, document_id, version_number, content_ir_version, content_ir_json, content_plain, template_id, created_by, created_at, parent_version_id, content_hash, label)`

Kind: `resume`, `cover_letter`, `application_answer`, `follow_up`, `other`.

`document_style_example(document_version_id, created_at)` — version-scoped selection without mutating immutable version content.

`document_job_link(document_id, job_id, purpose, created_at)`

`attachment_manifest(content_id, media_type, byte_length, created_at)` — `content_id` is the lowercase SHA-256 of bytes; attachment bytes remain content-addressed files outside SQLite.

`document_version_attachment(document_version_id, content_id, purpose, logical_name, sort_order, created_at)`

Canonical durable document content is Coredrill IR version 1. The documents/application boundary performs complete IR validation and deterministic plain-text derivation; storage persists bounded versioned JSON and checks the matching `specVersion` without creating a forbidden storage-core dependency on the editor adapter. Tiptap JSON is not canonical storage.

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
- FTS over the persisted job title/description/company/notes fields in Phase 1, extended to requirements and career evidence only after their owning tables exist, with contentless/external-content tables as appropriate.
- Unique document version per document/version number.
- Index diagnostics by `occurred_at DESC, event_id DESC`; retain at most the newest 1,000 immutable events.
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

The first shared migration, `migrations/0001_vault.sql`, creates the strict vault root. `migrations/0002_capture_inbox.sql` adds the durable extension receipt needed to commit a validated source envelope before acknowledgement; it records envelope ID, content hash, checksum, sender ID/sequence/nonce, timestamps, receipt path, and complete envelope JSON, but does not promote the capture into a reviewed job record. Phase 1 migrations `0003` through `0013` add settings, locations, companies, contacts, jobs, job sources, immutable source snapshots, provenance, company aliases, contact-point provenance, and retained field-value candidates. User confirmation metadata is all-or-none, and a confirmed field candidate can be superseded only through the focused explicit replacement transaction. Migrations `0014` through `0022` add custom status definitions, job status/next-action projections, explicit application attempts, append-only status events, interactions, next actions, interviews, and local reminders. Migrations `0023` through `0025` add strict tags, idempotent job-tag relationships, and saved views containing separately versioned bounded filter-AST and UI-settings JSON. The version-1 AST validator and compiler accept only reviewed stored fields and field-compatible operators, cap structural and value complexity, and emit SQL exclusively from hardcoded table/column/operator allowlists with bound values and escaped `LIKE` patterns. Migrations `0026` through `0031` add document identity, immutable canonical-IR versions with explicit parent lineage, purpose-qualified job links, content-addressed attachment metadata and logical version relationships, and version-scoped style-example selections. They store no attachment bytes or AI/provider state. Migrations `0032` through `0045` add a strict UUIDv7 local-device identity, a transaction-scoped upgrade probe that fails closed on invalid historical audit/document data, selected resume/cover-letter kind guards, same-document consecutive version-lineage enforcement, selected-version deletion protection, and update guards for immutable or append-only versions, snapshots, status events, interactions, and content-addressed manifest facts. Trigger-backed application integrity avoids a destructive application-table rebuild and its child-history cascade risk. Migrations `0046` through `0070` add reviewed ordinary and partial indexes for current tracker, source, history, scheduling, tag, document, and attachment query paths. Migrations `0071` through `0084` add stable integer search identities, a normal current-content view, durable content/FTS revision state, and FTS-independent job/company/application triggers. The rebuildable external-content FTS5 table is an adapter-managed acceleration artifact created only after a real runtime module probe, not canonical durable truth or a migration prerequisite. Migrations `0085` through `0087` add durable status/next-action undo tokens and their consume-only immutability guards. Migrations `0088` through `0092` add the strict local diagnostic table, deterministic recent-event index, database-level JSON allowlist, update immutability, and newest-1,000 retention trigger.

The storage-core migration runner validates contiguous positive versions, stable kebab-case names, lowercase SHA-256 checksums, and nonempty SQL. It creates a strict `coredrill_schema_migration(version, name, sha256, applied_at)` ledger, verifies every previously applied row against reviewed source, applies new SQL and `PRAGMA user_version` in one adapter transaction, and fails closed on source drift. Shared repository contract suites apply all migrations and exercise parameter binding, foreign-key rollback, candidate retention, explicit confirmed replacement, status-history rollback, explicit terminal-stage reopen, additional-application authorization, next-action projection consistency, durable undo/replay/stale-target behavior, idempotent active-tag assignment, versioned saved-view round trips, optimistic-write conflicts, canonical-IR version lineage, content-addressed manifest idempotency, logical attachment relationships, stable local-device audit advancement, selected-document integrity, immutable/append-only guards, reviewed query plans, runtime FTS capability selection, normalized-token fallback, search-content refresh, and privacy-safe bounded diagnostics against browser and native SQLite. Property tests separately prove valid filter round trips, typed arbitrary-input rejection, structural limits, field/operator compatibility, adversarial-value parameter binding, monotonic audit timelines, and hostile search input safety. The [DB-007 verification report](../../proof/phase-1-job-search-verification.md) binds the schema-84 compatibility and clean search benchmarks; [local diagnostic support-bundle verification](../../proof/phase-1-local-diagnostic-support-bundle-verification.md) binds the current schema-92 and v3/18 repository inventory. Later persistence slices extend this reviewed search boundary when requirements and career-evidence entities exist; they are not speculatively pre-created here.

The `APP-002` application boundary creates a manual job with a null current-status projection and changes status only through a single port action required to update the job and optional application projections while appending the timeline event in one transaction. This preserves the existing repository rollback guarantees without selecting a default display-stage name. See [manual job pipeline application verification](../../proof/phase-1-manual-job-pipeline-application-verification.md).

The `APP-003` application boundary creates pending incomplete next actions, append-only non-future interaction history, future interview schedules, and future pending local reminders. Scheduled records retain a UTC instant plus a validated canonical IANA time zone; unscheduled next actions retain neither. Operation context, not caller data, supplies creation/update audit time, and all returned activity records are revalidated against the initiating command. See [job activity application verification](../../proof/phase-1-job-activity-application-verification.md).

The `APP-004` application boundary creates explicitly user-entered companies and either user-entered or source-backed contacts. Manual contacts are user-confirmed and carry neither confidence nor source links. Every populated source-backed contact field is nullable-but-never-guessed, remains unconfirmed, and requires exactly one value-bound `contact_point_provenance` link; contact creation and those links form one atomic port action. No update or replacement path in this slice can overwrite confirmed data. See [company/contact application verification](../../proof/phase-1-company-contact-application-verification.md).

The `APP-005` application boundary reads one time-bounded Pipeline snapshot. Counts, ordered status/unassigned groups, table/board pages, and the job workspace use explicit archive and filter scope; pages share the stable keyset order `updated_at DESC, job_id ASC` and carry the final tuple as their cursor. Cross-entity job, application/status, company, source, next-action, and interaction projections are checked before returning an immutable DTO. This slice defines the adapter-neutral read contract but does not claim concrete browser/native query composition. See [Pipeline query application verification](../../proof/phase-1-pipeline-query-application-verification.md).

The `APP-006` boundary creates and updates only user-owned job views with version-1 validated filter and view-settings documents. Sort clauses are unique and allowlisted, nulls remain last, job ID is the required stable final key, and status/company grouping retains an explicit unassigned group. Updates and timestamped archive operations require optimistic row versions; duplicate clones stored filter/settings atomically rather than accepting a caller copy. System views are protected, but no system-view names or default display stages are seeded, so `Q-006` remains open. See [saved job-view application verification](../../proof/phase-1-saved-job-view-application-verification.md).

The `APP-007` boundary creates each status or next-action mutation together with a durable undo token. Consumption is single-use, restores only the exact recorded projections while their row-version preconditions still match, keeps append-only status history, dismisses created actions and linked pending reminders instead of deleting them, and rolls back on replay or stale targets. See [durable mutation-undo verification](../../proof/phase-1-mutation-undo-application-verification.md).

The `APP-008` boundary records only allowlisted version-1 diagnostic events after fail-closed attribute sanitization and exposes a user-initiated version-1 local-copy bundle. Repository reads and bundle assembly revalidate every record; returned values are copied and frozen. Arbitrary adapter exceptions collapse into stable content-free failures, and malformed stored records fail closed rather than being copied. See [local diagnostic support-bundle verification](../../proof/phase-1-local-diagnostic-support-bundle-verification.md).

## Future sync readiness

Reserve `row_version`, `updated_at`, stable entity IDs, and one local device identity now; add an append-only `sync_op` table only when sync is implemented. Existing `archived_at` fields are the local soft-delete representation, not a claim that multi-device tombstone retention or conflict semantics have been selected. Do not burden v1 with a speculative CRDT. The later sync ADR must define per-entity conflict rules, tombstones, attachment handling, encryption, compaction, cryptographic device authorization/removal, and any server cursor before a server endpoint exists.
