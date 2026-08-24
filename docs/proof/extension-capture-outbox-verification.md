# Phase 0 least-privilege extension capture verification

Date: 2026-08-24
Scope: `EXT-001` through `EXT-003` only
Branch: `main`

## Outcome

| Item      | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXT-001` | Proven | WXT `0.21.4` builds one Chromium Manifest V3 service worker plus `popup.html` and `sidepanel.html`. The production-build inspector requires the exact manifest shape, entrypoints, self-only CSP, no remote executable assets, and the reviewed permission set. The hosted workflow retains the inspected directory as an immutable commit-named artifact.                                                                 |
| `EXT-002` | Proven | The synthetic JobPosting fixture invokes the exact function passed to `browser.scripting.executeScript`, then validates title, company, source URL, canonical URL, and selected visible text. Accessors that throw on cookie or form reads remain untouched. Capture can begin only through a trusted extension-page message and an `activeTab`/`scripting` call; there is no installed content script or host permission. |
| `EXT-003` | Proven | Shared tests build a strict `CaptureEnvelopeV1`, retain field-level JSON-LD/selector provenance, compute a semantic SHA-256 content hash, and queue an independently checksummed envelope. The outbox rejects corruption, duplicates, expired input, invalid state, a 32-item overflow, and a 6 MiB overflow without evicting unexpired captures.                                                                          |

## Hosted clean-commit proof

Implementation commit `ce118c15df9e31601817023b2dec87688b9f1d84` completed [Foundation CI run 32753181965](https://github.com/seabAu/Coredrill/actions/runs/32753181965). The [quality job](https://github.com/seabAu/Coredrill/actions/runs/32753181965/job/97514649511) passed the full aggregate gate and uploaded artifact [`coredrill-chromium-extension-ce118c15df9e31601817023b2dec87688b9f1d84`](https://github.com/seabAu/Coredrill/actions/runs/32753181965/artifacts/9530070651). GitHub records artifact ID `9530070651`, 387,056 bytes, archive digest `sha256:f2ef2c7368dd830e21f96c8550b0cc402af785852a05d8168474e8ac2e9e21bf`, and expiry at `2026-09-23T16:58:16Z`.

The artifact was downloaded into an isolated temporary directory and inspected again. All manifest, permission, CSP, entrypoint, remote-code, and executable-code assertions passed. Its eight file paths, byte lengths, and SHA-256 hashes match the final local output exactly. The machine-readable [hosted build manifest](artifacts/extension-chromium-build.json) binds those records to the implementation SHA and lockfile hash.

The first workflow attempt's independent Windows package lane reached installed startup but exceeded its previous 15-second discarded cold-warmup ceiling. The same immutable commit's [failed-job retry](https://github.com/seabAu/Coredrill/actions/runs/32753181965/job/97518283233) passed all contracts, package build, 25-launch lifecycle, resource proof, and artifact upload, leaving the workflow successful on attempt 2. The next proof commit hardens only that discarded first warmup to 30 seconds; the remaining warmups and all 20 measured launches retain the 15-second ceiling. This does not alter the extension artifact or its byte-for-byte comparison.

## Reviewed extension boundary

The source manifest requests only `activeTab`, `scripting`, and `storage`. WXT adds the `sidePanel` permission because a side-panel entrypoint exists. The inspected production manifest has:

- Manifest V3;
- permissions `activeTab`, `scripting`, `sidePanel`, and `storage` only;
- empty `host_permissions`, `optional_permissions`, and `optional_host_permissions`;
- `incognito: not_allowed`;
- no `content_scripts`, `externally_connectable`, or `web_accessible_resources` entry;
- `script-src 'self'; object-src 'self';` for extension pages;
- a popup fallback, Chromium side panel, and one service worker.

The privileged worker accepts exact versioned request shapes only from an extension page whose sender ID matches the running extension. It serializes outbox mutations so concurrent requests cannot reuse a sequence number. Corrupt stored state is preserved and reported rather than overwritten. No page can use the worker as a fetch proxy, and the extension contains no application vault adapter, AI/provider key, account dependency, crawling loop, navigation listener, or auto-submit capability.

## Capture fixture and envelope proof

[`job-posting.capture.json`](../../apps/extension/test/fixtures/job-posting.capture.json) is synthetic and contains no retained third-party content. The user-invoked capture function reads bounded JobPosting JSON-LD, the visible `h1`/company fallback when needed, the canonical link, `document.title`, and the current visible selection. It does not read cookies, forms, browsing history, authentication headers, hidden tokens, or arbitrary JavaScript state. Malformed or oversized JSON-LD blocks are ignored before crossing the boundary.

`capture-core` then revalidates the snapshot with an exact property allowlist, HTTP(S)-only credential-free URLs, a 64 KiB selected-text limit, at most 64 JSON-LD items, and bounded JSON depth/node count. It creates UUIDv7 envelope/candidate IDs, an 18-byte base64url nonce, a monotonic extension sequence, seven-day expiry, title/company field candidates, and pointers back to the captured evidence. The final existing `CaptureEnvelopeV1` schema and 2 MiB encoded limit are applied before persistence.

The semantic content hash deliberately excludes random IDs, nonce, capture time, and sequence so two captures of unchanged evidence deduplicate. The outbox adds a separate SHA-256 checksum over the complete canonical envelope, revalidates every item on read, and checks the recorded envelope byte count and expiry against the envelope itself.

## Dependency review correction

The first release-age candidate, WXT `0.20.27`, built successfully but failed the unfiltered advisory audit because its unused `web-ext-run` subtree retained critical/high advisories. The same audit also surfaced a new low advisory in esbuild `0.27.7`, which the previously selected Vite `8.1.0` graph retained. Neither finding was suppressed.

The final exact graph selects current WXT `0.21.4` and Vite `8.2.2`. WXT `0.21.4` removes the obsolete runner subtree, and Vite `8.2.2` removes the affected esbuild dependency. React/React DOM `19.2.7` and the selected type packages remain outside the 60-day window. The final unfiltered audit covers 459 entries and reports zero findings at every severity; the license policy accepts all 348 npm package records and 498 Cargo registry crates. [`JW-DI-001` v1.9.0](foundation-dependency-inventory.json) records the exact versions, maintainers, licenses, sources, lockfile binding, security rationale, and dated review watches.

## Local verification

All commands use Node `24.19.0` and pnpm `11.22.0`.

| Check                             | Result                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen install                    | Exact lockfile installs without build-script exceptions.                                                                                     |
| WXT production build              | Chromium MV3 build succeeds with eight files and approximately 385 kB total output.                                                          |
| Production build inspector        | Exact permissions/entrypoints/CSP pass; remote assets, content scripts, external connections, `eval`, and remote `importScripts` are absent. |
| Focused unit/fixture tests        | 3 files and 16 tests pass.                                                                                                                   |
| Complete unit suite with coverage | 22 files and 126 tests pass; 95.05% statements, 87.31% branches, 98.38% functions, and 96.03% lines.                                         |
| Foundation dependency record      | 24 direct dependencies, 3 toolchains, 16 execution targets, and 10 accessibility cases pass.                                                 |
| Advisory audit                    | 0 info, low, moderate, high, or critical findings across 459 entries.                                                                        |
| License policy                    | 348 npm records and 498 Cargo registry crates pass.                                                                                          |

The complete aggregate repository gate also passes: 28 type/build prerequisite tasks, 22 lint tasks, 22 builds, four real Edge browser-storage E2Es, nine TypeScript-to-native SQLite cases, six Rust unit cases with the one deliberate real-secret test ignored, Windows Credential Manager and archive proof harnesses, schema drift, both license policies, secret scanning, npm/RustSec audit, and Changesets status. The existing 14 unmaintained and one unsound Linux GTK-path RustSec warnings remain explicit under accepted native decision `D-022`; no npm advisory remains. The final rerun below includes the added fail-closed oversized-selection case.

## Decision status and remaining extension work

This slice implemented accepted `D-032` without changing it. At this partial gate, `D-023` remained Provisional and `Q-005` remained open because the evidence proved only the Chromium shell, user-action capture, and local outbox. Subsequent `EXT-004` through `EXT-008` completed transfer/acknowledgement, Firefox fallback, hostile-input, package, and architecture proof; [ADR-0005](../adr/0005-adopt-wxt-multisurface-extension-baseline.md) now accepts `D-023` and resolves `Q-005`.
