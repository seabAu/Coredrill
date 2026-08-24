# Synthetic document export fixtures

These fixtures are generated entirely from
`packages/documents/test/fixtures/document-ir.v1.valid.json`. They contain no private
or production job-seeker data.

- `accessible-resume.docx` is the locally generated OOXML export.
- `accessible-resume.pdf` is the tagged browser-print export.
- `rendered/docx/page-1.png` is the final DOCX rendered through LibreOffice and Poppler.
- `rendered/pdf/page-1.png` is the final PDF rendered directly through Poppler.

Regenerate the DOCX and PDF while running the real-browser suite:

```powershell
$env:COREDRILL_WRITE_EXPORT_FIXTURES = "1"
pnpm test:documents-browser
```

The rendered PNGs are review artifacts, not alternate exports. Regenerate them with
the repository's document/PDF visual-QA tools and inspect every resulting page at
original detail before accepting an export change.
