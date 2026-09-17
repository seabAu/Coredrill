# Phase 2 extraction quality verification

- Date: 2026-09-17
- Checklist scope: `XTR-008`
- Candidate contract: version 1
- Extractors: six exact version `1.0.0` identities
- Implementation commit: `8e9c1457ed8fafbf0c7349bd59d516bc7025763e`

## Outcome

`XTR-008` is proven by a reproducible, versioned quality report generated from the
current extractor builds and checked-in lawful synthetic golden fixtures. The report
measures exact matches, false positives, false negatives, precision, coverage/recall,
expected calibration error, Brier score, and confidence bins overall, per exact
adapter/version, and for every supported field.

The evaluator adds no runtime telemetry, network request, AI inference, hosted service,
SQLite write, or canonical entity mutation. Its results describe extractor behavior
only and are explicitly prohibited from use as an ATS score, candidate score, or hiring
probability.

## Versioned inputs and reproducibility

- `docs/evals/extraction-quality-evaluation.v1.json` pins candidate-contract version 1,
  six extractor identities and versions, supported fields, fixture suites, half-open
  confidence bins with a closed final bound, thresholds, minimum sample counts, and
  interpretation rules.
- `tooling/scripts/generate-extraction-quality-report.mjs` loads the current built
  extractors, evaluates their frozen golden cases, and writes the deterministic report.
- `tooling/extraction-quality/report.mjs` owns dependency-free scoring and explicit
  `pass`, `fail`, `insufficient_data`, and `no_data` states.
- `docs/evals/extraction-quality-report.v1.json` is the checked-in result. Root
  `pnpm verify` rebuilds the contracts and extractors and rejects a missing or stale
  report through `pnpm check:extraction-quality-report`.
- `tooling/tests/extraction-quality-report.test.mjs` covers false positives/negatives,
  one-sided missing data, confidence-bin boundaries, calibration sample semantics,
  extractor identity drift, and adapter/field threshold summaries.

## Results

The version-1 corpus contains 17 fixture cases and 143 expected candidates. The current
extractors produced 143 candidates with 143 exact matches, zero false positives, and
zero false negatives. Pooled precision, coverage, and recall are `1.0`. Pooled
calibration has mean confidence `0.916713`, expected calibration error `0.083286`, and
Brier score `0.016325`, which passes the declared pooled thresholds.

Pooled success does not hide local evidence. The machine-readable threshold summary
reports:

- adapters: 4 pass, 1 fail, and 1 insufficient-data result;
- supported fields: 23 pass, 4 fail, and 27 insufficient-data results.

The generic-document adapter's exact candidates are conservatively underconfident
against this small all-correct corpus, so its calibration threshold correctly remains a
failure. The selected-text adapter has one observation and therefore remains
insufficient data. Sparse fields retain insufficient-data status rather than receiving
invented zeroes or perfect scores. False negatives, which have no confidence, are never
inserted into calibration calculations.

These local failures are diagnostic evidence, not a reason to rewrite confidence values
or weaken thresholds. The small synthetic corpus is a deterministic regression witness;
it does not establish live-web prevalence, web-wide accuracy, or user review-correction
rates. Representative `Q2-001` evidence remains responsible for those claims.

## Verification

The complete local `pnpm verify` gate passed after installation of the exact lockfile:
formatting, 19 import-boundary policies, 51 dependency records, typecheck, lint, 76 unit
test files with 670 tests, coverage, all builds, generated UI and extraction reports,
extension build/package inspection, UI/application/performance/resilience/onboarding/
document/storage browser suites, native Rust and storage proofs, generated contracts,
520 npm and 498 Rust license records, secret scans, advisory scans, and Changesets
status. The npm audit reported no known vulnerabilities. A first local aggregate attempt
encountered one non-reproducing UI-catalog startup timeout; the complete five-test UI
suite and the subsequent full aggregate run passed without a code change.

Clean-commit [Foundation CI run 35259770050](https://github.com/seabAu/Coredrill/actions/runs/35259770050)
passed for the exact implementation commit. Required hosted jobs passed for the
aggregate frozen-install/policy gate, full-history secret scan, extension packaging and
transfer, Chrome 151 and 152, Firefox 153 and 154, and installed native packages on
Windows, macOS, and Linux. The pull-request-only dependency-review job was correctly
skipped on the direct `main` push.
