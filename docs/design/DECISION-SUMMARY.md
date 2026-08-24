# Decision summary

Status: proposed for implementation  
Decision date: 2026-08-20

## 1. Central identity and SSO

Build a standalone service at `auth.seangb.com`. Do not place shared authentication inside Mindspace, Portfolio, COMPOSR, or any other product. Each app is an OpenID Connect (OIDC) client and retains its own users, roles, permissions, and domain data.

### Recommended zero-license-cost choice

Use **Better Auth with its official OAuth 2.1 Provider plugin**, PostgreSQL, and a dedicated account UI, subject to the security gate in the identity kit. Better Auth is the best fit when these priorities are combined:

- TypeScript-first development and full control over the account experience;
- permissive MIT licensing;
- one small first-party application family rather than a corporate directory;
- passkeys, 2FA, social sign-in, sessions, admin features, and an OAuth 2.1/OIDC provider;
- willingness to build and maintain account, recovery, operations, and audit UX.

Better Auth is a framework, not a turnkey identity appliance. The team therefore owns more security-sensitive integration and operations work. The service must pass the conformance/security spike before any production app trusts it.

### Free/self-hosted alternatives

| Choice | License / cash cost | Best use here | Main tradeoff | Verdict |
|---|---|---|---|---|
| Better Auth | MIT; no software fee | Custom TypeScript identity service and account center | More code and operational responsibility | **Proposed** after security gate |
| Authentik | Mostly MIT community edition; no software fee | Turnkey IdP, admin UI, proxy/legacy app protection | Heavier runtime and less product-native UI | **Fallback** if Better Auth gate fails |
| Keycloak | Apache-2.0; no software fee | Maximum maturity, protocol breadth, enterprise policies | Highest administration/customization weight | Strong conservative alternative |
| Logto OSS | MPL-2.0; no software fee | Polished product-oriented OIDC/OAuth platform | Another full platform to operate; verify OSS/paid feature boundary | Worth a spike, not first choice |
| ZITADEL | AGPL-3.0 community code; commercial option | Capable modern identity infrastructure | AGPL compliance review and licensing complexity | No longer the default zero-friction choice |
| Hand-written OAuth/OIDC | N/A | Nothing | Unacceptable security and maintenance risk | Rejected |

“Free” means no identity software license fee. It does not eliminate the cost of server resources, a domain, transactional email, backups, monitoring, security maintenance, and incident response. On an existing server, incremental cash cost can be near zero; operational cost cannot.

### Non-negotiable boundaries

- The immutable external identity key is `(issuer, subject)`, never email.
- Each origin gets its own OIDC client and its own application session cookie.
- Do not share a parent-domain authentication cookie across applications.
- Use Authorization Code + PKCE; exact redirect URIs; `state`; OIDC `nonce`; short token lifetimes; refresh rotation; audience and issuer validation.
- Prefer a backend-for-frontend (BFF): the browser receives only an `HttpOnly`, `Secure` app-session cookie, not long-lived OAuth tokens in `localStorage`.
- Portfolio CRM/admin is a separate client with mandatory phishing-resistant MFA, shorter sessions, and step-up authentication.
- Application SSO never authenticates SSH, server root, database root, backup encryption, or infrastructure recovery.

## 2. Job application workspace

Build it as a standalone product named **Coredrill**, with public-identity clearance still required before a landing page or store listing. It is a local-first personal applicant-tracking system, career evidence library, document studio, capture extension, job research tool, and salary assistant. That is a durable product domain, not a COMPOSR tool.

### Runtime shape

- **Hosted web/PWA:** the application is served from a website, but its database is SQLite WebAssembly persisted in browser OPFS. No account is required and job data is not uploaded.
- **Downloadable desktop:** the same React UI runs in a Tauri shell with native SQLite. Users can install a release or run the repository locally.
- **Browser extension:** user-triggered capture using `activeTab`; an encrypted/minimal outbox transfers reviewed captures to the web or desktop app.
- **Future hosted sync:** opt-in, end-to-end encrypted synchronization and hosted AI can be added behind the shared identity service. Local mode remains fully supported.

