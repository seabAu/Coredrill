# Extension production-package verification

Date: 2026-08-24
Scope: `EXT-007` through `EXT-008`
Status: complete — local implementation, clean source rebuild, clean-commit hosted matrix, and downloaded immutable artifact review passed

## Outcome

Coredrill now produces independently inspected Chromium and Firefox Manifest V3 store ZIPs plus a Firefox source-review ZIP. The package gate compares every store archive to its inspected unpacked production directory, rejects unsafe or unexpected archive paths, scans the complete production bundles for remote code and likely secrets, constrains the source-review archive to an exact repository allowlist, and rebuilds the Firefox package from a clean source extraction with the frozen lockfile in offline mode.

The accepted architecture decision is [ADR-0005](../adr/0005-adopt-wxt-multisurface-extension-baseline.md). `D-023` is Accepted, `Q-005` is resolved, and `EXT-007`/`EXT-008` are complete after the clean commit passed the hosted lane and the downloaded immutable artifact matched this local proof.

## Production manifest and bundle review

Command:

```text
pnpm build
pnpm check:extension-build
pnpm check:extension-packages
```

The independent production inspector requires exactly eight files per target and hashes every file. It rejects an unexpected file, permission, host permission, optional permission, content script, web-accessible resource, externally reachable Firefox origin, non-local entrypoint, weakened extension CSP, or unexpected transfer mode.

- Chromium retains only `activeTab`, `scripting`, `sidePanel`, and `storage`; empty host and optional permissions; no content scripts or web-accessible resources; a self-only extension CSP; and one exact reserved Phase 0 HTTPS external origin.
- Firefox retains only `activeTab`, `scripting`, and `storage`; empty host and optional permissions; no content scripts, web-accessible resources, or external origin; stable Gecko ID `capture@coredrill.local`; and `required: ["none"]` data collection.
- Every target's eight text files pass scans with `remoteAssets: 0`, `remoteImports: 0`, `evalCalls: 0`, and secret findings `0`.

## Store package review

WXT's production packaging commands emit:

- `apps/extension/.output/coredrillextension-0.0.0-chrome.zip` — `116602` bytes, SHA-256 `cf560272dd92b92d6547d68b6deaa554f06e084c1f852d1f69b1a61e04bf4f99`;
- `apps/extension/.output/coredrillextension-0.0.0-firefox.zip` — `116620` bytes, SHA-256 `689a2f923d73e69bf90723f28d8b97c25a0c5b1f16a8f3e5f5ff1e190eefcd50`.

For each archive, the package inspector:

1. rejects empty, absolute, drive-prefixed, traversal, and duplicate paths;
2. requires the exact inspected production-directory file set;
3. extracts to an isolated temporary directory;
4. reruns the complete manifest, bundle, remote-code, and secret inspection; and
5. requires the extracted inspection record to be byte-identical to the unpacked production directory's record.

Both store packages passed.

## Firefox source-review closure

The source-review ZIP is defined by WXT's explicit repository-root include list and an independent expected-file derivation. It contains exactly 45 files: the Apache-2.0 license, project and source-review instructions, root workspace manifests, pinned lockfile, shared TypeScript base, extension source/configuration, and the complete source/schema closure for contracts, capture core, and extension bridge.

It excludes `.git`, `.env*`, dependency directories, generated output, tests, unrelated apps and packages, publishing configuration, credentials, and all user data. Every archive path passes the safety checks, and all 45 extracted files pass the likely-secret scan with zero findings.

Local source archive:

- `apps/extension/.output/coredrillextension-0.0.0-sources.zip` — `100447` bytes, SHA-256 `aea8caddc639796ebca2222ce1214aa884640caf96892ef197f42a26e54bb7b5`.

The archive includes [SOURCE_CODE_REVIEW.md](../../SOURCE_CODE_REVIEW.md), whose review command is:

```text
pnpm install --frozen-lockfile
pnpm run package:extension:firefox-source
```

Publishing and store credentials are deliberately absent and are not needed to rebuild.

## Clean local source rebuild

Command:

```text
pnpm test:extension-source-package
```

