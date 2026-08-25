CREATE TABLE reminder (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  job_id TEXT NOT NULL REFERENCES job(id) ON DELETE CASCADE,
  next_action_id TEXT REFERENCES next_action(id) ON DELETE CASCADE,
  interview_id TEXT REFERENCES interview(id) ON DELETE CASCADE,
  remind_at TEXT NOT NULL CHECK (length(remind_at) = 24),
  timezone TEXT NOT NULL CHECK (length(timezone) BETWEEN 1 AND 128),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'fired', 'dismissed')),
  note TEXT CHECK (note IS NULL OR length(note) <= 200000),
  fired_at TEXT CHECK (fired_at IS NULL OR length(fired_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK (
    (state = 'fired' AND fired_at IS NOT NULL) OR
    (state <> 'fired' AND fired_at IS NULL)
  )
) STRICT;
