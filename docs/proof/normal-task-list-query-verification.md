# Normal task list — bounded query prerequisite

Date: 2026-10-20. Checklist: `INT-005`, **not complete**.

## Scope and guarantees

`ListJobNextActionsQuery` and its concrete SQLite adapter read 1–100 task records per page (default 50), newest `createdAt` first and task ID ascending for ties. All pending/completed/dismissed records remain readable; a list is not a replacement for retained history. The DTO contains the current viewed job revision and each task's row version so later completion controls can retain the original context.

Cursors bind job, explicit archive-read scope, job revision and exact anchor ID/creation instant/task version. Managed task creation, completion and creation-undo advance the job revision; a changed revision invalidates pagination instead of rebasing. The anchor is resolved again under the same read transaction. This is a current mutable-record view, not a claim of immutable historical snapshots. Raw out-of-contract SQL mutation is used only for deliberate corruption fixtures, not as a supported writer.

The application boundary validates IDs, page limits, cursor context, every task record's state/schedule/audit coherence, ordering/duplicates and exact continuation cursor. Returned requests, cursors, arrays and task records are immutable copies. Unknown errors are redacted. The adapter selects explicit bounded fields, binds all values, rechecks job/application/interaction ownership, and performs no writes. Missing/out-of-scope jobs are distinguished from empty task lists.

No dependency, schema, permission, Accepted decision or scheduling-converter change. This does not compose the query into the normal runtime/UI, implement task dismissal/rescheduling/reminder lifecycle, or close `INT-005`. ADR-0009 stays Proposed. Full UI and performance/release gates remain independent.

Existing task indexing covers pending due-time access, not this all-state job/creation-order list. Bounded page transport alone does not prove large-vault query latency or bounded database execution; measure the task-list workload and review its query plan/index needs before closing normal lifecycle/performance gates. No performance result is inferred from the small correctness fixtures.

## Focused evidence

- `test-results/task-list-query-first.log`: 30 application cases pass for bounds/context, DTO integrity, pending/completed/dismissed states, null schedule pairs, malformed history, private-error redaction and cursor integrity.
- `test-results/task-list-query-shared-first.log`: 45 application/shared SQLite cases pass. The shared scheduling contract reads one-row pages, deterministic tied tasks, scheduled/unscheduled records and completed history; rejects a forged missing anchor; preserves exact job/action/reminder/undo snapshots on reads; invalidates an old cursor after real completion; and enforces explicit archive-read scope.
- `test-results/task-list-query-typecheck.log`: all 35 workspace typecheck tasks pass. Strict changed-source lint passes.
- `test-results/task-list-query-ownership-history.log`: retained failed fixture used application-level `tokenId` instead of the storage helper's `id`; it did not prove query failure. The correction retains all assertions.
- `test-results/task-list-query-ownership-history-final.log`: 45 focused cases pass including a second real job, no cross-job record/cursor reuse, deliberately foreign application-link rejection without writes, and a real creation-undo's retained dismissed task. The subsequent typecheck catches a nullable fixture stage; explicitly naming the same Saved stage for its other job/application repairs that fixture without weakening product types.
- `test-results/task-list-query-corrected-typecheck.log` and `test-results/task-list-query-final-focused.log`: all 35 typecheck tasks and 45 focused cases pass after the fixture correction.
- `test-results/task-list-query-expanded-focused.log`: all 48 focused cases pass, additionally proving frozen caller-cursor copying, deterministic tie ordering, changed-view rejection and stored UTC/IANA readback without clock conversion.
- `test-results/task-list-query-native.log` / `test-results/task-list-query-browser.log`: 14 actual native-adapter cases plus Rust core and all nine browser-storage cases pass terminal `TASK_LIST_ADAPTERS_EXIT=0`, including the identical shared query contract. One separate secure-store case is intentionally ignored in the core invocation; it is not claimed as executed there.

A final shared assertion also rejects a wrong anchor row version; complete final-source verification must cover this later test addition before handoff. No test timeout, assertion, data ownership rule or policy is relaxed. Source-navigation service initialization failed during optional semantic inspection; ordinary allowed file tools and executable checks continue without modifying that service.

## Outstanding

Fresh full final-source verification, separate extension regression and exact hosted proof remain. Completion/security checkpoint `a5851c1` / run `39536020133` is separately under observation and does not verify these uncommitted query sources. Normal task-list/completion UI, lifecycle reminder consistency and required human/manual/release gates remain unfinished.

## Scale/query-plan diagnostic

An ignored local Node 24.19.0 in-memory SQLite script applies all 158 migrations and seeds 100 synthetic jobs / 10,000 tasks, with 5,000 owned tasks paged through the actual application query/adapter. Every page is checked for unique owned identities, and both adapter writes and SQLite durable-change delta remain zero. This is not reference browser/native device performance or a release benchmark.

- Current production SQL/indexes: `test-results/task-list-scale-diagnostic.log` reports `SCAN n` and temporary B-tree ordering. Fifty 100-row pages take 474.64 ms total, first/p95 13.04 ms and max 14.14 ms in this single diagnostic run.
- Isolated scratch `(job_id, created_at DESC, id ASC)` index: `test-results/task-list-scale-candidate-index.log` reports indexed job search with no temporary sort; total 308.63 ms, p95 9.55 ms. This index is not installed in product migrations.
- Scratch index plus equivalent explicit creation-time range bound: `test-results/task-list-scale-candidate-range.log` reports cursor seek by `job_id` and `created_at`, still 5,000 unique records and no writes; total 299.96 ms, database-read portion 22.88 ms, p95 9.42 ms. This predicate is not substituted into production SQL here. Single-run timings are diagnostic, not a statistically proven speedup or proof of browser latency.

Follow-through must adopt/review a proper migration and range predicate, prove tied-key pagination and old-vault recovery across browser/native, and measure supported runtime workloads before closing lifecycle/performance gates. The current correctness prerequisite does not silently declare that work complete.

## Full local checkpoint

Complete final-source `pnpm verify` passes terminal `TASK_LIST_VERIFY_EXIT=0` in `test-results/task-list-query-full-verify.log`, including the final anchor-row-version assertion: 162 files / 1,650 unit tests plus coverage, 35 typecheck tasks and full lint/build/browser/native/recovery/schema/license/secret/audit/Changesets gates. Separate extension/final policy and exact hosted proof remain; no normal UI or indexed scale claim is made.

All nine separate extension cases pass terminal `TASK_LIST_EXTENSION_EXIT=0` in `test-results/task-list-query-extension.log`. Full verification includes all 34 resilience cases, 14 actual native-adapter cases and existing recovery/security gates; npm audit reports no known vulnerabilities and Cargo retains ten reviewed allowed warnings. Only documentation follows these source gates. Final policy and exact hosted proof remain; index/range migration and normal UI remain explicit follow-through.

Final whole-repository formatting and policy pass terminal `TASK_LIST_POLICY_EXIT=0` in `test-results/task-list-query-final-policy.log`: 19 boundaries, 51 direct dependencies / three toolchains / 16 targets / ten accessibility cases, 520 npm / 498 Cargo licenses and secret scan. `git diff --check` is clean. Only result/preceding-checkpoint documentation follows these gates; exact hosted query proof remains separate.
