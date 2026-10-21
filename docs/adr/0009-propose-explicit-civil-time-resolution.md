# ADR-0009 — Use explicit Temporal resolution for local schedules

- **Status:** Accepted — explicit owner approval received 2026-10-21; production integration and verification remain pending
- **Date:** 2026-10-20
- **Owners:** Project owner
- **Decision register IDs:** `D-056` (Accepted); `D-020`, `D-022`, `D-024`, `D-025` unchanged
- **Checklist IDs:** `INT-004`; later interview/reminder composition reuses the accepted contract if approved

## Problem and evidence

Technology document 10 selects date-fns/date-fns-tz for dates. The [exact candidate review](../proof/next-action-timezone-candidate-review.md) finds that direct date-fns 4.4.0/date-fns-tz 3.2.0 conversion silently shifts skipped clock times and chooses an overlap occurrence implicitly. The same New York local time, 2026-11-01 01:30, resolves to 05:30Z on UTC/Los Angeles hosts but 06:30Z on a Tokyo host. A matching round trip cannot distinguish those two valid occurrences. These are observed failures, not a popularity comparison or justification based solely on a new dependency.

Native Temporal is absent from pinned Node 24.19.0. A feature-dependent implementation is not proven on all accepted native WebViews. Reducing schedules to UTC-only input or making users guess a numeric offset would not meet the intended local-time scheduling experience.

An isolated review of **@js-temporal/polyfill 0.5.1** with **jsbi 4.3.2** passes seven ordinary/hour-gap/hour-overlap/half-hour-gap/half-hour-overlap/skipped-day/quarter-offset scenarios under three host zones in both Node and real Edge 155 offline. Invalid dates/zones reject in Node. An imported namespace leaves global Temporal/Date untouched. A standalone minified ES2020 helper bundle is 211.16 KB / 51.85 KB gzip; a 700-resolution Node diagnostic has p95 0.183 ms and max 0.735 ms. These are candidate diagnostics, not the real application delta, reference-hardware acceptance, exact browser-floor parity or installed native-WebView proof.

## Constraints

- Remain accountless, local-first, offline-capable and AI-disabled useful; no network service resolves times.
- Retain SQLite UTC instant plus canonical IANA zone as durable truth. Do not store Temporal objects, change schema or reinterpret existing stored instants.
- TypeScript owns shared conversion; Rust stays a thin privileged boundary with no calendar IPC or new permission.
- Reject nonexistent clock times. Expose all valid overlap occurrences and require an explicit user choice; never silently choose or shift one.
- Bound and validate literal civil-time/zone input; reject unsupported annotations, implicit device-zone interpretation and accidental calendar/precision changes.
- Preserve draft owner/version, literal choices, single flight, uncertainty after failed acknowledgement and late-result isolation.
- Exact pins, complete inventory/license/advisory review, production bundle and supported-runtime proof remain mandatory after acceptance.

## Options considered

1. **Direct date-fns-tz conversion plus round-trip validation.** Retains the selected utilities but the executed overlap and host-independence failures show that this alone is insufficient.
2. **Keep the selected utilities and implement a custom offset/transition resolver.** Still possible to investigate, but a bounded sampled-offset heuristic is not proof of complete IANA gap/overlap handling. Exhaustive/custom calendar logic increases correctness and maintenance burden. No such resolver is approved or proven here.
3. **Native Temporal only.** Avoids a bundled dependency where present, but the pinned Node runtime lacks it and every accepted native target has not been demonstrated. Do not narrow the existing support floor for this convenience.
4. **Imported Temporal polyfill behind one narrow local-schedule helper.** Explicit standard disambiguation provides the tested behavior consistently, with a measured bundle cost and one transitive dependency.
5. **UTC-only schedules, manual offset entry or no scheduled tasks.** Not proposed as a substitute for the requested local-time workflow.

## Decision and rationale

**Accept option 4.** The owner explicitly accepted this ADR on 2026-10-21. Add exact @js-temporal/polyfill 0.5.1 with jsbi resolved/pinned to reviewed 4.3.2 in the product lockfile during the bounded INT-004 implementation slice. Acceptance authorizes these pins and semantics; it does not claim installation, integration or passing production proof. Use the same imported implementation on supported browser/native paths, not a native-vs-polyfill behavior split. Never install a global Temporal object or modify Date/Intl prototypes.

Replace the document-10 date-fns-tz direction **only for civil-time-to-exact-instant scheduling resolution**. Existing date display/domain value objects remain unchanged. Do not install unused date-fns/date-fns-tz packages merely to preserve a nominal stack row; their later non-conversion uses remain separately scoped. Public application/storage contracts expose only validated strings and explicit candidates, never library types.

