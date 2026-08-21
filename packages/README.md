# Package boundaries

Each child is a private workspace package with an explicit TypeScript project boundary. Empty `src/index.ts` files establish buildable package surfaces without implementing product behavior or creating runtime coupling.

The authoritative allowed dependency edges live in `tooling/architecture/package-boundaries.mjs`. Production packages cannot import from applications or `test-fixtures`.
