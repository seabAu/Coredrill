import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createPortableArchiveContentHashV1,
  inspectPortableArchiveV1,
  PORTABLE_DATA_EXPORT_DATASETS,
} from "../packages/storage-core/dist/index.js";
import {
  callHarness,
  openHarness,
  readCanonicalSnapshot,
  qualificationDatasetNames,
  expectedQualificationGuards,
} from "./recovery-snapshot.mjs";

const directory = path.resolve("fixtures/recovery");
const archivePath = path.join(directory, "phase-1-vault-schema-182-v1.coredrill.zip");
const manifestPath = path.join(directory, "phase-1-vault-schema-182-v1.json");
if (
  path.basename(archivePath) !== "phase-1-vault-schema-182-v1.coredrill.zip" ||
  path.basename(manifestPath) !== "phase-1-vault-schema-182-v1.json"
)
  throw new Error("Refusing to write a preserved recovery fixture.");
const update = process.env["COREDRILL_UPDATE_RECOVERY_FIXTURE"] === "1";
const input = {
  archiveId: "0198e123-0000-7000-8000-000000000200",
  generatedAt: "2026-10-24T20:00:00.000Z",
  vaultId: "0198d9d4-0000-7000-8000-0000000000ff",
};
const sha = (value) => createHash("sha256").update(value).digest("hex");
const text = (bytes) => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);

