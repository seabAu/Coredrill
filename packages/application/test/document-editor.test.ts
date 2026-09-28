import { createHash } from "node:crypto";

import { entityId, instant } from "@coredrill/domain";
import { describe, expect, it, vi } from "vitest";

import {
  DocumentEditorError,
  compareDocumentEditorText,
  createDocumentEditorOperations,
  type DocumentEditorPort,
} from "../src/index.js";

const DOCUMENT_ID = "0199b300-0000-7000-8000-000000000001";
const VERSION_1_ID = "0199b300-0000-7000-8000-000000000002";
const VERSION_2_ID = "0199b300-0000-7000-8000-000000000003";
const NOW = instant("2026-09-27T21:00:00.000Z");
const content = (text: string) => ({
  specVersion: 1 as const,
  document: {
    type: "doc" as const,
    content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text }] }],
  },
});
const session = (draftText: string | null = null) => ({
  documentId: DOCUMENT_ID,
  title: "Northstar resume",
  versions: [
    {
      id: VERSION_1_ID,
      versionNumber: 1,
      content: content("Original evidence"),
      plainText: "Original evidence",
      label: "Initial version",
      createdAt: "2026-09-27T20:00:00.000Z",
      parentVersionId: null,
      contentHash: "a".repeat(64),
    },
  ],
  currentVersion: {
    id: VERSION_1_ID,
    versionNumber: 1,
    content: content("Original evidence"),
    plainText: "Original evidence",
    label: "Initial version",
    createdAt: "2026-09-27T20:00:00.000Z",
    parentVersionId: null,
    contentHash: "a".repeat(64),
  },
  draft:
    draftText === null
      ? null
      : {
          baseVersionId: VERSION_1_ID,
          content: content(draftText),
          plainText: draftText,
          updatedAt: "2026-09-27T20:30:00.000Z",
          rowVersion: 2,
        },
});

const context = Object.freeze({
  operationId: entityId("application-operation", "0199b300-0000-7000-8000-000000000004"),
  initiatedAt: NOW,
});

const operations = (port: DocumentEditorPort) =>
  createDocumentEditorOperations({
    editor: port,
    createId: () => VERSION_2_ID,
    hashText: async (value) => createHash("sha256").update(value).digest("hex"),
    normalizeContent: (value) => {
      const candidate = value as ReturnType<typeof content>;
      const block = candidate.document.content[0];
      const text = block?.type === "paragraph" ? block.content[0]?.text : undefined;
      if (typeof text !== "string") throw new TypeError("Unsupported test document content.");
      return Object.freeze({ content: candidate, plainText: text });
    },
  });

describe("document editor application operations", () => {
  it("loads a validated immutable history and recovered local draft", async () => {
    const port: DocumentEditorPort = {
      load: vi.fn(async () => session("Recovered edit")),
      saveDraft: vi.fn(),
      createVersion: vi.fn(),
    };

    await expect(
      operations(port).openDocumentQuery.execute({ documentId: DOCUMENT_ID }, context),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        currentVersion: { id: VERSION_1_ID, versionNumber: 1 },
        draft: { plainText: "Recovered edit", rowVersion: 2 },
      },
    });
  });

  it("derives canonical plain text for optimistic durable draft saves", async () => {
    const saveDraft = vi.fn(async () => session("Edited evidence"));
    const port: DocumentEditorPort = { load: vi.fn(), saveDraft, createVersion: vi.fn() };

    const result = await operations(port).saveDraftCommand.execute(
      {
        documentId: DOCUMENT_ID,
        baseVersionId: VERSION_1_ID,
        content: content("Edited evidence"),
        expectedRowVersion: null,
      },
      context,
    );

    expect(result.ok).toBe(true);
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: DOCUMENT_ID,
        baseVersionId: VERSION_1_ID,
        plainText: "Edited evidence",
        expectedRowVersion: null,
        updatedAt: NOW,
      }),
    );
  });

  it("creates an explicit immutable version only from the exact saved draft", async () => {
    const createVersion = vi.fn(async () => ({
      ...session(null),
      versions: [
        ...session(null).versions,
        {
          id: VERSION_2_ID,
          versionNumber: 2,
          content: content("Application ready"),
          plainText: "Application ready",
          label: "Application ready",
          createdAt: NOW,
          parentVersionId: VERSION_1_ID,
          contentHash: "b".repeat(64),
        },
      ],
      currentVersion: {
        id: VERSION_2_ID,
        versionNumber: 2,
        content: content("Application ready"),
        plainText: "Application ready",
        label: "Application ready",
        createdAt: NOW,
        parentVersionId: VERSION_1_ID,
        contentHash: "b".repeat(64),
      },
    }));
    const port: DocumentEditorPort = { load: vi.fn(), saveDraft: vi.fn(), createVersion };

    const result = await operations(port).createVersionCommand.execute(
      {
        documentId: DOCUMENT_ID,
        baseVersionId: VERSION_1_ID,
        content: content("Application ready"),
        expectedDraftRowVersion: 3,
        label: " Application ready ",
      },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      value: { draft: null, currentVersion: { versionNumber: 2 } },
    });
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId: VERSION_2_ID,
        expectedDraftRowVersion: 3,
        label: "Application ready",
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
    );
  });

  it("fails closed on stale drafts and content outside the restricted schema", async () => {
    const stalePort: DocumentEditorPort = {
      load: vi.fn(),
      saveDraft: vi.fn(async () => {
        throw new DocumentEditorError("conflict");
      }),
      createVersion: vi.fn(),
    };
    await expect(
      operations(stalePort).saveDraftCommand.execute(
        {
          documentId: DOCUMENT_ID,
          baseVersionId: VERSION_1_ID,
          content: content("Stale"),
          expectedRowVersion: 1,
        },
        context,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "conflict", retryable: true } });

    const invalidPort: DocumentEditorPort = {
      load: vi.fn(),
      saveDraft: vi.fn(),
      createVersion: vi.fn(),
    };
    await expect(
      operations(invalidPort).saveDraftCommand.execute(
        {
          documentId: DOCUMENT_ID,
          baseVersionId: VERSION_1_ID,
          content: {
            specVersion: 1,
            document: { type: "doc", content: [{ type: "image", attrs: { src: "https://x" } }] },
          },
          expectedRowVersion: null,
        },
        context,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "validation" } });
    expect(invalidPort.saveDraft).not.toHaveBeenCalled();
  });

  it("builds an accessible line comparison without an opaque score", () => {
    expect(compareDocumentEditorText("Heading\nOld line", "Heading\nNew line\nAdded")).toEqual({
      changedLineCount: 2,
      rows: [
        { lineNumber: 1, before: "Heading", after: "Heading", changed: false },
        { lineNumber: 2, before: "Old line", after: "New line", changed: true },
        { lineNumber: 3, before: null, after: "Added", changed: true },
      ],
    });
  });
});
