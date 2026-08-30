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

The `APP-001` vault application boundary applies the same fail-closed rule before diagnostics reach a UI. It copies only reviewed health/persistence tokens, a bounded positive schema version, the read-only flag, and unique allowlisted issue codes; adapter name/details and arbitrary strings never survive. Typed lifecycle failures map to stable content-free application errors, while unknown adapter exceptions collapse without returning paths, SQL, or user content. See [vault application verification](../../proof/phase-1-vault-application-verification.md).

`APP-008` implements durable local diagnostics and a user-copyable support bundle without weakening that rule. `RecordDiagnosticEventCommand` binds a local UUIDv7, operation instant, and application version, then invokes the same observability redactor before persistence. SQLite schema versions 88–92 independently reject unknown fields, private/path-shaped or nested attributes, unbounded values, and updates; a trigger retains only the newest 1,000 events. `CopySupportBundleQuery` reads at most 200 recent records, revalidates each one, and emits `SupportBundleV1` as deterministic pretty JSON with `delivery: local-copy`. Stored corruption fails closed, arbitrary exceptions become content-free application errors, and neither command has a network or automatic-send capability. Product telemetry remains off and still requires the separate opt-in contract and disclosure review in D-053. See [local diagnostic support-bundle verification](../../proof/phase-1-local-diagnostic-support-bundle-verification.md).

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

The Phase 0 transfer proof requires sender origin and URL to agree with the single reserved HTTPS app origin, a top-level ordinary tab, strict request/response contracts, bounded messages, and an exact extension ID on receipt. SQLite commits the complete validated envelope before acknowledgement. A dropped acknowledgement retries the same item; exact duplicates are acknowledged idempotently, while ID/hash/nonce/sequence collisions fail as replay conflicts. Wrong origins, child/opaque frames, extension/native senders, oversized/extra-field messages, wrong IDs, changed checksums, expired captures, and acknowledgement replays are rejected. Firefox adds no content script or externally-connectable match and uses explicit checksummed JSON export/import.

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

The accepted browser-storage boundary additionally imports restore data under a temporary SAH-pool name and validates SQLite integrity/schema before target replacement. A correctly checksummed but truncated database is rejected while the healthy target remains readable. Every open runs `quick_check`. Observable persistence denial, low/unknown quota, and an expected database missing produce degraded local diagnostics; Coredrill does not attempt private-mode fingerprinting. An origin-wide Web Lock blocks a second writer before SQLite initialization and releases automatically after abrupt tab/page loss. [ADR-0003](../../adr/0003-adopt-browser-storage-support-floor.md) binds this behavior to the exact hosted Chrome/Firefox matrix and an explicit unsupported Safari/mobile fallback.

`BKP-005` keeps `persisted()`/`estimate()` observation passive and makes
`persist()` callable only through the explicit Vault & Backup action. The UI
receives stable path-free state rather than raw errors, origin-private data, or
record content. Its recurring export preference lives in SQLite, can be
snoozed or disabled, and advances only after a successful portable export;
button selection or failure is not recorded as recovery evidence. See [browser
vault recovery health version 1](browser-vault-recovery-health-v1.md).

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

`NAT-005` and `NAT-008` prove provider-secret lifecycles through exact target-confined Windows Credential Manager, macOS Keychain, and Linux Secret Service providers. The Tauri surface permits store/status/delete but never returns secret material; Coredrill-owned secret strings and retrieved buffers are zeroized, operations are serialized, and platform failures are content-free. Each proof harness generates a one-time synthetic value, captures all test output, and refuses to print it if the value is present. Unavailable or locked backends fail closed without a plaintext fallback. The Linux secure-store path passes under an ephemeral Secret Service, although the Linux native shell remains diagnostic for a separate GTK3 dependency risk. See [secure-storage verification](../../proof/native-secure-storage-verification.md) and [cross-platform native verification](../../proof/native-cross-platform-verification.md).

`NAT-006` proves first-OS database recovery through an official native picker called only inside Rust. The custom command receives an opaque session, never a path; the selected path never returns to the WebView, and dialog/filesystem JavaScript permissions are absent. Export snapshots WAL safely through SQLite's online-backup API, streams a version/schema/length/SHA-256 envelope, and atomically replaces a same-directory temporary file. Restore verifies the entire envelope and temporary SQLite database before closing the target, then maintains a same-volume recovery snapshot until atomic replacement, reopen, integrity, and schema checks succeed. Corrupt bytes and an injected post-replacement failure both preserve the previous usable vault. This remains database-only recovery evidence, not the full portable archive promised by D-051. See [native archive verification](../../proof/native-archive-verification.md).