test("restores nonempty schema182 qualification, prior evidence and attachments deterministically", async ({
  browser,
}, testInfo) => {
  const previous = JSON.parse(
    await readFile(path.join(directory, "phase-1-vault-schema-167-v1.json"), "utf8"),
  );
  const previousBytes = await readFile(path.join(directory, previous.archiveFile));
  const previousArchive = await inspectPortableArchiveV1({
    bytes: previousBytes,
    expectedSchemaVersion: 167,
    expectedArchiveSha256: previous.archiveSha256,
  });
  const before = await readCanonicalSnapshot(
    previousArchive.database.bytes,
    testInfo.outputPath("preserved167.sqlite"),
  );
  expect(before.ledger).toHaveLength(167);
  expect(before.datasets).toHaveLength(58);
  const sourceContext = await browser.newContext();
  const page = await openHarness(sourceContext);
  await callHarness(page, "delete");
  await callHarness(page, "openAndMigrate");
  const previousRestore = await callHarness(page, "restorePortableRecoveryFixture", {
    archiveBytesBase64: previousBytes.toString("base64"),
    archiveSha256: previous.archiveSha256,
    generatedAt: previous.generatedAt,
    vaultId: previous.vaultId,
    sourceSchemaVersion: 167,
  });
  expect(previousRestore.contentSha256).toBe(previous.contentSha256);
  const priorExport = await callHarness(page, "exportPortable");
  expect(
    await readCanonicalSnapshot(
      Buffer.from(priorExport.bytesBase64, "base64"),
      testInfo.outputPath("restored167.sqlite"),
    ),
  ).toEqual(before);
  expect(await callHarness(page, "openAndMigrate")).toMatchObject({
    appliedVersions: Array.from({ length: 15 }, (_, i) => i + 168),
    diagnostics: { schemaVersion: 182 },
  });
  const source = await callHarness(page, "createContactFieldUseRecoveryFixture", input);
  expect(source).toMatchObject({
    dataFileCount: 122,
    attachmentCount: 2,
    phase3Inventory: previous.phase3Inventory,
    documentRoundTrip: previous.documentRoundTrip,
    attachmentContentIds: previous.attachmentContentIds,
  });
  const generatedBytes = Buffer.from(source.archiveBytesBase64, "base64");
  const archive = await inspectPortableArchiveV1({
    bytes: generatedBytes,
    expectedSchemaVersion: 182,
    expectedArchiveSha256: source.archiveSha256,
  });
  const snapshot = await readCanonicalSnapshot(
    archive.database.bytes,
    testInfo.outputPath("generated182.sqlite"),
  );
  expect(snapshot.datasets).toHaveLength(61);
  expect(snapshot.ledger).toHaveLength(182);
  expect(snapshot.ledger.slice(0, 167)).toEqual(before.ledger);
  expect(
    snapshot.datasets.filter((dataset) => !qualificationDatasetNames.includes(dataset.name)),
  ).toEqual(before.datasets);
  expect(snapshot.interactionGuard).toEqual(before.interactionGuard);
  expect(snapshot.qualificationGuards).toEqual(await expectedQualificationGuards());
  expect(archive.attachments).toEqual(previousArchive.attachments);
  const byName = Object.fromEntries(
    snapshot.datasets.map((dataset) => [dataset.name, dataset.rows]),
  );
  const sources = byName.contact_source_snapshot,
    policies = byName.contact_source_use_policy,
    reviews = byName.contact_field_use_review;
  expect(sources).toHaveLength(6);
  expect(policies).toHaveLength(3);
  expect(reviews).toHaveLength(4);
  expect(policies.map((row) => row.rights_basis).sort()).toEqual(["licensed", "public", "public"]);
  expect(policies.filter((row) => row.status === "disabled")).toHaveLength(1);
  expect(reviews.filter((row) => row.revoked_at !== null)).toHaveLength(1);
  const emailReviews = reviews
    .filter((row) => row.field_name === "email")
    .sort((a, b) => a.field_revision - b.field_revision);
  expect(emailReviews.map((row) => row.field_revision)).toEqual([1, 2]);
  expect(emailReviews[0].revoked_at).toBe(null);
  expect(emailReviews[1].revoked_at).toBe("2026-10-24T19:05:00.000Z");
  const contact = byName.contact.find((row) => row.id === "0198d9d4-0000-7000-8000-000000000040");
  expect(contact).toBeDefined();
  for (const source of sources) {
    expect(source.raw_text.startsWith("\uFEFF")).toBe(true);
    expect(source.raw_text).toContain("\0");
    expect(source.raw_text).toContain("尾");
    expect(sha(source.raw_text)).toBe(source.content_hash);
    expect(source.acquisition).toBe("user_supplied");
  }
  for (const policy of policies) {
    const source = sources.find((row) => row.id === policy.source_snapshot_id),
      terms = sources.find((row) => row.id === policy.terms_snapshot_id);
    expect(source.content_hash).toBe(policy.source_snapshot_hash);
    expect(terms.content_hash).toBe(policy.terms_snapshot_hash);
    expect(
      text(Buffer.from(terms.raw_text).subarray(policy.terms_start_byte, policy.terms_end_byte)),
    ).toBe(policy.terms_excerpt);
    expect(policy.acknowledgement).toBe("I reviewed this source's permitted field use.");
  }
  for (const review of reviews) {
    const source = sources.find((row) => row.id === review.source_snapshot_id);
    expect(sha(contact[review.field_name])).toBe(review.value_hash);
    expect(
      text(Buffer.from(source.raw_text).subarray(review.source_start_byte, review.source_end_byte)),
    ).toBe(review.source_excerpt);
    expect(review.purpose_note.startsWith("\uFEFF")).toBe(true);
    expect(review.purpose_note).toContain("\0");
    expect(review.acknowledgement).toBe("I reviewed this exact contact field and purpose.");
  }
  for (const dataset of snapshot.datasets) {
    const file = archive.dataFiles.find((file) => file.path === `data/${dataset.name}.json`);
    const spec = PORTABLE_DATA_EXPORT_DATASETS.find((spec) => spec.name === dataset.name);
    const rows = dataset.rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => {
          if (value === null) return [key, null];
          if (spec.booleanColumns?.includes(key)) {
            expect([0, 1]).toContain(value);
            return [key, value === 1];
          }
          if (spec.jsonColumns?.includes(key)) return [key, JSON.parse(value)];
          return [key, value];
        }),
      ),
    );
    const exported = JSON.parse(text(file.bytes));
    expect(exported).toMatchObject({
      sourceSchemaVersion: 182,
      rowCount: dataset.rows.length,
    });
    expect(exported.columns).toEqual(spec.columns);
    expect(exported.rows).toEqual(rows);
  }
  for (const file of previousArchive.dataFiles) {
    const current = archive.dataFiles.find((candidate) => candidate.path === file.path);
    if (file.format === "csv")
      expect(Buffer.from(current.bytes).equals(Buffer.from(file.bytes)), file.path).toBe(true);
    else
      expect(JSON.parse(text(current.bytes)), file.path).toEqual({
        ...JSON.parse(text(file.bytes)),
        generatedAt: input.generatedAt,
        sourceSchemaVersion: 182,
      });
  }
  expect(await createPortableArchiveContentHashV1(archive)).toMatchObject({
    schemaVersion: 182,
    sha256: source.contentSha256,
    jsonDataFileCount: 61,
    attachmentCount: 2,
  });
  const qualificationRoundTrip = {
    specVersion: 1,
    datasets: snapshot.datasets
      .filter((dataset) => qualificationDatasetNames.includes(dataset.name))
      .map((dataset) => ({
        dataset: dataset.name,
        rowCount: dataset.rows.length,
        rows: dataset.rows,
      })),
  };
  const metadata = {
    specVersion: 1,
    archiveFile: path.basename(archivePath),
    ...input,
    schemaVersion: 182,
    archiveByteLength: source.archiveByteLength,
    archiveSha256: source.archiveSha256,
    databaseSha256: source.databaseSha256,
    contentSha256: source.contentSha256,
    dataFileCount: 122,
    attachmentCount: 2,
    attachmentContentIds: source.attachmentContentIds,
    phase3Inventory: source.phase3Inventory,
    documentRoundTrip: source.documentRoundTrip,
    qualificationRoundTrip,
  };
  if (update) {
    await mkdir(directory, { recursive: true });
    await writeFile(archivePath, generatedBytes);
    await writeFile(manifestPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  }
  expect(generatedBytes.equals(await readFile(archivePath))).toBe(true);
  expect(metadata).toEqual(JSON.parse(await readFile(manifestPath, "utf8")));
  await callHarness(page, "close");
  await sourceContext.close();

  const targetContext = await browser.newContext();
  const target = await openHarness(targetContext);
  await callHarness(target, "delete");
  await callHarness(target, "openAndMigrate");
  const restored = await callHarness(target, "restorePortableRecoveryFixture", {
    archiveBytesBase64: generatedBytes.toString("base64"),
    archiveSha256: metadata.archiveSha256,
    generatedAt: metadata.generatedAt,
    vaultId: metadata.vaultId,
    sourceSchemaVersion: 182,
  });
  expect(restored).toEqual({
    contentSha256: metadata.contentSha256,
    databaseSha256: metadata.databaseSha256,
    databaseMatchesArchive: true,
    attachmentContentIds: metadata.attachmentContentIds,
    attachmentCount: 2,
    conflict: "none",
    committed: true,
    phase3Inventory: metadata.phase3Inventory,
    documentRoundTrip: metadata.documentRoundTrip,
  });
  const restoredExport = await callHarness(target, "exportPortable");
  expect(
    await readCanonicalSnapshot(
      Buffer.from(restoredExport.bytesBase64, "base64"),
      testInfo.outputPath("restored182.sqlite"),
    ),
  ).toEqual(snapshot);
  await callHarness(target, "close");
  expect(await callHarness(target, "openAndMigrate")).toMatchObject({
    appliedVersions: [],
    diagnostics: { schemaVersion: 182 },
  });
  const reopened = await callHarness(target, "exportPortable");
  expect(
    await readCanonicalSnapshot(
      Buffer.from(reopened.bytesBase64, "base64"),
      testInfo.outputPath("reopened182.sqlite"),
    ),
  ).toEqual(snapshot);
  const previewId = "0198e123-0000-7000-8000-000000000201";
  expect(
    await callHarness(target, "previewVaultDeletion", {
      vaultId: input.vaultId,
      previewId,
      previewedAt: "2026-10-24T20:01:00.000Z",
    }),
  ).toMatchObject({ ok: true, value: { inventory: { attachmentFiles: 2 } } });
  expect(
    await callHarness(target, "deleteVault", {
      vaultId: input.vaultId,
      previewId,
      deletionId: "0198e123-0000-7000-8000-000000000202",
      deletedAt: "2026-10-24T20:02:00.000Z",
      confirmation: "DELETE BKP-007 representative vault",
    }),
  ).toMatchObject({ ok: true, value: { status: "deleted", deleted: { attachmentFiles: 2 } } });
  await targetContext.close();
  console.info(
    `CONTACT_FIELD_USE_RECOVERY182_PROOF ${JSON.stringify({ schemaVersion: 182, archiveSha256: metadata.archiveSha256, contentSha256: metadata.contentSha256, dataFileCount: 122, sourceRows: 6, policyRows: 3, reviewRows: 4, attachmentCount: 2, deterministicReplay: !update, restoredAndReopened: true, wholeVaultDeletion: true })}`,
  );
});
