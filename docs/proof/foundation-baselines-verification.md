# Phase 0 dependency and reference-baseline verification

Date: 2026-08-24  
Scope: `FND-009` through `FND-010` only  
Branch: `main`  
Dependency review timestamp: `2026-08-24T04:52:20Z`  
Identity/license rebind: `2026-08-24`  
Reviewed lockfile SHA-256: `c3b3e6f7b1d2728a74e2c7dfbbca5e94445f8f3fbfad4ea89192728bb48f9a04`

## Outcome

| Item      | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FND-009` | Proven | [`JW-DI-001` v1.0.0](foundation-dependency-inventory.json) records all 10 selected direct npm dependencies and three pinned toolchains with exact versions, licenses, maintainer handles/organizations, official sources, compatibility rationale, maintenance watches, lockfile binding, and all-severity advisory results. [`check-foundation-records.mjs`](../../tooling/scripts/check-foundation-records.mjs) prevents silent manifest/toolchain/lock drift. |
| `FND-010` | Proven | [`JW-TM-001`](../testing/reference-test-matrix.md) (initial v1.0.0 baseline, current v1.2.0) and its [machine-readable record](../testing/reference-test-matrix.v1.json) define reference hardware, OS/browser, accessibility, responsive, privacy/offline, and performance targets while keeping planned, available, executed, and verified states distinct.                                                                                                    |

This proof established the initial reviewed baselines. `JW-TM-001` v1.2.0 now binds local diagnostic SQLite/browser and performance evidence plus green exact hosted Chrome/Firefox lifecycle lanes, while keeping Safari/mobile, full accessibility, and reference-hardware states explicit; see the [browser storage platform verification](browser-storage-platform-verification.md).

The identity/license follow-up renamed workspace-only package references from the predecessor scope to `@coredrill/*`, changing lockfile text but no selected dependency version or resolved external package graph. The inventory's three reviewed hash bindings were updated to the current lockfile, and the complete foundation gate revalidated the same 10 direct dependencies, 332 audited entries, and 299 license records. See the [follow-up proof](identity-license-hosting-verification.md).

## Dependency selection review

The inventory covers only adopted foundation tooling. React, Vite, Tauri, WXT, SQLite WASM, product UI libraries, scraping, AI, hosted services, and Python remain uninstalled/provisional.

- ESLint moved from `10.8.1` to current stable `10.9.0`, published more than 24 hours before review. Its Node range includes Node 24 and `typescript-eslint` accepts ESLint 10. [ESLint 10.9.0 release](https://github.com/eslint/eslint/releases/tag/v10.9.0)
- TypeScript remains `6.0.3`. Upstream `7.0.2` is newer, but `typescript-eslint@8.67.0` declares `typescript >=4.8.4 <6.1.0`; `6.0.3` is therefore the latest mutually compatible selection. [TypeScript 7.0.2 release](https://github.com/microsoft/TypeScript/releases/tag/v7.0.2)
- pnpm remains `11.22.0`. Version `11.23.0` was published at `2026-08-23T14:56:00Z` and was still inside the repository's 1,440-minute minimum release-age window at review time. The inventory schedules a re-query after eligibility. [pnpm 11.23.0 release](https://github.com/pnpm/pnpm/releases/tag/v11.23.0)
- Node `24.19.0` remains the current selected Krypton LTS line, while Rust `1.98.0` is the current stable channel. [Node release index](https://nodejs.org/dist/index.json), [Rust stable manifest](https://static.rust-lang.org/dist/channel-rust-stable.toml)
- `license-checker-rseidelsohn@5.0.1` stays as the current license gate, with a dated maintenance watch because it has two registry maintainers and a comparatively large Arborist subtree.

The final unfiltered `pnpm audit --json` query reported zero info, low, moderate, high, or critical advisories across 332 resolved dependencies, including 35 optional dependencies. The full resolved license policy accepted 299 package records; those counts intentionally differ because the audit and license tools report different graph scopes. [pnpm audit documentation](https://pnpm.io/cli/audit)

There is no `Cargo.toml` or `Cargo.lock`, so no Rust crate graph exists yet. Crate adoption must add Rust-specific advisory and supply-chain checks; the absence of crates is not represented as an audited Rust dependency graph.

## pnpm configuration correction

The review found that pnpm 11 reads only authentication/registry settings from `.npmrc`; other project settings belong in `pnpm-workspace.yaml`. The prior `.npmrc` values were therefore not active, and the lockfile recorded `autoInstallPeers: true`. [Current pnpm settings documentation](https://pnpm.io/settings)

The non-auth settings were migrated to `pnpm-workspace.yaml`, the obsolete `.npmrc` was removed, and the regenerated lockfile now records `autoInstallPeers: false`. The executable record check requires:

- `autoInstallPeers: false`;
- `engineStrict: true`;
- `minimumReleaseAge: 1440`;
- exact-save prefix;
- `strictDepBuilds: true`;
- `strictPeerDependencies: true`.

## Reference matrix review

`JW-TM-001` defines four reproducible required physical tiers: Intel Core i5-12400/Windows 11, Mac mini M1/macOS, iPhone 11/iOS, and Pixel 9/Android. It also defines a non-gating stress tier and an explicitly diagnostic local tier. The available workstation is Windows 10 Pro 22H2 build 19045 with Edge `151.0.4129.101` and Firefox `154.0`; because Windows 10 Home/Pro has left normal support, that host cannot satisfy the Windows 11 release/performance gate. No hostname, serial number, username, or other device identifier is recorded. [Windows 10 lifecycle](https://learn.microsoft.com/en-us/lifecycle/products/windows-10-home-and-pro)

The as-of desktop browser snapshot uses Chrome `152.0.7977.54`/`151.0.7922.138` in exact Chrome for Testing lanes, Edge `151.0.4129.101`/`150.0.4078.144`, Firefox `154.0`/`153.0`, and Safari `26.6.1` plus a historical `18.6` previous-major runner. Safari `26.6.1` is bound to Sequoia `15.7.9`; Safari `18.6` is bound to an isolated Sonoma `14.7.7` snapshot because Apple lists it for Sonoma/Ventura, not Tahoe. Tahoe `26.6.2` is retained for the desktop WebKit lane, whose result must record the actual bundled patch. The rolling current/N-1 rule controls future execution, and every result manifest must record the exact patch actually run. [Chrome for Testing milestone feed](https://googlechromelabs.github.io/chrome-for-testing/latest-versions-per-milestone-with-downloads.json), [Edge stable notes](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-relnote-stable-channel), [Firefox product details](https://product-details.mozilla.org/1.0/firefox_versions.json), [Apple security releases](https://support.apple.com/en-us/100100), [Safari 18.6 platform record](https://support.apple.com/en-us/124152)

The mobile lanes cover Safari/WebKit bundled with iOS `26.6.1` on iPhone 11 and Chrome `151.0.7922.83` on Android 17/Pixel 9. They require installed-PWA relaunch, offline local-vault work, OPFS/persistence, storage-pressure/eviction, share/import behavior, and explicit platform fallback evidence; responsive desktop emulation cannot substitute for this device evidence. Android accessibility evidence must also record the independently updated Android Accessibility Suite/TalkBack version. [iPhone 11 specifications](https://support.apple.com/en-us/111865), [Pixel 9 specifications](https://support.google.com/pixelphone/answer/7158570), [Android 17 release](https://developer.android.com/blog/posts/android-17-is-here), [Android 17 device guidance](https://developer.android.com/about/versions/17/get), [Chrome for Android update](https://chromereleases.googleblog.com/2026/08/chrome-for-android-update.html)

Accessibility coverage includes automated axe, keyboard-only journeys, NVDA with Chromium and Firefox, desktop and iOS VoiceOver, Android TalkBack, forced colors, reduced motion, screen magnification, 200% text resize, the separate 320-CSS-pixel reflow case, and five responsive viewports. WCAG 2.2 AA remains the normative target, and automated checks alone never establish conformance. [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [WCAG reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

The matrix carries the accepted design targets of p95 UI response under 150 ms, p95 warm usability under 2 seconds (method/budget still validated by the storage spike), median capture-to-reviewed-record under 120 seconds in usability tests, and zero unexpected network requests in installed core flows. Cold startup, storage operations, bundle size, memory, and data-size measurements remain record-only until their owning spikes set defensible budgets.

## Executable checks

`check-foundation-records.mjs` is offline and dependency-free. It enumerates every existing root/app/package manifest, excludes only `workspace:` links, requires a one-to-one direct-dependency inventory, validates toolchain pins and pnpm controls, binds both reviews to the lockfile SHA-256, and checks exact reference hardware, lifecycle states, hardware/OS references, browser families, required accessibility cases, and design budgets. Five mutation tests prove that dependency/lock drift, missing maintainer/advisory metadata, lost reflow coverage, promotion of the local diagnostic host, unreproducible hardware, dangling references, browser-family substitution, and a false pass on an unavailable environment are rejected.

## Verification results

All commands use Node `24.19.0` and pnpm `11.22.0`.

| Command                          | Exit | Result                                                                                         |
| -------------------------------- | ---: | ---------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` |    0 | Corrected lockfile installed 302 packages; supply-chain policy checked 332 entries.            |
| `pnpm format:check`              |    0 | All configured files matched Prettier.                                                         |
| `pnpm check:foundation-records`  |    0 | 10 direct dependencies, 3 toolchains, 16 execution targets, and 10 accessibility cases passed. |
| `pnpm check:policy`              |    0 | Boundary, foundation-record, license, and secret policy gates passed together.                 |
| `pnpm typecheck`                 |    0 | 21 tasks across all 19 package projects passed.                                                |
| `pnpm lint`                      |    0 | All 19 package tasks plus repository tooling passed with zero warnings.                        |
| `pnpm test:unit`                 |    0 | 3 files and 13 tests passed, including 5 foundation-record mutation tests.                     |
| `pnpm test:coverage`             |    0 | 93.87% statements, 85.89% branches, 100% functions, and 97.84% lines.                          |
| `pnpm build`                     |    0 | All 19 package builds passed.                                                                  |
| `pnpm check:licenses`            |    0 | 299 resolved package records passed the reviewed permissive-license policy.                    |
| `pnpm check:secrets`             |    0 | Tracked and unignored workspace files passed the secret-pattern scan.                          |
| `pnpm audit:dependencies`        |    0 | No low-or-higher known vulnerabilities were found.                                             |
| `pnpm changeset:status`          |    0 | The existing sample patch Changeset for application/contracts remained valid.                  |
| `pnpm verify`                    |    0 | The complete aggregate chain passed on the final implementation state.                         |

## Decision and scope review

No Accepted product or architecture decision changed, so no ADR was required. `JW-TM-001` is a test contract, not the supported OS/browser decision. The only design corrections in this slice make the existing five responsive ranges and WCAG 2.2 reflow target internally consistent.

No product feature, database, browser extension capability, scraper, AI integration, hosted service, or broad product dependency was added.

## Remaining actions

1. Independently close `FND-001` when the owner selects the public license and durable private security/conduct reporting route.
2. Independently close `FND-006` after a GitHub remote exists and the configured workflow has a green hosted URL.
3. Begin the next smallest coherent slice, `DOM-001` through `DOM-002`: foundational value objects plus semantic status categories and transition behavior.
