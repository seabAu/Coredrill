# Local-first Coredrill design kit

Status: implementation-ready living design; Phase 0 decisions remain subject to named compatibility/usability gates  
Selected identity: Coredrill (complete public-identity clearance before public launch)  
Primary modes: hosted local-first web/PWA, downloadable desktop, browser extension  
Future mode: opt-in encrypted sync and hosted AI

Start with the [one-page goal statement](00-goal-statement.md), then use [GOAL.md](GOAL.md) for scope and success criteria. During implementation, [LIVING-CHECKLIST.md](LIVING-CHECKLIST.md) is the only progress ledger and [11 — Decision register](11-decision-register.md) is the authority for accepted versus provisional choices.

## Product thesis

Coredrill turns scattered job pages, career history, application documents, contacts, interviews, and salary research into a private, evidence-backed workflow. It helps a user produce better applications without inventing qualifications, auto-submitting forms, or silently exporting career data.

It is a standalone product because it owns durable state and repeated workflows. COMPOSR remains a utility collection. The two may share a versioned prompt-template and model-adapter package; neither product depends on the other's running application.

## Modes

| Mode | Distribution | Data location | Account | AI options |
|---|---|---|---|---|
| Hosted web/PWA | Static web application | SQLite WASM in that browser origin's OPFS | None | Local browser model where feasible; explicit BYOK/direct provider; hosted later |
| Desktop | Signed Tauri installer or repository clone | Native SQLite on device | None | Local Ollama/compatible endpoint; BYOK; hosted later |
| Extension | Browser store/sideload | Small capture outbox only | None | No autonomous generation |
| Hosted sync (later) | Optional service | Encrypted sync payloads plus minimal routing metadata | Shared SSO | Optional metered hosted inference |

Local-first does not mean “automatically encrypted” or “available on every device.” The product tells users exactly where the active vault lives, offers export/backup, and treats cross-device sync as a separate opt-in capability.

## Principles

1. A useful release requires no account, cloud database, AI subscription, or scraping service.
2. The user confirms captured fields before they become trusted records.
3. Every extracted fact retains source, capture time, method, and confidence.
4. Deterministic extraction outranks heuristics; heuristics outrank LLM extraction.
5. User-confirmed values are never silently overwritten by a later scrape.
6. Generated claims must cite career evidence internally; unsupported claims are blocked or visibly flagged.
7. The app drafts but does not auto-submit applications, send messages, or answer sensitive questions without review.
8. Source connectors must pass a terms/license/privacy review and have a kill switch.
9. The extension requests `activeTab`, not blanket history/site access, unless a source-specific optional permission is justified.
10. Storage, extraction, AI, salary, and sync are ports with replaceable adapters.

## Document map

- [00 — Goal statement](00-goal-statement.md)
- [GOAL — Product goal and execution charter](GOAL.md)
- [01 — Product, UI, and user journeys](01-product-ui-and-journeys.md)
- [02 — Runtime architecture and code organization](02-runtime-architecture.md)
- [03 — Data model, search, and migrations](03-data-model.md)
- [04 — Capture, extraction, sources, and Python](04-capture-extraction-sources.md)
- [05 — AI, documents, career evidence, and salary intelligence](05-ai-documents-salary.md)
- [06 — Security, privacy, sync, deployment, and testing](06-security-sync-deployment-testing.md)
- [07 — Phased implementation and Codex execution guide](07-delivery-plan-codex.md)
- [08 — Competitive products and reusable UX patterns](08-competitive-patterns.md)
- [09 — Interface, layout, and interaction system](09-interface-system.md)
- [10 — Technology stack and engineering baseline](10-technology-stack.md)
- [11 — Decision register](11-decision-register.md)
- [Portable human-readable data export version 1](portable-data-export-v1.md)
- [Living implementation checklist](LIVING-CHECKLIST.md)

## First-release scope

- Local vault creation, onboarding, backup/export reminder.
- Career evidence and document import/editing.
- User-triggered job capture plus paste/manual import.
- Inbox/review, jobs table, job detail, pipeline/status history, interviews/follow-ups.
- Requirements extraction with provenance and manual correction.
- Explainable match view.
- Cover-letter and application-answer drafting with evidence checks.
- Salary view based on disclosed range and public labor data.
- Search/filter/saved views.
- Desktop and hosted browser builds from shared UI/domain code.

The primary application navigation is Home, Pipeline, Documents, Career Profile, Network, and Insights. Inbox, Board, Table, and approved Discover are Pipeline views; a job/application is one opportunity moving through a semantic pipeline, not two duplicate top-level records.

## Deferred

- Cross-device sync, team/shared workspaces, billing, hosted AI, native mobile app.
- General web crawling, autonomous discovery, auto-apply, auto-contact, or email sending.
- LinkedIn/Glassdoor scraping.
- Company-specific salary recommendation without sufficiently specific lawful data.
- Fine-tuning models on user documents; retrieval and examples come first.

## Success measures

- Capture-to-reviewed-record median under two minutes.
- No generated factual claim lacks an evidence link or explicit user approval.
- A new local install can export and restore a complete vault without a hosted service.
- Extractor fixtures expose field accuracy/confidence by connector and do not regress silently.
- Users can identify where data and AI processing occurred for every generation run.
- The app works offline for core tracking, evidence, search, and document editing after installation.
