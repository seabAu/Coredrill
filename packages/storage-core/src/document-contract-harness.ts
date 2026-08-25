import type { JsonValue } from "@coredrill/contracts";
import { entityId, instant } from "@coredrill/domain";

import {
  DatabaseContractViolation,
  defineDatabaseContractSuite,
  type DatabaseContractSuite,
} from "./contract-harness.js";
import { sqlStatement, type DatabasePort, type QueryRow } from "./database-port.js";
import {
  DocumentRepositoryConflictError,
  createDocumentRepositories,
} from "./document-repositories.js";
import { createTrackerRepositories } from "./tracker-repositories.js";

export interface DocumentRepositoryContractSetup {
  readonly migrate: (database: DatabasePort) => Promise<void>;
}

const IDS = Object.freeze({
  document: entityId("document", "0198e105-0000-7000-8000-000000000001"),
  otherDocument: entityId("document", "0198e105-0000-7000-8000-000000000002"),
  versionOne: entityId("document-version", "0198e105-0000-7000-8000-000000000003"),
  versionTwo: entityId("document-version", "0198e105-0000-7000-8000-000000000004"),
  otherVersion: entityId("document-version", "0198e105-0000-7000-8000-000000000005"),
  invalidVersion: entityId("document-version", "0198e105-0000-7000-8000-000000000006"),
  job: entityId("job", "0198e105-0000-7000-8000-000000000007"),
});

const CREATED_AT = instant("2026-08-25T18:00:00.000Z");
const UPDATED_AT = instant("2026-08-25T18:05:00.000Z");
const FIRST_HASH = "a".repeat(64);
const SECOND_HASH = "b".repeat(64);
const ATTACHMENT_HASH = "c".repeat(64);

const FIRST_IR: JsonValue = {
  specVersion: 1,
  document: {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Synthetic Resume" }],
      },
    ],
  },
};

const SECOND_IR: JsonValue = {
  specVersion: 1,
  document: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Bound content'); DROP TABLE document; --" }],
      },
    ],
  },
};

const assertContract = (condition: boolean, message: string): void => {
  if (!condition) throw new DatabaseContractViolation(message);
};

const expectFailure = async (
  operation: () => Promise<unknown>,
  predicate: (error: unknown) => boolean,
  message: string,
): Promise<void> => {
  try {
    await operation();
  } catch (error) {
    if (predicate(error)) return;
    throw error;
  }
  throw new DatabaseContractViolation(message);
};

