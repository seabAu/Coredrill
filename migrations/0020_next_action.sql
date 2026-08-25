CREATE TABLE next_action (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  job_id TEXT NOT NULL REFERENCES job(id) ON DELETE CASCADE,
  application_id TEXT REFERENCES application(id) ON DELETE CASCADE,
  interaction_id TEXT REFERENCES interaction(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 512),
  due_at TEXT CHECK (due_at IS NULL OR length(due_at) = 24),
  timezone TEXT CHECK (timezone IS NULL OR length(timezone) BETWEEN 1 AND 128),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'completed', 'dismissed')),
  completed_at TEXT CHECK (completed_at IS NULL OR length(completed_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK (
    (state = 'completed' AND completed_at IS NOT NULL) OR
    (state <> 'completed' AND completed_at IS NULL)
  )
) STRICT;
