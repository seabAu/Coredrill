CREATE TRIGGER diagnostic_event_immutable_update
BEFORE UPDATE ON diagnostic_event
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'diagnostic events are immutable');
END;
