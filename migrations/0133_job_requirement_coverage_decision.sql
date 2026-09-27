CREATE TABLE job_requirement_coverage_decision (
  requirement_id TEXT PRIMARY KEY NOT NULL REFERENCES job_requirement(id) ON DELETE CASCADE,
  coverage_state TEXT NOT NULL CHECK (
    coverage_state IN ('strength', 'partial', 'gap', 'unknown', 'not_applicable')
  ),
  requirement_row_version INTEGER NOT NULL CHECK (requirement_row_version > 0),
  selection_basis TEXT NOT NULL CHECK (length(selection_basis) <= 4096),
  decided_at TEXT NOT NULL CHECK (length(decided_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
) STRICT;
