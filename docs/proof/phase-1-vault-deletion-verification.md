# Phase 1 vault deletion verification

Date: 2026-08-29

Checklist scope: `BKP-006`

Packages: `@coredrill/application`, `@coredrill/storage-native`,
`@coredrill/ui`, `@coredrill/web`, `@coredrill/desktop`

Decision changes: none

## Outcome

Implementation commits `ef72d21511bcf581418af8fb95dbf3803c4e3ce3` and
`4cb3677adcfe353a434e545fcd07bfc7bdea0fe0` add a versioned, failure-safe
deletion boundary for an explicitly selected local vault. A preview
revalidates the target, returns a path-free inventory of the data and recovery
material in scope, and supplies the exact confirmation phrase
`DELETE <vault name>`. Deletion is unavailable until the user enters that
phrase exactly. The interface warns that external portable exports are the
recovery path, offers export before deletion without making it mandatory, and
does not use urgency, countdowns, or opaque risk claims.

The normative contract is recorded in
[`vault-deletion-v1.md`](../design/coredrill-design-kit/vault-deletion-v1.md).
It preserves D-025's local-first storage boundary and D-050's operating-system
secret-store boundary. No hosted service, account, telemetry, general
filesystem permission, or alternate durable store was added.

## Scope and confirmation proof

The application contract treats a deletion preview as a bounded, single-use
capability. It rejects an unknown vault, an expired or replayed preview, a
changed target, a stale scope hash, or an inexact phrase before destructive
work begins. The immutable preview names counts and warning codes but contains
no filesystem path, database filename, secret value, or provider credential
identifier.

The deletion scope is deliberately exact:

| Resource                                | Result                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Active canonical database, WAL, and SHM | Included for the selected vault                                               |
| Vault-owned physical attachments        | Included only when no other managed vault references the content hash         |
| Managed automatic backups               | Included for the selected vault                                               |
| Provider credentials                    | Included only through vault-scoped, content-free keychain account identifiers |
| Another managed vault                   | Preserved                                                                     |
| Shared attachment content               | Preserved                                                                     |
| External portable archives              | Preserved and never enumerated as managed deletion targets                    |

Sixteen application tests prove exact confirmation, target and scope
revalidation, expiry, replay protection, stable content-free errors, bounded
preview retention, and successful delegation to the reviewed adapter.

## Browser and interface proof

The production browser adapter previews the sole OPFS vault, hashes the exact
scope, and revalidates that evidence immediately before deletion. The real
Chrome storage test proves that an inexact phrase leaves the database intact,
an exact phrase removes the OPFS database, reopening yields an empty profile,
and independently exported portable bytes remain unchanged. It emits:

```text
STG_PROOF {"sqlite":"sqlite-version:3.53.0","browser":"152.0.4191.53","vfs":"opfs-sahpool","worker":"dedicated-worker","persistence":"best-effort","schemaVersion":92,"byteLength":966656,"sha256":"8eedb6a5d3b2ca01d62df1811297fa293922288a1060c1ab6040721d0b242d08","durableRows":1,"rollback":true,"cleanProfileRestore":true,"portableArchiveWriterSha256":"47b18f1854ae6a608cffb4753895afc0fead06f3399818326e61142579a5fcde","humanReadableDatasets":29,"humanReadableDataFiles":58,"archiveRestoreConflict":"same_vault_replace","archiveRestoreCommitted":true,"archiveRestoreCorruptionRejected":true,"archiveRestoreStaleRejected":true,"typedVaultDeletion":true,"deletionPreservedExternalArchive":true}
```

The shared Radix dialog initially focuses the permanent-warning text, keeps
the target and every deletion category visible, leaves export available, and
enables the destructive action only for an exact phrase. Application-shell
tests prove the successful, rollback, and cleanup-pending outcomes; semantic
dialog/alert behavior; keyboard operation; 320-CSS-pixel reflow; automated axe
coverage; and zero external network requests. A failed pre-purge operation
keeps the target visible. A cleanup-pending result clears the deleted target
without falsely claiming that final purge has completed.

