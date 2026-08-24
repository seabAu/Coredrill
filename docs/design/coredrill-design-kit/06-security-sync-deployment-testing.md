# 06 — Security, privacy, sync, deployment, and testing

## Data classification

| Class | Examples | Default handling |
|---|---|---|
| Highly sensitive | resumes, address/phone, work authorization, application answers, provider keys | Local, minimized, excluded from logs/telemetry; explicit export/AI consent |
| Sensitive | job history, notes, contacts, interviews, salary floor/offers | Local; provenance/retention controls; encrypted sync only later |
| Public-derived | listing/company pages, public labor datasets | Source/terms/attribution retained; still sanitize and minimize |
| Operational | app version, migration status, error codes | Local diagnostics; opt-in redacted telemetry later |

Local storage is not an access-control boundary against someone with device/browser-profile access. Browser OPFS is origin-private, not independently encrypted. Explain this clearly.

### Local diagnostic contract

The versioned local diagnostic event contains only operational category/name/code, severity/outcome, application version, timing, optional operation UUID, reviewed scalar attributes, and the count of rejected attributes. `delivery` is fixed to `local`. Event names, codes, attribute keys, and string tokens are explicit allowlists; numbers must be finite/bounded; arbitrary strings, nested objects, arrays, and unreviewed fields are discarded before schema validation. Private/content-bearing fields such as resumes, prompts/responses, answers, names, contact data, URLs, notes, raw HTML/text, credentials, cookies, tokens, and secrets are forbidden.

The redactor is fail-closed and never returns rejected values. Product telemetry is a different future contract: it remains off unless the user opts in and every event receives the separate disclosure and privacy review required by D-053.

## Threat model and controls

### Hostile captured content / prompt injection

- Treat DOM, JSON-LD, files, API payloads, and AI output as untrusted.
- Schema/size validation, HTML sanitization, safe text rendering, URL scheme allowlists.
- Source content is data-delimited in prompts and cannot invoke tools.
- No arbitrary URL/tool access from the model.

### Extension compromise/over-permission

- Manifest V3, bundled code, strict CSP, `activeTab`, minimal permissions, optional source permissions.
- No secrets/full vault in extension storage; bounded outbox and expiry.
- Validate messages and senders; exact externally connectable origins.
- Privileged operations remain in the service worker; content-script messages are hostile.
- Publisher account protected by phishing-resistant MFA and reproducible release checks.

Chrome recommends minimal permissions, strict externally-connectable origins, and CSP: [extension security guidance](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure).

### Local fetch/SSRF

Any URL fetcher enforces scheme/port, DNS and redirect revalidation, private/link-local/metadata IP blocks, size/time/type limits, and approved connector domains. Browser extension does not expose a general fetch oracle to pages.

### XSS/data exfiltration

- Strict CSP; no remote scripts, `eval`, unsafe inline handlers, or captured HTML execution.
- Web build assets pinned/self-hosted where practical.
- Sanitize exports/previews and use text APIs.
- No provider tokens in `localStorage`; browser BYOK must be user-unlocked and is discouraged compared with desktop secure storage/local AI.
- Separate app origin from unrelated apps so OPFS/storage/service worker scope is isolated.

### Database/file loss

- Transactional writes, WAL/config verified per adapter, foreign keys on.
- Browser storage/quota/persistence diagnostics and recurring export reminders.
- Desktop atomic timestamped backups with retention and restore verification.
- Portable archive manifest/checksums and dry-run import.

The Phase 0 browser adapter exports SQLite bytes with schema version, byte length, and SHA-256. Restore rejects length/checksum mismatch before import, imports only through the official `opfs-sahpool` utility, then requires SQLite `integrity_check` and the expected schema version before success. The browser E2E test proves a corrupt checksum cannot replace the target, restores into a separate clean browser context, compares logical rows, confirms the re-export checksum, and deletes the restored database. This is database-byte recovery proof for `STG-003`; full archive assembly, attachments, encryption metadata, dry-run UX, quota/eviction behavior, and atomic native replacement remain later work.

### AI/provider leakage

- Provider disabled by default.
- Data-flow preview and destination logged per run.
- Send selected evidence, not full vault.
- Keys in OS secure storage/encrypted unlocked storage; redaction in errors/logs.
- Provider retention/training terms linked and reviewed when an adapter ships.

## Local vault protection

### Browser

- OPFS isolates by origin but relies on browser/OS profile security.
- Optional app-level encryption can protect selected sensitive fields/attachments with AES-GCM and a user passphrase-derived key. It does not fully protect data while the unlocked app runs and complicates search.
- Never persist the unwrapped key; lock on explicit action/inactivity where implemented.
- Recommend device login and full-disk encryption; provide full portable export/deletion.

### Desktop

- Prefer OS keychain/secure store for API keys and a random vault-wrapping key.
- Offer passphrase/recovery-key wrapping for portable encrypted backups.
- If full-database SQLCipher is selected, verify licensing, Tauri/platform builds, migration, corruption recovery, and backup compatibility before promising it. Otherwise use field/blob encryption plus full-disk-encryption guidance.
- Lock screen is privacy convenience unless cryptographic key material is actually evicted.

