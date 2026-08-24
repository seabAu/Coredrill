# 01 — Product, UI, and user journeys

## Primary navigation

Desktop/tablet sidebar; bottom navigation or compact menu on mobile:

1. **Home** — next actions, interviews, follow-ups, stale applications, recent captures, and vault risks.
2. **Pipeline** — Inbox, Board, Table, and approved Discover views over one opportunity/application record set.
3. **Documents** — resumes, cover letters, answer library, versions, exports, and submitted snapshots.
4. **Career Profile** — structured employment, education, skills, projects, certifications, stories, preferences, and verified evidence.
5. **Network** — companies, contacts, provenance, interactions, and follow-up notes.
6. **Insights** — funnel, response timing, source outcomes, salary ranges, and evidence gaps.

**Settings** sits at the bottom of the shell with the vault/status control. Inbox has a badge on Pipeline rather than occupying a seventh primary destination. A job and its application are one opportunity progressing through the Pipeline; Application is a state/context, not a duplicate top-level record.

Global command palette: add job, paste listing, capture URL, new interaction, generate draft, create follow-up, search any entity, export/backup. Global search uses local data only.

## Core screens

### Onboarding

Offer two skippable tracks:

- **Quick start:** explain local storage, create a vault with safe defaults, and add/paste/capture one job immediately. Ask for career-profile import only when the user first compares or drafts.
- **Guided setup:** choose browser/desktop scope, name/optionally protect the vault, configure backup, import career documents and an existing tracker, review evidence proposals, choose AI mode, and pair the extension.

Both tracks converge on Home. Sample data uses a disposable demo vault and is never mixed into user data. No AI or account is required.

### Home dashboard

- Timeline of upcoming interviews, deadlines, and scheduled follow-ups.
- “Needs attention” cards: incomplete capture, unsupported draft claims, missing salary, stale status, failed connector.
- Funnel snapshot and weekly application target if the user enables goals.
- Quick capture/paste/add buttons.
- No manipulative streaks; metrics are optional and job search stress is respected.

### Pipeline: Inbox/review

Two-pane layout: capture queue left, review form/source preview right.

- Field groups: role/company, location/work mode, compensation, description, requirements, source/date.
- Each field shows extraction method, confidence, source excerpt, and conflicts.
- Actions: accept all high confidence, edit, merge into existing job, save as new, discard.
- Duplicate matches based on canonical URL, source ID, content hash, and fuzzy company/title are suggestions, never silent merges.
- Raw source is shown safely as text/sanitized snapshot, never live executable HTML.

### Pipeline: Board and Table

Views:

- Dense configurable table with pinned columns and bulk tagging/status changes.
- Kanban by current status.
- Company groups.
- Saved filter views.

Baseline columns: title, company, status, location/work mode, disclosed salary, market band, match summary, source, captured/applied dates, next action, last interaction, tags.

Filter builder supports nested `AND`, `OR`, and `NOT` groups over title, company, status, tags, skills, salary, dates, source, location radius, remote/hybrid/on-site, and match confidence. Advanced filters compile from a validated AST; users never enter SQL.

### Job detail workspace

Header: title, company, current status, source link, capture freshness, actions.

Tabs/panels:

- **Overview:** normalized details, notes, next action, application deadline.
- **Requirements:** required/desired items, years/seniority, confidence, and evidence matches.
- **Match:** strengths, partials, gaps, transferable evidence, questions for the user.
- **Documents:** selected resume, cover letter, answers, generation status, exports.
- **Timeline:** viewed, saved, applied, emails/calls, interviews, follow-ups, offer/rejection/withdrawal.
- **Company:** other saved/open jobs, contacts, notes, salary observations.
- **Source:** snapshots, extraction provenance, change comparison, refresh controls.

### Application editor

Three-column desktop studio:

- Left: job requirements and selected career evidence.
- Center: structured draft/editor with sections and version history.
- Right: claim/evidence inspector, tone/template controls, generation trace summary.

Each generated sentence is either linked to evidence, labeled non-factual/style-only, or flagged. Actions include accept, edit, reject, pin phrasing, save as style example, and export. The editor never silently regenerates user edits.

### Career Profile

- Structured timeline for employment and education.
- Skills list with proficiency/years as user estimates plus linked evidence.
- Projects, accomplishments, certifications, publications, volunteer work, and anecdotes in situation/action/result form.
- Evidence verification states: imported, user-confirmed, source-backed, stale.
- Resume import is a proposal queue; users resolve dates, duplicate roles, and ambiguous skills.

