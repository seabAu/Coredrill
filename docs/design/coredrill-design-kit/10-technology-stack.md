# 10 — Technology stack and engineering baseline

Status: **accepted direction with Phase 0 compatibility gates**. Library versions are pinned when the repository is scaffolded, not frozen in this design document. Use the latest stable mutually compatible versions after license, maintenance, bundle, and security review.

## 1. Stack decision in one sentence

Build one TypeScript/React product core, ship it as a static local-first PWA and a Tauri desktop app, add a WXT Manifest V3 capture extension, persist through a shared SQLite contract, keep Rust as a thin privileged desktop boundary, and add Python only for a measured workload that justifies a separate worker.

## 2. Languages

| Language | Role | Rule |
|---|---|---|
| TypeScript (strict) | Domain, use cases, UI, web workers, extension, deterministic extraction, AI orchestration, contracts, most tests | Primary language; no untyped boundary data |
| SQL | Schema, migrations, indexes, FTS, reports | Parameterized only; shared migration source |
| Rust | Tauri shell, native filesystem/database/secure-storage/update commands | Thin capability boundary, not a duplicate domain layer |
| HTML/CSS | Semantic presentation, print/export templates | Accessible and CSP-compatible |
| Python (optional) | Later document/NLP/batch worker | Never required by baseline web/PWA; add only after benchmark/ADR |

### Why not Python-first scraping

The baseline capture input is the page already open in the user's browser. TypeScript can inspect the live DOM, JSON-LD, selected text, and browser APIs without adding a local service or translating contracts. It also shares schemas and fixtures with the web application and extension.

Python becomes appropriate when a measured workload benefits from its ecosystem—for example high-fidelity PDF/OCR pipelines, large offline batch imports, a specific local NLP model, or controlled research against allowed sources. At that point it runs behind a versioned JSON contract as an optional desktop worker. Python is not a way to evade site policies, robots controls, authentication, or access restrictions.

## 3. Product runtimes

| Surface | Selected technology | Reason |
|---|---|---|
| Hosted browser/PWA | React + Vite static application | Shared UI, offline install, no v1 application server, simple origin isolation |
| Desktop | Tauri 2 using the shared frontend | Small system-webview shell and reviewed JS↔Rust commands; native SQLite/files/secrets |
| Extension | WXT + React, Manifest V3 | Generated manifests/entrypoints and multi-browser build path |
| Browser database | Official SQLite WASM in dedicated Worker + OPFS | Real relational/FTS model locally; same SQL contract as desktop |
| Desktop database | Native SQLite behind Tauri command/plugin adapter | Durable local database and attachments in OS app-data |
| Future sync API | TypeScript service, evaluated later | Domain contracts stay TS; no v1 deployment or account dependency |

