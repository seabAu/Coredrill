# Phase 0 low-fidelity UX prototypes

These disposable prototypes support `UXR-001` through `UXR-003`. They test information
architecture, vocabulary, local-storage comprehension, capture review, context
retention, document retrieval, and network preflight before production UI work begins.

They are intentionally low fidelity. They do not write a vault, call a network,
generate content, or represent finished visual design.

## Run locally

Serve the repository root, then open `/prototypes/phase-0/`:

```powershell
python -m http.server 4180
```

Use the device and screen controls inside the prototype. The desktop set covers the
shell, Home, Pipeline Board/Table, Inbox review, job workspace, and document studio.
The mobile set covers quick add, Pipeline, job detail, and network preflight.

`sample-vault.v1.json` is an explicitly synthetic, disposable research fixture.
`usability-study-script.md` contains the ten moderator tasks, observation rubric, and
participant mix for the next validation slice.
