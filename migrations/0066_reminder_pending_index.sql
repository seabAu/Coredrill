CREATE INDEX reminder_pending_idx
ON reminder(remind_at, id)
WHERE state = 'pending';
