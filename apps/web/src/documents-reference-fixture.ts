import type { BrowserAttachmentStore } from "@coredrill/storage-browser";
import {
  createDocumentRepositories,
  createPipelineRepositories,
  createSubmittedSnapshotRepository,
  createTrackerRepositories,
  sqlStatement,
  type DatabasePort,
} from "@coredrill/storage-core";
import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";

export const JOB_DOCUMENT_PREPARATION_REFERENCE_APPLICATION_ID = entityId(
  "application",
  "0199b300-0000-7000-8000-000000000017",
);

const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
};

export const installDocumentsWorkspaceReferenceFixture = async (
  database: DatabasePort,
  attachments: BrowserAttachmentStore,
): Promise<void> => {
  const ids = Object.freeze({
    company: entityId("company", "0199b300-0000-7000-8000-000000000001"),
    job: entityId("job", "0199b300-0000-7000-8000-000000000002"),
    status: entityId("status_definition", "0199b300-0000-7000-8000-000000000003"),
    application: entityId("application", "0199b300-0000-7000-8000-000000000004"),
    resumeBase: entityId("document", "0199b300-0000-7000-8000-000000000005"),
    resumeTemplate: entityId("document", "0199b300-0000-7000-8000-000000000006"),
    resumeDerivative: entityId("document", "0199b300-0000-7000-8000-000000000007"),
    coverBase: entityId("document", "0199b300-0000-7000-8000-000000000008"),
    coverDerivative: entityId("document", "0199b300-0000-7000-8000-000000000009"),
    answer: entityId("document", "0199b300-0000-7000-8000-00000000000a"),
    resumeBaseVersion: entityId("document-version", "0199b300-0000-7000-8000-00000000000b"),
    resumeTemplateVersion: entityId("document-version", "0199b300-0000-7000-8000-00000000000c"),
    resumeSubmittedVersion: entityId("document-version", "0199b300-0000-7000-8000-00000000000d"),
    resumeLatestVersion: entityId("document-version", "0199b300-0000-7000-8000-00000000000e"),
    coverBaseVersion: entityId("document-version", "0199b300-0000-7000-8000-00000000000f"),
    coverDerivativeVersion: entityId("document-version", "0199b300-0000-7000-8000-000000000010"),
    answerVersion: entityId("document-version", "0199b300-0000-7000-8000-000000000011"),
    snapshot: entityId("submitted-snapshot", "0199b300-0000-7000-8000-000000000012"),
    snapshotResume: entityId("submitted-snapshot-item", "0199b300-0000-7000-8000-000000000013"),
    snapshotCover: entityId("submitted-snapshot-item", "0199b300-0000-7000-8000-000000000014"),
    snapshotAnswer: entityId("submitted-snapshot-item", "0199b300-0000-7000-8000-000000000015"),
    linkedEvidence: entityId("experience", "0199b300-0000-7000-8000-000000000016"),
    preparationApplication: JOB_DOCUMENT_PREPARATION_REFERENCE_APPLICATION_ID,
  });
  const createdAt = instant("2026-09-27T18:00:00.000Z");
  const submittedAt = instant("2026-09-27T19:00:00.000Z");
  const latestAt = instant("2026-09-27T20:00:00.000Z");
  const ensureLinkedEvidence = async (): Promise<void> => {
    await database.execute(
      sqlStatement(
        `INSERT OR IGNORE INTO experience(
           id, organization, role, start_date, end_date, is_current, description,
           source_document_id, verification_state, archived_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ids.linkedEvidence,
          "Atlas Evidence Lab",
          "Durable evidence steward",
          "2024-01-01",
          null,
          1,
          "Linked evidence search sentinel.",
          ids.resumeDerivative,
          "source_backed",
          null,
          createdAt,
          createdAt,
        ],
      ),
    );
  };
  const ensurePreparationApplication = async (): Promise<void> => {
    const existingPreparation = await database.query(
      sqlStatement("SELECT id FROM application WHERE id = ?", [ids.preparationApplication]),
    );
    if (existingPreparation.length === 1) return;
    await createPipelineRepositories(database).applications.create(
      {
        id: ids.preparationApplication,
        jobId: ids.job,
        appliedAt: null,
        channel: null,
        currentStatusId: ids.status,
        selectedResumeVersionId: null,
        selectedCoverLetterVersionId: null,
        notes: "Reference-only local document preparation attempt.",
        archivedAt: null,
        createdAt: latestAt,
        updatedAt: latestAt,
      },
      { allowAdditionalAttempt: true },
    );
  };
  const existing = await database.query(
    sqlStatement("SELECT id FROM submitted_snapshot WHERE id = ?", [ids.snapshot]),
  );
  if (existing.length === 1) {
    await ensureLinkedEvidence();
    await ensurePreparationApplication();
    return;
  }

  const tracker = createTrackerRepositories(database);
  await tracker.companies.create({
    id: ids.company,
    canonicalName: "Northstar Health",
    websiteUrl: null,
    domain: "northstar.example.test",
    locationId: null,
    notes: "Reference-only local Documents workspace fixture.",
    archivedAt: null,
    createdAt,
    updatedAt: createdAt,
  });
  await tracker.jobs.create({
    id: ids.job,
    companyId: ids.company,
    title: "Product Operations Lead",
    normalizedTitle: "product operations lead",
    descriptionText: "Reference-only local Documents workspace fixture.",
    employmentType: "full_time",
    workplaceType: "remote",
    seniority: "lead",
    locationId: null,
    remoteRegion: null,
    datePosted: null,
    validThrough: null,
    currentStatusId: null,
    nextActionAt: null,
    archivedAt: null,
    createdAt,
    updatedAt: createdAt,
  });

  const repositories = createDocumentRepositories(database);
  for (const document of [
    { id: ids.resumeBase, kind: "resume" as const, title: "Product operations base" },
    { id: ids.resumeTemplate, kind: "resume" as const, title: "Concise resume template" },
    { id: ids.resumeDerivative, kind: "resume" as const, title: "Northstar resume" },
    { id: ids.coverBase, kind: "cover_letter" as const, title: "Cover letter base" },
    {
      id: ids.coverDerivative,
      kind: "cover_letter" as const,
      title: "Northstar cover letter",
    },
    { id: ids.answer, kind: "application_answer" as const, title: "Why Northstar?" },
  ]) {
    await repositories.documents.create({
      ...document,
      source: "reference_fixture",
      archivedAt: null,
      createdAt,
      updatedAt: createdAt,
    });
  }
  for (const lineage of [
    {
      documentId: ids.resumeBase,
      role: "base" as const,
      baseDocumentId: null,
      templateDocumentId: null,
      jobId: null,
    },
    {
      documentId: ids.resumeTemplate,
      role: "template" as const,
      baseDocumentId: null,
      templateDocumentId: null,
      jobId: null,
    },
    {
      documentId: ids.resumeDerivative,
      role: "job_derivative" as const,
      baseDocumentId: ids.resumeBase,
      templateDocumentId: ids.resumeTemplate,
      jobId: ids.job,
    },
    {
      documentId: ids.coverBase,
      role: "base" as const,
      baseDocumentId: null,
      templateDocumentId: null,
      jobId: null,
    },
    {
      documentId: ids.coverDerivative,
      role: "job_derivative" as const,
      baseDocumentId: ids.coverBase,
      templateDocumentId: null,
      jobId: ids.job,
    },
    {
      documentId: ids.answer,
      role: "base" as const,
      baseDocumentId: null,
      templateDocumentId: null,
      jobId: null,
    },
  ]) {
    await repositories.lineages.create({ ...lineage, createdAt });
  }
  await ensureLinkedEvidence();

  const addVersion = async (input: {
    readonly id: EntityId<"document-version">;
    readonly documentId: EntityId<"document">;
    readonly versionNumber: number;
    readonly text: string;
    readonly createdAt: Instant;
    readonly parentVersionId: EntityId<"document-version"> | null;
    readonly label: string;
  }): Promise<void> => {
    const contentBytes = new TextEncoder().encode(input.text);
    await repositories.versions.create({
      id: input.id,
      documentId: input.documentId,
      versionNumber: input.versionNumber,
      contentIrVersion: 1,
      contentIr: {
        specVersion: 1,
        document: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: input.text }] }],
        },
      },
      contentPlain: input.text,
      templateId: null,
      createdBy: "reference_fixture",
      createdAt: input.createdAt,
      parentVersionId: input.parentVersionId,
      contentHash: await sha256(contentBytes),
      label: input.label,
    });
  };
  await addVersion({
    id: ids.resumeBaseVersion,
    documentId: ids.resumeBase,
    versionNumber: 1,
    text: "Reusable product operations evidence.",
    createdAt,
    parentVersionId: null,
    label: "Base",
  });
  await addVersion({
    id: ids.resumeTemplateVersion,
    documentId: ids.resumeTemplate,
    versionNumber: 1,
    text: "Concise resume structure.",
    createdAt,
    parentVersionId: null,
    label: "Template",
  });
  await addVersion({
    id: ids.resumeSubmittedVersion,
    documentId: ids.resumeDerivative,
    versionNumber: 1,
    text: "Northstar submitted resume.",
    createdAt: submittedAt,
    parentVersionId: null,
    label: "Submitted",
  });
  await addVersion({
    id: ids.resumeLatestVersion,
    documentId: ids.resumeDerivative,
    versionNumber: 2,
    text: "Northstar resume with post-submission notes.",
    createdAt: latestAt,
    parentVersionId: ids.resumeSubmittedVersion,
    label: "Current draft",
  });
  await addVersion({
    id: ids.coverBaseVersion,
    documentId: ids.coverBase,
    versionNumber: 1,
    text: "Reusable cover letter evidence.",
    createdAt,
    parentVersionId: null,
    label: "Base",
  });
  await addVersion({
    id: ids.coverDerivativeVersion,
    documentId: ids.coverDerivative,
    versionNumber: 1,
    text: "Northstar submitted cover letter.",
    createdAt: submittedAt,
    parentVersionId: null,
    label: "Submitted",
  });
  await addVersion({
    id: ids.answerVersion,
    documentId: ids.answer,
    versionNumber: 1,
    text: "Northstar aligns with my local-first product operations experience.",
    createdAt: submittedAt,
    parentVersionId: null,
    label: "Submitted answer",
  });

  const exportBytes = new TextEncoder().encode("%PDF-1.4\n% Coredrill reference fixture\n%%EOF");
  const exportHash = await sha256(exportBytes);
  await attachments.put({
    contentId: exportHash,
    sha256: exportHash,
    byteLength: exportBytes.byteLength,
    bytes: exportBytes,
  });
  await repositories.attachments.register({
    contentId: exportHash,
    sha256: exportHash,
    mediaType: "application/pdf",
    byteLength: exportBytes.byteLength,
    createdAt: submittedAt,
  });
  for (const versionId of [ids.resumeSubmittedVersion, ids.resumeLatestVersion]) {
    await repositories.attachments.linkToVersion({
      documentVersionId: versionId,
      contentId: exportHash,
      purpose: "export.pdf",
      logicalName: "northstar-resume.pdf",
      sortOrder: 0,
      linkedAt: versionId === ids.resumeSubmittedVersion ? submittedAt : latestAt,
    });
  }

  const pipeline = createPipelineRepositories(database);
  await pipeline.statusDefinitions.create({
    id: ids.status,
    name: "Reference applied",
    category: "applied",
    color: "blue",
    isSystem: false,
    sortOrder: 10,
    terminal: false,
    archivedAt: null,
    createdAt,
    updatedAt: createdAt,
  });
  await pipeline.applications.create({
    id: ids.application,
    jobId: ids.job,
    appliedAt: submittedAt,
    channel: "company_portal",
    currentStatusId: ids.status,
    selectedResumeVersionId: ids.resumeSubmittedVersion,
    selectedCoverLetterVersionId: ids.coverDerivativeVersion,
    notes: "Reference-only local Documents workspace fixture.",
    archivedAt: null,
    createdAt,
    updatedAt: submittedAt,
  });
  await createSubmittedSnapshotRepository(database).create({
    id: ids.snapshot,
    applicationId: ids.application,
    submittedAt,
    channel: "company_portal",
    createdAt: submittedAt,
    items: [
      {
        id: ids.snapshotResume,
        role: "resume",
        documentVersionId: ids.resumeSubmittedVersion,
        submissionFormat: "file",
        contentId: exportHash,
        attachmentPurpose: "export.pdf",
        sortOrder: 0,
        createdAt: submittedAt,
      },
      {
        id: ids.snapshotCover,
        role: "cover_letter",
        documentVersionId: ids.coverDerivativeVersion,
        submissionFormat: "plain_text",
        contentId: null,
        attachmentPurpose: null,
        sortOrder: 1,
        createdAt: submittedAt,
      },
      {
        id: ids.snapshotAnswer,
        role: "answer",
        documentVersionId: ids.answerVersion,
        submissionFormat: "plain_text",
        contentId: null,
        attachmentPurpose: null,
        sortOrder: 2,
        createdAt: submittedAt,
      },
    ],
  });
  await ensurePreparationApplication();
};
