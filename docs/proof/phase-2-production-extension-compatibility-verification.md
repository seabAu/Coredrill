# Phase 2 production extension compatibility verification

Date: 2026-09-27  
Checklist item: `PEX-004`  
Implementation commit: `bbf7aadbcdf77b97b6a4adacd9e81accaaa0218c`  
Hosted run: [Foundation CI 36294337179](https://github.com/seabAu/Coredrill/actions/runs/36294337179)

## Outcome

The Chromium web-to-extension path now requires a strict version-1
compatibility handshake before every outbox pull. The web app derives its
identity from the current page's exact HTTPS origin and sends that origin, the
intended extension ID, supported transfer and capture-envelope versions, and
the required reviewed capabilities. The extension first authenticates the
external-message sender through the existing manifest and runtime policy,
then compares the declared origin with that sender and the expected extension
ID with its own runtime ID.

The accepted response echoes both identities, selects transfer version 1 and
capture-envelope version 1, and returns only the pull/ack capability set. The
web receiver revalidates the exact response shape, correlation ID, identities,
selected versions, and ordered capability set before sending a pull. A
mismatch therefore fails before any outbox read, SQLite open, transfer, or
acknowledgement.

The reserved `https://app.coredrill.test` origin remains evidence-only. This
slice does not select a public product domain or claim the later hosted
deployment journey. No Accepted decision changed, so no ADR was required.

## Strict contract proof

`packages/extension-bridge/test/compatibility.test.ts` proves:

- exact keys, a 2 KiB request ceiling, canonical HTTPS origins, Chromium
  extension-ID syntax, unique version arrays, and bounded unique capability
  lists;
- exact app-origin and extension-ID agreement against authenticated runtime
  facts;
- rejection of unsupported transfer and capture-envelope versions;
- rejection of an unknown required capability rather than a permissive
  downgrade; and
- response-side rejection of changed identity, selected version, or expanded
  capability facts.

The complete unit suite passed **87 files / 738 tests**. Coverage remained
above every repository threshold; `compatibility.ts` reached 88.88% statements,
84.33% branches, 100% functions, and 94.11% lines.

## Production browser proof

`e2e/extension-transfer.spec.mjs` loads the production Chromium MV3 build in a
persistent browser profile and routes the reserved HTTPS app origin to the
local production app. Before the ordinary durable transfer journey it proves:

- the exact identity/version/capability handshake is accepted;
- a declared origin different from the authenticated sender is rejected;
- an expected extension ID different from the runtime extension is rejected;
- transfer version 2 is rejected rather than negotiated silently;
- an unknown delete capability is rejected;
- an extra request field is rejected; and
- the normal app performs the handshake before pull, durable SQLite commit,
  exact acknowledgement, restart retry, and deduplication.

The separate production extension matrix passed **4/4**: Chromium preview,
Chromium compatibility plus persistent transfer/restart, Chromium
storage-pressure retention, and Firefox checksummed manual fallback. The
Firefox manifest still has no externally connectable origin or content script.

## Permission and package proof

Production package inspection confirms that the handshake added no permission
or broader origin:

- Chrome permissions remain `activeTab`, `scripting`, `sidePanel`, and
  `storage`, with the single reserved exact origin as the external-message
  match;
- Firefox permissions remain `activeTab`, `scripting`, and `storage`, with no
  external origin;
- host and optional host permissions remain empty;
- remote assets/imports and `eval` calls remain zero; and
- store and Firefox source-review packages rebuild and inspect successfully.

The contract adds no fetch command, page surveillance, hosted account, provider
secret, content script, automatic application, or outreach behavior.

## Local verification

`pnpm verify` passed with pinned Node 24.19.0 and pnpm 11.22.0:

- formatting, 19 import-boundary policies, and foundation-record drift;
- 33 TypeScript/Rust typecheck tasks and 22 lint tasks;
- 87 unit files / 738 tests plus the coverage run;
- 22 production build tasks and current generated reports;
- extension build/package inspection, UI/application/performance/resilience/
  onboarding/document/storage browser suites, and native storage/secret/archive
  proofs;
- generated schemas, 520 npm and 498 Rust license records, secret scans, and
  Changesets status; and
- zero known npm or Rust vulnerabilities, with seven existing reviewed Rust
  warnings.

`pnpm test:extension-transfer` separately passed the production 4/4 browser
matrix.

## Hosted verification

Foundation CI run 36294337179 passed from the implementation commit. The
foundation gate, full-history secret scan, production Chromium/Firefox
extension transfer matrix, Chrome 151 and 152 browser-storage jobs, Firefox
153 and 154 browser-storage jobs, and native Windows, macOS, and Ubuntu package
jobs all completed successfully. The pull-request-only dependency review was
correctly skipped on this direct `main` push.

## Residual scope

`PEX-005` owns selection and proof of the actual isolated public app origin,
the deployed hosted-app journey with the release extension identity, and the
release browser matrix for Chromium transfer plus Firefox/manual fallback.
`PEX-004` does not treat the reserved `.test` origin as that product decision.
