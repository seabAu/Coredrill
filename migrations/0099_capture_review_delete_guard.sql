CREATE TRIGGER capture_review_item_delete_guard
BEFORE DELETE ON capture_review_item
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'capture review items are durable records');
END;
