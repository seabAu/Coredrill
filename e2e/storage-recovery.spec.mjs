import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

import {
  createPortableArchiveContentHashV1,
  inspectPortableArchiveV1,
  PORTABLE_DATA_EXPORT_DATASETS,
} from "../packages/storage-core/dist/index.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDirectory = path.join(repositoryRoot, "fixtures", "recovery");
const archivePath = path.join(fixtureDirectory, "phase-1-vault-schema-167-v1.coredrill.zip");
const manifestPath = path.join(fixtureDirectory, "phase-1-vault-schema-167-v1.json");
const updateFixture = process.env["COREDRILL_UPDATE_RECOVERY_FIXTURE"] === "1";
if (
  path.basename(archivePath) !== "phase-1-vault-schema-167-v1.coredrill.zip" ||
  path.basename(manifestPath) !== "phase-1-vault-schema-167-v1.json"
)
  throw new Error("Current fixture generation must not target a preserved older archive.");
const guardSource = await readFile(
  path.join(repositoryRoot, "migrations", "0167_interaction_contact_detachment_guard.sql"),
  "utf8",
);
const expectedGuardSql = guardSource
  .slice(guardSource.indexOf("CREATE TRIGGER"))
  .trim()
  .replace(/;$/u, "");

const recoveryInput = Object.freeze({
  archiveId: "0198d9d5-0000-7000-8000-000000000001",
  generatedAt: "2026-08-29T23:55:00.000Z",
  vaultId: "0198d9d4-0000-7000-8000-0000000000ff",
});

const expectedPhase3Inventory = Object.freeze({
  jobRequirements: 1,
  careerEvidence: 8,
  stories: 1,
  storyEvidenceLinks: 8,
  skillEvidenceLinks: 1,
  requirementEvidenceSelections: 1,
  requirementCoverageDecisions: 1,
  importRuns: 1,
  importProposals: 2,
  importResolutions: 2,
  importResolutionLinks: 2,
  answerEntries: 1,
  answerVersions: 1,
  attachmentManifests: 2,
  attachmentLinks: 3,
  documents: 4,
  documentVersions: 5,
  documentLineages: 3,
  documentDerivationOrigins: 1,
  documentJobLinks: 2,
  editorDrafts: 1,
  applicationAnswerSelections: 1,
  submittedSnapshots: 1,
  submittedSnapshotItems: 2,
});

const callHarness = (page, method, argument) =>
  page.evaluate(
    async ({ methodName, value }) => {
      const harness = globalThis.coredrillStorageSpike;
      if (harness === undefined) throw new Error("Storage verification harness is unavailable.");
      return value === undefined ? harness[methodName]() : harness[methodName](value);
    },
    { methodName: method, value: argument },
  );

const openHarness = async (context) => {
  const page = await context.newPage();
  await page.goto("/storage-verification.html");
  await expect(page.getByRole("status")).toHaveText("Harness ready");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);
  return page;
};

const readCanonicalSnapshot = async (bytes, filename) => {
  await writeFile(filename, bytes);
  const database = new DatabaseSync(filename, { readOnly: true });
  const identifier = (value) => {
    if (!/^[a-z_][a-z0-9_]*$/u.test(value)) throw new Error("Unreviewed SQL identifier.");
    return `"${value}"`;
  };
  try {
    const schemaVersion = database.prepare("PRAGMA user_version").get().user_version;
    return {
      schemaVersion,
      datasets: PORTABLE_DATA_EXPORT_DATASETS.filter(
        (spec) => (spec.minimumSourceSchemaVersion ?? 0) <= schemaVersion,
      ).map((spec) => ({
        name: spec.name,
        rows: database
          .prepare(
            `SELECT ${spec.columns.map(identifier).join(", ")} FROM ${identifier(spec.table)} ORDER BY ${spec.orderBy.map(identifier).join(", ")}`,
          )
          .all(),
      })),
      ledger: database
        .prepare("SELECT version, name, sha256 FROM coredrill_schema_migration ORDER BY version")
        .all(),
      index: database
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?")
        .all("next_action_job_created_idx"),
      reminderIndex: database
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?")
        .all("reminder_next_action_job_state_idx"),
      contactHistoryIndex: database
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?")
        .all("interaction_contact_history_idx"),
      interactionGuard: database
        .prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND name=?")
        .all("interaction_immutable_update_guard"),
    };
  } finally {
    database.close();
  }
};

