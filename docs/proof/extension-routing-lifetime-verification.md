# Extension test forwarding lifetime

Date: 2026-10-19. Scope: verification repair during `Q3-005`; no product feature or gate is closed by this alone.

## Findings

Hosted run `39237755795` failed forwarding `portable-archive-proof.ts` during the canonical capture journey. Run `39240572656` repeated `route.fetch: socket hang up` in the persistent-profile transfer journey while forwarding the local migration `0038_document_kind_update_guard.sql?import&raw`. Both runs also reported a forwarding callback still running while its page/context was closed. The failed test differed and each run's other six extension tests passed. This is retained failure evidence, not a green transfer claim or grounds to ignore future resets.

The two consumers duplicated the virtual HTTPS-to-local-dev-server bridge and closed pages/contexts without draining their handlers. The diagnostic page close and all persistent-profile restart/final teardown paths now share an explicit routing lifetime helper. It removes the context's test routes with `behavior: wait` before closing the owning page or request context; a page-only close reinstalls the same exact app-origin bridge for the next page. Context close is idempotent, so a failed relaunch cannot double-dispose the previous context in `finally`. The origin, asset path/query, response and transfer assertions remain unchanged.

The API is present in the installed Playwright core `1.61.1` declarations. Its wait-versus-ignore semantics were checked against the [official BrowserContext reference](https://playwright.dev/docs/api/class-browsercontext#browser-context-unroute-all). No `ignoreErrors`, fetch retry, source permission, service-worker setting, product timeout or security assertion was introduced or weakened. Genuine forwarding failures still propagate. This repairs a demonstrated teardown race; clean hosted runs remain necessary to determine whether any independent reset cause remains.

## Executable proof

- Two deterministic lifetime tests failed against the original immediate-close behavior and passed after the drain barrier. The focused suite also checks exact asset-path/query/response forwarding without retries, genuine fetch-failure propagation, idempotent context closure, and bridge reinstallation after page close.
- Two actual Chromium fixtures create an owned loopback HTTP server, deliberately hold a forwarded response, initiate page or context teardown, and observe that neither closes before the held response completes. The page-only case then opens the next virtual-origin page through the reinstalled bridge. They emit `EXT_ROUTING_DRAIN_PROOF`. The 100-ms fault window holds a known response; it is not an application-readiness sleep, and the page-evaluation cancellation after intentional page closure is distinguished from a failed forwarding handler.
- The complete nine-test extension suite passed locally, retaining the actual packaged-extension canonical capture/review/correction, durable SQLite-before-ack, two complete profile restarts, exact replay/deduplication, hostile-page/huge-page and Firefox checksummed fallback assertions.

## Remaining verification

The complete extension suite also passed with `--repeat-each=2`: 18 tests passed with zero unexpected or flaky results, including both held-response cases in both repetitions. The final four-test unit report is retained at `test-results/hosted-app-routing-unit.json`; repeated browser results are in `test-results/extension-transfer.json`.

Full local `pnpm verify` passed with exit 0: formatting, boundaries, foundation records, typecheck, lint, unit/coverage, builds, report/schema checks, extension package inspection, all browser suites, shared browser/native storage contracts, real secure-store/archive/backup harnesses, licenses, secrets and dependency policy. npm has zero known vulnerabilities; Cargo retains the same ten reviewed warnings. Fresh clean-commit hosted verification of this helper remains pending. Existing `39241911597` extension success predates this repair and is baseline evidence only. No runtime application, dependency, schema, connector, permission, data destination or Accepted decision changes. No runtime Changeset is required for test-only maintenance. The unseeded Phase 3 journey, explicitly user-named Applied-stage creation, tracker composition, human research and manual/reference-device gates remain separate work.
