import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  parseManualContactFields,
  contactFieldValues,
  resolveContactManualFieldsV1,
} from "../../packages/application/dist/index.js";
import { createStoredContactEditor } from "../../apps/web/src/stored-contact-editor.ts";

const vaultId = "0199b364-0000-7000-8000-000000000001";
const otherVaultId = "0199b364-0000-7000-8000-000000000002";
const contactId = "0199b364-0000-7000-8000-000000000003";
const companyId = "0199b364-0000-7000-8000-000000000004";
const operationId = "0199b364-0000-7000-8000-000000000005";
const at = "2026-10-21T12:00:00.000Z";
const later = "2026-10-21T13:00:00.000Z";
const hash = async (value) => createHash("sha256").update(value).digest("hex");
const fields = {
  name: "  Synthetic <contact> 🧭  ",
  role: "Engineer",
  email: "manual@synthetic.example",
  phone: "",
  publicProfileUrl: "https://synthetic.example/people/manual",
  notes: "  literal\n<b>note</b> 🧭  ",
};
const company = () => ({
  specVersion: 1,
  vaultId,
  company: {
    id: companyId,
    canonicalName: "Synthetic linked company",
    websiteUrl: null,
    domain: null,
    locationId: null,
    notes: "",
    archivedAt: null,
    createdAt: at,
    updatedAt: at,
    rowVersion: 3,
  },
});
const failure = (code = "unavailable") => ({
  ok: false,
  error: { code, message: "PRIVATE synthetic SQL / path", retryable: true },
});
const deferred = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
const setup = () => {
  let canonical = null;
  let chosen = null;
  let permitted = true;
  const context = { operationId, initiatedAt: at };
  const envelope = async (input = { origin: "user_entered", ...fields, phone: null }) => {
    const parsed = parseManualContactFields({ ...input, companyId: chosen?.id ?? null });
    const values = contactFieldValues(parsed);
    const hashes = {};
    for (const [field, value] of Object.entries(values))
      hashes[field] = value === null ? null : await hash(value);
    return {
      specVersion: 1,
      vaultId,
      contact: { ...parsed, id: contactId, createdAt: at, updatedAt: at, rowVersion: 1 },
      manualCreation: { operationId, createdAt: at, valueHashes: hashes },
    };
  };
  const capability = {
    vaultId,
    contactId,
    companyId: null,
    expectedCompanyRowVersion: null,
    attemptContext: vi.fn(() => context),
    save: vi.fn(async (input) => {
      canonical = await envelope(input);
      return { ok: true, value: canonical };
    }),
  };
  const api = {
    beginCreation: vi.fn((owner, selected) => {
      chosen = selected === null ? null : { ...selected };
      return {
        ...capability,
        vaultId: owner,
        companyId: chosen?.id ?? null,
        expectedCompanyRowVersion: chosen?.rowVersion ?? null,
      };
    }),
    read: vi.fn(async () =>
      canonical === null ? failure("not_found") : { ok: true, value: canonical },
    ),
    updateNotes: vi.fn(async (input) => {
      canonical = {
        ...canonical,
        contact: {
          ...canonical.contact,
          notes: input.notes,
          rowVersion: input.expectedRowVersion + 1,
          updatedAt: later,
        },
      };
      return { ok: true, value: canonical };
    }),
    resolveManualFields: vi.fn((value) => resolveContactManualFieldsV1(value, hash)),
  };
  const changed = vi.fn();
  const getApi = vi.fn(() => api);
  const exclusive = vi.fn(async (owner, work) => work());
  const editor = createStoredContactEditor({
    api: getApi,
    changed,
    exclusive,
    allowed: () => permitted,
  });
  const fill = () => {
    for (const [key, value] of Object.entries(fields))
      expect(editor.edit(vaultId, key, value)).toBe(true);
  };
  return {
    editor,
    api,
    capability,
    context,
    changed,
    getApi,
    exclusive,
    envelope,
    fill,
    canonical: () => canonical,
    setCanonical: (value) => {
      canonical = value;
    },
    permit: (value) => {
      permitted = value;
    },
  };
};

