import { describe, expect, it, vi, beforeEach } from "vitest";
import { entityId, instant } from "../../packages/domain/dist/index.js";
const port = vi.hoisted(() => ({ read: vi.fn(), create: vi.fn(), updateNotes: vi.fn() }));
vi.mock("../../packages/storage-core/dist/index.js", async (original) => ({
  ...(await original()),
  createCompanyWorkspaceRepository: () => port,
}));
import { createStoredCompanyWorkspaceApi } from "../../apps/web/src/stored-company-workspace.ts";

const vaultId = "0199b361-0000-7000-8000-000000000001";
const otherVaultId = "0199b361-0000-7000-8000-000000000002";
const companyId = "0199b361-0000-7000-8000-000000000003";
const at = instant("2026-10-21T12:00:00.000Z");
const later = instant("2026-10-21T13:00:00.000Z");
const context = () => ({
  operationId: entityId("application-operation", "0199b361-0000-7000-8000-000000000004"),
  initiatedAt: at,
});
const fields = {
  origin: "user_entered",
  canonicalName: "  Synthetic <company>  ",
  websiteUrl: "http://synthetic.example/",
  notes: "  literal\n<b>note</b> 🧭  ",
};
const readInput = { specVersion: 1, expectedVaultId: vaultId, companyId };
const company = {
  id: companyId,
  canonicalName: fields.canonicalName,
  websiteUrl: fields.websiteUrl,
  domain: null,
  locationId: null,
  notes: fields.notes,
  archivedAt: null,
  createdAt: at,
  updatedAt: at,
  rowVersion: 1,
};
const envelope = (record = company, owner = vaultId) => ({
  specVersion: 1,
  vaultId: owner,
  company: record,
});
const setup = () => {
  const open = vi.fn(async () => ({ syntheticSelectedDatabase: true }));
  const createId = vi.fn(() => companyId);
  const clock = vi.fn(context);
  return { open, createId, clock, api: createStoredCompanyWorkspaceApi(open, clock, createId) };
};
beforeEach(() => {
  vi.clearAllMocks();
  port.read.mockResolvedValue(envelope());
  port.create.mockImplementation(async (input) =>
    envelope({ ...input.company, rowVersion: 1 }, input.expectedVaultId),
  );
  port.updateNotes.mockImplementation(async (input) =>
    envelope(
      {
        ...company,
        notes: input.notes,
        updatedAt: input.updatedAt,
        rowVersion: input.expectedRowVersion + 1,
      },
      input.expectedVaultId,
    ),
  );
});

describe("selected-runtime company workspace composition", () => {
  it.each([
    {},
    { ...readInput, expectedVaultId: "bad" },
    { ...readInput, companyId: "bad" },
    { ...readInput, specVersion: 2 },
    { ...readInput, contacts: [] },
  ])("rejects malformed read scope before opening storage (%j)", async (input) => {
    const { api, open } = setup();
    expect(await api.read(input)).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(open).not.toHaveBeenCalled();
  });

  it("returns validated exact read facts from the selected runtime without manufacturing relationships", async () => {
    const local = setup();
    expect(await local.api.read(readInput)).toEqual({ ok: true, value: envelope() });
    expect(local.open).toHaveBeenCalledTimes(1);
    expect(port.read).toHaveBeenCalledWith({ ...readInput, includeArchived: false });
    expect(local.createId).not.toHaveBeenCalled();
  });

  it("copies the original viewed read scope before lazy database opening", async () => {
    const local = setup();
    let release;
    local.open.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const input = { ...readInput };
    const pending = local.api.read(input);
    input.expectedVaultId = otherVaultId;
    release({ syntheticSelectedDatabase: true });
    expect(await pending).toEqual({ ok: true, value: envelope() });
    expect(port.read.mock.calls[0][0].expectedVaultId).toBe(vaultId);
  });

  it("allocates one fixed identity on explicit draft creation without opening or writing", () => {
    const local = setup();
    const draft = local.api.beginCreation(vaultId);
    expect(draft.companyId).toBe(companyId);
    expect(draft.vaultId).toBe(vaultId);
    expect(draft.createdAt()).toBeNull();
    expect(Object.isFrozen(draft)).toBe(true);
    expect(local.createId).toHaveBeenCalledTimes(1);
    expect(local.clock).not.toHaveBeenCalled();
    expect(local.open).not.toHaveBeenCalled();
    expect(port.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid draft owner before allocating an identity or opening storage", () => {
    const local = setup();
    expect(() => local.api.beginCreation("invalid")).toThrow();
    expect(local.createId).not.toHaveBeenCalled();
    expect(local.open).not.toHaveBeenCalled();
  });

  it("binds every save/retry to the draft identity and first attempt's copied time", async () => {
    const local = setup();
    const sourceContext = context();
    local.clock.mockReturnValue(sourceContext);
    const draft = local.api.beginCreation(vaultId);
    expect(await draft.save(fields)).toEqual({ ok: true, value: envelope() });
    sourceContext.initiatedAt = later;
    expect(await draft.save(fields)).toEqual({ ok: true, value: envelope() });
    expect(local.createId).toHaveBeenCalledTimes(1);
    expect(local.clock).toHaveBeenCalledTimes(1);
    expect(draft.createdAt()).toBe(at);
    expect(
      port.create.mock.calls.map(([input]) => [
        input.expectedVaultId,
        input.company.id,
        input.company.createdAt,
      ]),
    ).toEqual([
      [vaultId, companyId, at],
      [vaultId, companyId, at],
    ]);
    // This is composition proof; actual duplicate rejection is in shared SQLite contracts.
  });

  it("retains the same creation identity/time after an uncertain database-open failure", async () => {
    const local = setup();
    local.open.mockRejectedValueOnce(new Error("Synthetic private path / token"));
    const draft = local.api.beginCreation(vaultId);
    const first = await draft.save(fields);
    expect(first).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(first)).not.toContain("private");
    expect(await draft.save(fields)).toMatchObject({ ok: true });
    expect(local.createId).toHaveBeenCalledTimes(1);
    expect(draft.createdAt()).toBe(at);
    expect(port.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...fields, origin: "source_backed" },
    { ...fields, canonicalName: "x".repeat(513) },
    { ...fields, notes: "bad\u0000notes" },
  ])("rejects invalid draft fields before opening storage (%j)", async (input) => {
    const local = setup();
    const draft = local.api.beginCreation(vaultId);
    expect(await draft.save(input)).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(local.open).not.toHaveBeenCalled();
    expect(port.create).not.toHaveBeenCalled();
  });

  it("keeps the original viewed version, vault and literal notes for the concrete notes port", async () => {
    const local = setup();
    local.clock.mockReturnValue({ ...context(), initiatedAt: later });
    const input = { ...readInput, expectedRowVersion: 1, notes: "\n  replacement 🧭  " };
    expect(await local.api.updateNotes(input)).toEqual({
      ok: true,
      value: envelope({ ...company, notes: input.notes, updatedAt: later, rowVersion: 2 }),
    });
    expect(port.updateNotes).toHaveBeenCalledWith({ ...input, updatedAt: later });
    expect(local.createId).not.toHaveBeenCalled();
  });

  it("redacts open failure on read without querying a fallback", async () => {
    const local = setup();
    local.open.mockRejectedValue(new Error("Synthetic private SQL / path"));
    const result = await local.api.read(readInput);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(local.open).toHaveBeenCalledTimes(1);
    expect(port.read).not.toHaveBeenCalled();
  });
});
