# Phase 2 production extension adversarial security verification

Date: 2026-09-27  
Checklist item: `PEX-007`  
Status: implementation and local browser proof complete; hosted clean-commit proof pending

## Outcome

The production capture implementation now has bounded, non-recursive JSON-LD
discovery and a real Chromium adversarial matrix. Synthetic pages prove that
page-owned prompt text remains inert evidence, only the final top-level page is
captured after a redirect, cross-origin iframe content is excluded, a fresh SPA
capture observes the current document without rewriting an already queued
snapshot, and oversized or structurally deep input fails closed or is skipped
within reviewed limits. The existing transfer fixture continues to reject
acknowledgement replay.

No source connector, background navigation observer, content script, remote
asset, optional host permission, required host permission, provider secret,
account, hosted database, AI path, auto-apply action, or outreach behavior was
added.

## Capture boundary

`captureActivePage` retains its 64-item and 512-KiB JSON-LD ceilings and now
adds two bounds before boundary validation:

- at most 256 JSON-LD script elements are inspected;
- one script traversal may visit at most 10,000 values and 32 levels; and
- traversal uses an explicit stack, so hostile nesting cannot consume the
  JavaScript call stack.

An over-limit script contributes no partial `JobPosting` result. A later valid
bounded script remains eligible. Selected text above 64 KiB still rejects the
whole capture rather than silently truncating it.

The focused unit fixture supplies an oversized JSON-LD value, a 40-level nested
wrapper, and a valid later posting. Only the valid posting crosses the strict
`PageCaptureSnapshot` validator.

## Real-browser adversarial matrix

`e2e/extension-security.spec.mjs` compiles the checked-in TypeScript capture
function and executes that exact function in the live top-level Chromium page.
It then queues the returned draft through the production extension service
worker and private outbox boundary. This keeps the package manifest honest:
the test does not grant a synthetic host permission merely to automate an
`activeTab` user gesture.

The matrix proves:

| Fixture                         | Expected and observed result                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malicious/prompt-injection text | An instruction-shaped title and selected text remain literal candidate/source evidence; markup inside JSON-LD causes zero exfiltration requests.   |
| Redirect                        | The captured source URL is the final top-level job URL, not the redirect entry URL.                                                                |
| Cross-origin iframe             | A conflicting child-frame `JobPosting` is absent from the snapshot and queued envelope.                                                            |
| SPA change                      | A later explicit capture observes the changed top-level JSON-LD; the already queued envelope retains the original title and selected text exactly. |
| Huge/deep page                  | A 20,000-node irrelevant DOM completes; oversized and 40-level JSON-LD are skipped; the later bounded posting is retained.                         |
| Oversized selection             | 65,537 selected characters reject with the reviewed selected-text boundary instead of truncating.                                                  |
| Replay                          | The existing Chromium transfer fixture rejects an acknowledgement replay as `replay_or_unknown_ack` after exact durable acknowledgement.           |

The complete extension lane also retains the Firefox checksummed manual import
fallback and its checksum rejection/idempotency proof.

## Local verification

The implementation worktree passed:

```text
pnpm exec vitest run apps/extension/test/capture-active-page.test.ts
  1 file / 6 tests passed

pnpm --filter @coredrill/extension typecheck
  passed

pnpm --filter @coredrill/extension lint
  passed

pnpm test:extension-transfer
  Chromium: preview, two adversarial fixtures, transfer/replay, storage pressure
  Firefox: checksummed manual fallback
  6 tests passed

pnpm verify
  33 typecheck tasks / 22 lint tasks / 22 build tasks passed
  87 Vitest files / 739 unit tests passed
  browser, native-storage, schema, boundary-policy, license, secret, and
  dependency-advisory gates passed
```

Production package inspection also passed with no required or optional host
permissions, no remote assets/imports/evaluation, and no secret findings. The
reviewed permissions remained:

- Chromium: `activeTab`, `scripting`, `sidePanel`, and `storage`;
- Firefox: `activeTab`, `scripting`, and `storage`.

The Chromium and Firefox store ZIPs were byte-identical to their inspected
production directories. The hosted clean-commit matrix will be recorded after
the implementation commit.

## Decision status

No Accepted decision changes. The work strengthens `D-023`, `D-030`, `D-032`,
and the existing hostile-input/least-privilege rules. `PEX-005` remains blocked
on the public origin, deployment target, and release Chromium identity.
`PEX-006` remains open because no reviewed extension-specific adapter currently
needs persistent host access; the reviewed Greenhouse, Lever, and USAJOBS
network connectors remain in the hosted/desktop connector layer.
