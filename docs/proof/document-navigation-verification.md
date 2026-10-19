# Save-before-navigation and editor reflow

Date: 2026-10-19. Slice: `Q3-005` editor/navigation integration; the complete canonical journey remains open.

## Findings

The sidebar Documents destination changed the URL while retaining the previous editor state. Other shell and history exits unmounted the editor without flushing its pending debounce timer. An older asynchronous document-load response could also reopen an editor after its route had been abandoned. Concurrent flush callers waiting on one in-flight autosave could start duplicate follow-up writes.

Hosted run [39234126552](https://github.com/seabAu/Coredrill/actions/runs/39234126552) at `18b908dd6d4f44b1bd865b9241f40783deea17a2` failed the aggregate and both Chrome jobs at the same copy-editor 320-pixel reflow assertion. Exact-version storage/recovery checks were not the failing boundary. A stronger local native-control font case reproduced an intrinsic-width failure: the history selector measured 449 pixels and widened the 320-pixel page to 478 pixels. The repair constrains the grid track and input/select boxes rather than shortening the version label, hiding overflow, or relaxing the assertion.

## Implementation

- The runtime owns one save-before-navigation gate. Shell navigation and search wait for the mounted editor's durable flush; rapid requests share one save and use the latest requested destination.
- Indexed local history metadata preserves existing Pipeline/Job context. A failed history exit returns to the committed entry without pushing a duplicate or discarding Forward entries. Legacy unindexed same-document entries restore the editor URL in place, preserving text and history length rather than claiming exact legacy traversal reconstruction.
- Fragment-only skip links do not remount or flush the editor. A pending failed restoration prevents a competing navigation from racing its corrective history traversal.
- The editor temporarily stops edits during a leave flush. Failure restores editing and focus, retains text, and exposes the existing retry. A before-unload handler requests the browser's warning only for pending, saving or failed local changes; it is not an asynchronous close-tab/crash durability guarantee.
- Successful route changes clear stale editor state. Generation-bound load responses cannot reopen an editor after navigation away.
- Autosave callers share one complete serialized latest-value drain, including edits queued while a write is in flight. Immutable version creation remains explicit.
- Editor labels use shrinkable grid tracks; inputs/selects are bounded by their container. Native dropdown choices and accessible labels retain their full version text.

## Evidence obtained

`tooling/tests/guarded-navigation.test.mjs` and `packages/documents/test/autosave.test.ts` pass 12 focused tests covering synchronous non-editor navigation, retained route context, held saves, latest-destination coalescing, failed Back/Forward preservation, repeated Back during failure, legacy entries, fragments, single-flight serialization and explicit retry.

The built-PWA copy and navigation journeys pass offline with no seeded document records and zero external requests. They cover a real manually created reusable document, held save before route change, one write during coalesced navigation, the actual browser before-unload warning with a dismissed Reload preserving text, failed Back preserving editor text and history length, repeated failed retry retaining text without an unhandled rejection, successful explicit retry, Forward/reload recovery, global-search navigation saving the draft, and ignored abandoned loads whose read has completed. The copy journey retains a strengthened wider-font 320-pixel assertion and screenshots for both document kinds. The retained resume-copy screenshot was visually reviewed: source/version text wraps, the native selector stays inside its panel, and the wide comparison remains in its named local scroll region.

The first real-unload test awaited the intentionally cancelled reload without a local timeout, exhausting the overall test deadline. Its retained page snapshot still contained the exact unsaved text. Bounding that expected-cancellation wait to five seconds makes the real warning/dismissal proof complete; no production warning or save behavior was weakened.

## Remaining boundary

`pnpm verify` completed with exit 0: all 33 typecheck tasks, lint, 126 files / 987 unit tests and coverage, builds, boundary/foundation records, UI/report/schema checks, five UI-foundation tests, 76 shell tests, diagnostic performance, eight resilience tests, seven onboarding tests, 13 document-browser tests, nine browser-storage tests, 13 native TypeScript tests, 11 Rust tests and the separate real secure-store/archive/backup harnesses passed. The final retry-error handler also received an independent passing ESLint check. Secret-pattern and npm/Rust license checks passed. npm reported no known vulnerabilities; Cargo retained the same ten reviewed warnings (nine unmaintained dependencies and the existing `glib` unsoundness warning).

Fresh clean-commit hosted verification remains pending. The failed `18b908d` run remains failure evidence, not a green CI claim; these local results do not replace the exact Chrome/Firefox and native hosted matrix.

No storage migration, dependency, permission, network destination or Accepted decision changes. The current schema remains 158. `Q3-005` still requires replacing seeded requirement/evidence/application/document setup in the separate complete journey and auditing normal-user tracker composition. Representative-user/manual assistive-technology gates remain independent.
