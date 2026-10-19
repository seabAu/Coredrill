---
"@coredrill/application": minor
"@coredrill/storage-core": minor
---

Add a validated, job-scoped paginated local Timeline query over status events and interactions. Keep original history after undo and expose its recorded reversal separately; bound pages by snapshot time and reject mismatched or missing cursor anchors. This prerequisite does not enable a normal Timeline screen or infer unrecorded activity.
