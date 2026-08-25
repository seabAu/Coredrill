CREATE TABLE application (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  job_id TEXT NOT NULL REFERENCES job(id) ON DELETE CASCADE,
  applied_at TEXT CHECK (applied_at IS NULL OR length(applied_at) = 24),
  channel TEXT CHECK (channel IS NULL OR length(channel) BETWEEN 1 AND 128),
  current_status_id TEXT NOT NULL REFERENCES status_definition(id) ON DELETE RESTRICT,
  selected_resume_version_id TEXT CHECK (
    selected_resume_version_id IS NULL OR
    (length(selected_resume_version_id) = 36 AND selected_resume_version_id = lower(selected_resume_version_id))
  ),
  selected_cover_letter_version_id TEXT CHECK (
    selected_cover_letter_version_id IS NULL OR
    (length(selected_cover_letter_version_id) = 36 AND selected_cover_letter_version_id = lower(selected_cover_letter_version_id))
  ),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 200000),
  archived_at TEXT CHECK (archived_at IS NULL OR length(archived_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
) STRICT;
