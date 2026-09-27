import { entityId, instant } from "@coredrill/domain";
import { describe, expect, it, vi } from "vitest";

import {
  createResumeImportOperations,
  extractResumeEvidenceProposals,
  type QueueResumeImportInput,
  type ResumeImportPort,
  type ResumeImportPortInput,
  type ResumeImportQueueItemDto,
} from "../src/index.js";
import goldenFixture from "./fixtures/resume-import-golden.json" with { type: "json" };

interface GoldenCase extends QueueResumeImportInput {
  readonly expected?: readonly {
    readonly confidence: number;
    readonly fieldName: string;
    readonly proposedValue: string;
    readonly target: string;
  }[];
  readonly expectedCount?: number;
  readonly expectedPointers?: readonly string[];
  readonly name: string;
}

const golden = goldenFixture as { readonly cases: readonly GoldenCase[] };

const AT = instant("2026-09-27T14:00:00.000Z");
const IMPORT_ID = "0199a200-0000-7000-8000-000000000001";
const PROPOSAL_IDS = Array.from(
  { length: 20 },
  (_, index) => `0199a200-0000-7000-8000-${String(index + 2).padStart(12, "0")}`,
);

const context = Object.freeze({
  initiatedAt: AT,
  operationId: entityId("application-operation", "0199a200-0000-7000-8000-000000000099"),
});

const queueDto = (input: ResumeImportPortInput): ResumeImportQueueItemDto =>
  Object.freeze({
    completedAt: input.completedAt,
    id: input.id,
    proposalCount: input.proposals.length,
    proposals: Object.freeze(input.proposals.map((proposal) => Object.freeze({ ...proposal }))),
    source: Object.freeze({ ...input.source }),
    status: "completed",
    warnings: Object.freeze([...input.warnings]),
  });

const setup = () => {
  const stored: ResumeImportPortInput[] = [];
  const port: ResumeImportPort = {
    enqueue: vi.fn(async (input) => {
      stored.push(input);
      return queueDto(input);
    }),
    listPending: vi.fn(async () => Object.freeze(stored.map(queueDto))),
  };
  let proposalIndex = 0;
  const operations = createResumeImportOperations({
    resumeImports: port,
    createId: (kind) => {
      if (kind === "import-run") return IMPORT_ID;
      return PROPOSAL_IDS[proposalIndex++] as string;
    },
  });
  return { operations, port, stored };
};

describe("resume import proposal boundary", () => {
  it("matches the reviewed DOCX, PDF, and text proposal goldens", () => {
    for (const fixture of golden.cases) {
      const proposals = extractResumeEvidenceProposals(fixture.blocks);
      if (fixture.expected !== undefined) {
        expect(
          proposals.map(({ confidence, fieldName, proposedValue, target }) => ({
            confidence,
            fieldName,
            proposedValue,
            target,
          })),
          fixture.name,
        ).toEqual(fixture.expected);
      }
      if (fixture.expectedCount !== undefined) {
        expect(proposals, fixture.name).toHaveLength(fixture.expectedCount);
      }
      for (const pointer of fixture.expectedPointers ?? []) {
        expect(
          proposals.some(({ sourcePointer }) => sourcePointer === pointer),
          fixture.name,
        ).toBe(true);
      }
    }
  });

  it("queues only pending proposals with source pointers and confidence", async () => {
    const { operations, stored } = setup();
    const fixture = golden.cases[0] as GoldenCase;
    const result = await operations.queueCommand.execute(
      {
        blocks: fixture.blocks,
        source: {
          byteLength: 4_096,
          fileName: fixture.source.fileName,
          format: fixture.source.format,
          mediaType: fixture.source.mediaType,
          sha256: "a".repeat(64),
        },
        warnings: ["Some formatting was omitted."],
      },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        proposalCount: 7,
        source: { fileName: "synthetic-resume.docx", format: "docx" },
        status: "completed",
      },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceStatus: "proposal",
          fieldName: "organization",
          proposedValue: "Coredrill Labs",
          reviewState: "pending",
          sourcePointer: "/word/document.xml#paragraph=8",
          target: "employment",
        }),
      ]),
    );
    expect(stored[0]).not.toHaveProperty("verificationState");
  });

  it("rejects malformed source metadata and content before persistence", async () => {
    const { operations, port } = setup();
    const result = await operations.queueCommand.execute(
      {
        blocks: [{ text: "Evidence", sourcePointer: "/lines/1", sourceExcerpt: "Evidence" }],
        source: {
          byteLength: 8,
          fileName: "resume.exe",
          format: "text",
          mediaType: "not a media type",
          sha256: "unsafe",
        },
      },
      context,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "validation", retryable: false } });
    expect(port.enqueue).not.toHaveBeenCalled();
  });

  it("fails closed when a port attempts to return verified evidence", async () => {
    const { operations, port } = setup();
    vi.mocked(port.enqueue).mockImplementationOnce(async (input) => ({
      ...queueDto(input),
      proposals: input.proposals.map((proposal) => ({
        ...proposal,
        evidenceStatus: "user_confirmed",
      })) as never,
    }));
    const fixture = golden.cases[2] as GoldenCase;
    const result = await operations.queueCommand.execute(
      {
        blocks: fixture.blocks,
        source: {
          byteLength: 128,
          fileName: fixture.source.fileName,
          format: fixture.source.format,
          mediaType: fixture.source.mediaType,
          sha256: "b".repeat(64),
        },
      },
      context,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
  });

  it("lists copied pending imports without exposing port-owned arrays", async () => {
    const { operations } = setup();
    const fixture = golden.cases[1] as GoldenCase;
    await operations.queueCommand.execute(
      {
        blocks: fixture.blocks,
        source: {
          byteLength: 2_048,
          fileName: fixture.source.fileName,
          format: fixture.source.format,
          mediaType: fixture.source.mediaType,
          ...(fixture.source.pageCount === undefined
            ? {}
            : { pageCount: fixture.source.pageCount }),
          sha256: "c".repeat(64),
        },
      },
      context,
    );
    const listed = await operations.listPendingQuery.execute(undefined, context);

    expect(listed).toMatchObject({ ok: true, value: [{ proposalCount: 5 }] });
    if (listed.ok) {
      expect(Object.isFrozen(listed.value)).toBe(true);
      expect(Object.isFrozen(listed.value[0]?.proposals)).toBe(true);
    }
  });
});