for (const sourceSchemaVersion of [158, 159, 160, 164, 165]) {
  test(`restores the preserved schema-${sourceSchemaVersion} browser archive and upgrades to 167 without changing retained contact evidence`, async ({
    browser,
  }, testInfo) => {
    const manifest = JSON.parse(
      await readFile(
        path.join(
          fixtureDirectory,
          sourceSchemaVersion === 158
            ? "phase-1-vault-v1.json"
            : `phase-1-vault-schema-${sourceSchemaVersion}-v1.json`,
        ),
        "utf8",
      ),
    );
    expect(manifest.schemaVersion).toBe(sourceSchemaVersion);
    const archiveBytes = await readFile(path.join(fixtureDirectory, manifest.archiveFile));
    const inspected = await inspectPortableArchiveV1({
      bytes: archiveBytes,
      expectedSchemaVersion: sourceSchemaVersion,
      expectedArchiveSha256: manifest.archiveSha256,
    });
    const before = await readCanonicalSnapshot(
      inspected.database.bytes,
      testInfo.outputPath(`preserved-schema-${sourceSchemaVersion}.sqlite`),
    );
    expect(inspected.database.sha256).toBe(manifest.databaseSha256);
    expect(before.schemaVersion).toBe(sourceSchemaVersion);
    expect(before.datasets).toHaveLength(sourceSchemaVersion >= 164 ? 58 : 57);
    expect(before.ledger).toHaveLength(sourceSchemaVersion);
    expect(before.index).toEqual(
      sourceSchemaVersion === 158 ? [] : [{ name: "next_action_job_created_idx" }],
    );
    expect(before.reminderIndex).toEqual(
      sourceSchemaVersion >= 160 ? [{ name: "reminder_next_action_job_state_idx" }] : [],
    );
    expect(before.contactHistoryIndex).toEqual(
      sourceSchemaVersion >= 165 ? [{ name: "interaction_contact_history_idx" }] : [],
    );
    const retainedReceipt = before.datasets.find(
      (dataset) => dataset.name === "contact_manual_creation",
    );
    if (sourceSchemaVersion >= 164) {
      expect(retainedReceipt?.rows).toHaveLength(1);
      expect(retainedReceipt?.rows[0]?.contact_id).toBe("0198d9d4-0000-7000-8000-000000000040");
    } else expect(retainedReceipt).toBeUndefined();
    const context = await browser.newContext();
    try {
      const page = await openHarness(context);
      await callHarness(page, "delete");
      await callHarness(page, "openAndMigrate");
      const restored = await callHarness(page, "restorePortableRecoveryFixture", {
        archiveBytesBase64: archiveBytes.toString("base64"),
        archiveSha256: manifest.archiveSha256,
        generatedAt: manifest.generatedAt,
        vaultId: manifest.vaultId,
        sourceSchemaVersion,
      });
      expect(restored).toEqual({
        contentSha256: manifest.contentSha256,
        databaseSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        databaseMatchesArchive: restored.databaseSha256 === manifest.databaseSha256,
        attachmentContentIds: manifest.attachmentContentIds,
        attachmentCount: manifest.attachmentCount,
        conflict: "none",
        committed: true,
        phase3Inventory: manifest.phase3Inventory,
        documentRoundTrip: manifest.documentRoundTrip,
      });
      const restoredExport = await callHarness(page, "exportPortable");
      const restoredSnapshot = await readCanonicalSnapshot(
        Buffer.from(restoredExport.bytesBase64, "base64"),
        testInfo.outputPath(`restored-schema-${sourceSchemaVersion}.sqlite`),
      );
      expect(restoredSnapshot).toEqual(before);
      const upgraded = await callHarness(page, "openAndMigrate");
      expect(upgraded.appliedVersions).toEqual(
        Array.from(
          { length: 167 - sourceSchemaVersion },
          (_, index) => sourceSchemaVersion + index + 1,
        ),
      );
      expect(upgraded.diagnostics.schemaVersion).toBe(167);
      const exported = await callHarness(page, "exportPortable");
      const after = await readCanonicalSnapshot(
        Buffer.from(exported.bytesBase64, "base64"),
        testInfo.outputPath("upgraded-schema-167.sqlite"),
      );
      expect(after.schemaVersion).toBe(167);
      expect(after.datasets).toHaveLength(58);
      if (sourceSchemaVersion >= 164) expect(after.datasets).toEqual(before.datasets);
      else {
        expect(
          after.datasets.filter((dataset) => dataset.name !== "contact_manual_creation"),
        ).toEqual(before.datasets);
        expect(
          after.datasets.find((dataset) => dataset.name === "contact_manual_creation"),
        ).toEqual({
          name: "contact_manual_creation",
          rows: [],
        });
      }
      expect(after.ledger).toHaveLength(167);
      expect(after.ledger.slice(0, sourceSchemaVersion)).toEqual(before.ledger);
      expect(after.index).toEqual([{ name: "next_action_job_created_idx" }]);
      expect(after.reminderIndex).toEqual([{ name: "reminder_next_action_job_state_idx" }]);
      expect(after.contactHistoryIndex).toEqual([{ name: "interaction_contact_history_idx" }]);
      expect(after.interactionGuard).toEqual([
        { name: "interaction_immutable_update_guard", sql: expectedGuardSql },
      ]);
      await callHarness(page, "close");
    } finally {
      await context.close();
    }
  });
}