### Useful, compliant source hierarchy

Prefer sources in this order, recording source, timestamp, license/terms status, and field-level provenance:

1. The job page the user is viewing, captured on explicit user action.
2. `schema.org/JobPosting` JSON-LD embedded in employer or ATS pages.
3. Documented public ATS endpoints such as Greenhouse Job Board API and Lever Postings API.
4. Government/public APIs: USAJOBS; CareerOneStop; BLS OEWS; O*NET; Department of Labor disclosure datasets.
5. Official employer careers, team, leadership, press, and contact pages where access and reuse are permitted.
6. User import, paste, or manual entry.
7. Optional licensed aggregators or enrichment providers, only through their supported APIs and under their terms.

Do not scrape LinkedIn profiles or job pages with the extension, and do not scrape or mine Glassdoor. Do not infer that public visibility, robots.txt permission, or a user's logged-in session grants a product the right to extract and republish data.

### Salary intelligence

Use the listing's disclosed range first. Map the role to an O*NET-SOC occupation, then show BLS OEWS and/or CareerOneStop percentiles by geography. DOL H-1B/LCA disclosure data can be an additional employer/role/location signal, but must be labeled as delayed and visa-population-biased. A “recommended ask” must show its inputs and confidence; it must not imply company-specific knowledge when none exists.

### Should Python be used for scraping?

Not as the core extraction language.

- The extension and hosted browser app already execute TypeScript against the rendered DOM. Keeping capture, schemas, URL recognition, and deterministic adapters in shared TypeScript avoids two implementations.
- Use browser-native DOM APIs, JSON-LD parsers, Mozilla Readability, and source-specific API adapters first. Use Playwright only for approved sources that truly require rendering.
- Add an optional Python worker for batch imports, OCR, PDF/DOCX processing, research datasets, heavier NLP, or experimental parsers. Good candidates include `httpx`, `selectolax`, `trafilatura`, `pydantic`, `tenacity`, `polars`, `pdfplumber`, and Python Playwright.
- All extractors, regardless of language, return the same versioned `CaptureEnvelope`/`ExtractedJob` JSON contract. Python remains replaceable and is not required to run the baseline local kit.

Python is good scraping tooling; it is not legal permission, and it is not automatically better for content already available inside a browser extension.

## Supporting current references

- [Better Auth OAuth 2.1 Provider](https://better-auth.com/docs/plugins/oauth-provider)
- [Better Auth repository and MIT license](https://github.com/better-auth/better-auth)
- [Authentik Docker Compose requirements](https://docs.goauthentik.io/install-config/install/docker-compose/)
- [ZITADEL licensing policy](https://github.com/zitadel/zitadel/blob/main/LICENSING.md)
- [OAuth 2.0 Security Best Current Practice, RFC 9700](https://www.rfc-editor.org/info/rfc9700/)
- [OWASP session-management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [SQLite WebAssembly persistence and OPFS](https://sqlite.org/wasm/doc/tip/persistence.md)
- [Google JobPosting structured-data documentation](https://developers.google.com/search/docs/appearance/structured-data/job-posting)
- [Greenhouse Job Board API](https://developer.greenhouse.io/job-board.html)
- [Lever Postings API](https://github.com/lever/postings-api)
- [USAJOBS API](https://developer.usajobs.gov/api-reference/)
- [CareerOneStop API Explorer](https://api.careeronestop.org/api-explorer/)
- [BLS Public Data API](https://www.bls.gov/developers/)
- [O*NET Web Services](https://services.onetcenter.org/)
- [LinkedIn prohibited software and extensions](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions)
- [Glassdoor Terms of Use](https://www.glassdoor.com/about/terms-2022-12-01/)
