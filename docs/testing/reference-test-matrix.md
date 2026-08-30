# Coredrill reference test matrix

Matrix ID: `JW-TM-001`  
Version: `1.2.0`
Effective: 2026-08-24  
Machine-readable authority: [`reference-test-matrix.v1.json`](reference-test-matrix.v1.json)

This matrix establishes Phase 0 test targets. A row is **not** a support promise or a passing test until a result manifest binds execution to the exact commit, lockfile, fixture set, hardware, OS, browser/webview, and assistive-technology versions. Accepted ADR-0003 supports current/previous Chromium-family and Firefox desktop generations after exact hosted lifecycle evidence; Safari/mobile and any other unavailable rows remain explicitly unsupported until their real required evidence passes.

## Hardware and platform targets

| ID               | Role                                         | Exact initial target                                                                                                                     | Current evidence                                                                                      |
| ---------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `HW-WIN-REF`     | Primary web/desktop/performance gate         | Intel Core i5-12400, 8 GiB dual-channel DDR4-3200, Samsung 970 EVO Plus 500 GB, UHD 730, 1920×1080 at 100%, Windows 11 25H2, AC/Balanced | Planned; not executed                                                                                 |
| `HW-MAC-REF`     | Safari/VoiceOver/macOS gate                  | Mac mini (M1, 2020), 8 GiB unified memory, 256 GB internal SSD, 1440×900 logical or higher, AC with Low Power Mode off                   | Unavailable; not executed                                                                             |
| `HW-IOS-REF`     | Installed iOS PWA/local-vault/share gate     | iPhone 11 (2019), 64 GB, A13 Bionic, 1792×828 display, iOS 26.6.1, battery ≥50% with Low Power Mode off                                  | Unavailable; not executed                                                                             |
| `HW-ANDROID-REF` | Installed Android PWA/local-vault/share gate | Google Pixel 9, 128 GB, Tensor G4, 12 GB RAM, 2424×1080 display, Android 17, battery ≥50% with Battery Saver off                         | Unavailable; not executed                                                                             |
| `HW-STRESS`      | Capacity investigation only                  | 8+ cores, 16+ GiB RAM, SSD                                                                                                               | Planned; never substitutes for reference performance                                                  |
| `HW-LOCAL-DIAG`  | Fast local feedback                          | Windows 10 build 19045, Core Ultra 9 285K, 63.5 GiB RAM, Edge 151, Firefox 154                                                           | Edge/Firefox storage and diagnostic benchmarks passed; never substitutes for a release/reference gate |

The required desktop web matrix is current and previous stable Chrome/Chromium (`152.0.7977.54`/`151.0.7922.138` in the exact Chrome for Testing lanes), Edge (`151.0.4129.101`/`150.0.4078.144`), Firefox (`154.0`/`153.0`), and Safari. Safari `26.6.1` is bound to macOS Sequoia `15.7.9`; the historical Safari `18.6` previous-major row is bound to an isolated macOS Sonoma `14.7.7` snapshot. macOS Tahoe `26.6.2` remains the current desktop/WebKit compatibility row, but its result must record the bundled Safari/WebKit patch instead of assuming `26.6.1`. Historical browser rows use an isolated profile, local origin, and synthetic data. If the Safari 18.6 runner cannot be provisioned, `STG-004` must record the exact limitation and manual or desktop fallback rather than reporting a pass.

The mobile matrix uses Safari/WebKit bundled with iOS `26.6.1` on the iPhone 11 reference and Chrome `151.0.7922.83` on Android 17/Pixel 9. Both rows must exercise installation/relaunch, offline local-vault flows, OPFS capability and persistence, storage pressure/eviction without silent loss, and share/import behavior with a documented fallback when a platform does not offer a Web Share Target. Desktop viewport emulation cannot satisfy these rows.

Desktop targets are Tauri/WebView2 on Windows 11 25H2, Tauri/WebKit on macOS Tahoe 26.6.2 with its actual bundled WebKit patch recorded, and a secondary Tauri/WebKitGTK lane on Ubuntu 26.04 LTS. Extension targets cover current Chrome/Edge and the current Firefox fallback using only the approved `activeTab`, bounded-outbox, and explicit-transfer design.

## Accessibility matrix

WCAG 2.2 AA is the normative target. Automated checks never establish conformance by themselves.

- Automated axe checks on every implemented core route, state, theme, and density.
- Keyboard-only canonical journeys, non-drag status movement, focus restoration, dialogs, errors, and shortcuts.
- NVDA 2026.1.1 with current Edge/Chromium and current Firefox on the Windows reference lane.
- VoiceOver with Safari 26.6.1 on the macOS Sequoia reference lane.
- iOS VoiceOver and Android TalkBack across installed-PWA navigation, editing, offline, and share/import scenarios; Android results record the exact Android Accessibility Suite/TalkBack version.
- Windows forced colors/high contrast, reduced motion, screen magnification, browser text resize to 200%, and the separate 320-CSS-pixel reflow case (approximately 400% zoom at a 1280 CSS-pixel viewport).
- Five responsive checkpoints: `360×800`, `768×1024`, `1024×768`, `1440×900`, and `1920×1080`.

