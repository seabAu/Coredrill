# Phase 2 job-candidate normalization verification

Date: 2026-09-03

Branch: `main`

Implementation commit: `230e771a60609e6e14ceb0867a107fdd1188002c`

## Outcome

`XTR-007` is implemented and verified. Coredrill now has a versioned, deterministic,
dependency-free normalization contract for job title, company, physical and remote
location, workplace type, salary, currency, date, and source identity. Normalized
derivatives remain separate from the complete source candidate and cannot erase or
silently overwrite raw values, excerpts, evidence pointers, provenance, confidence,
or user-confirmation evidence.

This slice does not confirm candidates, write canonical entities, mutate application
state, perform network work, run AI inference, guess unsupported locale semantics, or
turn normalization into an opaque hiring or ATS score.

## Versioned contract and bounded runtime

`JobNormalizationV1` and its generated JSON Schema define a strict version-1 boundary.
The pure `normalizeJobCandidatesV1` implementation validates every candidate against
`FieldCandidateV1`, rejects unknown top-level or source keys, duplicate candidate IDs,
cycles, invalid JSON values, and inputs beyond explicit byte, depth, value-count,
candidate-count, text, URL, and material-query-parameter limits. Its validated output
is recursively frozen.

Each candidate result retains the original `FieldCandidateV1` as `sourceCandidate` and
adds only a typed derivative, status (`normalized`, `partial`, `ambiguous`, or
`not_applicable`), and stable warning codes. The source result likewise retains its
raw URL, source kind, external ID, and material-query allowlist. Failures expose only a
content-free stable error and never reflect source text or credentials.

The implementation is intentionally inside `@coredrill/extractors`: it imports only
the validated contract package and has no database, store, browser, native, transport,
AI, or hosted-service dependency.

## Deterministic field behavior

- Titles and companies receive Unicode-compatible display normalization and stable
  comparison keys; only an explicit alias/suffix table is applied.
- Physical locations retain structured locality, region, postal code, country, and
  precision. Remote eligibility is represented separately as a remote region.
- Workplace type accepts only explicit reviewed synonyms for remote, hybrid, and
  on-site work.
- Salary parsing uses canonical decimal strings and integer minor units, explicit ISO
  currency scales, bounded magnitude/precision, ordered ranges, and explicit hourly,
  daily, weekly, monthly, or yearly intervals. It does not use binary floating point
  or infer ambiguous locale separators.
- Dates distinguish date-only precision from ISO instants and retain the source date
  alongside the canonical instant.
- Source URLs retain only explicitly material query parameters, remove fragments and
  credentials, accept only HTTP(S), normalize safe source-kind identifiers, and keep
  external IDs separate.

The 16-candidate golden fixture covers valid, partial, ambiguous, malformed, Unicode,
locale, interval, date/instant, physical/remote-location, and unsupported-field cases.
Its retained witness is:

```json
{
  "specVersion": 1,
  "fixtureSuite": "job-normalization.golden.json",
  "inputCandidates": 16,
  "normalized": 11,
  "partial": 1,
  "ambiguous": 3,
  "notApplicable": 1,
  "scenarios": {
    "titleAndCompanyKeys": true,
    "physicalAndRemoteLocationsSeparated": true,
    "workModeNormalized": true,
    "exactSalaryMinorUnits": true,
    "currencyNormalized": true,
    "dateAndInstantSeparated": true,
    "sourceCanonicalizedByAllowlist": true,
    "rawEvidenceAndProvenanceRetained": true,
    "immutableOutput": true
  }
}
```

Property tests add 1,100 generated cases for deterministic title normalization and
raw-value retention, exact salary minor-unit conversion, and source-query allowlisting.
Focused tests also prove preservation of user-confirmed evidence, fail-closed bounds,
safe partial source results, Unicode behavior, every supported salary interval, all
three workplace types, and refusal to guess locale-specific separators.

## Local verification

The final implementation tree passed:

- repository format, import-boundary, and foundation-record checks;
- full typecheck (32 tasks) and lint (22 tasks), including the Rust boundary;
- full unit/property suite: 75 files and 663 tests, including the emitted `XTR007_PROOF`
  witness above;
