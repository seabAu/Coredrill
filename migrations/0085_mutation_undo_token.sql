CREATE TABLE mutation_undo_token (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  kind TEXT NOT NULL CHECK (kind IN ('status_change', 'next_action_set')),
  job_id TEXT NOT NULL REFERENCES job(id) ON DELETE RESTRICT,
  status_application_id TEXT REFERENCES application(id) ON DELETE RESTRICT,
  status_event_id TEXT UNIQUE REFERENCES status_event(id) ON DELETE RESTRICT,
  previous_status_id TEXT REFERENCES status_definition(id) ON DELETE RESTRICT,
  expected_status_id TEXT REFERENCES status_definition(id) ON DELETE RESTRICT,
  expected_application_row_version INTEGER CHECK (
    expected_application_row_version IS NULL OR expected_application_row_version > 0
  ),
  next_action_id TEXT UNIQUE REFERENCES next_action(id) ON DELETE RESTRICT,
  expected_next_action_row_version INTEGER CHECK (
    expected_next_action_row_version IS NULL OR expected_next_action_row_version > 0
  ),
  previous_next_action_at TEXT CHECK (
    previous_next_action_at IS NULL OR length(previous_next_action_at) = 24
  ),
  expected_next_action_at TEXT CHECK (
    expected_next_action_at IS NULL OR length(expected_next_action_at) = 24
  ),
  expected_job_row_version INTEGER NOT NULL CHECK (expected_job_row_version > 0),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  consumed_at TEXT CHECK (consumed_at IS NULL OR length(consumed_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at),
  CHECK (
    (
      kind = 'status_change' AND
      status_event_id IS NOT NULL AND
      expected_status_id IS NOT NULL AND
      (
        (status_application_id IS NULL AND expected_application_row_version IS NULL) OR
        (
          status_application_id IS NOT NULL AND
          expected_application_row_version IS NOT NULL AND
          previous_status_id IS NOT NULL
        )
      ) AND
      previous_status_id IS NOT expected_status_id AND
      next_action_id IS NULL AND
      expected_next_action_row_version IS NULL AND
      previous_next_action_at IS NULL AND
      expected_next_action_at IS NULL
    ) OR
    (
      kind = 'next_action_set' AND
      status_application_id IS NULL AND
      status_event_id IS NULL AND
      previous_status_id IS NULL AND
      expected_status_id IS NULL AND
      expected_application_row_version IS NULL AND
      next_action_id IS NOT NULL AND
      expected_next_action_row_version IS NOT NULL
    )
  )
) STRICT;
