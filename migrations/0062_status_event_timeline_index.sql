CREATE INDEX status_event_timeline_idx
ON status_event(job_id, occurred_at, id);
