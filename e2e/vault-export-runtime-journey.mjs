import { expect } from "@playwright/test";
import { inspectPortableArchiveV1 } from "../packages/storage-core/dist/index.js";

/** Direct runtime prerequisite, explicitly not normal Settings/save/restore UI proof. */
export const exerciseVaultExportPreparation = async (page, testInfo, minimumAttachments = 0) => {
  const result = await page.evaluate(async () => {
    const api = globalThis.coredrillStorageSpike;
    const inspection = await api.vault.inspect();
    if (!inspection.ok || inspection.value.vault === null)
      throw new Error("Missing synthetic vault.");
    const vaultId = inspection.value.vault.id;
    const declined = await api.vaultExport.prepare({ vaultId, acknowledgeUnencrypted: false });
    const before = await api.exportPortable();
    const prepared = await api.vaultExport.prepare({ vaultId, acknowledgeUnencrypted: true });
    const after = await api.exportPortable();
    if (!prepared.ok)
      return { declined, prepared, beforeHash: before.sha256, afterHash: after.sha256 };
    return {
      declined,
      prepared: { ok: true, value: { ...prepared.value, bytes: Array.from(prepared.value.bytes) } },
      beforeHash: before.sha256,
      afterHash: after.sha256,
    };
  });
  expect(result.declined).toMatchObject({ ok: false, error: { code: "validation" } });
  expect(result.beforeHash).toBe(result.afterHash);
  expect(result.prepared).toMatchObject({
    ok: true,
    value: {
      state: "prepared_not_saved",
      schemaVersion: 164,
      encryptionMode: "none",
      dataFileCount: 116,
    },
  });
  if (!result.prepared.ok) throw new Error("Actual runtime archive was not prepared.");
  const prepared = result.prepared.value;
  const archive = await inspectPortableArchiveV1({
    bytes: new Uint8Array(prepared.bytes),
    expectedSchemaVersion: 164,
    expectedArchiveSha256: prepared.sha256,
  });
  expect(archive.manifest.vault.id).toBe(prepared.vaultId);
  expect(archive.manifest.archiveId).toBe(prepared.archiveId);
  expect(archive.dataFiles).toHaveLength(116);
  expect(archive.attachments.length).toBeGreaterThanOrEqual(minimumAttachments);
  const jobs = archive.dataFiles.find(({ path }) => path === "data/job.json");
  expect(jobs).toBeDefined();
  const dataset = JSON.parse(new TextDecoder().decode(jobs.bytes));
  expect(dataset.rows.length).toBeGreaterThan(0);
  const proof = {
    runtimePreparation: true,
    explicitUnencryptedConsent: true,
    archiveSha256: prepared.sha256,
    schemaVersion: 164,
    dataFileCount: archive.dataFiles.length,
    attachmentCount: archive.attachments.length,
    exactSourceUnchanged: true,
    preparedNotSaved: true,
    normalSettingsControlsProven: false,
    saveOrRestoreProven: false,
  };
  await testInfo.attach("vault-export-preparation-proof.json", {
    body: JSON.stringify(proof),
    contentType: "application/json",
  });
  return proof;
};
