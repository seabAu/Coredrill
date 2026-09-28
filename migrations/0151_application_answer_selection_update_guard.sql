CREATE TRIGGER application_answer_selection_update_guard
BEFORE UPDATE ON application_answer_selection
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'application answer selection rows are immutable');
END;
