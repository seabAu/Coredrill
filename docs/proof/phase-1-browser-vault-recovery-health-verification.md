# Phase 1 browser vault recovery health verification

Date: 2026-08-29

Checklist scope: `BKP-005`

Packages: `@coredrill/application`, `@coredrill/storage-browser`,
`@coredrill/ui`, `@coredrill/web`

Decision changes: none

## Outcome

Implementation commits `1c03be2ec6784f0eb3f8d07513cc07febe1a2044` and
`2d3e0df8ba70397ef70e466d90cacafe31977db6` make browser recovery
health visible without weakening the accepted D-025 boundary. Opening or
refreshing a browser vault observes persistence, quota, and expected-database
state but cannot call `navigator.storage.persist()`. A separate explicit
Settings action may request persistence once, and its immutable result keeps
grant, denial, error, unsupported capability, quota risk, and missing-data
evidence distinct.

The contract is recorded in
[`browser-vault-recovery-health-v1.md`](../design/coredrill-design-kit/browser-vault-recovery-health-v1.md).
The same Settings card names the exact browser origin, keeps storage and
recovery guidance visible, and offers an optional portable-export reminder.
The reminder preference is canonical SQLite state rather than local storage or
ephemeral UI state. Selection or a failed export does not advance it; only a
successfully completed portable archive does.

## Passive observation and explicit request proof

The storage-browser unit and real-browser suites prove that passive open and
refresh call `persisted()` and `estimate()` without calling `persist()`. The
explicit method is serialized with database operations, first observes an
existing grant, and makes no more than one request when needed. Its path-free
snapshot reports only reviewed state and stable warning codes.

The production browser proof covers:

| Scenario                  | Proven result                                           |
| ------------------------- | ------------------------------------------------------- |
| Passive open and refresh  | Persistence request count remains zero                  |
| Explicit grant            | One user action produces `granted`                      |
| Explicit denial           | Vault remains `best-effort`; no durability claim        |
| Persistence API exception | Stable `error` state without raw exception text         |
| Unsupported API           | Stable `unsupported` state and portable-export guidance |
| Low quota                 | Separate `low` state with bounded finite values         |
| Unknown quota             | Separate `unknown` state; no guessed capacity           |
| Expected database missing | Stable `missing` evidence survives passive refresh      |

The reproducible browser suite emits:

```text
STG_FAILURE_PROOF {"corruptRestorePreservedTarget":true,"deniedPersistence":true,"erroredPersistence":true,"ephemeralProfileLossDetected":true,"explicitPersistenceRequestOnly":true,"exportReminderPreferencePersisted":true,"exportReminderUserControls":true,"expectedDatabaseMissing":true,"grantedPersistence":true,"quotaLow":true,"quotaUnknown":true,"unsupportedPersistence":true}
```

## Durable reminder and interface proof

`@coredrill/application` owns a strict version-1 setting under
`browser-export-reminder-v1`. Tests reject missing or extra properties,
unknown versions, invalid clocks, and malformed stored JSON. The default is an
enabled reminder with no invented export success. A successful export schedules
the next reminder after 30 days; snooze schedules seven days; disable and
re-enable remain explicit user choices. Each transition survives SQLite
close/reopen in the production browser harness.

The shared UI card separately names origin, persistence, quota, and an expected
database loss. It exposes `Request persistent storage` only as a button action,
keeps export and restore actions available when reminders are off, and avoids
modals, countdowns, streaks, escalating urgency, or penalties. Component and
real-browser tests prove semantic headings and alerts, keyboard operation,
forced-color support, 320-CSS-pixel reflow, and no external network request.

The application-shell catalog uses a deterministic interaction projection for
visual and accessibility proof. Canonical reminder persistence is proven
separately against the real SQLite/OPFS harness; the catalog does not claim to
be the persistence composition. Likewise, selecting the archive button leaves
the reminder due. The production completion path must call `record-success`
only after archive creation and save finish successfully.

## Cross-browser hosted proof

