import { expect } from "@playwright/test";

/** Actual normal-root APIs and SQLite, deliberately not a contact-screen claim. */
export const exerciseContactRuntime = async (page, testInfo) => {
  const first = await page.evaluate(async () => {
    const api = globalThis.coredrillStorageSpike;
    const identity = await api.vault.inspect();
    if (!identity.ok || identity.value.vault === null) throw new Error("Vault unavailable.");
    const vaultId = identity.value.vault.id;
    const fields = {
      origin: "user_entered",
      name: "  Synthetic <runtime contact> 🧭  ",
      email: "manual@synthetic.example",
      publicProfileUrl: "https://synthetic.example/people/runtime",
      notes: "  exact initial\ncontact note  ",
    };
    const before = await api.contactDirectory.page({ specVersion: 1, expectedVaultId: vaultId });
    const company = await api.companyWorkspace.beginCreation(vaultId).save({
      origin: "user_entered",
      canonicalName: "Synthetic contact runtime company",
    });
    if (!company.ok) throw new Error("Company unavailable.");
    const companyId = company.value.company.id;
    const draft = api.contactWorkspace.beginCreation(vaultId, { id: companyId, rowVersion: 1 });
    const created = await draft.save(fields);
    if (!created.ok) throw new Error("Contact creation failed.");
    const readInput = { specVersion: 1, expectedVaultId: vaultId, contactId: draft.contactId };
    const selected = await api.contactWorkspace.read(readInput);
    const basis = await api.contactWorkspace.resolveManualFields(created.value);
    const duplicate = await draft.save(fields);
    const notes = "  exact replacement\n<b>literal</b> 🧭  ";
    const updated = await api.contactWorkspace.updateNotes({
      ...readInput,
      expectedRowVersion: 1,
      notes,
    });
    const stale = await api.contactWorkspace.updateNotes({
      ...readInput,
      expectedRowVersion: 1,
      notes: "must not replace",
    });
    const foreign = await api.contactWorkspace.read({
      ...readInput,
      expectedVaultId: "0199b363-0000-7000-8000-000000000099",
    });
    const directory = await api.contactDirectory.page({
      specVersion: 1,
      expectedVaultId: vaultId,
      companyId,
    });
    const changedCompany = await api.companyWorkspace.updateNotes({
      specVersion: 1,
      expectedVaultId: vaultId,
      companyId,
      expectedRowVersion: 1,
      notes: "New viewed version",
    });
    const retiredCompanyDraft = api.contactWorkspace.beginCreation(vaultId, {
      id: companyId,
      rowVersion: 1,
    });
    const rejectedCompany = await retiredCompanyDraft.save(fields);
    const absentRejectedContact = await api.contactWorkspace.read({
      ...readInput,
      contactId: retiredCompanyDraft.contactId,
    });
    return {
      vaultId,
      contactId: draft.contactId,
      companyId,
      fields,
      before,
      created,
      selected,
      basis,
      duplicate,
      notes,
      updated,
      stale,
      foreign,
      directory,
      changedCompany,
      rejectedCompany,
      absentRejectedContact,
    };
  });
  expect(first.before).toMatchObject({ ok: true, value: { items: [] } });
  expect(first.created).toMatchObject({
    ok: true,
    value: {
      contact: {
        id: first.contactId,
        companyId: first.companyId,
        name: first.fields.name,
        email: first.fields.email,
        publicProfileUrl: first.fields.publicProfileUrl,
        notes: first.fields.notes,
        role: null,
        phone: null,
        confidence: null,
        userConfirmed: true,
        rowVersion: 1,
      },
      manualCreation: { valueHashes: { role: null, phone: null } },
    },
  });
  expect(first.selected).toEqual(first.created);
  expect(first.basis).toEqual(["name", "email", "public_profile_url"]);
  expect(first.duplicate).toMatchObject({ ok: false, error: { code: "conflict" } });
  expect(first.updated).toEqual({
    ok: true,
    value: {
      ...first.created.value,
      contact: {
        ...first.created.value.contact,
        notes: first.notes,
        updatedAt: first.updated.value.contact.updatedAt,
        rowVersion: 2,
      },
    },
  });
  expect(first.stale).toMatchObject({ ok: false, error: { code: "conflict" } });
  expect(first.foreign).toMatchObject({ ok: false, error: { code: "not_found" } });
  expect(first.changedCompany).toMatchObject({ ok: true, value: { company: { rowVersion: 2 } } });
  expect(first.rejectedCompany).toMatchObject({ ok: false, error: { code: "conflict" } });
  expect(first.absentRejectedContact).toMatchObject({ ok: false, error: { code: "not_found" } });
  expect(first.directory).toMatchObject({
    ok: true,
    value: { companyId: first.companyId, hasMore: false, nextCursor: null },
  });
  expect(first.directory.value.items).toHaveLength(1);
  expect(Object.keys(first.directory.value.items[0]).sort()).toEqual([
    "archivedAt",
    "companyId",
    "createdAt",
    "id",
    "name",
    "role",
    "rowVersion",
    "updatedAt",
  ]);
  await page.reload();
  // The preceding company journey deliberately leaves a 320px mobile layout.
  await expect(page.getByRole("navigation", { name: /^(Primary|Mobile)$/u })).toBeVisible();
  const reopened = await page.evaluate(async ({ vaultId, contactId, companyId }) => {
    const api = globalThis.coredrillStorageSpike;
    const selected = await api.contactWorkspace.read({
      specVersion: 1,
      expectedVaultId: vaultId,
      contactId,
    });
    if (!selected.ok) throw new Error("Reopened contact unavailable.");
    return {
      selected,
      basis: await api.contactWorkspace.resolveManualFields(selected.value),
      directory: await api.contactDirectory.page({
        specVersion: 1,
        expectedVaultId: vaultId,
        companyId,
      }),
    };
  }, first);
  expect(reopened.selected).toEqual(first.updated);
  expect(reopened.basis).toEqual(first.basis);
  expect(reopened.directory.value.items).toHaveLength(1);
  expect(reopened.directory.value.items[0].rowVersion).toBe(2);
  const proof = {
    normalRuntimeApi: true,
    contactScreensProven: false,
    fixtureInstaller: false,
    exactManualFieldsAndNullableMethods: true,
    immutableReceiptRetained: true,
    duplicateAndStaleNotesRejected: true,
    staleCompanyLeavesNoContact: true,
    foreignVaultRejected: true,
    directoryExcludesPrivateMethodsNotesAndHashes: true,
    reloadReadback: true,
    noEnrichmentOrSending: true,
  };
  await testInfo.attach("normal-contact-runtime.json", {
    body: JSON.stringify(proof),
    contentType: "application/json",
  });
  return proof;
};