`BKP-001` adds the adapter-neutral D-051 writer. It rechecks exported database
length/schema/checksum, requires every recorded content-addressed attachment to
resolve and match its length/hash, calculates JSON/CSV checksums, validates the
complete manifest, and only then returns deterministic ZIP bytes. Missing,
unreadable, corrupt, oversized, duplicate, or unsafe inputs return stable typed
errors without paths or user content and without a successful partial archive.
The current 256 MiB entry/512 MiB aggregate ceiling bounds the in-memory writer.
The archive declares encryption mode `none`; save/picker UX must disclose that
actual state and must persist bytes only after writer success. Restore remains a
separate dry-run and transactional boundary in `BKP-003`.

`BKP-002` adds production human-readable projections without broadening that
trust boundary. All 29 canonical dataset reads occur inside one database
transaction; schema/vault drift, query failure, invalid stored JSON or boolean
state, binary/non-finite values, or size overflow returns a stable redacted
error and no successful partial bundle. JSON preserves original strings and
nullable fields. CSV follows reviewed escaping and CRLF rules, distinguishes
null from empty string, and prefixes whitespace/`= + - @` string starts with an
apostrophe to block spreadsheet formula execution. The SQLite member remains
the lossless restore source; see the [version-1 mapping and explicit
exclusions](portable-data-export-v1.md).

`BKP-003` adds a fail-closed reader and a two-step restore boundary. Before any
adapter sees candidate SQLite bytes, the reader validates the bounded ZIP,
strict version-1 manifest, exact entry inventory, safe paths, uncompressed entry
sizes, and every recorded length and SHA-256. A temporary candidate must then
pass full SQLite integrity, current schema, and manifest-bound single-vault
identity checks. Preview is non-mutating and discloses explicit overwrite and
attachment changes. Commit repeats archive validation, rejects target database
or attachment drift since preview, and delegates only to an atomic adapter port
that must preserve the prior usable vault on failure. Errors are typed and
content-free. See [portable archive restore version 1](portable-archive-restore-v1.md).

`BKP-004` adds pickerless desktop recovery checkpoints beneath a canonical
per-database app-data backup directory. A SQLite online snapshot, recovery
envelope checksum, and full temporary reopen/integrity/schema check all succeed
before the new timestamped file becomes known-good or any older verified file
is eligible for retention cleanup. Retention cannot be zero. The new backup is
never pruned; corrupt or unexpected entries are retained for explicit recovery
attention; and deletion/sync failure keeps extra known-good backups with a
cleanup-pending result. Snapshot, publish, and verification failures leave the
active vault and all earlier known-good backups unchanged. See [desktop
automatic backup version 1](desktop-automatic-backup-v1.md).

`NAT-007` proves a Windows current-user NSIS package from a clean commit. CI rebuilds the package, installs it only under a generated temporary root, rejects the contract-only native storage probe if bundled, launches the installed application five discarded plus 20 measured times, records package/application hashes and unsigned development status, aggregates the application/WebView2 process tree, and runs the uninstaller. Program files are removed while the platform app-data directory remains. WebView2 uses Tauri's download bootstrapper if the runtime is absent, so this Phase 0 package is not a fully offline or signed public release. The recorded Windows 10 and hosted-runner results remain nonconformant diagnostics until the Windows 11 25H2/HW-WIN-REF release matrix executes. See [native package verification](../../proof/native-windows-package-verification.md).

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

The native checkpoint runs the reusable callback-transaction suite and shared vault-migration/repository suite against the exact Rust service through a JSON-lines probe. `NAT-003` proves bound hostile values, rollback/commit semantics, migration checksums, durability after close/reopen, and query/write separation. `NAT-004` adds Rust layout tests, real-process missing/unusable-root cases, final-leaf and managed-directory confinement, and Windows junction rejection for both database and attachment roots; a separate pinned-Tauri test verifies the configured application-data path on the platform. `NAT-005` adds mock redaction/validation tests and a real Windows Credential Manager lifecycle whose captured output is checked before release. `NAT-006` adds checksum/corruption, atomic-replacement, rollback, cancellation, and reopen-durability proof for database recovery. `NAT-007` and `NAT-008` build installable Windows, macOS, and Linux packages, reject the internal storage probe, smoke-launch each package, exercise exact target secure stores, and retain dependency/security findings. Linux native remains diagnostic until its GTK3 RustSec and maintenance findings are resolved; see [cross-platform native verification](../../proof/native-cross-platform-verification.md).

`DB-008` binds the complete current repository surface to one versioned manifest rather than adapter-specific expected lists. The identical 15-case aggregate passes fast Node SQLite, official browser SQLite/OPFS in exact Chrome 151/152 and Firefox 153/154, and native rusqlite on Windows, macOS, and diagnostic Ubuntu. Manifest/component drift and completed-case drift fail closed. See [repository-contract CI parity verification](../../proof/phase-1-repository-contract-ci-verification.md).

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
