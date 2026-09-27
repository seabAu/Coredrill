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

`REV-001` turns the existing durable preview into the first complete Inbox
queue route. Home's Review captures action opens the Pipeline directly in the
Inbox view and records `/pipeline?view=inbox` history. The queue displays its
total and selected position, uses one roving tab stop, and supports wrapping
Arrow Up/Down plus Home/End selection. Each queue control names the exact
review article it controls, and selection replaces only the local inert review
panel; it does not fetch, accept, merge, or write a job.

`REV-002` adds the read-only field review model. Every retained candidate stays
visible under Role & company, Location & work mode, Compensation, Description,
Requirements, Source & dates, or the lossless Additional details fallback. A
candidate displays its exact proposed value, extraction method, numeric
confidence, source excerpt and path, confirmation state, and textual conflict
state. Differing canonical values for the same field are labeled as an
unresolved conflict; an incoming capture cannot promote its own embedded
confirmation claim. Source buttons retain exact inert-snapshot focus routing,
and this slice adds no acceptance or persistence action.

`REV-003` adds the pure rule behind the user-invoked Accept high-confidence
action. Version 1 uses the existing highest calibration bin boundary of `0.95`
as an inclusive cutoff. It accepts only allowlisted job fields whose selected
candidate is non-conflicting and has a known top-level value. Unsupported field
names, null/blank/empty values, lower confidence, and every unresolved conflict
remain explicitly queued for review. Existing user confirmations are preserved;
the rule returns an immutable plan and never writes, saves, or silently resolves
anything.

`REV-004` composes that rule into explicit local actions. Accept high-confidence
selects eligible candidates in the review UI but creates no durable trust until
the user chooses Save or Merge. Save requires an accepted title and creates the
job, optional company, source, immutable snapshot, provenance, retained field
candidates, confirmations, and resolved queue state in one transaction. Merge
adds the captured source and evidence to the selected existing job without
overwriting its canonical fields. Snooze records a fixed one-week return time;
Return to inbox restores pending state. Discard requires confirmation and
creates a durable, single-use undo token that restores the exact prior pending
or snoozed state. Remaining conflicts and unknown fields stay visible but do not
block a save when the required title is explicitly accepted.

`REV-005` adds an explainable source-condition layer without contacting the
source. A strict local projection labels retained evidence available, expired,
changed, blocked, or unsupported from a retained validity candidate, checked-in
exact-host policy, and stored source-identity/content-hash suggestions. Blocked
sources cannot be promoted; every other warning remains reviewable. Expired,
changed, blocked, and unsupported states preserve the original receipt,
candidates, paths, and provenance, say that no automatic refresh occurred, and
offer a manual or paste fallback through the existing Add dialog. A changed
source never overwrites a confirmed field, and an unsupported URL is never
fetched merely to make the preview complete.

`REV-006` compares two explicit immutable listing snapshots without performing
the refresh that produced either one. The Source tab shows capture times and
itemized added, removed, and changed requirements; before/after compensation
and deadline; added/removed locations; and whether retained content changed.
Stable requirement keys avoid guessing equivalence from prose, while content
uses existing hashes rather than duplicating source text. The comparison is
read-only evidence: it cannot confirm, replace, or overwrite any current job
field, and the interface repeats that boundary beside the diff.

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

`EVD-003` supplies manual, local-only editors for basics/preferences, employment, education, projects, skills, accomplishments, certifications, publications, and volunteer work. Required text, bounded lists and URLs, real optional `YYYY-MM-DD` dates, non-inverted ranges, and current-role/end-date consistency are validated before persistence. Saved evidence-backed records carry no invented source and are explicitly user-confirmed. The section tablist supports arrow, Home, and End navigation; errors remain attached to their fields; and the workspace names resume import, stories/evidence linking, Answer Library work, and AI assistance as later reviewed slices.

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

`BKP-006` implements the deletion row as a separated destructive control. Its
accessible dialog names the current vault, inventories database/unshared
attachment/managed-backup/vault-secret scope, explains that only an external
portable archive can recover the vault, and requires the exact case- and
whitespace-sensitive phrase `DELETE <vault name>`. Export remains available
without submitting deletion. Clean deletion, restored-on-failure, and
desktop-cleanup-pending states make different claims; no countdown, network
request, or opaque recovery promise is used. See [vault deletion version
1](vault-deletion-v1.md).

