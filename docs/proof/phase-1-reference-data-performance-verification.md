# Phase 1 reference-data performance verification

Date: 2026-08-30

Checklist scope: `Q1-001`

Implementation commit: [`1004ccdc2aa1cf96cd6eec655642d5ee4e48302b`](https://github.com/seabAu/Coredrill/commit/1004ccdc2aa1cf96cd6eec655642d5ee4e48302b)

Decision changes: none

## Outcome

Coredrill now has a production-build benchmark for the accepted deterministic `DATA-REFERENCE` profile of 2,000 wholly synthetic jobs. It measures durable SQLite startup, production FTS5 query, board projection, table projection, and warm local-shell startup with the reviewed warmup, sample-count, summary, raw-measurement, environment-binding, and fail-closed report rules.

The clean-commit local diagnostic run passed every current design threshold with zero failures. It does **not** close `Q1-001`: the accepted `PERF-UI` and `PERF-WARM` release claim requires `HW-WIN-REF` on `OS-WIN11-25H2`, while this execution used the faster `HW-LOCAL-DIAG` Windows 10 workstation. No budget adjustment has been requested or approved.

## Clean-commit diagnostic result

The complete raw result is [`phase-1-performance-edge-152-local-diagnostic.json`](artifacts/phase-1-performance-edge-152-local-diagnostic.json). It is bound to implementation commit `1004ccdc2aa1cf96cd6eec655642d5ee4e48302b`, a clean starting worktree, pnpm lockfile SHA-256 `47401aa17fea0b0b54176831669e02fc601658970442321a98a2437f5f2aca9b`, Edge `152.0.4191.53`, `HW-LOCAL-DIAG`, `OS-WIN10-LOCAL`, and reviewer `Codex`.

| Measurement                   | Samples after warmup |     p50 |     p95 | Maximum | Failures | Design comparison                                |
| ----------------------------- | -------------------: | ------: | ------: | ------: | -------: | ------------------------------------------------ |
| Warm shell to usable local UI |                   20 | 36.2 ms | 47.4 ms | 47.6 ms |        0 | Diagnostic pass against `PERF-WARM` `< 2,000 ms` |
| Production FTS5 query         |                   50 |  1.7 ms |  2.7 ms |  7.9 ms |        0 | Diagnostic pass against `PERF-UI` `< 150 ms`     |
| Board projection              |                   50 | 22.1 ms | 23.5 ms | 27.7 ms |        0 | Diagnostic pass against `PERF-UI` `< 150 ms`     |
| Table projection              |                   50 | 16.7 ms | 26.5 ms | 27.8 ms |        0 | Diagnostic pass against `PERF-UI` `< 150 ms`     |
| Durable SQLite reopen         |                   20 | 75.8 ms | 80.4 ms | 81.3 ms |        0 | Record-only supporting startup measurement       |

## Fixture and measurement contract

- The existing `JW-STG-DATA-001` fixture supplies profile `DATA-REFERENCE`, seed `coredrill-storage-benchmark-v1`, 2,000 records, definition SHA-256 `401c293d29dbb4002ecdbc5030e5dd242f42a678896cedfc97c00f999f57435d`, and generated content SHA-256 `7b05296a57408ce51689ed37cbcc2bfe8c3fc16ffdd621546ec66db41af01ad0`.
- The app-shell fixture exposes exactly 2,000 board jobs and 2,000 table jobs. Both presentations retain their production windowing behavior.
- Interaction measurements discard five warmups and retain 50 samples. Startup discards five warmups and retains 20 samples.
- Board and table timings begin at the real presentation-control click and end after the requested React presentation commits plus two animation frames.
- Shell startup uses the production Vite bundle and ends after the local shell catalog and visible page title commit plus two animation frames.
- The report includes p50, p95, maximum, raw measurements, failure counts, browser, viewport, fixture hashes, commit, lockfile, target IDs, and reviewer.
- Persisted reports reject dirty or unbound runs. A report cannot declare `targetConformant: true` unless its hardware and OS IDs are exactly `HW-WIN-REF` and `OS-WIN11-25H2`; a conformant budget miss fails the test.

## Reproducible verification

| Command                                              | Result                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:performance`                              | Passed the production-build diagnostic with 20 startup samples and 50 query/board/table samples.                                                                                                                                                                                                           |
| `pnpm test:app-shell`                                | Passed all 31 existing responsive, accessible, and local-only shell journeys after adding the 2,000-job reference board fixture.                                                                                                                                                                           |
| `pnpm typecheck`                                     | Passed all 22 packages.                                                                                                                                                                                                                                                                                    |
| `pnpm lint` plus direct lint of the benchmark/config | Passed with zero warnings.                                                                                                                                                                                                                                                                                 |
| Repository `pnpm verify`                             | Passed with exit code 0, including formatting, boundaries, governance records, 537 unit tests, coverage, all 22 builds, all browser suites, the new performance suite, browser/native recovery, secure storage, schemas, licenses, secrets, and dependency audits.                                         |
| Hosted Foundation CI                                 | [Run `33299846758`](https://github.com/seabAu/Coredrill/actions/runs/33299846758) passed every required job. The [aggregate Ubuntu job](https://github.com/seabAu/Coredrill/actions/runs/33299846758/job/99225791665) ran `pnpm verify`, including the production benchmark as a non-reference diagnostic. |

The exact Chrome 151 and Chrome 152 compatibility lanes in that run executed the storage, repository, document, UI, app-shell, and onboarding suites; they did not execute the new performance spec. Neither those lanes nor the aggregate Ubuntu runner is represented as `HW-WIN-REF` evidence.

## Remaining acceptance action

Provision the exact `HW-WIN-REF` machine defined in `docs/testing/reference-test-matrix.v1.json`, run the same production benchmark on Windows 11 25H2 with the reviewed power/display controls and conformant environment bindings, review the raw artifact, and check `Q1-001` only if all accepted comparisons pass. If a comparison fails, retain the failure evidence and seek an explicit documented budget adjustment rather than weakening the test silently.

This external target does not block implementation of the independent `Q1-002` offline and failure-journey matrix.
