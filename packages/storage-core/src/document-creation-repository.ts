import type { DocumentCreationPort } from "@coredrill/application";

import type { DatabasePort } from "./database-port.js";
import { createDocumentRepositories } from "./document-repositories.js";

export const createDocumentCreationRepository = (database: DatabasePort): DocumentCreationPort => ({
  create: async (input) =>
    database.transaction(async (transaction) => {
      const repositories = createDocumentRepositories(transaction);
      await repositories.documents.create({
        id: input.documentId,
        title: input.title,
        kind: input.kind,
        source: "user",
        archivedAt: null,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      });
      await repositories.lineages.create({
        documentId: input.documentId,
        role: "base",
        baseDocumentId: null,
        templateDocumentId: null,
        jobId: null,
        createdAt: input.createdAt,
      });
      await repositories.versions.create({
        id: input.versionId,
        documentId: input.documentId,
        versionNumber: 1,
        contentIrVersion: 1,
        contentIr: input.content,
        contentPlain: input.plainText,
        templateId: null,
        createdBy: "user",
        createdAt: input.createdAt,
        parentVersionId: null,
        contentHash: input.contentHash,
        label: "Initial manual version",
      });
    }),
});
