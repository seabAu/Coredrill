# Firefox source review

The Firefox source-review ZIP contains the exact Coredrill extension source closure, workspace manifests, and pinned lockfile required to reproduce its store package. It intentionally excludes `.git`, `.env*`, dependency directories, tests, unrelated apps/packages, generated output, credentials, and publishing configuration.

Requirements:

- Node.js `24.19.x`
- pnpm `11.22.0`
- network access to the public registries represented by `pnpm-lock.yaml`

From the extracted ZIP root, run:

```text
pnpm install --frozen-lockfile
pnpm run package:extension:firefox-source
```

The command builds `@coredrill/contracts`, `@coredrill/capture-core`, and `@coredrill/extension-bridge` before WXT `0.21.4` rebuilds the Firefox Manifest V3 extension. The review artifact is written to `apps/extension/.output/coredrillextension-0.0.0-firefox.zip`.

No store credential or private package is required. Publishing is outside this review command and outside the Phase 0 acceptance gate.
