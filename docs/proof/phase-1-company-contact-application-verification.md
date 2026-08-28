# Phase 1 company/contact application verification

Date: 2026-08-28

Checklist scope: `APP-004`

Package: `@coredrill/application`

Decision changes: none

## Outcome

`APP-004` adds adapter-neutral `CreateCompany` and `CreateContact` application commands over a narrow local `CompanyContactPort`. The application implementation commit is `4632487`.

The company command requires an explicit `user_entered` origin. Source-backed company data therefore cannot bypass the validated capture/evidence boundary and silently lose provenance. A contact may be explicitly `user_entered` or `source_backed`: manual contacts are user-confirmed with no invented confidence or provenance, while source-backed contacts remain unconfirmed and require exact field-level provenance for every populated imported field.

The port atomically persists a contact and all of its provenance links. It has no enrichment, email-pattern inference, messaging, outreach, or network capability.

## Relationship and provenance proof

| Contract                  | Enforced behavior                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operation shape           | Company and contact creation are explicit PascalCase transactional commands.                                                                                                                                                          |
| Local identity and audit  | Company, contact, and provenance-link identities are locally generated UUIDv7 values; creation/update time comes from `ApplicationOperationContext.initiatedAt`.                                                                      |
| Company origin            | `CreateCompany` accepts only explicit `user_entered` data. Source-backed company fields must enter through the capture/evidence flow.                                                                                                 |
| Company relationship      | A contact may reference one validated local company UUIDv7 or remain unassigned; storage adapters report missing companies with a stable content-free code.                                                                           |
| Manual contact            | `user_entered` contact fields are marked user-confirmed, carry no confidence score, and cannot attach source provenance metadata.                                                                                                     |
| Source-backed contact     | Imported contact fields are not user-confirmed, require a finite 0–1 confidence, cannot smuggle copied source text into notes, and retain explicit provenance.                                                                        |
| Exact provenance coverage | Each populated source-backed field (`name`, `role`, `email`, `phone`, or `public_profile_url`) has exactly one provenance reference. Missing, duplicate, unknown, invalid, or value-less links fail before persistence.               |
| No guessed data           | Absent contact role, email, phone, and public-profile URL remain `null`; the command never derives an email or other contact point.                                                                                                   |
| Value binding             | The application hashes the exact normalized stored value through an injected local hashing boundary and accepts only a lowercase SHA-256 digest. Links are generated in a deterministic reviewed field order.                         |
| Atomic persistence        | `CompanyContactPort.createContact` receives the contact and immutable provenance-link collection in one call and is contractually required to store them in one transaction.                                                          |
| Confirmation protection   | This slice exposes creation only. It has no update or replacement operation that could silently overwrite user-confirmed contact data.                                                                                                |
| Returned-state validation | Adapter results are copied, frozen, fully parsed, and matched against the initiating command; missing nullable properties and any identity, content, state, or audit mismatch fail closed.                                            |
| Stable failures           | Reviewed relationship codes map to stable `validation`, `conflict`, `not_found`, `unavailable`, `permission_denied`, or `internal` application errors with explicit retryability. Arbitrary adapter exception text is never returned. |

All fixtures are synthetic and contain no provider credential, token, private page, real employer contact, or applicant data.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run packages/application/test/company-contact.test.ts`                      | Passed: 1 file and 44 focused relationship, provenance, validation, atomic-port, safe-failure, and fail-closed tests. The initial test-first checkpoint failed all 41 tests because the API did not yet exist; an incremental origin-routing checkpoint then failed the two new cases until source-backed companies were excluded from the manual command. |
| `pnpm --filter @coredrill/application typecheck`                                              | Passed production and test TypeScript checks.                                                                                                                                                                                                                                                                                                              |
| `pnpm --filter @coredrill/application lint`                                                   | Passed with zero warnings.                                                                                                                                                                                                                                                                                                                                 |
| `pnpm test:coverage`                                                                          | Passed: 33 files and 301 tests; 90.90% statements, 81.76% branches, 97.37% functions, and 93.74% lines overall. The application package reported 92.29% statements, 89.40% branches, 100% functions, and 97.04% lines; `company-contact.ts` reported 91.93%, 88.81%, 100%, and 97.00% respectively.                                                        |
| `pnpm verify`                                                                                 | Passed with exit code 0 across formatting, architecture, typecheck, lint, unit, coverage, build, browser/native storage and recovery, extension packaging, schema, license, secret, dependency-audit, and Changesets gates.                                                                                                                                |
| [Foundation CI run 33216934661](https://github.com/seabAu/Coredrill/actions/runs/33216934661) | Passed implementation commit `4632487` in the aggregate foundation gate, exact Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native package lanes, extension transfer/reproducibility, and the full-history secret scan.                                                                                                                  |

The dependency audit reported zero known vulnerabilities and the 15 already-reviewed allowed transitive Rust warnings in the native Linux/Tauri dependency graph.

## Implementation surfaces

- `packages/application/src/company-contact.ts` — local port, immutable DTOs, stable errors, normalized relationship validation, and company/contact commands.
- `packages/application/src/index.ts` — reviewed public application API.
- `packages/application/test/company-contact.test.ts` — origin routing, nullable-field behavior, exact provenance coverage, atomic port input, immutable output, failure mapping, and redaction proof.
- `.changeset/company-contact-provenance-commands.md` — package API change record.

## Boundaries and remaining work

- Concrete browser/native adapter composition and user-interface wiring are not claimed by this use-case slice.
- Source-backed company extraction remains owned by the capture/evidence boundary; this command cannot create one without provenance.
- Contact-value hashing is injected so the application package retains its reviewed domain/contracts-only dependency boundary.
- No command discovers, enriches, guesses, messages, or performs outreach to a contact.
- `APP-005` is next for Pipeline counts, board groups, table pagination, and the job-workspace query DTO.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes; `GATE-0` still requires the owner-authorized participant study.
- No ADR is required because no Accepted decision changed.
