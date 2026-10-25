# 03 — Data model, search, and migrations

## Conventions

Published schema182 adds independent `contact_source_snapshot`,
explicit local `contact_source_use_policy` review and exact-value
`contact_field_use_review` records. Each has replacement-safe identities; source
facts are immutable, policy update is one-way disable and field-review update is
one-way revocation. Exact retained byte spans bind permission and field evidence.
Per-contact/field revision orders reviews without relying on clocks or UUID
ordering. Owned field reviews cascade only with whole-contact deletion; shared
source/permission evidence remains. The new writer supports61 datasets/122
JSON/CSV files while retaining167 and earlier milestones. No legacy origin is
backfilled, no canonical contact value changes and expiry never deletes a
contact. These are local user-review records, not legal verification or network
connector approval. Strict commands and actual shared adapter contracts,
nonempty182 generation/no-update replay, complete native recovery and normal
old/current browser/native restore/reopen now pass, with exact601a687 full hosted
closure for storage/runtime/read-display. The newer normal owned review controls
pass full final-source verification and serial extension proof; their exact new
hosted checkpoint remains open: see [persistence proof](../../proof/contact-field-use-persistence.md)
and [migration procedure](../../runbooks/schema-182-contact-field-use-evidence.md).

Company relationship integration begins with a version-1 read-only linked-job
page bound to the original viewed vault/company/revision and independent company
and job archive scopes. It projects literal job titles and current stored status,
with bounded live updated-time/ID continuation and canonical anchor checks;
it selects no private descriptions, notes, contact methods or source bodies and
reports no totals or inferred application outcomes. The shared repository
manifest advances to22/42 cases; durable SQL/export schema remains182. Actual
Node/browser/native query and normal runtime/UI focused proof exist, while full
checkpoint gates remain in progress. See [company relationship proof and
remaining requirements](../../proof/company-relationship-progress.md).

The subsequent company interaction read model advances the shared test manifest
to v23/43 without changing SQL/export182. Membership follows the mandatory job's
current company, never a contact's current employer. Vault/company revision and
independent archive scopes bind occurrence-descending/interaction-ID-ascending
live pages; references retain interaction/job versions and nullable contact ID.
Contact deletion's permitted detachment invalidates an older reference despite
preserving history content/version. Summary previews use at most1,024 UTF-8 bytes;
explicit complete-summary inspection uses bounded BLOB slices, preserving BOM,
NUL and scalar boundaries. No contact methods, descriptions, totals or historical
employer claims are projected. Actual shared adapters and normal browser/native
UI focused checks pass; complete checkpoint gates remain pending. See [company
interaction proof](../../proof/company-interaction-history-progress.md).

Company listing-source reads advance only the shared test manifest to24/44,
retaining SQL/export182. Current job membership, source update-time/ID keysets,
source and job versions bind each read. Source-only rows remain visible; an
optional latest snapshot uses capture-time descending/ID ascending, independently
of source page order. Literal URL text is separate from its validated navigation
target. Bounded fatal UTF-8 BLOB decoding rejects corrupt/oversized metadata;
no retained bodies, notes, methods, totals or inferred employer facts are read.
New captures can change the live projection. See [actual query and UI proof](../../proof/company-listing-sources-progress.md).

Recorded company stage/outcome history advances only the shared test manifest
to25/45. Existing append-only status events remain truth; current stage names,
categories and terminal flags are mutable joined metadata. All transitions are
included, with nullable application identity, retained archived applications and
exact recorded undo metadata. A cursor binds original company scope and canonical
event/job/application/stage/undo versions; stale anchors reject. Bounded BLOB
metadata excludes notes, bodies, methods, totals and inferred employer outcomes.
SQL/export182 is unchanged. See [query/adapter/normal UI proof](../../proof/company-outcome-history-progress.md).

Normal contact details now consume metadata-only canonical reviewed-use reads
independently of initial manual-entry evidence. Only a current active reviewed
basis may display the exact value; stale/failed/foreign/expired/archived reviewed
projections are withheld without rewriting values or removing manual basis.
Historical job-bound provenance describes that read's scope, not canonical
reviewed-use eligibility. Normal fields now open an AppShell-owned review
workspace with separate source retention, canonical source/terms/permission
selection, exact literal spans, purpose/deadline/expiry review and one-way
controls. Bounded metadata pages contain no bodies or totals; deliberate
inspection revalidates canonical source/terms hashes, spans and current
lifecycle. First action context and input never automatically rebase, and
uncertainty is inspected without replay. Stored profile URLs validate without
normalizing their hash-covered literal; explicit manual creation still normalizes.
Normal offline browser/native journeys and complete local checkpoint gates pass;
exact new hosted verification remains pending. See the
[normal workflow proof and limits](../../proof/normal-contact-source-use-workflow.md).

The additive version-1 contact field-use application contract separates an
independent user-supplied source snapshot from exact-value review evidence and a
runtime-resolved reviewed policy. Source metadata is not a hidden job. The
deterministic assessor checks vault/contact/field/value/source/hash/revision
scope, explicit job-search purpose, policy applicability, review/expiry and
revocation; an elapsed bound withholds basis, never deletes a contact. Its
public/licensed result describes reviewed use basis, not verified identity,
deliverability, legal certainty or sending authorization. No production contact
network policy, preset permission grant or source acquisition is approved. At
cf3c6b0 this was a pure infrastructure contract retaining167, with historical
manual receipts and the source inspector unchanged. The subsequent durable
reviewed records and normal workflow above implement separate local user review;
full INT-007 still requires remaining relationship projections and complete
checkpoint proof. See [original contract scope](../../proof/contact-field-use-qualification-contract.md).

Historical schema167 replaces the interaction update guard through paired166/167
migrations in one transaction. Only non-null-to-null contact detachment after
that parent is absent is allowed, with all other interaction columns unchanged.
The migration itself rewrites no canonical row. Ordinary history edits/relinks
still reject. Intermediate166 is not an export/restore milestone; reviewed165
exports remain supported with the same58 datasets/116 files. Actual Node upgrade/
rollback/refusal and shared v19/38 Node/browser/native contracts pass. New167
generation/no-update replay, native22 recovery and eight normal restore/reopens
pass; full-source/hosted proof remains separate. This does
not implement normal deletion, erase free-text mentions or qualify field use.

