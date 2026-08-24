# Extension production-package verification

Date: 2026-08-24
Scope: `EXT-007` through `EXT-008`
Status: local implementation and clean source-rebuild proof complete; clean-commit hosted proof pending

## Outcome

Coredrill now produces independently inspected Chromium and Firefox Manifest V3 store ZIPs plus a Firefox source-review ZIP. The package gate compares every store archive to its inspected unpacked production directory, rejects unsafe or unexpected archive paths, scans the complete production bundles for remote code and likely secrets, constrains the source-review archive to an exact repository allowlist, and rebuilds the Firefox package from a clean source extraction with the frozen lockfile in offline mode.

The proposed architecture decision is [ADR-0005](../adr/0005-adopt-wxt-multisurface-extension-baseline.md). `D-023`, `Q-005`, `EXT-007`, and `EXT-008` remain open until a clean commit passes the hosted lane and the downloaded immutable artifact matches this local proof.

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

## CI and artifact contract

The aggregate `pnpm verify` gate now includes unpacked production and store/source package inspection. The dedicated extension job additionally performs the clean source rebuild before rerunning the real Chromium transfer and Firefox fallback E2E tests. Its immutable artifact retains:

- both complete unpacked production directories;
- both browser store ZIPs;
- the Firefox source-review ZIP; and
- the browser E2E JSON result.

Hosted run, job, artifact identity, artifact digest, downloaded-file hashes, and clean-source rebuild results will be recorded here and in a machine-readable artifact record after the clean commit passes.

## Decision status

No Accepted decision changes in this implementation commit. ADR-0005 is Proposed. `D-023` remains Provisional and `Q-005` remains open until clean-commit hosted proof and immutable artifact review complete `EXT-007`; the same closure change can then accept the ADR, promote `D-023`, resolve `Q-005`, and close `EXT-008`.
