# Import fixtures

This directory contains synthetic DOCX, PDF, scanned-PDF, and Markdown fixtures plus
their stable expected import properties. They are generated or authored solely for
local parser and source-mapping tests. Never place real job postings, resumes, employer
correspondence, credentials, or personal data here.

Regenerate the binary fixtures with
`python tooling/scripts/generate-document-import-fixtures.py`, then render and inspect
every generated page before accepting a changed fixture.
