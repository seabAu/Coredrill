CREATE TRIGGER diagnostic_event_retention
AFTER INSERT ON diagnostic_event
FOR EACH ROW
BEGIN
  DELETE FROM diagnostic_event
  WHERE event_id IN (
    SELECT event_id
    FROM diagnostic_event
    ORDER BY occurred_at DESC, event_id DESC
    LIMIT -1 OFFSET 1000
  );
END;