Historical schema165 adds only `interaction_contact_history_idx(contact_id,
occurred_at DESC, id ASC)`. It preserves all schema164 canonical data, receipts,
dataset minimum versions and58-dataset/116-file export mapping. Actual Node
164→165 row/export/rollback/older-client proof passes; new165 browser/native
recovery and normal reopen remain in progress. Historical milestone counts
below retain their implementation-time scope.

The selected-contact prerequisite adds `contact_manual_creation(contact_id, operation_id, created_at, name_hash, role_hash, email_hash, phone_hash, public_profile_url_hash)` at schema161, with complete insertion/update/deletion guards through164. This immutable receipt records only exact initial explicitly entered values; nullable initial methods have nullable hashes. It duplicates no raw contact data and is not a public/license/verification or outreach authorization record. Current manual basis requires matching that field's hash; later changed values and legacy contacts remain unknown. The adapter independently hashes values before effects and commits contact plus receipt only after exact acknowledged readback. Notes edits retain all other contact facts and receipt. Whole-contact deletion cascades evidence, while detached deletion/replacement fails. Schema164 exports58 datasets /116 files, preserving all prior supported milestones, including160. Local shared v14/32 proof passes; concrete browser/native, migration/recovery and full final-source evidence remain pending in [contact-workspace verification](../../proof/contact-workspace-verification.md).

The version-1 contact directory is a minimized read projection over existing contact rows, not a schema/origin migration. Its live keyset orders created_at descending then id ascending, binds viewed-vault/archive/optional-company scope and the anchor's row_version, and returns bounded pages without notes, contact methods or totals. A null company filter means all companies; nullable stored company/role remain null. Neither confidence, user confirmation nor absence of a provenance link establishes a public, licensed or user-entered basis. Selected provenance/relationship reads remain separate follow-through.

- UUIDv7 IDs generated locally; never rely on server sequences.
- UTC ISO timestamps plus explicit IANA timezone when a future local-time interpretation matters.
- Soft/archive state for user records; append-only history for statuses, interactions, generation runs, and source snapshots.
- Money uses integer minor units, ISO currency, interval (`hour`, `year`, etc.), and normalization metadata. Never binary floating point.
- User-entered and extracted rich text is stored as safe Markdown/plain text. Raw HTML snapshots are quarantined and sanitized before display.
- Every externally derived field can point to one or more provenance records.
- All tables carry `created_at`, `updated_at`, and `row_version` where sync/conflict detection may matter.

## Core entities

The next INT-007 reminder prerequisite reads actual pending reminder rows ordered
by remind_at/ID, with explicit archived-job scope. Minimized current job/company
and stored task/interview/application metadata retain separate alert/deadline/
interview times; no contact inference or private bodies are loaded. Exact original
vault/canonical parent references, joined-job validation, bounded BLOB metadata
and lookahead checks run in one read snapshot. SQL/export182 is unchanged; the
shared test manifest advances to27/47. [Reminder evidence](../../proof/network-reminder-progress.md)
does not yet prove normal snooze/disable controls or their acknowledgement path.

INT-007 top-level Network history is a minimized projection over existing
interaction/job/company rows, not a schema migration. Versioned original-vault/
archive references bind event/time/version, current job/version, nullable contact
and nullable company/version, catching FK detachment without assuming a job
revision. Pages validate lookahead in one snapshot and transport bounded BLOB
metadata/previews; deliberate scalar-safe body parts retain literal BOM/NUL.
Archived companies do not filter active-job events; no clock ceiling/totals or
contact-method lookup is added. SQL/export182 is unchanged; shared26/46 proof is
in [Network progress](../../proof/network-interaction-history-progress.md).

### Vault and settings

`vault(id, name, schema_version, created_at, last_opened_at)`  
`app_setting(key, json_value, updated_at)`  
`device(id, label, platform, created_at, updated_at, last_seen_at, row_version)` — stable local identity and heartbeat now; cryptographic device authorization/removal remains sync-later work.

Secrets are not stored in ordinary settings.

The production bootstrap port treats one physical local database as one vault
identity. Inspection is a bounded, read-only query: no root means explicit
uninitialized state, not permission to discard existing records; multiple roots
fail closed rather than selecting one. Explicit naming atomically checks absence
and inserts only the root. Opening preserves the name/creation instant while
refreshing operational schema/open-time metadata, refusing future schema metadata
or backward audit times. The generic diagnostic lifecycle remains compatible;
normal setup UI composition is still pending. See
[bootstrap proof](../../proof/local-vault-bootstrap-verification.md).

`BKP-006` uses the existing strict `app_setting` row
`provider-secret-registry.v1` as a vault-local, versioned, sorted registry of
reviewed provider IDs. It contains no secret bytes, keychain account names, or
paths. The privileged desktop boundary derives the OS-store account from the
durable vault ID plus provider ID; deletion fails closed if the registry is
malformed. No schema migration is needed because the versioned JSON value fits
the already accepted generic settings table. See [vault deletion version
1](vault-deletion-v1.md).

### Candidate/career evidence

`candidate_profile(id, display_name, summary, target_roles_json, location_id, work_preferences_json)`

`experience(id, organization, role, start_date, end_date, current, description, source_document_id, verification_state)`

`education(id, institution, credential, field, start_date, end_date, details, verification_state)`

`skill(id, canonical_name, category, aliases_json)`

`skill_evidence(id, skill_id, evidence_entity_type, evidence_entity_id, proficiency, years_estimate, narrative, verification_state)`

`project(id, name, summary, url, start_date, end_date, verification_state)`

`accomplishment(id, parent_type, parent_id, action, result, metrics_json, verification_state)`

`certification(id, name, issuer, issued_date, expires_date, credential_url, verification_state)`

`publication(id, title, publisher, published_date, url, summary, source_document_id, verification_state)`

`volunteer_experience(id, organization, role, start_date, end_date, current, description, source_document_id, verification_state)`

`anecdote(id, title, situation, action, result, tags_json, privacy_tags_json, source_document_id, verification_state)`

Verification state: `imported`, `user_confirmed`, `source_backed`, `stale`, `disputed`. “Years of experience” is an estimate derived from dated evidence and user confirmation, not an unquestioned LLM output.