The proof harness extracts the source ZIP to a new temporary root, runs the pinned pnpm CLI with `install --frozen-lockfile --offline`, builds the three shared packages, and invokes WXT's Firefox package command. The rebuilt Firefox production directory, store ZIP, and source-review ZIP all passed the same inspectors and matched the original output byte for byte, including the hashes above.

WXT `0.21.4` prints cosmetic `ENOENT` source-list warnings because its reporter attempts to stat repository-root source paths relative to the extension package. This does not alter the archive. The independent exact-file inspector and clean rebuild are the acceptance controls; either fails on an actually missing file.

## Hosted clean-commit proof

The aggregate `pnpm verify` gate now includes unpacked production and store/source package inspection. The dedicated extension job additionally performs the clean source rebuild before rerunning the real Chromium transfer and Firefox fallback E2E tests. Its immutable artifact retains:

- both complete unpacked production directories;
- both browser store ZIPs;
- the Firefox source-review ZIP; and
- the browser E2E JSON result.

Implementation commit `6a3e8112630c1e8c7d3b0226daed97a91ae86242` added the package commands, allowlists, inspectors, clean rebuild, proof proposal, and CI lane. Fix commit `57bab5b6a6e88f49fc6f2a9b563b6a87300c471c` selected the platform-native ZIP reader after GNU `tar` correctly rejected ZIP input in the first hosted attempt; the inspection contract and generated packages did not change.

[Foundation CI run 32764058550](https://github.com/seabAu/Coredrill/actions/runs/32764058550) ran from `2026-08-24T18:43:53Z` through `2026-08-24T18:56:41Z` on the fix commit and passed every required job. The aggregate foundation gate passed in 7m34s; exact Chrome `152.0.7977.54` and `151.0.7922.138` lanes and Firefox `154.0` and `153.0` lanes passed; the full-history Gitleaks scan passed; and Windows, macOS, and diagnostic Linux native package regressions all passed.

The dedicated [extension job 97549537669](https://github.com/seabAu/Coredrill/actions/runs/32764058550/job/97549537669) passed in 2m38s. It installed the exact graph and pinned browsers, built and inspected both unpacked production targets and store ZIPs on Ubuntu, rebuilt Firefox from the source-review ZIP with the frozen lockfile, passed 2/2 real-browser tests, and uploaded the immutable proof artifact.

- artifact ID: `9533863643`;
- artifact name: `coredrill-extension-transfer-57bab5b6a6e88f49fc6f2a9b563b6a87300c471c`;
- artifact size: `1132250` bytes;
- artifact digest: `sha256:0a5b1b41be45c3bea84d374962c33ef0527bc81890aefcbd8b1ab3386aec127a`;
- created: `2026-08-24T18:47:03Z`; expires: `2026-09-23T18:47:01Z`;
- retained contents: both complete eight-file production directories, both store ZIPs, the 45-file Firefox source-review ZIP, and the Playwright JSON report.

The artifact was downloaded after upload and independently re-inspected. Both production directories retained their exact permissions, transfer modes, self-only CSP, local entrypoints, eight-file hashes, and zero remote/eval/secret findings. All three hosted package hashes matched the local hashes above exactly. The source ZIP contained exactly the reviewed 45-file allowlist. Its hosted clean rebuild had already reproduced the Firefox production directory, store ZIP, and source ZIP byte for byte.

The retained browser report is bound to commit `57bab5b6a6e88f49fc6f2a9b563b6a87300c471c` and run `32764058550`. Chromium `149.0.7827.55` proved durable-before-ack receipt, attempt-2 retry, and wrong-origin/oversize/wrong-ID/replay rejection. Firefox `151.0` proved checksummed manual import, corrupt-checksum rejection, idempotent duplicate handling, and SQLite schema version 2. The durable machine record is [extension-production-packages.json](artifacts/extension-production-packages.json).

## Decision closure

ADR-0005 is Accepted. `D-023` is promoted to Accepted with WXT `0.21.4`, Chromium side panel, Firefox sidebar, popup fallback on both targets, exact-origin Chromium pull/ack transfer, checksummed Firefox manual fallback, and exact reproducible store/source packages. `Q-005` is resolved and `EXT-007`/`EXT-008` are complete. Public identity clearance, owner-selected production origin, store submission, credentials, listing copy, signing, and release distribution remain separate gates.