- full build plus UI, application-shell, PWA resilience, onboarding, document-browser,
  browser-storage, native storage, secure-storage, and archive/recovery proof suites;
- generated-schema equality, including `job-normalization.v1.schema.json`;
- license policy over 520 npm packages and 498 Rust crates;
- tracked/unignored secret scans, Changesets status, and npm audit with no known
  vulnerabilities; and
- Cargo audit under the existing reviewed 15-warning GTK3/unmaintained-dependency
  policy; this slice added no Rust crate or warning.

The run used the repository-required Node.js 24.19.0 and pnpm 11.22.0 toolchain. The
Node archive matched the official published SHA-256 before execution.

## Hosted clean-commit proof

The exact implementation head completed [Foundation CI run 33723649238](https://github.com/seabAu/Coredrill/actions/runs/33723649238)
successfully at `230e771a60609e6e14ceb0867a107fdd1188002c`. The
[aggregate quality job 100547822824](https://github.com/seabAu/Coredrill/actions/runs/33723649238/job/100547822824)
installed the frozen graph and passed the complete foundation gate, including the 663
unit/property tests, generated-schema equality, boundary and policy checks, npm and
Rust advisory checks, secret and license scans, build, coverage, and Changesets status.

The clean matrix also passed:

- [Chrome 151 job 100547822714](https://github.com/seabAu/Coredrill/actions/runs/33723649238/job/100547822714)
  and [Chrome 152 job 100547822885](https://github.com/seabAu/Coredrill/actions/runs/33723649238/job/100547822885);
- [Firefox 153 job 100547822899](https://github.com/seabAu/Coredrill/actions/runs/33723649238/job/100547822899)
  and [Firefox 154 job 100547822799](https://github.com/seabAu/Coredrill/actions/runs/33723649238/job/100547822799);
- [Windows job 100547822935](https://github.com/seabAu/Coredrill/actions/runs/33723649238/job/100547822935),
  [macOS job 100547822982](https://github.com/seabAu/Coredrill/actions/runs/33723649238/job/100547822982),
  and [Ubuntu job 100547822862](https://github.com/seabAu/Coredrill/actions/runs/33723649238/job/100547822862);
- [extension-transfer job 100547823019](https://github.com/seabAu/Coredrill/actions/runs/33723649238/job/100547823019); and
- [full-history secret-scan job 100547822892](https://github.com/seabAu/Coredrill/actions/runs/33723649238/job/100547822892).

Representative immutable artifact witnesses are Windows installer artifact
`9881503317` (`sha256:c8e544fac2d83a042445cb574593e158acf766aa83139a6474eec2e236d4ed1c`),
macOS application artifact `9881340299`
(`sha256:bfa005a494eab783b0a8e49017732bc9148e0c0e915b92a475b9bbaacba58e79`),
Linux AppImage artifact `9881404637`
(`sha256:cd7fc0f14aa1330c7a845a2a620bd9d1bbddacb03618fc1c478bd25aaaf3bc6f`),
Chromium extension artifact `9881367524`
(`sha256:f592c7831255911b753cb7382aaff1af7859da9109ffdb532fc4758e07e24bbe`),
and extension-transfer artifact `9881214770`
(`sha256:2ed767bce8c96e1f50489af80fd80d787416f98fcb91862a795b31393c8dda86`).
All were unexpired when this proof was recorded on 2026-09-03. XTR-007 itself adds
no executable package or network artifact.

## Decision and boundary audit

No Accepted product or architecture decision changed. This slice implements the
existing raw-plus-normalized, provenance-preserving extraction boundary. SQLite
remains durable truth, Zustand and query caches remain non-canonical, and no store,
database, account, hosted service, extension permission, AI, or Rust-boundary decision
changed, so no XTR-007 ADR is needed.

Hosted proof closes `XTR-007`. `XTR-008` is the next smallest unblocked slice:
generate per-field precision, coverage, and confidence-calibration evidence by
adapter/version without presenting an opaque hiring or ATS score. `GATE-1`, the
representative participant study, and `FND-001` remain independently open on their
recorded external owners.
