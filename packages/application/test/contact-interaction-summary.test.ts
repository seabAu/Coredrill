import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import { ContactInteractionHistoryError } from "../src/contact-interaction-history.js";
import {
  createContactInteractionSummaryQuery,
  parseContactInteractionSummaryPartV1,
  parseContactInteractionSummaryRequestV1,
  type ReadContactInteractionSummaryInputV1,
} from "../src/contact-interaction-summary.js";

const at = instant("2026-10-22T04:00:00.000Z");
const reference = {
  specVersion: 1 as const,
  vaultId: entityId("vault", "0198e105-0000-7000-8000-000000000001"),
  contactId: entityId("contact", "0198e105-0000-7000-8000-000000000002"),
  includeArchived: false,
  contactRowVersion: 3,
  occurredAt: at,
  id: entityId("interaction", "0198e105-0000-7000-8000-000000000003"),
  rowVersion: 1,
  jobId: entityId("job", "0198e105-0000-7000-8000-000000000004"),
  jobRowVersion: 2,
};
const context = {
  operationId: entityId("application-operation", "0198e105-0000-7000-8000-000000000005"),
  initiatedAt: at,
};
const literal = "\uFEFFabc😀\0\n<script>literal</script>é尾";
const bytes = new TextEncoder().encode(literal);
const input = {
  specVersion: 1 as const,
  reference,
  summaryByteLength: bytes.byteLength,
  limitBytes: 4,
};
const response = (offset = 0, limit = 4) => ({
  specVersion: 1,
  reference,
  summaryByteLength: bytes.byteLength,
  byteOffset: offset,
  bytes: bytes.slice(offset, offset + limit),
});

describe("bounded literal contact-interaction summary", () => {
  it("reads the entire exact summary at scalar boundaries without losing BOM or NUL", () => {
    let offset = 0;
    let reconstructed = "";
    for (let partIndex = 0; partIndex < bytes.byteLength; partIndex += 1) {
      const part = parseContactInteractionSummaryPartV1(response(offset), {
        ...input,
        byteOffset: offset,
      });
      expect(Object.isFrozen(part.reference)).toBe(true);
      expect(part.bytesRead).toBeGreaterThan(0);
      reconstructed += part.text;
      if (!part.hasMore) {
        expect(part.nextByteOffset).toBeNull();
        break;
      }
      if (part.nextByteOffset === null) throw new Error("Expected continuation");
      offset = part.nextByteOffset;
    }
    expect(reconstructed).toBe(literal);
  });

  it("distinguishes a valid empty summary from a missing record", async () => {
    const empty = { ...input, summaryByteLength: 0 };
    const query = createContactInteractionSummaryQuery({
      readSummaryPart: async () => ({
        ...response(),
        summaryByteLength: 0,
        bytes: new Uint8Array(),
      }),
    });
    expect(await query.execute(empty, context)).toMatchObject({
      ok: true,
      value: {
        text: "",
        bytesRead: 0,
        hasMore: false,
        nextByteOffset: null,
      },
    });
    expect(
      await createContactInteractionSummaryQuery({
        readSummaryPart: async () => undefined,
      }).execute(empty, context),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it.each([
    null,
    {},
    { ...input, specVersion: 2 },
    { ...input, limitBytes: 3 },
    { ...input, limitBytes: 65_537 },
    { ...input, byteOffset: -1 },
    { ...input, byteOffset: bytes.byteLength + 1 },
    { ...input, summaryByteLength: 800_001 },
    { ...input, reference: { ...reference, permission: "public" } },
    { ...input, text: "forged" },
  ])("rejects malformed requests before its port: %j", async (request) => {
    const readSummaryPart = vi.fn(async () => response());
    const result = await createContactInteractionSummaryQuery({ readSummaryPart }).execute(
      request as ReadContactInteractionSummaryInputV1,
      context,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(readSummaryPart).not.toHaveBeenCalled();
  });

  it.each([
    { ...response(), reference: { ...reference, contactRowVersion: 4 } },
    { ...response(), reference: { ...reference, jobRowVersion: 3 } },
    { ...response(), reference: { ...reference, includeArchived: true } },
    { ...response(), summaryByteLength: bytes.byteLength + 1 },
    { ...response(), byteOffset: 1 },
    { ...response(), bytes: bytes.slice(0, 3) },
    { ...response(), bytes: [1, 2, 3, 4] },
    { ...response(), path: "private" },
  ])("rejects changed references, bytes or unexpected results: %j", (value) => {
    expect(() => parseContactInteractionSummaryPartV1(value, input)).toThrow();
  });

  it("rejects invalid UTF-8 and offsets inside a scalar", () => {
    expect(() =>
      parseContactInteractionSummaryPartV1(
        { ...response(), bytes: Uint8Array.of(255, 255, 255, 255) },
        input,
      ),
    ).toThrow();
    expect(() =>
      parseContactInteractionSummaryPartV1(response(1), { ...input, byteOffset: 1 }),
    ).toThrow();
  });

  it("copies request references and computes continuation rather than trusting supplied text", async () => {
    const captured: unknown[] = [];
    const query = createContactInteractionSummaryQuery({
      readSummaryPart: async (scope) => {
        captured.push(scope);
        return response();
      },
    });
    const result = await query.execute(input, context);
    expect(query.readOnly).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      value: { text: "\uFEFFa", bytesRead: 4, nextByteOffset: 4 },
    });
    expect(Object.isFrozen(captured[0])).toBe(true);
    expect(
      parseContactInteractionSummaryRequestV1({ ...input, limitBytes: undefined }).limitBytes,
    ).toBe(16_384);
  });

  it("redacts untrusted errors and maps a stale version to conflict", async () => {
    for (const [error, code] of [
      [new Error("private record text/path"), "unavailable"],
      [new ContactInteractionHistoryError("cursor_invalidated"), "conflict"],
    ] as const) {
      const result = await createContactInteractionSummaryQuery({
        readSummaryPart: () => Promise.reject(error),
      }).execute(input, context);
      expect(result).toMatchObject({ ok: false, error: { code } });
      expect(JSON.stringify(result)).not.toContain("private record text/path");
    }
  });
});
