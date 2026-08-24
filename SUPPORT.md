# Support policy

Coredrill has no supported public release yet. Phase 0 support is limited to repository setup, documented build checks, and design/governance questions.

## Before requesting help

1. Read `README.md`, `SECURITY.md`, and the relevant runbook/design section.
2. Run `pnpm verify` from a clean install where possible.
3. Reduce the problem to synthetic data.
4. Remove usernames, filesystem locations, vault content, prompts, documents, keys, tokens, cookies, and provider responses from diagnostics.

## What to include

- operating system and pinned tool versions;
- exact command and sanitized error text;
- whether the issue reproduces from a clean clone;
- expected versus observed behavior;
- the smallest synthetic reproduction.

Security vulnerabilities follow `SECURITY.md`, not a public support thread. Feature requests that change an Accepted decision require an ADR proposal and evidence, not only a library preference.

Public issue templates, response expectations, supported-version windows, and a private vulnerability-reporting route must be established before beta distribution.