`EVD-002` makes that state executable in `@coredrill/career-evidence`: source-backed evidence requires a validated durable source reference; explicit transitions preserve the source and privacy controls; only untagged `user_confirmed` or `source_backed` evidence is eligible for later external-context selection. Privacy tags are bounded lowercase content-free identifiers. Their presence fails closed for external AI context, while provider selection and any explicit override remain later prompt/privacy work. Career-story privacy tags persist as a bounded JSON array; ordinary story topic tags remain separate.

### Companies and contacts

The in-progress contact-history read model adds no durable table. It joins
`interaction.contact_id` to the explicitly selected contact and retains the
mandatory job identity with clearly current job title/archive/version metadata.
A shared company is never treated as an interaction. Vault/contact/archive and
record/job versions bind live keyset continuation; there is no inferred total
or immutable-snapshot claim. Pages hold at most1,024 UTF-8 bytes per summary,
with separate bounded literal full-summary reads using BLOB length/slices so
NUL cannot turn retained text into a false complete preview. Focused actual
Node SQLite proof and a synthetic candidate index measurement are recorded in
[contact-history verification](../../proof/contact-interaction-history-verification.md).
Migration165 now adds the measured contact-history index with no row rewrite.
The same history-specific v15/34 shared contracts pass on Node/browser/native,
as do165 recovery and normal160/164→165 restore/reopen. Root-owned normal history
UI now passes repeated browser/native paging/literal/owner/archival/reload journeys;
complete local final-source, serial extension and exact d3950dc hosted gates pass;
source-backed field-use qualification remains separate.

`company(id, canonical_name, website_url, domain, location_id, notes, archived_at)`

`company_alias(id, company_id, alias, source_provenance_id)`

`contact(id, company_id, name, role, email, phone, public_profile_url, confidence, user_confirmed, notes)`

`contact_point_provenance(id, contact_id, field_name, value_hash, provenance_id)`

The selected field-evidence query adds no table or migration. It pages only the
chosen supported field's existing links, retaining historical mismatched links
instead of relabeling them as current. Current SQL NULL, a present value without
evidence and historical evidence for an absent method are distinct states. The
contact version and link/provenance/snapshot/current-source anchor identities and
versions bind live continuation. BLOB byte-length checks and complete UTF-8
decoding preserve empty versus absent excerpts/notes, BOM, NUL and inert markup;
oversized or broken chains fail instead of becoming empty pages. Public/licensed
eligibility remains unestablished by this read projection. Existing snapshots
still require a job source; independent company/contact acquisition and durable
exact-value rights/review/expiry evidence remain later work, not hidden synthetic
jobs. See [prerequisite audit/proof](../../proof/contact-source-eligibility-prerequisite-audit.md).

For field evidence, `includeArchived` controls the selected contact's visibility,
not joined job membership. Retained source links survive job archival; this is
distinct from the contact-interaction history filter. The normal inspector must
label that scope accurately without changing or requalifying historical evidence.

A contact field is nullable and never guessed. Store public data only when source policy permits and the user has a legitimate job-search purpose; support deletion and expiry review.

### Jobs and requirements

`job(id, company_id, title, normalized_title, description_text, employment_type, workplace_type, seniority, location_id, remote_region_json, date_posted, valid_through, current_status_id, next_action_at, archived_at)`

`job_source(id, job_id, connector_id, external_id, canonical_url, apply_url, first_seen_at, last_seen_at, content_hash, is_primary)`

`source_snapshot(id, job_source_id, captured_at, extractor_id, extractor_version, raw_text, sanitized_html, structured_json, content_hash, retention_class)`

The read-only Source-history metadata query pages immutable snapshot membership
by capture time descending and UUID ascending, with job/archive/read-time-bound
cursors and a local creation ceiling. Body content is not part of the metadata
page. Its `currentSource` projection explicitly identifies mutable source URLs,
connector identity, observation times and primary state as current stored
metadata, never a historical snapshot at the capture or pagination time. See
[query proof](../../proof/source-snapshot-history-query-verification.md).

Retained snapshot content is read separately, one text/markup/structured body at
a time through bounded UTF-8 byte continuation. Literal output preserves BOM,
embedded NUL and scalar boundaries, distinguishes absent from empty content and
never renders stored markup or executes structured data. Continuation binds
job/snapshot/kind/archive/read-time scope plus recorded capture hash and byte
length; it is not a new body-integrity or truth certificate. See [content query
proof](../../proof/source-content-query-verification.md).

`job_requirement(id, job_id, category, source_category, normalized_text, raw_text, provenance_id, confidence, user_confirmed, sort_order, created_at, updated_at, row_version)`

Requirement category: `required`, `desired`, `responsibility`, `context`, or `constraint`. Education, certification, work authorization, skill, years, and seniority remain separate extracted mappings or constraint details rather than competing top-level UI categories.

`job_tag(job_id, tag_id)` and `tag(id, name, color)`.

### Field provenance

`provenance(id, source_snapshot_id, extraction_method, source_pointer, source_excerpt, confidence, captured_at, license_note)`

`field_value(id, entity_type, entity_id, field_name, normalized_json, provenance_id, is_user_confirmed, superseded_by_id)`

The main entity contains the current resolved value for efficient queries. `field_value` retains candidates/history and explains why it was chosen. User confirmation wins until the user accepts a new value.

The read-only retained-source evidence page combines job field candidates and
accepted requirements for one owned snapshot. Membership is bounded by immutable
local creation time, ordered by creation descending then evidence kind/UUID
ascending. Current confirmation, supersession and requirement category annotations
remain explicitly current, not reconstructed as-of history. Old confirmed rows
retain their original confirmation and navigable replacement references. A
requirement's confirmation boolean does not imply a field-confirmation ID or
timestamp. Serialized JSON/text previews are explicitly incomplete when bounded;
they are not substitutes for full-value access or the main entity's resolved
value. See [evidence-page proof](../../proof/source-evidence-query-verification.md).

