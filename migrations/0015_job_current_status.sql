ALTER TABLE job ADD COLUMN current_status_id TEXT
  REFERENCES status_definition(id) ON DELETE SET NULL
  CHECK (current_status_id IS NULL OR (length(current_status_id) = 36 AND current_status_id = lower(current_status_id)));