## Future sync architecture

Sync is a separate product phase and service:

```text
local SQLite -> change encoder -> client encryption -> sync API/blob store
                                                   -> other authorized device
```

### Security model

- Random per-vault data-encryption key generated client-side.
- Each device has a keypair; vault key is wrapped to authorized devices and/or a user recovery key.
- SSO proves account/control-plane identity but cannot derive/decrypt the vault key.
- Server stores ciphertext operations/blobs, encrypted metadata where feasible, device public keys, cursors, quotas, and abuse/security logs.
- Device removal rotates sharing material; document the limits for previously downloaded data.
- Recovery choice is explicit: user-held recovery key, passphrase wrapping, or an opt-in server recovery mechanism that weakens zero knowledge. Never pretend all three properties—zero knowledge, no recovery key, and effortless recovery—can coexist.

### Data model/conflicts

- Add append-only operations, device IDs, monotonic logical timestamps, tombstones, and attachment manifests.
- Define conflict rules per entity: append histories; field-level choice for jobs/profile; immutable document versions; duplicate captures merge by user choice.
- Server does not run SQL over client SQLite files.
- Compaction/snapshots are encrypted and verified; deletion includes tombstone retention and blob garbage collection.

### Hosted AI interaction

The client decrypts and sends only selected context to the hosted inference endpoint over TLS. The endpoint's plaintext processing/retention is separately disclosed. E2EE sync alone does not make hosted AI zero knowledge.

## Deployment

### Hosted web/PWA v1

- Static immutable assets on the chosen web server/CDN under a dedicated origin.
- TLS, HSTS, CSP, COOP/COEP only if the selected SQLite VFS/assets require them, `nosniff`, strict referrer and permissions policies.
- Service worker has versioned cache strategy and a tested update flow that never deletes OPFS.
- No API/database/account is required. Health checks cover asset availability, not user vault contents.
- Release notes explicitly warn when an origin/domain change requires user export/import.

### Desktop v1

- Signed installers where platform infrastructure permits, checksums, release provenance, and auto-update only after signing/rollback design.
- User data stays outside install directory; app upgrade cannot delete it.
- Reproducible build instructions and source kit: clone, install pinned toolchains/dependencies, run dev/build, locate data, export/uninstall.
- Native bridge/extension host is optional and independently installable/uninstallable.

### Optional network services

Labor/API proxies are not introduced just to hide free API keys unless a source's client-side policy requires it. When present, they are narrow source-specific endpoints with cache, quota, SSRF controls, and no vault access.

## Testing strategy

### Unit/property

- Domain state transitions, next actions, custom status categories.
- Money/date/location/URL normalization and filter-AST compiler.
- Requirement mapping and experience interval union.
- Claim support policy and sensitive-question classifier.
- Crypto envelope serialization (using standard libraries), checksums, and redaction.

### Repository/storage contracts

Run the identical suite against in-memory/reference, browser SQLite worker/OPFS, and native SQLite:

- transactions/rollback, constraints, concurrency/busy handling;
- migration from every supported schema;
- export/restore/checksum/corruption cases;
- FTS/search equivalence or documented fallback;
- Unicode, timezone, large description, attachment failure.

### Extractor/connectors

- Golden fixtures and provenance/confidence.
- Policy-disabled source and kill switch.
- hostile HTML/JSON-LD, SSRF/redirect/size/time cases.
- saved documented API payloads; live smoke tests separately and conservatively.

### AI evals

Use the eval suite in document 05 for every prompt/model/template change. Mock providers in ordinary CI; no real user data or billable key is required.

### UI/E2E

- Onboarding in web and desktop.
- Capture → extension outbox → Inbox → merge/review → apply flow.
- Offline reload, service-worker update, storage unavailable/quota errors, second-tab locking.
- Career import/confirmation, document generation/edit/version/export.
- Jobs table/board/filter builder, interviews/follow-ups, salary mapping.
- Backup/export/delete/restore and accessibility (keyboard, screen reader semantics, contrast).

### Extension

- Permission prompts and no `<all_urls>` baseline.
- Sender/origin validation and schema/size rejection.
- Incognito default, outbox expiry/dedupe/ack, app unavailable, malicious page messages.
- Chromium/Firefox compatibility path; manual fallback always works.

### Security/release

- Dependency/license/SBOM and secret scan.
- CSP/static analysis, DOM XSS review, local proxy/fetch adversarial tests.
- Signed artifact/checksum verification.
- Clean install, upgrade, downgrade refusal, uninstall with keep/delete-data choice.
- Manual privacy data-flow review for every network adapter.

## Release gates

- No source connector ships without a policy record and fixtures.
- No AI adapter ships without destination disclosure, secure-key plan, redaction, and eval pass.
- No schema release ships without web/native migration and restore tests.
- No extension release ships with blanket host permissions merely for future capability.
- No sync beta ships before key recovery, device removal, conflicts, deletion, and server metadata are documented/tested.
