import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  CompanyWorkspaceError,
  createCompanyWorkspaceOperations,
  type CompanyWorkspacePortV1,
} from "../src/company-workspace.js";

const vaultId = entityId("vault", "0198e103-0000-7000-8000-000000000001");
const otherVaultId = entityId("vault", "0198e103-0000-7000-8000-000000000002");
const companyId = entityId("company", "0198e103-0000-7000-8000-000000000003");
const at = instant("2026-10-21T12:00:00.000Z");
const later = instant("2026-10-21T13:00:00.000Z");
const context = {
  operationId: entityId("application-operation", "0198e103-0000-7000-8000-000000000004"),
  initiatedAt: at,
};
const scope = { specVersion: 1 as const, expectedVaultId: vaultId };
const readInput = { ...scope, companyId };
const fields = () => ({
  canonicalName: "  <Synthetic company> & literal  ",
  websiteUrl: "http://synthetic.example/",
  domain: "synthetic.example",
  locationId: null,
  notes: "  Synthetic private note\n<script>inert</script> 🧭  ",
});
const record = () => ({
  id: companyId,
  ...fields(),
  archivedAt: null,
  createdAt: at,
  updatedAt: at,
  rowVersion: 1,
});
const workspace = () => ({ specVersion: 1, vaultId, company: record() });
const creation = () => ({ ...scope, company: { origin: "user_entered" as const, ...fields() } });
const notesInput = { ...scope, companyId, expectedRowVersion: 1, notes: "new literal notes" };
const notesResult = () => ({
  ...workspace(),
  company: { ...record(), notes: notesInput.notes, rowVersion: 2, updatedAt: later },
});

const setup = (response: unknown = workspace()) => {
  const read = vi.fn(async (_input: unknown) => response);
  const create = vi.fn(async (_input: unknown) => response);
  const updateNotes = vi.fn(async (_input: unknown) => response);
  const createCompanyId = vi.fn(() => companyId);
  const port = { read, create, updateNotes } satisfies CompanyWorkspacePortV1;
  return {
    ...port,
    createCompanyId,
    operations: createCompanyWorkspaceOperations(port, createCompanyId),
  };
};

