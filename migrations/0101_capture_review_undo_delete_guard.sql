CREATE TRIGGER capture_review_discard_undo_delete_guard
BEFORE DELETE ON capture_review_discard_undo_token
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'capture review undo tokens are durable audit records');
END;
