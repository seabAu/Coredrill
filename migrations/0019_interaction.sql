CREATE TABLE interaction (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  job_id TEXT NOT NULL REFERENCES job(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contact(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (length(type) BETWEEN 1 AND 128),
  occurred_at TEXT NOT NULL CHECK (length(occurred_at) = 24),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'mutual', 'unknown')),
  summary TEXT NOT NULL CHECK (length(summary) <= 200000),
  next_action_at TEXT CHECK (next_action_at IS NULL OR length(next_action_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
) STRICT;