describe("owned local contact drafts", () => {
  it("starts only an explicit fixed identity without submitting or hashing", () => {
    const local = setup();
    expect(local.editor.current()).toBeNull();
    expect(local.editor.startCreate(vaultId)).toBe(true);
    expect(local.editor.current()).toMatchObject({
      mode: "create",
      vaultId,
      contactId,
      companyId: null,
      phase: "editing",
      dirty: false,
      busy: false,
      acknowledged: null,
    });
    expect(local.editor.hasUnsaved()).toBe(false);
    expect(local.capability.save).not.toHaveBeenCalled();
    expect(local.capability.attemptContext).not.toHaveBeenCalled();
    expect(local.api.resolveManualFields).not.toHaveBeenCalled();
    expect(local.editor.startCreate(vaultId)).toBe(false);
  });

  it("copies viewed company/version and retains literal fields in a frozen session model", () => {
    const local = setup();
    const selected = company();
    expect(local.editor.startCreate(vaultId, selected)).toBe(true);
    selected.company.canonicalName = "changed";
    selected.company.rowVersion = 99;
    local.fill();
    const model = local.editor.current();
    expect(model).toMatchObject({
      companyId,
      companyName: "Synthetic linked company",
      expectedCompanyRowVersion: 3,
      fields,
      dirty: true,
    });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.fields)).toBe(true);
    expect(local.api.beginCreation).toHaveBeenCalledExactlyOnceWith(vaultId, {
      id: companyId,
      rowVersion: 3,
    });
    expect(local.editor.hasUnsaved()).toBe(true);
  });

  it.each([
    ["name", 512],
    ["role", 512],
    ["email", 320],
    ["phone", 128],
    ["publicProfileUrl", 8192],
    ["notes", 200000],
  ])(
    "preserves the full %s bound and explicitly rejects oversize/NUL without truncation",
    (field, maximum) => {
      const local = setup();
      local.editor.startCreate(vaultId);
      const value = "x".repeat(maximum);
      expect(local.editor.edit(vaultId, field, value)).toBe(true);
      expect(local.editor.edit(vaultId, field, `${value}x`)).toBe(false);
      expect(local.editor.current().fields[field]).toBe(value);
      expect(local.editor.current().error).toContain("not truncated");
      expect(local.editor.edit(vaultId, field, "bad\u0000value")).toBe(false);
      expect(local.editor.current().fields[field]).toBe(value);
      expect(local.capability.save).not.toHaveBeenCalled();
    },
  );

  it("rejects a foreign owner and unknown field without changing original input", async () => {
    const local = setup();
    local.editor.startCreate(vaultId);
    local.fill();
    const before = local.editor.current();
    expect(local.editor.edit(otherVaultId, "name", "wrong")).toBe(false);
    expect(local.editor.edit(vaultId, "__proto__", "wrong")).toBe(false);
    expect(await local.editor.save(otherVaultId)).toBe(false);
    expect(await local.editor.recover(otherVaultId)).toBe(false);
    expect(local.editor.discard(otherVaultId)).toBe(false);
    expect(local.editor.current()).toBe(before);
    expect(local.capability.save).not.toHaveBeenCalled();
  });

  it.each([
    { ...company(), vaultId: otherVaultId },
    { ...company(), company: { ...company().company, archivedAt: at } },
    { ...company(), company: { ...company().company, rowVersion: 0 } },
  ])(
    "rejects invalid/foreign/archived company selection before acquiring a creation capability",
    (selected) => {
      const local = setup();
      expect(local.editor.startCreate(vaultId, selected)).toBe(false);
      expect(local.getApi).not.toHaveBeenCalled();
      expect(local.api.beginCreation).not.toHaveBeenCalled();
      expect(local.editor.current()).toBeNull();
    },
  );

  it("rejects a foreign or misbound creation capability", () => {
    const local = setup();
    local.api.beginCreation.mockReturnValue({ ...local.capability, vaultId: otherVaultId });
    expect(local.editor.startCreate(vaultId)).toBe(false);
    expect(local.editor.current()).toBeNull();
  });

  it("does not start or submit when mutation ownership is unavailable", async () => {
    const local = setup();
    local.permit(false);
    expect(local.editor.startCreate(vaultId)).toBe(false);
    local.permit(true);
    local.editor.startCreate(vaultId);
    local.fill();
    local.permit(false);
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(local.capability.save).not.toHaveBeenCalled();
    expect(local.editor.current().fields).toEqual(fields);
  });

  it("saves exact manual fields with nullable omissions and validates the actual receipt", async () => {
    const local = setup();
    local.editor.startCreate(vaultId);
    local.fill();
    expect(await local.editor.save(vaultId)).toBe(true);
    expect(local.capability.save).toHaveBeenCalledExactlyOnceWith({
      origin: "user_entered",
      ...fields,
      phone: null,
    });
    expect(local.editor.current()).toMatchObject({
      phase: "saved",
      recovered: false,
      acknowledged: {
        contact: { name: fields.name, phone: null },
        manualCreation: { operationId },
      },
    });
    expect(local.editor.hasUnsaved()).toBe(false);
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(await local.editor.recover(vaultId)).toBe(false);
    expect(local.capability.save).toHaveBeenCalledOnce();
  });

  it("keeps pending intent single-flight and rejects edit/discard/recovery", async () => {
    const local = setup();
    const held = deferred();
    local.capability.save.mockReturnValueOnce(held.promise);
    local.editor.startCreate(vaultId);
    local.fill();
    const pending = local.editor.save(vaultId);
    expect(local.editor.current().busy).toBe(true);
    expect(local.editor.hasUnsaved()).toBe(true);
    expect(local.editor.edit(vaultId, "name", "replacement")).toBe(false);
    expect(local.editor.discard(vaultId)).toBe(false);
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(await local.editor.recover(vaultId)).toBe(false);
    held.release({ ok: true, value: await local.envelope() });
    expect(await pending).toBe(true);
    expect(local.capability.save).toHaveBeenCalledOnce();
  });

  it("retains invalid input after a safe validation failure without locking or inferring a save", async () => {
    const local = setup();
    local.capability.save.mockResolvedValueOnce(failure("validation"));
    local.editor.startCreate(vaultId);
    local.fill();
    local.editor.edit(vaultId, "email", "invalid email");
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(local.editor.current()).toMatchObject({
      phase: "editing",
      fields: { ...fields, email: "invalid email" },
    });
    expect(JSON.stringify(local.editor.current())).not.toContain("PRIVATE");
    expect(local.editor.edit(vaultId, "email", fields.email)).toBe(true);
  });

  it("recovers a lost creation acknowledgement by exact read only, never another write", async () => {
    const local = setup();
    local.capability.save.mockImplementationOnce(async (input) => {
      local.setCanonical(await local.envelope(input));
      throw new Error("PRIVATE synthetic adapter error");
    });
    local.editor.startCreate(vaultId);
    local.fill();
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(local.editor.current().phase).toBe("uncertain");
    expect(local.editor.edit(vaultId, "name", "replacement")).toBe(false);
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(await local.editor.recover(vaultId)).toBe(true);
    expect(local.editor.current()).toMatchObject({ phase: "saved", recovered: true });
    expect(local.api.read).toHaveBeenCalledExactlyOnceWith({
      specVersion: 1,
      expectedVaultId: vaultId,
      contactId,
      includeArchived: true,
    });
    expect(local.capability.save).toHaveBeenCalledOnce();
    expect(JSON.stringify(local.editor.current())).not.toContain("PRIVATE");
  });

  it("keeps uncertain intent locked through failed readback and only retries reads explicitly", async () => {
    const local = setup();
    local.capability.save.mockImplementationOnce(async (input) => {
      local.setCanonical(await local.envelope(input));
      return failure();
    });
    local.api.read.mockRejectedValueOnce(new Error("PRIVATE synthetic path"));
    local.editor.startCreate(vaultId);
    local.fill();
    await local.editor.save(vaultId);
    expect(await local.editor.recover(vaultId)).toBe(false);
    expect(local.editor.current().phase).toBe("uncertain");
    expect(await local.editor.recover(vaultId)).toBe(true);
    expect(local.capability.save).toHaveBeenCalledOnce();
    expect(local.api.read).toHaveBeenCalledTimes(2);
  });

  it("permits only an explicit same-identity retry after the fixed creation ID was not found", async () => {
    const local = setup();
    local.capability.save.mockResolvedValueOnce(failure());
    local.editor.startCreate(vaultId);
    local.fill();
    await local.editor.save(vaultId);
    expect(await local.editor.recover(vaultId)).toBe(false);
    expect(local.editor.current()).toMatchObject({ phase: "editing", contactId, fields });
    expect(local.capability.save).toHaveBeenCalledOnce();
    expect(await local.editor.save(vaultId)).toBe(true);
    expect(local.api.beginCreation).toHaveBeenCalledOnce();
    expect(local.capability.save).toHaveBeenCalledTimes(2);
  });

  it.each([
    (value) => ({ ...value, vaultId: otherVaultId }),
    (value) => ({ ...value, contact: { ...value.contact, rowVersion: 2 } }),
    (value) => ({ ...value, contact: { ...value.contact, companyId } }),
    (value) => ({ ...value, contact: { ...value.contact, notes: "different" } }),
    (value) => ({ ...value, manualCreation: null }),
    (value) => ({
      ...value,
      manualCreation: { ...value.manualCreation, operationId: otherVaultId },
    }),
    (value) => ({
      ...value,
      manualCreation: {
        ...value.manualCreation,
        valueHashes: { ...value.manualCreation.valueHashes, name: "f".repeat(64) },
      },
    }),
  ])("locks a malformed, foreign or uncorrelated creation acknowledgement (%#)", async (mutate) => {
    const local = setup();
    local.capability.save.mockImplementationOnce(async () => ({
      ok: true,
      value: mutate(await local.envelope()),
    }));
    local.editor.startCreate(vaultId);
    local.fill();
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(local.editor.current()).toMatchObject({
      phase: "uncertain",
      acknowledged: null,
      fields,
    });
  });

  it("copies the original attempt before awaiting receipt hashing", async () => {
    const local = setup();
    const held = deferred();
    local.api.resolveManualFields.mockReturnValueOnce(held.promise);
    local.editor.startCreate(vaultId);
    local.fill();
    const pending = local.editor.save(vaultId);
    await vi.waitFor(() => expect(local.api.resolveManualFields).toHaveBeenCalledOnce());
    local.context.initiatedAt = later;
    local.context.operationId = otherVaultId;
    held.release(["name", "role", "email", "public_profile_url"]);
    expect(await pending).toBe(true);
    expect(local.editor.current().acknowledged.manualCreation.operationId).toBe(operationId);
  });

  it("suppresses late receipt-hash acknowledgement after disposal", async () => {
    const local = setup();
    const held = deferred();
    local.api.resolveManualFields.mockReturnValueOnce(held.promise);
    local.editor.startCreate(vaultId);
    local.fill();
    const pending = local.editor.save(vaultId);
    await vi.waitFor(() => expect(local.api.resolveManualFields).toHaveBeenCalledOnce());
    local.editor.dispose();
    const count = local.changed.mock.calls.length;
    held.release(["name", "role", "email", "public_profile_url"]);
    expect(await pending).toBe(false);
    expect(local.editor.current()).toBeNull();
    expect(local.changed).toHaveBeenCalledTimes(count);
  });

  it("rejects a fabricated successful exclusion result if no write was submitted", async () => {
    const local = setup();
    local.exclusive.mockResolvedValueOnce({ ok: true, value: await local.envelope() });
    local.editor.startCreate(vaultId);
    local.fill();
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(local.editor.current().phase).toBe("editing");
    expect(local.capability.save).not.toHaveBeenCalled();
  });

  it("retains original intent when exclusion rejects before submission", async () => {
    const local = setup();
    local.exclusive.mockResolvedValueOnce(failure("conflict"));
    local.editor.startCreate(vaultId);
    local.fill();
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(local.editor.current()).toMatchObject({ phase: "editing", fields });
    expect(local.capability.save).not.toHaveBeenCalled();
  });
});

