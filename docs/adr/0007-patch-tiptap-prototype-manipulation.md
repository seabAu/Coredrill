# ADR-0007 — Patch the Tiptap prototype-manipulation vulnerability

- **Status:** Accepted
- **Date:** 2026-09-03
- **Owners:** Project owner
- **Decision register IDs:** `D-027`, `Q-004`
- **Checklist IDs:** `FND-009`, `SEC-007`

## Problem and evidence

ADR-0006 accepted an exact Tiptap 3.30.2 baseline. On 2026-09-02 GitHub
published `GHSA-cp6q-959q-f8rh`, a reviewed moderate-severity advisory for
prototype manipulation in `@tiptap/core`'s `mergeAttributes()` helper. The
advisory covers every release from 2.0.0-alpha.0 through 3.30.3 and identifies
3.30.4 as the first patched release. Coredrill's aggregate Foundation CI gate
correctly failed `pnpm audit --audit-level=low` at proof commit
`3e5235572310f0138c23443dcd8d267585dfc2fa`.

The upstream 3.30.4 release notes identify the narrowly scoped fix: untrusted
HTML attributes can no longer change an object's prototype when passed through
`mergeAttributes()`. Exact 3.30.4 packages and integrity metadata exist for
`@tiptap/core`, `@tiptap/pm`, and `@tiptap/starter-kit`; the npm release is older
than Coredrill's 24-hour minimum release-age threshold.

## Constraints

- Preserve ADR-0006's restricted local editor, canonical Coredrill document IR,
  offline behavior, and no-cloud/no-collaboration boundary.
- Keep the Tiptap package family on one exact version and retain a reviewed
  lockfile with integrity hashes.
- Clear the advisory gate without expanding the document schema or introducing
  new runtime behavior.
- Avoid adopting unrelated feature changes under the cover of a security patch.

## Options considered

1. Retain 3.30.2 and suppress the advisory. This leaves a known injection path
   in an editor that processes untrusted imported and generated content.
2. Pin the package family to 3.30.4, the first patched release. This is the
   smallest version change that clears the reviewed advisory.
3. Move to the current 3.31.0 feature release. It also contains the fix but adds
   unrelated changes and a larger regression surface.
4. Replace Tiptap. ADR-0006's adapter boundary preserves that fallback, but the
   available security patch makes replacement disproportionate.

## Decision and rationale

Adopt option 2. Pin `@tiptap/core`, `@tiptap/pm`, and
`@tiptap/starter-kit` to exactly 3.30.4. This preserves the accepted editor and
document architecture while applying the first upstream release that fixes the
known vulnerability.

## Consequences and migration

The package manifest and lockfile move the complete Tiptap package family from
3.30.2 to 3.30.4. No persisted document migration, contract version change, or
user action is required. A rollback to 3.30.2 is prohibited while the advisory
remains applicable; replacement behind the canonical document IR remains the
fallback if the patched release causes an uncontainable regression.

## Security, privacy, and source-policy impact

The change removes a path by which an own `__proto__` property from untrusted
JSON could create inherited executable DOM attributes during serialization. It
adds no data flow, network permission, secret, hosted service, telemetry, or
source-policy capability.

## Documents, contracts, checklist IDs, and tests to update

- Design/goal/decision-register changes: update `D-027`, resolved `Q-004`, the
  technology stack, ADR index, and version-specific proof records.
- Contracts/migrations: none.
- Checklist IDs: maintain `FND-009`; retain `SEC-007` as the release-wide audit
  gate.
- Automated/manual proof: frozen install, exact lockfile/integrity inspection,
  document typecheck/lint/build/tests, formatting, Changesets, license and secret
  checks, and `pnpm audit --audit-level=low` with no known vulnerabilities.

## Revisit trigger

Revisit if a later advisory affects 3.30.4, a patched release changes the
restricted editor's schema/serialization behavior, the Tiptap packages can no
longer remain exactly aligned, or the adapter replacement trigger from ADR-0006
is met.
