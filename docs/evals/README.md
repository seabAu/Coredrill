# Evaluation documentation

This directory holds versioned extraction, evidence, AI, accessibility, and usability evaluation definitions and reports.

## Extraction quality version 1

[`extraction-quality-evaluation.v1.json`](extraction-quality-evaluation.v1.json) is the machine-readable input for `XTR-008`. It pins the candidate-contract version, six exact extractor identities and versions, supported fields, lawful synthetic fixture suites, confidence bins, metric thresholds, minimum sample behavior, and interpretation rules.

[`extraction-quality-report.v1.json`](extraction-quality-report.v1.json) is generated from that input, the live extractor builds, and the checked-in golden fixtures. It reports exact matches, false positives, false negatives, precision, coverage/recall, expected calibration error, Brier score, and calibration-bin observations overall and for every supported field grouped by extractor/version.

Run:

```powershell
pnpm generate:extraction-quality-report
pnpm check:extraction-quality-report
```

The check fails when the report is missing or stale. A metric threshold failure remains visible in the report rather than being rewritten as a pass: it is evidence for calibration or fixture-corpus follow-up. `null`, `no_data`, and `insufficient_data` are intentional states, not zeroes or synthetic perfect scores.

`thresholdSummary` counts adapter and field statuses independently of the pooled `overall` metrics, so a strong high-volume adapter cannot hide a failing low-volume adapter or field.

The version-1 corpus is small and synthetic. It proves deterministic behavior against frozen expected candidates; it does not establish live-web prevalence, user review-correction rates, or web-wide accuracy. Those require representative review evidence under `Q2-001`. These measurements describe extractor behavior only and must never be presented as an ATS score, candidate score, or hiring probability.
