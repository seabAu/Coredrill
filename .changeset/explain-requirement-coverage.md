---
"@coredrill/application": minor
"@coredrill/storage-core": minor
"@coredrill/ui": minor
"@coredrill/web": patch
---

Add deterministic, evidence-grounded Strength, Partial, Gap, Unknown, and Not Applicable requirement coverage decisions with human-readable explanations.

Persist only explicit user-reviewed overrides, detect changed evidence without silently overwriting them, and keep missing evidence Unknown rather than inferring a gap or opaque aggregate score.
