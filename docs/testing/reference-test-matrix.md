# Job Workspace reference test matrix

Matrix ID: `JW-TM-001`  
Version: `1.0.0`  
Effective: 2026-08-24  
Machine-readable authority: [`reference-test-matrix.v1.json`](reference-test-matrix.v1.json)

This matrix establishes Phase 0 test targets. A row is **not** a support promise or a passing test until a result manifest binds execution to the exact commit, lockfile, fixture set, hardware, OS, browser/webview, and assistive-technology versions. Public OS/browser support remains provisional until `STG-004` supplies execution evidence and `STG-008` records the decision.

## Hardware and platform targets

| ID               | Role                                         | Exact initial target                                                                                                                     | Current evidence                                              |
| ---------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `HW-WIN-REF`     | Primary web/desktop/performance gate         | Intel Core i5-12400, 8 GiB dual-channel DDR4-3200, Samsung 970 EVO Plus 500 GB, UHD 730, 1920×1080 at 100%, Windows 11 25H2, AC/Balanced | Planned; not executed                                         |
| `HW-MAC-REF`     | Safari/VoiceOver/macOS gate                  | Mac mini (M1, 2020), 8 GiB unified memory, 256 GB internal SSD, 1440×900 logical or higher, AC with Low Power Mode off                   | Unavailable; not executed                                     |
| `HW-IOS-REF`     | Installed iOS PWA/local-vault/share gate     | iPhone 11 (2019), 64 GB, A13 Bionic, 1792×828 display, iOS 26.6.1, battery ≥50% with Low Power Mode off                                  | Unavailable; not executed                                     |
| `HW-ANDROID-REF` | Installed Android PWA/local-vault/share gate | Google Pixel 9, 128 GB, Tensor G4, 12 GB RAM, 2424×1080 display, Android 17, battery ≥50% with Battery Saver off                         | Unavailable; not executed                                     |
| `HW-STRESS`      | Capacity investigation only                  | 8+ cores, 16+ GiB RAM, SSD                                                                                                               | Planned; never substitutes for reference performance          |
| `HW-LOCAL-DIAG`  | Fast local feedback                          | Windows 10 build 19045, Core Ultra 9 285K, 63.5 GiB RAM, Edge 151, Firefox 154                                                           | Available, diagnostic-only; Windows 10 is past normal support |

The required desktop web matrix is current and previous stable Chrome/Chromium (`152.0.7977.54`/`151`), Edge (`151.0.4129.101`/`150.0.4078.144`), Firefox (`154.0`/`153.0`), and Safari. Safari `26.6.1` is bound to macOS Sequoia `15.7.9`; the historical Safari `18.6` previous-major row is bound to an isolated macOS Sonoma `14.7.7` snapshot. macOS Tahoe `26.6.2` remains the current desktop/WebKit compatibility row, but its result must record the bundled Safari/WebKit patch instead of assuming `26.6.1`. Historical browser rows use an isolated profile, local origin, and synthetic data. If the Safari 18.6 runner cannot be provisioned, `STG-004` must record the exact limitation and manual or desktop fallback rather than reporting a pass.

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

## Performance, privacy, and offline budgets

| ID             | Measurement                                                    | Initial target                 | Status                                                        |
| -------------- | -------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------- |
| `PERF-UI`      | Common board/table/detail interactions excluding import and AI | p95 `< 150 ms` on `HW-WIN-REF` | Design target                                                 |
| `PERF-WARM`    | Installed PWA and desktop warm launch to usable local shell    | p95 `< 2,000 ms`               | Design target; exact method/budget validated by storage spike |
| `PERF-CAPTURE` | Capture-to-reviewed-record in representative usability tests   | median `< 120 s`               | Usability target                                              |
| `PERF-OFFLINE` | Unexpected requests during installed core flows                | `0`                            | Privacy/offline target                                        |

Interaction benchmarks discard five warmups and record at least 50 measured iterations; warm-start measurements use at least 20 runs. Reports include p50, p95, maximum, failure count, and raw measurements. Initial deterministic synthetic profiles contain 100 jobs (smoke), 2,000 jobs (reference), and 10,000 jobs (stress), with a recorded seed and fixture hash.

Cold startup, create/migrate/query/search, import/export/restore, bundle size, JavaScript heap/desktop RSS, and database/attachment size are record-only until their owning Phase 0 spike establishes a defensible budget.

## Versioning and review

- Patch: correct source or patch-version metadata without changing coverage or a budget.
- Minor: add a compatible target, scenario, or result field.
- Major: remove a target or change an OS/browser floor or performance budget; review the decision register and create an ADR if an Accepted decision changes.

Review the matrix when a browser major stabilizes, an OS branch enters/leaves servicing, SQLite/Tauri/WXT/accessibility tooling changes, a budget/support decision changes, or at least quarterly during Phase 0.

## Revision history

| Version | Date       | Change                                                                                                                                |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `1.0.0` | 2026-08-24 | Established reproducible desktop/mobile reference targets and explicitly separated planned, available, executed, and verified states. |
