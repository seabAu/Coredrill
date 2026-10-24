import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { expect } from "@playwright/test";

/** Exact preceding-schema normal reopen proof; never normalize away arbitrary record changes. */
export const expectReviewedSchemaRestoreUpgrade = async (
  actual,
  original,
  openedBetween,
  sourceVersion,
) => {
  expect([160, 164, 165, 167]).toContain(sourceVersion);
  expect(original.manifest.vault.schemaVersion).toBe(sourceVersion);
  expect(original.manifest.vault.migrationHistory).toHaveLength(sourceVersion);
  const added = [];
  for (const [version, name] of [
    [161, "contact_manual_creation"],
    [162, "contact_manual_creation_insert_guard"],
    [163, "contact_manual_creation_update_guard"],
    [164, "contact_manual_creation_delete_guard"],
    [165, "interaction_contact_history_index"],
    [166, "interaction_contact_delete_guard"],
    [167, "interaction_contact_detachment_guard"],
  ]) {
    if (version <= sourceVersion) continue;
    const bytes = await readFile(
      path.resolve("migrations", `${String(version).padStart(4, "0")}_${name}.sql`),
    );
    added.push({
      version,
      name: name.replaceAll("_", "-"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      // The existing runtime migration runner uses this pinned operational stamp.
      appliedAt: "2026-08-24T08:00:00.000Z",
    });
  }
  expect(actual.manifest.vault).toEqual({
    ...original.manifest.vault,
    schemaVersion: 167,
    migrationHistory: [...original.manifest.vault.migrationHistory, ...added],
  });
  const text = (file) => new TextDecoder().decode(file.bytes);
  const data = (archive, name) =>
    JSON.parse(text(archive.dataFiles.find((file) => file.path === `data/${name}.json`)));
  const oldVault = data(original, "vault").rows[0];
  const openedVault = data(actual, "vault").rows[0];
  // This preserved fixture predates operational root-stamp refresh on normal open.
  expect(oldVault.schema_version).toBe(1);
  expect(openedVault.schema_version).toBe(167);
  expect(Date.parse(openedVault.last_opened_at)).toBeGreaterThanOrEqual(openedBetween[0]);
  expect(Date.parse(openedVault.last_opened_at)).toBeLessThanOrEqual(openedBetween[1]);
  expect(Date.parse(openedVault.last_opened_at)).toBeGreaterThanOrEqual(
    Date.parse(oldVault.last_opened_at),
  );
  expect(actual.dataFiles).toHaveLength(116);
  expect(
    actual.dataFiles
      .filter(
        (file) => sourceVersion >= 164 || !file.path.startsWith("data/contact_manual_creation."),
      )
      .map((file) => file.path),
  ).toEqual(original.dataFiles.map((file) => file.path));
  for (const file of original.dataFiles) {
    const restored = actual.dataFiles.find((candidate) => candidate.path === file.path);
    expect(restored, file.path).toBeDefined();
    if (file.format === "json") {
      const oldData = JSON.parse(text(file));
      const newData = JSON.parse(text(restored));
      expect(newData.generatedAt).toBe(actual.manifest.createdAt);
      expect(newData.sourceSchemaVersion).toBe(167);
      expect(oldData.sourceSchemaVersion).toBe(sourceVersion);
      const compared = {
        ...newData,
        generatedAt: oldData.generatedAt,
        sourceSchemaVersion: sourceVersion,
      };
      if (file.path === "data/vault.json")
        compared.rows = newData.rows.map((row) => ({
          ...row,
          schema_version: oldVault.schema_version,
          last_opened_at: oldVault.last_opened_at,
        }));
      expect(compared, file.path).toEqual(oldData);
    } else if (file.path === "data/vault.csv") {
      const oldCsv = text(file);
      const schemaCell = `,${oldVault.schema_version},`;
      expect(oldCsv.split(schemaCell)).toHaveLength(2);
      expect(oldCsv.split(oldVault.last_opened_at)).toHaveLength(2);
      expect(text(restored)).toBe(
        oldCsv
          .replace(schemaCell, ",167,")
          .replace(oldVault.last_opened_at, openedVault.last_opened_at),
      );
    } else
      expect(Buffer.from(restored.bytes).equals(Buffer.from(file.bytes)), file.path).toBe(true);
  }
  const columns = [
    "contact_id",
    "operation_id",
    "created_at",
    "name_hash",
    "role_hash",
    "email_hash",
    "phone_hash",
    "public_profile_url_hash",
  ];
  if (sourceVersion === 160) {
    expect(data(actual, "contact_manual_creation")).toEqual({
      specVersion: 1,
      dataset: "contact_manual_creation",
      generatedAt: actual.manifest.createdAt,
      vaultId: original.manifest.vault.id,
      sourceSchemaVersion: 167,
      columns,
      rowCount: 0,
      rows: [],
      csv: {
        path: "data/contact_manual_creation.csv",
        dialect: "rfc4180",
        charset: "utf-8",
        header: "present",
        formulaEscaping: "apostrophe-prefix",
        nullEncoding: "empty-unquoted",
      },
    });
    expect(
      text(actual.dataFiles.find((file) => file.path === "data/contact_manual_creation.csv")),
    ).toBe(`${columns.join(",")}\r\n`);
  } else {
    // Every retained receipt field/hash was compared above, not inferred from a contact.
    expect(data(original, "contact_manual_creation").rowCount).toBe(1);
    expect(data(actual, "contact_manual_creation").rowCount).toBe(1);
  }
  expect(actual.attachments.map((item) => item.contentId)).toEqual(
    original.attachments.map((item) => item.contentId),
  );
  for (const file of original.attachments)
    expect(
      Buffer.from(
        actual.attachments.find((item) => item.contentId === file.contentId).bytes,
      ).equals(Buffer.from(file.bytes)),
      file.contentId,
    ).toBe(true);
};

export const expectSchema160RestoreUpgrade = (actual, original, openedBetween) =>
  expectReviewedSchemaRestoreUpgrade(actual, original, openedBetween, 160);

export const expectSchema164RestoreUpgrade = (actual, original, openedBetween) =>
  expectReviewedSchemaRestoreUpgrade(actual, original, openedBetween, 164);
