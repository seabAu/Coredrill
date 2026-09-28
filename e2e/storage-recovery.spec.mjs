import { expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDirectory = path.join(repositoryRoot, "fixtures", "recovery");
const archivePath = path.join(fixtureDirectory, "phase-1-vault-v1.coredrill.zip");
const manifestPath = path.join(fixtureDirectory, "phase-1-vault-v1.json");
const updateFixture = process.env["COREDRILL_UPDATE_RECOVERY_FIXTURE"] === "1";

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
  attachmentLinks: 2,
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
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Harness ready");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);
  return page;
};

test("restores complete evidence relationships and attachments into clean browser storage", async ({
  browser,
}) => {
  const sourceContext = await browser.newContext();
  const sourcePage = await openHarness(sourceContext);
  await callHarness(sourcePage, "delete");
  const opened = await callHarness(sourcePage, "openAndMigrate");
  expect(opened.diagnostics.schemaVersion).toBe(148);
  await callHarness(sourcePage, "writeVault", {
    id: recoveryInput.vaultId,
    name: "BKP-007 representative vault",
    createdAt: "2026-08-29T23:49:00.000Z",
    lastOpenedAt: "2026-08-29T23:49:30.000Z",
  });
  const source = await callHarness(sourcePage, "createPortableRecoveryFixture", recoveryInput);
  expect(source).toMatchObject({
    dataFileCount: 110,
    attachmentCount: 2,
    phase3Inventory: expectedPhase3Inventory,
  });
  expect(source.attachmentContentIds).toHaveLength(2);

  const generatedArchive = Buffer.from(source.archiveBytesBase64, "base64");
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
  });
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
