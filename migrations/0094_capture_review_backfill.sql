INSERT INTO capture_review_item(envelope_id, state, updated_at, row_version)
SELECT envelope_id, 'pending', received_at, 1
FROM capture_inbox
ORDER BY envelope_id;
