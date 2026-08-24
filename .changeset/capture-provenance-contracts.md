---
"@coredrill/contracts": minor
---

Add the first serialized capture and evidence boundary: integer-versioned `CaptureEnvelopeV1`, strict Zod validation, a generated Draft 2020-12 JSON Schema, bounded hostile-input handling, source-backed field candidates, durable explicit user confirmation, and retained conflict records.

Compatibility: this establishes capture-envelope version `1`; no earlier durable capture contract or migration exists. Future rolling updates must accept the current and previous integer versions.
