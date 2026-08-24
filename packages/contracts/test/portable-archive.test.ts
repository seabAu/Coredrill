import { describe, expect, it } from "vitest";

import generatedSchemaFixture from "../schemas/portable-archive-manifest.v1.schema.json" with { type: "json" };
import {
  PORTABLE_ARCHIVE_MANIFEST_SPEC_VERSION,
  PORTABLE_ARCHIVE_MANIFEST_V1_SCHEMA_ID,
  portableArchiveManifestV1JsonSchema,
  portableArchiveManifestV1Schema,
} from "../src/index.js";
import sampleManifest from "./fixtures/portable-archive-manifest.v1.json" with { type: "json" };

describe("PortableArchiveManifestV1", () => {
  it("round-trips a complete synthetic database/data/attachment manifest", () => {
    const parsed = portableArchiveManifestV1Schema.parse(sampleManifest);
    expect(parsed).toEqual(sampleManifest);
    expect(parsed.database.kind).toBe("database");
    expect(parsed.dataFiles.map((entry) => entry.format)).toEqual(["json", "csv"]);
    expect(parsed.attachments[0]?.contentId).toBe(parsed.attachments[0]?.sha256);
    expect(parsed.encryption).toEqual({ specVersion: 1, mode: "none" });
    expect(portableArchiveManifestV1Schema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(
      sampleManifest,
    );
  });

  it("publishes its generated Draft 2020-12 schema without drift", () => {
    expect(portableArchiveManifestV1JsonSchema).toEqual(generatedSchemaFixture);
    expect(portableArchiveManifestV1JsonSchema.$id).toBe(PORTABLE_ARCHIVE_MANIFEST_V1_SCHEMA_ID);
    expect(PORTABLE_ARCHIVE_MANIFEST_SPEC_VERSION).toBe(1);
  });

  it("rejects unsafe paths, duplicate paths, and malformed checksums", () => {
    const unsafePath = structuredClone(sampleManifest);
    const firstDataFile = unsafePath.dataFiles[0];
    if (firstDataFile === undefined) throw new Error("Expected a data fixture.");
    firstDataFile.path = "../outside.json";
    expect(portableArchiveManifestV1Schema.safeParse(unsafePath).success).toBe(false);

    const duplicatePath = structuredClone(sampleManifest);
    const first = duplicatePath.dataFiles[0];
    const second = duplicatePath.dataFiles[1];
    if (first === undefined || second === undefined) throw new Error("Expected two data fixtures.");
    second.path = first.path;
    expect(portableArchiveManifestV1Schema.safeParse(duplicatePath).success).toBe(false);

    const badChecksum = structuredClone(sampleManifest);
    badChecksum.database.sha256 = "not-a-checksum";
    expect(portableArchiveManifestV1Schema.safeParse(badChecksum).success).toBe(false);
  });

  it("rejects inconsistent migration history and duplicate attachment content IDs", () => {
    const wrongCurrentVersion = structuredClone(sampleManifest);
    wrongCurrentVersion.vault.schemaVersion = 3;
    expect(portableArchiveManifestV1Schema.safeParse(wrongCurrentVersion).success).toBe(false);

    const unordered = structuredClone(sampleManifest);
    const firstMigration = unordered.vault.migrationHistory[0];
    const secondMigration = unordered.vault.migrationHistory[1];
    if (firstMigration === undefined || secondMigration === undefined) {
      throw new Error("Expected two migration fixtures.");
    }
    secondMigration.version = firstMigration.version;
    expect(portableArchiveManifestV1Schema.safeParse(unordered).success).toBe(false);

    const duplicateAttachment = structuredClone(sampleManifest);
    const attachment = duplicateAttachment.attachments[0];
    if (attachment === undefined) throw new Error("Expected an attachment fixture.");
    duplicateAttachment.attachments.push({
      ...attachment,
      path: "attachments/copy.pdf",
    });
    expect(portableArchiveManifestV1Schema.safeParse(duplicateAttachment).success).toBe(false);

    const mismatchedContentId = structuredClone(sampleManifest);
    const mismatchedAttachment = mismatchedContentId.attachments[0];
    if (mismatchedAttachment === undefined) throw new Error("Expected an attachment fixture.");
    mismatchedAttachment.contentId =
      "abababababababababababababababababababababababababababababababab";
    expect(portableArchiveManifestV1Schema.safeParse(mismatchedContentId).success).toBe(false);
  });

  it("records actual baseline encryption state instead of implying encryption", () => {
    const encrypted = structuredClone(sampleManifest) as unknown as {
      encryption: Record<string, unknown>;
    };
    encrypted.encryption["mode"] = "encrypted";
    expect(portableArchiveManifestV1Schema.safeParse(encrypted).success).toBe(false);

    const emptyHistory = structuredClone(sampleManifest);
    emptyHistory.vault.schemaVersion = 0;
    emptyHistory.vault.migrationHistory = [];
    expect(portableArchiveManifestV1Schema.safeParse(emptyHistory).success).toBe(true);
  });
});
