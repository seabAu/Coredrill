# Accepted civil-time dependency review — 2026-10-21

Scope: owner-accepted ADR-0009 / D-056, exact @js-temporal/polyfill 0.5.1 plus its only transitive dependency, scoped jsbi 4.3.2. No unrelated package upgrade, global patch, provider/service, schema, native IPC or permission change. Installation is not completed scheduling proof; INT-004 remains unchecked.

## Exact provenance and graph

Official version metadata was re-queried before adoption: [Temporal 0.5.1](https://registry.npmjs.org/@js-temporal%2fpolyfill/0.5.1), [JSBI 4.3.2](https://registry.npmjs.org/jsbi/4.3.2). Current Temporal registry version is 0.5.1; the reviewed pre-1.0 roadmap remains a maintenance risk. The [tagged upstream usage documentation](https://github.com/js-temporal/temporal-polyfill/tree/v0.5.1) supports imported module use; the product deliberately omits prototype/global modification. The helper uses explicit earlier/later interpretation and rejects any interpretation with a different local clock, following [Temporal conversion semantics](https://tc39.es/proposal-temporal/docs/zoneddatetime.html). Future conversions depend on host Intl timezone rules, not a claim of identical timezone database versions across devices.

`accepted-civil-time-install.log` passes `ACCEPTED_CIVIL_TIME_INSTALL_EXIT=0`, adding exactly two resolutions. The lockfile contains registry-provided integrities:

| Package                     | License    | Integrity                                                                                         |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| @js-temporal/polyfill 0.5.1 | ISC        | `sha512-hloP58zRVCRSpgDxmqCWJNlizAlUgJFqG2ypq79DCvyv9tHjRYMDOcPFjzfl/A1/YxDvRCZz8wvZvmapQnKwFQ==` |
| jsbi 4.3.2                  | Apache-2.0 | `sha512-9fqMSQbhJykSeii05nxKl4m6Eqn2P6rOlYiS+C5Dr/HPIU/7yZxu5qzbs40tgaFORiw2Amd0mirjxatXYMkIew==` |

The product lockfile SHA-256 is `a098af460c682f046440ed6c7724f22b3b6149ac27d25987a347e453d6cf36fa`. `accepted-civil-time-audit.json` reports no findings across 937 resolutions (including 108 optional); no audit exclusion was added. This is a dated audit, not a guarantee of future vulnerability absence.

## License coverage repair

The old root-only checker still reported 520 packages after installation, exposing that pnpm's isolated workspace links were not traversed from the root manifest. An explicit web-root scan fails on three pre-existing metadata/policy interpretation cases; that failure is retained in the terminal record. The repair scans every existing first-level apps/packages manifest plus root and rejects inconsistent duplicate package metadata. `accepted-civil-time-workspace-licenses.log` passes `ACCEPTED_CIVIL_TIME_WORKSPACE_LICENSES_EXIT=0`: 831 unique installed npm records across 23 manifest roots; Cargo remains 498 records. This covers installed graphs, not uninstalled platform-specific optional packages. Packaging/release notice assembly remains independently required.

- [Duck 0.1.12's actual license](https://raw.githubusercontent.com/mwilliamson/duck.js/0.1.12/LICENSE) has two BSD conditions despite ambiguous `BSD` package metadata. The correction requires that exact version, reported `UNKNOWN` and installed LICENSE SHA-256 `6663bbd049205d38a496ccacb412a151980b444627d38de218b3b809aef330f1`. Changed/missing bytes fail; there is no general unknown-license exemption.
- [JSZip 3.10.1](https://raw.githubusercontent.com/Stuk/jszip/v3.10.1/LICENSE.markdown) explicitly offers MIT as an alternative to GPL. The bounded expression parser accepts an allowed OR alternative, not GPL-only or a required GPL conjunction. MIT attribution obligations remain.
- Pako 1.0.11 declares MIT AND Zlib. Its installed root LICENSE and `lib/zlib/README` retain both notices, including origin/alteration/notice requirements. Zlib is now explicitly included in the reviewed permissive policy; neither required obligation is dropped. The [upstream root license](https://raw.githubusercontent.com/nodeca/pako/1.0.11/LICENSE) and bundled zlib notice remain distribution inputs.

Twenty-seven policy regressions pass for AND/OR precedence, parentheses, required prohibited obligations, malformed tails, unknowns, unsupported exceptions, resource bounds and exact legacy notice binding. Three additional discovery regressions verify private apps/shared packages, nested/reserved exclusion and an explicitly requested single root. Complete final local/hosted verification still follows; these focused checks do not retroactively make earlier root-only scans whole-workspace proof.
