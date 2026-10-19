# Local application-attempt creation

Date: 2026-10-19  
Checklist scope: production creation under `Q3-005`  
Status: complete local verification; clean-commit hosted verification pending

## Explicit user action and atomic state

An actual stored job's Documents tab can now start local application
preparation. The user explicitly names a preparation stage. The application
command applies the domain's bounded stage-name validation and generates local
application, candidate stage, and event identities using the operation time.
Only an exact active user-named Preparing stage can be reused. A new stage is
user-owned, Preparing, nonterminal, and appended to the existing order. No
default stage names are seeded, so the unresolved `Q-006` research decision is
not silently resolved by this implementation.

The SQLite transaction validates the active job and expected row version,
rejects terminal or unavailable current stages, rejects any existing active
application, resolves/creates the named stage, creates the application, updates
the job's optimistic status projection, and appends one application-bound
timeline event. Any failure rolls back all those writes. An Applied instant,
submission channel, selected document versions, or submitted snapshot is never
created by this action. It sends nothing and cannot reopen a terminal job.

The stored-job composition uses the returned durable identity and row version
only for the same still-open job. Existing document-preparation and submission
queries then load the actual new application. Demonstration routes remain
separate. The inline form prevents duplicate pending submits, retains its stage
name on failure, explains that the action is local preparation only, and uses
the existing token-based form controls.

Stored-job loads also replace the demonstration-only shell status text rather
than continuing to label actual local records as synthetic. The browser
assertion checks that the false blanket label is absent after reload, without
depending on which successive successful local-load notification is last.

## Executable proof

The focused two-file run passes 22 tests including the existing document-editor
and document-creation cases. New application cases cover naming normalization,
invalid IDs/versions/names/control characters, unknown keys, content-free port
failure, and adapter identity/projection drift. Real Node SQLite cases prove:

- creation from an unassigned job, a Preparing projection and timeline event,
  no Applied/channel facts, and no automatic document selections;
- an existing attempt and a stale row version cannot create another attempt;
- a terminal job is not reopened;
- an exact user-owned Preparing stage is reused without seeding another stage;
  and
- an injected real event-ID collision after candidate stage/application/job
  writes rolls everything back, preserving the earlier job, stage, event, and
  row version exactly.

`e2e/application-attempt.spec.mjs` runs in the production-build resilience
suite. It installs the PWA, goes offline, creates a manual capture through the
normal form, explicitly accepts/reviews it and saves the real job, opens that
job's canonical Documents route, names the stage, and starts preparation.
It proves no reference fixture was installed, no document was selected, the
attempt is not submitted, a duplicate command fails closed, and the exact
application preparation state survives offline reload. A named 320-pixel form,
zero axe violations, a screenshot/axe artifact, and zero external requests are
retained. `APPLICATION_ATTEMPT_PROOF` emits the synthetic job/application/stage
identities and the explicit non-submission witness.

## Remaining boundary

The full `pnpm verify` gate passes: the final unit matrix is 124 files / 949
tests, with coverage, 33 typecheck tasks, 22 lint/build tasks, 19 import-boundary
policies, 76 app-shell tests, seven resilience tests, seven onboarding tests,
13 document-browser tests, nine browser-storage tests, 13 native TypeScript
tests and 11 Rust tests, plus secure-store, archive/backup, generated schema and
report, extension package, license, secret, advisory, and Changeset checks.
The final stored-record status wording is additionally covered by the rebuilt
resilience suite and web lint. npm reports no known vulnerabilities; the
existing ten reviewed Cargo informational warnings remain.

### Hosted startup finding

The preceding document-creation checkpoint's Chrome 152 job in
[run 39226095150](https://github.com/seabAu/Coredrill/actions/runs/39226095150)
passed unseeded document creation but failed the following canonical fixture
setup after reload with `NoModificationAllowedError` from OPFS access-handle
acquisition. The JavaScript API can be ready before the prior page's terminated
worker has finished releasing browser-managed handles. This is not a reason to
replay a transaction, erase a vault, or weaken the Web Lock.

The public browser-open factory now retries only that exact startup error with
fresh complete opens after 25, 75, and 150 ms (four total attempts). Each failed
open already terminates its worker and releases its lease before rejecting;
every new attempt must independently acquire the same exclusive lease.
Exhaustion returns the existing content-free typed SQLite-busy result. All
other failures propagate immediately, including another tab's lease, ordinary
SQLite busy, corruption, permission denial, and quota errors. No query, write,
transaction, restore, or migration is retried by this helper.

Eight unit cases prove success, exhaustion, non-retry failures, and stopping
when a different failure follows the initial handle conflict. A real-browser
worker-boundary fixture injects exactly one initial protocol error, then uses
the real second SQLite worker and actual migration/repository path. It requires
two workers, the first two operations to be `open`, one vault write, and one
canonical retained vault. Abrupt-tab/reload and second-writer tests remain
separate and unchanged.

No schema, migration, dependency, permission, network provider, or Accepted
decision changes. Clean-commit hosted verification still needs to pass for
this slice. This is not new native UI or representative-user proof.

Application retries/additional attempts and terminal-job reopening are not
implicitly authorized here. The existing one-active-attempt rule remains in
force. `Q3-005` remains open: job-specific document derivation, removal of its
remaining seeded starting records, and normal-user tracker composition still
require implementation and end-to-end proof. Human and distribution gates
remain independently open.
