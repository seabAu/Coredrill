# ADR-0008 — Patch the Tiptap Markdown ReDoS vulnerability

- **Status:** Accepted
- **Date:** 2026-09-17
- **Owners:** Project owner
- **Decision register IDs:** `D-027`, `Q-004`
- **Checklist IDs:** `FND-009`, `SEC-007`

## Problem and evidence

[ADR-0007](0007-patch-tiptap-prototype-manipulation.md) accepted an exact
Tiptap 3.30.4 baseline and requires reconsideration if a later advisory affects
that release. On 2026-09-08 GitHub published the reviewed high-severity
[`GHSA-j95f-988m-3j2f`](https://github.com/advisories/GHSA-j95f-988m-3j2f)
advisory for quadratic regular-expression denial of service in
`@tiptap/core`'s block and inline Markdown attribute parsers. The advisory
covers releases from 3.7.0 through 3.30.4 and identifies 3.30.5 as the first
patched release. Coredrill's aggregate verification gate now correctly fails
`pnpm audit --audit-level=low` on the exact accepted 3.30.4 graph.

The upstream signed
[3.30.5 release](https://github.com/ueberdosis/tiptap/releases/tag/v3.30.5)
describes a narrowly scoped denial-of-service fix for crafted Markdown
attributes. Exact 3.30.5 packages are published for `@tiptap/core`,
`@tiptap/pm`, and `@tiptap/starter-kit`, and the release is older than
Coredrill's 24-hour minimum release-age threshold.

Coredrill does not currently import `@tiptap/markdown`, call the affected
Markdown-spec helpers, or accept Markdown through Tiptap's content commands, so
the reviewed path is not directly reachable through the current restricted
editor. That reduces immediate exploitability but does not justify suppressing
a known high-severity advisory in a dependency that handles untrusted imported
and generated document content.

## Constraints

- Preserve ADR-0006's restricted local editor, canonical Coredrill document IR,
  offline behavior, and no-cloud/no-collaboration boundary.
- Keep the complete Tiptap package family on one exact version and retain a
  reviewed lockfile with integrity hashes.
- Clear the all-severity advisory gate without enabling Markdown ingestion or
  expanding the document schema.
- Avoid adopting unrelated feature changes under the cover of a security patch.

## Options considered

1. Retain 3.30.4 and suppress the advisory. This knowingly leaves affected code
   in the editor graph and weakens the accepted all-severity audit policy.
2. Pin the package family to 3.30.5, the first patched release. This is the
   smallest version change that clears the reviewed advisory.
3. Move to 3.30.6. It also contains the security fix, but includes unrelated
   Markdown, list, YouTube, and React behavior changes and therefore creates a
   larger regression surface.
4. Move to the current 3.31 line or replace Tiptap. Both preserve a secure path,
   but are disproportionate while a narrow compatible patch exists.

## Decision and rationale

Adopt option 2. Pin `@tiptap/core`, `@tiptap/pm`, and
`@tiptap/starter-kit` to exactly 3.30.5. This preserves the accepted editor and
document architecture while applying the first upstream release that fixes the
known ReDoS vulnerability.

## Consequences and migration

After acceptance, the package manifest, lockfile, dependency inventory,
Changeset, decision register, technology stack, ADR links, and version-specific
proof records will move the complete Tiptap package family from 3.30.4 to
3.30.5. No persisted document migration, contract version change, or user
action is expected. Rollback to 3.30.4 is prohibited while the advisory remains
applicable; replacement behind the canonical document IR remains the fallback
if the patched release causes an uncontainable regression.

## Security, privacy, and source-policy impact

The change removes quadratic Markdown attribute parsing paths that can block a
browser main thread, server event loop, or worker. It adds no data flow, network
permission, secret, hosted service, telemetry, Markdown feature, or
source-policy capability.

## Documents, contracts, checklist IDs, and tests to update

- Design/goal/decision-register changes: update `D-027`, the technology stack,
  ADR index/links, dependency inventory, Changeset, and version-specific proof
  records.
- Contracts/migrations: none.
- Checklist IDs: maintain `FND-009`; retain `SEC-007` as the release-wide audit
  gate.
- Automated/manual proof: frozen install, exact lockfile/integrity inspection,
  document typecheck/lint/build/unit/browser tests, formatting, Changesets,
  license and secret checks, and `pnpm audit --audit-level=low` with no known
  vulnerabilities.

## Revisit trigger

Revisit if a later advisory affects 3.30.5, a patched release changes the
restricted editor's schema/serialization behavior, the Tiptap packages can no
longer remain exactly aligned, or the adapter replacement trigger from ADR-0006
is met.
