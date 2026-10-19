# Native attachment write verification

Date: 2026-10-19. Checklist context: `Q3-005`, native runtime prerequisite.

## Implemented and focused proof

See [archive IPC version 3 contract](../design/coredrill-design-kit/native-attachment-write-v3.md).
The accepted native adapter lacked ordinary attachment writes for newly exported
documents; read/whole-vault restore alone could not support a complete desktop
document flow without improperly using browser OPFS. This checkpoint fills that
specific adapter gap. It does not yet connect the native UI or change the root.

- `packages/storage-native/test/archive-protocol.test.ts`: 17 tests pass,
  including new immutable snapshot, no-IPC invalid input, old protocol and
  acknowledgement drift/size checks.
- `pnpm test:storage-native`: 14 real adapter tests pass after the final focused
  refinement. New assertions directly exercise Rust, including forged payloads
  that bypass TypeScript checks, active-transaction and closed-session rejection,
  unchanged SQLite export hash, binary readback, repeat write, close/reopen,
  exact managed path, and corrupt-existing-payload preservation. Rust's existing
  11 ordinary unit tests pass; the separate OS secret test remains intentionally
  ignored here and runs in its own proof harness.
- `pnpm typecheck` and `pnpm lint`: pass after correcting contextual transport
  typing in the new tests. No check was weakened.

All test payloads are synthetic. No production path, secret, resume or applicant
data is captured. No new dependency, schema migration or Tauri permission.
Archive IPC is version 3 in both TypeScript and Rust; archive files stay format
1 and SQLite stays schema 158. Existing native archive tests pass, including
atomic replacement, rollback recovery and automatic backups.

## Final verification

Final-source `pnpm verify` exits 0: formatting, boundaries, foundation records,
33 typecheck tasks, 22 lint tasks plus tooling, 131 unit files / 1,049 tests,
coverage, builds, contrast/extraction/extension checks, six UI-foundations tests,
76 explicit catalog shell tests, diagnostic performance, ten resilience journeys,
seven onboarding tests, 13 document-browser tests, nine browser-storage tests,
11 Rust tests plus one intentionally ignored platform-secret test, 14 real
native-adapter tests, separate Windows secure-store proof, archive/backup proofs,
schemas, licenses, secret scan, dependency audits and Changesets status.
npm reports no known vulnerabilities; Cargo retains ten allowed warnings.

The actual `desktop-shell` feature also compiles with
`cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --no-default-features --features desktop-shell --lib`.
This checks the real allowlisted command dispatch, not only the contract probe.
After the full gate, documentation-only proof records were updated.

Clean-commit hosted verification remains. Stored-navigation predecessor
`4d9b426` is pushed and run `39288038492` was last observed in progress; do not
cancel it with an early push. Do not close the production/native UI or `Q3-005`
gates on this adapter prerequisite.
