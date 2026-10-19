# Dependency security maintenance — 2026-10-19

Status: complete local verification; hosted verification pending.

The Q3-005 repository gate passed the unit, coverage, build, browser, native,
license, and secret checks before its final npm audit reported six advisories
absent from the preceding clean review. The audit gate was retained. Exact transitive overrides address all
six while preserving every accepted direct dependency and editor/importer
boundary.

| Affected resolution                          | Selected resolution                          | Primary advisory                                                                        |
| -------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| shell-quote 1.10.0                           | 1.11.0                                       | [command injection](https://github.com/advisories/GHSA-pqg4-j6r4-53mv)                  |
| source-map-js 1.2.1                          | 1.2.2                                        | [indexed-map denial of service](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)      |
| prosemirror-view 1.42.2                      | 1.42.3                                       | [paste XSS](https://github.com/advisories/GHSA-c8x8-7fp4-3x9w)                          |
| postcss-selector-parser 7.1.5                | 7.1.6                                        | [selector parsing denial of service](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) |
| http-cache-semantics 4.2.0                   | 4.3.0                                        | [cache disclosure](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)                   |
| Mammoth's argparse 1.0.10 → sprintf-js 1.0.3 | Mammoth-scoped argparse 2.0.1; no sprintf-js | [precision denial of service](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)        |

## Version and compatibility review

Official npm metadata was queried for exact versions, integrity, licenses,
repositories, and publication dates. The first four patches were published on
2026-09-29, 2026-09-30, 2026-08-24, and 2026-09-03 respectively. The published
cache fix is 4.3.0 (2026-10-04); the audit's suggested 4.2.1 does not exist in
the registry. Likewise, the suggested sprintf-js 1.1.4 is unpublished and the
latest published 1.1.3 remains affected.

The scoped `mammoth@1.12.1>argparse` override selects the already published
2.0.1, whose compatibility API preserves Mammoth's existing calls and whose
dependency list has no sprintf-js. The [upstream argparse changelog](https://github.com/nodeca/argparse/blob/master/CHANGELOG.md)
documents the 2.x rewrite and the later removal of the v1 compatibility API in
3.0.0. The newest 3.x line is therefore not silently substituted. Node 24
satisfies the 2.x Node 10 minimum. All six selections exceed the repository's
24-hour release-age threshold.

The actual installed Mammoth executable is tested with `--help` and a real
synthetic DOCX conversion. The test checks the exact paragraph, strong/emphasis
markup, organization, and role output, along with the installed parser version
and absence of the vulnerable dependency. Its v1 calls emit upstream
deprecation warnings, and the synthetic Title style emits its existing warning;
conversion remains successful. Browser import regression remains required
before handoff. The accepted Mammoth package and import interface stay at
1.12.1; Tiptap remains aligned at 3.30.5.

## Current proof

- Frozen-lockfile install passed.
- `tooling/tests/document-cli-security.test.mjs` passed.
- License policy passed for 520 JavaScript records and 498 Rust crates.
- `pnpm audit --audit-level=low --json` reports zero advisories at every severity
  across 935 dependency resolutions, including 108 optional resolutions.
- `sprintf-js` is absent from the lockfile. No audit exclusion or suppression
  was added, and the zero-finding foundation policy remains enforced.
- The refreshed dependency inventory is v1.28.0 and binds the graph to lockfile
  SHA-256 `b9f2eed77cc98a222dd1291da22a93360bbf9e2f4e728544841f2594bf34f456`.
- The complete `pnpm verify` gate passed: 120 unit files / 909 tests, coverage
  thresholds, builds/static/policy, 76 application-shell, four production-PWA
  resilience journeys including the new offline Phase 3 case, 13 document-browser,
  eight browser-storage, seven onboarding, five UI-foundation, performance,
  native 13 TypeScript / 11 Rust tests, secure-store/recovery, license/secret,
  contract schemas, audits, and Changesets checks.

## Rust maintenance review

The current RustSec database reports zero vulnerabilities and ten informational
warnings: nine unmaintained and the existing glib unsoundness. Three new
2026-10-16 advisories concern `zvariant`, `zbus_names`, and `zvariant_derive`.
Their exact official RustSec records were read from the fetched advisory DB;
each says the standalone crate was merged into zbus 6 and recommends migration.
See the [upstream migration issue](https://github.com/z-galaxy/zbus/issues/2043).

`cargo tree --locked --target all -i zvariant@5.15.0` confirms the path through
zbus 5.19.0 / secret-service 5.1.0 / zbus-secret-service-keyring-store 1.0.1.
The direct store dependency is confined to Linux in Cargo.toml. Windows and
macOS retain their separate accepted providers. Linux native remains diagnostic
under ADR-0004; this maintenance finding does not expand support. No crate,
audit configuration, warning policy, or exception changed. The dependency
inventory now records the current ten-warning result instead of its historical
warning list. A later backend migration needs upstream compatibility review and
the secure-store lifecycle proof.

The Q3-005 implementation remains under verification. Its seeded starting
document/application scaffold is still an explicit incomplete boundary in the
[canonical journey report](phase-3-canonical-journey-verification.md).

No Accepted architecture, direct dependency choice, data contract, schema,
source policy, or permission changes. These are reviewed transitive maintenance
changes; no ADR or policy exception is required.