describe("viewed-version contact notes drafts", () => {
  const notesSetup = async (legacy = false) => {
    const local = setup();
    const viewed = await local.envelope();
    if (legacy) viewed.manualCreation = null;
    local.setCanonical(viewed);
    expect(local.editor.startNotes(viewed)).toBe(true);
    expect(local.editor.edit(vaultId, "notes", "  replacement\nnotes 🧭  ")).toBe(true);
    return { ...local, viewed };
  };
  it.each([false, true])(
    "updates only original notes/version and preserves all facts/evidence (legacy=%j)",
    async (legacy) => {
      const local = await notesSetup(legacy);
      local.viewed.contact.rowVersion = 99;
      local.viewed.contact.email = "changed@synthetic.example";
      // Simulate an independently read canonical copy, not the mutated caller-owned input.
      const canonical = await local.envelope();
      if (legacy) canonical.manualCreation = null;
      local.setCanonical(canonical);
      expect(local.editor.edit(vaultId, "email", "forbidden@synthetic.example")).toBe(false);
      expect(await local.editor.save(vaultId)).toBe(true);
      expect(local.api.updateNotes).toHaveBeenCalledExactlyOnceWith({
        specVersion: 1,
        expectedVaultId: vaultId,
        contactId,
        expectedRowVersion: 1,
        notes: "  replacement\nnotes 🧭  ",
      });
      expect(local.editor.current().acknowledged.contact.email).toBe(fields.email);
      expect(local.api.resolveManualFields).not.toHaveBeenCalled();
      expect(local.capability.save).not.toHaveBeenCalled();
    },
  );

  it("allows an explicit retry only when readback is exactly the original version", async () => {
    const local = await notesSetup();
    local.api.updateNotes.mockResolvedValueOnce(failure("conflict"));
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(await local.editor.recover(vaultId)).toBe(false);
    expect(local.editor.current()).toMatchObject({ phase: "editing", expectedRowVersion: 1 });
    expect(local.api.updateNotes).toHaveBeenCalledOnce();
    expect(await local.editor.save(vaultId)).toBe(true);
    expect(local.api.updateNotes).toHaveBeenCalledTimes(2);
  });

  it.each([
    (value) => ({ ...value, contact: { ...value.contact, rowVersion: 3 } }),
    (value) => ({ ...value, contact: { ...value.contact, email: "different@synthetic.example" } }),
    (value) => ({ ...value, manualCreation: null }),
    (value) => ({ ...value, contact: { ...value.contact, archivedAt: later } }),
    (value) => ({ ...value, contact: { ...value.contact, notes: "not the submitted notes" } }),
  ])("never acknowledges changed notes facts/version/evidence (%#)", async (mutate) => {
    const local = await notesSetup();
    local.api.updateNotes.mockImplementationOnce(async (input) => ({
      ok: true,
      value: mutate({
        ...local.canonical(),
        contact: {
          ...local.canonical().contact,
          rowVersion: 2,
          updatedAt: later,
          notes: input.notes,
        },
      }),
    }));
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(local.editor.current().phase).toBe("uncertain");
    expect(local.editor.current().acknowledged).toBeNull();
  });

  it("recovers an exact committed notes result without resubmitting", async () => {
    const local = await notesSetup();
    local.api.updateNotes.mockImplementationOnce(async (input) => {
      local.setCanonical({
        ...local.canonical(),
        contact: {
          ...local.canonical().contact,
          notes: input.notes,
          rowVersion: 2,
          updatedAt: later,
        },
      });
      throw new Error("PRIVATE synthetic postcommit failure");
    });
    expect(await local.editor.save(vaultId)).toBe(false);
    expect(await local.editor.recover(vaultId)).toBe(true);
    expect(local.editor.current()).toMatchObject({ phase: "saved", recovered: true });
    expect(local.api.updateNotes).toHaveBeenCalledOnce();
  });

  it("does not unlock a changed stored version just because its text matches", async () => {
    const local = await notesSetup();
    local.api.updateNotes.mockResolvedValueOnce(failure("conflict"));
    await local.editor.save(vaultId);
    local.setCanonical({
      ...local.canonical(),
      contact: {
        ...local.canonical().contact,
        rowVersion: 3,
        updatedAt: later,
        notes: "  replacement\nnotes 🧭  ",
      },
    });
    expect(await local.editor.recover(vaultId)).toBe(false);
    expect(local.editor.current().phase).toBe("uncertain");
    expect(local.api.updateNotes).toHaveBeenCalledOnce();
  });
});
