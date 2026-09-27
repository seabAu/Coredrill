import { entityId, instant } from "@coredrill/domain";
import { describe, expect, it, vi } from "vitest";

import {
  CareerStoryError,
  createCareerStoryOperations,
  validateCareerStory,
  type CareerStoryDto,
  type CareerStoryPort,
} from "../src/index.js";

const STORY_ID = "0199a500-0000-7000-8000-000000000001";
const EMPLOYMENT_ID = "0199a500-0000-7000-8000-000000000002";
const SKILL_ID = "0199a500-0000-7000-8000-000000000003";
const CREATED_AT = instant("2026-09-27T15:00:00.000Z");
const UPDATED_AT = instant("2026-09-27T15:05:00.000Z");
const createContext = Object.freeze({
  operationId: entityId("application-operation", "0199a500-0000-7000-8000-000000000090"),
  initiatedAt: CREATED_AT,
});
const updateContext = Object.freeze({
  operationId: entityId("application-operation", "0199a500-0000-7000-8000-000000000091"),
  initiatedAt: UPDATED_AT,
});

const story = (overrides: Partial<CareerStoryDto> = {}): CareerStoryDto =>
  Object.freeze({
    id: entityId("anecdote", STORY_ID),
    title: "Recovered a risky migration",
    situation: "A release migration failed validation.",
    action: "I preserved the source and repaired the boundary.",
    result: "The retry completed without data loss.",
    tags: Object.freeze(["ownership", "recovery"]),
    privacyTags: Object.freeze(["confidential-client"]),
    linkedEvidence: Object.freeze([
      Object.freeze({
        evidenceKind: "employment" as const,
        evidenceId: entityId("experience", EMPLOYMENT_ID),
      }),
    ]),
    sourceDocumentId: null,
    verificationState: "user_confirmed",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    rowVersion: 1,
    ...overrides,
  });

const setup = () => {
  const port: CareerStoryPort = {
    createStory: vi.fn(async (input) => story(input)),
    updateStory: vi.fn(async (input) =>
      story({
        ...input,
        sourceDocumentId: entityId("document", "0199a500-0000-7000-8000-000000000004"),
        verificationState: "source_backed",
        createdAt: CREATED_AT,
        rowVersion: input.expectedRowVersion + 1,
      }),
    ),
    listStories: vi.fn(async () => Object.freeze([story()])),
  };
  return {
    port,
    operations: createCareerStoryOperations({ careerStories: port, createId: () => STORY_ID }),
  };
};

const validInput = Object.freeze({
  title: "  Recovered a risky migration  ",
  situation: " A release migration failed validation. ",
  action: " I preserved the source and repaired the boundary. ",
  result: " The retry completed without data loss. ",
  tags: Object.freeze(["ownership", "recovery"]),
  privacyTags: Object.freeze(["confidential-client"]),
  linkedEvidence: Object.freeze([
    Object.freeze({ evidenceKind: "employment" as const, evidenceId: EMPLOYMENT_ID }),
  ]),
});

describe("Career story application boundary", () => {
  it("creates a user-confirmed Situation/Action/Result story with explicit evidence links", async () => {
    const { operations, port } = setup();
    const result = await operations.createStoryCommand.execute(validInput, createContext);

    expect(result).toMatchObject({
      ok: true,
      value: {
        id: STORY_ID,
        title: "Recovered a risky migration",
        verificationState: "user_confirmed",
        linkedEvidence: [{ evidenceKind: "employment", evidenceId: EMPLOYMENT_ID }],
      },
    });
    expect(port.createStory).toHaveBeenCalledWith(
      expect.objectContaining({
        id: STORY_ID,
        sourceDocumentId: null,
        verificationState: "user_confirmed",
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      }),
    );
  });

  it("updates content and evidence links without granting the command source or verification control", async () => {
    const { operations, port } = setup();
    const result = await operations.updateStoryCommand.execute(
      {
        ...validInput,
        id: STORY_ID,
        expectedRowVersion: 1,
        result: "The retry completed without data loss and the rollback path stayed available.",
        linkedEvidence: [
          { evidenceKind: "employment", evidenceId: EMPLOYMENT_ID },
          { evidenceKind: "skill", evidenceId: SKILL_ID },
        ],
      },
      updateContext,
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        sourceDocumentId: "0199a500-0000-7000-8000-000000000004",
        verificationState: "source_backed",
        rowVersion: 2,
        linkedEvidence: [
          { evidenceKind: "employment", evidenceId: EMPLOYMENT_ID },
          { evidenceKind: "skill", evidenceId: SKILL_ID },
        ],
      },
    });
    expect(port.updateStory).toHaveBeenCalledWith(
      expect.not.objectContaining({
        sourceDocumentId: expect.anything(),
        verificationState: expect.anything(),
      }),
    );
  });

  it("rejects missing STAR fields, unsafe privacy tags, duplicate links, and invalid identities", async () => {
    const { operations, port } = setup();
    const validation = validateCareerStory({
      ...validInput,
      situation: " ",
      privacyTags: ["Contains client name"],
      linkedEvidence: [
        { evidenceKind: "employment", evidenceId: EMPLOYMENT_ID },
        { evidenceKind: "employment", evidenceId: EMPLOYMENT_ID },
        { evidenceKind: "skill", evidenceId: "not-a-uuid" },
      ],
    });
    expect(validation).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ field: "situation" }),
        expect.objectContaining({ field: "privacyTags" }),
        expect.objectContaining({ field: "linkedEvidence" }),
      ]),
    });
    const result = await operations.createStoryCommand.execute(
      { ...validInput, privacyTags: ["Contains client name"] },
      createContext,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(port.createStory).not.toHaveBeenCalled();
  });

  it("maps stable conflicts and fails closed for malformed port results", async () => {
    const conflictPort: CareerStoryPort = {
      createStory: vi.fn(async () => {
        throw new CareerStoryError("conflict");
      }),
      updateStory: vi.fn(async () => {
        throw new CareerStoryError("conflict");
      }),
      listStories: vi.fn(async () => Object.freeze([{ ...story(), rowVersion: 0 }])),
    };
    const operations = createCareerStoryOperations({
      careerStories: conflictPort,
      createId: () => STORY_ID,
    });
    await expect(
      operations.createStoryCommand.execute(validInput, createContext),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "conflict", retryable: true },
    });
    await expect(
      operations.listStoriesQuery.execute(undefined, createContext),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });
});