const createDocuments = async (database: DatabasePort): Promise<void> => {
  const documents = createDocumentRepositories(database).documents;
  await documents.create({
    id: IDS.document,
    kind: "resume",
    title: "Synthetic resume'); DROP TABLE job; --",
    source: "user",
    archivedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  await documents.create({
    id: IDS.otherDocument,
    kind: "other",
    title: "Synthetic other document",
    source: "import.docx",
    archivedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
};

const createFirstVersion = async (database: DatabasePort): Promise<void> => {
  await createDocumentRepositories(database).versions.create({
    id: IDS.versionOne,
    documentId: IDS.document,
    versionNumber: 1,
    contentIrVersion: 1,
    contentIr: FIRST_IR,
    contentPlain: "Synthetic Resume",
    templateId: null,
    createdBy: "user",
    createdAt: CREATED_AT,
    parentVersionId: null,
    contentHash: FIRST_HASH,
    label: "Imported baseline",
  });
};

const createJob = async (database: DatabasePort): Promise<void> => {
  await createTrackerRepositories(database).jobs.create({
    id: IDS.job,
    companyId: null,
    title: "Synthetic document-linked role",
    normalizedTitle: "document linked role",
    descriptionText: "Synthetic role used only for DB-005 repository proof.",
    employmentType: "full_time",
    workplaceType: "remote",
    seniority: "mid",
    locationId: null,
    remoteRegion: null,
    datePosted: null,
    validThrough: null,
    currentStatusId: null,
    nextActionAt: null,
    archivedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
};

export const createDocumentRepositoryContractSuite = (
  setup: DocumentRepositoryContractSetup,
): DatabaseContractSuite =>
  defineDatabaseContractSuite("phase-1-document-repositories", [
    {
      name: "persists canonical IR versions with explicit immutable lineage",
      run: async (database) => {
        await setup.migrate(database);
        await createDocuments(database);
        await createFirstVersion(database);
        const repositories = createDocumentRepositories(database);
        await repositories.versions.create({
          id: IDS.versionTwo,
          documentId: IDS.document,
          versionNumber: 2,
          contentIrVersion: 1,
          contentIr: SECOND_IR,
          contentPlain: "Bound content'); DROP TABLE document; --",
          templateId: null,
          createdBy: "user.edit",
          createdAt: UPDATED_AT,
          parentVersionId: IDS.versionOne,
          contentHash: SECOND_HASH,
          label: null,
        });
        await repositories.versions.markStyleExample(IDS.versionOne, UPDATED_AT);
        await repositories.versions.markStyleExample(IDS.versionOne, UPDATED_AT);
        await repositories.versions.create({
          id: IDS.otherVersion,
          documentId: IDS.otherDocument,
          versionNumber: 1,
          contentIrVersion: 1,
          contentIr: FIRST_IR,
          contentPlain: "Other document baseline",
          templateId: null,
          createdBy: "import.docx",
          createdAt: CREATED_AT,
          parentVersionId: null,
          contentHash: FIRST_HASH,
          label: null,
        });

        const document = await repositories.documents.findById(IDS.document);
        const versions = await repositories.versions.listForDocument(IDS.document);
        assertContract(
          document?.title === "Synthetic resume'); DROP TABLE job; --",
          "Bound document text did not round-trip.",
        );
        assertContract(
          versions.length === 2 &&
            versions[0]?.styleExample === true &&
            versions[1]?.parentVersionId === IDS.versionOne &&
            JSON.stringify(versions[1].contentIr) === JSON.stringify(SECOND_IR),
          "Canonical IR, lineage, or version-scoped style metadata did not round-trip.",
        );

        await expectFailure(
          () =>
            repositories.versions.create({
              id: IDS.invalidVersion,
              documentId: IDS.otherDocument,
              versionNumber: 2,
              contentIrVersion: 1,
              contentIr: FIRST_IR,
              contentPlain: "Invalid cross-document parent",
              templateId: null,
              createdBy: "user",
              createdAt: UPDATED_AT,
              parentVersionId: IDS.versionOne,
              contentHash: FIRST_HASH,
              label: null,
            }),
          (error) =>
            error instanceof DocumentRepositoryConflictError &&
            error.code === "document_lineage_conflict",
          "A first version accepted a parent from another document.",
        );
        await expectFailure(
          () =>
            repositories.versions.create({
              id: IDS.invalidVersion,
              documentId: IDS.document,
              versionNumber: 3,
              contentIrVersion: 2,
              contentIr: SECOND_IR,
              contentPlain: "Mismatched IR version",
              templateId: null,
              createdBy: "user",
              createdAt: UPDATED_AT,
              parentVersionId: IDS.versionTwo,
              contentHash: SECOND_HASH,
              label: null,
            }),
          (error) => error instanceof TypeError,
          "Document storage accepted mismatched IR versions.",
        );
      },
    },
    {
      name: "links jobs and content-addressed attachment manifests without storing bytes",
      run: async (database) => {
        await setup.migrate(database);
        await createDocuments(database);
        await createFirstVersion(database);
        await createJob(database);
        const repositories = createDocumentRepositories(database);

        await repositories.documents.linkToJob(
          IDS.document,
          IDS.job,
          "application.resume",
          CREATED_AT,
        );
        await repositories.documents.linkToJob(
          IDS.document,
          IDS.job,
          "application.resume",
          CREATED_AT,
        );
        const manifest = await repositories.attachments.register({
          contentId: ATTACHMENT_HASH,
          sha256: ATTACHMENT_HASH,
          mediaType: "application/pdf",
          byteLength: 2048,
          createdAt: CREATED_AT,
        });
        await repositories.attachments.register({
          contentId: ATTACHMENT_HASH,
          sha256: ATTACHMENT_HASH,
          mediaType: "application/pdf",
          byteLength: 2048,
          createdAt: CREATED_AT,
        });
        await repositories.attachments.linkToVersion({
          documentVersionId: IDS.versionOne,
          contentId: ATTACHMENT_HASH,
          purpose: "source.import",
          logicalName: "synthetic-resume.pdf",
          sortOrder: 0,
          linkedAt: CREATED_AT,
        });
        await repositories.attachments.linkToVersion({
          documentVersionId: IDS.versionOne,
          contentId: ATTACHMENT_HASH,
          purpose: "source.import",
          logicalName: "synthetic-resume.pdf",
          sortOrder: 0,
          linkedAt: CREATED_AT,
        });

        const attachments = await repositories.attachments.listForVersion(IDS.versionOne);
        interface CountRow extends QueryRow {
          readonly total: number;
        }
        const jobLinks = await database.query<CountRow>(
          sqlStatement(
            "SELECT count(*) AS total FROM document_job_link WHERE document_id = ? AND job_id = ?",
            [IDS.document, IDS.job],
          ),
        );
        assertContract(
          manifest.sha256 === manifest.contentId &&
            attachments.length === 1 &&
            attachments[0]?.logicalName === "synthetic-resume.pdf" &&
            jobLinks[0]?.total === 1,
          "Idempotent document links or attachment manifest relationships did not persist.",
        );

        await expectFailure(
          () =>
            repositories.attachments.register({
              contentId: ATTACHMENT_HASH,
              sha256: ATTACHMENT_HASH,
              mediaType: "application/pdf",
              byteLength: 2049,
              createdAt: UPDATED_AT,
            }),
          (error) =>
            error instanceof DocumentRepositoryConflictError &&
            error.code === "attachment_manifest_conflict",
          "A content-addressed manifest silently accepted different immutable metadata.",
        );
        await expectFailure(
          () =>
            repositories.attachments.linkToVersion({
              documentVersionId: IDS.versionOne,
              contentId: ATTACHMENT_HASH,
              purpose: "source.import",
              logicalName: "different.pdf",
              sortOrder: 0,
              linkedAt: CREATED_AT,
            }),
          (error) =>
            error instanceof DocumentRepositoryConflictError &&
            error.code === "relationship_conflict",
          "An existing attachment relationship silently changed its logical metadata.",
        );
        await expectFailure(
          () =>
            repositories.attachments.register({
              contentId: ATTACHMENT_HASH,
              sha256: "d".repeat(64),
              mediaType: "application/pdf",
              byteLength: 2048,
              createdAt: CREATED_AT,
            }),
          (error) => error instanceof TypeError,
          "An attachment content ID differed from its SHA-256.",
        );
      },
    },
  ]);