### Network: Companies & Contacts

- Company overview, official domains, saved jobs, interactions, outcomes, notes, sources.
- Contacts with name, role, public source URL, confidence, user notes, and contact method only when explicitly public/user-entered/licensed.
- Never guess an email address and present it as fact.
- No automated message sending in v1. A future draft action is separate from user-controlled sending.

### Salary intelligence

- Disclosed job range, normalized annual/hourly values, currency, and interval.
- Public market percentiles by mapped occupation and geography, source release date, and sample/granularity notes.
- Any employer-specific observations displayed separately with source and caveats.
- User floor/target and an explainable recommended negotiation band.
- Confidence badge and “why this range” breakdown; never a false single precise number.

### Settings: Data & privacy

- Active vault type and exact path/origin explanation.
- Export SQLite/portable archive; import/restore with dry-run summary.
- Automatic backup configuration in desktop mode and browser export reminders.
- Delete local vault with typed confirmation and recoverability warning.
- AI provider data-flow cards, saved-key location, retention links, and per-run confirmation option.
- Connector registry with status, permissions, terms-review date, last use, and kill switch.

## Browser extension UX

The action popup is intentionally small:

1. “Capture this job” uses temporary `activeTab` access.
2. Preview title, company, salary, and detected source.
3. Let the user correct/select page text or add a note.
4. Save to the extension outbox and transfer to a paired open app.
5. Show queued/received/needs-review state and a button to open Inbox.

No automatic capture on navigation. Incognito capture is off by default and never persisted unless the user explicitly enables and confirms it.

## Mobile/PWA experience

The hosted PWA is responsive and can act as a mobile-local vault, but it is a different device vault until sync exists. The bottom navigation is Home, Pipeline, Add, Documents, and More. Mobile supports:

- share-target URL/text import where the platform permits;
- quick status, notes, contact, follow-up, and interview updates;
- reviewing/generating short answers;
- Home, Pipeline/Inbox, job detail, and document viewing.

Do not imply that installing the PWA on a phone exposes the desktop/browser vault. Native mobile is deferred until sync and secure mobile key storage are designed.

## Primary user journeys

### Capture and apply

1. User invokes extension on a job page.
2. Deterministic extractor creates a capture envelope and preview.
3. User confirms; outbox transfers to Coredrill.
4. Inbox normalizes, identifies a possible duplicate, and shows provenance/conflicts.
5. User saves the job, reviews requirements/match, chooses evidence and resume.
6. AI or deterministic template drafts a letter/answers.
7. Claim inspector blocks/flags unsupported facts; user edits and accepts.
8. User exports/copies documents and submits outside the app.
9. User marks Applied; app proposes a follow-up date and retains timeline/document snapshots.

### Paste without extension

Paste URL/text or import a saved HTML/PDF. The same capture contract and review queue run, with limitations shown when the source cannot be refreshed.

### Research salary

Normalize title/location → map to O*NET-SOC → fetch/cache allowed labor datasets → compare disclosed range to percentiles → apply user target and transparent heuristics → show band/confidence/citations. User can override the occupation/geography mapping.

### Import historical applications

Map CSV columns in a preview, validate dates/statuses, show duplicate/conflict plan, commit transactionally, and produce an import report. Original import file hash and mapping are retained; file content retention is user-controlled.

### Recover/transfer data

Export a versioned portable archive containing SQLite data, attachments, manifest, checksums, and schema version. Restore validates checksums, previews migrations and conflicts, then writes transactionally. An ordinary JSON/CSV export exists for portability.

## Required empty/error states

- Storage unavailable, quota exceeded, private browsing, or OPFS unsupported.
- Second browser tab cannot obtain database lock.
- Extension installed but app not paired/open.
- Source terms disabled/connector killed.
- Job page changed, expired, blocks capture, or contains conflicting structured data.
- AI unavailable, key rejected, context too large, output schema invalid, or provider rate-limited.
- Unsupported claim detected.
- Backup stale, import version newer, migration failure, or attachment missing.
- Salary mapping ambiguous or data too coarse/stale.

Every error preserves user work, explains what remains local, and offers export/manual fallback. See [09 — Interface system](09-interface-system.md) for shell dimensions, visual language, responsive layout, keyboard commands, accessibility, and full component states.
