# Design authority provenance

`job-workspace-design-kit/` is the repository-local implementation copy of the design kit supplied on 2026-08-21.

The repository copy makes clean clones self-contained. Implementation tasks must use repository-relative links and update the repository copy's `LIVING-CHECKLIST.md`. The original machine-local source location is intentionally not retained as a runtime, build, or documentation dependency.

Source-of-truth order and decision-change rules are defined in [`AGENTS.md`](../../AGENTS.md), [`GOAL.md`](job-workspace-design-kit/GOAL.md), and the [decision register](job-workspace-design-kit/11-decision-register.md).

`DECISION-SUMMARY.md` is retained for historical context. It is not authority when it conflicts with the Job Workspace goal, accepted ADRs, or decision register.
