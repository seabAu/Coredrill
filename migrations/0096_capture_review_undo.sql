CREATE TABLE capture_review_discard_undo_token (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  envelope_id TEXT NOT NULL REFERENCES capture_inbox(envelope_id) ON DELETE RESTRICT,
  previous_state TEXT NOT NULL CHECK (previous_state IN ('pending', 'snoozed')),
  previous_snoozed_until TEXT CHECK (
    previous_snoozed_until IS NULL OR length(previous_snoozed_until) = 24
  ),
  expected_review_row_version INTEGER NOT NULL CHECK (expected_review_row_version > 0),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  consumed_at TEXT CHECK (consumed_at IS NULL OR length(consumed_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK (
    (previous_state = 'pending' AND previous_snoozed_until IS NULL) OR
    (previous_state = 'snoozed' AND previous_snoozed_until IS NOT NULL)
  ),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
) STRICT;
