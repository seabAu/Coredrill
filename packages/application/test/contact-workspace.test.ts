import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import { contactFieldValues } from "../src/company-contact.js";
import {
  ContactWorkspaceError,
  createContactWorkspaceOperations,
  parseCreateViewedContactPortInputV1,
  resolveContactManualFieldsV1,
  type ContactWorkspacePortV1,
  type ContactWorkspaceV1,
  type CreateViewedContactPortInputV1,
} from "../src/contact-workspace.js";

const vaultId = entityId("vault", "0198e104-0000-7000-8000-000000000001");
const contactId = entityId("contact", "0198e104-0000-7000-8000-000000000002");
const companyId = entityId("company", "0198e104-0000-7000-8000-000000000003");
const at = instant("2026-10-21T12:00:00.000Z");
const later = instant("2026-10-21T13:00:00.000Z");
const context = {
  operationId: entityId("application-operation", "0198e104-0000-7000-8000-000000000004"),
  initiatedAt: at,
};
const scope = { specVersion: 1 as const, expectedVaultId: vaultId };
const readInput = { ...scope, contactId };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const fields = () => ({
  companyId: null,
  name: "  <Synthetic contact> & literal  ",
  role: " Engineer ",
  email: "Synthetic@synthetic.example",
  phone: null,
  publicProfileUrl: null,
  notes: "  Synthetic private note\n<script>inert</script> 🧭  ",
});
const record = () => ({
  ...fields(),
  id: contactId,
  confidence: null,
  userConfirmed: true,
  archivedAt: null,
  createdAt: at,
  updatedAt: at,
  rowVersion: 1,
});
const receipt = () => ({
  operationId: context.operationId,
  createdAt: at,
  valueHashes: Object.fromEntries(
    Object.entries(contactFieldValues(fields())).map(([field, value]) => [
      field,
      value === null ? null : hash(value),
    ]),
  ),
});
const workspace = () => ({ specVersion: 1, vaultId, contact: record(), manualCreation: null });
const manualWorkspace = () => ({ ...workspace(), manualCreation: receipt() });
const creation = () => ({
  ...scope,
  contactId,
  contact: { origin: "user_entered" as const, ...fields() },
});
const notesInput = { ...scope, contactId, expectedRowVersion: 1, notes: "changed literal notes" };
const setup = (response: unknown = workspace()) => {
  const read = vi.fn(async (_input: unknown): Promise<unknown> => response);
  const create = vi.fn(async (input: CreateViewedContactPortInputV1): Promise<unknown> => ({
    specVersion: 1,
    vaultId: input.expectedVaultId,
    contact: { ...input.contact, rowVersion: 1 },
    manualCreation: input.manualCreation,
  }));
  const updateNotes = vi.fn(async (_input: unknown): Promise<unknown> => response);
  const hashValue = vi.fn(async (value: string) => hash(value));
  return {
    read,
    create,
    updateNotes,
    hashValue,
    operations: createContactWorkspaceOperations({ read, create, updateNotes }, hashValue),
  };
};