Full normalized/raw evidence values have a separate bounded UTF-8 continuation
query. Field candidates return exact serialized JSON; requirements return exact
text, without interpretation or rendering. Only a field candidate's raw value
may be absent; SQL NULL, JSON `null`, and serialized empty string remain distinct.
Continuation binds exact job/snapshot/evidence kind/ID/value part/archive and
creation-ceiling scope plus provenance ID, current row version and byte length.
A concurrent confirmation/category/supersession update invalidates the read even
if source text stays unchanged. This is record-version continuity, not a new
content hash or historical review-state reconstruction. See [full-value query
proof](../../proof/source-evidence-value-query-verification.md).

`REV-006` compares explicit immutable `source_snapshot` projections without a
schema change. The comparison input carries snapshot identity/time/hash plus
bounded normalized requirements, structured compensation, deadline, and
locations derived at the application boundary. Its output is ephemeral
read-only evidence, not another table or current-value projection. It cannot
write `job`, `job_requirement`, `field_value`, confirmation, provenance, or
snapshot rows; user-confirmed current values therefore remain authoritative
until an explicit replacement command is implemented and invoked.

`CAP-005` keeps that rule on schema 92 rather than adding a speculative conflict table. The application reconciliation boundary accepts trusted existing candidates separately from untrusted incoming proposals; incoming data carrying an embedded `userConfirmation` is rejected. It revalidates every candidate, preserves the complete bounded set, compares normalized JSON canonically, and emits a version-1 unresolved conflict when one field has differing values. An existing active confirmation remains selected regardless of method or confidence. Without one, the documented source-method ladder produces a deterministic suggestion only, and the result still requires user review. Multiple active confirmations, reused candidate/conflict IDs, and a conflict too large for the 32-candidate contract fail closed before persistence. The existing repository boundary continues to reject generic supersession of a confirmed `field_value`; only `replaceConfirmedFieldValue` can confirm the replacement and link the prior value in one transaction, preserving both history rows.

`MAT-001` adds schema versions `127`–`129`. Each `job_requirement` belongs to one job and one provenance row whose immutable snapshot chain belongs to that same job. Storage copies the bounded extraction confidence while the joined provenance supplies the exact non-null source excerpt, source pointer, and extraction method. `source_category`, raw/normalized text, provenance, confidence, ordering, and creation time are trigger-protected source facts. A user correction updates only the current `category`, sets durable `user_confirmed`, and advances the optimistic row version; it never rewrites the extracted category or source evidence. The five-category vocabulary is shared with the accepted Requirements interface.

`MAT-002` does not add a schema. Deterministic parser output is an ephemeral, immutable proposal projection over provenance-bound source blocks; parsing alone cannot write `job_requirement` or confirmation state. Explicit acceptance uses the existing repository transaction to create one user-confirmed requirement. The parser category becomes immutable `source_category`, while the category chosen during review becomes the current `category`, so recategorization never erases the extracted interpretation. Rejection creates no row and does not mutate the source snapshot or provenance. Evidence retrieval and coverage decisions remain `MAT-003` and `MAT-004`.

`MAT-003` adds schemas `0130` through `0132`. `skill_evidence` records a validated typed relationship from one canonical skill to employment, education, project, accomplishment, certification, publication, volunteer, or story evidence using one concrete foreign key. `job_requirement_evidence_selection` records only user-selected requirement/evidence pairs across all nine evidence kinds. `career_evidence_search_content` is a noncanonical union view over active Career Profile evidence; its adapter-created FTS5 index is rebuildable and excluded from export. Both durable relation tables are included in the portable JSON/CSV projection, while retrieval candidates, match scores, terms, and reason codes remain ephemeral explanations.

`MAT-004` adds schema `0133`. `job_requirement_coverage_decision` stores one optional user-reviewed Strength, Partial, Gap, Unknown, or Not Applicable state per requirement with optimistic row version, decision time, the requirement row version reviewed, and a canonical content-free snapshot of selected evidence identifiers. Deterministic default coverage and its explanation remain a versioned projection, not duplicated truth. Comparing the stored basis with current requirement/evidence state makes an override visibly stale without overwriting it. The new table is included in portable JSON/CSV export and clean recovery; no aggregate fit, ATS, or hiring-probability score is stored.

`DOC-001` adds schema versions `0134`–`0145`. `document_lineage` classifies a document exactly once as a reusable `base`, reusable `template`, or `job_derivative`; a derivative requires an existing typed base and job and may retain an existing typed template. It references rather than copies the immutable `document_version` history. `submitted_snapshot` retains one immutable submission identity per application attempt, matching the application's applied time, channel, and Applied category. Its ordered `submitted_snapshot_item` rows retain the exact immutable document version for a resume, cover letter, answer, or other submitted material. A file item additionally retains the content-addressed attachment key and purpose through a composite foreign key; plain-text items retain the exact immutable document version. Guards reject wrong selected resume/cover-letter versions, wrong document kinds, later identity edits, and partial repository writes. These three tables are included in portable JSON/CSV export and the lossless recovery archive; the later Mark Applied use case remains `DOC-007`.

`DOC-005` adds schema versions `0149`–`0154`. Existing application columns remain the exact pre-submission resume and cover-letter selections; `application_answer_selection` adds ordered exact answer versions without conflating preparation with the immutable submitted snapshot. Eligible selections are active non-template resume, cover-letter, or application-answer versions; a job derivative must belong to the application's job, and only one version of an answer document may be selected. A save replaces the answer set and advances the application row version atomically. Once a submitted snapshot exists, the application identity and answer selections are immutable. Missing, draft, review-needed, and ready are derived application states rather than durable truth or a score.

`DOC-007` adds no migration. Mark Applied uses schemas `0134`–`0154` to
atomically update the job and application Applied projections, append the
status event, and insert one immutable submitted snapshot with ordered items.
Every item retains the exact selected document version; a file item also
retains the already-recorded content-addressed attachment tuple, while a
plain-text item retains an explicit plain-text format. Repository guards and
the application boundary reject stale, mismatched, repeated, or partially
valid requests without silently substituting a current version.

### Pipeline and interactions

Deliberate dismissal has its own mandatory-viewed-context application command and SQLite port, sharing the private terminal-task transaction with completion. It retains `next_action.state = dismissed`, leaves `completed_at` null and stores dismissal operation time in `updated_at`; the acknowledgement's `dismissedAt` is this operation-time projection, not a new durable column or immutable event. Owned linked pending reminders are dismissed while fired/unrelated records remain. Original owner/job/task versions, archive checks, remaining earliest pending due projection and rollback/replay safety apply; a creation undo token is not consumed or invented. [Command/storage proof](../../proof/task-terminal-reminder-verification.md) passes browser/native contracts and initial normal dismissal controls; dismissal-specific lifetime/failure hardening, reminder scale and full lifecycle verification remain unfinished.

