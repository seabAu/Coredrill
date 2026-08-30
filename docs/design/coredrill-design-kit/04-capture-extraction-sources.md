# 04 — Capture, extraction, sources, and Python

## Capture contract

Every entry path—extension, paste, URL/API connector, file import, or optional Python worker—produces a versioned envelope before modifying domain records.

Contract versions are explicit integers under the accepted compatibility policy in [10 — Technology stack](10-technology-stack.md#14-version-and-compatibility-policy). The earlier illustrative string `"1.0"` was corrected to integer `1` before any durable capture version shipped.

```ts
type CaptureEnvelopeV1 = {
  specVersion: 1;
  id: string;
  capturedAt: string;
  expiresAt: string;
  captureMethod: "extension" | "paste" | "file" | "connector" | "manual";
  sender: {
    kind: "browser_extension" | "web_app" | "desktop_app" | "import_tool";
    id: string;
  };
  sequence: number;
  nonce: string;
  source: {
    url?: string;
    canonicalUrl?: string;
    pageTitle?: string;
    sourceKind?: string;
    externalId?: string;
  };
  content: {
    jsonLd?: unknown[];
    selectedText?: string;
    readableText?: string;
    sanitizedHtml?: string;
    apiPayload?: unknown;
  };
  fieldCandidates: FieldCandidateV1<unknown>[];
  captureClient: { name: string; version: string };
  contentHash: string;
};
```

V1 validates strict object shapes and safe HTTP(S) source URLs, and caps the UTF-8-encoded envelope at 2 MiB before schema traversal. It separately caps selected text at 64 KiB, readable text at 512 KiB, sanitized HTML at 1 MiB, JSON-LD at 64 items, and field candidates at 256. Safe truncation markers belong to capture implementations; a boundary validator never silently truncates. Never capture cookies, form inputs, hidden tokens, browser history, authorization headers, or the page's JavaScript state wholesale.

`CAP-001` makes the remaining V1 invariants executable without changing that serialized shape. Before inbox ingestion creates a durable source row, the envelope UUID is the source-snapshot reference: every included field candidate must use `sourceType: "capture"`, point its provenance `sourceId` to that UUID, and retain the envelope's exact `capturedAt`; candidate IDs are unique within the envelope. Expiry must be strictly later than capture time. A canonical semantic SHA-256 covers source metadata, captured content, and sorted candidate facts and can be independently recomputed; the transfer/outbox checksum continues to cover the complete envelope, including replay metadata. Boundary consumers use one version dispatcher. Under the accepted current-and-previous policy, the accepted set is `[1]` while V1 is the only shipped version; the dispatcher reports an otherwise well-formed integer version outside that set as unsupported rather than misclassifying it as malformed V1.

`CAP-002` keeps transport replay identity separate from semantic duplicate evidence. An exact envelope/checksum/nonce/sequence retry returns the existing durable receipt; a fresh replay identity with the same semantic content hash is acknowledged as a `content_hash` duplicate and points to the original durable envelope instead of inserting a second receipt; reuse of an envelope ID, nonce, or sender sequence with different content still fails closed. Saved-job suggestions aggregate exact connector/external ID, fragment-free canonical URL, job-source or source-snapshot content hash, and conservative title/company token similarity. The current transparent fuzzy gate requires title similarity of at least `0.75` and company similarity of at least `0.80`, with common title abbreviations and company legal suffixes normalized. Results expose the matched reasons and separate title/company components; they never merge records, promote fields, overwrite user-confirmed values, or present a hiring/ATS probability.

`CAP-003` routes explicit manual form input, pasted text or HTTP(S) URLs, and saved HTML/text/JSON files through the same V1 builder and durable inbox. Pasted URLs have fragments removed and are recorded without a network request. Saved files are limited to 2 MiB; readable text is limited to 512 KiB; JSON must parse and remain within 10,000 values and 32 levels; unsupported or invalid files fail before a receipt is written. Saved HTML never enters a live document: a detached parser removes script, style, template, frame, object/embed, SVG, and MathML elements and retains only normalized readable text. Manual title/company candidates use `method: "user"`, confidence `1`, the envelope UUID as their capture source, and an exact captured-at time. The existing `manual_export` receipt channel identifies user-supplied transport while the envelope retains the specific manual/paste/file method and source kind. No path creates a job or overwrites reviewed data.

`CAP-004` preserves that boundary during review. Durable envelope JSON is parsed with the strict V1 dispatcher and its semantic content hash is verified again before preview. Selected/readable text and JSON values become inert text sections; retained HTML is accepted only when the caller supplies the detached HTML-to-text renderer, so raw markup is never part of the preview model. Every field candidate remains separately visible with its method, confidence, provenance pointer, and retained or derived excerpt. A pointer maps to its captured section when possible, while paths such as `/fields/title` still navigate to the evidence record without pretending the value has been confirmed. Hostile strings are escaped by ordinary React text rendering, source URLs are displayed rather than visited, and preview performs no network request or durable mutation.

`CAP-005` makes candidate reconciliation explicit before approved extractors arrive. Trusted existing candidates and untrusted incoming proposals are separate inputs; an incoming proposal cannot self-declare a durable confirmation. Every candidate is revalidated and retained, normalized JSON values are compared canonically, and differing values produce a bounded unresolved `FieldConflictV1`. A single trusted existing confirmation always remains selected. Otherwise user-authored evidence ranks above API/JSON-LD, selector, readability, heuristic, and LLM evidence, with confidence/time/ID used only for deterministic ties; this selection is a review suggestion, never confirmation or an automatic entity write. Ambiguous confirmation state, reused IDs, invalid conflict IDs, or an oversized conflict fails closed.

## Extraction result

```ts
type FieldCandidateV1<T> = {
  specVersion: 1;
  id: string;
  fieldName: string;
  value: T;
  rawValue?: T;
  provenance: {
    specVersion: 1;
    source: { sourceType: string; sourceId: string; pointer: string };
    method: "api" | "jsonld" | "selector" | "readability" | "heuristic" | "llm" | "user";
    extractor: { name: string; version: string };
    capturedAt: string;
    confidence: number;
    sourceExcerpt?: string;
    licenseNote?: string;
  };
  userConfirmation?: {
    specVersion: 1;
    id: string;
    actor: "user";
    confirmedAt: string;
    confirmedValueHash: string;
  };
};

type ExtractedJobV1 = {
  title: FieldCandidateV1<string>[];
  company: FieldCandidateV1<string>[];
  description: FieldCandidateV1<string>[];
  salary: FieldCandidateV1<MoneyRange>[];
  locations: FieldCandidateV1<ExtractedLocation>[];
  workplaceType: FieldCandidateV1<WorkplaceType>[];
  postedAt: FieldCandidateV1<string>[];
  validThrough: FieldCandidateV1<string>[];
  requirements: FieldCandidateV1<ExtractedRequirement>[];
  applyUrl: FieldCandidateV1<string>[];
};
```

Resolution policy ranks user > official API/valid JSON-LD > source-specific selector > generic DOM > heuristic > LLM, while still retaining every candidate and detecting internal conflicts. `FieldConflictV1` holds at least two unique candidate IDs; an explicit resolved form records a retained candidate selected by the user. Confirmation remains a separate durable record, so an LLM-derived candidate cannot become confirmed merely by changing its provenance label. Confidence is calibrated per field/extractor using fixtures; it is not a decorative number.

## Layered pipeline

1. **Policy gate:** connector enabled, permitted capture method, URL scheme/domain, size, rate, terms review, kill switch.
2. **Canonicalization:** strip tracking parameters using allowlists, preserve material query identifiers, normalize fragments, determine source/external ID.
3. **Structured inputs:** documented API payload and `JobPosting` JSON-LD.
4. **Source adapter:** approved Greenhouse/Lever/etc. URL and field mappings.
5. **Generic document:** visible title/meta/headings, Mozilla Readability, labeled sections, user-selected text.
6. **Deterministic normalization:** money, dates, locations, work mode, employment type, requirements, skills/taxonomy matches.
7. **Optional LLM normalization:** only ambiguous leftovers, with raw candidates retained and schema-constrained output.
8. **Conflict/duplicate detection:** compare source ID, canonical URL, hashes, company/title/date.
9. **Human review:** user confirms or edits before the job becomes trusted.
10. **Persist transactionally:** snapshot, provenance, resolved entity fields, requirements, and audit/import report.

Refresh never overwrites a confirmed field. It creates a new snapshot and a comparison: added/removed/changed requirements, compensation, deadline, location, and content. Expired/deleted pages mark source state; they do not delete the user's job.

## Source adapter priority

### Tier A — baseline, compliant-by-design inputs

#### User-invoked current page

Capture only after the user clicks the extension or supplies content. This is a personal workflow, not an unattended crawler. Site-specific prohibitions still apply; the extension maintains a denylist/policy registry and shows manual-entry fallback.

The shipped `XTR-003` baseline keeps this last-resort path pure, local, and bounded:

- explicit selected text produces one high-confidence description candidate while retaining the exact selected string as raw evidence;
- generic page extraction accepts only a caller-supplied `Document`, clones it before inspection, and never fetches, observes, mutates, or persists the live page;
- scripts, styles, forms, embedded content, hidden content, navigation, footers, sidebars, and obvious advertising/consent/share boilerplate are removed before extraction;
- visible `h1`, Open Graph/Twitter title metadata, document title, labeled definition-list/table values, and requirement sections produce separate provisional selector candidates with stable DOM evidence paths;
- conflicting or repeated values remain separate candidates, and unsafe application URLs are rejected rather than normalized into trusted data;
- [Mozilla Readability 0.6.0](https://github.com/mozilla/readability) runs with JSON-LD disabled on a second detached clone. Coredrill retains only normalized plain `textContent`; Readability-generated HTML is discarded rather than treated as safe markup;
- the runtime uses the browser's platform DOM. [LinkeDOM 0.18.13](https://github.com/WebReflection/linkedom) is test-only, supplies deterministic detached documents for synthetic golden fixtures, and is isolated behind a runtime-checked adapter because its published DOM declarations do not match the repository's newer browser type surface;
- element, depth, total text, readable text, selected text, candidate, and requirement limits fail closed with content-free errors before an unbounded result can cross the extractor boundary.

Every emitted candidate passes the versioned `FieldCandidateV1` contract and carries capture source ID, exact evidence pointer, extractor identity/version, method, capture time, confidence, source excerpt, raw value, and a visible-source review note. The extractor does not confirm fields, resolve conflicts, write entities, call AI, add permissions, or introduce network behavior.

#### Schema.org `JobPosting`

Parse JSON-LD from a single job detail page. Validate `@context`, `@type`, title, description, hiring organization, location/remote fields, date, validity, identifier, employment type, and base salary. Treat it as untrusted page input and compare to visible content. Google documents the format and requires the structured data to represent the visible job page: [JobPosting documentation](https://developers.google.com/search/docs/appearance/structured-data/job-posting).

#### Greenhouse Job Board API

Greenhouse documents unauthenticated GET access to published board/job JSON. Implement recognized board-token URLs and retrieve through the desktop/hosted connector layer when policy permits: [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html). Do not submit applications via the API in v1.

The shipped `XTR-004` baseline keeps that source boundary explicit and non-executing:

- the interface and policy review dated 2026-08-30 uses Greenhouse's current Job Board API documentation, API overview, legal hub, and privacy policy. The documentation says published Job Board GET data is public and unauthenticated; authenticated application submission is excluded;
- official `boards.greenhouse.io` and `job-boards.greenhouse.io` job URLs are recognized only when both a bounded board token and positive job-post ID are present. Custom domains, subdomains, insecure or credentialed URLs, ambiguous IDs, and malformed paths are rejected;
- recognized references create an immutable descriptor for exactly `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}?pay_transparency=true`, with credentials omitted and JSON requested. No callback, `questions=true`, POST, arbitrary host, or executing fetch client is representable in this slice;
- the checked-in connector record allows only the exact `boards-api.greenhouse.io` destination and `documented_public_api` method, requires attribution, uses no credentials, carries a 30-day review deadline and runtime kill switch, and records conservative rate/cache controls because the reviewed Job Board documentation publishes no rate limit. Those transport controls must be implemented before a network client ships under `XTR-009`;
- the pure payload adapter requires the response job ID to match the requested ID, rejects any application-question, location-question, compliance, demographic-question, or data-compliance field atomically, and ignores unrelated API fields rather than treating them as job evidence;
- title, company, untrusted description content, location, first-published/deadline dates, safe HTTP(S) apply URL, Greenhouse post ID, and valid pay-transparency ranges become separate provisional API candidates. Exact recognized raw values, source pointers, extractor version, confidence, attribution/review note, capture source, and capture instant remain attached; and
- payload keys, strings, pay ranges, candidates, source URLs, board tokens, and identifiers are bounded before output. Synthetic fixtures contain no production employer content or applicant data.

The adapter does not render Greenhouse HTML, confirm fields, normalize money/dates beyond basic validity, write entities, fetch a URL, cache a response, submit an application, handle credentials, or retrieve candidate data. Normalization remains `XTR-007`; executing rate/cache/retry/last-review behavior remains `XTR-009`.

#### Lever Postings API

Lever documents public published postings, fields including description, locations, workplace type, apply URL, and optional salary: [Lever Postings API](https://github.com/lever/postings-api). Respect its instance/board model and current terms; do not turn one company's endpoint into an undocumented global search service.

The shipped `XTR-005` baseline keeps that source boundary explicit and non-executing:

- the interface and policy review dated 2026-08-30 uses Lever's current official Postings API repository at upstream revision `f61aac5831a193bc66e1183c3ad102739dfd9f56`, Lever's legal center, and Employ's privacy center. Lever says the v0 Postings API is for public job sites, exposes only published jobs, and that published postings may be scraped by third parties. The authenticated Hire API and applicant-creation POST are excluded;
- exact `jobs.lever.co/{site}/{posting-id}` and `jobs.eu.lever.co/{site}/{posting-id}` job URLs are recognized only with a bounded lowercase site token and canonical UUID posting ID. Application paths, custom/lookalike hosts, subdomains, insecure or credentialed URLs, non-default ports, API-key query input, and malformed paths are rejected;
- recognized references create an immutable descriptor for exactly `GET https://api.lever.co/v0/postings/{site}/{posting-id}` or its documented EU `api.eu.lever.co` equivalent, with credentials omitted and JSON requested. No list/global-search query, HTML/iframe mode, API key, `/apply`, POST, body, arbitrary host, or executing fetch client is representable;
- one checked-in connector record allows only those two exact documented API hosts and `documented_public_api` method, requires attribution, uses no credentials, carries a 30-day review deadline and runtime kill switch, and records conservative rate/cache controls because Lever publishes a rate limit for application POSTs but not published-posting GETs. Executing transport controls remain required under `XTR-009`;
- the pure adapter requires the response posting UUID to match the requested UUID and rejects every documented applicant/application payload field plus defensive candidate/question fields atomically. It prefers `descriptionPlain`; styled description and auxiliary salary-description fields remain ignored so each candidate's raw value and pointer identify the same exact evidence. Unknown posting fields do not become evidence;
- title, plaintext description, each declared location, commitment, supported workplace type, each labeled untrusted list-HTML block, an exact identity-matched Lever-hosted apply URL, posting UUID, and valid salary range become separate provisional API candidates. A site slug is routing identity, not a verified company display name, so it is never promoted to `company`; and
- exact recognized raw values, source pointers, extractor version, confidence, attribution/review note, capture source, and capture instant remain attached. Payload/category keys, strings, URLs, locations, lists, list content, candidates, site tokens, and identifiers are bounded before output, and synthetic fixtures contain no production employer or applicant data.

The adapter does not render Lever HTML, confirm fields, normalize salary/work arrangements beyond basic validity, write entities, fetch a URL, cache a response, submit an application, handle credentials, access the authenticated Hire API, or retrieve candidate data. Normalization remains `XTR-007`; executing rate/cache/retry/last-review behavior remains `XTR-009`.

#### USAJOBS

Official API-key search for open federal announcements with documented filters and salary fields: [USAJOBS API reference](https://developer.usajobs.gov/api-reference/). Cache within limits and attribute the source.

#### User files/paste

Always supported. Text/HTML/JSON/CSV are baseline. PDF/DOCX import extracts to a proposal with page/paragraph provenance and requires review.

The shipped `CAP-003` baseline covers manual entry, pasted text/URL, and saved HTML/text/JSON. CSV, PDF, and DOCX ingestion remain unimplemented and must retain the review/provenance requirements above when added.

### Tier B — labor/occupation data

- [BLS Public Data API](https://www.bls.gov/developers/) and OEWS releases for occupational wage distributions by geography.
- [O*NET Web Services](https://services.onetcenter.org/) or downloadable O*NET database for occupation taxonomy, tasks, skills, and technology; honor its current license/attribution.
- [CareerOneStop APIs](https://api.careeronestop.org/api-explorer/) for jobs, occupation, labor-market, and salary endpoints under registered credentials/terms.
- [DOL Foreign Labor Certification disclosure data](https://www.dol.gov/agencies/eta/foreign-labor) as an additional employer/role/location wage observation, explicitly labeled for program population, lag, and limitations.

### Tier C — company/contact research

Permitted inputs:

- official employer careers/job/team/leadership/contact/press pages;
- public filings/datasets with compatible reuse, such as SEC filing data for public-company facts, following the source's access policy;
- user-entered contacts and notes;
- a licensed contact/search provider through its documented API after a separate product/privacy/legal review.

The feature finds possible relevant public roles/people; it does not promise personal contact data. Never synthesize an email naming pattern and label it verified. Never auto-send outreach.

### Explicitly excluded foundations

- LinkedIn states that crawlers, browser plug-ins, and extensions may not scrape or automate its site: [prohibited software and extensions](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions).
- Glassdoor's terms prohibit automated scraping/mining without express written permission: [Terms of Use](https://www.glassdoor.com/about/terms-2022-12-01/).
- Search-result-page scraping, authenticated social/profile scraping, CAPTCHA bypass, rotating proxies, anti-bot evasion, or circumventing access controls.
- Copying entire databases because individual pages are publicly viewable.

The app may let a user manually enter facts learned elsewhere and retain the original URL as a note. It must not provide prohibited automation.

## Connector policy registry

Every network/source connector has a checked-in record:

```yaml
id: greenhouse-job-board
owner: project-owner
status: enabled
allowed_methods: [documented_public_api]
base_domains: [boards-api.greenhouse.io]
terms_url: ...
privacy_url: ...
license_or_reuse_basis: documented public published-job endpoint
reviewed_at: 2026-08-20
rate_policy: conservative-cache-and-backoff
retention: normalized-record-plus-user-configurable-snapshot
attribution: required
kill_switch: true
```

Review on a schedule and when terms/API behavior changes. A connector can be disabled independently without disabling manual capture. Robots.txt and rate limits are operational controls, not proof of legal permission.

`XTR-001` makes the pre-network gate executable without claiming that a real connector has completed review. A strict immutable version-1 record requires an owner, explicit enabled/disabled status, reviewed methods, exact lowercase HTTPS destination hosts, terms/privacy URLs, reuse basis, review and due instants, rate/retention/attribution/credential policy, a user-visible data-flow statement, and kill-switch capability. Unknown or extra fields, duplicate IDs, wildcards, unsafe policy URLs, invalid review windows, and missing kill switches fail closed. Authorization separately validates the acquisition request and injected runtime control, then denies unknown, disabled, targeted/globally killed, not-current, method-mismatched, and destination-mismatched network requests with content-free reasons. Host matching is exact: policy for `api.example` does not permit `sub.api.example`. Manual capture is an explicit non-network request and does not depend on registry contents or runtime kill-switch state. The checked-in production registry remains empty until a later connector checklist item supplies a current reviewed record; tests use synthetic `.example` records only.

`XTR-002` implements the first pure structured-data adapter without adding acquisition behavior. The version-1 Schema.org `JobPosting` parser accepts only bounded JSON values from an already-created capture, recognizes explicit Schema.org contexts (including inherited `@graph` context), and emits validated `FieldCandidateV1` records for title, company, description, salary, physical/applicant locations, remote work, posting/validity dates, requirements, apply URL, identifier, and employment type. Every candidate retains its exact JSON pointer, raw value, bounded source excerpt, capture source/time, extractor identity/version, method, and provisional confidence. Arrays, duplicate/conflicting values, multiple postings, and valid fields from incomplete postings remain separate candidates; unsupported contexts and invalid/missing fields produce content-free structured warnings rather than invented values. Limits on input items, tree depth/value count, candidate count, text/URL length, and injected UUIDv7 IDs fail atomically. The synthetic golden suite covers nested values, arrays, inherited `@graph`, multiple/conflicting postings, malformed/unsupported data, missing/invalid fields, and partial retention; its checked-in report records 43 exact candidates with fixture precision and recall of `1.0`. These are fixture metrics for this extractor version, not a claim about web-wide accuracy; broader calibration remains `XTR-008`.

## Generic page extraction

Reusable functions are capability-based, not “scrape anything”:

```ts
extractStructuredData(document): JsonLdNode[]
extractReadableContent(document): ReadableContent
extractLabeledSections(content): Section[]
normalizeJobCandidates(candidates): ExtractedJobV1
extractPublicContactCandidates(content): ContactCandidate[]
```

Contact extraction requires an allowed official page and returns only source-backed candidates with excerpts. Job and contact pipelines share fetching/sanitization/provenance utilities but have distinct schemas and policy gates.

## Fetch/render rules

- Extension captures the rendered DOM on explicit action; no remote fetch is needed.
- Static/public APIs use ordinary HTTP clients with honest user agent, timeouts, size limits, caching, retry/backoff, and rate policy.
- Playwright is reserved for approved sources that require rendering and cannot be captured interactively. It runs isolated, blocks downloads/unneeded resource classes, limits navigation and redirects, and never receives user browser cookies.
- Prevent SSRF in any local/hosted fetch service: HTTPS/HTTP policy, DNS/IP revalidation, block loopback/private/link-local/metadata ranges, redirect cap and recheck, port allowlist, response size/time limits.
- Sanitize HTML with a maintained sanitizer and render as text/isolated content; never execute captured scripts/events/styles.

## Should Python be used?

### Decision

TypeScript is the primary extraction language because the extension and browser app already live in a DOM-capable TypeScript runtime, and the same schemas/adapters can run in the desktop application. Adding mandatory Python would complicate the downloadable kit, hosted browser mode, packaging, and debugging.

### Add Python when it wins a measured workload

Use the optional `worker-python` for:

- large batch ingestion and dataset reshaping;
- OCR/image preprocessing;
- PDF/DOCX/table extraction that is materially better in Python;
- experimental NLP/entity resolution or statistical salary analysis;
- approved large-scale connector workers in a future hosted deployment.

Candidate stack: `httpx`, `selectolax`, `trafilatura`, `beautifulsoup4` only where needed, `pydantic`, `tenacity`, `polars`, `pdfplumber`, and Python Playwright. Choose the smallest set after fixture benchmarks; do not install all by default.

### Cross-language boundary

- stdin/stdout JSON Lines or a loopback HTTP interface bound only to `127.0.0.1` with a one-time token.
- Contracts generated from JSON Schema and validated at ingress/egress.
- No direct Python writes to the live SQLite database. It returns envelopes/results; the TypeScript application validates and commits them.
- Worker version, extractor version, and model/data version are recorded.
- Failure/cancellation is bounded; worker cannot make arbitrary network requests outside an approved connector job.

## Extractor testing

- Synthetic and lawfully stored fixture pages/payloads; strip PII and secrets.
- Golden expected candidates with provenance and confidence.
- Property tests for money/date/URL/location normalization.
- Mutation tests for misleading JSON-LD, duplicate scripts, huge DOM, hostile HTML, encoding, and missing fields.
- Contract suite shared across TypeScript and optional Python.
- Live smoke tests only for documented APIs and never as the main CI suite.
- Per-field precision/recall and review-correction rate by extractor version; regressions require a deliberate golden update.
