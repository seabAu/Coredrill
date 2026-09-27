CREATE INDEX capture_review_item_queue_idx
ON capture_review_item(state, snoozed_until, updated_at, envelope_id);
