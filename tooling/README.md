# Repository tooling

Shared TypeScript, lint, architecture, test, and policy configuration lives here. Tooling may inspect repository metadata but must not become a runtime dependency of product packages.

`check-foundation-records.mjs` keeps the reviewed dependency inventory and reference test matrix bound to actual manifests, toolchain pins, pnpm settings, and the lockfile hash. It is deliberately offline and dependency-free; live release/advisory review remains a dated human step whose result is checked in.