The application-shell catalog is a deterministic interaction projection for
visual and accessibility proof. Canonical OPFS deletion is proven separately
through the production storage composition above.

## Native rollback and secret cleanup proof

The thin Rust boundary owns filesystem enumeration, same-volume staging,
secure-store deletion, rollback, and final purge. It rescans every other
managed SQLite attachment manifest before staging a physical attachment,
never follows an unreviewed path from the WebView, closes the exact active
database, and stages the selected database files, unshared attachment content,
and managed backups before deleting scoped credentials.

If staging fails, all staged data is restored and the vault is reopened. If
credential deletion fails, staged data is likewise restored and the response
warns that credentials may require re-entry if the provider removed only a
subset. Final-purge failure returns `cleanup_pending`; a marker-gated startup
retry removes only staging directories that already passed the destructive
boundary. Three native filesystem tests prove successful scoped deletion,
secret-failure rollback with content-free errors, staging rollback, and the
cleanup-pending retry.

Provider credentials now use the native-secret version-2 protocol. Every
store, status, and delete request requires a vault identifier; Rust derives a
SHA-256 account identifier from vault and provider, so neither secret material
nor a user path crosses the Tauri boundary. The real Windows proof emits:

```text
NAT008_SECRET_PROOF {"backend":"windows-credential-manager","stored":true,"retrievedInsideRust":true,"deleted":true,"secretExposed":false}
```

## Cross-platform hosted proof

