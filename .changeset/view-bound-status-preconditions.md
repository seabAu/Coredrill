---
"@coredrill/application": minor
"@coredrill/storage-core": minor
---

Add validated viewed-state preconditions to status changes, atomically checking the job version/status and unique active application identity/version before writing. Add the concrete durable undo application port with stable replay, missing-token and changed-target errors. Existing trusted runners may omit preconditions; normal interactive composition must supply them.
