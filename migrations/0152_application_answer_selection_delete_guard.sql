CREATE TRIGGER application_answer_selection_delete_guard
BEFORE DELETE ON application_answer_selection
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM submitted_snapshot
  WHERE submitted_snapshot.application_id = OLD.application_id
)
BEGIN
  SELECT RAISE(ABORT, 'submitted application answer selection is immutable');
END;
