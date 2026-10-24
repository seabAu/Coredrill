# Dependency security maintenance — 2026-10-24

Status: complete final-source local/serial extension and result-policy checks pass; inspected commit/new exact hosted proof remains.

## Failed gate and bounded scope

The fixed-intent interaction runtime's UI-corrected whole gate72131 ends
`RECORDED_INTERACTION_RUNTIME_FULL_UI_CORRECTED_EXIT=1`. All2,642 units/coverage,
35 type tasks,22 lint/build tasks, UI7/shell76/resilience71/onboarding7/document13/
browser-storage13/native21, Rust24 plus one separately run OS-secret test,
archive/backup/schema/license/secret checks pass before npm audit reports9
findings:2 high,4 moderate,3 low. Cargo audit, Changesets and serial extension
do not execute after npm failure. Retain that failed log and the separate
`test-results/recorded-interaction-runtime-audit-before.json` receipt (exit1).

Machine-readable review identifies five packages, not four: the fifth is the
build-only serialize-javascript dependency under Workbox's Rollup Terser plugin.
No evidence here establishes exploitation of an actual user vault.

## Official version review and selection

| Package                                       | Current | Selected fix | Published UTC      | License      |
| --------------------------------------------- | ------- | ------------ | ------------------ | ------------ |
| zod (contracts/documents)                     | 4.4.3   | 4.6.6        | October11 16:18:23 | MIT          |
| undici (license tool subtree)                 | 6.28.1  | 6.29.1       | October15 14:19:28 | MIT          |
| ip-address (license tool subtree)             | 10.7.1  | 10.7.4       | October11 19:34:42 | MIT          |
| fast-uri (Workbox/Ajv subtree)                | 3.1.8   | 3.1.9        | October19 23:05:26 | BSD-3-Clause |
| serialize-javascript (Workbox/Rollup subtree) | 7.1.0   | 7.1.3        | October22 21:24:35 | BSD-3-Clause |

Official npm metadata is reviewed at08:48UTC October24. Every selected release
exceeds the unchanged minimumReleaseAge1440. Undici requires Node>=18.17,
ip-address>=12 and serialize-javascript>=20, compatible with pinned24.19.0.
No selected package adds runtime dependencies. Registry latest Zod4.6.7,
Undici8.12.3, fast-uri4.2.3 and serialize-javascript7.1.4 are not substituted.
Zod4.6.6 is the smallest fixed4.x release, not a4.4 patch release.

Primary sources:

