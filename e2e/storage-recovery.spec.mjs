import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { inspectPortableArchiveV1 } from "../packages/storage-core/dist/index.js";
import {
  callHarness,
  openHarness,
  readCanonicalSnapshot,
  qualificationDatasetNames,
  expectedQualificationGuards,
} from "./recovery-snapshot.mjs";
const fixtureDirectory = path.resolve("fixtures/recovery");
const guardSource = await readFile(
  path.resolve("migrations/0167_interaction_contact_detachment_guard.sql"),
  "utf8",
);
const expectedGuardSql = guardSource
  .slice(guardSource.indexOf("CREATE TRIGGER"))
  .trim()
  .replace(/;$/u, "");

for (const sourceSchemaVersion of [158, 159, 160, 164, 165, 167]) {
  test(`restores the preserved schema-${sourceSchemaVersion} browser archive and upgrades to 182 without changing retained contact evidence`, async ({
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
          { length: 182 - sourceSchemaVersion },
          (_, index) => sourceSchemaVersion + index + 1,
        ),
      );
      expect(upgraded.diagnostics.schemaVersion).toBe(182);
      const exported = await callHarness(page, "exportPortable");
      const after = await readCanonicalSnapshot(
        Buffer.from(exported.bytesBase64, "base64"),
        testInfo.outputPath("upgraded-schema-182.sqlite"),
      );
      expect(after.schemaVersion).toBe(182);
      expect(after.datasets).toHaveLength(61);
      if (sourceSchemaVersion >= 164)
        expect(
          after.datasets.filter((dataset) => !qualificationDatasetNames.includes(dataset.name)),
        ).toEqual(before.datasets);
      else {
        expect(
          after.datasets.filter(
            (dataset) =>
              dataset.name !== "contact_manual_creation" &&
              !qualificationDatasetNames.includes(dataset.name),
          ),
        ).toEqual(before.datasets);
        expect(
          after.datasets.find((dataset) => dataset.name === "contact_manual_creation"),
        ).toEqual({
          name: "contact_manual_creation",
          rows: [],
        });
      }
      for (const name of qualificationDatasetNames)
        expect(after.datasets.find((dataset) => dataset.name === name)).toEqual({ name, rows: [] });
      expect(before.qualificationGuards).toEqual([]);
      expect(after.qualificationGuards).toEqual(await expectedQualificationGuards());
      expect(after.ledger).toHaveLength(182);
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
