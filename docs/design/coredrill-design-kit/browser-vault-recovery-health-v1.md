# Browser vault recovery health version 1

## Purpose and authority

This document defines the `BKP-005` browser persistence/quota health and
portable-export reminder boundary. It implements the visible recovery guidance
required by accepted D-025 and ADR-0003 without treating OPFS as proof of
durability, attempting to detect private browsing, or pressuring the user.

The boundary is local and accountless. It uses browser storage APIs, the
existing SQLite `app_setting` repository, and the existing portable archive
action. It introduces no network request, telemetry, hosted storage, alternate
canonical store, or new dependency from outside the reviewed workspace.

## Passive observation and explicit persistence request

Opening a browser vault may call `navigator.storage.persisted()` and
`navigator.storage.estimate()` to observe current state. It must never call
`navigator.storage.persist()` as an open or refresh side effect.

`BrowserSqliteDatabase.requestPersistentStorage()` is a separate serialized
method intended only for an explicit Settings button action. It first observes
the current grant; if the grant is absent and `persist()` exists, it makes one
request. The browser owns the decision. Denial, API error, and unsupported API
remain distinct stable states and never become a success claim.

Both passive refresh and explicit request return an immutable path-free health
snapshot:

- OPFS availability;
- persistence: `granted`, `denied`, `error`, or `unsupported`;
- quota: `available`, `low`, or `unknown`, with finite nonnegative byte values
  only when the browser returned them;
- expected database: `found`, `missing`, or `not-required`; and
- stable warning codes without paths, origin-private data, exception text, or
  record content.

A persistence grant is the only state labeled persistent/durable. All other
states remain best-effort. A passive refresh preserves an
`expected-database-missing` warning once the open proved that condition.

## Visible Settings and recovery guidance

Settings → Vault & Backup displays:

- `Browser vault on this device` and the exact current origin;
- a named persistence state and a separate named quota state;
- an expected-database-missing recovery alert when applicable;
- the persistence-request button only for denied/error states;
- `Export portable archive` and `Review restore options`; and
- an optional export-reminder control that can be snoozed, disabled, and
  re-enabled.

The copy says what the browser reported and what it did not report. It does not
say that local storage is encrypted, infer private/incognito mode, claim loss
is imminent, or present a successful OPFS open as durable. Missing-database
guidance tells the user to check the same browser profile and exact origin
before creating a replacement, then to review restore options.

The surface uses text and icons rather than color alone, has one polite live
health region, keeps the missing-database condition as an alert, reflows at 320
CSS pixels, supports forced colors/reduced motion, and sends no request outside
the local app origin.

## Neutral recurring export reminder

The version-1 preference is stored under the exact SQLite setting key
`browser-export-reminder-v1`:

```json
{
  "enabled": true,
  "lastSuccessfulExportAtUnixMs": null,
  "snoozedUntilUnixMs": null,
  "version": 1
}
```

The strict parser rejects an unknown version, missing/extra field, invalid
boolean, negative/non-integer instant, or any other shape. The default is an
enabled reminder with no successful export evidence. A successful portable
archive export records its completion instant; selection or a failed export
does not. The next reminder is due 30 days after success. `Remind me later`
snoozes for seven days. `Turn off reminders` persists until the user turns them
on again.

The reminder is informational, never modal, and has no streak, countdown,
application target, repeated urgency, penalty, or negative language. Its copy
explicitly says that Coredrill keeps working if the user chooses to export
later. Storage-risk guidance remains visible even when optional recurring
reminders are off.

## Proof obligations

`BKP-005` requires unit and real-browser proof that:

- passive open/refresh calls no persistence request;
- one explicit action makes at most one request and reports grant or denial
  honestly;
- granted, denied, error, unsupported, low/unknown quota, and expected-database
  missing states remain distinct and content-free;
- missing-database warning survives a passive refresh;
- reminder due/scheduled/off transitions, 30-day recurrence, seven-day snooze,
  strict persisted shape, and invalid clocks fail closed;
- snooze/disable/enable/success state survives SQLite close/reopen;
- the Settings surface names each condition, offers export/restore guidance,
  remains accessible at desktop and 320-pixel widths, and makes no external
  request; and
- current/previous exact Chrome and Firefox hosted lanes execute the production
  browser boundary.
