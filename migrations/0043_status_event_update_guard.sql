CREATE TRIGGER status_event_immutable_update_guard
BEFORE UPDATE ON status_event
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'status events are append-only');
END;