`status_definition(id, name, category, color, is_system, sort_order, terminal)`

Seed categories: `viewed`, `saved`, `preparing`, `applied`, `response`, `interview`, `offer`, `rejected`, `withdrawn`, `archived`. Users can add named statuses without breaking aggregate reporting because each maps to a category.

`status_event(id, job_id, application_id, from_status_id, to_status_id, occurred_at, note)` — append-only; current status is a maintained projection.

`interaction(id, job_id, contact_id, type, occurred_at, direction, summary, next_action_at)`

The in-progress guarded recording port uses this unchanged append-only identity
for exact acknowledgement-loss reconciliation, not an additional canonical cache
or receipt table. New writes require the sole viewed vault, active viewed job and
optional explicitly linked active contact versions in the same transaction.
Existing exact immutable values return without another insert; changed values
cannot replace that identity. Reconciliation does not certify that later owner
versions still match the original view. Normal runtime must own a fixed original
identity/context/tuple and must not automatically generate a new retry. Actual
Node/browser/native and full local plus exact00ff32a hosted proof pass. The newer
read-only check uses that same original tuple and sole vault, distinguishes
absence from invalid/colliding state, and never inserts. Later owner edits/archive
do not erase historical acknowledgement. Literal BLOB decoding retains leading
BOM text exactly; no canonical receipt/cache, schema or archive change is added.
Normal runtime fixes identity/context/fields on first valid dispatch and blocks
blind write retries. Browser/native API proof passes; newer full-source and normal
composer proof remain open in
[recording verification](../../proof/viewed-interaction-recording-verification.md).

`next_action(id, job_id, application_id, interaction_id, title, due_at, timezone, state, completed_at)`

