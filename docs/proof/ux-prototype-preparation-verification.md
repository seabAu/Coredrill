# Phase 0 UX prototype preparation verification

Verified 2026-08-24 in the Codex in-app browser against a local HTTP server. These
artifacts close preparation only (`UXR-001` through `UXR-003`); they do not substitute
for the five-participant validation required by `UXR-004` through `UXR-008`.

## Prototype coverage

The runnable [Phase 0 prototype](../../prototypes/phase-0/README.md) provides a single
low-fidelity research shell with explicit Desktop and Mobile modes.

Desktop includes:

- persistent local-vault/network shell and Home attention queue;
- Pipeline Board and semantic Table presentations over the same three jobs;
- two-field capture-conflict review with source/method language;
- a tabbed job workspace with overview, evidence coverage, documents, and provenance;
- a three-column document studio with an unsupported claim and immutable submitted
  snapshot; and
- local-vault backup/restore/outbox language plus a first-job quick-add path that does
  not require profile, account, or AI setup.

Mobile includes quick add, Pipeline, full-route job detail, document viewing, and an
explicit network preflight naming the fictional destination, selected outbound fields,
and data that stays local. Every mobile surface states that its local vault is separate
from the desktop/browser vault until reviewed sync exists.

## Synthetic sample and study script

`sample-vault.v1.json` is versioned and marks itself `synthetic` and `disposable`. Its
three employers, person, jobs, events, submitted snapshot, digest, and `.example` URLs
are fictional. The prototype performs no persistence and its only request loads that
checked-in local fixture.

`usability-study-script.md` carries the exact ten interface-spec tasks into a moderated
script. It defines the five-person participant mix, keyboard-heavy and nontechnical
coverage, think-aloud setup, no-real-data rule, completion/wrong-turn/language/trust/
stress observations, stop rules, and the decision gate that prevents premature
resolution of `Q-006`.

## Browser interaction and visual smoke

The live local prototype was exercised through its accessible names and native
controls:

- only one device `main` is visible at a time;
- desktop Add accepts a fictional role and returns to Pipeline without profile/account;
- Board switches to a three-row semantic Table without changing the underlying set;
- Inbox accepts independently selected title/salary proposals and reports that confirmed
  values are not silently overwritten;
- evidence definitions, source context, unsupported-claim action, and exact submitted
  resume version/digest are reachable;
- mobile quick add returns to Pipeline and retains separate-vault disclosure; and
- network preflight blocks the positive confirmation message until its checkbox is set.

Desktop Home and mobile preflight were visually inspected at the live viewport. The
first pass exposed two prototype defects—both device shells were simultaneously exposed
because CSS overrode `hidden`, and the mobile preflight label collided with its button.
The final pass showed one visible device shell, a clear desktop hierarchy, and an
unclipped mobile confirmation/action layout. Browser error/warning logs were empty.

## Next gate and owner action

`UXR-004` through `UXR-006` require at least five representative human sessions; one
must be keyboard-heavy and one unfamiliar with developer terminology. The owner must
recruit or authorize access to those participants. Findings must be anonymized and must
not include real resumes, employers, credentials, or application data.
