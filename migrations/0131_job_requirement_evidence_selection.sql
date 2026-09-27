CREATE TABLE job_requirement_evidence_selection (
  requirement_id TEXT NOT NULL REFERENCES job_requirement(id) ON DELETE CASCADE,
  evidence_kind TEXT NOT NULL CHECK (
    evidence_kind IN (
      'employment', 'education', 'project', 'skill', 'accomplishment',
      'certification', 'publication', 'volunteer', 'story'
    )
  ),
  evidence_id TEXT NOT NULL CHECK (length(evidence_id) = 36 AND evidence_id = lower(evidence_id)),
  experience_id TEXT REFERENCES experience(id) ON DELETE CASCADE,
  education_id TEXT REFERENCES education(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES project(id) ON DELETE CASCADE,
  skill_id TEXT REFERENCES skill(id) ON DELETE CASCADE,
  accomplishment_id TEXT REFERENCES accomplishment(id) ON DELETE CASCADE,
  certification_id TEXT REFERENCES certification(id) ON DELETE CASCADE,
  publication_id TEXT REFERENCES publication(id) ON DELETE CASCADE,
  volunteer_experience_id TEXT REFERENCES volunteer_experience(id) ON DELETE CASCADE,
  anecdote_id TEXT REFERENCES anecdote(id) ON DELETE CASCADE,
  selected_at TEXT NOT NULL CHECK (length(selected_at) = 24),
  PRIMARY KEY (requirement_id, evidence_kind, evidence_id),
  CHECK (
    (evidence_kind = 'employment' AND evidence_id = experience_id AND education_id IS NULL AND project_id IS NULL AND skill_id IS NULL AND accomplishment_id IS NULL AND certification_id IS NULL AND publication_id IS NULL AND volunteer_experience_id IS NULL AND anecdote_id IS NULL)
    OR (evidence_kind = 'education' AND evidence_id = education_id AND experience_id IS NULL AND project_id IS NULL AND skill_id IS NULL AND accomplishment_id IS NULL AND certification_id IS NULL AND publication_id IS NULL AND volunteer_experience_id IS NULL AND anecdote_id IS NULL)
    OR (evidence_kind = 'project' AND evidence_id = project_id AND experience_id IS NULL AND education_id IS NULL AND skill_id IS NULL AND accomplishment_id IS NULL AND certification_id IS NULL AND publication_id IS NULL AND volunteer_experience_id IS NULL AND anecdote_id IS NULL)
    OR (evidence_kind = 'skill' AND evidence_id = skill_id AND experience_id IS NULL AND education_id IS NULL AND project_id IS NULL AND accomplishment_id IS NULL AND certification_id IS NULL AND publication_id IS NULL AND volunteer_experience_id IS NULL AND anecdote_id IS NULL)
    OR (evidence_kind = 'accomplishment' AND evidence_id = accomplishment_id AND experience_id IS NULL AND education_id IS NULL AND project_id IS NULL AND skill_id IS NULL AND certification_id IS NULL AND publication_id IS NULL AND volunteer_experience_id IS NULL AND anecdote_id IS NULL)
    OR (evidence_kind = 'certification' AND evidence_id = certification_id AND experience_id IS NULL AND education_id IS NULL AND project_id IS NULL AND skill_id IS NULL AND accomplishment_id IS NULL AND publication_id IS NULL AND volunteer_experience_id IS NULL AND anecdote_id IS NULL)
    OR (evidence_kind = 'publication' AND evidence_id = publication_id AND experience_id IS NULL AND education_id IS NULL AND project_id IS NULL AND skill_id IS NULL AND accomplishment_id IS NULL AND certification_id IS NULL AND volunteer_experience_id IS NULL AND anecdote_id IS NULL)
    OR (evidence_kind = 'volunteer' AND evidence_id = volunteer_experience_id AND experience_id IS NULL AND education_id IS NULL AND project_id IS NULL AND skill_id IS NULL AND accomplishment_id IS NULL AND certification_id IS NULL AND publication_id IS NULL AND anecdote_id IS NULL)
    OR (evidence_kind = 'story' AND evidence_id = anecdote_id AND experience_id IS NULL AND education_id IS NULL AND project_id IS NULL AND skill_id IS NULL AND accomplishment_id IS NULL AND certification_id IS NULL AND publication_id IS NULL AND volunteer_experience_id IS NULL)
  )
) STRICT;
