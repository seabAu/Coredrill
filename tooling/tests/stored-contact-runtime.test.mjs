import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { entityId, instant } from "../../packages/domain/dist/index.js";

const ports = vi.hoisted(() => ({
  read: vi.fn(),
  create: vi.fn(),
  updateNotes: vi.fn(),
  listPage: vi.fn(),
  workspaceFactory: vi.fn(),
  directoryFactory: vi.fn(),
}));
vi.mock("../../packages/storage-core/dist/index.js", async (original) => ({
  ...(await original()),
  createContactWorkspaceRepository: (...args) => {
    ports.workspaceFactory(...args);
    return ports;
  },
  createContactDirectoryRepository: (...args) => {
    ports.directoryFactory(...args);
    return ports;
  },
}));
import { createStoredContactDirectoryApi } from "../../apps/web/src/stored-contact-directory.ts";
import { createStoredContactWorkspaceApi } from "../../apps/web/src/stored-contact-workspace.ts";

const vaultId = "0199b362-0000-7000-8000-000000000001";
const otherVaultId = "0199b362-0000-7000-8000-000000000002";
const contactId = "0199b362-0000-7000-8000-000000000003";
const companyId = "0199b362-0000-7000-8000-000000000004";
const operationId = "0199b362-0000-7000-8000-000000000005";
const at = instant("2026-10-21T12:00:00.000Z");
const later = instant("2026-10-21T13:00:00.000Z");
const context = () => ({
  operationId: entityId("application-operation", operationId),
  initiatedAt: at,
});
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fields = {
  origin: "user_entered",
  name: "  Synthetic <person> 🧭  ",
  role: null,
  email: "manual@synthetic.example",
  phone: null,
  publicProfileUrl: "https://synthetic.example/people/manual",
  notes: "  literal\n<b>note</b> 🧭  ",
};
const contact = {
  id: contactId,
  companyId: null,
  name: fields.name,
  role: null,
  email: fields.email,
  phone: null,
  publicProfileUrl: fields.publicProfileUrl,
  notes: fields.notes,
  confidence: null,
  userConfirmed: true,
  archivedAt: null,
  createdAt: at,
  updatedAt: at,
  rowVersion: 1,
};
const evidence = () => ({
  operationId,
  createdAt: at,
  valueHashes: {
    name: digest(fields.name),
    role: null,
    email: digest(fields.email),
    phone: null,
    public_profile_url: digest(fields.publicProfileUrl),
  },
});
const envelope = (changes = {}) => ({
  specVersion: 1,
  vaultId,
  contact: { ...contact },
  manualCreation: null,
  ...changes,
});
const readInput = { specVersion: 1, expectedVaultId: vaultId, contactId };
const directoryInput = { specVersion: 1, expectedVaultId: vaultId, limit: 25 };
const setup = () => {
  const selected = { syntheticSelectedDatabase: true };
  const open = vi.fn(async () => selected);
  const clock = vi.fn(context);
  const createId = vi.fn(() => contactId);
  const hash = vi.fn(async (value) => digest(value));
  return {
    selected,
    open,
    clock,
    createId,
    hash,
    api: createStoredContactWorkspaceApi(open, clock, createId, hash),
    directory: createStoredContactDirectoryApi(open, clock),
  };
};
const deferred = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
beforeEach(() => {
  vi.clearAllMocks();
  ports.read.mockResolvedValue(envelope());
  ports.create.mockImplementation(async (input) =>
    envelope({
      vaultId: input.expectedVaultId,
      contact: { ...input.contact, rowVersion: 1 },
      manualCreation: input.manualCreation,
    }),
  );
  ports.updateNotes.mockImplementation(async (input) =>
    envelope({
      contact: {
        ...contact,
        notes: input.notes,
        updatedAt: input.updatedAt,
        rowVersion: input.expectedRowVersion + 1,
      },
    }),
  );
  ports.listPage.mockImplementation(async (input) => ({
    specVersion: 1,
    vaultId: input.expectedVaultId,
    includeArchived: input.includeArchived,
    companyId: input.companyId,
    items: [],
    hasMore: false,
    nextCursor: null,
  }));
});

