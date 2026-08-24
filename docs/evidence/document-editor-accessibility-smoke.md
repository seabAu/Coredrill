# Document editor accessibility smoke report

- Run date: 2026-08-24
- Host/browser: Windows, Microsoft Edge 151.0.4129.101
- Command: `pnpm test:documents-browser`
- Scope: restricted Tiptap editor and local DOCX/PDF export path

## Result

The keyboard and screen-reader-facing smoke checks passed. Tab moves focus to the
editor's named textbox, the editor exposes `role="textbox"`, `aria-multiline="true"`,
the accessible name `Document content editor`, and a visible-in-context description.
With focus retained, `Ctrl+Alt+1` creates a level-one heading, ordinary typing works,
and the keyboard undo/redo sequence restores the expected content.

The print adapter exposes a language-tagged `article` containing semantic `h1`, `h2`,
paragraph, list, list-item, and safe-link elements. The DOCX adapter uses named Word
heading styles with outline levels, real list numbering/bullets, ordinary paragraphs,
explicit document language, descriptive core metadata, and real hyperlinks. It does
not introduce tables, text boxes, remote assets, or image-only content.

## Manual review

Every final DOCX and PDF page was rendered and inspected at original detail. Both
outputs are one unclipped letter page with the same heading hierarchy, emphasized
text, bullet, link, experience heading, and body copy. The PDF has a white page
background and no hidden overflow. The checked-in comparison renders are under
`fixtures/exports/rendered/`.

This is a focused Phase 0 semantic and keyboard smoke test, not a claim of broad
assistive-technology usability. Screen-reader journey testing with representative
users remains part of later UX validation.
