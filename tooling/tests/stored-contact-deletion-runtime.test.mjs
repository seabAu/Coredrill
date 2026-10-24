import { beforeEach, describe, expect, it, vi } from "vitest";
import { entityId, instant } from "../../packages/domain/dist/index.js";
const ports = vi.hoisted(() => ({ remove: vi.fn(), inspect: vi.fn(), factory: vi.fn() }));
vi.mock("../../packages/storage-core/dist/index.js", async (original) => ({
  ...(await original()),
  createContactDeletionRepository: (database) => {
    ports.factory(database);
    return ports;
  },
}));
import { createStoredContactDeletionApi } from "../../apps/web/src/stored-contact-deletion.ts";
const id = (n) => `0198e116-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = instant("2026-10-24T19:00:00.000Z");
const later = instant("2026-10-24T20:00:00.000Z");
const workspace = () => ({
  specVersion: 1,
  vaultId: id(1),
  contact: {
    id: id(2),
    companyId: null,
    name: "Synthetic private contact",
    notes: "Synthetic private notes",
    role: null,
    email: null,
    phone: null,
    publicProfileUrl: null,
    confidence: null,
    userConfirmed: true,
    archivedAt: null,
    createdAt: at,
    updatedAt: at,
    rowVersion: 1,
  },
  manualCreation: null,
});
const output = (state) => ({ specVersion: 1, vaultId: id(1), contactId: id(2), state });
const setup = () => {
  const selected = { syntheticSelected: true };
  const open = vi.fn(async () => selected);
  const clock = vi.fn(() => ({
    operationId: entityId("application-operation", id(3)),
    initiatedAt: at,
  }));
  return { open, selected, clock, api: createStoredContactDeletionApi(open, clock) };
};
beforeEach(() => {
  vi.clearAllMocks();
  ports.remove.mockResolvedValue(output("deleted"));
  ports.inspect.mockResolvedValue(output("original_present"));
});
describe("selected-runtime contact deletion", () => {
  it("constructs a bound original target without storage, clock allocation or private-field retention", () => {
    const { api, open, clock } = setup();
    const viewed = workspace();
    const action = api.begin(viewed);
    viewed.contact.rowVersion = 2;
    expect(action.target.expectedRowVersion).toBe(1);
    expect(Object.isFrozen(action.target)).toBe(true);
    expect(Object.isFrozen(action)).toBe(true);
    expect(JSON.stringify(action.target)).not.toContain("private");
    expect(action.attemptContext()).toBeNull();
    expect(open).not.toHaveBeenCalled();
    expect(clock).not.toHaveBeenCalled();
  });
  it("rejects malformed selected state and wrong confirmation before opening storage", async () => {
    const { api, open, clock } = setup();
    expect(() => api.begin({ ...workspace(), unexpected: true })).toThrow();
    const action = api.begin(workspace());
    for (const confirmation of [
      "DELETE",
      "delete contact",
      " DELETE CONTACT",
      null,
      { confirmation: "DELETE CONTACT" },
    ])
      expect(await action.remove(confirmation)).toMatchObject({
        ok: false,
        error: { code: "validation" },
      });
    expect(open).not.toHaveBeenCalled();
    expect(clock).not.toHaveBeenCalled();
    expect(ports.remove).not.toHaveBeenCalled();
  });
  it("routes exactly the original frozen target through the selected repository", async () => {
    const { api, selected, open, clock } = setup();
    const viewed = workspace();
    const action = api.begin(viewed);
    viewed.vaultId = id(99);
    viewed.contact.id = id(98);
    viewed.contact.rowVersion = 8;
    expect(await action.remove("DELETE CONTACT")).toEqual({ ok: true, value: output("deleted") });
    expect(ports.factory).toHaveBeenCalledWith(selected);
    expect(ports.remove).toHaveBeenCalledWith(action.target);
    expect(action.target.expectedVaultId).toBe(id(1));
    expect(action.target.contactId).toBe(id(2));
    expect(open).toHaveBeenCalledTimes(1);
    expect(clock).toHaveBeenCalledTimes(1);
  });
  it("keeps first write context across explicit observation and identical retry without attributing a receipt", async () => {
    const { api, clock, open } = setup();
    const action = api.begin(workspace());
    ports.remove.mockRejectedValueOnce(new Error("PRIVATE acknowledgement failure"));
    expect(await action.remove("DELETE CONTACT")).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    const first = action.attemptContext();
    clock.mockReturnValue({
      operationId: entityId("application-operation", id(4)),
      initiatedAt: later,
    });
    expect(await action.inspect()).toEqual({ ok: true, value: output("original_present") });
    expect(await action.remove("DELETE CONTACT")).toEqual({ ok: true, value: output("deleted") });
    expect(action.attemptContext()).toBe(first);
    expect(first.operationId).toBe(id(3));
    expect(ports.remove).toHaveBeenCalledTimes(2);
    expect(ports.inspect).toHaveBeenCalledTimes(1);
    expect(clock).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledTimes(3);
  });
  it("performs read-only observation without starting a write context", async () => {
    const { api } = setup();
    const action = api.begin(workspace());
    ports.inspect.mockResolvedValue(output("absent_complete"));
    expect(await action.inspect()).toEqual({ ok: true, value: output("absent_complete") });
    expect(action.attemptContext()).toBeNull();
    expect(ports.remove).not.toHaveBeenCalled();
  });
  it("does not rebind an old action when the selected database or response belongs elsewhere", async () => {
    const { api, open } = setup();
    const action = api.begin(workspace());
    open.mockResolvedValue({ otherSelected: true });
    ports.inspect.mockResolvedValue({ ...output("absent_complete"), vaultId: id(99) });
    expect(await action.inspect()).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(ports.inspect).toHaveBeenCalledWith(action.target);
    expect(action.target.expectedVaultId).toBe(id(1));
    expect(ports.remove).not.toHaveBeenCalled();
  });
  it("maps unavailable storage and malformed clocks without leaking private details", async () => {
    const { api, open, clock } = setup();
    const action = api.begin(workspace());
    clock.mockImplementationOnce(() => {
      throw new Error("PRIVATE clock");
    });
    expect(await action.remove("DELETE CONTACT")).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(open).not.toHaveBeenCalled();
    open.mockRejectedValue(new Error("PRIVATE database path"));
    const result = await action.remove("DELETE CONTACT");
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(ports.factory).not.toHaveBeenCalled();
  });
});
