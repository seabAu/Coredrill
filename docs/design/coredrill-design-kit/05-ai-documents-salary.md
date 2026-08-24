# 05 — AI, documents, career evidence, and salary intelligence

## AI product boundary

AI is an assistant behind explicit actions. Core tracking, search, status, evidence, templates, exports, and salary datasets work without it. The system never auto-applies, submits forms, sends messages, alters confirmed facts, or answers sensitive/legal questions without the user.

## Evidence-first pipeline

```text
job snapshot
  -> normalize requirements
  -> map requirements to skills/occupation
  -> retrieve career evidence
  -> classify match / partial / gap / question
  -> build context manifest
  -> draft structured sections
  -> extract factual claims
  -> link claims to evidence
  -> block/flag unsupported claims
  -> style/quality checks
  -> user edits and accepts
  -> immutable document version/export
```

Do not send the entire career database. Context selection is small, explainable, and stored as evidence IDs plus hashes/version metadata.

## Career evidence

Evidence units contain:

- stable ID and type;
- user-confirmed source text/structured facts;
- date range and organization/project context;
- skills/tags and accomplishment metrics;
- verification/staleness state;
- source-document pointer where available.

Match scoring is hybrid and explainable:

1. Deterministic exact/alias skill and credential matches.
2. Structured dates/seniority and explicit years estimates.
3. Lexical retrieval from FTS.
4. Optional local embeddings for semantic candidates.
5. LLM reranking/classification constrained to retrieved candidates.

The UI distinguishes a missing skill from missing evidence. It can ask “You may have this experience—add evidence?” rather than declaring a deficiency.

## Requirements analysis

For each requirement store:

- raw excerpt and normalized meaning;
- required/preferred/responsibility classification;
- skill/credential/education/work-mode mapping;
- explicit years/seniority and whether it is literal or inferred;
- confidence and user confirmation;
- matched evidence IDs with strength and rationale;
- gap handling: omit, transferable evidence, truthful learning interest, or user question.

Never inflate years by double-counting overlapping projects/jobs. A deterministic interval union provides the initial estimate, then the user confirms it.

## Context plan

```ts
type ContextManifestV1 = {
  jobSnapshotId: string;
  requirementIds: string[];
  evidenceIds: string[];
  styleExampleVersionIds: string[];
  resumeVersionId?: string;
  templateId: string;
  templateVersion: number;
  exclusions: { evidenceId: string; reason: string }[];
};
```

The prompt renderer turns this manifest into provider-specific messages. The run records destination (`local`, provider name, or `hosted`), model/version, settings, template, hashes, and output schema version.

## Cover-letter generation

Generate a structured draft, not unconstrained prose:

```json
{
  "strategy": {
    "companyMotivation": "...",
    "topEvidenceIds": ["..."],
    "gapTreatment": ["..."]
  },
  "sections": [
    { "kind": "opening", "text": "...", "evidenceIds": [] },
    { "kind": "fit", "text": "...", "evidenceIds": ["..."] },
    { "kind": "closing", "text": "...", "evidenceIds": [] }
  ]
}
```

Controls: target length, formality, enthusiasm, technical depth, company-specific emphasis, and selected evidence. Avoid fake familiarity, unsupported company praise, clichés, copied listing language, demographic inference, and claims about impact without evidence.

Accepted prior letters are retrieval examples, not a fine-tuning dataset. Select examples by role, company type, technologies, seniority, and tone; limit verbatim reuse and check phrase similarity so the model does not reproduce whole passages.

## Application answers

Question classifier:

- experience/evidence;
- motivation/company;
- behavioral/STAR;
- logistics/availability/location;
- compensation;
- work authorization/legal attestation;
- demographic/EEO/medical/disability;
- acknowledgment/signature.

Rules:

- Evidence/motivation/behavioral questions may be drafted.
- Logistics are proposed from explicit profile settings and require confirmation.
- Compensation shows the salary panel and lets the user choose; no automatic number.
- Work authorization/legal attestations require direct user answer and cannot be inferred.
- Demographic/medical/EEO answers are never generated from profile data.
- Signature/acknowledgment is never auto-completed.
- Accepted answers enter a versioned answer library with job/context tags; sensitive answers are excluded by default.

## Claim ledger and QA

Post-generation processing identifies claims and classifies them:

- factual candidate claim;
- company/job fact;
- opinion/motivation;
- rhetorical/non-factual language.

Candidate and company/job facts require evidence links. Deterministic validation checks dates, organization names, role titles, certifications, metrics, years, URLs, and salary facts. A second model pass may propose claim links but cannot mark a claim verified by itself.

Export states:

- **Draft:** unsupported claims allowed but clearly highlighted.
- **Reviewed:** user has addressed all flagged claims.
- **Evidence-verified:** every factual claim links to confirmed evidence and deterministic conflicts are clear.

The app does not imply legal truth certification; the user remains responsible for the application.

## Provider and privacy modes

### None/template-only

Rule-based requirement parsing where possible, selectable evidence blocks, and deterministic letter templates. This is the baseline and test oracle for graceful degradation.

