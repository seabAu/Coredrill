import { entityId, instant } from "@coredrill/domain";
import { describe, expect, it, vi } from "vitest";

import {
  createAnswerLibraryOperations,
  validateAnswerLibraryEntry,
  type AnswerLibraryEntryDto,
  type AnswerLibraryPort,
} from "../src/index.js";

const DOCUMENT_ID = "0199a530-0000-7000-8000-000000000001";
const VERSION_ID = "0199a530-0000-7000-8000-000000000002";
const CREATED_AT = instant("2026-09-27T17:00:00.000Z");
const context = Object.freeze({
  operationId: entityId("application-operation", "0199a530-0000-7000-8000-000000000090"),
  initiatedAt: CREATED_AT,
});
const HASH = "a".repeat(64);

const answer = (overrides: Partial<AnswerLibraryEntryDto> = {}): AnswerLibraryEntryDto => {
  const version = Object.freeze({
    id: entityId("document-version", VERSION_ID),
    versionNumber: 1,
    question: "Why this role?",
    answer: "I value local-first products.",
    sensitivity: "standard" as const,
    createdAt: CREATED_AT,
    parentVersionId: null,
    contentHash: HASH,
  });
  return Object.freeze({
    id: entityId("document", DOCUMENT_ID),
    sourceKind: "manual",
    sourceJobId: null,
    sourceContext: "Career Profile",
    lastUsedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    rowVersion: 1,
    currentVersion: version,
    versions: Object.freeze([version]),
    ...overrides,
  });
};

const setup = () => {
  const port: AnswerLibraryPort = {
    createAnswer: vi.fn(async (input) =>
      answer({
        id: input.id,
        sourceKind: input.sourceKind,
        sourceJobId: input.sourceJobId,
        sourceContext: input.sourceContext,
        currentVersion: { ...answer().currentVersion, id: input.versionId, ...input },
        versions: [{ ...answer().currentVersion, id: input.versionId, ...input }],
      }),
    ),
    updateAnswer: vi.fn(async (input) =>
      answer({
        rowVersion: input.expectedRowVersion + 1,
        currentVersion: {
          ...answer().currentVersion,
          id: input.versionId,
          ...input,
          versionNumber: 2,
          parentVersionId: entityId("document-version", VERSION_ID),
        },
        versions: [
          answer().currentVersion,
          {
            ...answer().currentVersion,
            id: input.versionId,
            ...input,
            versionNumber: 2,
            parentVersionId: entityId("document-version", VERSION_ID),
          },
        ],
      }),
    ),
    markAnswerUsed: vi.fn(async (_id, expectedRowVersion, usedAt) =>
      answer({ lastUsedAt: usedAt, rowVersion: expectedRowVersion + 1 }),
    ),
    listAnswers: vi.fn(async () => Object.freeze([answer()])),
  };
  let idCount = 0;
  return {
    port,
    operations: createAnswerLibraryOperations({
      answers: port,
      createId: (kind) => {
        idCount += 1;
        return kind === "document" ? DOCUMENT_ID : VERSION_ID.replace(/2$/u, String(idCount));
      },
      hashText: vi.fn(async () => HASH),
    }),
  };
};

describe("Answer Library application boundary", () => {
  it("creates a classified manual answer with explicit provenance and canonical IR", async () => {
    const { operations, port } = setup();
    const result = await operations.createAnswerCommand.execute(
      {
        question: "  Why this role? ",
        answer: " I value local-first products. ",
        sensitivity: "standard",
        sourceContext: " Career Profile ",
      },
      context,
    );

    expect(result).toMatchObject({ ok: true, value: { sourceKind: "manual", rowVersion: 1 } });
    expect(port.createAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "Why this role?",
        answer: "I value local-first products.",
        sensitivity: "standard",
        sourceKind: "manual",
        sourceJobId: null,
        sourceContext: "Career Profile",
        contentIr: expect.objectContaining({ specVersion: 1 }),
      }),
    );
  });

  it("rejects missing content and invalid application provenance", async () => {
    const { operations, port } = setup();
    expect(
      validateAnswerLibraryEntry({ question: "", answer: "", sensitivity: "unknown" }),
    ).toMatchObject({ ok: false });
    await expect(
      operations.createAnswerCommand.execute(
        {
          question: "Why this role?",
          answer: "Because it fits.",
          sensitivity: "standard",
          sourceKind: "application",
          sourceJobId: null,
        },
        context,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "validation" } });
    expect(port.createAnswer).not.toHaveBeenCalled();
  });

  it("marks reuse explicitly and leaves content/version history unchanged", async () => {
    const { operations, port } = setup();
    const result = await operations.markAnswerUsedCommand.execute(
      { id: DOCUMENT_ID, expectedRowVersion: 1 },
      context,
    );
    expect(result).toMatchObject({ ok: true, value: { lastUsedAt: CREATED_AT, rowVersion: 2 } });
    expect(port.markAnswerUsed).toHaveBeenCalledWith(DOCUMENT_ID, 1, CREATED_AT);
  });
});
