CREATE TRIGGER interaction_immutable_update_guard
BEFORE UPDATE ON interaction
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'interactions are append-only');
END;
