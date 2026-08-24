# Coredrill identity, license, and hosting verification

Date: 2026-08-24  
Scope: `FND-001`, `FND-006`, `Q-001`, and `Q-013` follow-up  
Branch: `main`  
Remote: `https://github.com/seabAu/Coredrill.git`

## Outcome

| Item      | Result           | Evidence                                                                                                                                                                                                                                                                                                                      |
| --------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FND-001` | Partially proven | All required governance paths remain present; the repository now uses the canonical Apache License 2.0 text, root package metadata declares `Apache-2.0`, and `D-054`/`D-055` record the owner's Coredrill/license decisions. The checklist stays open because no durable private conduct-reporting route has been published. |
| `FND-006` | Proven           | The integrated `main` branch completed [Foundation CI run #1](https://github.com/seabAu/Coredrill/actions/runs/32694914029) successfully for merge commit `f8d9a18`. The build/static/test/policy and full-history secret-scan jobs passed; dependency review was correctly skipped because it is PR-only.                    |
| `Q-001`   | Narrowed         | Coredrill is the selected working identity and the GitHub repository exists. Trademark, domain, and marketplace clearance remain required before public listing.                                                                                                                                                              |
| `Q-013`   | Narrowed         | Apache-2.0 resolves public software permissions. Only the sustainability/business model remains open, and it must preserve the free local core and complete export.                                                                                                                                                           |

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
- Merge commit `f8d9a18e0e2aa5a8857cfe5267db424550b26253` retains both parents and was pushed to `origin/main` without a force update.
- [Foundation CI run #1](https://github.com/seabAu/Coredrill/actions/runs/32694914029) reported `status: completed` and `conclusion: success` through GitHub's public Actions API. The quality/policy job passed in 1 minute 37 seconds, and the full-history secret scan passed in 6 seconds.
- The repository is public. Public visibility does not open contribution intake or resolve the missing private conduct-reporting route.
- The public repository description currently says "contact node scraping." That wording is broader than the accepted approved-source, no-general-crawling, and no-unlicensed-contact-enrichment constraints; it is recorded as remote-metadata cleanup, not treated as implementation authority.

## Local verification

All commands used Node `24.19.0` and pnpm `11.22.0`.

| Command                                  | Exit | Result                                                                                                                                                                                                            |
| ---------------------------------------- | ---: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --force` |    0 | All 20 workspace projects installed; 332 lockfile entries passed supply-chain policy.                                                                                                                             |
| `pnpm check:foundation-records`          |    0 | Root identity/license, 10 direct dependencies, 3 toolchains, 16 execution targets, and 10 accessibility cases passed.                                                                                             |
| Focused foundation-record test           |    0 | 1 file and 6 tests passed, including identity/license drift rejection.                                                                                                                                            |
| `pnpm check:boundaries`                  |    0 | All 19 renamed package policies passed.                                                                                                                                                                           |
| `pnpm verify`                            |    0 | Formatting, boundaries, foundation records, 21 typecheck tasks, 19 lint tasks, 14 unit tests, coverage thresholds, 19 builds, 299 license records, secret scan, all-severity audit, and Changesets status passed. |

The local secret matcher remains a fast guard rather than full-history proof. The hosted workflow supplied the separate full-history Gitleaks result required to close `FND-006`.

## Remaining actions

1. Publish a durable private conduct-reporting route before marking `FND-001` complete or opening external contributions.
2. Complete trademark/domain/marketplace clearance before marking `DEP-001` complete or publicly listing Coredrill.
3. Replace the public repository's "contact node scraping" description with language consistent with `D-033` and the source-policy guardrails.
4. Begin the next coherent implementation slice, `DOM-001` through `DOM-002`.
