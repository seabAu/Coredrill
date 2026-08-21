# 04 — Capture, extraction, sources, and Python

## Capture contract

Every entry path—extension, paste, URL/API connector, file import, or optional Python worker—produces a versioned envelope before modifying domain records.

```ts
type CaptureEnvelopeV1 = {
  specVersion: "1.0";
  id: string;
  capturedAt: string;
  captureMethod: "extension" | "paste" | "file" | "connector" | "manual";
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
  captureClient: { name: string; version: string };
  contentHash: string;
};
```

Limits apply before persistence: maximum text/HTML/payload/attachment sizes, allowed schemes, normalized encoding, and safe truncation markers. Never capture cookies, form inputs, hidden tokens, browser history, authorization headers, or the page's JavaScript state wholesale.

## Extraction result

```ts
type Candidate<T> = {
  value: T;
  method: "api" | "jsonld" | "selector" | "readability" | "heuristic" | "llm" | "user";
  confidence: number;
  sourcePointer?: string;
  sourceExcerpt?: string;
};

type ExtractedJobV1 = {
  title: Candidate<string>[];
  company: Candidate<string>[];
  description: Candidate<string>[];
  salary: Candidate<MoneyRange>[];
  locations: Candidate<ExtractedLocation>[];
  workplaceType: Candidate<WorkplaceType>[];
  postedAt: Candidate<string>[];
  validThrough: Candidate<string>[];
  requirements: Candidate<ExtractedRequirement>[];
  applyUrl: Candidate<string>[];
};
```

Resolution policy ranks user > official API/valid JSON-LD > source-specific selector > generic DOM > heuristic > LLM, while still detecting internal conflicts. Confidence is calibrated per field/extractor using fixtures; it is not a decorative number.

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

#### Schema.org `JobPosting`

Parse JSON-LD from a single job detail page. Validate `@context`, `@type`, title, description, hiring organization, location/remote fields, date, validity, identifier, employment type, and base salary. Treat it as untrusted page input and compare to visible content. Google documents the format and requires the structured data to represent the visible job page: [JobPosting documentation](https://developers.google.com/search/docs/appearance/structured-data/job-posting).

#### Greenhouse Job Board API

Greenhouse documents unauthenticated GET access to published board/job JSON. Implement recognized board-token URLs and retrieve through the desktop/hosted connector layer when policy permits: [Greenhouse Job Board API](https://developer.greenhouse.io/job-board.html). Do not submit applications via the API in v1.

#### Lever Postings API

Lever documents public published postings, fields including description, locations, workplace type, apply URL, and optional salary: [Lever Postings API](https://github.com/lever/postings-api). Respect its instance/board model and current terms; do not turn one company's endpoint into an undocumented global search service.

#### USAJOBS

Official API-key search for open federal announcements with documented filters and salary fields: [USAJOBS API reference](https://developer.usajobs.gov/api-reference/). Cache within limits and attribute the source.

#### User files/paste

Always supported. Text/HTML/JSON/CSV are baseline. PDF/DOCX import extracts to a proposal with page/paragraph provenance and requires review.

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

