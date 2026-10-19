import { createHash } from "node:crypto";

import { entityId, instant } from "@coredrill/domain";
import { describe, expect, it, vi } from "vitest";

import {
  createReusableDocumentCommand,
  type DocumentCreationDependencies,
  type CreateReusableDocumentPortInput,
} from "../src/index.js";

const documentId = "0199b320-0000-7000-8000-000000000001";
const versionId = "0199b320-0000-7000-8000-000000000002";
const context = {
  operationId: entityId("application-operation", "0199b320-0000-7000-8000-000000000003"),
  initiatedAt: instant("2026-10-19T09:00:00.000Z"),
};
const setup = () => {
  const create = vi.fn(async (_input: CreateReusableDocumentPortInput): Promise<void> => undefined);
  const hashText = vi.fn(async (text: string) => createHash("sha256").update(text).digest("hex"));
  const dependencies: DocumentCreationDependencies = {
    documents: { create },
    createId: (kind) => (kind === "document" ? documentId : versionId),
    hashText,
    normalizeContent: (content) => {
      const ir = content as { document: { content: { content?: { text: string }[] }[] } };
      return {
        content,
        plainText: ir.document.content.map((block) => block.content?.[0]?.text ?? "").join("\n\n"),
      };
    },
  };
  return { create, hashText, dependencies, command: createReusableDocumentCommand(dependencies) };
};

describe("manual reusable document creation", () => {
  it("creates one validated manual base and exact first-version hash without promoting evidence", async () => {
    const { create, hashText, command } = setup();
    expect(
      await command.execute(
        {
          title: " My resume ",
          kind: "resume",
          initialText: "Literal <script>text</script>\r\n\r\nSecond paragraph",
        },
        context,
      ),
    ).toEqual({
      ok: true,
      value: { documentId, versionId },
    });
    const record = create.mock.calls[0]?.[0];
    expect(record).toMatchObject({
      title: "My resume",
      kind: "resume",
      documentId,
      versionId,
      plainText: "Literal <script>text</script>\n\nSecond paragraph",
      createdAt: context.initiatedAt,
    });
    expect(hashText).toHaveBeenCalledWith(JSON.stringify(record?.content));
    expect(create).toHaveBeenCalledTimes(1);
    expect(record).not.toHaveProperty("userConfirmation");
    expect(record).not.toHaveProperty("jobId");
  });

  it("permits a blank manually authored first version", async () => {
    const { command, create } = setup();
    expect(
      (await command.execute({ title: "Letter", kind: "cover_letter", initialText: "" }, context))
        .ok,
    ).toBe(true);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ plainText: "" }));
  });

  it.each([
    { title: " ", kind: "resume", initialText: "" },
    { title: "x".repeat(513), kind: "resume", initialText: "" },
    { title: "Resume", kind: "application_answer", initialText: "" },
    { title: "Resume", kind: "resume", initialText: "x".repeat(100_001) },
    { title: "Resume", kind: "resume", initialText: "\u0000" },
    { title: "Resume", kind: "resume", initialText: "", userConfirmed: true },
    null,
  ])("rejects malformed/oversized input before persistence", async (input) => {
    const { command, create } = setup();
    expect(await command.execute(input as never, context)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("fails closed on invalid normalization, hash, and identity dependencies", async () => {
    const { dependencies, create } = setup();
    for (const overrides of [
      {
        normalizeContent: () => {
          throw new Error("private document content");
        },
      },
      { hashText: async () => "not-a-hash" },
      { createId: () => "invalid" },
    ]) {
      const result = await createReusableDocumentCommand({ ...dependencies, ...overrides }).execute(
        { title: "Resume", kind: "resume", initialText: "" },
        context,
      );
      expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
      expect(JSON.stringify(result)).not.toContain("private document content");
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("returns content-free retry guidance on a failed atomic write", async () => {
    const { dependencies, create } = setup();
    create.mockRejectedValueOnce(new Error("private path and SQL"));
    const result = await createReusableDocumentCommand(dependencies).execute(
      { title: "Resume", kind: "resume", initialText: "" },
      context,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
    expect(JSON.stringify(result)).not.toContain("private path");
  });
});