Foundation CI run
[`33288624734`](https://github.com/seabAu/Coredrill/actions/runs/33288624734)
repeated the complete boundary from a clean checkout:

| Platform              |                                                                                           Job | Result                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome 151.0.7922.138 | [`99196219600`](https://github.com/seabAu/Coredrill/actions/runs/33288624734/job/99196219600) | Passed exact-phrase OPFS deletion, reopen-empty, external-archive preservation, and the full browser/UI matrix.                                                         |
| Chrome 152.0.7977.54  | [`99196219543`](https://github.com/seabAu/Coredrill/actions/runs/33288624734/job/99196219543) | Passed the same production boundary and exact-version assertion.                                                                                                        |
| Firefox 153.0         | [`99196219672`](https://github.com/seabAu/Coredrill/actions/runs/33288624734/job/99196219672) | Passed exact-phrase deletion through branded Firefox and local W3C WebDriver.                                                                                           |
| Firefox 154.0         | [`99196219559`](https://github.com/seabAu/Coredrill/actions/runs/33288624734/job/99196219559) | Passed the same Firefox boundary and exact-version assertion.                                                                                                           |
| Windows               | [`99196219534`](https://github.com/seabAu/Coredrill/actions/runs/33288624734/job/99196219534) | Passed native SQLite/deletion contracts, real Credential Manager cleanup, archive/backup proof, complete lint, installer build, installed startup, and artifact upload. |
| macOS 26              | [`99196219514`](https://github.com/seabAu/Coredrill/actions/runs/33288624734/job/99196219514) | Passed native SQLite/deletion contracts, real Keychain cleanup, archive/backup proof, complete lint, bundle build, launch inspection, and artifact upload.              |
| Ubuntu 26.04          | [`99196219454`](https://github.com/seabAu/Coredrill/actions/runs/33288624734/job/99196219454) | Passed native SQLite/deletion contracts, real Secret Service cleanup, archive/backup proof, complete lint, AppImage build, launch inspection, and artifact upload.      |

The same run passed the aggregate build/static/test/policy lane, extension
transfer, and full-history secret scan. The first hosted implementation run
correctly exposed that two pre-existing native archive tests could choose the
same temporary root when macOS launched them in the same clock tick. Corrective
commit `4cb3677adcfe353a434e545fcd07bfc7bdea0fe0` adds an atomic sequence to
those test roots; the final run passed the formerly colliding archive tests and
all new deletion tests on every native platform.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command                                                                                                      | Result                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:storage-browser`                                                                                  | Passed six production Chrome storage scenarios; deletion required the exact phrase, removed the OPFS database, reopened empty, and preserved external portable bytes.                                                                       |
| `pnpm test:app-shell`                                                                                        | Passed 31 application-shell scenarios, including three deletion outcomes, accessibility, keyboard use, 320-pixel reflow, and no external request.                                                                                           |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --no-default-features --lib`          | Passed 10 tests with one intentional platform secure-store proof ignored in favor of its dedicated harness; includes all three vault-deletion filesystem tests.                                                                             |
| `pnpm test:secure-storage`                                                                                   | Passed the real Windows Credential Manager store/retrieve/delete lifecycle with vault-scoped identifiers and no secret exposure.                                                                                                            |
| `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` | Passed the complete Rust feature and target matrix without findings.                                                                                                                                                                        |
| `pnpm verify`                                                                                                | Passed with exit code 0 across formatting, boundaries, records, typecheck, lint, 59 coverage files and 535 tests, all 22 builds, 58 browser scenarios, native/extension/document proof, schemas, licenses, secrets, audits, and Changesets. |
| [Foundation CI run 33288624734](https://github.com/seabAu/Coredrill/actions/runs/33288624734)                | Passed for final implementation commit `4cb3677adcfe353a434e545fcd07bfc7bdea0fe0`; all policy, current/previous Chrome and Firefox, extension, and Windows/macOS/Ubuntu native lanes completed successfully.                                |

Overall coverage is 83.30% statements, 74.98% branches, 82.16% functions,
and 85.90% lines.

## Dependency and policy status

This slice adds no external dependency and does not change the lockfile. The
pnpm lockfile SHA-256 remains
`47401aa17fea0b0b54176831669e02fc601658970442321a98a2437f5f2aca9b`.
The reviewed inventory remains version 1.18.1, dated
`2026-08-30T01:09:09Z`, with 48 direct dependencies. npm reports zero known
vulnerabilities; the license gate passes 354 npm packages and 498 Rust crates.
The existing Rust allowance of 14 unmaintained and one GTK-related unsound
transitive warning is unchanged.

The desktop shell adds one exact `native_vault_invoke` capability. It does not
grant filesystem scope to the WebView. The secret protocol change narrows
credential identity from provider-wide to vault-and-provider scope.

## Implementation surfaces

- `packages/application/src/vault-deletion.ts` — bounded preview capability,
  exact confirmation, revalidation, and stable application errors.
- `packages/ui/src/vault-deletion.tsx` and `apps/web/src/app-shell.tsx` —
  warning, scope review, export choice, exact phrase, and honest outcomes.
- `apps/web/src/main.ts` and `e2e/storage-browser.spec.mjs` — production OPFS
  composition and durable deletion proof.
- `apps/desktop/src-tauri/src/native_vault.rs` — path-owned enumeration,
  staging, vault-scoped secret cleanup, rollback, purge, and startup retry.
- `apps/desktop/src-tauri/src/native_secrets.rs` — vault-scoped secret account
  derivation and version-2 content-free protocol.
- `packages/storage-native/src/vault-protocol.ts` — strict path-free Tauri
  request and result validation.
- `.changeset/typed-vault-deletion.md` — application, UI, storage-native,
  desktop, and web release record.

## Boundaries and remaining work

- External portable archives are deliberately preserved; version 1 archives
  remain explicitly unencrypted and are the user-controlled recovery path.
- Final purge can honestly remain cleanup-pending after the logical vault has
  been removed. Only marker-approved staged data is eligible for automatic
  startup retry.
- The app-shell catalog proves the complete interaction, while the browser and
  Rust harnesses prove the two durable production boundaries independently.
- `BKP-007` owns clean-install browser/desktop recovery with representative
  attachments and canonical hash comparison.
- `FND-001` remains independently blocked on durable private conduct and
  vulnerability-reporting routes. `GATE-0` remains blocked on owner-authorized
  representative human validation, and `Q-006` remains open.
- No Accepted decision changed, so no ADR was created.