ADR-0009 / D-056 was owner-accepted on 2026-10-21 for explicit local-clock resolution only. Durable scheduling remains the exact UTC instant plus canonical IANA string, or both null for an unscheduled action. No Temporal object, candidate list or civil-time resolver state becomes canonical storage; no migration, reinterpretation or backfill is authorized. The normal form rejects gaps and requires explicit overlap selection before issuing the existing guarded command. Complete browser/native/offline/reload/lifetime/undo/dismissal and exact `bc28c8a` / `39625297012` hosted evidence close INT-004 engineering integration without changing stored data. See [audited scheduling evidence and independent remaining gates](../../proof/accepted-civil-time-scheduling-verification.md#exact-hosted-closure-and-int-004-requirement-disposition).

`interview(id, application_id, stage_name, starts_at, timezone, duration_minutes, location_or_url, contact_ids_json, preparation_notes, outcome)`

`application(id, job_id, applied_at, channel, current_status_id, selected_resume_version_id, selected_cover_letter_version_id, notes)`

`reminder(id, job_id, next_action_id, interview_id, remind_at, timezone, state, note, fired_at)`

`mutation_undo_token(id, kind, job_id, status_application_id, status_event_id, previous_status_id, expected_status_id, expected_application_row_version, next_action_id, expected_next_action_row_version, previous_next_action_at, expected_next_action_at, expected_job_row_version, created_at, consumed_at)`

Undo tokens are durable, immutable audit records except for one fresh-to-consumed transition. They retain exact row-version and projection preconditions rather than private display content. A status undo restores maintained projections and keeps the referenced append-only status event. A next-action undo dismisses its referenced action and linked pending reminders instead of deleting them. Replay and any mismatch caused by a later edit fail without partial writes.

One job may have multiple applications only when the user explicitly creates them; otherwise enforce one active application per job.

The production Start preparation locally action creates the first active
attempt with no Applied timestamp, channel, or selected versions. It requires
the expected job row version and an explicitly user-named Preparing stage,
reusing an exact active match or creating one user-owned nonterminal stage.
Stage/application creation, the job status projection, and the append-only
application-bound event commit together. Stale, archived, terminal, ambiguous
stage-name, or existing-active-attempt cases fail without partial writes.
This does not select default stage names, reopen a closed job, authorize an
additional attempt, or submit an application.

Applied-stage creation is a separate global configuration transaction. An explicit
user name creates a nonterminal, user-owned Applied-category definition after the
last stored sort order, or reuses the exact compatible active name. Archived,
terminal, differently cased, incompatible or ambiguous matches fail without
mutations. It never changes jobs, attempts, selections, timeline events or
submitted snapshots. No default stage names or new schema are introduced.

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

`document_lineage(document_id, role, base_document_id, template_document_id, job_id, created_at)`

`document_derivation_origin(document_id, first_version_id, source_version_id, created_at)`

Schema versions 155–158 record the exact saved reusable source version and the
matching first derivative version. A source must be an active reusable base of
the same resume/cover-letter kind. The first copy must have identical IR, plain
text and hash; it has no cross-document parent-version link. The origin cannot
be rewritten or detached while the derivative exists, and it restricts source
version deletion. Whole-derivative deletion may cascade the origin. Existing
legacy derivatives retain unknown exact version origin rather than an invented
backfill. Creating a copy rechecks the active, unsubmitted application's expected
row version and does not change application selections or mark Applied.

`submitted_snapshot(id, application_id, submitted_at, channel, created_at)`

`submitted_snapshot_item(id, submitted_snapshot_id, role, document_version_id, submission_format, content_id, attachment_purpose, sort_order, created_at)`

`document_editor_draft(document_id, base_version_id, content_ir_version, content_ir_json, content_plain, updated_at, row_version)`

`application_answer_selection(application_id, document_version_id, sort_order, created_at)`

Lineage role is `base`, `template`, or `job_derivative`. Submission item role is `resume`, `cover_letter`, `answer`, or `other`; submission format is `plain_text` or `file`. Resume and cover-letter items must match the exact version selected on the application, and there may be at most one of each per snapshot. Answer items require an immutable `application_answer` version. Other items are limited to `follow_up` and `other` documents. File items reference an existing `(document_version_id, content_id, purpose)` attachment relation, so the submitted byte identity cannot be detached while the snapshot exists.

Canonical durable document content is Coredrill IR version 1. The documents/application boundary performs complete IR validation and deterministic plain-text derivation; storage persists bounded versioned JSON and checks the matching `specVersion` without creating a forbidden storage-core dependency on the editor adapter. Tiptap JSON is not canonical storage. An editor draft is recoverable local working state, not an immutable version: it must reference the document's latest version and advances with optimistic `row_version`; only explicit version creation consumes it and appends a child version. Application-answer selection is preparation state, not submission evidence; `submitted_snapshot_item` remains the sole exact record of what the user says was actually submitted.

`DOC-008` proves this complete graph survives a version-1 portable archive and clean restore without substituting the current version for the submitted one. The schema-154 fixture retains exact IR, plain text, content hashes, version parentage, base/job-derivative lineage, the recoverable draft, job and evidence/provenance links, ordered application-answer selection, the immutable submitted snapshot, and the purpose-qualified content-addressed file relation. Source, clean browser, and native targets regenerate an identical ordered 21-dataset witness and physical attachment inventory; SQLite remains the lossless restore authority.

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

`EVD-004` realizes the resume subset as schema versions `113`–`115`: `import_run` retains bounded local file metadata, SHA-256, the normalized source mapping, timestamps, completion state, and summary; `career_import_proposal` retains the proposed target/field/value, grouping key, source pointer, excerpt, extraction confidence, fixed `proposal` evidence state, and fixed `pending` review state. The queue is separate from all Career Profile evidence tables, so import cannot silently create or overwrite a verified fact. Review transitions and promotion are deferred to `EVD-005`. See [resume import proposal verification](../../proof/phase-3-resume-import-proposals-verification.md).

`EVD-005` adds schema versions `116`–`119`. Skills now carry the same optional source-document and verification-state fields as other evidence rows. `career_import_resolution(id, import_run_id, group_key, target_kind, decision, target_id, resolved_values_json, resolved_at, row_version)` is the append-only decision ledger, and `career_import_resolution_proposal(resolution_id, proposal_id, linked_at)` fixes the exact immutable proposal membership. The unique import/group constraint prevents double resolution. Accepted entries use `verification_state = imported`; merge decisions point at an existing compatible row but do not update it; rejected groups create no evidence row. Pending queries exclude only proposals linked to a committed resolution.

`EVD-006` adds schema version `120`. `anecdote_evidence_link(anecdote_id, evidence_kind, evidence_id, employment_id, education_id, project_id, skill_id, accomplishment_id, certification_id, publication_id, volunteer_experience_id)` stores a story relationship to canonical Career Profile evidence. A strict check requires exactly one concrete foreign key matching `evidence_kind` and `evidence_id`; the composite primary key prevents duplicate typed links. Cascading deletion removes a relationship when either side is removed, while story create/edit transactions validate every target before atomically committing the complete link set. Story edits preserve the anecdote's source-document and verification fields.

`EVD-007` adds schema versions `121`–`126` without creating a parallel content store. `answer_library_entry(document_id, source_kind, source_job_id, source_context, last_used_at, created_at)` attaches immutable provenance and explicit reuse state to a `document(kind = 'application_answer', source = 'answer_library')`. Manual provenance requires no source job; application provenance requires one existing job. `answer_library_version(document_version_id, question, sensitivity)` extends each immutable `document_version` with the original question and one reviewed sensitivity value: `standard`, `sensitive`, or `restricted`. Editing appends the next document version and metadata row atomically; it never mutates prior content or provenance. Marking an answer used updates only `last_used_at` plus the document's optimistic row version. Sensitive answers are excluded from later automatic reuse by default, and restricted answers remain manual-review-only; `EVD-007` itself performs no automatic reuse or AI drafting.

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
- Portable exports include app version, schema version, migration history,
  database/data checksums, content-addressed attachment bytes/checksums, and
  explicit encryption metadata. The version-1 writer uses deterministic safe
  ZIP entry paths and refuses success if any recorded attachment is missing or
  does not match its manifest facts.
- The version-1 human-readable projection reads a reviewed schema milestone
  once and emits every user-owned dataset available at that milestone as paired
  JSON/CSV files. Schema 126 emits 47 datasets and 94 files. Schema 129 adds
  the provenance-bound `job_requirement` dataset and emits 48 datasets and 96
  files, including Career
  Profile evidence, source/verification state, import proposals/resolutions,
  story-evidence relationships, Answer Library provenance/version history,
  requirement correction/source facts, and
  attachment manifests/links. It retains row versions, nulls, and Unicode while
  excluding migration, device, diagnostic, derived-search, undo, and
  SQLite-internal tables. The SQLite member remains authoritative for restore.
  See the [exact field mapping](portable-data-export-v1.md).
- Older clients fail safely on newer schema; they never attempt a downgrade write.
- Every release tests fresh install, each supported upgrade path, failed migration rollback, export/restore, and cross-adapter logical equivalence.

The first shared migration, `migrations/0001_vault.sql`, creates the strict vault root. `migrations/0002_capture_inbox.sql` adds the durable extension receipt needed to commit a validated source envelope before acknowledgement; it records envelope ID, content hash, checksum, sender ID/sequence/nonce, timestamps, receipt path, and complete envelope JSON, but does not promote the capture into a reviewed job record. Phase 1 migrations `0003` through `0013` add settings, locations, companies, contacts, jobs, job sources, immutable source snapshots, provenance, company aliases, contact-point provenance, and retained field-value candidates. User confirmation metadata is all-or-none, and a confirmed field candidate can be superseded only through the focused explicit replacement transaction. Migrations `0014` through `0022` add custom status definitions, job status/next-action projections, explicit application attempts, append-only status events, interactions, next actions, interviews, and local reminders. Migrations `0023` through `0025` add strict tags, idempotent job-tag relationships, and saved views containing separately versioned bounded filter-AST and UI-settings JSON. The version-1 AST validator and compiler accept only reviewed stored fields and field-compatible operators, cap structural and value complexity, and emit SQL exclusively from hardcoded table/column/operator allowlists with bound values and escaped `LIKE` patterns. Migrations `0026` through `0031` add document identity, immutable canonical-IR versions with explicit parent lineage, purpose-qualified job links, content-addressed attachment metadata and logical version relationships, and version-scoped style-example selections. They store no attachment bytes or AI/provider state. Migrations `0032` through `0045` add a strict UUIDv7 local-device identity, a transaction-scoped upgrade probe that fails closed on invalid historical audit/document data, selected resume/cover-letter kind guards, same-document consecutive version-lineage enforcement, selected-version deletion protection, and update guards for immutable or append-only versions, snapshots, status events, interactions, and content-addressed manifest facts. Trigger-backed application integrity avoids a destructive application-table rebuild and its child-history cascade risk. Migrations `0046` through `0070` add reviewed ordinary and partial indexes for current tracker, source, history, scheduling, tag, document, and attachment query paths. Migrations `0071` through `0084` add stable integer search identities, a normal current-content view, durable content/FTS revision state, and FTS-independent job/company/application triggers. The rebuildable external-content FTS5 table is an adapter-managed acceleration artifact created only after a real runtime module probe, not canonical durable truth or a migration prerequisite. Migrations `0085` through `0087` add durable status/next-action undo tokens and their consume-only immutability guards. Migrations `0088` through `0092` add the strict local diagnostic table, deterministic recent-event index, database-level JSON allowlist, update immutability, and newest-1,000 retention trigger. Migrations `0093` through `0101` add strict capture-review lifecycle state, existing-receipt backfill, automatic new-receipt insertion, a queue index, guarded transitions/deletion, and durable single-use discard undo. Migrations `0102` through `0111` add employment, education, project, skill, accomplishment, certification, publication, volunteer, story, and singleton candidate-preference persistence. These strict tables enforce bounded JSON, safe date ranges, source-document foreign keys, archive/audit fields, and optimistic row versions without adding editor, import, AI, or network behavior.

The storage-core migration runner validates contiguous positive versions, stable kebab-case names, lowercase SHA-256 checksums, and nonempty SQL. It creates a strict `coredrill_schema_migration(version, name, sha256, applied_at)` ledger, verifies every previously applied row against reviewed source, applies new SQL and `PRAGMA user_version` in one adapter transaction, and fails closed on source drift. Shared repository contract suites apply all migrations and exercise parameter binding, foreign-key rollback, candidate retention, explicit confirmed replacement, status-history rollback, explicit terminal-stage reopen, additional-application authorization, next-action projection consistency, durable undo/replay/stale-target behavior, idempotent active-tag assignment, versioned saved-view round trips, optimistic-write conflicts, canonical-IR version lineage, typed base/template/derivative relationships, editor-draft recovery and exact-version creation, content-addressed manifest idempotency, logical and submitted attachment relationships, stable local-device audit advancement, selected/submitted-document integrity, immutable/append-only guards, reviewed query plans, runtime FTS capability selection, normalized-token fallback, search-content refresh, privacy-safe bounded diagnostics, atomic capture review promotion, and complete Career Profile repository round trips against browser and native SQLite. Property tests separately prove valid filter round trips, typed arbitrary-input rejection, structural limits, field/operator compatibility, adversarial-value parameter binding, monotonic audit timelines, and hostile search input safety. The current numbered schema is 160. Migration 159 adds only `next_action_job_created_idx` on `(job_id, created_at DESC, id ASC)` for bounded job task pagination, with no canonical row rewrite or new dataset; Migration 160 adds only `reminder_next_action_job_state_idx(next_action_id, job_id, state)` for terminal-task reminder ownership and pending-state lookups. Schema-158/159 human-readable exports and both preserved recovery fixtures remain supported alongside a separately named current160 fixture. `EVD-008` proves that the human-readable projection accounts for every durable table, story/evidence and import-resolution links survive browser/native restore, evidence-target or story deletion cascades only its relationship rows, answer deletion cascades immutable metadata and logical attachment links, shared content facts remain until explicit orphan cleanup, application answer provenance prevents source-job deletion, and whole-vault deletion removes all managed attachment bytes. `DOC-001` extends that proof to typed document lineage and exact submitted-version/file identities without adding a submission action. `DOC-003` adds a portable recoverable editor-draft dataset while preserving schema-145 export compatibility and immutable document history. `DOC-004` is a pure projection over explicitly supplied durable identities and source-version facts; it adds no table, migration, canonical store, or Answer Library relationship. `DOC-005` adds a portable exact answer-selection dataset and transactional application-set selection while preserving submitted-snapshot identity as a separate later action.

The `APP-002` application boundary creates a manual job with a null current-status projection and changes status only through a single port action required to update the job and optional application projections while appending the timeline event in one transaction. This preserves the existing repository rollback guarantees without selecting a default display-stage name. See [manual job pipeline application verification](../../proof/phase-1-manual-job-pipeline-application-verification.md).

Interactive status composition can now bind that transaction to an explicit viewed-state tuple: job row version, current status (including null), and the matching active-application row version (or explicit absence). The application validates and copies the tuple before storage; the repository checks it, job archive state and the unique active attempt in the same transaction before any write. A stale job/application, omitted active attempt or ambiguous active set fails without an event, projection or undo token. Existing trusted programmatic runners remain compatible when they omit this optional tuple; normal UI mutation composition must require it. The generic transaction does not replace the separately reviewed Mark Applied/submitted-document flow. See [status precondition proof](../../proof/stored-status-preconditions-verification.md).

The `APP-003` application boundary creates pending incomplete next actions, append-only non-future interaction history, future interview schedules, and future pending local reminders. Scheduled records retain a UTC instant plus a validated canonical IANA time zone; unscheduled next actions retain neither. Operation context, not caller data, supplies creation/update audit time, and all returned activity records are revalidated against the initiating command. See [job activity application verification](../../proof/phase-1-job-activity-application-verification.md).

Task lifecycle integration adds a separate mandatory-viewed-context `CompleteNextActionCommand` and concrete SQLite port. Completion retains its record, checks original job/task identities and row versions plus unarchived ownership before transactional writes, recomputes the pending due projection, and validates exact acknowledged successor versions/time. The trusted storage helper retains its older signature for existing contract/internal callers; interactive completion must never omit captured expectations. The normal runtime and shared Overview now compose this guarded boundary with bounded task reading and deliberate original-context completion; expanded browser/native ownership and readback-failure proof is tracked in [task UI verification](../../proof/normal-task-list-ui-verification.md). Completion now atomically dismisses owned linked pending reminders while preserving fired, already-dismissed and unrelated reminder records. Foreign reminder ownership rejects before writes, and a final projection failure rolls back task/reminder/job changes; see [terminal reminder proof](../../proof/task-terminal-reminder-verification.md). Deliberate dismissal and full final-source lifecycle gates remain. See [guarded completion progress](../../proof/normal-task-lifecycle-verification.md); `INT-005` remains open.

The separate `ListJobNextActionsQuery` returns bounded current-state pages of pending/completed/dismissed records with original job/task versions, explicit archive scope and deterministic newest-created/ID order. Its cursor revalidates the canonical job revision and exact anchor version rather than inventing an immutable historical task snapshot. The read transaction checks linked application/interaction ownership and never completes, dismisses or edits a task. [Query prerequisite proof](../../proof/normal-task-list-query-verification.md) remains distinct from normal runtime/UI composition and full task lifecycle completion.

Next-action creation adds a pending task; it does not replace or dismiss existing tasks. The maintained `job.next_action_at` is the earliest non-null due instant among pending tasks, or null when none are scheduled, matching the Pipeline read and completion projections. Undo binds the resulting projection and post-write job version while retaining the exact prior projection. Interactive creation captures the viewed job row version and must reject stale or archived context inside the same transaction before any action, job or undo-token write; the application/storage expectation remains optional for existing trusted command runners, but normal runtime composition must require it. This consistency repair does not backfill historical projections or implement task completion, dismissal or rescheduling UI.

The `APP-004` application boundary creates explicitly user-entered companies and either user-entered or source-backed contacts. Manual contacts are user-confirmed and carry neither confidence nor source links. Every populated source-backed contact field is nullable-but-never-guessed, remains unconfirmed, and requires exactly one value-bound `contact_point_provenance` link; contact creation and those links form one atomic port action. No update or replacement path in this slice can overwrite confirmed data. See [company/contact application verification](../../proof/phase-1-company-contact-application-verification.md).

The `APP-005` application boundary reads one time-bounded Pipeline snapshot. Counts, ordered status/unassigned groups, table/board pages, and the job workspace use explicit archive and filter scope; pages share the stable keyset order `updated_at DESC, job_id ASC` and carry the final tuple as their cursor. Cross-entity job, application/status, company, source, next-action, and interaction projections are checked before returning an immutable DTO. This slice defines the adapter-neutral read contract but does not claim concrete browser/native query composition. See [Pipeline query application verification](../../proof/phase-1-pipeline-query-application-verification.md).

Stored-Pipeline integration adds the concrete SQLite read adapter without a schema
change. Each projection uses one transaction; pages bind their exact status/archive
scope and invalidate an anchor whose stored update tuple changed or left that
scope. Active tags are batch-read, and an unmarked source is never promoted to the
primary-source field. Page queries select summary columns only; full descriptions
are read separately only for explicit workspace detail. The Unassigned group and
nullable fields never become invented canonical status or source data. Groups
retain archived definitions only when referenced by jobs in the requested scope.
Unassigned is a read projection, not a seeded display stage. Needs action counts
jobs with pending next actions, overdue
counts those with a pending action due before the operation instant, upcoming
interviews counts jobs with future/uncompleted interviews on active attempts,
waiting counts nonterminal Applied-category jobs, and closed counts terminal
jobs. Timeline item count covers append-only status events and interactions;
scheduled interviews and reminders have separate attention counts. Normal shell
composition remains in progress; see [stored Pipeline query proof](../../proof/stored-pipeline-query-verification.md).

The `APP-006` boundary creates and updates only user-owned job views with version-1 validated filter and view-settings documents. Sort clauses are unique and allowlisted, nulls remain last, job ID is the required stable final key, and status/company grouping retains an explicit unassigned group. Updates and timestamped archive operations require optimistic row versions; duplicate clones stored filter/settings atomically rather than accepting a caller copy. System views are protected, but no system-view names or default display stages are seeded, so `Q-006` remains open. See [saved job-view application verification](../../proof/phase-1-saved-job-view-application-verification.md).

The `APP-007` boundary creates each status or next-action mutation together with a durable undo token. Consumption is single-use, restores only the exact recorded projections while their row-version preconditions still match, keeps append-only status history, dismisses created actions and linked pending reminders instead of deleting them, and rolls back on replay or stale targets. See [durable mutation-undo verification](../../proof/phase-1-mutation-undo-application-verification.md).

The `APP-008` boundary records only allowlisted version-1 diagnostic events after fail-closed attribute sanitization and exposes a user-initiated version-1 local-copy bundle. Repository reads and bundle assembly revalidate every record; returned values are copied and frozen. Arbitrary adapter exceptions collapse into stable content-free failures, and malformed stored records fail closed rather than being copied. See [local diagnostic support-bundle verification](../../proof/phase-1-local-diagnostic-support-bundle-verification.md).

## Stored company-directory read model (INT-007 prerequisite)

The version-1 local company directory projects only identity, literal canonical name, nullable website/domain, archive/audit timestamps and row version. It excludes full private notes, contacts and unqueried relationship counts. Explicit viewed-vault identity is checked against the single vault root in the same transaction as the page; default active and explicitly included archive scopes remain distinct. Default 25/max 100 rows use live created-time-descending/ID-ascending keyset pages, with exact scoped cursor-anchor/version revalidation and no wall-clock ceiling or immutable-snapshot claim. No table, index, migration, canonical row or archive/data version changes. The shared executable repository inventory advances v10/26 to v11/27 for identical adapter proof, not durable schema versioning. Normal Network composition remains unfinished; see [prerequisite proof and limits](../../proof/company-directory-prerequisite-verification.md).

## Future sync readiness

Reserve `row_version`, `updated_at`, stable entity IDs, and one local device identity now; add an append-only `sync_op` table only when sync is implemented. Existing `archived_at` fields are the local soft-delete representation, not a claim that multi-device tombstone retention or conflict semantics have been selected. Do not burden v1 with a speculative CRDT. The later sync ADR must define per-entity conflict rules, tombstones, attachment handling, encryption, compaction, cryptographic device authorization/removal, and any server cursor before a server endpoint exists.
