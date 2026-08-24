# Runtime application boundaries

Phase 0 reserves only the runtime surfaces already authorized by the design baseline:

- `web/` — static local-first React/Vite PWA composition root;
- `desktop/` — accepted thin Tauri 2/`rusqlite` composition root over the shared frontend; Linux native remains diagnostic;
- `extension/` — user-invoked WXT Manifest V3 capture surface, still provisional.

These directories contain no product implementation in FND-001–FND-008. A future `sync-api` is deferred by D-052, and `worker-python` requires the benchmark-backed ADR in D-028.
