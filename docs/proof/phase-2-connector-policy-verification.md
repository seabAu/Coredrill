# Phase 2 connector policy verification

Date: 2026-08-30

Branch: `main`

Implementation commit: `ef1daa0447d1208baee23b9a7875fee3b1d3681e`

Hosted proof commit: `37a815f2498c272ed1c97f1f5c2464ce439f6f83`

## Outcome

`XTR-001` is proven. Coredrill now has an exported, dependency-free `@coredrill/source-policy` boundary that validates immutable version-1 connector records and authorizes each proposed network acquisition against the checked-in record plus injected runtime controls. Unknown, disabled, stale, method-mismatched, destination-mismatched, globally killed, and individually killed connectors fail closed before a network client exists.

The checked-in production record set is intentionally empty. This slice therefore enables no real connector and makes no terms, privacy, license, rate-limit, or interface-review claim for Greenhouse, Lever, USAJOBS, or another source. Manual capture is an explicit non-network request kind and remains available without registry contents or runtime-control state.

## Strict record and registry boundary

`ConnectorPolicyRecordV1` requires exactly these reviewed fields: specification version, stable ID, owner, enabled/disabled status, allowed acquisition methods, exact destination hosts, terms and privacy URLs, license/reuse basis, review and due instants, rate policy, retention policy, attribution policy, credential mode, user-visible data-flow statement, and a declared kill switch.

The parser and registry reject:

- missing or extra record fields, unsupported versions, and absent kill-switch capability;
- unsafe identifiers, blank/overlong/control-bearing policy text, non-canonical instants, or a due instant that does not follow its review instant;
- non-HTTPS or credential-bearing terms/privacy URLs and non-default policy URL ports;
- uppercase, wildcard, trailing-dot, single-label, malformed, or duplicate destination hosts;
- empty, duplicate, unsupported, or oversized method/domain arrays;
- more than 64 records, duplicate connector IDs, and malformed registry inputs.

Accepted records, arrays, decisions, and the registry surface are frozen. Records are sorted by ID, making registry order deterministic.

## Authorization and kill-switch behavior

Every network request is revalidated as an exact version-1 shape. Its connector ID, acquisition method, destination URL, and canonical current instant are caller-supplied policy inputs rather than trusted ambient state. Runtime control is also revalidated, bounded to 64 targeted connector IDs, and rejects extra fields, duplicate IDs, or malformed entries.

Authorization checks the following conditions before returning `connector_allowed`:

1. a checked-in record exists;
2. the record is enabled;
3. neither the global nor connector-specific runtime kill switch is active;
4. the supplied instant is within the half-open reviewed interval;
5. the requested acquisition method is explicitly allowed; and
6. the destination is HTTPS, contains no URL credentials, uses no custom port, and has an exact allowed hostname.

Host matching does not expand `api.example` to `sub.api.example`. Unknown methods and malformed URLs are denied without network access. Policy failures expose stable, content-free codes or denial reasons and never echo captured material.

Manual capture is parsed before runtime control because it is not a network connector. It remains allowed with an empty registry, omitted runtime state, a global network disable, or a targeted connector disable.

## Synthetic and property proof

The focused source-policy suite contains ten tests and uses only `.example` domains. Deterministic cases cover strict parsing and freezing, unsafe records and bounds, duplicate registry IDs, exact destination authorization, subdomain/custom-port/HTTP denial, unknown/disabled/future/stale policies, method mismatch, targeted/global kills, malformed requests/runtime state, and the empty production registry.

A fast-check property generates 100 arbitrary lowercase subdomain prefixes and proves that none inherit permission from the registered parent hostname.

The retained machine-readable result is:

```json
{
  "strictRecordAccepted": true,
  "exactDestinationAllowed": true,
  "unknownConnectorDenied": true,
  "targetedKillSwitchDenied": true,
  "globalKillSwitchDenied": true,
  "manualCaptureUnaffected": true,
  "productionNetworkRecords": 0
}
```

Focused V8 coverage for `packages/source-policy/src/**/*.ts` is 90.07% statements, 89.39% branches, 100% functions, and 91.86% lines.

## Local verification

The retained final `pnpm verify` invocation exited successfully and reproduced:

- formatting, 19 package-boundary policies, and 49 dependency/foundation records;
- typecheck, lint, and build across 22 packages, including source-policy test typechecking;
- 65 unit files and 577 tests, with the exact `XTR001_PROOF` record emitted in both unit and coverage passes;
- 82.01% statements, 75.05% branches, 81.83% functions, and 84.56% lines overall;
- all 63 application-shell cases plus UI-foundation, performance, resilience, onboarding, document, and browser-storage suites;
- the schema-92 repository manifest in browser SQLite and the native SQLite adapter;
- 12 native Vitest cases, 11 passing Rust tests plus one intentional secure-store harness exclusion, native secure-store/archive/backup proofs, and generated-contract drift checks;
- 520 npm and 498 Rust license records, workspace secret scanning, zero known npm vulnerabilities, and the existing 15 explicitly allowed Rust maintenance/unsoundness warnings; and
- a valid Changesets release record for `@coredrill/source-policy`.

