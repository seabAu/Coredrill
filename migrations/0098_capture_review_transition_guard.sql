CREATE TRIGGER capture_review_item_transition_guard
BEFORE UPDATE ON capture_review_item
FOR EACH ROW
WHEN NOT (
  NEW.envelope_id IS OLD.envelope_id AND
  NEW.row_version = OLD.row_version + 1 AND
  NEW.updated_at >= OLD.updated_at AND
  (
    (OLD.state = 'pending' AND NEW.state IN ('snoozed', 'discarded', 'resolved')) OR
    (OLD.state = 'snoozed' AND NEW.state IN ('pending', 'snoozed', 'discarded', 'resolved')) OR
    (OLD.state = 'discarded' AND NEW.state IN ('pending', 'snoozed'))
  )
)
BEGIN
  SELECT RAISE(ABORT, 'capture review transition is invalid or stale');
END;
