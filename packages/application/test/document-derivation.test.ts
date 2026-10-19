import { createHash } from "node:crypto";

import { entityId, instant } from "@coredrill/domain";
import { describe, expect, it, vi } from "vitest";

import {
  createDeriveJobDocumentCommand,
  DocumentDerivationError,
  type CreateDocumentDerivativePortInput,
  type DocumentDerivationDependencies,
} from "../src/index.js";

const id = (suffix: string) => `0199b350-0000-7000-8000-${suffix.padStart(12, "0")}`;
const content = { specVersion: 1, document: { type: "doc", content: [{ type: "paragraph" }] } };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const context = {
  operationId: entityId("application-operation", id("1")),
  initiatedAt: instant("2026-10-19T10:00:00.000Z"),
};
const input = {
  applicationId: id("2"),
  sourceVersionId: id("3"),
  expectedApplicationRowVersion: 4,
  title: " Job resume ",
};
const setup = () => {
  const basis = {
    jobId: id("4"),
    sourceDocumentId: id("5"),
    sourceVersionId: id("3"),
    kind: "resume",
    content,
    plainText: "",
    contentHash: hash(JSON.stringify(content)),
    sourceCreatedAt: "2026-10-18T10:00:00.000Z",
  };
  const readBasis = vi.fn(async (): Promise<unknown> => basis);
  const create = vi.fn(
    async (_record: CreateDocumentDerivativePortInput): Promise<void> => undefined,
  );
  const dependencies: DocumentDerivationDependencies = {
    documents: { readBasis, create },
    createId: (kind) => id(kind === "document" ? "6" : "7"),
    normalizeContent: (value) => ({ content: value, plainText: "" }),
    hashText: async (text) => hash(text),
  };
  return {
    basis,
    readBasis,
    create,
    dependencies,
    command: createDeriveJobDocumentCommand(dependencies),
  };
};

describe("explicit job-document derivation", () => {
  it("copies the explicitly chosen immutable version without selecting or submitting it", async () => {
    const { command, create, readBasis } = setup();
    expect(await command.execute(input, context)).toEqual({
      ok: true,
      value: { documentId: id("6"), versionId: id("7") },
    });
    expect(readBasis).toHaveBeenCalledWith({
      applicationId: id("2"),
      sourceVersionId: id("3"),
      expectedApplicationRowVersion: 4,
    });
    expect(create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: "Job resume",
        content,
        sourceVersionId: id("3"),
        sourceDocumentId: id("5"),
        createdAt: context.initiatedAt,
      }),
    );
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("selectedResumeVersionId");
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("appliedAt");
  });

  it.each([
    { ...input, title: " " },
    { ...input, title: "x".repeat(513) },
    { ...input, title: "bad\u0000title" },
    { ...input, applicationId: "invalid" },
    { ...input, expectedApplicationRowVersion: 0 },
    { ...input, expectedApplicationRowVersion: 1.5 },
    { ...input, expectedApplicationRowVersion: Number.MAX_SAFE_INTEGER },
    { ...input, selectAutomatically: true },
    null,
  ])("rejects invalid input before querying storage", async (invalid) => {
    const { command, readBasis, create } = setup();
    expect(await command.execute(invalid as never, context)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(readBasis).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "application_answer" },
    { sourceVersionId: id("9") },
    { sourceDocumentId: "invalid" },
    { contentHash: "0".repeat(64) },
    { plainText: "False text" },
    { content: { invalid: true } },
    { sourceCreatedAt: "2027-01-01T00:00:00.000Z" },
  ])("does not copy inconsistent source metadata: %j", async (overrides) => {
    const { basis, command, readBasis, create } = setup();
    readBasis.mockResolvedValueOnce({ ...basis, ...overrides });
    expect((await command.execute(input, context)).ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects normalization that would change the source instead of calling it an exact copy", async () => {
    const { dependencies, create } = setup();
    const command = createDeriveJobDocumentCommand({
      ...dependencies,
      normalizeContent: () => ({ content: { specVersion: 1 }, plainText: "" }),
    });
    expect((await command.execute(input, context)).ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps conflicts and storage errors content-free", async () => {
    const { command, create } = setup();
    create.mockRejectedValueOnce(new DocumentDerivationError("conflict"));
    expect(await command.execute(input, context)).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    create.mockRejectedValueOnce(new Error("private resume / SQL / path"));
    const result = await command.execute(input, context);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("private resume");
  });
});
