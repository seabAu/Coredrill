CREATE TRIGGER capture_review_discard_undo_consume_only_guard
BEFORE UPDATE ON capture_review_discard_undo_token
FOR EACH ROW
WHEN NOT (
  OLD.consumed_at IS NULL AND
  NEW.consumed_at IS NOT NULL AND
  NEW.row_version = OLD.row_version + 1 AND
  NEW.id IS OLD.id AND
  NEW.envelope_id IS OLD.envelope_id AND
  NEW.previous_state IS OLD.previous_state AND
  NEW.previous_snoozed_until IS OLD.previous_snoozed_until AND
  NEW.expected_review_row_version IS OLD.expected_review_row_version AND
  NEW.created_at IS OLD.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'capture review undo tokens permit only one consume transition');
END;
