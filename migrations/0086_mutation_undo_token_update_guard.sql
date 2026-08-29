CREATE TRIGGER mutation_undo_token_consume_only_update_guard
BEFORE UPDATE ON mutation_undo_token
FOR EACH ROW
WHEN NOT (
  OLD.consumed_at IS NULL AND
  NEW.consumed_at IS NOT NULL AND
  NEW.row_version = OLD.row_version + 1 AND
  NEW.id IS OLD.id AND
  NEW.kind IS OLD.kind AND
  NEW.job_id IS OLD.job_id AND
  NEW.status_application_id IS OLD.status_application_id AND
  NEW.status_event_id IS OLD.status_event_id AND
  NEW.previous_status_id IS OLD.previous_status_id AND
  NEW.expected_status_id IS OLD.expected_status_id AND
  NEW.expected_application_row_version IS OLD.expected_application_row_version AND
  NEW.next_action_id IS OLD.next_action_id AND
  NEW.expected_next_action_row_version IS OLD.expected_next_action_row_version AND
  NEW.previous_next_action_at IS OLD.previous_next_action_at AND
  NEW.expected_next_action_at IS OLD.expected_next_action_at AND
  NEW.expected_job_row_version IS OLD.expected_job_row_version AND
  NEW.created_at IS OLD.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'undo tokens permit only one consume transition');
END;
