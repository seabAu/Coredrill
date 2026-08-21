# Security policy

Job Workspace handles career history, contact details, application answers, compensation preferences, and provider credentials. Treat all user data as sensitive even when it is stored locally.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, career data, or captured pages. Until a public repository and private vulnerability-reporting route exist, contact the repository owner through an already established private channel and include only the minimum information needed to reproduce the issue. A GitHub private vulnerability-reporting URL must replace this interim route before public distribution.

If a secret may have been exposed, revoke or rotate it before sharing diagnostics. Never send a real vault or resume as a reproduction fixture.

## Supported versions

There is no supported public release yet. Phase 0 is an implementation foundation and receives security fixes directly on the active development branch.

## Baseline threat model

Primary threats include:

- hostile captured HTML, JSON-LD, documents, connector responses, and prompt-injection text;
- extension over-permission, malicious page messages, replay, and outbox disclosure;
- XSS, unsafe HTML rendering, SQL injection, path traversal, archive extraction, and native IPC abuse;
- loss or corruption of browser/native vaults and misleading encryption claims;
- provider/source data exfiltration, secret leakage, unsafe redirects, and privacy-invasive diagnostics;
- dependency, build-pipeline, release-signing, and extension-publisher compromise.

The detailed baseline is [the security design](docs/design/job-workspace-design-kit/06-security-sync-deployment-testing.md). Implementation-specific changes belong in reviewed threat-model and ADR updates.

## Mandatory controls

- Validate and size-limit every serialized boundary before persistence or privileged work.
- Parameterize SQL and validate transaction behavior in every adapter.
- Treat captured source as data; never execute its scripts, handlers, or styles.
- Keep provider keys and vault keys out of source, build variables, SQLite settings, logs, URLs, extension storage, and fixtures.
- Use strict CSP and bundled/self-hosted assets; no remote executable code in the core app or extension.
- Give Tauri commands and extension permissions explicit allowlists and least privilege.
- Gate network connectors by reviewed source-policy records, exact destinations, kill switches, and user-visible data flow.
- Keep telemetry off by default and diagnostics content-free/redacted.
- Preserve transactional export/restore and honest storage/encryption explanations.

## Repository hygiene

Run `pnpm check:policy` before handoff. The local scanner is a fast guard, not a substitute for CI, dependency review, artifact inspection, or a release security review. Never weaken a check merely to make CI green; document and review an exception with scope, owner, and expiry.
