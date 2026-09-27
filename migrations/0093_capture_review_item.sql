CREATE TABLE capture_review_item (
  envelope_id TEXT PRIMARY KEY NOT NULL
    REFERENCES capture_inbox(envelope_id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK (state IN ('pending', 'snoozed', 'discarded', 'resolved')),
  snoozed_until TEXT CHECK (snoozed_until IS NULL OR length(snoozed_until) = 24),
  resolution_kind TEXT CHECK (
    resolution_kind IS NULL OR resolution_kind IN ('save_new', 'merge_existing')
  ),
  resolved_job_id TEXT REFERENCES job(id) ON DELETE RESTRICT,
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK (
    (
      state = 'pending' AND
      snoozed_until IS NULL AND
      resolution_kind IS NULL AND
      resolved_job_id IS NULL
    ) OR
    (
      state = 'snoozed' AND
      snoozed_until IS NOT NULL AND
      resolution_kind IS NULL AND
      resolved_job_id IS NULL
    ) OR
    (
      state = 'discarded' AND
      snoozed_until IS NULL AND
      resolution_kind IS NULL AND
      resolved_job_id IS NULL
    ) OR
    (
      state = 'resolved' AND
      snoozed_until IS NULL AND
      resolution_kind IS NOT NULL AND
      resolved_job_id IS NOT NULL
    )
  )
) STRICT;
