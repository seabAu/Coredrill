ALTER TABLE job ADD COLUMN next_action_at TEXT
  CHECK (next_action_at IS NULL OR length(next_action_at) = 24);
