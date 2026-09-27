# Phase 2 production extension store/privacy draft verification

Date: 2026-09-27  
Checklist item: `PEX-008`  
Status: draft and local review complete; hosted clean-commit proof pending

## Outcome

The repository now contains one reviewable source for the Chrome Web Store and
Firefox listing copy, permission rationales, data-use answers, Firefox reviewer
notes, and a candidate public privacy policy. The draft is derived from the
actual generated manifests and tested capture/transfer behavior. It does not
pretend that the reserved `.test` app origin, release identities, publisher
details, privacy/support URLs, marketplace clearance, or listing assets have
been selected.

The reviewed draft is [Coredrill Capture store listing and privacy draft](../privacy/coredrill-capture-store-and-privacy-draft.md).

## Build-to-claim review

| Draft claim                       | Production evidence                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| User-invoked current-page capture | `activeTab` plus `scripting`; no content script or background observer; capture UI and browser fixtures require an explicit action                |
| Local preview and correction      | Production panel fixtures retain page evidence, provisional title/company correction, and an optional local note                                  |
| Bounded local persistence         | `storage`; 32-item/6-MiB outbox; seven-day envelope expiry; exact acknowledgement cleanup and expiry pruning                                      |
| Chromium review surface           | Generated Chromium manifest contains WXT's `sidePanel`; popup remains a tested fallback                                                           |
| Firefox review surface            | Firefox sidebar plus popup; no external web-page origin                                                                                           |
| Narrow page access                | Required and optional host-permission arrays are empty in both inspected builds                                                                   |
| Exact Chromium transfer           | One exact HTTPS `externally_connectable` origin plus runtime origin, extension-ID, protocol, capability, size, replay, and acknowledgement checks |
| Firefox local fallback            | Checksummed JSON export/import; `data_collection_permissions.required: ["none"]`; no automatic transmission outside the add-on or local browser   |
| No developer collection           | No analytics, telemetry, provider call, arbitrary fetch, account, or hosted database path exists in the extension package                         |
| No remote code                    | Self-only extension CSP; package scans report zero remote assets, imports, or dynamic evaluation                                                  |
| No overclaimed privacy            | The draft explicitly says extension-local storage and exported files are not automatically encrypted                                              |

## Policy review

Current official Chrome and Mozilla policy pages were reviewed on 2026-09-27
and are linked in the draft. The copy reflects the following conservative
interpretations:

- Chrome requires disclosure even for data handled only on the user's device,
  so the draft identifies website content, the explicitly selected page URL,
  and user-authored corrections/notes rather than claiming that no user data is
  handled.
- Chrome permission explanations are feature-specific and do not reserve
  future privileges. The required Limited Use statement is present.
- Firefox defines data transmission as handling outside the add-on or local
  browser. The current Firefox build performs only a user-requested local file
  export, so its manifest `none` declaration remains aligned. The draft names
  direct transfer or telemetry as an invalidation trigger.
- Both listings prominently describe current-page capture, so the narrowly
  handled page URL/content is tied to the extension's single user-facing
  purpose.

This is a technical/product review, not legal approval. Final submission still
requires owner-supplied publisher facts and any legal review the owner chooses.

## Local verification

The reviewed source packages and this documentation change pass:

```text
pnpm format:check
pnpm check:foundation-records
pnpm check:extension-build
pnpm check:extension-packages
```

All four commands passed. The package inspectors confirmed:

- Chromium permissions: `activeTab`, `scripting`, `sidePanel`, and `storage`;
- Firefox permissions: `activeTab`, `scripting`, and `storage`;
- empty host-permission lists, self-only CSP, zero remote assets/imports/dynamic
  evaluation, and zero secret findings for both targets;
- byte-identical inspected store ZIPs with SHA-256
  `f2757e799e57cefd19f79d1bd1aadac49791f9288d3ae1ec19c761fa29c2107c`
  for Chromium and
  `9a4f1dac764c80b858e9a9aa22aba5d510fa28a72cb7b2366de29243e2e50729`
  for Firefox; and
- a 57-file source-review ZIP with zero secret findings and SHA-256
  `e5c33b27bea4f3fa6e35296efb39f0f6cbcfc8df07c0567b0087a5aa118b2979`.

The hosted clean-commit matrix is recorded after the implementation commit.

## Decision status and residual blockers

No Accepted decision changes. The draft implements the disclosure work already
required by `D-023` and ADR-0005 without publishing, signing, changing a
permission, or choosing a public identity.

Actual publication remains blocked on trademark/domain/marketplace clearance,
the public HTTPS app origin and hosting target, release browser identities and
store accounts, publisher/support/privacy contact details and URLs, listing
assets, and a final exact-package policy review. `PEX-005` and `PEX-006` remain
open for their separately documented reasons.
