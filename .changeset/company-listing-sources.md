---
"@coredrill/application": minor
"@coredrill/storage-core": minor
"@coredrill/web": patch
---

Add a versioned read-only page of listing sources for jobs currently linked to
the originally viewed company. Preserve source-only rows and literal stored URL
text separately from validated navigation targets. Return current source metadata
and optional most-recent retained capture metadata without bodies, contact methods,
totals, network fetches or verified-employer claims. Validate bounded continuations
against the canonical source/job owner and independent archive scopes. The shared
adapter inventory advances to v24/44; durable SQL and portable exports remain182.
Connect normal company detail to owned source pages and deliberate linked-job
Source inspection with exact company page/cursor/focus return across reload and
history navigation, keeping private display values outside history metadata.
