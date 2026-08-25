CREATE INDEX source_snapshot_timeline_idx
ON source_snapshot(job_source_id, captured_at DESC, id);