The available Phase 1 automation passes `A11Y-AXE`, `A11Y-REFLOW`, and
`A11Y-RESPONSIVE` locally and in the exact Chrome 151/152 lanes; see the
[Phase 1 accessibility verification report](../proof/phase-1-accessibility-verification.md).
Manual keyboard, assistive-technology, screen-magnification, and 200% text-
resize obligations remain `not-executed` and are not represented as
conformance.

## Performance, privacy, and offline budgets

| ID             | Measurement                                                    | Initial target                 | Status                                                            |
| -------------- | -------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| `PERF-UI`      | Common board/table/detail interactions excluding import and AI | p95 `< 150 ms` on `HW-WIN-REF` | Diagnostic harness passes; required reference target not executed |
| `PERF-WARM`    | Installed PWA and desktop warm launch to usable local shell    | p95 `< 2,000 ms`               | Diagnostic harness passes; required reference target not executed |
| `PERF-CAPTURE` | Capture-to-reviewed-record in representative usability tests   | median `< 120 s`               | Usability target                                                  |
| `PERF-OFFLINE` | Unexpected requests during installed core flows                | `0`                            | Privacy/offline target                                            |

Interaction benchmarks discard five warmups and record at least 50 measured iterations; warm-start measurements use at least 20 runs. Reports include p50, p95, maximum, failure count, and raw measurements. Initial deterministic synthetic profiles contain 100 jobs (smoke), 2,000 jobs (reference), and 10,000 jobs (stress), with a recorded seed and fixture hash.

The `Q1-001` production-build harness and its clean-commit Edge 152 local diagnostic are recorded in [the Phase 1 reference-data performance report](../proof/phase-1-reference-data-performance-verification.md). The 2,000-job diagnostic measured p95 values of 47.4 ms for warm shell startup, 2.7 ms for production FTS5 query, 23.5 ms for board projection, and 26.5 ms for table projection, all with zero failures. `HW-LOCAL-DIAG`/Windows 10 is not `HW-WIN-REF`/Windows 11 25H2, so these figures do not satisfy the required performance gate and `Q1-001` remains open.

Cold startup, create/migrate/query/search, import/export/restore, bundle size, JavaScript heap/desktop RSS, and database/attachment size are record-only until their owning Phase 0 spike establishes a defensible budget.

## Browser-storage execution evidence

The accepted `STG-004`–`STG-008` evidence is recorded in [the platform verification report](../proof/browser-storage-platform-verification.md). Local diagnostic execution passes Edge `151.0.4129.101` and real branded Firefox `154.0`; the clean-commit 100/2,000/10,000-record Edge measurements are in [`storage-benchmark-edge-151.json`](../proof/artifacts/storage-benchmark-edge-151.json). Exact hosted Chrome `152.0.7977.54`/`151.0.7922.138` and Firefox `154.0`/`153.0` lifecycle jobs passed in [Foundation CI run 32712600336](https://github.com/seabAu/Coredrill/actions/runs/32712600336).

Safari/macOS and both physical mobile rows remain unavailable and unexecuted. Playwright WebKit or viewport emulation does not satisfy them. Accepted ADR-0003 therefore defines an explicit unsupported fallback: block browser-vault creation and direct the user to a supported Chromium/Firefox desktop browser or the future native app with portable export/restore. No IndexedDB, memory, or simulated-Safari pass substitutes for SQLite/OPFS evidence.

## Versioning and review

- Patch: correct source or patch-version metadata without changing coverage or a budget.
- Minor: add a compatible target, scenario, or result field.
- Major: remove a target or change an OS/browser floor or performance budget; review the decision register and create an ADR if an Accepted decision changes.

Review the matrix when a browser major stabilizes, an OS branch enters/leaves servicing, SQLite/Tauri/WXT/accessibility tooling changes, a budget/support decision changes, or at least quarterly during Phase 0.

## Revision history

| Version | Date       | Change                                                                                                                                                  |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1.2.0` | 2026-08-24 | Bound clean diagnostic benchmarks and green exact hosted Chrome/Firefox results; recorded the accepted support floor and unavailable-platform fallback. |
| `1.1.0` | 2026-08-24 | Bound local Edge/Firefox storage execution and diagnostic benchmark evidence; recorded exact pending hosted lanes and Safari/mobile fallback.           |
| `1.0.0` | 2026-08-24 | Established reproducible desktop/mobile reference targets and explicitly separated planned, available, executed, and verified states.                   |