describe("viewed-vault contact workspace", () => {
  it("copies exact selected scalar facts and explicitly unknown legacy basis", async () => {
    const source = workspace();
    const local = setup(source);
    const result = await local.operations.read.execute(readInput, context);
    expect(result).toEqual({ ok: true, value: source });
    expect(local.read).toHaveBeenCalledWith({ ...readInput, includeArchived: false });
    expect(local.hashValue).not.toHaveBeenCalled();
    expect(local.operations.read.readOnly).toBe(true);
    if (!result.ok) throw new Error("Expected contact");
    expect(Object.isFrozen(result.value.contact)).toBe(true);
    source.contact.notes = "later mutation";
    expect(result.value.contact.notes).toBe(fields().notes);
    expect(result.value.manualCreation).toBeNull();
  });
  it.each([null, undefined])("does not invent a missing contact (%j)", async (response) => {
    const local = setup();
    local.read.mockResolvedValue(response);
    expect(await local.operations.read.execute(readInput, context)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });
  it.each([
    null,
    {},
    { ...readInput, specVersion: 2 },
    { ...readInput, contactId: "invalid" },
    { ...readInput, expectedVaultId: "invalid" },
    { ...readInput, includeArchived: "false" },
    { ...readInput, origin: "public" },
  ])("rejects invalid read scope (%j)", async (input) => {
    const local = setup();
    expect(await local.operations.read.execute(input as typeof readInput, context)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(local.read).not.toHaveBeenCalled();
  });
  it.each([
    { specVersion: 2 },
    { vaultId: companyId },
    { totalInteractions: 0 },
    { manualCreation: undefined },
    { contact: { ...record(), name: "" } },
    { contact: { ...record(), email: "guess" } },
    { contact: { ...record(), notes: undefined } },
    { contact: { ...record(), archivedAt: later } },
    { contact: { ...record(), rowVersion: 0 } },
    { contact: { ...record(), updatedAt: "2026-10-20T00:00:00.000Z" } },
    { contact: { ...record(), origin: "user_entered" } },
    { manualCreation: { ...receipt(), createdAt: later } },
    { manualCreation: { ...receipt(), public: true } },
    { manualCreation: { ...receipt(), valueHashes: { ...receipt().valueHashes, name: null } } },
    {
      manualCreation: {
        ...receipt(),
        valueHashes: { ...receipt().valueHashes, email: "A".repeat(64) },
      },
    },
  ])("rejects malformed or overbroad detail (%j)", async (patch) => {
    expect(
      await setup({ ...workspace(), ...patch }).operations.read.execute(readInput, context),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it("retains explicit archive visibility and copies immutable evidence", async () => {
    const source = { ...manualWorkspace(), contact: { ...record(), archivedAt: at } };
    const local = setup(source);
    expect(await local.operations.read.execute(readInput, context)).toMatchObject({ ok: false });
    const result = await local.operations.read.execute(
      { ...readInput, includeArchived: true },
      context,
    );
    expect(result).toEqual({ ok: true, value: source });
    if (!result.ok) throw new Error("Expected archived contact");
    expect(Object.isFrozen(result.value.manualCreation?.valueHashes)).toBe(true);
    expect(result.value.manualCreation).not.toBe(source.manualCreation);
  });
  it("creates exact manual facts with one original identity/context and every populated value hash", async () => {
    const local = setup();
    const result = await local.operations.create.execute(creation(), context);
    expect(result).toMatchObject({ ok: true, value: manualWorkspace() });
    expect(local.operations.create.transactional).toBe(true);
    const request = local.create.mock.calls[0]?.[0];
    const { rowVersion: _rowVersion, ...created } = record();
    expect(request).toEqual({
      ...scope,
      expectedCompanyRowVersion: null,
      contact: created,
      manualCreation: receipt(),
    });
    expect(request?.contact).not.toHaveProperty("rowVersion");
    expect(Object.isFrozen(request?.contact)).toBe(true);
    expect(Object.isFrozen(request?.manualCreation.valueHashes)).toBe(true);
    expect(local.hashValue.mock.calls.map(([value]) => value)).toEqual([
      fields().name,
      fields().role,
      fields().email,
    ]);
  });
  it("retains genuine null methods without inventing hashes or source evidence", async () => {
    const local = setup();
    const result = await local.operations.create.execute(
      { ...creation(), contact: { origin: "user_entered", name: "Synthetic only name" } },
      context,
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        contact: {
          email: null,
          phone: null,
          publicProfileUrl: null,
          role: null,
          confidence: null,
          userConfirmed: true,
        },
        manualCreation: {
          valueHashes: { role: null, email: null, phone: null, public_profile_url: null },
        },
      },
    });
    expect(local.hashValue).toHaveBeenCalledExactlyOnceWith("Synthetic only name");
  });
  it("binds explicit selected-company version without creating a company", async () => {
    const local = setup();
    expect(
      await local.operations.create.execute(
        {
          ...creation(),
          contact: { ...creation().contact, companyId },
          expectedCompanyRowVersion: 7,
        },
        context,
      ),
    ).toMatchObject({ ok: true });
    expect(local.create.mock.calls[0]?.[0]).toMatchObject({
      contact: { companyId },
      expectedCompanyRowVersion: 7,
    });
  });
  it.each([
    {},
    { ...creation(), contactId: "invalid" },
    { ...creation(), expectedVaultId: "invalid" },
    { ...creation(), expectedCompanyRowVersion: 2 },
    { ...creation(), contact: { ...creation().contact, companyId } },
    { ...creation(), contact: { ...creation().contact, origin: "source_backed" } },
    { ...creation(), contact: { ...creation().contact, confidence: null } },
    { ...creation(), contact: { ...creation().contact, provenance: [] } },
    { ...creation(), contact: { ...creation().contact, name: "x".repeat(513) } },
    { ...creation(), contact: { ...creation().contact, email: "invented" } },
    { ...creation(), contact: { ...creation().contact, phone: "x".repeat(129) } },
    { ...creation(), contact: { ...creation().contact, notes: "bad\u0000notes" } },
    { ...creation(), contact: { ...creation().contact, publicProfileUrl: "javascript:alert(1)" } },
    { ...creation(), contact: { ...creation().contact, userConfirmed: true } },
  ])("rejects invalid manual input before hashing or storage (%j)", async (input) => {
    const local = setup();
    expect(
      await local.operations.create.execute(input as ReturnType<typeof creation>, context),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(local.hashValue).not.toHaveBeenCalled();
    expect(local.create).not.toHaveBeenCalled();
  });
  it("copies all fields, vault and context before the first async hash", async () => {
    const local = setup();
    const input = creation();
    const captured = { ...context };
    let release: ((value: string) => void) | undefined;
    local.hashValue.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const result = local.operations.create.execute(input, captured);
    input.contact.name = "changed";
    input.contact.email = "changed@synthetic.example";
    input.expectedVaultId = entityId("vault", companyId);
    captured.initiatedAt = later;
    release?.(hash(fields().name));
    expect(await result).toMatchObject({ ok: true, value: manualWorkspace() });
    expect(local.create.mock.calls[0]?.[0].expectedVaultId).toBe(vaultId);
  });
  it.each(["invalid", "A".repeat(64), "0".repeat(63), null])(
    "fails closed on invalid hash output (%j)",
    async (value) => {
      const local = setup();
      local.hashValue.mockResolvedValue(value as string);
      expect(await local.operations.create.execute(creation(), context)).toMatchObject({
        ok: false,
        error: { code: "internal" },
      });
      expect(local.create).not.toHaveBeenCalled();
    },
  );
  it.each([
    { contact: { ...record(), name: "substituted" } },
    { contact: { ...record(), rowVersion: 2 } },
    { manualCreation: null },
    { manualCreation: { ...receipt(), operationId: companyId } },
    {
      manualCreation: {
        ...receipt(),
        valueHashes: { ...receipt().valueHashes, email: "f".repeat(64) },
      },
    },
  ])("rejects substituted creation acknowledgement (%j)", async (patch) => {
    const local = setup();
    local.create.mockResolvedValue({ ...manualWorkspace(), ...patch });
    expect(await local.operations.create.execute(creation(), context)).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });
  it("requires exact notes/version/time acknowledgement and preserves nullable basis", async () => {
    const local = setup({
      ...workspace(),
      contact: { ...record(), notes: notesInput.notes, updatedAt: later, rowVersion: 2 },
    });
    expect(
      await local.operations.updateNotes.execute(notesInput, { ...context, initiatedAt: later }),
    ).toMatchObject({ ok: true });
    expect(local.updateNotes).toHaveBeenCalledWith({ ...notesInput, updatedAt: later });
    expect(await setup().operations.updateNotes.execute(notesInput, context)).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });
  it.each([
    { ...notesInput, expectedRowVersion: 0 },
    { ...notesInput, expectedRowVersion: Number.MAX_SAFE_INTEGER },
    { ...notesInput, notes: "x".repeat(200_001) },
    { ...notesInput, email: "not-an-edit@synthetic.example" },
  ])("rejects invalid notes or unrelated edits (%j)", async (input) => {
    const local = setup();
    expect(await local.operations.updateNotes.execute(input, context)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(local.updateNotes).not.toHaveBeenCalled();
  });
  it.each(["not_found", "stale", "invalid_state", "unavailable"] as const)(
    "maps content-free port failure %s",
    async (code) => {
      const local = setup();
      local.read.mockRejectedValue(new ContactWorkspaceError(code));
      const result = await local.operations.read.execute(readInput, context);
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: {
            not_found: "not_found",
            stale: "conflict",
            invalid_state: "internal",
            unavailable: "unavailable",
          }[code],
        },
      });
    },
  );
  it("does not leak thrown private content", async () => {
    const local = setup();
    local.create.mockRejectedValue(new Error("synthetic private diagnostic"));
    expect(
      JSON.stringify(await local.operations.create.execute(creation(), context)),
    ).not.toContain("synthetic private diagnostic");
  });
  it.each([
    null,
    {},
    { ...context, initiatedAt: "invalid" },
    { ...context, operationId: "invalid" },
    [],
  ])("rejects invalid operation context before effects (%j)", async (value) => {
    const local = setup();
    expect(
      await local.operations.create.execute(creation(), value as typeof context),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(local.hashValue).not.toHaveBeenCalled();
    expect(local.create).not.toHaveBeenCalled();
  });
  it("resolves only matching current manual values and leaves changed values unknown", async () => {
    const source = manualWorkspace() as ContactWorkspaceV1;
    expect(await resolveContactManualFieldsV1(source, async (value) => hash(value))).toEqual([
      "name",
      "role",
      "email",
    ]);
    const changed = {
      ...source,
      contact: { ...source.contact, email: "different@synthetic.example", phone: "555-0100" },
    };
    expect(await resolveContactManualFieldsV1(changed, async (value) => hash(value))).toEqual([
      "name",
      "role",
    ]);
    const noHash = vi.fn(async (value: string) => hash(value));
    expect(await resolveContactManualFieldsV1(workspace() as ContactWorkspaceV1, noHash)).toEqual(
      [],
    );
    expect(noHash).not.toHaveBeenCalled();
  });
  it("rejects receipt nullability not bound to initial fields at the port boundary", async () => {
    const local = setup();
    await local.operations.create.execute(creation(), context);
    const input = local.create.mock.calls[0]?.[0];
    if (!input) throw new Error("Expected creation");
    expect(() =>
      parseCreateViewedContactPortInputV1({
        ...input,
        manualCreation: {
          ...input.manualCreation,
          valueHashes: { ...input.manualCreation.valueHashes, email: null },
        },
      }),
    ).toThrow();
  });
  it("preserves complete literal bounds and hashes the canonical URL, not unreviewed input", async () => {
    const local = setup();
    const result = await local.operations.create.execute(
      {
        ...creation(),
        contact: {
          origin: "user_entered",
          name: "x".repeat(512),
          role: "r".repeat(512),
          phone: "p".repeat(128),
          publicProfileUrl: "https://SYNTHETIC.example/a/../b",
          notes: "🧭".repeat(100_000),
        },
      },
      context,
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        contact: { publicProfileUrl: "https://synthetic.example/b", notes: "🧭".repeat(100_000) },
      },
    });
    expect(local.create.mock.calls[0]?.[0].manualCreation.valueHashes).toEqual({
      name: hash("x".repeat(512)),
      role: hash("r".repeat(512)),
      email: null,
      phone: hash("p".repeat(128)),
      public_profile_url: hash("https://synthetic.example/b"),
    });
  });
  it("copies current values and evidence before resolving manual field matches", async () => {
    const source = manualWorkspace();
    let first = true;
    const resolved = await resolveContactManualFieldsV1(
      source as ContactWorkspaceV1,
      async (value) => {
        if (first) {
          first = false;
          source.contact.email = "mutated@synthetic.example";
          source.manualCreation.valueHashes["email"] = "f".repeat(64);
        }
        return hash(value);
      },
    );
    expect(resolved).toEqual(["name", "role", "email"]);
    expect(Object.isFrozen(resolved)).toBe(true);
  });
  it("fails instead of classifying a value when the matching hasher fails", async () => {
    await expect(
      resolveContactManualFieldsV1(manualWorkspace() as ContactWorkspaceV1, async () => "invalid"),
    ).rejects.toThrow("Invalid local contact digest.");
  });
  it.each([
    null,
    [],
    {},
    { read: async (): Promise<null> => null },
    { read: async (): Promise<null> => null, create: async (): Promise<null> => null },
  ])("rejects an incomplete local port (%j)", (port) => {
    expect(() =>
      createContactWorkspaceOperations(port as unknown as ContactWorkspacePortV1, async (value) =>
        hash(value),
      ),
    ).toThrow();
  });
  it("requires a hasher and rejects unknown failure codes", () => {
    const local = setup();
    expect(() =>
      createContactWorkspaceOperations(
        local,
        null as unknown as (value: string) => Promise<string>,
      ),
    ).toThrow();
    expect(() => new ContactWorkspaceError("private" as "invalid_state")).toThrow();
  });
});
