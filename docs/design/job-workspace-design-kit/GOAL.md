# Product goal and execution charter

Status: active design baseline  
Decision authority: [11 — Decision register](11-decision-register.md)  
Progress authority: [Living checklist](LIVING-CHECKLIST.md)  
Short form: [Goal statement](00-goal-statement.md)

## 1. Objective

Design and ship a standalone, local-first job-search workspace that takes a user from discovery through outcome without making an account or a hosted service a prerequisite. The product must unite six currently fragmented jobs-to-be-done:

1. capture and preserve an opportunity before it disappears;
2. decide whether it deserves attention;
3. connect requirements to truthful career evidence;
4. prepare tailored documents and application answers;
5. remember submissions, interviews, contacts, and follow-ups;
6. learn from outcomes without turning the job search into a punitive productivity game.

The app is not an autonomous applicant. It is a private workspace and drafting assistant operated by the job seeker.

## 2. Intended users

### Primary

- A technically comfortable or privacy-conscious individual managing an active search.
- A high-volume applicant who needs faster capture, tailored artifacts, and reliable follow-up.
- A career changer who needs to translate adjacent experience without fabricating direct experience.
- A student, returning worker, contractor, or senior candidate whose evidence does not fit a single standard resume.

### Secondary, after the personal product works

- A career coach and client sharing an explicitly exported snapshot.
- A user with multiple devices who elects encrypted synchronization.
- A user who elects hosted inference instead of configuring a local model or provider key.

### Not a v1 persona

- Recruiters, hiring teams, staffing agencies, or employers managing candidates.
- Organizations monitoring job seekers in real time.
- Operators of bulk-application or unsolicited-outreach systems.

## 3. Desired user outcomes

A user should be able to say:

- “I can see what needs my attention today.”
- “I know where this job came from and which details were inferred.”
- “I can compare this role with my actual experience without a fake black-box score.”
- “The draft sounds like me and every factual claim is supportable.”
- “I know which version I submitted and when to follow up.”
- “I can explain the salary context and its limitations.”
- “I know where my data lives, what left my device, and how to take everything with me.”

## 4. Product boundaries

### Required for the first public release

- Accountless hosted PWA and downloadable desktop application using the same product model.
- Local vault initialization, diagnostics, backup, export, restore, and deletion.
- Manual, paste, file, and user-invoked browser-extension capture.
- Review inbox with field-level source, extraction method, confidence, conflicts, and duplicate suggestions.
- Pipeline board, dense table, saved views, status history, next actions, interviews, and follow-ups.
- Career profile/evidence library populated manually or by reviewed document import.
- Requirement analysis and evidence comparison with transparent categories.
- Resume/cover-letter/application-answer versioning and export.
- Template-only operation plus optional local or bring-your-own-key AI.
- Claim ledger that blocks or flags unsupported factual statements.
- Disclosed compensation normalization and public labor-data context.
- Companies, contacts, notes, and interaction history.
- Local search, accessible responsive UI, offline core workflows, and recovery states.
- Extension permission discipline and compliant source registry.

### Explicitly deferred

- Required identity, billing, teams, employer portals, and shared real-time boards.
- Cross-device sync and hosted AI until the local product and threat model are proven.
- Native mobile binaries; responsive PWA comes first.
- Autonomous crawling, background surveillance of browsing, auto-submit, auto-apply, or auto-send.
- Unapproved LinkedIn or Glassdoor extraction, guessed contact details, or circumvention of access controls.
- Claims that a heuristic is an employer's actual ATS score or hiring probability.
- Model fine-tuning on private user documents.

### Permanent product rules unless deliberately superseded

- User-confirmed data is not silently overwritten.
- Raw captured content is untrusted input, including when passed to a model.
- No application is submitted and no message is sent without an explicit user action outside or inside a separately reviewed sending feature.
- AI-disabled mode remains a tested product path.
- Export and restore cannot become paid-only features.

## 5. Experience strategy

The interface is a calm professional workspace, not an “AI dashboard.” The primary navigation is deliberately small:

1. **Home** — attention and next actions;
2. **Pipeline** — Inbox, Board, Table, and approved Discover views;
3. **Documents** — reusable and job-specific materials;
4. **Career Profile** — verified evidence and reusable answers;
5. **Network** — companies, contacts, and interactions;
6. **Insights** — funnel, timing, source, salary, and evidence gaps.

Settings remain at the bottom of the shell. Applications are represented by jobs moving through the Pipeline instead of being a duplicate top-level area. A job opens as a contextual workspace without losing the board or table state.

Progressive disclosure is essential: a new user can add one job immediately, while advanced filters, analytics, AI providers, custom pipeline stages, and connector policy stay available without front-loading configuration.

## 6. Technical strategy

### Primary implementation languages