Tauri supports web frontends and connects JavaScript to Rust commands while using the platform webview ([Tauri overview](https://v2.tauri.app/start/), [calling Rust](https://v2.tauri.app/develop/calling-rust/)). WXT supports Manifest V2/3 and multiple browser targets from one codebase, and generates the manifest from config and entrypoints ([WXT](https://wxt.dev/), [manifest guide](https://wxt.dev/guide/essentials/config/manifest.html)). SQLite documents OPFS-backed persistence and its worker/concurrency trade-offs ([SQLite persistence](https://www.sqlite.org/wasm/doc/trunk/persistence.md)).

## 4. Workspace and build tooling

| Concern | Selection | Notes |
|---|---|---|
| Package manager | pnpm workspaces | Strict, efficient monorepo installs |
| Task graph/cache | Turborepo | Build/test/lint graph; no runtime dependency |
| Web build/dev | Vite | PWA and shared Tauri frontend |
| PWA | `vite-plugin-pwa` / Workbox | App shell/offline assets; database remains OPFS |
| Type checking | TypeScript strict project references | `noUncheckedIndexedAccess`, exact optional properties where practical |
| Lint | ESLint flat config + `typescript-eslint` | Type-aware rules on domain/security packages |
| Format | Prettier | One deterministic style; import sorting chosen once |
| Release notes | Changesets | Package changes and migration notes |
| CI | GitHub Actions | Matrix tests/builds; signed release jobs later |
| Dependency updates | Renovate or Dependabot, choose one | Group low-risk updates; never auto-merge privileged/runtime packages |

Phase 0 records exact Node, pnpm, Rust, and OS build prerequisites in `.tool-versions`/Volta-equivalent and the repository README. The lockfile is committed.

## 5. Frontend application stack

| Concern | Selection | Boundary |
|---|---|---|
| UI framework | React | Feature views and shared components |
| Routing | TanStack Router | Typed local routes/search parameters |
| Async/cache | TanStack Query | Async ports, worker calls, connector requests; not durable truth |
| Tables | TanStack Table + TanStack Virtual | Dense jobs/import/evidence tables |
| Ephemeral state | Zustand | Shell, selection, panel, density, unsaved UI preferences |
| Forms | React Hook Form + Zod | Form state plus boundary validation |
| UI primitives | Radix UI primitives with local styled wrappers | Accessibility baseline; avoid cloud/paid dependency |
| Styling | Tailwind CSS + CSS custom-property tokens | Theme/density/responsive implementation |
| Icons | Lucide React | One open icon language |
| Editor | Tiptap open-source core + selected extensions | Restricted schema, versioned JSON, HTML/Markdown adapters |
| Charts | Recharts | Small accessible reports; always pair with data table |
| Dates | date-fns + date-fns-tz | Explicit date-only vs instant/time-zone types in domain |
| Sanitization | DOMPurify plus plain-text/source-snapshot rules | Defense in depth; raw source never mounted as active HTML |
| Generic article extraction | Mozilla Readability + platform DOM APIs | Last-resort user-invoked page parsing |
| Command menu | cmdk or a small Radix-based implementation | Validate bundle/accessibility during spike |

Tiptap’s React bindings work with Vite and its product offers an open-source headless core ([Tiptap React guide](https://tiptap.dev/docs/editor/getting-started/install/react), [Tiptap docs](https://tiptap.dev/docs)). Do not depend on Tiptap Cloud, paid conversion, collaboration, or AI features for v1.

### Durable-state rule

SQLite is the source of truth. TanStack Query caches query results; Zustand stores interaction state. Neither persists canonical jobs, evidence, documents, or sync metadata. UI code calls typed application commands/queries, never SQL or Tauri directly.

## 6. Storage and data access

### Browser

- Official `@sqlite.org/sqlite-wasm` 3.53.0-build1, pinned in the reviewed lockfile and dependency inventory.
- Dedicated database Worker; no synchronous database work on UI thread.
- Accepted browser VFS: `opfs-sahpool` for a single-writer model because SQLite documents broad support and no COOP/COEP requirement.
- One coordinator per vault under an origin-wide Web Lock. Secondary tabs receive a controlled typed handoff until a validated multi-tab requirement and compatibility evidence justify another VFS.
- Explicit-user-action `navigator.storage.persist()` request where supported, observable persistence/quota/missing-database diagnostics without private-mode fingerprinting, and visible backup/recovery guidance.
- Service worker caches application assets; it does not copy or sync the vault.

The Phase 0 proof harness uses Vite 8.1.0 and Playwright 1.61.1, both exact-reviewed development dependencies rather than product runtime services. On Edge 151 it opens SQLite 3.53.0 with `opfs-sahpool` in a dedicated Worker and proves transactional migration, durability, checksummed export, clean-context restore, delete, persistence/quota/missing-data diagnostics, corrupt-restore preservation, tab contention/handoff, abrupt reload recovery, and deterministic 100/2,000/10,000-record benchmarks. `STG-004`–`STG-008` are complete and D-025 is Accepted through [ADR-0003](../../adr/0003-adopt-browser-storage-support-floor.md).

The accepted support floor includes exact Chrome `152.0.7977.54`/`151.0.7922.138` Playwright lanes, real branded Firefox `154.0`/`153.0` WebDriver lanes, Edge 151 failure/contention/benchmark evidence, and an immutable-pinned browser-install CI matrix. All exact lanes passed on commit `0271aaa65b793e530b092e0ce35c59f9ff6b7728` in [Foundation CI run 32712600336](https://github.com/seabAu/Coredrill/actions/runs/32712600336). Playwright's patched Firefox/WebKit builds are not reported as branded Firefox/Safari evidence. Safari/macOS and mobile device rows remain unsupported until executed. No npm runtime dependency is added for WebDriver; the Node harness speaks the local W3C WebDriver protocol to Mozilla geckodriver.

### Desktop

- Native SQLite through a narrow reviewed Tauri adapter. Evaluate the official SQL plugin versus a small `rusqlite` command layer during Phase 0.
- Choose the option that best satisfies transactions, migrations, backup API, bundled SQLite features, parameter binding, encryption plan, and cross-platform tests.
- Attachments use content-addressed files under app-data; database stores manifest, hash, media type, size, and logical relationship.
- Provider secrets use OS keyring/secure-storage integration behind a narrow native capability; never the SQLite database or repository config in plaintext.

`NAT-001` through `NAT-005` pin Tauri 2.11.3/CLI 2.11.3 and carry `rusqlite` 0.40.1 as the provisional database candidate. The Windows shell builds the shared Vite frontend with exact command permissions; the real-process native adapter passes the shared callback-transaction and migration/repository contracts; the pinned Tauri application-data resolver feeds canonical, link-confined database and attachment roots; and a separate store/status/delete command passes a redacted Windows Credential Manager lifecycle. Secure storage uses exact `keyring-core` 1.0.0 plus target-only `windows-native-keyring-store` 1.1.0 with search disabled and `zeroize` 1.9.0. The official SQL plugin remains a live database alternative because this checkpoint does not yet prove backup/atomic replacement, installable packaging, resource behavior, or cross-platform acceptance. Evidence and reviewed Cargo risk are in [native verification](../../proof/native-sqlite-tauri-verification.md) and [secure-storage verification](../../proof/native-secure-storage-verification.md); no Accepted decision changes here.

### Query layer

- Handwritten SQL migrations and focused repository queries.
- No full ORM in v1. A query builder may be used only if it does not obscure shared SQL/migrations or diverge across WASM/native adapters.
- Zod validates serialized boundary DTOs; domain constructors validate invariants.
- FTS5 feature detection with a normalized-token fallback.
- All destructive schema changes require a backup-compatible migration and downgrade/export story.

## 7. Extension stack and boundary

- WXT with React for side panel/popup/options UI.
- Manifest V3 first; Firefox build support verified, not assumed.
- `activeTab`, `scripting`, and bounded extension storage baseline.
- Optional host permission is requested only when a user enables a reviewed source adapter.
- Shared `contracts`, `capture-core`, `extractors`, and `source-policy` packages; no import from full app UI/storage packages.
- Zod-validated, versioned `CaptureEnvelope` with checksum, nonce/sequence, sender, timestamps, raw candidates, and field provenance.
- Bounded outbox with acknowledgement, idempotent retry, explicit export, and expiry.
- No provider secrets, full vault, background crawl, or arbitrary fetch proxy in the extension.

Autofill is not part of the baseline capture extension. If added later, it becomes a separate capability and permission set with a field-by-field preview, restricted ATS adapters, fixtures, and no submission action.

## 8. Documents

| Operation | Selection |
|---|---|
| PDF text import | `pdfjs-dist`, with page/line provenance and graceful scanned-PDF detection |
| DOCX import | `mammoth` into a constrained intermediate representation |
| Plain text/Markdown | Native parse plus strict normalization |
| Rich editing | Tiptap JSON as editable representation; sanitized export adapters |
| DOCX export | `docx` or a reviewed equivalent; golden-file and Word/LibreOffice checks |
| PDF export | Print-focused HTML/CSS through browser/Tauri webview; visual regression checks |
| Attachment hashing | Web Crypto in browser; Rust/standard crypto in native boundary |

Imported binary files are untrusted. Enforce size/type limits, do not execute macros, and do not rely only on extensions/MIME declarations. OCR is deferred; scanned files produce an actionable manual/OCR-worker option.

## 9. Extraction and source connectors

### TypeScript baseline

- JSON-LD `JobPosting` parser;
- Greenhouse and Lever public postings adapters;
- USAJOBS API adapter when configured under its current terms;
- selected-text and paste/manual input;
- Mozilla Readability plus conservative DOM heuristics as last resort;
- BLS/O*NET/CareerOneStop and other approved public labor-data adapters;
- connector policy registry with enablement, credentials, terms/license notes, retention, attribution, rate limit, last review, and kill switch.

### Optional Python worker

If Phase 5 or later establishes a need:

- Python 3 current stable supported line, managed with `uv`;
- Pydantic schemas generated/verified against versioned JSON Schema;
- JSON Lines or local HTTP/stdio protocol with size/time limits;
- isolated worker process, explicit capabilities, no access to provider keys unless its contract requires and documents it;
- packaged only in desktop distributions that enable the feature;
- identical golden fixtures against the TypeScript contract;
- restart, cancellation, and crash recovery behavior.

The trigger must include benchmark data and deployment-cost analysis. “Python is common for scraping” is not sufficient.

## 10. AI and retrieval

### Product-owned boundary

`AiPort` and `PromptTemplateV1` remain provider-neutral. The adapter may use official provider SDKs or the Vercel AI SDK after Phase 4 evaluation, but domain/application packages never import those SDKs.

Modes:

1. Disabled/template-only.
2. Local OpenAI-compatible/Ollama-style endpoint, primarily desktop.
3. Direct BYOK provider adapter with secure secret storage and explicit data flow.
4. Hosted authenticated adapter later.

### Structured generation

- Zod/JSON Schema output contract per operation.
- Provider/model/capability discovery; no assumptions based on model name alone.
- Cancellation, bounded retries, idempotency token, token/context budget, and safe truncation.
- Captured listing is delimited untrusted data; instructions within it are ignored.
- Context plan references evidence IDs and minimizes private fields.
- Generation record stores template/version, context references/hashes, model/provider, parameters, output, validation, and user disposition.

### Retrieval

- Phase 3/4: structured relations, FTS5, filters, and deliberate evidence selection.
- Embeddings only if evaluations show lexical/structured retrieval misses important evidence.
- If used, vectors are stored locally with model/version/dimension and rebuilt rather than silently mixed.
- No vector server for a personal local vault.

## 11. Testing stack

| Layer | Tools | Required focus |
|---|---|---|
| Unit/domain | Vitest | Value objects, policies, status transitions, claim rules |
| Property | fast-check | Filter AST, migrations, normalization, idempotency, salary units |
| Component | React Testing Library + user-event | Keyboard, focus, forms, errors, provenance |
| API/connector | MSW + frozen fixtures | Retries, rate limits, schemas, policy kill switch |
| Repository contracts | Vitest against browser and native adapters | Same queries, transactions, migration behavior |
| E2E web | Playwright | PWA/offline/capture-import/core journey |
| E2E desktop | Tauri WebDriver/supported harness plus smoke scripts | Packaging, native files/secrets/restore |
| Extension | WXT test setup + Playwright persistent context | Permissions, side panel, outbox, bridge |
| Accessibility | axe-core + manual NVDA/VoiceOver/keyboard matrix | WCAG 2.2 AA flows |
| Visual | Playwright screenshots | Document pagination, dense tables, themes, responsive states |
| Security | dependency audit, secret scan, Semgrep/CodeQL as appropriate | CSP, IPC allowlist, injection, unsafe HTML |
| AI eval | Frozen cases + deterministic validators + human rubric | Claim support, relevance, refusal, prompt injection |

No extractor or AI evaluation fixture may contain copyrighted/private production content without a documented right to retain it. Prefer synthetic or licensed examples.

## 12. Security engineering baseline

- Strict CSP with no unsafe inline/eval in production.
- Trusted Types where supported and practical; sanitizer is not permission to render arbitrary HTML.
- Tauri capability/command allowlist; validate every IPC argument and return type.
- Parameterized SQL, transaction boundaries, and attachment path canonicalization.
- Secret scanning and `.env.example` with placeholders only.
- Dependency licenses and transitive risk recorded before adoption.
- Network allowlist by connector/provider; redirect and DNS behavior reviewed for SSRF-capable native fetches.
- Extension follows Chrome's guidance to minimize permissions, validate messages, and protect sensitive data ([Chrome extension security](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure)).
- Build provenance, signed desktop artifacts, checksums, update signing, and reproducible release notes before public distribution.

## 13. Deployment

### Hosted PWA

- Static assets on a dedicated origin/subdomain.
- HTTPS, immutable hashed assets, security headers, correct service-worker scope.
- Hosting must support SQLite WASM/Worker MIME types and any tested cross-origin headers.
- No server database or required API in v1.
- A deployment-origin change is a data migration event because OPFS is origin-scoped; provide export/import guidance before cutover.

### Desktop

- Windows first if that reflects the developer/test environment, then macOS/Linux after build runners and signing/notarization are available.
- Signed installers, checksum manifest, release channel, migration notes, updater rollback/runbook.
- Repository clone/dev kit remains supported but is not the public user's only installation route.

### Extension

- Store listing plus reproducible zipped/sideload build.
- Privacy disclosure matches actual permissions and captured fields.
- Store release is version-compatible with at least the current and previous app capture contract.

## 14. Version and compatibility policy

- SemVer packages; schema and capture contracts have explicit integer versions.
- Current and previous capture-envelope versions accepted during rolling updates.
- Portable archive manifest records app, schema, attachment, and encryption versions.
- Database migration is forward-only inside an installation; user-readable export remains the downgrade escape hatch.
- Beta may break only with a migration/export notice. Post-1.0 changes require a compatibility window.
- Browser support is evidence-based from Phase 0: current and previous stable Chromium/Firefox/Safari where SQLite/OPFS tests pass. Unsupported modes get manual/desktop fallbacks.

## 15. Choices deliberately not made

| Rejected baseline | Reason |
|---|---|
| Next.js/full-stack framework | A server rendering/data layer adds little to an accountless static local-first application and complicates shared Tauri/PWA behavior |
| Electron | Tauri better fits a small native boundary and system-webview distribution goal |
| IndexedDB as canonical model | The relational/search/migration model is shared more cleanly through SQLite; IndexedDB may still support small caches/outbox |
| Full ORM | Risks divergence between WASM/native SQLite and obscures reviewed SQL/migrations |
| Python-first application | Duplicates web/extension contracts and adds packaging/runtime complexity |
| Required cloud backend | Contradicts baseline product promise and adds cost/identity/operations before value is proven |
| Required AI SDK/provider | AI-disabled and provider-neutral operation are release requirements |
| General crawling framework | Source policy and user-invoked capture matter more than crawler breadth |
| Auto-apply system | High trust, policy, quality, and user-agency risks; not the product goal |

## 16. Phase 0 stack gates

The direction becomes fully locked only after these spikes:

1. official SQLite WASM/OPFS create → migrate → query → export → restore in target browsers;
2. same repository suite against native SQLite through candidate Tauri adapter;
3. browser vault backup/restore and origin-change rehearsal;
4. WXT side-panel/popup capture with `activeTab`, outbox, and app transfer on Chromium and Firefox fallback;
5. Tauri signed/dev package opens, stores, exports, and restores on the first target OS;
6. Tiptap structured document round-trip and PDF/DOCX export fixture;
7. CSP-compatible production build with no surprise eval/remote asset dependency;
8. bundle/startup/memory baseline on reference devices;
9. license/security inventory for every production dependency;
10. accessibility smoke test of shell, Pipeline, review, and editor.

If a gate fails, record evidence in [11 — Decision register](11-decision-register.md) and choose the smallest replacement that preserves the product boundary.