describe("viewed-vault company workspace operations", () => {
  it("copies and freezes exact stored scalar facts without inventing relationships", async () => {
    const source = workspace();
    const { operations, read } = setup(source);
    expect(operations.read.readOnly).toBe(true);
    const result = await operations.read.execute(readInput, context);
    expect(result).toEqual({ ok: true, value: source });
    expect(read).toHaveBeenCalledWith({ ...readInput, includeArchived: false });
    if (!result.ok) throw new Error("Expected stored company");
    expect(Object.isFrozen(result.value.company)).toBe(true);
    expect(result.value.company).not.toBe(source.company);
    source.company.notes = "later mutation";
    expect(result.value.company.notes).toBe(fields().notes);
    expect(Object.keys(result.value)).toEqual(["specVersion", "vaultId", "company"]);
  });

  it.each([undefined, null])(
    "does not invent a missing company or vault (%j)",
    async (response) => {
      const local = setup();
      local.read.mockResolvedValue(response);
      expect(await local.operations.read.execute(readInput, context)).toMatchObject({
        ok: false,
        error: { code: "not_found", retryable: false },
      });
    },
  );

  it.each([
    null,
    {},
    { ...readInput, specVersion: 2 },
    { ...readInput, companyId: "invalid" },
    { ...readInput, expectedVaultId: "invalid" },
    { ...readInput, includeArchived: "false" },
    { ...readInput, contacts: [] },
  ])("rejects invalid read input before calling storage (%j)", async (input) => {
    const local = setup();
    expect(await local.operations.read.execute(input as typeof readInput, context)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(local.read).not.toHaveBeenCalled();
  });

  it.each([
    { vaultId: otherVaultId },
    { specVersion: 2 },
    { totalContacts: 0 },
    { company: { ...record(), id: "0198e103-0000-7000-8000-000000000009" } },
    { company: { ...record(), notes: undefined } },
    { company: { ...record(), notes: "bad\u0000notes" } },
    { company: { ...record(), updatedAt: "2026-10-20T00:00:00.000Z" } },
    { company: { ...record(), archivedAt: later } },
    { company: { ...record(), rowVersion: 0 } },
    { company: { ...record(), domain: "NotCanonical.EXAMPLE" } },
  ])("rejects malformed or foreign stored results (%j)", async (patch) => {
    const { operations } = setup({ ...workspace(), ...patch });
    expect(await operations.read.execute(readInput, context)).toMatchObject({
      ok: false,
      error: { code: "internal", retryable: false },
    });
  });

  it("requires explicit archived visibility, retaining the actual archive instant", async () => {
    const source = { ...workspace(), company: { ...record(), archivedAt: at } };
    expect(await setup(source).operations.read.execute(readInput, context)).toMatchObject({
      ok: false,
    });
    expect(
      await setup(source).operations.read.execute({ ...readInput, includeArchived: true }, context),
    ).toEqual({ ok: true, value: source });
  });

  it("creates only explicit manual company facts with existing full bounds and canonical domain", async () => {
    const input = creation();
    input.company.canonicalName = "x".repeat(512);
    input.company.notes = "🧭".repeat(100_000);
    input.company.domain = "SYNTHETIC.EXAMPLE";
    const response = {
      ...workspace(),
      company: { ...record(), ...input.company, domain: "synthetic.example" },
    };
    const { origin: _origin, ...stored } = response.company;
    const local = setup({ ...response, company: stored });
    expect(local.operations.create.transactional).toBe(true);
    expect(await local.operations.create.execute(input, context)).toMatchObject({ ok: true });
    const { rowVersion: _version, ...created } = stored;
    expect(local.create).toHaveBeenCalledWith({ ...scope, company: created });
  });

  it.each([
    {},
    { ...creation(), expectedVaultId: "invalid" },
    { ...creation(), company: { ...fields(), origin: "source_backed" } },
    {
      ...creation(),
      company: { ...fields(), origin: "user_entered", canonicalName: "x".repeat(513) },
    },
    { ...creation(), company: { ...fields(), origin: "user_entered", notes: "x".repeat(200_001) } },
    { ...creation(), company: { ...fields(), origin: "user_entered", notes: "\u0000" } },
    {
      ...creation(),
      company: { ...fields(), origin: "user_entered", websiteUrl: "javascript:alert(1)" },
    },
    { ...creation(), company: { ...fields(), origin: "user_entered", userConfirmed: true } },
  ])(
    "rejects invalid manual creation before allocating identity or calling storage (%j)",
    async (input) => {
      const local = setup();
      expect(
        await local.operations.create.execute(input as ReturnType<typeof creation>, context),
      ).toMatchObject({ ok: false, error: { code: "validation" } });
      expect(local.create).not.toHaveBeenCalled();
      expect(local.createCompanyId).not.toHaveBeenCalled();
    },
  );

  it.each([null, { ...context, initiatedAt: "invalid" }, { ...context, operationId: "invalid" }])(
    "validates context for every operation before persistence (%j)",
    async (invalid) => {
      const local = setup();
      const ctx = invalid as typeof context;
      expect(await local.operations.read.execute(readInput, ctx)).toMatchObject({ ok: false });
      expect(await local.operations.create.execute(creation(), ctx)).toMatchObject({ ok: false });
      expect(await local.operations.updateNotes.execute(notesInput, ctx)).toMatchObject({
        ok: false,
      });
      expect(local.read).not.toHaveBeenCalled();
      expect(local.create).not.toHaveBeenCalled();
      expect(local.updateNotes).not.toHaveBeenCalled();
    },
  );

  it("copies original vault, company, version and literal notes before an asynchronous write", async () => {
    const local = setup(notesResult());
    const input = { ...notesInput };
    const promise = local.operations.updateNotes.execute(input, { ...context, initiatedAt: later });
    input.expectedVaultId = otherVaultId;
    input.expectedRowVersion = 99;
    input.notes = "replacement";
    expect(await promise).toEqual({ ok: true, value: notesResult() });
    expect(local.updateNotes).toHaveBeenCalledWith({ ...notesInput, updatedAt: later });
    expect(Object.isFrozen(local.updateNotes.mock.calls[0]?.[0])).toBe(true);
  });

  it.each([0, -1, 1.1, Number.MAX_SAFE_INTEGER, NaN])(
    "rejects invalid notes version %j before storage",
    async (version) => {
      const local = setup();
      expect(
        await local.operations.updateNotes.execute(
          { ...notesInput, expectedRowVersion: version },
          context,
        ),
      ).toMatchObject({ ok: false, error: { code: "validation" } });
      expect(local.updateNotes).not.toHaveBeenCalled();
    },
  );

  it.each([
    { vaultId: otherVaultId },
    { company: { ...notesResult().company, rowVersion: 3 } },
    { company: { ...notesResult().company, notes: "different" } },
    { company: { ...notesResult().company, archivedAt: later } },
    { company: { ...notesResult().company, updatedAt: at } },
  ])(
    "rejects an acknowledgement that does not bind the exact notes operation (%j)",
    async (patch) => {
      const local = setup({ ...notesResult(), ...patch });
      expect(
        await local.operations.updateNotes.execute(notesInput, { ...context, initiatedAt: later }),
      ).toMatchObject({ ok: false, error: { code: "internal" } });
    },
  );

  it.each(["stale", "not_found", "invalid_state", "unavailable"] as const)(
    "redacts the typed %s failure",
    async (code) => {
      const local = setup();
      local.updateNotes.mockRejectedValue(new CompanyWorkspaceError(code));
      const result = await local.operations.updateNotes.execute(notesInput, context);
      expect(result).toMatchObject({ ok: false });
      expect(JSON.stringify(result)).not.toContain("company port");
    },
  );

  it("redacts unknown storage errors without turning a rejected write into success", async () => {
    const local = setup();
    local.create.mockRejectedValue(new Error("Synthetic private SQL or notes sentinel"));
    const result = await local.operations.create.execute(creation(), context);
    expect(result).toMatchObject({ ok: false, error: { code: "internal", retryable: false } });
    expect(JSON.stringify(result)).not.toContain("sentinel");
  });
});
