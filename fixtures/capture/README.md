# Capture source-preview fixtures

These synthetic fixtures contain executable-looking HTML, active-resource URLs, event handlers, and markup-shaped JSON strings. They contain no third-party or applicant data.

`e2e/source-preview.spec.mjs` imports both through the explicit saved-file route, opens the durable Inbox preview, and proves that only inert text is rendered, no fixture script executes, no external request occurs, and source section/evidence navigation moves keyboard focus to a named path.
