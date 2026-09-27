CREATE TRIGGER capture_inbox_review_item_insert
AFTER INSERT ON capture_inbox
FOR EACH ROW
BEGIN
  INSERT INTO capture_review_item(envelope_id, state, updated_at, row_version)
  VALUES (NEW.envelope_id, 'pending', NEW.received_at, 1);
END;
