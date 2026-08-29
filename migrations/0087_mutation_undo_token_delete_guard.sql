CREATE TRIGGER mutation_undo_token_immutable_delete_guard
BEFORE DELETE ON mutation_undo_token
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'undo tokens are durable audit records');
END;