- [Zod4.6.6 release](https://github.com/colinhacks/zod/releases/tag/v4.6.6) and
  [size-before-elements fix](https://github.com/colinhacks/zod/pull/6652), for
  [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
- [Undici6.29.1 release](https://github.com/nodejs/undici/releases/tag/v6.29.1),
  covering GHSA-xjj6-f33q-929c and GHSA-4qv8-2p9j-2685 in the current audit.
- [ip-address10.7.4 release](https://github.com/beaugunderson/ip-address/releases/tag/v10.7.4),
  for GHSA-rxp7-6hxx-x8q5.
- [fast-uri3.1.9 release](https://github.com/fastify/fast-uri/releases/tag/v3.1.9),
  covering GHSA-w74x-v6f9-j3xg, GHSA-wjr9-j795-jxcr, GHSA-xhq7-xmqj-769h and
  GHSA-333x-w4r6-6crp.
- [serialize-javascript7.1.3 release](https://github.com/yahoo/serialize-javascript/releases/tag/v7.1.3),
  for GHSA-m5mm-p8h7-m29v.
- Exact public registry manifests at `https://registry.npmjs.org/<name>/<version>`
  provide engines/license/integrity; package-level time metadata provides age.

Zod's release explicitly discloses a September21 compromised Git credential,
same-day reversion and history cleanup, and states no malicious commit reached
npm. Do not conceal this selection risk. Its npm gitHead284243fb0d6532665afdc9239188773bb624f73c
and the documented clean9c219833c3a3764fa1f1ea9c5ecec8254a63c0b1 are independently
queried through GitHub's Git API: both tree hashes equal
67baa8ff8a4500af08caea054afafcdbc26266b3. Official registry metadata includes a
SLSA provenance URL. Matching trees/metadata are not a claim of complete source
audit or independent cryptographic attestation verification. Normal package
integrity enforcement, scripts-disabled install, license/secrets and complete
regression proof remain mandatory.

## Execution plan and authority

Document10 explicitly permits compatible version maintenance; October19–21
security records establish the same procedure. These changes retain the existing
libraries, architecture/support floors, Tiptap3.30.5, Temporal0.5.1/jsbi4.3.2,
permissions and stored schema. No Accepted decision or new ADR is required.
This lifts the source freeze only for bounded security maintenance and proof.

First add synthetic bounded array/set/map early-cardinality regression tests and
retain their pre-update failures. Then align both exact Zod pins at4.6.6, advance
the three existing vulnerable transitive overrides, and add a parent-scoped
`@rollup/plugin-terser@1.0.0>serialize-javascript`7.1.3 override. Keep release age,
script restrictions and audit severities unchanged. Generate the lock scripts-
disabled, reject unrelated upgrades, frozen-install scripts-disabled, then audit
all severities and licenses. Bind inventory to the actual reviewed hash/counts.

Require strict types, unchanged generated contract schemas, regression/full
verify, serial extension, final policy and a new exact committed hosted run.
Do not suppress findings, install unrelated packages, regenerate changed contracts
blindly or claim earlier product passes cover the new graph. Full INT-007/INT-008
and release gates remain open.

## Initial patched review and schema compatibility finding

Pre-update collection tests fail all3: array/set visit10,000 elements and map
visits20,000 before rejecting size. Patched tests pass3 without visiting an
element. Scripts-disabled lock resolution and frozen install both consume exit0;
the reviewed diff changes only the five named identities/integrities and their
references, no unrelated package resolution. Install reports+9/-5 with four
records reused and five downloads; this is not nine new graph identities.
Fresh audit reports zero findings across937 resolutions/108 optional. Licenses
pass831 npm records/23 roots and498 Cargo records. All logs use
`test-results/interaction-security-*` names; the first combined review stops at
schema drift before audit/license, which are then independently executed.

The schema checker matches6/7 and rejects portable-data-export v1. Read-only
structural comparison shows Zod now extracts the root's global metadata ID into
a named $def and $ref; do not regenerate the published contract silently. The
installed4.6.6 declaration documents a supported per-conversion metadata registry.
An explicit registry retaining the root title/description but not its extraction
ID produces a structure deeply identical to the committed standalone schema.
Use that supported option, keep the public root $id unchanged, and prove every
generated schema still matches after rebuilding. No validator/schema constraint,
contract version or stored schema changes. Preserve the original checker failure.

The supported explicit standalone metadata registry is implemented without
regenerating any schema artifact. Rebuild and all7 schema checks pass; the original
stable-root assertion plus new security cases pass11 tests/two files, terminal
`INTERACTION_SECURITY_SCHEMA_COMPATIBILITY_EXIT=0`. Registry metadata preserves
title/description; the public root $id stays unchanged. Inventory1.32 binds the
reviewed graph to SHA-256
fc115519a541e3fa6b9dbc9f56bc31579413c080ab6591b7e8010cfe58d2142d.
Next run final formatting/policy and a fresh complete gate plus serial extension
on these sources. Only after their terminal success may ordinary commit/push and
new exact hosted proof proceed. No current complete/hosted success is claimed.

Final pre-gate policy3489 is consumed exit0, terminal
`INTERACTION_SECURITY_FINAL_POLICY_EXIT=0`: boundaries/foundation52 dependencies,
three toolchains/16 targets/ten accessibility records,831 npm/498 Cargo licenses
and secrets pass. No published schema, migration or Rust source differs. Fresh
whole verification and then serial extension use
`recorded-interaction-runtime-security-patched-full.log` /
`recorded-interaction-runtime-security-patched-extension.log`; require terminal
`RECORDED_INTERACTION_RUNTIME_SECURITY_PATCHED_FULL_EXIT` and
`RECORDED_INTERACTION_RUNTIME_SECURITY_PATCHED_EXTENSION_EXIT` independently.
Source/tests/lock/inventory are now frozen; only result records may change while
following that same process. Preserve all older failures as failures.

## Patched whole-gate unit failure retained

Process18743 consumes exit1, terminal
`RECORDED_INTERACTION_RUNTIME_SECURITY_PATCHED_FULL_EXIT=1`. Formatting/policy,
35 type tasks and22 lint tasks pass; units pass2,625 and fail20 in the single
retained-listing-comparison file. Coverage/build/browser/native/extension do not
run after that failure. Isolated replay retains the same20 failures/17 passes in
`interaction-security-listing-focused-before.log`. A minimal actual compiled Node
capture/analysis/comparison diagnostic succeeds, so do not yet attribute a cause
to Zod or relax validation. Lift the freeze only for content-free test diagnosis
and a scoped proven compatibility correction, then require a fresh complete gate.

Content-free diagnostics locate `JobCandidateNormalizationError/input_invalid`
after both capture envelopes validate. Actual compiled Node with a full synthetic
posting reproduces it; the earlier minimal posting did not exercise object-valued
salary/location. Graph inspection shows candidate value/rawValue now share the
same object. The normalizer's existing repeated-reference/cycle guard correctly
rejects that graph. Do not remove or weaken the guard. Restore explicit owned
JSON-tree copies at the shared validated JSON-value boundary, using Zod's
type-preserving overwrite API and preserving literal scalar values (including
negative zero). Add a pre-fix ownership regression, prove published schemas remain
unchanged, then rerun the original comparison/security suites and full gate.
Temporary test-only diagnostics may be removed after this proof; no private data
is logged and no production error disclosure is introduced.

The ownership regression fails before correction. Zod4.6.6 also accepts a cyclic
graph in an isolated JSON-value probe; the new serialized-tree boundary rejects
that non-JSON input with an aborting refinement before copying. The first
non-aborting draft reaches copying and throws RangeError; that failed log remains
`interaction-security-json-ownership-after.log`. Corrected aborting refinement and
independent tree copies pass59 focused cases, preserving BOM/NUL/negative-zero
scalars and the unchanged normalizer guard. Original listing test source is
restored exactly, with no diagnostic wrapper or relaxed assertion left behind.

An additional reserved-key test initially assumes **proto** retention. Direct
inspection of the previously installed4.4.3 parser proves its established behavior
also removes that key while preserving an inert own constructor key and never
sharing sibling objects. The corrected test checks that same sanitation and
unmodified input, not a new data-retention policy. Scalar/type/cycle/ownership,
original comparison and normalization cases pass69 checks. The newer4.6.7 release
is also inspected; its notes contain only a version commit, not a fix for this
behavior, so no unrelated version substitution is made.

Applying validation/copy checks causes Zod to inline a duplicate anyOf alongside
existing local JSON-value references in three generated schemas. A narrowly
scoped supported serializer override keeps the referenced definition authoritative;
the definition is not weakened or removed. All7 published JSON Schema artifacts
again match unchanged after rebuild, terminal
`INTERACTION_SECURITY_JSON_COMPATIBILITY_FINAL_EXIT=0`. No schema artifact or
migration is edited. Strict source lint identifies one optional-chain preference;
correct it without a suppression before fresh complete verification.

Corrected strict source lint passes. No original listing test or normalizer guard
diff remains. Fresh final JSON-compatible security-patched verification uses
`recorded-interaction-runtime-security-json-compatible-full.log` and the serial
extension log `recorded-interaction-runtime-security-json-compatible-extension.log`;
require terminal `RECORDED_INTERACTION_SECURITY_JSON_COMPAT_FULL_EXIT` and
`RECORDED_INTERACTION_SECURITY_JSON_COMPAT_EXTENSION_EXIT`. Source/tests/lock/
inventory are frozen again; follow the same process and update only result records.
No older failed gate is relabeled and no complete current success is claimed.

## Complete final-source gate and serial extension pass

Process32515 is consumed exit0. Both retained terminal markers are0:
`RECORDED_INTERACTION_SECURITY_JSON_COMPAT_FULL_EXIT=0` and
`RECORDED_INTERACTION_SECURITY_JSON_COMPAT_EXTENSION_EXIT=0`. Final graph/source
passes211 unit files/2,657 cases and coverage,35 type tasks,22 lint/build tasks,
UI7/shell76/performance1/resilience71/onboarding7/documents13/browser-storage13/
native21, Rust24 plus one separately executed redacted OS-secret case, archive/
backup/schema/license/secret/Changesets checks. All9 serial extension cases pass
31.1s. Local browser156.0.4314.42 and extension Chromium149/Firefox151 are diagnostics,
not the new exact hosted-floor proof. All10 recovery ZIP/JSON files still match
their HEAD Git objects. No product/test/lock changes follow these passes.

npm audit reports no known vulnerabilities. Cargo audit is terminal success with
zero vulnerabilities but now eleven allowed informational warnings, not ten:
nine maintenance warnings plus glib and newly issued Tokio RUSTSEC-2026-0386.
The fresh machine-readable receipt `interaction-security-cargo-audit.json` confirms
both counts and exact advisory IDs at the unchanged Cargo lock hash. Only Cargo
result metadata/watch records change after the gate, not dependency selections.

### New Tokio informational warning: scope and retained follow-up

[RustSec RUSTSEC-2026-0386](https://rustsec.org/advisories/RUSTSEC-2026-0386.html)
identifies I/O-safety violations in Unix AsyncFd constructors and marks1.53.3
patched by deprecating safe constructors in favor of unsafe registration with
explicit lifetime/ownership obligations. Current Tokio1.53.1 is not updated in
this five-package JavaScript maintenance slice. Owned Rust source has no direct
AsyncFd/AsRawFd/BorrowedFd/tokio call; this is not proof of transitive Unix safety.
Require targeted caller/compatible patch review before public Unix acceptance,
tracked for October25. Existing native/manual/reference-hardware/release gates
stay open. No advisory exclusion, warning-policy change or owner risk waiver is
introduced; do not describe the warning as harmless or a fully clean Rust graph.

Final result-doc formatting/policy, inspected ordinary commit/push and a new exact
hosted run remain required. Prior00ff32a hosted success does not cover this source.
Full INT-007/INT-008 and the overall goal remain open.

## Inspected checkpoint ready for normal commit

Final result formatting/policy50738 consumes exit0, terminal
`INTERACTION_RUNTIME_FINAL_RESULTS_POLICY_EXIT=0`. Exact current inventory binding,
all boundaries/foundation/license/secret checks pass after the honest Cargo result
metadata update. Remote fetch succeeds; HEAD/origin/main remain exact00ff32a with
zero divergence. Stash2697ebcec53351a052d8c5c19e2b8e2a52056a70 remains intact.
All41 reviewed paths belong to this carried runtime/result/UI/security slice;
no ADR, migration, published JSON Schema, Cargo pin/source or permission changes.
No source/test/lock change follows complete verification. Ordinary commit/non-force
push and new exact hosted proof remain under standing owner authorization.
