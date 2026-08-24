# ADR-0003 — Adopt the browser-storage support floor

- **Status:** Accepted
- **Date:** 2026-08-24
- **Owners:** Project owner
- **Decision register IDs:** `D-025`, `Q-002`
- **Checklist IDs:** `STG-004` through `STG-008`

## Problem and evidence

D-025 provisionally selected official SQLite WASM in a dedicated Worker with `opfs-sahpool`, but explicitly withheld a browser-support promise until compatibility, failure, contention, recovery, and performance evidence existed. The first storage slice proved the core lifecycle in Edge and hosted Chrome. The hardening slice now adds real Firefox WebDriver execution, current/previous exact Chrome and Firefox CI lanes, persistence/quota/eviction diagnostics, fail-safe corrupt-restore handling, Web Locks single-writer coordination, abrupt-tab recovery, typed SQLite-busy errors, and deterministic 100/2,000/10,000-record benchmarks.

Official SQLite documentation says `opfs-sahpool` works on the major browser engines released since March 2023, requires a Worker, does not require COOP/COEP, and intentionally cannot support simultaneous connections. It recommends the ordinary `opfs` or `opfs-wl` VFS when multi-tab concurrency is required. It also warns that private/guest modes can reduce or remove persistence and cannot be detected reliably.

The required macOS/Safari and mobile-device runners are unavailable. Playwright WebKit is not branded Safari and cannot substitute for those rows. The support decision therefore needs an exact fallback rather than a simulated Safari pass.

## Constraints

- The full app remains accountless, local-first, offline-capable, and useful with AI disabled.
- SQLite remains durable truth; no browser receives a different canonical model or an opaque storage substitute.
- A browser vault must never be labeled durable merely because OPFS opened. Persistence grant, quota, and expected-database presence are separate evidence.
- A failed restore must not replace a healthy target before checksum, SQLite integrity, and schema checks pass.
- `opfs-sahpool` permits one active pool connection for the origin. The app must coordinate this before SQLite initialization and present controlled handoff behavior.
- Browser support claims require branded current/previous execution or an explicit unsupported condition and fallback.
- No current requirement justifies multi-tab editing, COOP/COEP deployment constraints, hosted coordination, or another VFS.

## Options considered

1. Retain `opfs-sahpool` without a support floor or coordination contract. This preserves the spike but leaves silent best-effort persistence and second-tab failure.
2. Switch to `opfs`/`opfs-wl` for transparent multi-tab concurrency. This spends compatibility and deployment complexity on an unvalidated requirement and discards the measured `opfs-sahpool` path.
3. Retain `opfs-sahpool`, add an origin-wide Web Lock single-writer lease and controlled handoff, support only exact browser generations with real evidence, degrade honestly when persistence/quota evidence is weak, and block unsupported browsers with a portable-data/desktop fallback.
4. Replace SQLite/OPFS with IndexedDB or memory on unsupported browsers. This would violate D-024's canonical SQLite semantics and complicate recovery.

## Decision and rationale

Adopt option 3. Exact hosted Chrome `152.0.7977.54`/`151.0.7922.138` and Firefox `154.0`/`153.0` lifecycle lanes passed on commit `0271aaa65b793e530b092e0ce35c59f9ff6b7728` in [Foundation CI run 32712600336](https://github.com/seabAu/Coredrill/actions/runs/32712600336). The aggregate gate and full-history secret scan passed in the same run, so D-025 is promoted to Accepted and Q-002 is resolved by this support floor and fallback.

The v1 support floor is current and previous stable Chromium-family and Firefox desktop generations that pass the official SQLite Worker/`opfs-sahpool` open, migrate, close/reopen, export, delete, and restore lifecycle. Edge current remains an additional branded diagnostic. Safari desktop, iOS PWA, Android PWA, and any browser missing OPFS, dedicated Workers, Web Locks, or the required SQLite VFS remain unsupported until their real required rows pass.

One tab owns the vault through an origin-wide exclusive Web Lock. A second writer receives a retryable `vault_busy` result and a “vault open in another tab” handoff message. Abrupt page loss releases the browser-owned lease; the contender retries and verifies the existing database. SQLite result code 5/locked errors map to a separate retryable `sqlite_busy` error.

OPFS is `durable` only when the browser reports persistent storage granted. Otherwise the adapter reports `best-effort`, exposes stable warnings for denied/error/unsupported persistence, unknown/low quota, or an expected database missing, and requires visible export/recovery guidance in the later UI slice. Persistence requests occur only from an explicit user action, never silently during open.

## Consequences and migration

The browser adapter's internal Worker protocol advances from version 1 to version 2; it is not a persisted or external contract. No SQLite schema migration is required.

Restore now validates a temporary imported database before target replacement. It checks byte length and SHA-256 before import, then SQLite integrity and schema version in the temporary slot. If final replacement fails, it attempts to restore the pre-operation target bytes. Corrupt input therefore fails without destroying the healthy target in the proven case.

Safari users have no supported browser-vault release path at this gate. The exact fallback is to use a supported desktop Chromium/Firefox browser, or the native Coredrill app after its Phase 0/1 gate, and transfer data through the portable export. The app must block vault creation rather than silently fall back to memory, localStorage, IndexedDB, or an unproven VFS. Existing development data has a portable export path; no public release migration exists yet.

The diagnostic Edge benchmark is a capacity signal, not the Windows 11/i5 reference performance gate. It establishes no public performance budget and does not substitute for required hardware.

## Security, privacy, and source-policy impact

All new checks are local browser APIs and local synthetic tests. No account, hosted database, telemetry, provider key, AI call, source connector, extension permission, or production career content is introduced. Diagnostic details contain stable state tokens rather than user content, exact paths, or record values. CI browser downloads are exact-versioned and their setup actions are immutable-commit pinned.

Private/incognito mode is not fingerprinted. Coredrill responds only to observable persistence/quota/missing-data evidence and warns conservatively. The synthetic ephemeral-context test proves that closing an isolated profile can remove its OPFS data.

## Documents, contracts, checklist IDs, and tests to update

- Design/goal/decision-register changes: D-025 status/wording, Q-002 resolution, browser adapter architecture, security/recovery behavior, and technology support floor.
- Contracts/migrations: internal Worker protocol v2 and browser diagnostics; no durable schema change.
- Checklist IDs: `STG-004` through `STG-008`.
- Automated/manual proof: Edge lifecycle/failure/concurrency/benchmark suite, real Firefox 154 WebDriver lifecycle, exact Chrome 152/151 and Firefox 154/153 hosted lanes, raw diagnostic benchmark artifact, and explicit Safari/mobile unavailable rows.

## Revisit trigger

Revisit when real Safari/macOS or mobile-device rows pass; when multi-tab editing becomes a validated requirement; when Web Locks or `opfs-sahpool` compatibility changes; when eviction/recovery evidence shows unacceptable loss; or when `opfs-wl` demonstrates materially better validated behavior without weakening offline deployment, portability, or support.
