INSERT INTO coredrill_integrity_probe(value)
SELECT 1
WHERE EXISTS (
  SELECT 1
  FROM application
  LEFT JOIN document_version AS resume_version
    ON resume_version.id = application.selected_resume_version_id
  LEFT JOIN document AS resume_document
    ON resume_document.id = resume_version.document_id
  LEFT JOIN document_version AS cover_version
    ON cover_version.id = application.selected_cover_letter_version_id
  LEFT JOIN document AS cover_document
    ON cover_document.id = cover_version.document_id
  WHERE
    (application.selected_resume_version_id IS NOT NULL AND
      (resume_version.id IS NULL OR resume_document.kind <> 'resume')) OR
    (application.selected_cover_letter_version_id IS NOT NULL AND
      (cover_version.id IS NULL OR cover_document.kind <> 'cover_letter'))

  UNION ALL

  SELECT 1
  FROM document_version AS child
  LEFT JOIN document_version AS parent ON parent.id = child.parent_version_id
  WHERE
    (child.version_number = 1 AND child.parent_version_id IS NOT NULL) OR
    (child.version_number > 1 AND
      (parent.id IS NULL OR
       parent.document_id <> child.document_id OR
       parent.version_number <> child.version_number - 1))

  UNION ALL

  SELECT 1 FROM location WHERE updated_at < created_at
  UNION ALL SELECT 1 FROM company
    WHERE updated_at < created_at OR (archived_at IS NOT NULL AND archived_at < created_at)
  UNION ALL SELECT 1 FROM contact
    WHERE updated_at < created_at OR (archived_at IS NOT NULL AND archived_at < created_at)
  UNION ALL SELECT 1 FROM job
    WHERE updated_at < created_at OR (archived_at IS NOT NULL AND archived_at < created_at)
  UNION ALL SELECT 1 FROM job_source WHERE updated_at < created_at
  UNION ALL SELECT 1 FROM field_value WHERE updated_at < created_at
  UNION ALL SELECT 1 FROM status_definition
    WHERE updated_at < created_at OR (archived_at IS NOT NULL AND archived_at < created_at)
  UNION ALL SELECT 1 FROM application
    WHERE updated_at < created_at OR (archived_at IS NOT NULL AND archived_at < created_at)
  UNION ALL SELECT 1 FROM interaction WHERE updated_at < created_at
  UNION ALL SELECT 1 FROM next_action WHERE updated_at < created_at
  UNION ALL SELECT 1 FROM interview WHERE updated_at < created_at
  UNION ALL SELECT 1 FROM reminder WHERE updated_at < created_at
  UNION ALL SELECT 1 FROM tag
    WHERE updated_at < created_at OR (archived_at IS NOT NULL AND archived_at < created_at)
  UNION ALL SELECT 1 FROM saved_view
    WHERE updated_at < created_at OR (archived_at IS NOT NULL AND archived_at < created_at)
  UNION ALL SELECT 1 FROM document
    WHERE updated_at < created_at OR (archived_at IS NOT NULL AND archived_at < created_at)
);
