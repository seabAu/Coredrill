# ADR-0005 — Adopt the WXT multi-surface extension baseline

- **Status:** Accepted
- **Date:** 2026-08-24
- **Owners:** Project owner
- **Decision register IDs:** `D-023`, `Q-005`
- **Checklist IDs:** `EXT-001` through `EXT-008`

## Problem and evidence

`D-023` provisionally selected WXT for a Manifest V3 capture extension, while `Q-005` left the primary and fallback surfaces open. Acceptance required real Chromium and Firefox builds, a user-invoked capture boundary, a bounded durable outbox, app transfer or explicit fallback, hostile-input tests, exact production-bundle review, store packages, and a reproducible Firefox source-review package.

`EXT-001` through `EXT-006` prove WXT `0.21.4` builds both browser targets from shared TypeScript/React code. Chromium uses a side panel as its primary surface and a popup fallback. Firefox uses a sidebar as its primary surface and the same popup fallback. The builds capture only the active page after an explicit user action, retain provenance in a versioned checksummed envelope, and store a bounded local outbox. A real Chromium persistent-context test proves exact-origin pull/ack transfer, SQLite-before-ack durability, acknowledgement-loss retry, exact deduplication, and queue removal. A real Firefox test proves the checksummed manual export/import fallback. Hostile origin, sender, ID, size, expiry, checksum, replay, and fetch-shaped messages fail closed.

`EXT-007` adds exact inspection of both unpacked production directories and their store ZIPs. Each store ZIP must contain the same eight reviewed files and must extract to the same byte-level inspection record as its production directory. Every production text file is scanned for remote assets, remote imports, dynamic code execution, and likely secrets. The Firefox source-review ZIP is restricted to an explicit repository-root allowlist, contains the pinned lockfile and build instructions, and excludes dependencies, generated output, tests, unrelated applications, publishing configuration, environment files, and credentials. A clean temporary extraction installs from the frozen lockfile in offline mode and reproduces the inspected Firefox directory, store ZIP, and source-review ZIP byte for byte.

WXT `0.20.27` was rejected because its obsolete runner subtree failed the dependency advisory gate. The selected `0.21.4` graph passes the npm advisory and license gates. Its source-archive reporter emits cosmetic `ENOENT` stat warnings when `sourcesRoot` is outside the extension package, but the archive itself contains the exact allowlist and the independent inspector rejects any missing, extra, duplicate, absolute, drive-prefixed, or traversal path.

## Constraints

- The extension remains an optional accountless, local-first capture helper; the full application works without it and with AI disabled.
- Capture is user-invoked against the active tab. There is no background browsing, general crawling, provider scraping, auto-apply, auto-submit, or outreach.
- Production manifests use the least permissions demonstrated by the feature. No host permission, content script, optional permission, provider secret, vault access, arbitrary network fetch, or remotely hosted code is allowed.
- All external data crosses a validated versioned contract and retains provenance. The app must commit a complete capture to SQLite before acknowledgement.
- Firefox must have a usable path even where web-page external messaging differs from Chromium.
- Store artifacts and review sources must be independently inspectable and reproducible from the reviewed lockfile.
- The reserved Phase 0 `.test` origin is test evidence, not a public deployment or identity decision.

## Options considered

1. Adopt WXT with Chromium side panel, Firefox sidebar, popup fallback on both targets, exact-origin Chromium transfer, and checksummed Firefox manual export. This preserves one reviewed implementation while respecting browser capability differences.
2. Use only a popup. This is portable, but its constrained transient surface is a worse fit for reviewing captured candidates and transfer state. The popup remains a proven fallback rather than the primary experience.
3. Hand-author browser-specific manifests and build pipelines around the shared packages. This is viable if WXT becomes blocking, but duplicates manifest, entrypoint, packaging, and source-review logic without an observed benefit.
4. Require direct page-to-extension transfer on Firefox. The required cross-browser API parity was not observed; forcing it would either misrepresent support or broaden the boundary.
5. Add host permissions or content scripts for more automated capture. This conflicts with the explicit-user-action and least-privilege constraints and is not required by the proven journey.

