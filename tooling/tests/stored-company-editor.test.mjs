import { describe, expect, it, vi } from "vitest";
import { createStoredCompanyEditor } from "../../apps/web/src/stored-company-editor.ts";

const vaultId = "0199b361-0000-7000-8000-000000000001";
const otherVaultId = "0199b361-0000-7000-8000-000000000009";
const id = "0199b361-0000-7000-8000-000000000003";
const at = "2026-10-21T12:00:00.000Z";
const later = "2026-10-21T13:00:00.000Z";
const record = {
  id,
  canonicalName: "Synthetic company",
  websiteUrl: null,
  domain: null,
  locationId: null,
  notes: "prior notes",
  archivedAt: null,
  createdAt: at,
  updatedAt: at,
  rowVersion: 1,
};
const detail = (company = record) => ({ specVersion: 1, vaultId, company });
const ok = (value) => ({ ok: true, value });
const fail = (code = "unavailable") => ({
  ok: false,
  error: { code, message: "SYNTHETIC_PRIVATE_DETAIL", retryable: false },
});
const deferred = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
const setup = () => {
  const save = vi.fn(async (input) =>
    ok(
      detail({
        ...record,
        canonicalName: input.canonicalName,
        websiteUrl: input.websiteUrl ?? null,
        domain: input.domain?.toLowerCase() ?? null,
        notes: input.notes ?? "",
      }),
    ),
  );
  const api = {
    beginCreation: vi.fn(() => ({ companyId: id, vaultId, createdAt: () => at, save })),
    updateNotes: vi.fn(async (input) =>
      ok(detail({ ...record, notes: input.notes, updatedAt: later, rowVersion: 2 })),
    ),
    read: vi.fn(async () => ok(detail())),
  };
  const changed = vi.fn();
  const exclusive = vi.fn(async (_vault, work) => work());
  const allowed = vi.fn(() => true);
  const editor = createStoredCompanyEditor({ api: () => api, changed, exclusive, allowed });
  return { editor, api, save, changed, exclusive, allowed };
};