describe("normal selected contact runtime", () => {
  it("does not open, hash, allocate, or read a clock merely by composing APIs", () => {
    const local = setup();
    expect(Object.isFrozen(local.api)).toBe(true);
    expect(Object.isFrozen(local.directory)).toBe(true);
    for (const mock of [local.open, local.hash, local.createId, local.clock])
      expect(mock).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { ...readInput, expectedVaultId: "bad" },
    { ...readInput, contactId: "bad" },
    { ...readInput, specVersion: 2 },
    { ...readInput, includeArchived: "yes" },
    { ...readInput, provenance: [] },
  ])("rejects malformed selected input before opening storage (%j)", async (input) => {
    const local = setup();
    expect(await local.api.read(input)).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(local.open).not.toHaveBeenCalled();
    expect(local.hash).not.toHaveBeenCalled();
  });

  it("reads exact legacy facts without inventing receipt/basis or allocating a contact", async () => {
    const local = setup();
    expect(await local.api.read(readInput)).toEqual({ ok: true, value: envelope() });
    expect(ports.workspaceFactory).toHaveBeenCalledExactlyOnceWith(local.selected, local.hash);
    expect(ports.read).toHaveBeenCalledWith({ ...readInput, includeArchived: false });
    expect(local.createId).not.toHaveBeenCalled();
    expect(local.hash).not.toHaveBeenCalled();
    expect(ports.create).not.toHaveBeenCalled();
  });

  it("copies viewed scope before awaiting selected database opening", async () => {
    const local = setup();
    const held = deferred();
    local.open.mockReturnValueOnce(held.promise);
    const input = { ...readInput };
    const pending = local.api.read(input);
    input.expectedVaultId = otherVaultId;
    held.release(local.selected);
    expect(await pending).toEqual({ ok: true, value: envelope() });
    expect(ports.read.mock.calls[0][0].expectedVaultId).toBe(vaultId);
  });

  it.each(["read", "updateNotes"])("redacts %s open failure without a fallback", async (method) => {
    const local = setup();
    local.open.mockRejectedValue(new Error("PRIVATE synthetic path / token"));
    const result = await local.api[method]({
      ...readInput,
      ...(method === "updateNotes" ? { expectedRowVersion: 1, notes: "literal" } : {}),
    });
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(local.open).toHaveBeenCalledOnce();
    expect(ports[method]).not.toHaveBeenCalled();
  });

  it.each([null, { ...envelope(), vaultId: otherVaultId }])(
    "does not accept absent or foreign selected facts (%j)",
    async (value) => {
      const local = setup();
      ports.read.mockResolvedValue(value);
      expect(await local.api.read(readInput)).toMatchObject({ ok: false });
    },
  );

  it("passes exact original version and literal notes without hashing or allocating", async () => {
    const local = setup();
    local.clock.mockReturnValue({ ...context(), initiatedAt: later });
    const input = { ...readInput, expectedRowVersion: 1, notes: "  updated\n🧭  " };
    expect(await local.api.updateNotes(input)).toEqual({
      ok: true,
      value: envelope({
        contact: { ...contact, notes: input.notes, updatedAt: later, rowVersion: 2 },
      }),
    });
    expect(ports.updateNotes).toHaveBeenCalledWith({ ...input, updatedAt: later });
    expect(local.hash).not.toHaveBeenCalled();
    expect(local.createId).not.toHaveBeenCalled();
  });

  it.each([
    { ...readInput, expectedRowVersion: 0, notes: "x" },
    { ...readInput, expectedRowVersion: 1, notes: "x".repeat(200001) },
    { ...readInput, expectedRowVersion: 1, notes: "x", email: "injected@synthetic.example" },
  ])("rejects invalid notes before opening (%j)", async (input) => {
    const local = setup();
    expect(await local.api.updateNotes(input)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(local.open).not.toHaveBeenCalled();
  });

  it("resolves only exact manual values locally and keeps legacy/changed basis unknown", async () => {
    const local = setup();
    expect(await local.api.resolveManualFields(envelope())).toEqual([]);
    expect(local.hash).not.toHaveBeenCalled();
    const supported = envelope({ manualCreation: evidence() });
    expect(await local.api.resolveManualFields(supported)).toEqual([
      "name",
      "email",
      "public_profile_url",
    ]);
    expect(
      await local.api.resolveManualFields({
        ...supported,
        contact: { ...contact, email: "changed@synthetic.example" },
      }),
    ).toEqual(["name", "public_profile_url"]);
    expect(local.open).not.toHaveBeenCalled();
    expect(local.createId).not.toHaveBeenCalled();
  });

  it("copies basis values before the asynchronous local digest", async () => {
    const local = setup();
    const held = deferred();
    local.hash.mockReturnValueOnce(held.promise);
    const input = envelope({ manualCreation: evidence() });
    const pending = local.api.resolveManualFields(input);
    input.contact.email = "changed@synthetic.example";
    input.manualCreation.valueHashes.email = digest(input.contact.email);
    held.release(digest(fields.name));
    expect(await pending).toEqual(["name", "email", "public_profile_url"]);
    expect(local.hash.mock.calls[1][0]).toBe(fields.email);
  });

  it("redacts a failed basis digest without opening storage or retaining its exception", async () => {
    const local = setup();
    local.hash.mockRejectedValueOnce(new Error("PRIVATE synthetic contact value"));
    await expect(
      local.api.resolveManualFields(envelope({ manualCreation: evidence() })),
    ).rejects.toThrow("The local contact port reported a safe failure.");
    expect(local.open).not.toHaveBeenCalled();
  });

  it("allocates one fixed explicit draft without opening, hashing or clock sampling", () => {
    const local = setup();
    const draft = local.api.beginCreation(vaultId);
    expect(draft).toMatchObject({
      vaultId,
      contactId,
      companyId: null,
      expectedCompanyRowVersion: null,
    });
    expect(Object.isFrozen(draft)).toBe(true);
    expect(draft.attemptContext()).toBeNull();
    expect(local.createId).toHaveBeenCalledOnce();
    for (const mock of [local.open, local.hash, local.clock, ports.create])
      expect(mock).not.toHaveBeenCalled();
  });

  it.each([
    ["bad", null],
    [vaultId, {}],
    [vaultId, []],
    [vaultId, "bad"],
    [vaultId, { id: "bad", rowVersion: 1 }],
    [vaultId, { id: companyId, rowVersion: 0 }],
    [vaultId, { id: companyId, rowVersion: 1.5 }],
    [vaultId, { id: companyId, rowVersion: Number.MAX_SAFE_INTEGER }],
    [vaultId, { id: companyId, rowVersion: 1, inferred: true }],
  ])("rejects invalid draft ownership before allocation (%j,%j)", (owner, company) => {
    const local = setup();
    expect(() => local.api.beginCreation(owner, company)).toThrow();
    for (const mock of [local.createId, local.open, local.hash, local.clock])
      expect(mock).not.toHaveBeenCalled();
  });

  it("copies company identity/version and original context across explicit retries", async () => {
    const local = setup();
    const company = { id: companyId, rowVersion: 3 };
    const sourceContext = context();
    local.clock.mockReturnValue(sourceContext);
    const draft = local.api.beginCreation(vaultId, company);
    company.id = otherVaultId;
    company.rowVersion = 99;
    const first = await draft.save(fields);
    sourceContext.initiatedAt = later;
    sourceContext.operationId = entityId("application-operation", otherVaultId);
    const retry = await draft.save(fields);
    expect(first).toEqual(retry);
    expect(first).toMatchObject({
      ok: true,
      value: {
        contact: { ...contact, companyId },
        manualCreation: evidence(),
      },
    });
    expect(
      ports.create.mock.calls.map(([input]) => [
        input.expectedVaultId,
        input.contact.id,
        input.contact.companyId,
        input.expectedCompanyRowVersion,
        input.contact.createdAt,
        input.manualCreation.operationId,
      ]),
    ).toEqual([
      [vaultId, contactId, companyId, 3, at, operationId],
      [vaultId, contactId, companyId, 3, at, operationId],
    ]);
    expect(draft.attemptContext()).toEqual(context());
    expect(Object.isFrozen(draft.attemptContext())).toBe(true);
    expect(local.clock).toHaveBeenCalledOnce();
    expect(local.createId).toHaveBeenCalledOnce();
    // Duplicate/operation replay rejection is actual-SQLite contract proof, not this mock.
  });

  it("retains original identity/context after uncertain storage-open failure", async () => {
    const local = setup();
    local.open.mockRejectedValueOnce(new Error("PRIVATE synthetic path"));
    const draft = local.api.beginCreation(vaultId);
    const first = await draft.save(fields);
    expect(first).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(first)).not.toContain("PRIVATE");
    local.clock.mockReturnValue({ ...context(), initiatedAt: later });
    expect(await draft.save(fields)).toMatchObject({ ok: true });
    expect(local.clock).toHaveBeenCalledOnce();
    expect(ports.create).toHaveBeenCalledOnce();
    expect(ports.create.mock.calls[0][0].manualCreation).toEqual(evidence());
  });

  it.each([
    null,
    [],
    "invalid",
    { ...fields, origin: "source_backed" },
    { ...fields, companyId },
    { ...fields, companyId: null },
    { ...fields, confidence: 0.9 },
    { ...fields, provenance: [] },
    { ...fields, name: "x".repeat(513) },
    { ...fields, email: "not-an-email" },
  ])("rejects invalid manual fields or company rebinding before open (%j)", async (input) => {
    const local = setup();
    const draft = local.api.beginCreation(vaultId);
    expect(await draft.save(input)).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(local.open).not.toHaveBeenCalled();
    expect(local.hash).not.toHaveBeenCalled();
    expect(ports.create).not.toHaveBeenCalled();
  });

  it("keeps all omitted contact methods nullable and never guesses a missing value", async () => {
    const local = setup();
    const result = await local.api.beginCreation(vaultId).save({
      origin: "user_entered",
      name: fields.name,
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        contact: {
          name: fields.name,
          role: null,
          email: null,
          phone: null,
          publicProfileUrl: null,
          notes: "",
        },
        manualCreation: {
          valueHashes: {
            name: digest(fields.name),
            role: null,
            email: null,
            phone: null,
            public_profile_url: null,
          },
        },
      },
    });
    expect(local.hash).toHaveBeenCalledExactlyOnceWith(fields.name);
  });

  it("copies literal fields before hashing and opens only after every populated value is hashed", async () => {
    const local = setup();
    const held = deferred();
    local.hash.mockReturnValueOnce(held.promise);
    const input = { ...fields };
    const pending = local.api.beginCreation(vaultId).save(input);
    input.name = "replacement";
    input.email = "replacement@synthetic.example";
    expect(local.open).not.toHaveBeenCalled();
    held.release(digest(fields.name));
    const result = await pending;
    expect(result).toMatchObject({ ok: true, value: { contact, manualCreation: evidence() } });
    expect(local.hash.mock.calls.map(([value]) => value)).toEqual([
      fields.name,
      fields.email,
      fields.publicProfileUrl,
    ]);
    expect(local.open).toHaveBeenCalledOnce();
  });

  it.each([
    { operationId: "bad", initiatedAt: at },
    { ...context(), initiatedAt: "bad" },
    { ...context(), private: "PRIVATE" },
  ])("rejects invalid first context before hashing/storage (%j)", async (value) => {
    const local = setup();
    local.clock.mockReturnValue(value);
    expect(await local.api.beginCreation(vaultId).save(fields)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(local.open).not.toHaveBeenCalled();
    expect(local.hash).not.toHaveBeenCalled();
  });

  it("redacts a local hashing failure before database opening", async () => {
    const local = setup();
    local.hash.mockRejectedValueOnce(new Error("PRIVATE synthetic value"));
    const result = await local.api.beginCreation(vaultId).save(fields);
    expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(local.open).not.toHaveBeenCalled();
  });
});