Foundation CI run
[`33285567150`](https://github.com/seabAu/Coredrill/actions/runs/33285567150)
repeated the production storage boundary from a clean checkout:

| Browser               |                                                                                           Job | Result                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------: | -------------------------------------------------------------------------------------------------------------- |
| Chrome 151.0.7922.138 | [`99188083549`](https://github.com/seabAu/Coredrill/actions/runs/33285567150/job/99188083549) | Passed passive/explicit persistence, recovery-state, SQLite reminder, and existing storage/restore assertions. |
| Chrome 152.0.7977.54  | [`99188083591`](https://github.com/seabAu/Coredrill/actions/runs/33285567150/job/99188083591) | Passed the same production boundary and exact-version assertion.                                               |
| Firefox 153.0         | [`99188083582`](https://github.com/seabAu/Coredrill/actions/runs/33285567150/job/99188083582) | Passed the same assertions through branded Firefox and local W3C WebDriver.                                    |
| Firefox 154.0         | [`99188083566`](https://github.com/seabAu/Coredrill/actions/runs/33285567150/job/99188083566) | Passed the same assertions through branded Firefox and local W3C WebDriver.                                    |

Headless Firefox cannot answer its native persistence permission sheet. The
hosted Firefox harness therefore enables Mozilla's test-only persistence-prompt
grant preferences in the browser capabilities and asserts the resulting
`granted` state. Production code still invokes the real `StorageManager` API;
the separate application-shell browser test proves that invocation remains
behind the visible user action.

The same run passed the aggregate build/static/test/policy lane, full-history
secret scan, extension transfer lane, and Windows/macOS/diagnostic-Ubuntu
native jobs.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:storage-browser`                                                                   | Passed six real Chrome storage scenarios, including every recovery-health state and durable reminder transition.                                                                                                                |
| `pnpm test:app-shell`                                                                         | Passed 28 application-shell browser scenarios, including explicit persistence action, neutral reminder controls, accessibility, 320-pixel reflow, and no external network request.                                              |
| `pnpm verify`                                                                                 | Passed with exit code 0 across formatting, boundaries, records, typecheck, lint, 56 coverage files and 514 tests, all 22 builds, 55 browser scenarios, native/extension/document proof, schemas, licenses, secrets, and audits. |
| [Foundation CI run 33285567150](https://github.com/seabAu/Coredrill/actions/runs/33285567150) | Passed for final implementation commit `2d3e0df8ba70397ef70e466d90cacafe31977db6`; all policy, browser, extension, and Windows/macOS/Ubuntu native lanes completed successfully.                                                |

Overall coverage was 83.78% statements, 75.30% branches, 82.48% functions,
and 86.30% lines.

## Dependency and policy status

This slice adds no external package. Workspace-only dependency links update the
lockfile to SHA-256
`47401aa17fea0b0b54176831669e02fc601658970442321a98a2437f5f2aca9b`.
The reviewed inventory is version 1.18.1, dated `2026-08-30T01:09:09Z`.
The npm audit has zero known vulnerabilities, and the license gate passes 354
npm packages and 498 Rust crates. The existing Rust allowance of 14
unmaintained and one GTK-related unsound transitive warning is unchanged.

No browser permission, extension permission, hosted service, telemetry, remote
asset, account, or alternate durable store was added.

## Implementation surfaces

- `packages/storage-browser/src/storage-environment.ts` and
  `browser-sqlite.ts` — passive observation, explicit persistence request, and
  immutable health snapshot.
- `packages/application/src/browser-recovery.ts` — strict recurring reminder
  policy and SQLite-safe serialization.
- `packages/ui/src/vault-backup-settings.tsx` — visible origin, health,
  recovery, and neutral reminder surface.
- `apps/web/src/main.ts` — production SQLite setting composition and proof
  API.
- `e2e/storage-failures.spec.mjs`, `e2e/app-shell.spec.mjs`, and the Firefox
  WebDriver harness — real-browser, accessibility, and user-action evidence.
- `.changeset/browser-vault-recovery-health.md` — application, storage, UI,
  and web release record.

## Boundaries and remaining work

- Browser persistence remains a browser decision, not a guarantee against
  profile deletion, origin change, device loss, or user-cleared data.
- The reminder is optional recovery guidance, not proof that an export exists.
- Portable archives remain explicitly unencrypted in version 1.
- `BKP-006` owns typed-confirmation deletion of the database, vault-owned
  attachments, managed backups, and vault-scoped secrets. `BKP-007` owns clean
  browser/desktop recovery with representative attachments and canonical hash
  comparison.
- `FND-001` remains independently blocked on durable private conduct and
  vulnerability-reporting routes. `GATE-0` remains blocked on owner-authorized
  representative human validation, and `Q-006` remains open.
- No Accepted decision changed, so no ADR was created.
