import { expect, test } from "@playwright/test";

const committedVault = Object.freeze({
  id: "0198d9cf-93b7-7a37-8b56-fba6b5f0ce11",
  name: "Phase 0 durable vault",
  createdAt: "2026-08-24T08:00:00.000Z",
  lastOpenedAt: "2026-08-24T08:00:00.000Z",
});

const rolledBackVault = Object.freeze({
  id: "0198d9cf-ae62-7b24-bc7a-1521e48241c2",
  name: "Must roll back",
  createdAt: "2026-08-24T08:01:00.000Z",
  lastOpenedAt: "2026-08-24T08:01:00.000Z",
});

const humanReadableDatasetNames = Object.freeze([
  "vault",
  "app_setting",
  "capture_inbox",
  "location",
  "company",
  "contact",
  "job",
  "job_source",
  "source_snapshot",
  "provenance",
  "company_alias",
  "contact_point_provenance",
  "field_value",
  "status_definition",
  "application",
  "status_event",
  "interaction",
  "next_action",
  "interview",
  "reminder",
  "tag",
  "job_tag",
  "saved_view",
  "document",
  "document_version",
  "document_job_link",
  "attachment_manifest",
  "document_version_attachment",
  "document_style_example",
]);

const callHarness = (page, method, argument) =>
  page.evaluate(
    async ({ methodName, value }) => {
      const harness = globalThis.coredrillStorageSpike;
      if (harness === undefined) throw new Error("Storage verification harness is unavailable.");
      return value === undefined ? harness[methodName]() : harness[methodName](value);
    },
    { methodName: method, value: argument },
  );

const openHarness = async (context, logs) => {
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.text().startsWith("COREDRILL_STORAGE ")) logs.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Harness ready");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);
  return page;
};