For a validated ISO local clock and canonical IANA zone, compute standard earlier/later interpretations, discard candidates whose plain local value differs from the requested clock, deduplicate identical instants, and sort exact instants. Zero means a gap and rejects; one is unique; two require explicit occurrence selection. Invalid input rejects before conversion/write. The user reviews the chosen local zone, offset and UTC instant before saving. This algorithm is isolated prototype evidence, not already implemented product behavior.

Load the converter on explicit scheduling use and keep it out of the initial unscheduled path. Retain an owned loading/error state and no network fallback. Verify the actual production chunk and cached offline reload; the isolated 51.85 KB gzip figure is not a guaranteed application delta.

## Consequences and migration

No SQLite/archive/capture/native IPC migration. Existing scheduled records keep their exact UTC instant and IANA zone; no automatic backfill or timezone-database reinterpretation. Unscheduled records retain both null. Timezone rules still come from the host Intl database, so updates can affect future conversions; no claim of identical rule versions across devices is made.

Costs: an additional scheduling chunk, a transitive bigint implementation, upstream maintenance review and a new exact-runtime regression surface. The upstream project is pre-1.0 and describes its production roadmap; its status and future breaking changes must be tracked rather than assumed mature from its authorship. Do not add another date framework or silently upgrade either pin. Rollback removes the helper/dependency while preserving all stored strings and portable exports; scheduled editing must fail explicitly if no accepted resolver is available.

## Security, privacy, and source-policy impact

Candidate licenses are [ISC for the polyfill](https://github.com/js-temporal/temporal-polyfill/blob/v0.5.1/LICENSE) and [Apache-2.0 for JSBI](https://github.com/GoogleChromeLabs/jsbi/blob/v4.3.2/LICENSE). The isolated two-package audit reports no known vulnerabilities, and exact-version public GitHub advisory queries return no records on this date. Those bounded results do not replace auditing the final product graph or future maintenance. Review package notices/integrities in the normal inventory before installation.

No source connector, account, external fetch, telemetry, credential, privileged API, extension permission or hosted service is introduced. Clock/zone input is untrusted, length-bounded and parsed locally. Imported module use must work under production CSP with no eval/remote code; offline candidate execution does not itself prove the application's CSP gate. Diagnostics/fixtures are synthetic and contain no career or private document data.

## Documents, contracts, checklist IDs, and tests to update

- Owner acceptance recorded 2026-10-21: this ADR and `D-056` are Accepted; technology document 10 and the interface note distinguish the authorized direction from unimplemented production behavior. Update relevant architecture/interface/data-model implementation descriptions coherently with helper adoption.
- After acceptance: exact product lockfile/inventory/license/Changeset changes, a bounded helper and owned lazy-load composition. No durable schema or native protocol changes.
- `INT-004` remains unchecked until the normal form, title/unscheduled header, shared task feedback/undo, canonical offline/reload readback and full browser/native/lifetime/failure/reflow proof pass.
- Extend frozen DST cases with strict invalid/leap/precision/boundary inputs, explicit occurrence changes, host-zone changes, alias/canonical-zone behavior and loading failure/cancellation. Run exact Chrome/Firefox and real-native process paths; retain installed-WebView/manual gates separately.
- Run full `pnpm verify`, separate extension regression, exact clean-commit hosted verification and inventory/advisory/license/CSP/bundle checks before claiming implementation completion.

## Revisit trigger

Revisit on an advisory, unacceptable measured production bundle/latency, failed supported-runtime/Intl behavior, material upstream API/maintenance change, or demonstrated native Temporal parity across every accepted runtime that permits removal of the dependency. Owner rejection keeps the current baseline and requires a separately proven alternative, not a silent substitution.

## Implementation checkpoint — 2026-10-21

The exact approved pins are installed with a scoped JSBI override and inventory 1.30. The bounded helper and explicit owned lazy form have focused Node/production browser/real-Rust native gap, overlap, exact readback, undo, reload and failure/lifetime proof. The actual production chunk measures 159,974 bytes / 45,699 bytes gzip, separately from the earlier candidate measurement. A real failed-module test exposes Chromium's document-level failed-import cache; recovery is a deliberately warned/cancellable reload or explicitly chosen unscheduled save, never a fictitious same-document refetch or automatic fallback. No decision, durable representation or permission changes. Full final-source, extension/policy and exact hosted runtime proof remain; see [current scheduling evidence](../proof/accepted-civil-time-scheduling-verification.md) and [dependency/license review](../proof/accepted-civil-time-dependency-review.md). INT-004 remains unchecked.
