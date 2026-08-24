# Coredrill identity, license, and hosting verification

Date: 2026-08-24  
Scope: `FND-001`, `FND-006`, `Q-001`, and `Q-013` follow-up  
Branch: `main`  
Remote: `https://github.com/seabAu/Coredrill.git`

## Outcome

| Item      | Result               | Evidence                                                                                                                                                                                                                                                                                                                      |
| --------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FND-001` | Partially proven     | All required governance paths remain present; the repository now uses the canonical Apache License 2.0 text, root package metadata declares `Apache-2.0`, and `D-054`/`D-055` record the owner's Coredrill/license decisions. The checklist stays open because no durable private conduct-reporting route has been published. |
| `FND-006` | Pending hosted proof | The remote exists and local Foundation CI equivalents pass. This item remains open until the integrated `main` branch has a linked green hosted workflow run.                                                                                                                                                                 |
| `Q-001`   | Narrowed             | Coredrill is the selected working identity and the GitHub repository exists. Trademark, domain, and marketplace clearance remain required before public listing.                                                                                                                                                              |
| `Q-013`   | Narrowed             | Apache-2.0 resolves public software permissions. Only the sustainability/business model remains open, and it must preserve the free local core and complete export.                                                                                                                                                           |

## Decision and governance evidence

- [`ADR-0002`](../adr/0002-adopt-coredrill-identity-and-apache-license.md) records the accepted identity and license decision.
- [`D-054` and `D-055`](../design/coredrill-design-kit/11-decision-register.md) make Coredrill and Apache-2.0 implementation authority.
- [`LICENSE`](../../LICENSE) is the canonical Apache License 2.0 text supplied in the remote's initial commit; the previous restrictive placeholder remains recoverable from Git history.
- [`package.json`](../../package.json) declares the `coredrill` root identity and `Apache-2.0`; [`check-foundation-records.mjs`](../../tooling/scripts/check-foundation-records.mjs) and its mutation test reject drift.
- The design kit lives at [`docs/design/coredrill-design-kit`](../design/coredrill-design-kit/README.md), and internal workspace packages consistently use `@coredrill/*`. Stable `JW-*` evidence-record IDs remain unchanged for traceability.
- A Changeset covers all 19 renamed private workspace packages. No public package, durable runtime data, schema, archive, or product contract exists yet.

## Remote integration evidence

- The supplied remote's `main` branch began at `6232cd1` with only the canonical Apache-2.0 `LICENSE`.
- Local and remote histories initially had no merge base. Integration must use a normal unrelated-histories merge; force-push and history replacement are prohibited.
- Integrated commit and hosted workflow URL: _pending_.

## Local verification

All commands used Node `24.19.0` and pnpm `11.22.0`.

| Command                                  | Exit | Result                                                                                                                                                                                                            |
| ---------------------------------------- | ---: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --force` |    0 | All 20 workspace projects installed; 332 lockfile entries passed supply-chain policy.                                                                                                                             |
| `pnpm check:foundation-records`          |    0 | Root identity/license, 10 direct dependencies, 3 toolchains, 16 execution targets, and 10 accessibility cases passed.                                                                                             |
| Focused foundation-record test           |    0 | 1 file and 6 tests passed, including identity/license drift rejection.                                                                                                                                            |
| `pnpm check:boundaries`                  |    0 | All 19 renamed package policies passed.                                                                                                                                                                           |
| `pnpm verify`                            |    0 | Formatting, boundaries, foundation records, 21 typecheck tasks, 19 lint tasks, 14 unit tests, coverage thresholds, 19 builds, 299 license records, secret scan, all-severity audit, and Changesets status passed. |

The local secret matcher remains a fast guard rather than full-history proof. The hosted workflow's separate Gitleaks job is required before `FND-006` can close.

## Remaining actions

1. Commit the identity/license change, merge `origin/main` normally with unrelated histories, and push the integrated `main` branch.
2. Link a green hosted Foundation CI run and only then mark `FND-006` complete.
3. Publish a durable private conduct-reporting route before marking `FND-001` complete or opening external contributions.
4. Complete trademark/domain/marketplace clearance before marking `DEP-001` complete or publicly listing Coredrill.
