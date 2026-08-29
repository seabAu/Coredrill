CREATE INDEX diagnostic_event_recent_idx
ON diagnostic_event(occurred_at DESC, event_id DESC);