describe("root-owned company drafts", () => {
  it("keeps one explicit draft owner and complete literal values without silent replacement", () => {
    const { editor, api } = setup();
    expect(editor.current()).toBeNull();
    expect(editor.startCreate(vaultId)).toBe(true);
    expect(editor.startCreate(vaultId)).toBe(false);
    expect(editor.edit(vaultId, "canonicalName", "  <Synthetic> 🧭  ")).toBe(true);
    expect(editor.edit(vaultId, "notes", "🧭".repeat(100_000))).toBe(true);
    expect(editor.edit(vaultId, "notes", "x".repeat(200_001))).toBe(false);
    expect(editor.current().fields.notes).toHaveLength(200_000);
    expect(editor.current().fields.canonicalName).toBe("  <Synthetic> 🧭  ");
    expect(editor.startNotes(detail())).toBe(false);
    expect(api.beginCreation).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(editor.current().fields)).toBe(true);
    expect(editor.hasUnsaved()).toBe(true);
  });

  it("retains the original viewed company version and only permits notes editing", async () => {
    const local = setup();
    const source = detail({ ...record });
    expect(local.editor.startNotes(source)).toBe(true);
    source.company.rowVersion = 99;
    expect(local.editor.edit(vaultId, "canonicalName", "replacement")).toBe(false);
    expect(local.editor.edit(vaultId, "notes", "\n <b>literal</b> 🧭  ")).toBe(true);
    expect(await local.editor.save(vaultId)).toBe(true);
    expect(local.api.updateNotes).toHaveBeenCalledWith({
      specVersion: 1,
      expectedVaultId: vaultId,
      companyId: id,
      expectedRowVersion: 1,
      notes: "\n <b>literal</b> 🧭  ",
    });
    expect(local.editor.current().phase).toBe("saved");
    expect(local.editor.hasUnsaved()).toBe(false);
    expect(local.exclusive.mock.calls[0][0]).toBe(vaultId);
  });

  it("does not replace the stored company or silently rebase a stale failed draft", async () => {
    const local = setup();
    local.api.updateNotes.mockResolvedValue(fail("conflict"));
    local.editor.startNotes(detail());
    local.editor.edit(vaultId, "notes", "retained note");
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(local.editor.current()).toMatchObject({
      phase: "uncertain",
      expectedRowVersion: 1,
      fields: { notes: "retained note" },
    });
    expect(local.editor.edit(vaultId, "notes", "silently rebased")).toBe(false);
    expect(await local.editor.save(vaultId)).toBe(false);
    local.api.read.mockResolvedValue(
      ok(detail({ ...record, rowVersion: 3, notes: "different stored note", updatedAt: later })),
    );
    expect(await local.editor.recover(vaultId)).toBe(false);
    expect(local.api.updateNotes).toHaveBeenCalledTimes(1);
    expect(local.editor.current().expectedRowVersion).toBe(1);
    expect(JSON.stringify(local.editor.current())).not.toContain("PRIVATE");
  });

  it("locks editing/discard/replacement/duplicate save during acknowledgement", async () => {
    const local = setup();
    const held = deferred();
    local.save.mockReturnValue(held.promise);
    local.editor.startCreate(vaultId);
    local.editor.edit(vaultId, "canonicalName", "Synthetic company");
    const pending = local.editor.save(vaultId);
    expect(local.editor.current().busy).toBe(true);
    expect(local.editor.edit(vaultId, "notes", "replacement")).toBe(false);
    expect(local.editor.discard(vaultId)).toBe(false);
    expect(local.editor.startCreate(vaultId)).toBe(false);
    expect(await local.editor.save(vaultId)).toBe(false);
    held.release(ok(detail({ ...record, notes: "" })));
    expect(await pending).toBe(true);
    expect(local.save).toHaveBeenCalledTimes(1);
  });

  it("blocks foreign-vault actions without rebinding the retained draft", async () => {
    const local = setup();
    local.editor.startNotes(detail());
    expect(local.editor.edit(otherVaultId, "notes", "foreign")).toBe(false);
    expect(await local.editor.save(otherVaultId)).toBe(false);
    expect(await local.editor.recover(otherVaultId)).toBe(false);
    expect(local.editor.discard(otherVaultId)).toBe(false);
    expect(local.api.updateNotes).not.toHaveBeenCalled();
    expect(local.editor.current().vaultId).toBe(vaultId);
  });

  it("does not submit while the shared vault exclusion rejects before work", async () => {
    const local = setup();
    local.exclusive.mockResolvedValue(fail("conflict"));
    local.editor.startNotes(detail());
    local.editor.edit(vaultId, "notes", "retained");
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(local.editor.current().phase).toBe("editing");
    expect(local.api.updateNotes).not.toHaveBeenCalled();
  });

  it("blocks writes while reload/deletion disables the mutation owner", async () => {
    const local = setup();
    local.editor.startNotes(detail());
    local.allowed.mockReturnValue(false);
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(local.api.updateNotes).not.toHaveBeenCalled();
  });

  it("does not invent acknowledgement when a faulty exclusion returns success without invoking work", async () => {
    const local = setup();
    local.exclusive.mockResolvedValue(ok(detail({ ...record, rowVersion: 2, updatedAt: later })));
    local.editor.startNotes(detail());
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(local.editor.current()).toMatchObject({ phase: "editing", acknowledged: null });
    expect(local.api.updateNotes).not.toHaveBeenCalled();
  });

  it("retains known validation failures as editable without inventing acknowledgement", async () => {
    const local = setup();
    local.save.mockResolvedValue(fail("validation"));
    local.editor.startCreate(vaultId);
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(local.editor.current().phase).toBe("editing");
    expect(local.editor.current().acknowledged).toBeNull();
    expect(local.editor.edit(vaultId, "canonicalName", "fixed")).toBe(true);
  });

  it("reconciles a lost creation acknowledgement only by reading its fixed identity", async () => {
    const local = setup();
    local.save.mockRejectedValue(new Error("Synthetic private adapter path"));
    local.editor.startCreate(vaultId);
    local.editor.edit(vaultId, "canonicalName", record.canonicalName);
    local.api.read.mockResolvedValue(ok(detail({ ...record, notes: "" })));
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(await local.editor.recover(vaultId)).toBe(true);
    expect(local.api.read).toHaveBeenCalledWith({
      specVersion: 1,
      expectedVaultId: vaultId,
      companyId: id,
      includeArchived: true,
    });
    expect(local.save).toHaveBeenCalledTimes(1);
    expect(local.editor.current().phase).toBe("saved");
    expect(local.editor.current().recovered).toBe(true);
  });

  it("allows explicit same-ID retry only after a read finds that creation identity absent", async () => {
    const local = setup();
    local.save.mockResolvedValueOnce(fail());
    local.editor.startCreate(vaultId);
    local.editor.edit(vaultId, "canonicalName", record.canonicalName);
    expect(await local.editor.save(vaultId)).toBe(false);
    local.api.read.mockResolvedValue(fail("not_found"));
    expect(await local.editor.recover(vaultId)).toBe(false);
    expect(local.editor.current().phase).toBe("editing");
    expect(await local.editor.save(vaultId)).toBe(true);
    expect(local.api.beginCreation).toHaveBeenCalledTimes(1);
    expect(local.save).toHaveBeenCalledTimes(2);
  });

  it("reconciles notes only when version and preserved facts match the original intent", async () => {
    const local = setup();
    local.api.updateNotes.mockResolvedValue(fail());
    local.editor.startNotes(detail());
    local.editor.edit(vaultId, "notes", "desired");
    await local.editor.save(vaultId);
    local.api.read.mockResolvedValue(
      ok(detail({ ...record, notes: "desired", rowVersion: 2, updatedAt: later })),
    );
    expect(await local.editor.recover(vaultId)).toBe(true);
    expect(local.api.updateNotes).toHaveBeenCalledTimes(1);
    expect(local.editor.current().recovered).toBe(true);
  });

  it("retains the exact original notes version after read-only recovery finds no edit", async () => {
    const local = setup();
    local.api.updateNotes.mockResolvedValue(fail());
    local.editor.startNotes(detail());
    local.editor.edit(vaultId, "notes", "desired");
    await local.editor.save(vaultId);
    expect(await local.editor.recover(vaultId)).toBe(false);
    expect(local.editor.current()).toMatchObject({
      phase: "editing",
      expectedRowVersion: 1,
      fields: { notes: "desired" },
    });
  });

  it.each(["foreign", "wrong-notes", "wrong-version", "archived", "changed-name"])(
    "keeps an invalid notes acknowledgement uncertain (%s)",
    async (kind) => {
      const local = setup();
      const company = { ...record, notes: "desired", rowVersion: 2, updatedAt: later };
      if (kind === "wrong-notes") company.notes = "different";
      if (kind === "wrong-version") company.rowVersion = 3;
      if (kind === "archived") company.archivedAt = later;
      if (kind === "changed-name") company.canonicalName = "altered";
      const value = detail(company);
      if (kind === "foreign") value.vaultId = otherVaultId;
      local.api.updateNotes.mockResolvedValue(ok(value));
      local.editor.startNotes(detail());
      local.editor.edit(vaultId, "notes", "desired");
      expect(await local.editor.save(vaultId)).toBe(false);
      expect(local.editor.current().phase).toBe("uncertain");
    },
  );

  it.each([true, false])("suppresses late disposed publication, success=%j", async (success) => {
    const local = setup();
    const held = deferred();
    local.api.updateNotes.mockReturnValue(held.promise);
    local.editor.startNotes(detail());
    const pending = local.editor.save(vaultId);
    local.editor.dispose();
    const calls = local.changed.mock.calls.length;
    held.release(success ? ok(detail({ ...record, rowVersion: 2, updatedAt: later })) : fail());
    expect(await pending).toBe(false);
    expect(local.changed).toHaveBeenCalledTimes(calls);
    expect(local.editor.current()).toBeNull();
  });

  it("does not invoke storage after synchronous disposal from busy publication", async () => {
    let editor;
    const local = setup();
    editor = createStoredCompanyEditor({
      api: () => local.api,
      changed: (draft) => {
        if (draft.busy) editor.dispose();
      },
    });
    editor.startNotes(detail());
    expect(await editor.save(vaultId)).toBe(false);
    expect(local.api.updateNotes).not.toHaveBeenCalled();
  });

  it("clears private state only through explicit nonpending discard or disposal", () => {
    const local = setup();
    local.editor.startNotes(detail());
    expect(local.editor.hasUnsaved()).toBe(false);
    local.editor.edit(vaultId, "notes", "changed");
    expect(local.editor.hasUnsaved()).toBe(true);
    expect(local.editor.discard(vaultId)).toBe(true);
    expect(local.editor.current()).toBeNull();
    expect(local.api.updateNotes).not.toHaveBeenCalled();
  });
});