## Browser extension UX

The action popup is intentionally small:

1. “Capture this job” uses temporary `activeTab` access.
2. Preview title, company, salary, and detected source.
3. Let the user correct/select page text or add a note.
4. Save to the extension outbox and transfer to a paired open app.
5. Show queued/received/needs-review state and a button to open Inbox.

No automatic capture on navigation. Incognito capture is off by default and never persisted unless the user explicitly enables and confirms it.

`PEX-001` implements the six-state production-extension presentation as a
strict version-1 catalog: not recognized, recognized, needs input, queued,
transferred, and permission needed. Each state names what is and is not
available, what remains local, and the bounded next actions required by the
interface contract. Recognition requires a validated job-posting signal plus
title and company; incomplete recognized evidence remains needs-input, and a
generic page is never relabeled as recognized merely because it has a heading.
Permission copy names temporary `activeTab` plus current-page scripting and
the manual fallback without requesting site-wide access. The live panel uses
the catalog for current preview, queue, and permission facts; the existing
acknowledgement boundary can select the rendered transferred state when the
later transfer slice supplies that fact. No Apply label, navigation capture,
host-permission expansion, trusted-field promotion, or background page read is
introduced.

`PEX-002` adds the reviewable preview without changing the shipped capture
envelope version. A strict version-1 extension draft binds the validated page
snapshot to its capture instant and bounded optional title/company corrections
and local note. The production side panel shows title, company, location,
salary, detected source hostname/signal, minimum detected-field confidence,
and capture-time freshness with an explicit warning that capture time does not
prove the listing is current. A user can select different page text and invoke
recapture, edit title/company, and add a bounded note before the existing
explicit queue action. The envelope retains original detected candidates and
adds edits and the note as separate provisional `user` candidates with no
`userConfirmation`; it never overwrites extracted evidence. The preview reads
only the retained snapshot, performs no source fetch, and adds no permission,
navigation observation, trust promotion, or automatic submission behavior.

`PEX-003` makes the queued state durable and recoverable without turning the
extension into a second vault. Versioned retry metadata stores the last
attempt, next eligible attempt, and stable pending-error fact beside each
checksummed item. Pulls use deterministic exponential backoff from five
seconds to five minutes and stop after ten automatic attempts, while another
eligible item can continue instead of being blocked. The panel shows the
earliest expiry, next retry, a 24-hour expiry warning, exhausted-retry recovery
copy, and the existing checksummed export. Exact acknowledgement removes the
item and its retry record; storage rejection leaves the previously durable
state unchanged, and expiry pruning is reported rather than presented as an
acknowledgement.

`PEX-004` requires a strict compatibility handshake before the web app sends
any Chromium pull. The app declares its exact HTTPS origin, intended extension
ID, supported transfer and capture versions, and required reviewed
capabilities; the extension compares those identities with the authenticated
message sender and its own runtime ID, then echoes the negotiated result. Any
identity, version, capability, correlation, or exact-shape mismatch stops the
journey before SQLite or outbox mutation. This preflight adds no permission,
content script, background observation, or source fetch, and the Firefox
checksummed manual path remains available.

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

`CAP-003` implements the first accountless supplied-content routes from the shared Add surface: a manual form, pasted listing text, a pasted HTTP(S) URL, and saved HTML, text, or JSON. A pasted URL is recorded as evidence and is never fetched. Saved HTML is parsed in a detached document, executable/embedded elements are removed, and only inert readable text enters the envelope; text and JSON inputs have explicit size or complexity bounds. Each successful route creates a validated `CaptureEnvelopeV1` and a durable inbox receipt, while invalid input remains in the form for correction. PDF import remains later checklist work.

`CAP-004` adds the durable Inbox preview over those receipts. Stored envelope JSON is revalidated and hash-checked before selected text, readable text, retained HTML, or structured JSON can become inert preview strings. The queue exposes exact snapshot paths and separate field-candidate excerpts; activating either moves focus to the source region and highlights retained matching text. Markup-shaped values remain text, no preview fetches a source, and the review surface reflows without page overflow at the narrow checkpoint.

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