No dependency or lockfile change was required.

## Hosted clean-commit proof

The exact hosted proof commit completed [Foundation CI run 33319029910](https://github.com/seabAu/Coredrill/actions/runs/33319029910) successfully. The [aggregate quality job 99277646324](https://github.com/seabAu/Coredrill/actions/runs/33319029910/job/99277646324) emitted the exact `XTR001_PROOF` record in both unit and coverage passes, passed 65 test files and 577 tests each time, recorded 82.01% statements / 75.03% branches / 81.83% functions / 84.56% lines, validated generated schemas, passed 520 npm and 498 Rust license records, found no known npm vulnerabilities, and retained the 15 reviewed Rust warnings.

The clean matrix also passed:

- [Chrome 151 job 99277646453](https://github.com/seabAu/Coredrill/actions/runs/33319029910/job/99277646453) and [Chrome 152 job 99277646462](https://github.com/seabAu/Coredrill/actions/runs/33319029910/job/99277646462);
- [Firefox 153 job 99277646523](https://github.com/seabAu/Coredrill/actions/runs/33319029910/job/99277646523) and [Firefox 154 job 99277646468](https://github.com/seabAu/Coredrill/actions/runs/33319029910/job/99277646468);
- [Windows job 99277646479](https://github.com/seabAu/Coredrill/actions/runs/33319029910/job/99277646479), [macOS job 99277646512](https://github.com/seabAu/Coredrill/actions/runs/33319029910/job/99277646512), and [Ubuntu job 99277646524](https://github.com/seabAu/Coredrill/actions/runs/33319029910/job/99277646524);
- [extension-transfer job 99277646487](https://github.com/seabAu/Coredrill/actions/runs/33319029910/job/99277646487); and
- [full-history secret-scan job 99277646527](https://github.com/seabAu/Coredrill/actions/runs/33319029910/job/99277646527).

Representative immutable artifact witnesses from that run are Windows installer artifact `9734497688` (`sha256:4e356ceb3a2698ecc8a916480103f4d1e16706788ca838ffcb222403ad66fd75`), macOS application artifact `9734411576` (`sha256:a00b16e87bb3b5665b19b44086f917ae6ee0450869f9b60f14eb4f56f3e06437`), Linux AppImage artifact `9734461633` (`sha256:2429b68c03cb903d07b505217415a7058dbaf41ef926e9e28c23173cfef1bc88`), Chromium extension artifact `9734479875` (`sha256:dbe92e376c50480296a510f295aff5eacf191198a98f6d0e3358081b0b10110b`), and extension-transfer artifact `9734365572` (`sha256:08b2ec438d4c5fc9fb5a3d5ded6a67e36eef9a71849d442c6077bc40475c957d`). XTR-001 itself introduces no binary or network artifact.

The first hosted implementation run correctly stopped in the full-history scanner because Gitleaks' generic API-key heuristic interpreted the synthetic custom-port URL as a credential. Since the scanner includes immutable history, the proof commit adds `.gitleaks.toml` with default rules retained and one `AND`-scoped exception constrained to the `generic-api-key` rule, the exact test path, and the exact synthetic line. The successful replacement run proves the historical scan passes without suppressing other paths, rules, or matching lines.

## Reviewed files

- `packages/source-policy/src/connector-policy.ts` — strict records, immutable registry, authorization, runtime controls, exact destinations, and empty production record set.
- `packages/source-policy/test/connector-policy.test.ts` — deterministic, property, malformed-input, kill-switch, manual-capture, and machine-readable proof.
- `packages/source-policy/src/index.ts` and package TypeScript configuration — public boundary exports and test typechecking.
- `vitest.config.mjs` — source-policy production code included in the repository coverage gate.
- `.gitleaks.toml` — narrow historical false-positive handling while extending the default scanner policy.
- `04-capture-extraction-sources.md`, `06-security-sync-deployment-testing.md`, and `10-technology-stack.md` — implemented pre-network gate and deliberately empty production registry.
- `.changeset/gate-network-connectors.md` — release/governance record.

## Scope and decisions

This slice adds no network client, real connector record, fetch permission, source-specific adapter, crawler, account, hosted service, remote configuration service, database migration, AI integration, or automatic capture. It implements accepted decision D-033 and the existing security/data-flow requirements without changing an accepted decision, so no ADR is required.

`XTR-002` is the next smallest unblocked slice: implement the pure Schema.org `JobPosting` parser against nested, array, graph, and malformed golden fixtures without adding network access. `GATE-1`, the representative participant study, and `FND-001` remain independently open on their recorded external owners; none is reinterpreted as complete here.