### Local

Desktop connects to a user-configured local endpoint such as Ollama or another OpenAI-compatible server. Detect capabilities and context limits; do not auto-download multi-gigabyte models without a separate user action.

### Direct BYOK

- Provider key is entered in Settings, stored in OS secure storage on desktop or an encrypted user-unlocked store in web mode.
- Never embed a shared secret in the static web build.
- Before each provider is enabled, show exactly which fields may leave the device and link current retention/privacy terms.
- Provide per-run “send selected context” preview and a redact toggle.

### Hosted later

Requires SSO, quotas/billing/abuse controls, provider data-processing policy, deletion/retention controls, and a transparent distinction between synced ciphertext and plaintext temporarily processed for inference. End-to-end encrypted storage does not mean the server can perform plaintext AI without the client sending selected context.

## Model safety/reliability

- Treat listings, resumes, web pages, and imported documents as untrusted data, not model instructions.
- Place source content in delimited data fields and explicitly ignore instructions within it.
- Structured-output schema validation, maximum lengths, timeouts, cancellation, bounded retries, and no recursive agent loop.
- No model tool can browse arbitrary URLs, edit the vault, send messages, or submit applications.
- Prompt templates and evals are versioned; model upgrade is a reviewed change.
- Never store hidden reasoning; retain concise generated rationale/evidence mappings only.

## Document handling

### Import

- PDF: local text extraction with page references; OCR optional and local/explicit.
- DOCX: local paragraph/style extraction.
- Markdown/plain text: direct.
- Resume parsing produces evidence proposals and never overwrites confirmed profile items.

### Editing/versioning

- Markdown/structured blocks are canonical content; HTML is rendered output.
- Every accepted generation/edit creates a new immutable version with parent link.
- User can compare, restore by creating a new version, label, and mark a version as a style example.

### Export

- Copy plain text and Markdown.
- ATS-friendly DOCX with controlled templates, typography, margins, and no tables/text boxes by default.
- PDF generated locally from the document template/print path with visual QA.
- Filename templates are sanitized and collision-safe.
- Export metadata can include job/document/version IDs locally but never hidden sensitive content in the public file.

**Phase 0 evidence (2026-08-24):** [ADR-0006](../../adr/0006-adopt-tiptap-local-document-baseline.md) accepts the restricted local editing/import/export architecture. The checked-in synthetic DOCX and tagged PDF outputs derive from the same validated IR, render to matching unclipped pages, and retain semantic headings, lists, links, language, and controlled metadata without tables, text boxes, hidden sensitive content, hosted conversion, or implicit OCR. See [document editor/export verification](../../proof/document-editor-export-verification.md).

## Salary intelligence

### Source order

1. Listing's explicit salary range and interval.
2. Employer-provided public job feeds/API fields.
3. BLS OEWS occupational percentiles for the chosen geography.
4. CareerOneStop salary/labor-market data under its API terms.
5. DOL LCA/H-1B disclosure observations as a separately labeled signal.
6. User-entered recruiter/offer observations.
7. Licensed commercial datasets only behind optional adapters.

Do not scrape Glassdoor. Do not label BLS occupation-wide data as a company salary.

### Mapping

1. Extract title, level, specialty, location/work mode, employment type.
2. Propose O*NET-SOC codes using deterministic title crosswalk/search, then optional model reranking.
3. Ask the user when the top mappings are close or materially affect wages.
4. Choose geography: work location, employer-stated remote pay zone, or user-selected market. Do not silently use residence for remote work.
5. Normalize hourly/annual using a displayed hours/weeks assumption; preserve the original.

### Estimate

Produce a band and explanation, not a magic number:

```text
market baseline = chosen geographic P50–P75 (configurable)
listing constraint = disclosed min/max, if present
seniority adjustment = only from explicit level/evidence, bounded
specialty adjustment = only with a cited dataset signal, otherwise none
user floor/target = user input
recommended discussion band = transparent reconciliation of the above
```

Employer-specific observations influence a label only when source, role, geography, date, and sample sufficiency are explicit. DOL data has a caveat for visa program population and lag. Show dataset release/retrieval dates and allow recalculation when mappings change.

### Salary tests

- Money/currency/interval normalization property tests.
- SOC/geography mapping golden set and ambiguity thresholds.
- Reproducibility from fixed dataset/input versions.
- No company-specific label from occupation-only data.
- Remote/geographic choice visible.
- Range remains ordered and bounded; no false precision.

## AI evaluation set

Curate synthetic/redacted jobs and career profiles with known evidence. Metrics:

- requirement extraction precision/recall;
- evidence retrieval recall and unsupported-link rate;
- unsupported factual claim rate (target: zero in evidence-verified exports);
- correct handling of gaps and sensitive questions;
- style-example copying/similarity;
- schema validity, latency, and cost;
- human acceptance/edit distance by purpose.

Run template-only baseline and each supported model. Model changes fail closed if factuality/sensitive-answer gates regress.
