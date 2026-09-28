# Import fixtures

This directory contains synthetic DOCX, PDF, scanned-PDF, corrupt-PDF, representative
large-PDF, and Markdown fixtures plus their stable expected import properties. They are
generated or authored solely for local parser and source-mapping tests. Never place real
job postings, resumes, employer correspondence, credentials, or personal data here.

`fixture-manifest.json` records each fixture's byte length, SHA-256 digest, case, and
expected high-level outcome. It also references the already-rendered controlled DOCX
export in `fixtures/exports` as a second valid DOCX layout. Regenerate the binary import
fixtures and manifest with the bundled workspace Python runtime by running
`python tooling/scripts/generate-document-import-fixtures.py`. Render and inspect every
page of every valid generated visual fixture before accepting a change. The intentionally
truncated PDF must fail parsing and rendering with a corrupt-file result.