## Decision and rationale

Adopt option 1. Clean-commit [Foundation CI run 32764058550](https://github.com/seabAu/Coredrill/actions/runs/32764058550) passed the complete package/rebuild lane and repository matrix, and its immutable artifact was independently downloaded and reviewed.

WXT `0.21.4` becomes the accepted extension build and packaging baseline. Chromium uses the side panel as its primary surface; Firefox uses its sidebar; both retain the popup as a compact fallback. The extension remains Manifest V3 and shares capture, contract, and transfer code without importing application UI or storage internals.

Chromium transfer is a pull/ack boundary restricted by both manifest and runtime sender checks to one reviewed app origin. Firefox uses a stable Gecko ID, declares no data collection, exposes no web-page external messaging origin, and uses explicit checksummed JSON export/import. A future browser API change may add an equally strict Firefox direct-transfer adapter, but the manual path remains the supported fallback until separately proven.

Store acceptance is defined by the independent inspectors rather than by WXT command success alone: exact manifest and file allowlists, self-only CSP, local entrypoints and assets, zero remote/eval code, zero likely secrets, byte-identical ZIP extraction, safe archive paths, and a clean frozen-lockfile source rebuild. Publishing credentials, store submission, listing copy, signing, and public-release identity clearance remain outside this architecture gate.

## Consequences and migration

The repository gains deterministic Chrome and Firefox store ZIP commands plus a Firefox source-review ZIP and build guide. CI performs ordinary store-package inspection in the aggregate gate and the more expensive clean source rebuild in the dedicated extension lane. Package files remain generated outputs and are not committed; their hashes and immutable hosted artifact metadata are retained as proof.

WXT configuration resolves its source root from the package-script working directory. Package scripts are therefore the supported entrypoint for production packaging. The independent inspector prevents a changed working directory or WXT packaging regression from silently producing an incomplete archive.

No user-data, SQLite schema, capture contract, or outbox migration is introduced. The provisional Phase 0 app origin must be replaced by an owner-selected isolated production origin before any release build, followed by the same manifest, sender, E2E, and package proof.

## Security, privacy, and source-policy impact

The decision adds no account, telemetry, provider call, source connector, scraping policy, hosted database, or user-content fixture. It adds no extension permission. The only browser-specific difference is the already-tested transfer mechanism.

The production inspector parses the generated manifest and scans every text bundle for remote URLs/imports, dynamic code execution, and likely secrets. Store ZIPs are extracted only after rejecting unsafe and duplicate paths. The source-review ZIP uses an exact file allowlist and receives the same path and secret checks. The clean rebuild uses the pinned package manager, frozen lockfile, and local package cache; it does not require a store credential or private dependency.

The extension never receives provider secrets or full-vault access. User-confirmed values are not silently overwritten because capture import remains provenance-retaining and idempotent. No source-policy decision changes.

## Documents, contracts, checklist IDs, and tests to update

- Design/goal/decision-register changes: promoted `D-023`, resolved `Q-005`, and updated the extension stack evidence, ADR index, and living checklist after hosted proof.
- Contracts/migrations: none.
- Checklist IDs: `EXT-007` and `EXT-008` closed after immutable hosted artifact review.
- Automated/manual proof: complete workspace aggregate gate; exact unpacked and store-ZIP inspectors; remote-code and secret scans; clean frozen-lockfile offline Firefox source rebuild; Chromium/Firefox transfer E2E; full-history secret scan; immutable artifact download and hash review. See [extension production-package verification](../proof/extension-production-package-verification.md).

## Revisit trigger

Revisit WXT if a supported browser, store, CSP, source-review, or reproducibility requirement cannot be met without weakening the permission or transfer boundary. Revisit the surface split if measured keyboard, screen-reader, browser-API, or user usability evidence shows the side panel/sidebar primary surface or popup fallback is materially unusable. Revisit direct Firefox transfer only when a stable API can satisfy the same exact-origin, sender, acknowledgement, retry, and durable-receipt contracts.
