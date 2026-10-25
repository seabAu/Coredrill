import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  ContactFieldUseStorageError,
  contactResearchCursorV1,
  createContactUseResearchQuery,
  contactResearchTextSpanV1,
  hashViewedContactFieldV1,
  parseContactUseResearchInputV1,
  parseContactUseResearchViewV1,
  type ContactUseResearchInputV1,
} from "../src/index.js";

const id = (n: number) => `0198e123-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-25T12:00:00.000Z",
  due = "2026-11-01T12:00:00.000Z";
const body = "\uFEFFperson@synthetic.example\nSynthetic manual-use terms.\0尾😀";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const digest = async (text: string) => sha(text);
const context = () => ({
  operationId: entityId("application-operation", id(90)),
  initiatedAt: instant(at),
});
const source = {
  specVersion: 1,
  kind: "source",
  expectedVaultId: id(1),
  sourceSnapshotId: id(2),
  sourceClass: "official_employer_page",
  sourceUrl: "https://synthetic.example/team",
  capturedAt: at,
  literalText: body,
  sourceHash: sha(body),
  operationId: id(91),
  recordedAt: at,
};
const excerpt = "Synthetic manual-use terms.";
const policy = {
  specVersion: 1,
  kind: "policy",
  expectedVaultId: id(1),
  policyId: id(3),
  sourceSnapshotId: id(2),
  expectedSourceHash: sha(body),
  fieldName: "email",
  termsSnapshotId: id(2),
  expectedTermsHash: sha(body),
  termsStartByte: Buffer.from(body).indexOf(excerpt),
  termsEndByte: Buffer.from(body).indexOf(excerpt) + Buffer.byteLength(excerpt),
  termsExcerpt: excerpt,
  permissionKind: "explicit_public_job_search_contact",
  purpose: "job_search",
  reviewDueAt: due,
  acknowledgement: "I reviewed this source's permitted field use.",
  operationId: id(92),
  recordedAt: at,
};
const research = (): ContactUseResearchInputV1 => ({
  specVersion: 1,
  kind: "evidence",
  expectedVaultId: id(1),
  sourceSnapshotId: id(2),
  expectedSourceHash: sha(body),
  fieldName: "email",
  policyId: id(3),
  expectedPolicyRowVersion: 1,
});
const evidence = () => ({
  specVersion: 1,
  kind: "evidence",
  vaultId: id(1),
  fieldName: "email",
  source: { ...source },
  policy: { ...policy },
  terms: { ...source },
  policyDisabledAt: null,
  policyRowVersion: 1,
});
const page = (): Extract<ContactUseResearchInputV1, { kind: "sources" }> => ({
  specVersion: 1,
  kind: "sources",
  expectedVaultId: id(1),
  pageSize: 2,
  cursor: null,
});
const metadata = (n: number) => ({
  id: id(n),
  sourceHash: sha(body),
  sourceClass: "official_employer_page",
  sourceUrl: source.sourceUrl,
  capturedAt: at,
  createdAt: at,
});
const sourcePage = () => ({
  specVersion: 1,
  kind: "sources",
  vaultId: id(1),
  items: [metadata(5), metadata(4)],
  nextCursor: contactResearchCursorV1(page(), at, id(4)),
});

describe("normal contact research contracts", () => {
  it("derives exact UTF-8 spans from deliberate BOM/NUL/Unicode selections without normalizing", () => {
    for (const literal of ["\uFEFF", "\0", "尾😀"]) {
      const start = body.indexOf(literal),
        span = contactResearchTextSpanV1(source, start, start + literal.length);
      expect(span).toEqual({
        sourceSnapshotId: id(2),
        sourceHash: sha(body),
        startByte: Buffer.from(body).indexOf(Buffer.from(literal)),
        endByte: Buffer.from(body).indexOf(Buffer.from(literal)) + Buffer.byteLength(literal),
        excerpt: literal,
      });
      expect(Object.isFrozen(span)).toBe(true);
    }
  });
  it.each([
    [0, 0],
    [-1, 2],
    [0, body.length + 1],
    [body.indexOf("😀") + 1, body.length],
  ])("rejects empty, out-of-range and split-character selection %j", (start, end) => {
    expect(() => contactResearchTextSpanV1(source, start, end)).toThrow();
  });
  it("hashes the copied original viewed field across awaits and never invents a missing value", async () => {
    const workspace = {
      specVersion: 1 as const,
      vaultId: entityId("vault", id(1)),
      contact: {
        id: entityId("contact", id(10)),
        companyId: null,
        name: "Synthetic",
        role: null,
        email: "\uFEFFSynthetic@synthetic.example",
        phone: null,
        publicProfileUrl: null,
        confidence: null,
        userConfirmed: false,
        notes: "",
        archivedAt: null,
        createdAt: instant(at),
        updatedAt: instant(at),
        rowVersion: 1,
      },
      manualCreation: null,
    };
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = workspace.contact.email;
    const hash = hashViewedContactFieldV1(workspace, "email", async (text) => {
      await pending;
      return sha(text);
    });
    workspace.contact.email = "Changed@synthetic.example";
    release?.();
    expect(await hash).toBe(sha(original));
    await expect(hashViewedContactFieldV1(workspace, "phone", digest)).rejects.toThrow();
  });
  it.each([0, 21, 1.5, Number.NaN, "2"])(
    "rejects invalid page budget %s before IO",
    async (pageSize) => {
      const read = vi.fn();
      const result = await createContactUseResearchQuery({ read }, digest).execute(
        { ...page(), pageSize },
        context(),
      );
      expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
      expect(read).not.toHaveBeenCalled();
    },
  );
  it.each(["vaultId", "kind", "sourceSnapshotId", "sourceHash", "fieldName"])(
    "rejects a foreign continuation %s",
    (key) => {
      const cursor = contactResearchCursorV1(page(), at, id(4));
      expect(() =>
        parseContactUseResearchInputV1({ ...page(), cursor: { ...cursor, [key]: "foreign" } }),
      ).toThrow();
    },
  );
  it("reads input accessors once and freezes the original scope across an await", async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const input = { ...page() },
      reads = vi.fn(() => "sources");
    Object.defineProperty(input, "kind", { enumerable: true, get: reads });
    const read = vi.fn(async (request: ContactUseResearchInputV1) => {
      await pending;
      expect(request.expectedVaultId).toBe(id(1));
      expect(Object.isFrozen(request)).toBe(true);
      return sourcePage();
    });
    const result = createContactUseResearchQuery({ read }, digest).execute(input, context());
    input.expectedVaultId = id(99);
    release?.();
    expect((await result).ok).toBe(true);
    expect(reads).toHaveBeenCalledTimes(1);
  });
  it("metadata continuation preserves exact order without hashing or exposing bodies", async () => {
    const hash = vi.fn(digest),
      query = createContactUseResearchQuery({ read: async () => sourcePage() }, hash);
    const result = await query.execute(page(), context());
    expect(result.ok).toBe(true);
    expect(hash).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(body);
    if (!result.ok || result.value.kind !== "sources") throw Error("Missing source page");
    expect(result.value.nextCursor).toEqual(contactResearchCursorV1(page(), at, id(4)));
    expect(Object.isFrozen(result.value.items)).toBe(true);
  });
  it.each([
    { items: [metadata(4), metadata(5)] },
    { items: [metadata(5), metadata(5)] },
    {
      items: [
        metadata(5),
        {
          ...metadata(5),
          createdAt: "2026-10-24T12:00:00.000Z",
          capturedAt: "2026-10-24T12:00:00.000Z",
        },
      ],
    },
    { items: [metadata(5), metadata(4), metadata(3)] },
    { nextCursor: contactResearchCursorV1(page(), at, id(3)) },
    { vaultId: id(99) },
    { items: [{ ...metadata(5), literalText: body }, metadata(4)] },
  ])("rejects forged, duplicated, skipped or private metadata %j", (patch) => {
    expect(() => parseContactUseResearchViewV1({ ...sourcePage(), ...patch }, page())).toThrow();
  });
  it("rejects the same IDs repeated with different timestamps, not just duplicate ordering", () => {
    expect(() =>
      parseContactUseResearchViewV1(
        {
          ...sourcePage(),
          nextCursor: null,
          items: [
            metadata(5),
            {
              ...metadata(5),
              capturedAt: "2026-10-24T12:00:00.000Z",
              createdAt: "2026-10-24T12:00:00.000Z",
            },
          ],
        },
        page(),
      ),
    ).toThrow();
  });
  it("retains exact canonical literal BOM/NUL/Unicode only after deliberate inspection", async () => {
    const result = await createContactUseResearchQuery(
      { read: async () => evidence() },
      digest,
    ).execute(research(), context());
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.kind !== "evidence") throw Error("Missing deliberate evidence");
    expect(result.value.source.literalText).toBe(body);
    expect(result.value.terms?.literalText).toBe(body);
    expect(result.value.policy?.termsExcerpt).toBe(excerpt);
    expect(Object.isFrozen(result.value.source)).toBe(true);
  });
  it.each([
    { source: { ...source, sourceHash: "a".repeat(64) } },
    { source: { ...source, literalText: body.slice(1) } },
    { policy: { ...policy, fieldName: "phone" } },
    { policy: { ...policy, termsStartByte: policy.termsStartByte + 1 } },
    { terms: { ...source, literalText: body + "changed" } },
    { policyRowVersion: 2 },
    { policyDisabledAt: at },
    { vaultId: id(99) },
  ])("withholds foreign, altered, hash/span or lifecycle evidence %j", async (patch) => {
    const result = await createContactUseResearchQuery(
      { read: async () => ({ ...evidence(), ...patch }) },
      digest,
    ).execute(research(), context());
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(body);
  });
  it("can inspect disabled history without treating it as an eligible source-use grant", async () => {
    const request = { ...research(), expectedPolicyRowVersion: 2 };
    const result = await createContactUseResearchQuery(
      { read: async () => ({ ...evidence(), policyDisabledAt: at, policyRowVersion: 2 }) },
      digest,
    ).execute(request, context());
    expect(result).toMatchObject({
      ok: true,
      value: { kind: "evidence", policyRowVersion: 2, policyDisabledAt: at },
    });
    expect(JSON.stringify(result)).not.toContain("eligible");
  });
  it.each([
    new Error("PRIVATE SQL/source text"),
    new ContactFieldUseStorageError("stale"),
    new ContactFieldUseStorageError("not_found"),
  ])("redacts adapter failures", async (error) => {
    const result = await createContactUseResearchQuery(
      {
        read: async () => {
          throw error;
        },
      },
      digest,
    ).execute(research(), context());
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
});
