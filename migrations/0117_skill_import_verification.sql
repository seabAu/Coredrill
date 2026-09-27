ALTER TABLE skill ADD COLUMN verification_state TEXT NOT NULL DEFAULT 'user_confirmed'
  CHECK (verification_state IN ('imported', 'user_confirmed', 'source_backed', 'stale', 'disputed'));
