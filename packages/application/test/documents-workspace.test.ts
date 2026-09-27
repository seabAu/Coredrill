import { entityId, instant } from "@coredrill/domain";
import { describe, expect, it, vi } from "vitest";

import {
  createDocumentsWorkspaceOperations,
  type ApplicationOperationContext,
  type DocumentsWorkspacePort,
} from "../src/index.js";

const context: ApplicationOperationContext = {
  operationId: entityId("application-operation", "0199b100-0000-7000-8000-000000000001"),
  initiatedAt: instant("2026-09-27T22:00:00.000Z"),
};

const item = Object.freeze({
  id: entityId("document", "0199b100-0000-7000-8000-000000000002"),
  kind: "resume" as const,
  title: "Product operations base",
  lineageRole: "base" as const,
  baseDocumentId: null,
  baseDocumentTitle: null,
  templateDocumentId: null,
  templateDocumentTitle: null,
  relatedJob: null,
  lastEditedAt: instant("2026-09-27T21:00:00.000Z"),
  searchText: "Durable document body and linked evidence.",
  latestVersion: Object.freeze({
    id: entityId("document-version", "0199b100-0000-7000-8000-000000000003"),
    versionNumber: 2,
    label: "Reviewed",
  }),
  exportStatus: "not_exported" as const,
  claimStatus: "not_evaluated" as const,
  submission: null,
});

describe("Documents workspace application query", () => {
  it("returns a validated immutable local read model", async () => {
    const port: DocumentsWorkspacePort = {
      listDocuments: vi.fn().mockResolvedValue([item]),
    };
    const result = await createDocumentsWorkspaceOperations({
      documents: port,
    }).listDocumentsQuery.execute(undefined, context);

    expect(result).toEqual({ ok: true, value: [item] });
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value[0])).toBe(true);
    }
  });

  it("fails closed when an adapter returns malformed or unbounded metadata", async () => {
    const malformed = createDocumentsWorkspaceOperations({
      documents: {
        listDocuments: vi.fn().mockResolvedValue([{ ...item, lineageRole: "copied" }]),
      },
    });
    const malformedResult = await malformed.listDocumentsQuery.execute(undefined, context);

    expect(malformedResult).toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "Stored document metadata did not match the reviewed local contract.",
        retryable: false,
      },
    });

    const unbounded = createDocumentsWorkspaceOperations({
      documents: {
        listDocuments: vi.fn().mockResolvedValue(Array.from({ length: 5_001 }, () => item)),
      },
    });
    await expect(unbounded.listDocumentsQuery.execute(undefined, context)).resolves.toMatchObject({
      ok: false,
      error: { code: "internal", retryable: false },
    });

    const oversizedSearch = createDocumentsWorkspaceOperations({
      documents: {
        listDocuments: vi.fn().mockResolvedValue([{ ...item, searchText: "x".repeat(2_200_002) }]),
      },
    });
    await expect(
      oversizedSearch.listDocumentsQuery.execute(undefined, context),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "internal", retryable: false },
    });
  });

  it("returns a retryable unavailable result when the local adapter cannot read", async () => {
    const operations = createDocumentsWorkspaceOperations({
      documents: {
        listDocuments: vi.fn().mockRejectedValue(new Error("driver unavailable")),
      },
    });

    await expect(operations.listDocumentsQuery.execute(undefined, context)).resolves.toEqual({
      ok: false,
      error: {
        code: "unavailable",
        message: "Local documents are temporarily unavailable.",
        retryable: true,
      },
    });
  });
});