- **TypeScript:** domain, application logic, UI, extraction, extension, contracts, tests, and web worker code.
- **SQL:** shared SQLite schema, migrations, indexes, full-text search, and reports.
- **Rust:** thin Tauri desktop boundary for native storage, filesystem, secure secrets, updates, and other privileged operations.
- **Python:** optional later worker only when a measured document/NLP/batch workload clearly outperforms or lacks a safe TypeScript implementation.

### Platform baseline

- React + Vite PWA for hosted and shared frontend code.
- Tauri 2 for downloadable desktop distribution.
- WXT Manifest V3 extension for user-invoked capture.
- Official SQLite WASM in a worker with OPFS for browser mode; native SQLite for desktop.
- Ports/adapters around storage, extraction, AI, labor data, document conversion, and future sync.
- One versioned domain model and migration set across browser and desktop adapters.

The complete selected stack and exceptions are in [10 — Technology stack](10-technology-stack.md).

## 7. Quality attributes and release budgets

| Attribute | Initial target |
|---|---|
| First useful action | A job can be added without account creation or completing a full profile |
| Capture | Median capture-to-reviewed-record under 2 minutes in usability tests |
| Local interaction | Common board, table, and detail actions feel immediate; p95 UI response under 150 ms on reference hardware excluding import/AI |
| Startup | Warm PWA/desktop usable in under 2 seconds on reference hardware; exact budget validated in the storage spike |
| Reliability | No acknowledged capture is lost; outbox transfer is idempotent |
| Recovery | A complete portable archive restores into a clean compatible build with checksums verified |
| Truthfulness | No accepted generated factual claim lacks evidence linkage or explicit user override |
| Accessibility | WCAG 2.2 AA target for shipped flows; keyboard path for all core actions |
| Privacy | Core path produces no network request after assets are installed unless a user invokes a network feature |
| Offline | Tracking, review, search, evidence, and document editing work offline after installation |
| Extraction | Each supported adapter publishes fixture-level field precision/coverage and confidence calibration |

Numbers are design targets, not marketing claims. The baseline device/browser matrix is established in Phase 0 and recorded in the checklist.

## 8. Success measures

### Activation

- percentage of test users who save and review a first job without assistance;
- time to first reviewed job;
- percentage who understand where their vault is stored when asked in plain language;
- percentage who successfully make a first backup.

### Workflow value

- jobs with a recorded next action;
- applications with the exact submitted artifacts retained;
- due follow-ups completed or consciously dismissed;
- captured fields requiring correction by source/adapter;
- time from job capture to an application-ready document set.

### Assistance quality

- unsupported-claim rate before and after the claim inspector;
- accepted, edited, and rejected suggestion rates by feature;
- evidence coverage by requirement category;
- user comprehension of why a match or salary band was shown;
- regression scores on frozen extraction and AI evaluation sets.

### Reliability and trust

- capture-outbox recovery success;
- migration, export, and restore success across supported versions;
- crash/error rate using privacy-safe local diagnostics;
- percentage of network actions with an accurate preflight data-flow explanation;
- security and source-policy incidents.

Metrics are local by default. Product analytics require a later, separate, opt-in telemetry decision. Research builds may export an explicitly reviewed anonymized test report.

## 9. Definition of an initial public beta

The beta gate passes only when all of the following are true:

1. Phase 0 risk spikes prove storage, recovery, browser support, extension transfer, and desktop packaging.
2. A new user completes the canonical journey from add/capture through Applied and follow-up.
3. Browser and native storage adapters pass the same repository contract suite.
4. The AI-disabled journey is complete and documented.
5. AI generations use structured output, claim/evidence inspection, provider disclosure, cancellation, and retry safety.
6. Security, accessibility, migration, backup/restore, and extractor regression gates are green.
7. No prohibited connector is enabled and every network connector has a reviewed policy entry and kill switch.
8. Installation, update, backup, restore, troubleshooting, privacy, and data-deletion documentation is usable by someone other than the developer.
9. The decision register contains no unresolved release-blocking question.
10. The living checklist links the evidence for every gate.

## 10. Decision and change discipline

This is a living design, not a promise never to change. Changes follow this sequence:

1. add the proposed change to the open-question log in the decision register;
2. record the observed problem, evidence, alternatives, and affected requirements;
3. mark the current decision `Superseded` only after the replacement decision is accepted;
4. update this goal if scope or product promises change;
5. update architecture/UI/data/security documents and checklist IDs in the same commit;
6. add or revise tests/evaluations before closing the implementation item.

Decisions are revisited when a listed trigger occurs, not merely because a new library or trend appears.

## 11. Execution command

When starting implementation, Codex should be given one bounded milestone or checklist range, not the entire product as an undifferentiated request. The default instruction is:

> Implement the next unblocked checklist item(s) for the current milestone. Read `AGENTS.md`, `GOAL.md`, `11-decision-register.md`, the relevant numbered design documents, and `LIVING-CHECKLIST.md`. Preserve local-first and AI-disabled paths. Write tests and proof artifacts before marking an item complete. If implementation requires changing an accepted decision, stop and propose an ADR instead of silently diverging.