test("restores complete evidence relationships and attachments into clean browser storage", async ({
  browser,
}, testInfo) => {
  const sourceContext = await browser.newContext();
  const sourcePage = await openHarness(sourceContext);
  await callHarness(sourcePage, "delete");
  const opened = await callHarness(sourcePage, "openAndMigrate");
  expect(opened.diagnostics.schemaVersion).toBe(167);
  await callHarness(sourcePage, "writeVault", {
    id: recoveryInput.vaultId,
    name: "BKP-007 representative vault",
    createdAt: "2026-08-29T23:49:00.000Z",
    lastOpenedAt: "2026-08-29T23:49:30.000Z",
  });
  const source = await callHarness(sourcePage, "createPortableRecoveryFixture", recoveryInput);
  expect(source).toMatchObject({
    dataFileCount: 116,
    attachmentCount: 2,
    phase3Inventory: expectedPhase3Inventory,
  });
  expect(source.attachmentContentIds).toHaveLength(2);
  const documentRows = Object.fromEntries(
    source.documentRoundTrip.datasets.map((dataset) => [dataset.dataset, dataset.rows]),
  );
  expect(documentRows["document_derivation_origin"]).toEqual([
    {
      document_id: "0198d9d4-0000-7000-8000-000000000029",
      first_version_id: "0198d9d4-0000-7000-8000-00000000002a",
      source_version_id: "0198d9d4-0000-7000-8000-00000000000a",
      created_at: "2026-08-29T23:54:00.000Z",
    },
  ]);
  expect(documentRows["document_lineage"]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ role: "base" }),
      expect.objectContaining({
        role: "job_derivative",
        base_document_id: "0198d9d4-0000-7000-8000-000000000009",
        job_id: "0198d9d4-0000-7000-8000-000000000002",
      }),
    ]),
  );
  expect(documentRows["application"]).toEqual([
    expect.objectContaining({
      id: "0198d9d4-0000-7000-8000-000000000004",
      selected_resume_version_id: "0198d9d4-0000-7000-8000-000000000022",
      applied_at: "2026-08-29T23:53:00.000Z",
      channel: "company_portal",
    }),
  ]);
  expect(documentRows["application_answer_selection"]).toEqual([
    expect.objectContaining({
      application_id: "0198d9d4-0000-7000-8000-000000000004",
      document_version_id: "0198d9d4-0000-7000-8000-00000000001b",
    }),
  ]);
  const submittedAttachment = documentRows["document_version_attachment"].find(
    (attachment) => attachment.purpose === "submission",
  );
  expect(submittedAttachment).toEqual(
    expect.objectContaining({
      document_version_id: "0198d9d4-0000-7000-8000-000000000022",
      content_id: expect.stringMatching(/^[a-f0-9]{64}$/u),
    }),
  );
  expect(documentRows["submitted_snapshot_item"]).toEqual([
    expect.objectContaining({
      role: "resume",
      document_version_id: "0198d9d4-0000-7000-8000-000000000022",
      submission_format: "file",
      content_id: submittedAttachment?.content_id,
      attachment_purpose: "submission",
    }),
    expect.objectContaining({
      role: "answer",
      document_version_id: "0198d9d4-0000-7000-8000-00000000001b",
      submission_format: "plain_text",
    }),
  ]);
  expect(
    documentRows["document_version"].find(
      (version) => version.id === "0198d9d4-0000-7000-8000-000000000023",
    ),
  ).toEqual(
    expect.objectContaining({
      parent_version_id: "0198d9d4-0000-7000-8000-000000000022",
      content_plain:
        "Current resume after submission: expanded local-first delivery and recovery leadership.",
    }),
  );

  const generatedArchive = Buffer.from(source.archiveBytesBase64, "base64");
  const inspectedSource = await inspectPortableArchiveV1({
    bytes: generatedArchive,
    expectedSchemaVersion: 167,
    expectedArchiveSha256: source.archiveSha256,
  });
  const sourceSnapshot = await readCanonicalSnapshot(
    inspectedSource.database.bytes,
    testInfo.outputPath("source-schema-167.sqlite"),
  );
  expect(sourceSnapshot.contactHistoryIndex).toEqual([{ name: "interaction_contact_history_idx" }]);
  const previousManifest = JSON.parse(
    await readFile(path.join(fixtureDirectory, "phase-1-vault-schema-165-v1.json"), "utf8"),
  );
  const previousArchive = await inspectPortableArchiveV1({
    bytes: await readFile(path.join(fixtureDirectory, previousManifest.archiveFile)),
    expectedSchemaVersion: 165,
    expectedArchiveSha256: previousManifest.archiveSha256,
  });
  const previousSnapshot = await readCanonicalSnapshot(
    previousArchive.database.bytes,
    testInfo.outputPath("previous-schema-165-source.sqlite"),
  );
  expect(sourceSnapshot.datasets).toEqual(previousSnapshot.datasets);
  expect(sourceSnapshot.ledger).toHaveLength(167);
  expect(sourceSnapshot.ledger.slice(0, 165)).toEqual(previousSnapshot.ledger);
  expect(sourceSnapshot.interactionGuard).toEqual([
    { name: "interaction_immutable_update_guard", sql: expectedGuardSql },
  ]);
  expect(inspectedSource.attachments).toEqual(previousArchive.attachments);
  expect(inspectedSource.dataFiles.map((file) => file.path)).toEqual(
    previousArchive.dataFiles.map((file) => file.path),
  );
  for (const previousFile of previousArchive.dataFiles) {
    const currentFile = inspectedSource.dataFiles.find((file) => file.path === previousFile.path);
    expect(currentFile).toBeDefined();
    if (previousFile.format === "json") {
      const previousData = JSON.parse(new TextDecoder().decode(previousFile.bytes));
      expect(JSON.parse(new TextDecoder().decode(currentFile.bytes))).toEqual({
        ...previousData,
        sourceSchemaVersion: 167,
      });
    } else
      expect(Buffer.from(currentFile.bytes).equals(Buffer.from(previousFile.bytes))).toBe(true);
  }
  // Hash v1 deliberately covers schema and complete JSON metadata. It is not a cross-schema row hash.
  expect(source.contentSha256).not.toBe(previousManifest.contentSha256);
  expect(await createPortableArchiveContentHashV1(inspectedSource)).toMatchObject({
    schemaVersion: 167,
    sha256: source.contentSha256,
    jsonDataFileCount: 58,
    attachmentCount: 2,
  });
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  expect(
    sourceSnapshot.datasets.find((dataset) => dataset.name === "contact_manual_creation"),
  ).toEqual({
    name: "contact_manual_creation",
    rows: [
      {
        contact_id: "0198d9d4-0000-7000-8000-000000000040",
        operation_id: "0198d9d5-0000-7000-8000-000000000041",
        created_at: recoveryInput.generatedAt,
        name_hash: digest("Synthetic manually entered contact"),
        role_hash: null,
        email_hash: digest("manual@synthetic.example"),
        phone_hash: null,
        public_profile_url_hash: digest("https://synthetic.example/people/manual"),
      },
    ],
  });
  const generatedManifest = {
    specVersion: 1,
    archiveFile: path.basename(archivePath),
    archiveId: recoveryInput.archiveId,
    generatedAt: recoveryInput.generatedAt,
    vaultId: recoveryInput.vaultId,
    schemaVersion: opened.diagnostics.schemaVersion,
    archiveByteLength: source.archiveByteLength,
    archiveSha256: source.archiveSha256,
    databaseSha256: source.databaseSha256,
    contentSha256: source.contentSha256,
    dataFileCount: source.dataFileCount,
    attachmentCount: source.attachmentCount,
    attachmentContentIds: source.attachmentContentIds,
    phase3Inventory: source.phase3Inventory,
    documentRoundTrip: source.documentRoundTrip,
  };
  if (updateFixture) {
    await mkdir(fixtureDirectory, { recursive: true });
    await writeFile(archivePath, generatedArchive);
    await writeFile(manifestPath, `${JSON.stringify(generatedManifest, undefined, 2)}\n`, "utf8");
  }
  const [committedArchive, committedManifest] = await Promise.all([
    readFile(archivePath),
    readFile(manifestPath, "utf8").then(JSON.parse),
  ]);
  expect(generatedArchive.equals(committedArchive)).toBe(true);
  expect(generatedManifest).toEqual(committedManifest);
  await callHarness(sourcePage, "close");
  await sourceContext.close();

  const restoreContext = await browser.newContext();
  const restorePage = await openHarness(restoreContext);
  await callHarness(restorePage, "delete");
  await callHarness(restorePage, "openAndMigrate");
  const restored = await callHarness(restorePage, "restorePortableRecoveryFixture", {
    archiveBytesBase64: committedArchive.toString("base64"),
    archiveSha256: committedManifest.archiveSha256,
    generatedAt: committedManifest.generatedAt,
    vaultId: committedManifest.vaultId,
  });
  expect(restored).toEqual({
    contentSha256: committedManifest.contentSha256,
    databaseSha256: committedManifest.databaseSha256,
    databaseMatchesArchive: true,
    attachmentContentIds: committedManifest.attachmentContentIds,
    attachmentCount: committedManifest.attachmentCount,
    conflict: "none",
    committed: true,
    phase3Inventory: committedManifest.phase3Inventory,
    documentRoundTrip: committedManifest.documentRoundTrip,
  });
  const restoredExport = await callHarness(restorePage, "exportPortable");
  const restoredSnapshot = await readCanonicalSnapshot(
    Buffer.from(restoredExport.bytesBase64, "base64"),
    testInfo.outputPath("restored-schema-167.sqlite"),
  );
  expect(restoredSnapshot).toEqual(sourceSnapshot);
  const deletionPreview = await callHarness(restorePage, "previewVaultDeletion", {
    vaultId: committedManifest.vaultId,
    previewId: "0198d9d5-0000-7000-8000-000000000002",
    previewedAt: "2026-08-30T00:00:00.000Z",
  });
  expect(deletionPreview).toMatchObject({
    ok: true,
    value: { inventory: { attachmentFiles: 2 } },
  });
  const deletion = await callHarness(restorePage, "deleteVault", {
    vaultId: committedManifest.vaultId,
    previewId: "0198d9d5-0000-7000-8000-000000000002",
    deletionId: "0198d9d5-0000-7000-8000-000000000003",
    deletedAt: "2026-08-30T00:01:00.000Z",
    confirmation: "DELETE BKP-007 representative vault",
  });
  expect(deletion).toMatchObject({
    ok: true,
    value: { status: "deleted", deleted: { attachmentFiles: 2 } },
  });
  await restoreContext.close();

  console.info(
    `BKP007_BROWSER_PROOF ${JSON.stringify({
      browser: browser.version(),
      archiveSha256: committedManifest.archiveSha256,
      contentSha256: restored.contentSha256,
      databaseMatchesArchive: restored.databaseMatchesArchive,
      attachmentCount: restored.attachmentCount,
      cleanInstallRestore: true,
    })}`,
  );
});
