# Phase 1 resilience end-to-end verification

Date: 2026-08-30

Checklist scope: `Q1-002`

Implementation commits:

- [`0d913392ac390c43d5a4ea646f5bc072decdec48`](https://github.com/seabAu/Coredrill/commit/0d913392ac390c43d5a4ea646f5bc072decdec48)
- [`0bf32421f0d7f0a92f41dc1db23ccbb12672a0fc`](https://github.com/seabAu/Coredrill/commit/0bf32421f0d7f0a92f41dc1db23ccbb12672a0fc)

Decision changes: none

## Outcome

`Q1-002` passes the applicable Phase 1 browser resilience matrix. The production
PWA keeps an installed deep route usable offline, defers a newly deployed
service worker behind explicit user consent, and preserves the OPFS vault while
the worker changes. The same production suite proves durable refresh/crash
recovery, typed storage failures and quota states, and single-writer handoff to
a second tab.

The implementation uses the accepted Vite PWA/Workbox stack. It precaches the
local application shell, keeps the Workbox runtime inside the installed worker,
and does not call `skipWaiting` until the user selects **Update now**. The update
path reloads only after `controllerchange`; an ordinary controlled reload does
not display a false update prompt.

## Scenario matrix

| Required journey                 | Production proof                                                                                                                 | Result                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Offline use                      | Install and control the generated worker, navigate to `/pipeline?view=board`, set the browser offline, and reload the deep route | Passed; the local shell and route remain usable with zero external requests       |
| Refresh                          | Reload the durable browser vault after owner handoff                                                                             | Passed; committed SQLite/OPFS rows remain present                                 |
| Crash or abrupt owner loss       | Close the active owner page without a graceful release, let the contender acquire the writer lease, and reload                   | Passed; the contender takes ownership and durable content survives                |
| Storage denied                   | Exercise denied, errored, and unsupported persistence results without an implicit permission request                             | Passed; each result stays typed and offers an explicit recovery path              |
| Quota pressure                   | Exercise low and unknown quota observations                                                                                      | Passed; both states remain distinct and do not invent an exact capacity claim     |
| Second tab                       | Attempt a concurrent writer, receive typed `vault_busy`, close the owner, then retry                                             | Passed; the second writer is blocked before handoff and succeeds after owner loss |
| Service-worker update            | Change the generated worker bytes, detect the installed waiting worker, require explicit consent, activate, and reload           | Passed; no automatic update or reload occurs                                      |
| Vault preservation during update | Write an OPFS sentinel before the offline/update journey and read it after activation                                            | Passed; the sentinel value is unchanged                                           |

The resilience command runs three exact-browser specs together:
`phase-1-resilience.spec.mjs`, `storage-concurrency.spec.mjs`, and
`storage-failures.spec.mjs`. This prevents the hosted exact-Chrome lane from
proving only the service-worker portion while omitting the storage-failure and
second-tab cases.

## Reproducible local verification

Run with Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the reviewed lockfile:

| Command                          | Result                                                                                                                                                                                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Passed for all workspace projects with no lockfile change                                                                                                                                                                                                                  |
| `pnpm test:resilience`           | Passed 3/3 production-browser specs: offline/update/OPFS preservation, abrupt-owner-loss/second-tab coordination, and typed persistence/quota/failure recovery                                                                                                             |
| `pnpm test:app-shell`            | Passed 31/31 responsive, accessibility, route, local-state, and recovery-shell cases after the PWA notice was integrated                                                                                                                                                   |
| `pnpm verify`                    | Passed formatting, boundaries, foundation records, 22-package typecheck/lint/build, 59 unit files and 537 tests, coverage, every browser/native suite, schema/archive/secure-storage checks, JavaScript and Rust licenses, secret scans, dependency audits, and Changesets |

The local resilience result recorded:

- `explicitUpdateConsent: true`;
- `offlineDeepRouteReload: true`;
- `opfsPreserved: true`;
- `externalRequestCount: 0`;
- durable content after abrupt owner loss and reload;
- typed `vault_busy` before writer handoff; and
- denied/errored/unsupported persistence plus low/unknown quota recovery.

## Hosted exact-browser proof

[Foundation CI run `33301078089`](https://github.com/seabAu/Coredrill/actions/runs/33301078089)
executes commit `0bf32421f0d7f0a92f41dc1db23ccbb12672a0fc`. Its exact Chrome lanes run the
entire three-spec resilience command:

| Browser               |                                                                                           Job | Immutable artifact                                                                    |  Artifact ID | SHA-256                                                            |
| --------------------- | --------------------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------- | -----------: | ------------------------------------------------------------------ |
| Chrome 151.0.7922.138 | [`99229260731`](https://github.com/seabAu/Coredrill/actions/runs/33301078089/job/99229260731) | `coredrill-resilience-chrome-151.0.7922.138-0bf32421f0d7f0a92f41dc1db23ccbb12672a0fc` | `9728997334` | `c02f6229865c064446df0b349c1f43474d1bbebd9ef0c258c1732d9759a9dc14` |
| Chrome 152.0.7977.54  | [`99229260765`](https://github.com/seabAu/Coredrill/actions/runs/33301078089/job/99229260765) | `coredrill-resilience-chrome-152.0.7977.54-0bf32421f0d7f0a92f41dc1db23ccbb12672a0fc`  | `9728988004` | `74a9fa6dd6a270a5f442b5a0f8c5078ce18eefe416b7c0a43ce387bfbf045b6a` |

Both artifacts expire on 2026-09-29. This committed report, production test
suite, and deterministic fixtures remain reproducible after hosted retention
ends.

## Native and target boundaries

The desktop application packages production web assets into Tauri but does not
register a browser service worker. Service-worker install/update/offline-shell
behavior therefore applies to the browser/PWA surface, not the native surface.
The same hosted run separately executes the native SQLite repository manifest,
archive recovery, automatic backup, secure-storage, package-build, and startup
proof on Windows, macOS, and Ubuntu.

The exact Firefox 153/154 lanes execute the SQLite/OPFS lifecycle and repository
manifest. They do not execute the Chromium production-PWA resilience suite, so
this report does not mislabel them as service-worker evidence. Safari and the
physical iOS/Android PWA targets remain unavailable in the accepted reference
matrix and are not claimed here.

## Dependency and policy status

The reviewed direct addition is `vite-plugin-pwa` 1.3.0. The dependency
inventory advances to `JW-DI-001` version 1.19.0 with 49 direct dependencies,
935 audited npm resolutions (108 optional), zero known npm vulnerabilities, 520
reviewed JavaScript license records, and 498 reviewed Rust crate records. The
lockfile SHA-256 is
`42714099de4169b3baf084ccd799df31a83d5cc4cfb51ac16d9c5260a391324a`.

The Workbox build graph is comparatively large and is recorded as a maintenance
watch in the dependency inventory. It does not introduce a hosted account,
remote database, background surveillance, or runtime network dependency. No
Accepted decision changed, so no ADR is required.
