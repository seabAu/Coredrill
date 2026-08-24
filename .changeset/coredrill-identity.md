---
"@coredrill/ai-adapters": patch
"@coredrill/application": patch
"@coredrill/capture-core": patch
"@coredrill/career-evidence": patch
"@coredrill/contracts": patch
"@coredrill/documents": patch
"@coredrill/domain": patch
"@coredrill/extension-bridge": patch
"@coredrill/extractors": patch
"@coredrill/labor-data": patch
"@coredrill/observability": patch
"@coredrill/prompt-engine": patch
"@coredrill/search-filter": patch
"@coredrill/source-policy": patch
"@coredrill/storage-browser": patch
"@coredrill/storage-core": patch
"@coredrill/storage-native": patch
"@coredrill/test-fixtures": patch
"@coredrill/ui": patch
---

Adopt the Coredrill internal package scope consistently across the Phase 0 workspace.

Migration: update repository-internal imports and workspace dependency names from the previous scope to `@coredrill/*`. No public package, runtime data, database schema, archive, or application contract exists yet.