describe("normal identity-only contact directory runtime", () => {
  it.each([
    {},
    { ...directoryInput, expectedVaultId: "bad" },
    { ...directoryInput, companyId: "bad" },
    { ...directoryInput, limit: 101 },
    { ...directoryInput, includeArchived: "yes" },
    { ...directoryInput, email: "injected@synthetic.example" },
    { ...directoryInput, after: { specVersion: 1 } },
  ])("rejects invalid directory scope before open (%j)", async (input) => {
    const local = setup();
    expect(await local.directory.page(input)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(local.open).not.toHaveBeenCalled();
  });

  it("passes copied company/archive scope and returns no private-detail inventory", async () => {
    const local = setup();
    const held = deferred();
    local.open.mockReturnValueOnce(held.promise);
    const input = { ...directoryInput, companyId, includeArchived: true };
    const pending = local.directory.page(input);
    input.companyId = otherVaultId;
    input.includeArchived = false;
    held.release(local.selected);
    expect(await pending).toEqual({
      ok: true,
      value: {
        specVersion: 1,
        vaultId,
        companyId,
        includeArchived: true,
        items: [],
        hasMore: false,
        nextCursor: null,
      },
    });
    expect(ports.directoryFactory).toHaveBeenCalledExactlyOnceWith(local.selected);
    expect(ports.listPage).toHaveBeenCalledWith({
      ...directoryInput,
      companyId,
      includeArchived: true,
      after: null,
    });
    expect(local.hash).not.toHaveBeenCalled();
    expect(ports.read).not.toHaveBeenCalled();
    expect(ports.create).not.toHaveBeenCalled();
  });

  it("redacts open failure without a second runtime or a contact preload", async () => {
    const local = setup();
    local.open.mockRejectedValue(new Error("PRIVATE synthetic file path"));
    const result = await local.directory.page(directoryInput);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(local.open).toHaveBeenCalledOnce();
    expect(ports.listPage).not.toHaveBeenCalled();
    expect(ports.read).not.toHaveBeenCalled();
  });
});