test("opens official SQLite in a Worker, persists transactions, and restores a checksummed export", async ({
  browser,
}) => {
  const logs = [];
  const sourceContext = await browser.newContext();
  const sourcePage = await openHarness(sourceContext, logs);
  const browserVersion = browser.version();
  const expectedBrowserVersion = process.env["COREDRILL_EXPECTED_BROWSER_VERSION"];
  if (expectedBrowserVersion !== undefined) expect(browserVersion).toBe(expectedBrowserVersion);

  const archiveWriterProof = await callHarness(sourcePage, "runPortableArchiveWriterProof");
  expect(archiveWriterProof).toEqual({
    byteLength: 3533,
    fileName: "coredrill-20260829-019539af-8a01-7dd4-8b54-395d8f3fe501.coredrill.zip",
    sha256: "47b18f1854ae6a608cffb4753895afc0fead06f3399818326e61142579a5fcde",
    entryPaths: [
      "manifest.json",
      "database.sqlite3",
      "data/jobs.csv",
      "data/jobs.json",
      "attachments/b9/b914898bf9355a7588664f9eef9f45ba4a633f923a4c462d3febe05cd2894f77",
      "attachments/f4/f4bc78faeb42493a38532064e934426732aaef84a3836b2c331681a59854ec71",
    ],
    encryptionMode: "none",
  });

  await callHarness(sourcePage, "delete");
  const opened = await callHarness(sourcePage, "openAndMigrate");
  expect(opened.appliedVersions).toEqual(Array.from({ length: 92 }, (_, index) => index + 1));
  expect(opened.diagnostics).toMatchObject({
    adapterName: "official-sqlite-wasm-opfs-sahpool",
    schemaVersion: 92,
  });
  expect(["ready", "degraded"]).toContain(opened.diagnostics.health);
  expect(["best-effort", "durable"]).toContain(opened.diagnostics.persistence);
  expect(opened.diagnostics.details).toEqual(
    expect.arrayContaining([
      "vfs:opfs-sahpool",
      "foreign-keys:on",
      "thread:dedicated-worker",
      expect.stringMatching(/^storage-persistence:/u),
      expect.stringMatching(/^storage-quota:/u),
    ]),
  );

  await callHarness(sourcePage, "writeVault", committedVault);
  await expect(callHarness(sourcePage, "proveRollback", rolledBackVault)).resolves.toBe(true);
  await callHarness(sourcePage, "close");

  const reopened = await callHarness(sourcePage, "openAndMigrate");
  expect(reopened.appliedVersions).toEqual([]);
  const durableRows = await callHarness(sourcePage, "listVaults");
  expect(durableRows).toEqual([
    {
      id: committedVault.id,
      name: committedVault.name,
      schema_version: 1,
      created_at: committedVault.createdAt,
      last_opened_at: committedVault.lastOpenedAt,
    },
  ]);

  const portable = await callHarness(sourcePage, "exportPortable");
  const humanReadable = await callHarness(sourcePage, "exportHumanReadable", {
    generatedAt: "2026-08-29T22:30:00.000Z",
    vaultId: committedVault.id,
  });
  expect(humanReadable).toEqual({
    dataFileCount: 58,
    datasetCount: 29,
    datasetNames: humanReadableDatasetNames,
    jsonFiles: 29,
    csvFiles: 29,
    rowCount: 1,
    sourceSchemaVersion: 92,
  });
  expect(portable.schemaVersion).toBe(92);
  expect(portable.byteLength).toBeGreaterThan(0);
  expect(portable.sha256).toMatch(/^[a-f0-9]{64}$/u);
  const archiveRestore = await callHarness(sourcePage, "runPortableArchiveRestoreProof", {
    archiveId: "0198d9d2-c2fd-7d5c-8a0f-485258c1ebff",
    generatedAt: "2026-08-29T23:30:00.000Z",
    vaultId: committedVault.id,
    previewName: "Preview target",
    staleName: "Stale target",
  });
  expect(archiveRestore).toMatchObject({
    dataFileCount: 58,
    attachmentCount: 0,
    corruptionRejected: true,
    corruptionPreservedTarget: true,
    conflict: "same_vault_replace",
    requiredConfirmation: "replace_same_vault",
    previewPreservedTarget: true,
    staleTargetRejected: true,
    staleTargetPreserved: true,
    committed: true,
    restoredDatabaseSha256: portable.sha256,
    restoredDatabaseMatchesArchive: true,
    restoredVaultName: committedVault.name,
  });
  expect(archiveRestore.archiveSha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(archiveRestore.archiveByteLength).toBeGreaterThan(portable.byteLength);
  await callHarness(sourcePage, "close");
  await sourceContext.close();

  const restoreContext = await browser.newContext();
  const restorePage = await openHarness(restoreContext, logs);
  await callHarness(restorePage, "delete");
  await expect(
    callHarness(restorePage, "restorePortable", {
      ...portable,
      sha256: "0".repeat(64),
    }),
  ).rejects.toThrow("checksum mismatch");
  await callHarness(restorePage, "restorePortable", portable);
  const restoredRows = await callHarness(restorePage, "listVaults");
  expect(restoredRows).toEqual(durableRows);
  const restoredPortable = await callHarness(restorePage, "exportPortable");
  expect(restoredPortable).toMatchObject({
    schemaVersion: portable.schemaVersion,
    byteLength: portable.byteLength,
    sha256: portable.sha256,
  });

  const exportRecordedAt = Date.parse("2026-08-29T23:45:00.000Z");
  await callHarness(restorePage, "updateBrowserExportReminder", {
    action: "record-success",
    nowUnixMs: exportRecordedAt,
  });
  const deletionPreviewId = "0198d9d3-0000-7000-8000-000000000001";
  const deletionPreview = await callHarness(restorePage, "previewVaultDeletion", {
    vaultId: committedVault.id,
    previewId: deletionPreviewId,
    previewedAt: "2026-08-29T23:46:00.000Z",
  });
  expect(deletionPreview).toEqual({
    ok: true,
    value: {
      previewId: deletionPreviewId,
      vaultId: committedVault.id,
      vaultName: committedVault.name,
      storageMode: "browser",
      inventory: {
        attachmentFiles: 0,
        managedBackups: 0,
        providerSecrets: 0,
        sharedAttachmentFiles: 0,
      },
      lastSuccessfulPortableExportAt: "2026-08-29T23:45:00.000Z",
      requiredConfirmation: `DELETE ${committedVault.name}`,
    },
  });
  const rejectedDeletion = await callHarness(restorePage, "deleteVault", {
    vaultId: committedVault.id,
    previewId: deletionPreviewId,
    deletionId: "0198d9d3-0000-7000-8000-000000000002",
    confirmation: `DELETE ${committedVault.name} `,
    deletedAt: "2026-08-29T23:47:00.000Z",
  });
  expect(rejectedDeletion).toMatchObject({ ok: false, error: { code: "validation" } });
  await expect(callHarness(restorePage, "listVaults")).resolves.toEqual(durableRows);

  const deletion = await callHarness(restorePage, "deleteVault", {
    vaultId: committedVault.id,
    previewId: deletionPreviewId,
    deletionId: "0198d9d3-0000-7000-8000-000000000003",
    confirmation: `DELETE ${committedVault.name}`,
    deletedAt: "2026-08-29T23:48:00.000Z",
  });
  expect(deletion).toEqual({
    ok: true,
    value: {
      deletionId: "0198d9d3-0000-7000-8000-000000000003",
      vaultId: committedVault.id,
      status: "deleted",
      deleted: {
        attachmentFiles: 0,
        managedBackups: 0,
        providerSecrets: 0,
        sharedAttachmentFiles: 0,
      },
      externalPortableArchivesAffected: false,
    },
  });
  await callHarness(restorePage, "openAndMigrate");
  await expect(callHarness(restorePage, "listVaults")).resolves.toEqual([]);
  await callHarness(restorePage, "delete");
  await restoreContext.close();

  expect(logs).toEqual(
    expect.arrayContaining([
      expect.stringContaining('"adapter":"official-sqlite-wasm-opfs-sahpool"'),
      expect.stringContaining('"vfs:opfs-sahpool"'),
      expect.stringContaining('"thread:dedicated-worker"'),
    ]),
  );
  console.info(
    `STG_PROOF ${JSON.stringify({
      sqlite: opened.diagnostics.details.find((detail) => detail.startsWith("sqlite-version:")),
      browser: browserVersion,
      vfs: "opfs-sahpool",
      worker: "dedicated-worker",
      persistence: opened.diagnostics.persistence,
      schemaVersion: portable.schemaVersion,
      byteLength: portable.byteLength,
      sha256: portable.sha256,
      durableRows: durableRows.length,
      rollback: true,
      cleanProfileRestore: true,
      portableArchiveWriterSha256: archiveWriterProof.sha256,
      humanReadableDatasets: humanReadable.datasetCount,
      humanReadableDataFiles: humanReadable.dataFileCount,
      archiveRestoreConflict: archiveRestore.conflict,
      archiveRestoreCommitted: archiveRestore.committed,
      archiveRestoreCorruptionRejected: archiveRestore.corruptionRejected,
      archiveRestoreStaleRejected: archiveRestore.staleTargetRejected,
      typedVaultDeletion: deletion.ok,
      deletionPreservedExternalArchive: restoredPortable.sha256 === portable.sha256,
    })}`,
  );
});
